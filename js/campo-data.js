// ── Campo de data do Praxis ───────────────────────────────────
// Troca a aparência de todo <input type="date"> por um campo de texto no
// formato brasileiro (dd/mm/aaaa) com um calendário no desenho da Inscrição.
// O campo nativo continua no lugar, escondido, e segue sendo a fonte da
// verdade: o código das telas lê e grava .value em ISO (aaaa-mm-dd) e escuta
// 'input'/'change' nele como antes. Nada nas telas precisa mudar.
//
// Por quê: o seletor nativo mostra "dd/mm/yyyy" quando o navegador está em
// inglês e abre o calendário do sistema, fora da identidade do app.
import { t } from './constants.js'

const _DESC_VALUE    = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
const _DESC_DISABLED = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'disabled')

const _ehEn = () => (sessionStorage.getItem('praxis_lang') || 'pt') === 'en'
const _locale = () => (_ehEn() ? 'en-US' : 'pt-BR')

// ── Conversões ────────────────────────────────────────────────
const _pad = n => String(n).padStart(2, '0')
const _iso = (a, m, d) => `${a}-${_pad(m)}-${_pad(d)}`
function _isoParaTexto(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function _textoParaIso(txt) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(txt || '')
  if (!m) return null
  const d = +m[1], mes = +m[2], a = +m[3]
  if (a < 1900 || a > 2200 || mes < 1 || mes > 12) return null
  const dt = new Date(a, mes - 1, d)
  if (dt.getMonth() !== mes - 1 || dt.getDate() !== d) return null
  return _iso(a, mes, d)
}
// Máscara progressiva: só dígitos, barras entram sozinhas
function _mascara(txt) {
  const dig = String(txt).replace(/\D/g, '').slice(0, 8)
  if (dig.length <= 2) return dig
  if (dig.length <= 4) return `${dig.slice(0, 2)}/${dig.slice(2)}`
  return `${dig.slice(0, 2)}/${dig.slice(2, 4)}/${dig.slice(4)}`
}
function _hojeIso() {
  const h = new Date()
  return _iso(h.getFullYear(), h.getMonth() + 1, h.getDate())
}
function _dentro(iso, min, max) {
  return (!min || iso >= min) && (!max || iso <= max)
}

// ── Aprimorar um campo ────────────────────────────────────────
function _aprimorar(nat) {
  if (nat.dataset.campoData === '1') return
  nat.dataset.campoData = '1'

  const txt = document.createElement('input')
  txt.type = 'text'
  txt.className = `${nat.className} campo-data-texto`.trim()
  txt.inputMode = 'numeric'
  txt.autocomplete = 'off'
  txt.spellcheck = false
  txt.maxLength = 10
  txt.placeholder = t('campoDataPlaceholder')
  txt.setAttribute('aria-haspopup', 'dialog')
  txt.setAttribute('aria-expanded', 'false')
  if (nat.getAttribute('style')) txt.setAttribute('style', nat.getAttribute('style'))
  // Nome acessível: o mesmo do campo nativo (aria-label, title ou <label for>)
  const rotulo = nat.getAttribute('aria-label')
    || (nat.id && document.querySelector(`label[for="${CSS.escape(nat.id)}"]`)?.textContent.trim())
    || nat.title || ''
  if (rotulo) txt.setAttribute('aria-label', `${rotulo} (${t('campoDataPlaceholder')})`)
  if (nat.title) txt.title = nat.title
  if (nat.required) txt.required = true
  txt.disabled = nat.disabled
  txt.value = _isoParaTexto(_DESC_VALUE.get.call(nat))

  nat.classList.add('campo-data-nativo')
  nat.tabIndex = -1
  nat.setAttribute('aria-hidden', 'true')
  nat.after(txt)

  const sincronizarTexto = () => {
    txt.value = _isoParaTexto(_DESC_VALUE.get.call(nat))
    txt.removeAttribute('aria-invalid')
  }

  // Valor gravado por código no campo nativo aparece no texto na hora
  Object.defineProperty(nat, 'value', {
    configurable: true,
    get() { return _DESC_VALUE.get.call(this) },
    set(v) { _DESC_VALUE.set.call(this, v); sincronizarTexto() },
  })
  Object.defineProperty(nat, 'disabled', {
    configurable: true,
    get() { return _DESC_DISABLED.get.call(this) },
    set(v) { _DESC_DISABLED.set.call(this, v); txt.disabled = !!v },
  })
  nat.form?.addEventListener('reset', () => setTimeout(sincronizarTexto))
  // Clique no <label> do campo nativo leva ao texto
  nat.addEventListener('focus', () => txt.focus())

  const gravar = (iso) => {
    if (_DESC_VALUE.get.call(nat) === iso) { sincronizarTexto(); return }
    _DESC_VALUE.set.call(nat, iso)
    sincronizarTexto()
    nat.dispatchEvent(new Event('input', { bubbles: true }))
    nat.dispatchEvent(new Event('change', { bubbles: true }))
  }
  txt._gravarData = gravar
  txt._campoNativo = nat

  txt.addEventListener('input', () => {
    const pos = txt.selectionStart
    const antes = txt.value
    txt.value = _mascara(antes)
    if (pos === antes.length) txt.setSelectionRange(txt.value.length, txt.value.length)
    if (txt.value === '') { gravar(''); return }
    const iso = _textoParaIso(txt.value)
    if (iso) {
      const fora = !_dentro(iso, nat.min, nat.max)
      txt.toggleAttribute('aria-invalid', fora)
      if (!fora) gravar(iso)
    } else {
      txt.toggleAttribute('aria-invalid', txt.value.length === 10)
    }
    if (_aberto?.txt === txt) _renderCalendario()
  })
  // Ao sair, um texto incompleto ou inválido volta para o último valor válido
  txt.addEventListener('blur', () => {
    if (txt.value && !_textoParaIso(txt.value)) sincronizarTexto()
    else if (txt.value) {
      const iso = _textoParaIso(txt.value)
      if (!_dentro(iso, nat.min, nat.max)) sincronizarTexto()
    }
  })
  txt.addEventListener('click', () => { if (!txt.disabled) _abrir(txt) })
  txt.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || (e.altKey && e.key === 'ArrowDown')) {
      e.preventDefault()
      _abrir(txt, true)
    } else if (e.key === 'Escape' && _aberto?.txt === txt) {
      e.preventDefault()
      e.stopPropagation()
      _fechar(false)
    } else if (e.key === 'Tab') {
      _fechar(false)
    }
  })
}

// ── Calendário (um só, compartilhado) ─────────────────────────
let _aberto = null   // { txt, mes: Date (dia 1), foco: iso }
let _el = null

function _garantirEl() {
  if (_el) return _el
  _el = document.createElement('div')
  _el.className = 'calendario'
  _el.setAttribute('role', 'dialog')
  _el.setAttribute('aria-modal', 'false')
  _el.addEventListener('mousedown', e => e.preventDefault()) // não tira o foco do campo
  _el.addEventListener('click', _aoClicar)
  _el.addEventListener('keydown', _aoTeclar)
  document.body.appendChild(_el)
  document.addEventListener('mousedown', e => {
    if (!_aberto) return
    if (_el.contains(e.target) || e.target === _aberto.txt) return
    _fechar(false)
  }, true)
  window.addEventListener('resize', () => _aberto && _posicionar())
  window.addEventListener('scroll', e => {
    if (_aberto && !_el.contains(e.target)) _posicionar()
  }, true)
  return _el
}

function _abrir(txt, focarDia = false) {
  const nat = txt._campoNativo
  const atual = _DESC_VALUE.get.call(nat) || _textoParaIso(txt.value) || ''
  const base = atual || (nat.min && nat.min > _hojeIso() ? nat.min : (nat.max && nat.max < _hojeIso() ? nat.max : _hojeIso()))
  const [a, m] = base.split('-').map(Number)
  _aberto = { txt, mes: new Date(a, m - 1, 1), foco: base }
  _garantirEl()
  _el.setAttribute('aria-label', txt.getAttribute('aria-label') || t('campoDataCalendario'))
  _renderCalendario()
  _el.classList.add('aberto')
  txt.setAttribute('aria-expanded', 'true')
  _posicionar()
  if (focarDia) _el.querySelector(`[data-dia="${_aberto.foco}"]`)?.focus()
}

function _fechar(devolverFoco) {
  if (!_aberto) return
  const { txt } = _aberto
  _el?.classList.remove('aberto')
  txt.setAttribute('aria-expanded', 'false')
  _aberto = null
  if (devolverFoco) txt.focus()
}

function _posicionar() {
  const r = _aberto.txt.getBoundingClientRect()
  const w = _el.offsetWidth, h = _el.offsetHeight
  const vw = window.innerWidth, vh = window.innerHeight
  let left = Math.min(Math.max(8, r.left), vw - w - 8)
  let top = r.bottom + 6
  if (top + h > vh - 8 && r.top - h - 6 > 8) top = r.top - h - 6
  _el.style.left = `${Math.round(left)}px`
  _el.style.top = `${Math.round(Math.max(8, top))}px`
}

function _renderCalendario() {
  const { txt, mes } = _aberto
  const nat = txt._campoNativo
  const selecionado = _DESC_VALUE.get.call(nat)
  const hoje = _hojeIso()
  const loc = _locale()
  const nomeMes = new Intl.DateTimeFormat(loc, { month: 'long' }).format(mes)
  const ano = mes.getFullYear()
  // Semana começando no domingo, como nos calendários brasileiros
  const dias = []
  const desloc = new Date(ano, mes.getMonth(), 1).getDay()
  for (let i = 0; i < 42; i++) dias.push(new Date(ano, mes.getMonth(), 1 - desloc + i))
  const semanas = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(loc, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + i)))
  const mesAnt = new Date(ano, mes.getMonth(), 0)
  const mesProx = new Date(ano, mes.getMonth() + 1, 1)
  const podeAnt = !nat.min || _iso(mesAnt.getFullYear(), mesAnt.getMonth() + 1, mesAnt.getDate()) >= nat.min
  const podeProx = !nat.max || _iso(mesProx.getFullYear(), mesProx.getMonth() + 1, 1) <= nat.max
  const hojeOk = _dentro(hoje, nat.min, nat.max)

  _el.innerHTML = `
    <div class="cal-topo">
      <button type="button" class="cal-nav" data-nav="-1" aria-label="${t('campoDataMesAnterior')}" ${podeAnt ? '' : 'disabled'}>
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="cal-titulo" aria-live="polite"><span class="cal-mes">${nomeMes}</span> <span class="cal-ano">${ano}</span></span>
      <button type="button" class="cal-nav" data-nav="1" aria-label="${t('campoDataProximoMes')}" ${podeProx ? '' : 'disabled'}>
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
    <div class="cal-grade" role="grid">
      ${semanas.map(s => `<span class="cal-sem" aria-hidden="true">${s}</span>`).join('')}
      ${dias.map(d => {
        const iso = _iso(d.getFullYear(), d.getMonth() + 1, d.getDate())
        const fora = d.getMonth() !== mes.getMonth()
        const ok = _dentro(iso, nat.min, nat.max)
        const cls = ['cal-dia', fora ? 'fora' : '', iso === hoje ? 'hoje' : '', iso === selecionado ? 'sel' : ''].filter(Boolean).join(' ')
        const rot = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
        return `<button type="button" class="${cls}" data-dia="${iso}" tabindex="${iso === _aberto.foco ? 0 : -1}" aria-label="${rot}" ${iso === selecionado ? 'aria-pressed="true"' : ''} ${ok ? '' : 'disabled'}>${d.getDate()}</button>`
      }).join('')}
    </div>
    <div class="cal-rodape">
      <button type="button" class="cal-acao" data-acao="limpar">${t('campoDataLimpar')}</button>
      <button type="button" class="cal-acao" data-acao="hoje" ${hojeOk ? '' : 'disabled'}>${t('campoDataHoje')}</button>
    </div>`
}

function _escolher(iso) {
  const { txt } = _aberto
  txt._gravarData(iso)
  _fechar(true)
}

function _aoClicar(e) {
  const nav = e.target.closest('[data-nav]')
  if (nav && !nav.disabled) {
    const { mes } = _aberto
    _aberto.mes = new Date(mes.getFullYear(), mes.getMonth() + Number(nav.dataset.nav), 1)
    _aberto.foco = _iso(_aberto.mes.getFullYear(), _aberto.mes.getMonth() + 1, 1)
    _renderCalendario()
    _posicionar()
    return
  }
  const dia = e.target.closest('[data-dia]')
  if (dia && !dia.disabled) { _escolher(dia.dataset.dia); return }
  const acao = e.target.closest('[data-acao]')
  if (acao && !acao.disabled) _escolher(acao.dataset.acao === 'hoje' ? _hojeIso() : '')
}

function _aoTeclar(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _fechar(true); return }
  const dia = e.target.closest('[data-dia]')
  if (!dia) return
  const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  let alvo = null
  const [a, m, d] = dia.dataset.dia.split('-').map(Number)
  if (e.key in passos) alvo = new Date(a, m - 1, d + passos[e.key])
  else if (e.key === 'PageUp') alvo = new Date(a, m - 2, Math.min(d, 28))
  else if (e.key === 'PageDown') alvo = new Date(a, m, Math.min(d, 28))
  else if (e.key === 'Home') alvo = new Date(a, m - 1, d - ((new Date(a, m - 1, d).getDay() + 7) % 7))
  else if (e.key === 'End') alvo = new Date(a, m - 1, d + (6 - new Date(a, m - 1, d).getDay()))
  if (!alvo) return
  e.preventDefault()
  const iso = _iso(alvo.getFullYear(), alvo.getMonth() + 1, alvo.getDate())
  _aberto.foco = iso
  if (alvo.getMonth() !== _aberto.mes.getMonth() || alvo.getFullYear() !== _aberto.mes.getFullYear()) {
    _aberto.mes = new Date(alvo.getFullYear(), alvo.getMonth(), 1)
    _renderCalendario()
    _posicionar()
  } else {
    _el.querySelectorAll('[data-dia]').forEach(b => { b.tabIndex = b.dataset.dia === iso ? 0 : -1 })
  }
  _el.querySelector(`[data-dia="${iso}"]`)?.focus()
}

// ── Liga em toda a página ─────────────────────────────────────
// Campos que entram depois (telas, modais) são aprimorados assim que aparecem.
export function iniciarCamposData() {
  const varrer = raiz => raiz.querySelectorAll?.('input[type="date"]:not([data-campo-data="1"])').forEach(_aprimorar)
  varrer(document)
  new MutationObserver(mudancas => {
    for (const m of mudancas) {
      for (const no of m.addedNodes) {
        if (no.nodeType !== 1) continue
        if (no.matches?.('input[type="date"]')) _aprimorar(no)
        else varrer(no)
      }
      // Calendário aberto para um campo que saiu da página: fecha
      if (_aberto && !_aberto.txt.isConnected) { _el?.classList.remove('aberto'); _aberto = null }
    }
  }).observe(document.body, { childList: true, subtree: true })
}
