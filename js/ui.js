import { t } from './constants.js'

// ── Command Palette (4.2) ─────────────────────────────────────
// Busca de comandos e pedidos (botão "Buscar" da topbar, item da barra
// inferior no celular e Ctrl+K / ⌘K). Sem texto: comandos + pedidos recentes.
let _cmdPaletaEl  = null
let _cmdActiveIdx = 0
let _cmdGatilho   = null

const _ehMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')

function _escHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Ignora acentos e caixa: "relatorio" encontra "Relatórios"
function _normalizar(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function initCommandPalette() {
  if (globalThis.__praxisCmdInited) return
  globalThis.__praxisCmdInited = true
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      if (!window.__praxisSessao?.usuario) return // só dentro do app
      e.preventDefault()
      if (_cmdPaletaEl?.classList.contains('visible')) {
        _fecharPaleta()
      } else {
        abrirCommandPalette()
      }
    }
  })
}

export function abrirCommandPalette() {
  if (!window.__navegar) return
  _criarPaletaDOM()
  if (!_cmdPaletaEl.classList.contains('visible')) _cmdGatilho = document.activeElement
  _cmdPaletaEl.classList.add('visible')
  _cmdActiveIdx = 0
  const input = document.getElementById('cmd-input')
  if (input) { input.value = ''; input.focus() }
  _cmdRenderResultados('')
}

function _fecharPaleta(devolverFoco = true) {
  if (!_cmdPaletaEl?.classList.contains('visible')) return
  _cmdPaletaEl.classList.remove('visible')
  if (devolverFoco && _cmdGatilho?.isConnected) _cmdGatilho.focus({ preventScroll: true })
  _cmdGatilho = null
}

function _criarPaletaDOM() {
  if (_cmdPaletaEl) return
  const el = document.createElement('div')
  el.id = 'cmd-palette'
  el.className = 'cmd-palette-overlay'
  el.innerHTML = `
    <div class="cmd-palette" role="dialog" aria-modal="true" aria-label="Buscar">
      <div class="cmd-palette-header">
        <svg class="cmd-search-icon" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="cmd-input" type="text" class="cmd-input" placeholder="Buscar pedido ou comando" autocomplete="off" spellcheck="false"
          role="combobox" aria-expanded="true" aria-controls="cmd-results" aria-autocomplete="list" aria-label="Buscar pedido ou comando">
        <button type="button" class="cmd-esc" id="cmd-fechar" aria-label="Fechar busca"><kbd>Esc</kbd><svg class="cmd-esc-x" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      <div id="cmd-results" class="cmd-results" role="listbox" aria-label="Resultados"></div>
      <div class="cmd-palette-footer" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
        <span><kbd>↵</kbd> abrir</span>
        <span class="cmd-footer-atalho"><kbd>${_ehMac ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> abrir ou fechar</span>
      </div>
    </div>
  `
  document.body.appendChild(el)
  _cmdPaletaEl = el

  el.addEventListener('mousedown', e => { if (e.target === el) _fecharPaleta() })
  el.querySelector('#cmd-fechar').addEventListener('click', () => _fecharPaleta())

  const input = el.querySelector('#cmd-input')
  input.addEventListener('input', e => {
    _cmdActiveIdx = 0
    _cmdRenderResultados(e.target.value)
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _fecharPaleta(); return }
    const items = [...(document.getElementById('cmd-results')?.querySelectorAll('.cmd-item') || [])]
    if (!items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      _cmdActiveIdx = (_cmdActiveIdx + 1) % items.length
      _cmdSyncAtivo(items)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      _cmdActiveIdx = (_cmdActiveIdx - 1 + items.length) % items.length
      _cmdSyncAtivo(items)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[_cmdActiveIdx]?.click()
    }
  })
  // Foco preso na paleta: Tab volta para o campo
  el.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); input.focus() }
  })
}

function _cmdSyncAtivo(items) {
  items.forEach((btn, i) => {
    btn.classList.toggle('active', i === _cmdActiveIdx)
    btn.setAttribute('aria-selected', String(i === _cmdActiveIdx))
  })
  const ativo = items[_cmdActiveIdx]
  ativo?.scrollIntoView({ block: 'nearest' })
  if (ativo) document.getElementById('cmd-input')?.setAttribute('aria-activedescendant', ativo.id)
}

const _ICONE_PEDIDO = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`

function _tsMs(ts) {
  if (!ts) return 0
  if (ts.toDate) return ts.toDate().getTime()
  if (typeof ts.seconds === 'number') return ts.seconds * 1000
  const n = new Date(ts).getTime()
  return Number.isNaN(n) ? 0 : n
}

function _cmdRenderResultados(query) {
  const results = document.getElementById('cmd-results')
  if (!results) return
  const q = _normalizar(query.trim())

  const acoes = _cmdGetAcoes()
  const acoesMatch = !q ? acoes : acoes.filter(a => _normalizar(a.label + ' ' + (a.termos || '')).includes(q))

  const pedidos = window.__getPedidos?.() || []
  const { STATUS_LABEL, STATUS_DOT_COLOR } = window.__praxisConst || {}
  const pedidosMatch = !q
    ? [...pedidos].sort((a, b) => _tsMs(b.atualizadoEm || b.criadoEm) - _tsMs(a.atualizadoEm || a.criadoEm)).slice(0, 4)
    : pedidos.filter(p => _normalizar(p.numeroPedido).includes(q) || _normalizar(p.titulo).includes(q)).slice(0, 7)

  if (!acoesMatch.length && !pedidosMatch.length) {
    // Vazio na voz do quadro: o numeral zerado, como uma etapa sem pedidos
    results.innerHTML = `
      <div class="cmd-empty" role="status">
        <span class="cmd-empty-n numeral" aria-hidden="true">00</span>
        <strong>Nada encontrado para “${_escHTML(query.trim())}”</strong>
        <span>Tente o número do pedido (PRX-0012) ou uma palavra do título.</span>
      </div>`
    document.getElementById('cmd-input')?.removeAttribute('aria-activedescendant')
    return
  }

  let html = ''
  let idx = 0
  const linhaPedido = (p) => {
    const i = idx++
    return `<button type="button" class="cmd-item${i === _cmdActiveIdx ? ' active' : ''}" id="cmd-op-${i}" data-idx="${i}" data-pedido-id="${_escHTML(p.id)}" role="option" aria-selected="${i === _cmdActiveIdx}">
      <span class="cmd-item-icon" aria-hidden="true">${_ICONE_PEDIDO}</span>
      <span class="cmd-item-num">${_escHTML(p.numeroPedido || '—')}</span>
      <span class="cmd-item-label">${_escHTML(p.titulo || 'Sem título')}</span>
      ${p.urgente ? `<span class="cmd-item-urg">Urgente</span>` : ''}
      ${p.status ? `<span class="cmd-item-meta"><span class="dot ${STATUS_DOT_COLOR?.[p.status] || 'dot-gray'}" aria-hidden="true"></span>${_escHTML(STATUS_LABEL?.[p.status] ?? p.status)}</span>` : ''}
    </button>`
  }

  const blocoPedidos = () => !pedidosMatch.length ? '' :
    `<div class="cmd-group-label" role="presentation">${q ? 'Pedidos' : 'Atualizados recentemente'}</div>` + pedidosMatch.map(linhaPedido).join('')
  const blocoAcoes = () => !acoesMatch.length ? '' :
    `<div class="cmd-group-label" role="presentation">Comandos</div>` + acoesMatch.map(a => {
      const i = idx++
      return `<button type="button" class="cmd-item${i === _cmdActiveIdx ? ' active' : ''}" id="cmd-op-${i}" data-idx="${i}" data-action-id="${a.id}" role="option" aria-selected="${i === _cmdActiveIdx}">
        <span class="cmd-item-icon" aria-hidden="true">${a.icon}</span>
        <span class="cmd-item-label">${a.label}</span>
      </button>`
    }).join('')

  // Com texto, pedidos vêm primeiro (é o que mais se procura); sem texto, comandos.
  // Os índices seguem a ordem visual, então cada bloco é montado na ordem exibida.
  html = q ? blocoPedidos() + blocoAcoes() : blocoAcoes() + blocoPedidos()

  results.innerHTML = html
  document.getElementById('cmd-input')?.setAttribute('aria-activedescendant', `cmd-op-${_cmdActiveIdx}`)

  results.querySelectorAll('.cmd-item').forEach((btn, i) => {
    btn.addEventListener('click', () => _cmdExecutarItem(btn, acoes))
    btn.addEventListener('mousemove', () => {
      if (_cmdActiveIdx === i) return
      _cmdActiveIdx = i
      _cmdSyncAtivo([...results.querySelectorAll('.cmd-item')])
    })
  })
}

function _cmdExecutarItem(btn, acoes) {
  _fecharPaleta(false)
  const actionId = btn.dataset.actionId
  if (actionId) {
    const acao = acoes.find(a => a.id === actionId)
    acao?.fn()
    return
  }
  const pedidoId = btn.dataset.pedidoId
  if (pedidoId) window.__navegar('detalhe', { id: pedidoId })
}

function _cmdGetAcoes() {
  const perfil = window.__praxisSessao?.usuario?.perfil
  const podeRelatorios = ['supremo', 'gestor', 'aprovador', 'financeiro'].includes(perfil)
  const podeConfig     = ['supremo', 'gestor'].includes(perfil)
  const tela = new URLSearchParams(location.search).get('tela') || 'pedidos'
  const claro = document.documentElement.classList.contains('light')
  const ico = (corpo) => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${corpo}</svg>`

  const acoes = [
    {
      id: 'novo-pedido', label: 'Novo pedido', termos: 'criar solicitar compra',
      icon: ico('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
      fn: () => {
        window.__navegar('pedidos')
        setTimeout(() => document.getElementById('btn-novo-pedido')?.click(), 150)
      },
    },
    tela !== 'pedidos' && {
      id: 'ir-pedidos', label: 'Ir para Pedidos', termos: 'kanban quadro lista',
      icon: ico('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
      fn: () => window.__navegar('pedidos'),
    },
    podeRelatorios && tela !== 'relatorios' && {
      id: 'ir-relatorios', label: 'Ir para Relatórios', termos: 'graficos indicadores exportar pdf excel',
      icon: ico('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
      fn: () => window.__navegar('relatorios'),
    },
    podeConfig && {
      id: 'ir-usuarios', label: 'Configurações: Usuários', termos: 'pessoas perfis acesso',
      icon: ico('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
      fn: () => window.__navegar('config-usuarios'),
    },
    podeConfig && {
      id: 'ir-cadastros', label: 'Configurações: Cadastros', termos: 'empresas categorias fornecedores',
      icon: ico('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>'),
      fn: () => window.__navegar('config-cadastros'),
    },
    podeConfig && {
      id: 'ir-geral', label: 'Configurações: Geral', termos: 'idioma sla prazos tour',
      icon: ico('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>'),
      fn: () => window.__navegar('config-geral'),
    },
    {
      id: 'alternar-tema', label: claro ? 'Usar tema escuro' : 'Usar tema claro', termos: 'tema aparencia claro escuro modo',
      icon: claro
        ? ico('<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>')
        : ico('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>'),
      fn: () => toggleTheme(),
    },
  ]
  return acoes.filter(Boolean)
}

// ── Handler global de teclado (Esc fecha; Enter confirma diálogo) ──────────
;(function _initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Ordem: paleta, tour, diálogo, modal mais recente
      if (_cmdPaletaEl?.classList.contains('visible')) { _fecharPaleta(); return }
      if (_tourAtivo()) { _tourFinalizar(); return }
      const dialog = [...document.querySelectorAll('.dialog-overlay.visible')].at(-1)
      if (dialog) {
        const cancelBtn = dialog.querySelector('[id^="prx-confirm-cancel"]') || dialog.querySelector('[id^="prx-alert-ok"]')
        cancelBtn?.click()
        return
      }
      const modal = [...document.querySelectorAll('.modal-overlay.visible')].at(-1)
      if (modal) {
        fecharModal(modal.id)
        modal._onClose?.()
      }
      return
    }

    // Enter confirma o diálogo, a menos que o foco esteja num botão
    // (aí vale o botão focado: Enter no "Cancelar" cancela)
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('select, button')) {
      const dialog = [...document.querySelectorAll('.dialog-overlay.visible')].at(-1)
      if (dialog) {
        e.preventDefault()
        dialog.querySelector('[id^="prx-confirm-ok"], [id^="prx-alert-ok"]')?.click()
      }
    }
  })
})()

// ── Tema ─────────────────────────────────────────────────────
export function initTheme() {
  const saved = localStorage.getItem('praxis_theme') || 'dark'
  aplicarTema(saved)
}

export function toggleTheme() {
  const atual = document.documentElement.classList.contains('light') ? 'light' : 'dark'
  const novo = atual === 'dark' ? 'light' : 'dark'
  aplicarTema(novo)
  localStorage.setItem('praxis_theme', novo)
  return novo
}

function aplicarTema(tema) {
  document.documentElement.classList.toggle('light', tema === 'light')
  // Barra do navegador no celular acompanha o tema (mesmas cores de --bg)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'light' ? '#EFE6D7' : '#13100D')
}

// ── Fundo das telas de entrada ────────────────────────────────
// A entrada (login, recuperação de senha) usa a grade sutil de 32 px em CSS
// (body.ceu). O nome ficou do céu estrelado que existia antes.
export function mostrarCeu(ligar) {
  document.body.classList.toggle('ceu', !!ligar)
}

// ── Marca ─────────────────────────────────────────────────────
// Símbolo: o Λ do GFS Didot com as pernas unidas por uma base da espessura
// das serifas — um triângulo vazado, como um frontão. _TRI é o desenho do
// Didot; _TRIP, a versão reforçada (haste fina e base mais grossas) para
// 16–20 px. O letreiro é PRΛXIS em Didot com o A trocado pelo símbolo,
// calibrado sobre o Λ da fonte (mesma altura, largura e linha de base).
const _TRI  = 'M296 100H323L466 527V535H521V553H77V535Q128 535 145 495ZM289 197L185 470Q172 505 175 525Q180 535 215 535H405Z'
const _TRIP = 'M286 92H334L480 520V524H530V560H70V524Q118 524 136 486ZM292 236L206 466Q196 494 199 508Q203 516 226 516H392Z'

export function marcaPraxis(classe = '') {
  return `<span class="marca ${classe}" role="img" aria-label="Praxis">PR<svg class="marca-tri" viewBox="67.16 100 466.6 453" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="${_TRI}"/></svg>XIS</span>`
}

export function simboloPraxis(tam = 24, classe = '') {
  return `<svg class="simbolo ${classe}" width="${tam}" height="${tam}" viewBox="60 86 480 480" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${tam < 24 ? _TRIP : _TRI}"/></svg>`
}

// Friso de meandro (grega), como nas bandas dos vasos. Decorativo: leitores
// de tela ignoram.
let _frisoSeq = 0
export function frisoGrego({ classe = '' } = {}) {
  const id = `friso-${++_frisoSeq}`
  return `<svg class="friso friso-h ${classe}" aria-hidden="true" focusable="false"><defs><pattern id="${id}" width="20" height="14" patternUnits="userSpaceOnUse"><path d="M0 12.5H4V1.5H16V9.5H9V5.5H12.5M16 12.5H20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/></pattern></defs><rect width="100%" height="100%" fill="url(#${id})"/></svg>`
}

// ── Spinner ───────────────────────────────────────────────────
export function mostrarSpinner() {
  document.getElementById('spinner-overlay')?.classList.add('visible')
}

export function esconderSpinner() {
  document.getElementById('spinner-overlay')?.classList.remove('visible')
}

// ── Toast ─────────────────────────────────────────────────────
// Sucesso e info somem em 4 s; erro e aviso ficam 6 s (dá tempo de ler).
// No máximo quatro ao mesmo tempo; o mais antigo sai primeiro.
const _TOAST_TIPOS = {
  success: { cor: 'green', icone: () => iconeCheck(),  papel: 'status' },
  error:   { cor: 'red',   icone: () => iconeX(),      papel: 'alert'  },
  info:    { cor: 'blue',  icone: () => iconeInfo(),   papel: 'status' },
  warning: { cor: 'amber', icone: () => iconeAviso(),  papel: 'alert'  },
}

export function prxToast(mensagem, tipo = 'info', duracao) {
  const container = document.getElementById('toast-container')
  if (!container) return
  const cfg = _TOAST_TIPOS[tipo] || _TOAST_TIPOS.info
  const tempo = duracao ?? (tipo === 'error' || tipo === 'warning' ? 6000 : 4000)

  const vivos = [...container.querySelectorAll('.toast:not(.out)')]
  if (vivos.length >= 4) _sairToast(vivos[0])

  const toast = document.createElement('div')
  toast.className = `toast toast-${cfg.cor}`
  toast.setAttribute('role', cfg.papel)
  toast.innerHTML = `
    <span class="toast-ico" aria-hidden="true">${cfg.icone()}</span>
    <span class="toast-msg">${mensagem}</span>
    <button type="button" class="toast-fechar" aria-label="Fechar aviso">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `
  toast.querySelector('.toast-fechar').onclick = () => _sairToast(toast)
  container.appendChild(toast)

  // Pausa enquanto o ponteiro está em cima (para ler com calma)
  let restante = tempo
  let inicio = Date.now()
  let timer = setTimeout(() => _sairToast(toast), restante)
  toast.addEventListener('mouseenter', () => { clearTimeout(timer); restante -= Date.now() - inicio })
  toast.addEventListener('mouseleave', () => { inicio = Date.now(); timer = setTimeout(() => _sairToast(toast), Math.max(1200, restante)) })
}

function _sairToast(toast) {
  if (!toast || toast.classList.contains('out')) return
  toast.classList.add('out')
  setTimeout(() => toast.remove(), 220)
}

// ── Alert / Confirm ───────────────────────────────────────────
// Diálogos modais: foco vai para a ação segura, Tab fica preso dentro,
// Esc cancela e, ao fechar, o foco volta para quem abriu.
let _dialogoSeq = 0

function _montarDialogo({ titulo, mensagem, botoes, papel = 'alertdialog', perigo = false }) {
  const overlay = criarDialogOverlay()
  const id = `prx-dialogo-${++_dialogoSeq}`
  overlay._focoAnterior = document.activeElement
  overlay.innerHTML = `
    <div class="dialog${perigo ? ' dialog-perigo' : ''}" role="${papel}" aria-modal="true" aria-labelledby="${id}-titulo" ${mensagem ? `aria-describedby="${id}-texto"` : ''}>
      <h3 id="${id}-titulo">${titulo}</h3>
      ${mensagem ? `<p id="${id}-texto">${mensagem}</p>` : ''}
      <div class="dialog-actions">${botoes}</div>
    </div>
  `
  overlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return
    const els = [...overlay.querySelectorAll('button:not(:disabled)')]
    if (!els.length) return
    const i = els.indexOf(document.activeElement)
    e.preventDefault()
    const prox = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i === els.length - 1 ? 0 : i + 1)
    els[prox].focus()
  })
  document.body.appendChild(overlay)
  requestAnimationFrame(() => overlay.classList.add('visible'))
  return overlay
}

export function prxAlert(titulo, mensagem = '') {
  return new Promise(resolve => {
    const overlay = _montarDialogo({
      titulo, mensagem,
      botoes: `<button type="button" class="btn-primary" id="prx-alert-ok">OK</button>`,
    })
    const ok = overlay.querySelector('#prx-alert-ok')
    setTimeout(() => ok.focus(), 20)
    ok.onclick = () => { fecharDialog(overlay); resolve() }
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { fecharDialog(overlay); resolve() }
    })
  })
}

export function prxConfirm(titulo, mensagem = '', labelOk = 'Confirmar', labelCancel = 'Cancelar', danger = false) {
  return new Promise(resolve => {
    const overlay = _montarDialogo({
      titulo, mensagem, perigo: !!danger,
      botoes: `
        <button type="button" class="btn-secondary" id="prx-confirm-cancel">${labelCancel}</button>
        <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" id="prx-confirm-ok">${labelOk}</button>
      `,
    })
    const ok = overlay.querySelector('#prx-confirm-ok')
    const cancelar = overlay.querySelector('#prx-confirm-cancel')
    // Ação destrutiva: o foco começa no "Cancelar"
    setTimeout(() => (danger ? cancelar : ok).focus(), 20)
    ok.onclick = () => { fecharDialog(overlay); resolve(true) }
    cancelar.onclick = () => { fecharDialog(overlay); resolve(false) }
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { fecharDialog(overlay); resolve(false) }
    })
  })
}

// ── Modal genérico ────────────────────────────────────────────
const _FOCUSAVEIS = 'a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function abrirModal(id) {
  const overlay = document.getElementById(id)
  if (!overlay) return
  overlay.classList.remove('closing')
  overlay.classList.add('visible')

  // Guarda elemento que abriu para restaurar foco ao fechar
  overlay._focusTrigger = document.activeElement

  // Foco automático no primeiro campo; sem campos, no primeiro botão do modal
  setTimeout(() => {
    const visivel = el => el.offsetParent !== null
    const campo = [...overlay.querySelectorAll('input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')].find(visivel)
    const alvo = campo || [...overlay.querySelectorAll(_FOCUSAVEIS)].find(visivel)
    alvo?.focus({ preventScroll: true })
  }, 60)

  // Focus trap: Tab cicla apenas dentro do modal
  if (overlay._trapHandler) overlay.removeEventListener('keydown', overlay._trapHandler)
  overlay._trapHandler = function(e) {
    if (e.key !== 'Tab') return
    const els = [...overlay.querySelectorAll(_FOCUSAVEIS)].filter(el => el.offsetParent !== null)
    if (!els.length) { e.preventDefault(); return }
    const primeiro = els[0]
    const ultimo   = els[els.length - 1]
    if (!overlay.contains(document.activeElement)) { e.preventDefault(); primeiro.focus(); return }
    if (e.shiftKey) {
      if (document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
    } else {
      if (document.activeElement === ultimo)  { e.preventDefault(); primeiro.focus() }
    }
  }
  overlay.addEventListener('keydown', overlay._trapHandler)
}

export function fecharModal(id) {
  const overlay = document.getElementById(id)
  if (!overlay || !overlay.classList.contains('visible')) return

  // Remove trap e restaura foco ao elemento que abriu o modal
  if (overlay._trapHandler) {
    overlay.removeEventListener('keydown', overlay._trapHandler)
    overlay._trapHandler = null
  }
  const trigger = overlay._focusTrigger
  overlay._focusTrigger = null

  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduzido) {
    overlay.classList.remove('visible')
    trigger?.focus?.({ preventScroll: true })
    return
  }
  overlay.classList.add('closing')
  setTimeout(() => {
    overlay.classList.remove('visible', 'closing')
    if (trigger?.isConnected) trigger.focus?.({ preventScroll: true })
  }, 190)
}

export function initModal(id) {
  const overlay = document.getElementById(id)
  if (!overlay) return
  overlay.addEventListener('click', e => {
    if (e.target === overlay) fecharModal(id)
  })
  overlay.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal(id))
  })
}

// ── Avatar ────────────────────────────────────────────────────
export function renderAvatar(nome, tamanho = 'md') {
  const { gerarIniciais } = window.__praxisUtils || {}
  const iniciais = gerarIniciais ? gerarIniciais(nome) : (nome?.[0] ?? '?').toUpperCase()
  return `<div class="avatar avatar-${tamanho}" aria-label="${nome}">${iniciais}</div>`
}

// ── Badge de status ───────────────────────────────────────────
export function renderBadgeStatus(status) {
  const { STATUS_LABEL, STATUS_COLOR } = window.__praxisConst || {}
  const label = STATUS_LABEL?.[status] ?? status
  const color = STATUS_COLOR?.[status] ?? 'neutral'
  return `<span class="badge badge-${color}">${label}</span>`
}

export function renderBadgePerfil(perfil) {
  const { PERFIS_LABEL, PERFIS_COLOR } = window.__praxisConst || {}
  const label = PERFIS_LABEL?.[perfil] ?? perfil
  const color = PERFIS_COLOR?.[perfil] ?? 'neutral'
  return `<span class="badge badge-${color}">${label}</span>`
}

// ── Helpers DOM ───────────────────────────────────────────────
export function el(id) { return document.getElementById(id) }
export function qs(sel, ctx = document) { return ctx.querySelector(sel) }
export function qsa(sel, ctx = document) { return [...ctx.querySelectorAll(sel)] }

export function setHTML(id, html) {
  const e = document.getElementById(id)
  if (e) e.innerHTML = html
}

export function mostrar(id) { document.getElementById(id)?.style.setProperty('display', 'block') }
export function ocultar(id) { document.getElementById(id)?.style.setProperty('display', 'none') }

// ── Internos ──────────────────────────────────────────────────
function criarDialogOverlay() {
  const div = document.createElement('div')
  div.className = 'dialog-overlay'
  return div
}

function fecharDialog(overlay) {
  overlay.classList.remove('visible')
  overlay.classList.add('saindo')
  const anterior = overlay._focoAnterior
  setTimeout(() => {
    overlay.remove()
    // Devolve o foco a quem abriu, se ainda existir e nada mais pegou o foco
    if (anterior?.isConnected && (document.activeElement === document.body || !document.activeElement)) {
      anterior.focus?.({ preventScroll: true })
    }
  }, 160)
}

// ── Ícones SVG inline ─────────────────────────────────────────
export function iconeCheck()  { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>` }
export function iconeX()      { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>` }
export function iconeInfo()   { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` }
export function iconeAviso()  { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>` }
export function iconeSol()    { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>` }
export function iconeLua()    { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>` }
export function iconeSino()   { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>` }
export function iconeEngrenagem() { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>` }
export function iconeKanban() { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>` }
export function iconeLista()  { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>` }
export function iconePlus()   { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>` }
export function iconeRaio()   { return `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>` }
export function iconeArquivo(){ return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>` }
export function iconeEnviar() { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>` }
export function iconeEditar() { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>` }
export function iconeLixo()   { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>` }
export function iconeVoltar() { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>` }
export function iconeEmpresa(){ return `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` }
export function iconeBusca()  { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>` }
export function iconeHamburger() { return `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>` }
export function iconeEnvelope(){ return `<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>` }
export function iconeClipe()  { return `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>` }
export function iconeExcel()  { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>` }
export function iconePDF()    { return `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` }

// ── Loading state nos botões (2.4) ────────────────────────────
export async function btnComLoading(btn, acao) {
  if (!btn || btn.disabled) return
  const textoOriginal = btn.innerHTML
  btn.disabled = true
  btn.classList.add('btn-loading')
  try {
    await acao()
  } finally {
    btn.disabled = false
    btn.classList.remove('btn-loading')
    btn.innerHTML = textoOriginal
  }
}

// ── Faixa de modo demonstração ────────────────────────────────
// Mesmo padrão do FuelMind: faixa fixa no topo, na cor da marca, para
// ninguém confundir demonstração com dado real. Traz as duas ações do modo:
// restaurar os dados de exemplo e sair da demo. A altura real vai para
// --faixa-demo-h, e a barra lateral, a faixa do celular e o conteúdo descem
// junto (medir em vez de fixar: no celular o texto encolhe).
function _medirFaixaDemo() {
  const faixa = document.getElementById('demo-faixa')
  if (faixa) document.documentElement.style.setProperty('--faixa-demo-h', `${faixa.offsetHeight}px`)
}

function _removerDemoBanner() {
  document.getElementById('demo-faixa')?.remove()
  document.body.classList.remove('com-demo')
  document.documentElement.style.removeProperty('--faixa-demo-h')
  window.removeEventListener('resize', _medirFaixaDemo)
}

async function _restaurarDadosDemo(btn) {
  const ok = await prxConfirm(t('confirmarResetDemo'), t('cfgResetMsg'), t('btnResetarDemo'), t('btnCancelar'), true)
  if (!ok) return
  btn.disabled = true
  mostrarSpinner()
  try {
    const { functions, httpsCallable } = await import('./firebase.js')
    await httpsCallable(functions, 'triggerDemoSeed')({})
    prxToast(t('demoResetadoMsg'), 'success', 4000)
  } catch (err) {
    console.error(err)
    prxToast(t('demoErroReset'), 'error')
  } finally {
    btn.disabled = false
    esconderSpinner()
  }
}

export function mostrarDemoBanner(isDemo) {
  if (!isDemo) { _removerDemoBanner(); return }
  if (document.getElementById('demo-faixa')) return

  const faixa = document.createElement('div')
  faixa.id = 'demo-faixa'
  faixa.className = 'demo-faixa'
  faixa.setAttribute('role', 'note')
  faixa.innerHTML = `
    <span class="demo-faixa-texto"><strong>${t('demoFaixaTitulo')}</strong><span class="demo-faixa-detalhe">${t('demoFaixaDetalhe')}</span></span>
    <span class="demo-faixa-acoes">
      <button type="button" id="demo-faixa-restaurar">${t('demoFaixaRestaurar')}</button>
      <button type="button" id="demo-faixa-sair">${t('demoFaixaSair')}</button>
    </span>
  `
  faixa.querySelector('#demo-faixa-restaurar').addEventListener('click', e => _restaurarDadosDemo(e.currentTarget))
  faixa.querySelector('#demo-faixa-sair').addEventListener('click', async () => {
    const { fazerLogout } = await import('./auth.js')
    fazerLogout()
  })
  document.body.prepend(faixa)
  document.body.classList.add('com-demo')
  _medirFaixaDemo()
  window.addEventListener('resize', _medirFaixaDemo)
}

// ── Offline e erro de rede (3.17) ─────────────────────────────
export function estaOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

// Verifica conexão antes de uma escrita; se offline, avisa e retorna false
export function exigirConexao() {
  if (estaOnline()) return true
  prxToast(t('semConexaoAcao'), 'error')
  return false
}

function _mostrarOfflineBanner() {
  if (document.getElementById('offline-banner')) return
  // Primeira frase em destaque ("Sem conexão."), o resto como explicação
  const texto = String(t('semConexao'))
  const corte = texto.indexOf('. ')
  const titulo = corte > 0 ? texto.slice(0, corte + 1) : texto
  const resto  = corte > 0 ? texto.slice(corte + 2) : ''
  const banner = document.createElement('div')
  banner.id = 'offline-banner'
  banner.className = 'offline-banner'
  banner.setAttribute('role', 'status')
  banner.setAttribute('aria-live', 'polite')
  banner.innerHTML = `
    <span class="offline-banner-ico" aria-hidden="true">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0122.58 9"/><path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
    </span>
    <span class="offline-banner-texto"><b>${titulo}</b>${resto ? ' ' + resto : ''}</span>
  `
  document.body.appendChild(banner)
  document.body.classList.add('com-offline')
}

export function initOfflineWatcher() {
  if (globalThis.__praxisOfflineWatcher) return
  globalThis.__praxisOfflineWatcher = true

  window.addEventListener('offline', _mostrarOfflineBanner)
  window.addEventListener('online', () => {
    const estavaOffline = !!document.getElementById('offline-banner')
    document.getElementById('offline-banner')?.remove()
    document.body.classList.remove('com-offline')
    if (estavaOffline) prxToast(t('conexaoRestabelecida'), 'success')
  })
  if (!estaOnline()) _mostrarOfflineBanner()
}

// ── Skeleton helpers (2.2) ────────────────────────────────────
export function skeletonKanban(nColunas = 4) {
  const cols = Array.from({ length: nColunas }, () => `
    <div class="skeleton-col">
      <div class="skeleton skeleton-title" style="width:60%"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card" style="height:80px"></div>
    </div>
  `).join('')
  return `<div class="skeleton-kanban">${cols}</div>`
}

export function skeletonLista(nLinhas = 5) {
  const linhas = Array.from({ length: nLinhas }, () => `
    <div class="skeleton skeleton-row" style="margin-bottom:0.4rem"></div>
  `).join('')
  return `<div style="padding:0.5rem">${linhas}</div>`
}

export function skeletonDashCards(n = 4) {
  const cards = Array.from({ length: n }, () => `
    <div class="card no-hover" style="padding:1.5rem">
      <div class="skeleton skeleton-text" style="width:50%;margin-bottom:0.75rem"></div>
      <div class="skeleton skeleton-title" style="width:70%;height:2rem;margin-bottom:0.5rem"></div>
      <div class="skeleton skeleton-text" style="width:40%"></div>
    </div>
  `).join('')
  return `<div class="dash-grid-1" style="margin-bottom:1rem">${cards}</div>`
}

// ── Tour guiado (4.3) ─────────────────────────────────────────
// Cada passo aponta para o primeiro alvo visível da lista (desktop ou
// celular). Um recorte fixo destaca o alvo; o balão se posiciona abaixo,
// acima ou, sem espaço, preso à borda de baixo da tela.
function _getTourPassos() {
  return [
    { alvo: ['#pedidos-view'],                                        titulo: t('tourStep1Titulo'), desc: t('tourStep1Desc') },
    { alvo: ['#btn-novo-pedido'],                                     titulo: t('tourStep2Titulo'), desc: t('tourStep2Desc') },
    { alvo: ['#btn-notif'],                                           titulo: t('tourStep3Titulo'), desc: t('tourStep3Desc') },
    { alvo: ['#btn-avatar', '#bnav-conta'],                           titulo: t('tourStep4Titulo'), desc: t('tourStep4Desc') },
    { alvo: ['#lateral-cadastros', '#bottom-nav [data-bnav="config-usuarios"]'], titulo: t('tourStep5Titulo'), desc: t('tourStep5Desc') },
  ]
}

let _tourLista = []
let _tourPasso = 0
let _tourAlvo  = null

function _tourVisivel(el) {
  if (!el || !el.isConnected) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

export function iniciarTour(isDemo = false) {
  if (isDemo) {
    if (sessionStorage.getItem('praxis_tour_mostrado')) return
    sessionStorage.setItem('praxis_tour_mostrado', '1')
  } else {
    if (localStorage.getItem('praxis_tour_visto')) return
  }
  setTimeout(_tourIniciar, 700)
}

export function reativarTour() {
  localStorage.removeItem('praxis_tour_visto')
  sessionStorage.removeItem('praxis_tour_mostrado')
  // O tour começa no quadro de pedidos; de outra tela, vai até lá primeiro
  if (!document.getElementById('pedidos-view') && window.__navegar) {
    window.__navegar('pedidos')
    setTimeout(_tourIniciar, 900)
    return
  }
  setTimeout(_tourIniciar, 100)
}

function _tourIniciar() {
  _tourLista = _getTourPassos()
    .map(p => ({ ...p, el: p.alvo.map(s => document.querySelector(s)).find(_tourVisivel) }))
    .filter(p => p.el)
  if (!_tourLista.length) return
  _tourPasso = 0
  _tourMontar()
  _tourMostrarPasso()
}

function _tourMontar() {
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

function _tourIr(delta) {
  const novo = _tourPasso + delta
  if (novo < 0) return
  if (novo >= _tourLista.length) { _tourFinalizar(); return }
  _tourPasso = novo
  _tourMostrarPasso()
}

function _tourMostrarPasso() {
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
    <h4 class="tour-titulo" id="tour-titulo">${passo.titulo}</h4>
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

function _tourReposicionar() {
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

function _tourLimpar() {
  document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'))
  ;['tour-popover', 'tour-spot', 'tour-bloqueio'].forEach(id => document.getElementById(id)?.remove())
  window.removeEventListener('resize', _tourReposicionar)
  window.removeEventListener('scroll', _tourReposicionar, true)
  _tourAlvo = null
}

function _tourAtivo() { return !!document.getElementById('tour-popover') }

function _tourFinalizar() {
  _tourLimpar()
  localStorage.setItem('praxis_tour_visto', '1')
}
