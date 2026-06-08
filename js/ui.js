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
    requestAnimationFrame(() => overlay.classList.add('visible'))

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
    requestAnimationFrame(() => overlay.classList.add('visible'))

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
export function abrirModal(id) {
  document.getElementById(id)?.classList.add('visible')
}

export function fecharModal(id) {
  document.getElementById(id)?.classList.remove('visible')
}

export function initModal(id) {
  const overlay = document.getElementById(id)
  if (!overlay) return
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('visible')
  })
  overlay.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => overlay.classList.remove('visible'))
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
