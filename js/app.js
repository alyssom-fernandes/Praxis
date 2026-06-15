import { auth, onAuthStateChanged, functions, httpsCallable } from './firebase.js'
import { initTheme, desenharEstrelas, mostrarSpinner, esconderSpinner, mostrarDemoBanner, initOfflineWatcher, initCommandPalette, abrirCommandPalette } from './ui.js'
import { renderLogin, carregarUsuario, fazerLogout } from './auth.js'
import { renderPedidos } from './pedidos.js'
import { renderDetalhe } from './pedido-detalhe.js'
import { renderRelatorios } from './relatorios.js'
import { renderConfigUsuarios } from './config-usuarios.js'
import { renderConfigCadastros } from './config-cadastros.js'
import { renderConfigGeral } from './config-geral.js'
import {
  STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR,
  PERFIS, PERFIS_LABEL, PERFIS_COLOR, t,
} from './constants.js'
import { gerarIniciais } from './utils.js'

// Expõe constantes para ui.js (evita circular imports em renderizações)
window.__praxisConst = { STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR, PERFIS_LABEL, PERFIS_COLOR }
window.__praxisUtils = { gerarIniciais }

// Estado global da sessão
export const sessao = {
  usuario:   null,  // documento do Firestore
  fireUser:  null,  // FirebaseUser
  isDemo:    false,
}

// ── Limpadores de listeners (2.13) ────────────────────────────
const _limpadores = new Set()
export function registrarLimpador(fn) { _limpadores.add(fn) }
function _limparTudo() {
  _limpadores.forEach(fn => { try { fn() } catch {} })
  _limpadores.clear()
}

// ── Boot ─────────────────────────────────────────────────────

// Registra service worker apenas em produção (não no emulador local)
if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('/service-worker.js').catch(err => {
    console.warn('SW register failed:', err)
  })
}

initTheme()
_iniciarCanvas()
initOfflineWatcher()
initCommandPalette()

onAuthStateChanged(auth, async (fireUser) => {
  esconderSpinner()

  if (!fireUser) {
    _limparTudo()
    sessao.usuario  = null
    sessao.fireUser = null
    sessao.isDemo   = false
    mostrarDemoBanner(false)
    document.getElementById('bottom-nav')?.remove()
    renderLogin()
    return
  }

  mostrarSpinner()
  try {
    const usuario = await carregarUsuario(fireUser.uid)
    if (!usuario.ativo) {
      await fazerLogout()
      return
    }
    sessao.usuario  = usuario
    sessao.fireUser = fireUser
    sessao.isDemo   = usuario.email === 'demo@praxis.app'

    // Demo sem claims → define automaticamente e renova o token
    if (sessao.isDemo) {
      const tokenResult = await fireUser.getIdTokenResult()
      if (!tokenResult.claims.perfil) {
        try {
          await httpsCallable(functions, 'fixDemoClaims')()
          await fireUser.getIdToken(true) // força renovação do JWT
        } catch (e) {
          console.warn('fixDemoClaims falhou:', e.message)
        }
      }
    }

    const idioma = sessionStorage.getItem('praxis_lang') || 'pt'
    mostrarDemoBanner(sessao.isDemo, idioma)
    _rotear()
  } catch (err) {
    console.error(err)
    await fazerLogout()
  } finally {
    esconderSpinner()
  }
})

// ── Roteamento ────────────────────────────────────────────────
export function navegar(tela, params = {}) {
  const url = new URL(window.location)
  url.searchParams.set('tela', tela)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  // Limpa params não fornecidos
  ;['id'].forEach(p => { if (!(p in params)) url.searchParams.delete(p) })
  window.history.pushState({}, '', url)
  _rotear()
}

window.addEventListener('popstate', () => {
  if (sessao.usuario) _rotear()
})

function _rotear() {
  _limparTudo() // cancela listeners da view anterior (2.13)

  const params = new URLSearchParams(window.location.search)
  const tela   = params.get('tela') || 'pedidos'
  const id     = params.get('id')

  // Guarda de rota por perfil
  const telasConfig     = ['config-usuarios', 'config-cadastros', 'config-geral']
  const bloqueadoFinanc = telasConfig
  const bloqueadoAprov  = telasConfig
  const bloqueadoSolic  = ['relatorios', ...telasConfig]
  const bloqueadoCompr  = ['relatorios', ...telasConfig]
  const perfil          = sessao.usuario?.perfil

  const bloqueado = (
    (perfil === PERFIS.APROVADOR   && bloqueadoAprov.includes(tela)) ||
    (perfil === PERFIS.SOLICITANTE && bloqueadoSolic.includes(tela)) ||
    (perfil === PERFIS.COMPRADOR   && bloqueadoCompr.includes(tela)) ||
    (perfil === PERFIS.FINANCEIRO  && bloqueadoFinanc.includes(tela))
  )

  if (bloqueado) { navegar('pedidos'); return }

  switch (tela) {
    case 'pedidos':        return renderPedidos()
    case 'detalhe':        return renderDetalhe(id)
    case 'relatorios':     return renderRelatorios()
    case 'config-usuarios':  return renderConfigUsuarios()
    case 'config-cadastros': return renderConfigCadastros()
    case 'config-geral':     return renderConfigGeral()
    default:               return _render404(tela)
  }
}

function _render404(tela) {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('pedidos')}
      <div class="main-content" style="display:flex;align-items:center;justify-content:center;min-height:60vh">
        <div style="text-align:center;max-width:360px">
          <div style="font-size:4rem;font-weight:700;color:var(--text3);letter-spacing:-2px;margin-bottom:0.5rem">404</div>
          <div style="font-size:1.1rem;font-weight:600;margin-bottom:0.5rem">Página não encontrada</div>
          <div style="font-size:0.875rem;color:var(--text3);margin-bottom:1.5rem">A tela <code style="background:var(--card2);padding:0.15rem 0.4rem;border-radius:4px;font-size:0.8rem">${tela}</code> não existe.</div>
          <button class="btn-primary" onclick="window.__navegar('pedidos')">Voltar para pedidos</button>
        </div>
      </div>
      ${renderFooter()}
    </div>
  `
  initTopbarEvents(false)
}

// ── Canvas ────────────────────────────────────────────────────
function _iniciarCanvas() {
  const tema = document.documentElement.classList.contains('light') ? 'light' : 'dark'
  desenharEstrelas(tema)
  window.addEventListener('resize', _debounceResize)
}

let _resizeTimer
function _debounceResize() {
  clearTimeout(_resizeTimer)
  _resizeTimer = setTimeout(() => {
    const tema = document.documentElement.classList.contains('light') ? 'light' : 'dark'
    desenharEstrelas(tema)
  }, 200)
}

// ── Topbar ────────────────────────────────────────────────────
export function renderTopbar(telaAtiva, modoConfig = false) {
  const { usuario } = sessao
  if (!usuario) return ''

  const { gerarIniciais: gi } = window.__praxisUtils
  const iniciais = gi(usuario.nome)
  const perfil   = usuario.perfil

  const podeRelatorios = [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.APROVADOR, PERFIS.FINANCEIRO].includes(perfil)
  const podeConfig     = [PERFIS.SUPREMO, PERFIS.GESTOR].includes(perfil)

  const _isDark    = !document.documentElement.classList.contains('light')
  const _iconTema  = _isDark
    ? `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`
  const _titleTema = _isDark ? 'Mudar para modo claro' : 'Mudar para modo escuro'

  const navPrincipal = modoConfig ? '' : `
    <a class="nav-link ${telaAtiva === 'pedidos'    ? 'active' : ''}" href="?tela=pedidos"    onclick="event.preventDefault();window.__navegar('pedidos')">${t('navPedidos')}</a>
    ${podeRelatorios ? `<a class="nav-link ${telaAtiva === 'relatorios' ? 'active' : ''}" href="?tela=relatorios" onclick="event.preventDefault();window.__navegar('relatorios')">${t('navRelatorios')}</a>` : ''}
  `

  const navConfig = modoConfig ? `
    <a class="nav-link ${telaAtiva === 'config-usuarios'  ? 'active' : ''}" href="?tela=config-usuarios"  onclick="event.preventDefault();window.__navegar('config-usuarios')">Usuários</a>
    <a class="nav-link ${telaAtiva === 'config-cadastros' ? 'active' : ''}" href="?tela=config-cadastros" onclick="event.preventDefault();window.__navegar('config-cadastros')">Cadastros</a>
    <a class="nav-link ${telaAtiva === 'config-geral'     ? 'active' : ''}" href="?tela=config-geral"     onclick="event.preventDefault();window.__navegar('config-geral')">Geral</a>
  ` : ''

  return `
    <nav class="topbar" data-mode="${modoConfig ? 'config' : 'main'}">
      <a class="topbar-logo" href="?tela=pedidos" onclick="event.preventDefault();window.__navegar('pedidos')">
        PR<span class="delta">▲</span>XIS
      </a>

      <div class="topbar-nav">
        ${navPrincipal}
        ${navConfig}
      </div>

      <div class="topbar-actions">
        <!-- Command Palette -->
        <button class="topbar-icon-btn" id="btn-cmd-palette" aria-label="${t('tooltipPaleta')}" data-tooltip="${t('tooltipPaleta')}">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>

        <!-- Notificações -->
        <div style="position:relative" id="notif-wrap">
          <button class="topbar-icon-btn" id="btn-notif" aria-label="${t('tooltipNotificacoes')}" data-tooltip="${t('tooltipNotificacoes')}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span class="notif-badge" id="notif-count" style="display:none" aria-live="polite">0</span>
          </button>
          <div class="notif-dropdown" id="notif-dropdown" role="dialog" aria-label="Painel de notificações"></div>
        </div>

        <!-- Tema -->
        <button class="topbar-icon-btn" id="btn-tema" aria-label="${_titleTema}" data-tooltip="${_titleTema}">${_iconTema}</button>

        <!-- Configurações -->
        ${podeConfig ? `
          <button class="topbar-icon-btn ${modoConfig ? 'active' : ''}" id="btn-config" aria-label="${modoConfig ? t('tooltipFecharConfig') : t('navConfiguracoes')}" data-tooltip="${modoConfig ? t('tooltipFecharConfig') : t('navConfiguracoes')}">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">${modoConfig
              ? `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`
              : `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>`
            }</svg>
          </button>
        ` : ''}

        <!-- Avatar -->
        <div class="avatar avatar-md" aria-label="${usuario.nome}" data-tooltip="${t('tooltipSair')}" style="cursor:pointer" id="btn-avatar" tabindex="0" role="button">
          ${iniciais}
        </div>

        <!-- Hamburger mobile -->
        <button class="topbar-icon-btn topbar-hamburger" id="btn-hamburger" aria-label="${t('tooltipMenu')}" data-tooltip="${t('tooltipMenu')}">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
    </nav>
  `
}

export function initTopbarEvents(modoConfig = false) {
  const { toggleTheme, initMobileMenu, desenharEstrelas: de } = window.__praxisUI || {}

  // Command Palette
  document.getElementById('btn-cmd-palette')?.addEventListener('click', () => {
    abrirCommandPalette()
  })

  // Tema
  document.getElementById('btn-tema')?.addEventListener('click', () => {
    import('./ui.js').then(({ toggleTheme: tt }) => {
      tt() // toggleTheme já chama desenharEstrelas internamente
      _syncIconeTema()
    })
  })

  // Config
  document.getElementById('btn-config')?.addEventListener('click', () => {
    if (modoConfig) {
      navegar('pedidos')
    } else {
      navegar('config-usuarios')
    }
  })

  // Avatar → logout
  document.getElementById('btn-avatar')?.addEventListener('click', async () => {
    const { prxConfirm } = await import('./ui.js')
    const ok = await prxConfirm(t('confirmarSair'), '', t('navSair'), t('btnCancelar'))
    if (ok) fazerLogout()
  })

  // Notificações
  document.getElementById('btn-notif')?.addEventListener('click', () => {
    document.getElementById('notif-dropdown')?.classList.toggle('open')
  })

  document.addEventListener('click', e => {
    const wrap = document.getElementById('notif-wrap')
    if (wrap && !wrap.contains(e.target)) {
      document.getElementById('notif-dropdown')?.classList.remove('open')
    }
  })

  // Mobile menu
  document.getElementById('btn-hamburger')?.addEventListener('click', () => {
    _toggleMobileMenu(modoConfig)
  })

  // Inicializa ícone de tema
  _syncIconeTema()

  // Bottom nav mobile
  _renderBottomNav()
}

function _syncIconeTema() {
  const dark = !document.documentElement.classList.contains('light')
  const btn  = document.getElementById('btn-tema')
  if (!btn) return
  btn.innerHTML = dark
    ? `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`
    : `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`
}

function _toggleMobileMenu(modoConfig) {
  const perfil = sessao.usuario?.perfil
  const podeRelatorios = [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.APROVADOR, PERFIS.FINANCEIRO].includes(perfil)
  const podeConfig     = [PERFIS.SUPREMO, PERFIS.GESTOR].includes(perfil)
  const tela = new URLSearchParams(window.location.search).get('tela') || 'pedidos'

  let existing = document.getElementById('mobile-menu')
  if (existing) { existing.remove(); return }

  const menu = document.createElement('div')
  menu.id = 'mobile-menu'
  menu.className = 'mobile-menu'
  menu.innerHTML = `
    <button class="mobile-nav-link ${tela === 'pedidos' ? 'active' : ''}" data-nav="pedidos">${t('navPedidos')}</button>
    ${podeRelatorios ? `<button class="mobile-nav-link ${tela === 'relatorios' ? 'active' : ''}" data-nav="relatorios">${t('navRelatorios')}</button>` : ''}
    ${podeConfig ? `<button class="mobile-nav-link ${['config-usuarios','config-cadastros','config-geral'].includes(tela) ? 'active' : ''}" data-nav="config-usuarios">${t('navConfiguracoes')}</button>` : ''}
    <hr style="border-color:var(--line);margin:0.5rem 0">
    <button class="mobile-nav-link" id="mobile-logout">${t('navSair')}</button>
  `

  document.body.appendChild(menu)

  menu.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      menu.remove()
      navegar(btn.dataset.nav)
    })
  })

  document.getElementById('mobile-logout')?.addEventListener('click', async () => {
    menu.remove()
    const { prxConfirm } = await import('./ui.js')
    const ok = await prxConfirm(t('confirmarSair'), '', t('navSair'), t('btnCancelar'))
    if (ok) fazerLogout()
  })

  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!menu.contains(e.target) && e.target.id !== 'btn-hamburger') {
        menu.remove()
        document.removeEventListener('click', handler)
      }
    })
  }, 50)
}

// ── Footer ────────────────────────────────────────────────────
export function renderFooter() {
  return `
    <footer class="main-footer">
      <div style="display:flex;align-items:baseline">
        <span class="pf-afn" style="font-size:10px">AFN</span>
        <span class="pf-gap"></span>
        <span class="pf-sys" style="font-size:10px">SYSTEMS</span>
      </div>
      <span class="pf-pipe" style="font-size:13px">|</span>
      <span class="pf-info" style="font-size:11px">Praxis</span>
    </footer>
  `
}

// Expõe navegar globalmente para uso em onclick inline do HTML
window.__navegar = navegar

// ── Bottom Navigation Bar (mobile) ───────────────────────────
function _renderBottomNav() {
  const { usuario } = sessao
  if (!usuario) { document.getElementById('bottom-nav')?.remove(); return }

  const perfil         = usuario.perfil
  const podeRelatorios = [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.APROVADOR, PERFIS.FINANCEIRO].includes(perfil)
  const podeConfig     = [PERFIS.SUPREMO, PERFIS.GESTOR].includes(perfil)
  const tela           = new URLSearchParams(window.location.search).get('tela') || 'pedidos'
  const isConfig       = ['config-usuarios','config-cadastros','config-geral'].includes(tela)

  let nav = document.getElementById('bottom-nav')
  if (!nav) {
    nav = document.createElement('nav')
    nav.id = 'bottom-nav'
    nav.className = 'bottom-nav'
    nav.setAttribute('aria-label', 'Navegação principal')
    document.body.appendChild(nav)
  }

  nav.innerHTML = `
    <button class="bottom-nav-item ${tela === 'pedidos' ? 'active' : ''}" data-bnav="pedidos">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
      <span>${t('navPedidos')}</span>
    </button>
    ${podeRelatorios ? `
    <button class="bottom-nav-item ${tela === 'relatorios' ? 'active' : ''}" data-bnav="relatorios">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <span>${t('navRelatorios')}</span>
    </button>` : ''}
    ${podeConfig ? `
    <button class="bottom-nav-item ${isConfig ? 'active' : ''}" data-bnav="config-usuarios">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
      </svg>
      <span>${t('navConfiguracoes')}</span>
    </button>` : ''}
    <button class="bottom-nav-item" id="bnav-sair">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
        <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      <span>${t('navSair')}</span>
    </button>
  `

  nav.querySelectorAll('[data-bnav]').forEach(btn => {
    btn.addEventListener('click', () => navegar(btn.dataset.bnav))
  })
  document.getElementById('bnav-sair')?.addEventListener('click', async () => {
    const { prxConfirm } = await import('./ui.js')
    const ok = await prxConfirm(t('confirmarSair'), '', t('navSair'), t('btnCancelar'))
    if (ok) fazerLogout()
  })
}
