import { t } from './constants.js'

// ── Command Palette (4.2) ─────────────────────────────────────
let _cmdPaletaEl  = null
let _cmdActiveIdx = 0

export function initCommandPalette() {
  if (globalThis.__praxisCmdInited) return
  globalThis.__praxisCmdInited = true
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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
  _cmdPaletaEl.classList.add('visible')
  _cmdActiveIdx = 0
  const input = document.getElementById('cmd-input')
  if (input) { input.value = ''; input.focus() }
  _cmdRenderResultados('')
}

function _fecharPaleta() {
  _cmdPaletaEl?.classList.remove('visible')
}

function _criarPaletaDOM() {
  if (_cmdPaletaEl) return
  const el = document.createElement('div')
  el.id = 'cmd-palette'
  el.className = 'cmd-palette-overlay'
  el.setAttribute('role', 'dialog')
  el.setAttribute('aria-label', 'Paleta de comandos')
  el.innerHTML = `
    <div class="cmd-palette">
      <div class="cmd-palette-header">
        <svg class="cmd-search-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="cmd-input" type="text" class="cmd-input" placeholder="Buscar ação ou pedido..." autocomplete="off" spellcheck="false" aria-label="Buscar comando ou pedido">
        <kbd class="cmd-esc-hint">ESC</kbd>
      </div>
      <div id="cmd-results" class="cmd-results" role="listbox"></div>
      <div class="cmd-palette-footer">
        <span><kbd>↑↓</kbd> navegar</span>
        <span><kbd>↵</kbd> confirmar</span>
        <span><kbd>ESC</kbd> fechar</span>
      </div>
    </div>
  `
  document.body.appendChild(el)
  _cmdPaletaEl = el

  el.addEventListener('click', e => { if (e.target === el) _fecharPaleta() })

  const input = el.querySelector('#cmd-input')
  input.addEventListener('input', e => {
    _cmdActiveIdx = 0
    _cmdRenderResultados(e.target.value)
  })
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); _fecharPaleta(); return }
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
}

function _cmdSyncAtivo(items) {
  items.forEach((btn, i) => btn.classList.toggle('active', i === _cmdActiveIdx))
  items[_cmdActiveIdx]?.scrollIntoView({ block: 'nearest' })
}

function _cmdRenderResultados(query) {
  const results = document.getElementById('cmd-results')
  if (!results) return
  const q = query.trim().toLowerCase()

  const acoes = _cmdGetAcoes()
  const acoesMatch = !q ? acoes : acoes.filter(a =>
    a.label.toLowerCase().includes(q)
  )

  const pedidos = window.__getPedidos?.() || []
  const pedidosMatch = !q ? [] : pedidos.filter(p => {
    return (p.numeroPedido || '').toLowerCase().includes(q) ||
           (p.titulo || '').toLowerCase().includes(q)
  }).slice(0, 6)

  if (!acoesMatch.length && !pedidosMatch.length) {
    results.innerHTML = `<div class="cmd-empty">Nenhum resultado para "${query}"</div>`
    return
  }

  let html = ''
  let idx = 0

  if (acoesMatch.length) {
    html += `<div class="cmd-group-label">Comandos</div>`
    html += acoesMatch.map(a => {
      const i = idx++
      return `<button class="cmd-item${i === _cmdActiveIdx ? ' active' : ''}" data-idx="${i}" data-action-id="${a.id}" role="option">
        <span class="cmd-item-icon" aria-hidden="true">${a.icon}</span>
        <span class="cmd-item-label">${a.label}</span>
      </button>`
    }).join('')
  }

  if (pedidosMatch.length) {
    html += `<div class="cmd-group-label">Pedidos</div>`
    html += pedidosMatch.map(p => {
      const i = idx++
      return `<button class="cmd-item${i === _cmdActiveIdx ? ' active' : ''}" data-idx="${i}" data-pedido-id="${p.id}" role="option">
        <span class="cmd-item-icon" aria-hidden="true"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></span>
        <span class="cmd-item-label">
          <span class="cmd-item-num">${p.numeroPedido || '—'}</span>
          ${p.titulo || '(sem título)'}
        </span>
      </button>`
    }).join('')
  }

  results.innerHTML = html

  results.querySelectorAll('.cmd-item').forEach((btn, i) => {
    btn.addEventListener('click', () => _cmdExecutarItem(btn, acoes, pedidosMatch))
    btn.addEventListener('mouseenter', () => {
      _cmdActiveIdx = i
      _cmdSyncAtivo([...results.querySelectorAll('.cmd-item')])
    })
  })
}

function _cmdExecutarItem(btn, acoes, pedidosMatch) {
  _fecharPaleta()
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
  return [
    {
      id: 'ir-pedidos', label: 'Ir para Pedidos',
      icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
      fn: () => window.__navegar('pedidos'),
    },
    {
      id: 'ir-relatorios', label: 'Ir para Relatórios',
      icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
      fn: () => window.__navegar('relatorios'),
    },
    {
      id: 'ir-config', label: 'Ir para Configurações',
      icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
      fn: () => window.__navegar('config-usuarios'),
    },
    {
      id: 'novo-pedido', label: 'Novo pedido',
      icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
      fn: () => {
        window.__navegar('pedidos')
        setTimeout(() => document.getElementById('btn-novo-pedido')?.click(), 150)
      },
    },
    {
      id: 'alternar-tema', label: 'Alternar tema (claro / escuro)',
      icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
      fn: () => toggleTheme(),
    },
  ]
}

// ── Handler global de teclado (ESC fecha modal/dialog; Enter confirma) ──────
;(function _initKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Paleta tem prioridade
      if (_cmdPaletaEl?.classList.contains('visible')) {
        _fecharPaleta()
        return
      }
      // Dialog tem prioridade
      const dialog = document.querySelector('.dialog-overlay.visible')
      if (dialog) {
        const cancelBtn = dialog.querySelector('[id^="prx-confirm-cancel"]') || dialog.querySelector('[id^="prx-alert-ok"]')
        cancelBtn?.click()
        return
      }
      // Fecha o modal mais recente
      const modais = [...document.querySelectorAll('.modal-overlay.visible')]
      const modal = modais.at(-1)
      if (modal) {
        fecharModal(modal.id)
        modal._onClose?.()
      }
      return
    }

    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !e.target.closest('select')) {
      const dialog = document.querySelector('.dialog-overlay.visible')
      if (dialog) {
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
  desenharEstrelas(tema)
  atualizarIconeTema(tema)
}

function atualizarIconeTema(tema) {
  const btn = document.getElementById('btn-tema')
  if (!btn) return
  btn.innerHTML = tema === 'dark' ? iconeSol() : iconeLua()
  btn.title = tema === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro'
}

// ── Canvas de estrelas ────────────────────────────────────────
export function desenharEstrelas(tema) {
  const canvas = document.getElementById('bg-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const W = canvas.width  = window.innerWidth
  const H = canvas.height = window.innerHeight
  const dark = tema !== 'light'

  ctx.clearRect(0, 0, W, H)

  // Nebulas
  const nebulas = [
    { x: W * 0.15, y: H * 0.25, rx: W * 0.25, ry: H * 0.18 },
    { x: W * 0.75, y: H * 0.60, rx: W * 0.22, ry: H * 0.20 },
    { x: W * 0.50, y: H * 0.85, rx: W * 0.30, ry: H * 0.12 },
  ]
  nebulas.forEach(n => {
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, Math.max(n.rx, n.ry))
    if (dark) {
      grad.addColorStop(0,   'rgba(200,169,110,0.055)')
      grad.addColorStop(0.5, 'rgba(200,169,110,0.02)')
      grad.addColorStop(1,   'rgba(0,0,0,0)')
    } else {
      grad.addColorStop(0,   'rgba(154,112,48,0.04)')
      grad.addColorStop(0.5, 'rgba(154,112,48,0.015)')
      grad.addColorStop(1,   'rgba(0,0,0,0)')
    }
    ctx.save()
    ctx.scale(n.rx / Math.max(n.rx, n.ry), n.ry / Math.max(n.rx, n.ry))
    ctx.beginPath()
    ctx.arc(
      n.x * (Math.max(n.rx, n.ry) / n.rx),
      n.y * (Math.max(n.rx, n.ry) / n.ry),
      Math.max(n.rx, n.ry), 0, Math.PI * 2
    )
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
  })

  // Estrelas pequenas (240)
  for (let i = 0; i < 240; i++) {
    const x    = Math.random() * W
    const y    = Math.random() * H
    const r    = Math.random() * 1.2 + 0.3
    const op   = Math.random() * 0.55 + 0.1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    if (dark) {
      const gold = Math.random() < 0.15
      ctx.fillStyle = gold
        ? `rgba(200,169,110,${op})`
        : `rgba(240,237,230,${op})`
    } else {
      ctx.fillStyle = `rgba(90,70,50,${op * 0.5})`
    }
    ctx.fill()
  }

  // Estrelas grandes com halo (13)
  for (let i = 0; i < 13; i++) {
    const x  = Math.random() * W
    const y  = Math.random() * H
    const r  = Math.random() * 1.8 + 1.2
    const op = Math.random() * 0.5 + 0.3
    const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 5)
    if (dark) {
      halo.addColorStop(0,   `rgba(255,248,230,${op})`)
      halo.addColorStop(0.4, `rgba(200,169,110,${op * 0.3})`)
      halo.addColorStop(1,   'rgba(0,0,0,0)')
    } else {
      halo.addColorStop(0,   `rgba(90,70,50,${op * 0.6})`)
      halo.addColorStop(1,   'rgba(0,0,0,0)')
    }
    ctx.beginPath()
    ctx.arc(x, y, r * 5, 0, Math.PI * 2)
    ctx.fillStyle = halo
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = dark ? `rgba(255,248,230,${op})` : `rgba(90,70,50,${op})`
    ctx.fill()
  }
}

// ── Spinner ───────────────────────────────────────────────────
export function mostrarSpinner() {
  document.getElementById('spinner-overlay')?.classList.add('visible')
}

export function esconderSpinner() {
  document.getElementById('spinner-overlay')?.classList.remove('visible')
}

// ── Toast ─────────────────────────────────────────────────────
export function prxToast(mensagem, tipo = 'info', duracao = 3500) {
  const container = document.getElementById('toast-container')
  if (!container) return

  const toast = document.createElement('div')
  toast.className = `toast toast-${tipo}`

  const icone = { success: iconeCheck(), error: iconeX(), info: iconeInfo(), warning: iconeAviso() }
  toast.innerHTML = `
    <span style="color:var(--${tipo === 'success' ? 'green' : tipo === 'error' ? 'red' : tipo === 'warning' ? 'gold' : 'blue'}); flex-shrink:0;">
      ${icone[tipo] || iconeInfo()}
    </span>
    <span style="flex:1;color:var(--text2);font-size:0.875rem;line-height:1.45">${mensagem}</span>
  `

  container.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('out')
    setTimeout(() => toast.remove(), 300)
  }, duracao)
}

// ── Alert ─────────────────────────────────────────────────────
export function prxAlert(titulo, mensagem = '') {
  return new Promise(resolve => {
    const overlay = criarDialogOverlay()
    overlay.innerHTML = `
      <div class="dialog">
        <h3>${titulo}</h3>
        ${mensagem ? `<p>${mensagem}</p>` : ''}
        <div class="dialog-actions">
          <button class="btn-primary" id="prx-alert-ok">OK</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    setTimeout(() => overlay.classList.add('visible'), 16)

    overlay.querySelector('#prx-alert-ok').onclick = () => {
      fecharDialog(overlay)
      resolve()
    }
  })
}

// ── Confirm ───────────────────────────────────────────────────
export function prxConfirm(titulo, mensagem = '', labelOk = 'Confirmar', labelCancel = 'Cancelar', danger = false) {
  return new Promise(resolve => {
    const overlay = criarDialogOverlay()
    overlay.innerHTML = `
      <div class="dialog">
        <h3>${titulo}</h3>
        ${mensagem ? `<p>${mensagem}</p>` : ''}
        <div class="dialog-actions">
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="prx-confirm-ok">${labelOk}</button>
          <button class="btn-secondary" id="prx-confirm-cancel">${labelCancel}</button>
        </div>
      </div>
    `
    document.body.appendChild(overlay)
    setTimeout(() => overlay.classList.add('visible'), 16)

    overlay.querySelector('#prx-confirm-ok').onclick = () => {
      fecharDialog(overlay)
      resolve(true)
    }
    overlay.querySelector('#prx-confirm-cancel').onclick = () => {
      fecharDialog(overlay)
      resolve(false)
    }
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

  // Foco automático no primeiro campo interativo
  setTimeout(() => {
    const alvo = overlay.querySelector('input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
    alvo?.focus()
  }, 60)

  // Focus trap: Tab cicla apenas dentro do modal
  overlay._trapHandler = function(e) {
    if (e.key !== 'Tab') return
    const els = [...overlay.querySelectorAll(_FOCUSAVEIS)].filter(el => el.offsetParent !== null)
    if (!els.length) { e.preventDefault(); return }
    const primeiro = els[0]
    const ultimo   = els[els.length - 1]
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
    trigger?.focus()
    return
  }
  overlay.classList.add('closing')
  setTimeout(() => {
    overlay.classList.remove('visible', 'closing')
    trigger?.focus()
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

// ── Topbar mobile hamburger ───────────────────────────────────
export function initMobileMenu() {
  const btn = document.getElementById('btn-hamburger')
  const overlay = document.getElementById('mobile-menu-overlay')
  if (!btn || !overlay) return

  btn.addEventListener('click', () => {
    const open = overlay.classList.toggle('open')
    const menu = document.getElementById('mobile-menu')
    menu?.classList.toggle('open', open) // ← só abre o menu junto
  })

  overlay.addEventListener('click', e => {
    if (e.target === overlay) fecharMobileMenu()
  })
}

export function fecharMobileMenu() {
  document.getElementById('mobile-menu-overlay')?.classList.remove('open')
  document.getElementById('mobile-menu')?.classList.remove('open')
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
  setTimeout(() => overlay.remove(), 300)
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

// ── Banner de modo demo (2.8) ─────────────────────────────────
export function mostrarDemoBanner(isDemo, idioma = 'pt') {
  if (!isDemo) {
    document.getElementById('demo-banner')?.remove()
    return
  }
  if (document.getElementById('demo-banner')) return
  const texto = idioma === 'en'
    ? 'Demo mode — fictitious data. Explore freely.'
    : 'Modo demonstração — dados fictícios. Explore à vontade.'
  const banner = document.createElement('div')
  banner.id = 'demo-banner'
  banner.className = 'demo-banner'
  banner.setAttribute('role', 'status')
  banner.innerHTML = `
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
    <span>${texto}</span>
    <button class="demo-banner-close" aria-label="Fechar aviso de modo demonstração">
      <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `
  banner.querySelector('.demo-banner-close').onclick = () => banner.remove()
  document.body.appendChild(banner)
}

// ── Offline e erro de rede (3.17) ─────────────────────────────
export function estaOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

// Verifica conexão antes de uma escrita; se offline, avisa e retorna false
export function exigirConexao() {
  if (estaOnline()) return true
  prxToast(t('semConexao'), 'error')
  return false
}

function _mostrarOfflineBanner() {
  if (document.getElementById('offline-banner')) return
  const banner = document.createElement('div')
  banner.id = 'offline-banner'
  banner.className = 'offline-banner'
  banner.setAttribute('role', 'alert')
  banner.innerHTML = `
    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/><path d="M5 12.55a10.94 10.94 0 015.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0122.58 9"/><path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 016.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
    <span>${t('semConexao')}</span>
  `
  document.body.appendChild(banner)
}

export function initOfflineWatcher() {
  if (globalThis.__praxisOfflineWatcher) return
  globalThis.__praxisOfflineWatcher = true

  window.addEventListener('offline', _mostrarOfflineBanner)
  window.addEventListener('online', () => {
    document.getElementById('offline-banner')?.remove()
    prxToast(t('conexaoRestabelecida'), 'success')
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
function _getTourPassos() {
  return [
    { alvo: '#pedidos-view',    titulo: t('tourStep1Titulo'), desc: t('tourStep1Desc') },
    { alvo: '#btn-novo-pedido', titulo: t('tourStep2Titulo'), desc: t('tourStep2Desc') },
    { alvo: '#btn-notif',       titulo: t('tourStep3Titulo'), desc: t('tourStep3Desc') },
    { alvo: '#btn-tema',        titulo: t('tourStep4Titulo'), desc: t('tourStep4Desc') },
    { alvo: '#btn-config',      titulo: t('tourStep5Titulo'), desc: t('tourStep5Desc') },
  ]
}

let _tourPasso = 0

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
  setTimeout(_tourIniciar, 100)
}

function _tourIniciar() {
  _tourPasso = 0
  _tourMostrarPasso()
}

function _tourMostrarPasso() {
  _tourLimpar()

  while (_tourPasso < _getTourPassos().length && !document.querySelector(_getTourPassos()[_tourPasso].alvo)) {
    _tourPasso++
  }
  if (_tourPasso >= _getTourPassos().length) { _tourFinalizar(); return }

  const passo  = _getTourPassos()[_tourPasso]
  const alvoEl = document.querySelector(passo.alvo)

  const passosDisponiveis = _getTourPassos().filter(p => document.querySelector(p.alvo))
  const posicao = passosDisponiveis.findIndex(p => p.alvo === passo.alvo) + 1
  const total   = passosDisponiveis.length

  const isUltimo = _getTourPassos().slice(_tourPasso + 1).every(p => !document.querySelector(p.alvo))

  alvoEl.classList.add('tour-target')
  alvoEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

  const popover = document.createElement('div')
  popover.id = 'tour-popover'
  popover.className = 'tour-popover'
  popover.innerHTML = `
    <div class="tour-step-count">${posicao} de ${total}</div>
    <h4 class="tour-titulo">${passo.titulo}</h4>
    <p class="tour-desc">${passo.desc}</p>
    <div class="tour-actions">
      <button class="btn-ghost btn-sm" id="tour-pular">${t('tourPular')}</button>
      <button class="btn-primary btn-sm" id="tour-proximo">${isUltimo ? t('tourConcluir') : t('tourProximo')}</button>
    </div>
  `
  document.body.appendChild(popover)
  _tourPosicionar(alvoEl, popover)

  popover.querySelector('#tour-proximo').onclick = () => {
    if (isUltimo) { _tourFinalizar(); return }
    _tourPasso++
    _tourMostrarPasso()
  }
  popover.querySelector('#tour-pular').onclick = _tourFinalizar
}

function _tourPosicionar(alvo, popover) {
  const rect = alvo.getBoundingClientRect()
  const pW   = 300
  let top  = rect.bottom + 12
  let left = rect.left + rect.width / 2 - pW / 2

  left = Math.max(16, Math.min(left, window.innerWidth - pW - 16))
  if (top + 190 > window.innerHeight) top = rect.top - 190 - 12
  top = Math.max(16, top)

  popover.style.cssText = `position:fixed;top:${top}px;left:${left}px;width:${pW}px;z-index:801;`
}

function _tourLimpar() {
  document.querySelectorAll('.tour-target').forEach(el => el.classList.remove('tour-target'))
  document.getElementById('tour-popover')?.remove()
}

function _tourFinalizar() {
  _tourLimpar()
  localStorage.setItem('praxis_tour_visto', '1')
}
