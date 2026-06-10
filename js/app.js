import { auth, onAuthStateChanged } from './firebase.js'
import { initTheme, desenharEstrelas, mostrarSpinner, esconderSpinner } from './ui.js'
import { renderLogin, carregarUsuario, fazerLogout } from './auth.js'
import { renderPedidos } from './pedidos.js'
import { renderDetalhe } from './pedido-detalhe.js'
import { renderRelatorios } from './relatorios.js'
import { renderConfigUsuarios } from './config-usuarios.js'
import { renderConfigCadastros } from './config-cadastros.js'
import { renderConfigGeral } from './config-geral.js'
import {
  STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR,
  PERFIS, PERFIS_LABEL, PERFIS_COLOR,
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

// ── Boot ─────────────────────────────────────────────────────
initTheme()
_iniciarCanvas()

onAuthStateChanged(auth, async (fireUser) => {
  esconderSpinner()

  if (!fireUser) {
    sessao.usuario  = null
    sessao.fireUser = null
    sessao.isDemo   = false
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
  const params = new URLSearchParams(window.location.search)
  const tela   = params.get('tela') || 'pedidos'
  const id     = params.get('id')

  // Guarda de rota por perfil
  const bloqueadoFinanc = ['config-usuarios', 'config-cadastros', 'config-geral']
  const bloqueadoSolic  = ['relatorios', 'config-usuarios', 'config-cadastros', 'config-geral']
  const bloqueadoCompr  = ['relatorios', 'config-usuarios', 'config-cadastros', 'config-geral']
  const perfil          = sessao.usuario?.perfil

  const bloqueado = (
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
    default:               return renderPedidos()
  }
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
  const { PERFIS } = window.__praxisConst
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
    <a class="nav-link ${telaAtiva === 'pedidos'    ? 'active' : ''}" href="?tela=pedidos"    onclick="event.preventDefault();window.__navegar('pedidos')">Pedidos</a>
    ${podeRelatorios ? `<a class="nav-link ${telaAtiva === 'relatorios' ? 'active' : ''}" href="?tela=relatorios" onclick="event.preventDefault();window.__navegar('relatorios')">Relatórios</a>` : ''}
  `

  const navConfig = modoConfig ? `
    <a class="nav-link ${telaAtiva === 'config-usuarios'  ? 'active' : ''}" href="?tela=config-usuarios"  onclick="event.preventDefault();window.__navegar('config-usuarios')">Usuários</a>
    <a class="nav-link ${telaAtiva === 'config-cadastros' ? 'active' : ''}" href="?tela=config-cadastros" onclick="event.preventDefault();window.__navegar('config-cadastros')">Cadastros</a>
    <a class="nav-link ${telaAtiva === 'config-geral'     ? 'active' : ''}" href="?tela=config-geral"     onclick="event.preventDefault();window.__navegar('config-geral')">Geral</a>
  ` : ''

  return `
    <nav class="topbar">
      <a class="topbar-logo" href="?tela=pedidos" onclick="event.preventDefault();window.__navegar('pedidos')">
        PR<span class="delta">▲</span>XIS
      </a>

      <div class="topbar-nav">
        ${navPrincipal}
        ${navConfig}
      </div>

      <div class="topbar-actions">
        <!-- Notificações -->
        <div style="position:relative" id="notif-wrap">
          <button class="topbar-icon-btn" id="btn-notif" title="Notificações">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
            <span class="notif-badge" id="notif-count" style="display:none">0</span>
          </button>
          <div class="notif-dropdown" id="notif-dropdown"></div>
        </div>

        <!-- Tema -->
        <button class="topbar-icon-btn" id="btn-tema" title="${_titleTema}">${_iconTema}</button>

        <!-- Configurações -->
        ${podeConfig ? `
          <button class="topbar-icon-btn ${modoConfig ? 'active' : ''}" id="btn-config" title="${modoConfig ? 'Fechar configurações' : 'Configurações'}">
            ${modoConfig
              ? `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
              : `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`
            }
          </button>
        ` : ''}

        <!-- Avatar -->
        <div class="avatar avatar-md" title="${usuario.nome}" style="cursor:pointer" id="btn-avatar">
          ${iniciais}
        </div>

        <!-- Hamburger mobile -->
        <button class="topbar-icon-btn topbar-hamburger" id="btn-hamburger" title="Menu">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>
    </nav>
  `
}

export function initTopbarEvents(modoConfig = false) {
  const { toggleTheme, initMobileMenu, desenharEstrelas: de } = window.__praxisUI || {}

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
    const ok = await prxConfirm('Sair do sistema?', '', 'Sair', 'Cancelar')
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
  const { PERFIS } = window.__praxisConst
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
    <button class="mobile-nav-link ${tela === 'pedidos' ? 'active' : ''}" data-nav="pedidos">Pedidos</button>
    ${podeRelatorios ? `<button class="mobile-nav-link ${tela === 'relatorios' ? 'active' : ''}" data-nav="relatorios">Relatórios</button>` : ''}
    ${podeConfig ? `<button class="mobile-nav-link ${['config-usuarios','config-cadastros','config-geral'].includes(tela) ? 'active' : ''}" data-nav="config-usuarios">Configurações</button>` : ''}
    <hr style="border-color:var(--line);margin:0.5rem 0">
    <button class="mobile-nav-link" id="mobile-logout">Sair</button>
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
    const ok = await prxConfirm('Sair do sistema?', '', 'Sair', 'Cancelar')
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
