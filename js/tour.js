// Tour guiado: os passos apontam para o primeiro alvo visível (computador ou
// celular), um recorte destaca o alvo e o balão se posiciona perto dele.
import { t } from './constants.js'
import { navegar, podeNavegar } from './estado.js'

// ── Tour guiado (4.3) ─────────────────────────────────────────
// Cada passo aponta para o primeiro alvo visível da lista (desktop ou
// celular). Um recorte fixo destaca o alvo; o balão se posiciona abaixo,
// acima ou, sem espaço, preso à borda de baixo da tela.
export function _getTourPassos() {
  // No celular o quadro é a régua das etapas (não há colunas) e o pedido novo sai do "+"
  const celular = window.matchMedia('(max-width: 1023px), (max-width: 1279px) and (pointer: coarse)').matches
  return [
    { alvo: ['#pedidos-view'],                                        titulo: t('tourStep1Titulo'), desc: t(celular ? 'tourStep1DescCelular' : 'tourStep1Desc') },
    { alvo: ['#btn-novo-pedido', '#bnav-novo'],                       titulo: t('tourStep2Titulo'), desc: t(celular ? 'tourStep2DescCelular' : 'tourStep2Desc') },
    { alvo: ['#btn-notif'],                                           titulo: t('tourStep3Titulo'), desc: t('tourStep3Desc') },
    { alvo: ['#btn-avatar', '#bnav-conta'],                           titulo: t('tourStep4Titulo'), desc: t('tourStep4Desc') },
    { alvo: ['#lateral-cadastros', '#bottom-nav [data-bnav="config-usuarios"]'], titulo: t('tourStep5Titulo'), desc: t('tourStep5Desc') },
  ]
}

let _tourLista = []
let _tourPasso = 0
let _tourAlvo  = null

export function _tourVisivel(el) {
  if (!el || !el.isConnected) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

// O tour só abre pelo botão "Fazer o tour" (na faixa da demo e em
// Configurações › Geral): aberto sozinho, ele cobria o quadro justo na
// primeira impressão, e no celular tomava metade da tela
export function abrirTour() {
  // O tour começa no quadro de pedidos; de outra tela, vai até lá primeiro
  if (!document.getElementById('pedidos-view') && podeNavegar()) {
    navegar('pedidos')
    setTimeout(_tourIniciar, 900)
    return
  }
  setTimeout(_tourIniciar, 100)
}

export function _tourIniciar() {
  _tourLista = _getTourPassos()
    .map(p => ({ ...p, el: p.alvo.map(s => document.querySelector(s)).find(_tourVisivel) }))
    .filter(p => p.el)
  if (!_tourLista.length) return
  _tourPasso = 0
  _tourMontar()
  _tourMostrarPasso()
}

export function _tourMontar() {
  _tourLimpar()
  const bloqueio = document.createElement('div')
  bloqueio.id = 'tour-bloqueio'
  bloqueio.className = 'tour-bloqueio'
  const spot = document.createElement('div')
  spot.id = 'tour-spot'
  spot.className = 'tour-spot'
  spot.setAttribute('aria-hidden', 'true')
  const pop = document.createElement('div')
  pop.id = 'tour-popover'
  pop.className = 'tour-popover'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-modal', 'true')
  pop.setAttribute('aria-labelledby', 'tour-titulo')
  pop.setAttribute('aria-describedby', 'tour-desc')
  pop.tabIndex = -1
  document.body.append(bloqueio, spot, pop)

  pop.addEventListener('keydown', e => {
    if (e.key === 'Tab') {
      const els = [...pop.querySelectorAll('button')]
      const i = els.indexOf(document.activeElement)
      e.preventDefault()
      els[e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target === pop)) { e.preventDefault(); _tourIr(1) }
    else if (e.key === 'ArrowLeft') { _tourIr(-1) }
  })
  window.addEventListener('resize', _tourReposicionar)
  window.addEventListener('scroll', _tourReposicionar, true)
}

export function _tourIr(delta) {
  const novo = _tourPasso + delta
  if (novo < 0) return
  if (novo >= _tourLista.length) { _tourFinalizar(); return }
  _tourPasso = novo
  _tourMostrarPasso()
}

export function _tourMostrarPasso() {
  const pop = document.getElementById('tour-popover')
  if (!pop) return
  const passo = _tourLista[_tourPasso]
  // O alvo pode ter sido recriado (re-render da tela): procura de novo
  _tourAlvo = _tourVisivel(passo.el) ? passo.el : passo.alvo.map(s => document.querySelector(s)).find(_tourVisivel)
  if (!_tourAlvo) { _tourIr(1); return }

  const total = _tourLista.length
  const ultimo = _tourPasso === total - 1
  // Contagem na voz do quadro: o numeral do passo e o total ("01 de 05")
  const dois = n => String(n).padStart(2, '0')
  pop.innerHTML = `
    <div class="tour-topo">
      <span class="tour-step-count"><span class="sr-only">${t('tourPasso')} </span><b class="tour-n numeral">${dois(_tourPasso + 1)}</b> <span class="tour-total">${t('tourDe')} ${dois(total)}</span></span>
      <span class="tour-pontos" aria-hidden="true">${_tourLista.map((_, i) => `<i class="${i === _tourPasso ? 'on' : i < _tourPasso ? 'feito' : ''}"></i>`).join('')}</span>
    </div>
    <p class="tour-titulo" id="tour-titulo">${passo.titulo}</p>
    <p class="tour-desc" id="tour-desc">${passo.desc}</p>
    <div class="tour-actions">
      <button type="button" class="btn-ghost btn-sm" id="tour-pular">${t('tourPular')}</button>
      <div class="tour-actions-dir">
        ${_tourPasso > 0 ? `<button type="button" class="btn-secondary btn-sm" id="tour-voltar">${t('tourVoltar')}</button>` : ''}
        <button type="button" class="btn-primary btn-sm" id="tour-proximo">${ultimo ? t('tourConcluir') : t('tourProximo')}</button>
      </div>
    </div>
  `
  pop.querySelector('#tour-proximo').onclick = () => _tourIr(1)
  pop.querySelector('#tour-voltar')?.addEventListener('click', () => _tourIr(-1))
  pop.querySelector('#tour-pular').onclick = _tourFinalizar

  // Traz o alvo para a tela, se for preciso (botões fixos já estão visíveis)
  const r = _tourAlvo.getBoundingClientRect()
  if (r.top < 64 || r.top > window.innerHeight - 120) {
    _tourAlvo.scrollIntoView({ behavior: 'instant', block: r.height > window.innerHeight * 0.6 ? 'start' : 'center' })
    if (r.height > window.innerHeight * 0.6) window.scrollBy(0, -80)
  }
  _tourReposicionar()
  pop.classList.remove('entrando'); void pop.offsetWidth; pop.classList.add('entrando')
  // O foco vai para o balão (Enter avança, Tab chega aos botões)
  setTimeout(() => pop.focus({ preventScroll: true }), 30)
}

export function _tourReposicionar() {
  const pop  = document.getElementById('tour-popover')
  const spot = document.getElementById('tour-spot')
  if (!pop || !spot || !_tourAlvo) return
  const W = window.innerWidth
  const H = window.innerHeight
  const margem = 12
  const barra = document.getElementById('bottom-nav')
  const baseH = barra && getComputedStyle(barra).display !== 'none' ? barra.getBoundingClientRect().top : H

  // Recorte: o alvo com folga de 6px, limitado à área visível
  const r = _tourAlvo.getBoundingClientRect()
  const folga = 6
  const top    = Math.max(4, r.top - folga)
  const left   = Math.max(4, r.left - folga)
  const right  = Math.min(W - 4, r.right + folga)
  // A barra inferior fica escurecida, a não ser que o alvo esteja nela
  const naBarra = !!barra && barra.contains(_tourAlvo)
  const bottom = Math.min((naBarra ? H : baseH) - 4, r.bottom + folga)
  spot.style.cssText = `top:${top}px;left:${left}px;width:${Math.max(0, right - left)}px;height:${Math.max(0, bottom - top)}px;`
  // Recorte reto, como o resto da Inscrição (só o avatar redondo pede curva)
  const raio = parseFloat(getComputedStyle(_tourAlvo).borderRadius) || 0
  spot.style.borderRadius = `${Math.min(raio, 4)}px`

  // Balão: largura fixa no desktop, largura útil no celular
  const pW = Math.min(340, W - margem * 2)
  pop.style.width = `${pW}px`
  const pH = pop.offsetHeight
  let pTop
  if (bottom + margem + pH <= baseH - margem) pTop = bottom + margem          // abaixo
  else if (top - margem - pH >= margem) pTop = top - margem - pH              // acima
  else pTop = baseH - pH - margem                                              // sem espaço: rente à base
  let pLeft = (r.left + r.right) / 2 - pW / 2
  pLeft = Math.max(margem, Math.min(pLeft, W - pW - margem))
  pop.style.top  = `${Math.round(pTop)}px`
  pop.style.left = `${Math.round(pLeft)}px`
}

export function _tourLimpar() {
  document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'))
  ;['tour-popover', 'tour-spot', 'tour-bloqueio'].forEach(id => document.getElementById(id)?.remove())
  window.removeEventListener('resize', _tourReposicionar)
  window.removeEventListener('scroll', _tourReposicionar, true)
  _tourAlvo = null
}

export function _tourAtivo() { return !!document.getElementById('tour-popover') }

export function _tourFinalizar() {
  _tourLimpar()
}
