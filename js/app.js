import { auth, onAuthStateChanged, functions, httpsCallable } from './firebase.js'
import { initTheme, mostrarCeu, mostrarSpinner, esconderSpinner, mostrarDemoBanner, initOfflineWatcher, initCommandPalette, abrirCommandPalette, marcaPraxis, simboloPraxis } from './ui.js'
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
import { iniciarCamposData } from './campo-data.js'

// Expõe constantes para ui.js (evita circular imports em renderizações)
window.__praxisConst = { STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR, PERFIS_LABEL, PERFIS_COLOR }
window.__praxisUtils = { gerarIniciais }

// Estado global da sessão
export const sessao = {
  usuario:   null,  // documento do Firestore
  fireUser:  null,  // FirebaseUser
  isDemo:    false,
  // Barra lateral: contadores e nomes conhecidos (as telas vão preenchendo)
  lateral:   { contagens: {}, filtroPedidos: 'todos' },
}
// Leitura do perfil pela paleta de comandos (ui.js não importa app.js)
window.__praxisSessao = sessao

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
initOfflineWatcher()
iniciarCamposData()
initCommandPalette()

onAuthStateChanged(auth, async (fireUser) => {
  esconderSpinner()

  if (!fireUser) {
    _limparTudo()
    sessao.usuario  = null
    sessao.fireUser = null
    sessao.isDemo   = false
    sessao.lateral  = { contagens: {}, filtroPedidos: 'todos' }
    try { sessionStorage.removeItem('praxis_lateral_contagens') } catch {}
    mostrarDemoBanner(false)
    document.getElementById('bottom-nav')?.remove()
    document.getElementById('notif-fundo')?.remove()
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

    mostrarCeu(false)
    mostrarDemoBanner(sessao.isDemo)
    _rotear()
  } catch (err) {
    console.error(err)
    await fazerLogout()
  } finally {
    esconderSpinner()
  }
})

// ── Roteamento ────────────────────────────────────────────────
export function navegar(tela, params = {}, { substituir = false } = {}) {
  const url = new URL(window.location)
  url.searchParams.set('tela', tela)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  // Limpa params não fornecidos (são de uma tela só)
  ;['id', 'aba', 'filtro'].forEach(p => { if (!(p in params)) url.searchParams.delete(p) })
  if (substituir) window.history.replaceState({}, '', url)
  else window.history.pushState({}, '', url)
  _rotear()
}

window.addEventListener('popstate', () => {
  if (sessao.usuario) _rotear()
})

const TELAS_CONFIG = ['config-usuarios', 'config-cadastros', 'config-geral']

// Quem pode ver o quê (usado na guarda de rota, na topbar e na barra inferior)
function _acessos(perfil = sessao.usuario?.perfil) {
  return {
    relatorios: [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.APROVADOR, PERFIS.FINANCEIRO].includes(perfil),
    config:     [PERFIS.SUPREMO, PERFIS.GESTOR].includes(perfil),
  }
}

function _rotear() {
  _limparTudo() // cancela listeners da view anterior (2.13)
  _fecharMenuUsuario(false)
  _fecharNotificacoes()

  const params = new URLSearchParams(window.location.search)
  const tela   = params.get('tela') || 'pedidos'
  const id     = params.get('id')

  // Guarda de rota por perfil: troca o endereço (sem deixar a tela bloqueada
  // no histórico, senão o "voltar" cairia nela de novo) e avisa
  const pode = _acessos()
  const bloqueado = (tela === 'relatorios' && !pode.relatorios) || (TELAS_CONFIG.includes(tela) && !pode.config)
  if (bloqueado) {
    navegar('pedidos', {}, { substituir: true })
    import('./ui.js').then(({ prxToast }) => prxToast(t('semAcessoTela'), 'info'))
    return
  }

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

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function _render404(tela) {
  const app = document.getElementById('app')
  const nomeTela = _esc(String(tela).slice(0, 60))
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('')}
      <main class="main-content pagina-404">
        <section class="p404" aria-labelledby="p404-titulo">
          <div class="p404-topo">
            <span class="p404-codigo numeral" aria-hidden="true">404</span>
            ${simboloPraxis(64, 'p404-simbolo')}
          </div>
          <h1 class="p404-titulo" id="p404-titulo">${t('pagina404Titulo')}</h1>
          <p class="p404-texto">${t('pagina404Texto').replace('{tela}', `<code>${nomeTela}</code>`)}</p>
          <button type="button" class="btn-primary" id="btn-404-voltar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            ${t('pagina404Botao')}
          </button>
        </section>
      </main>
      ${renderFooter()}
    </div>
  `
  document.getElementById('btn-404-voltar')?.addEventListener('click', () => navegar('pedidos'))
  initTopbarEvents(false)
  import('./notificacoes.js').then(m => m.renderNotificacoes()).catch(() => {})
}

// ── Ícones da moldura (mesmo traço: stroke 2, 16–18px) ───────
const _ico = (corpo, tam = 16) => `<svg width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`
const ICO = {
  busca:   (n) => _ico('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', n),
  sino:    (n) => _ico('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>', n),
  engren:  (n) => _ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>', n),
  fechar:  (n) => _ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', n),
  quadro:  (n) => _ico('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', n),
  barras:  (n) => _ico('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', n),
  sol:     (n) => _ico('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>', n),
  lua:     (n) => _ico('<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>', n),
  sair:    (n) => _ico('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', n),
  setas:   (n) => _ico('<polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/>', n),
  ajustes: (n) => _ico('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', n),
  comando: (n) => _ico('<path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/>', n),
}

const _ehMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
const _atalhoBusca = _ehMac ? '⌘K' : 'Ctrl K'

// ── Barra lateral ─────────────────────────────────────────────
// Desenho da Inscrição: letreiro no alto, itens em texto com o contador em
// numeral à direita, o grupo de cadastros separado por um fio e, no pé, a
// conta (só o nome). Busca e empresa ficam nas próprias telas, não aqui:
// nada aparece duas vezes. No celular ela vira uma faixa no topo (marca e
// notificações) e a navegação passa para a barra inferior.
//
// Chaves dos itens: pedidos, fila, relatorios, cad-empresas, cad-categorias,
// cad-fornecedores, usuarios, config-geral. As telas atualizam contadores e
// o item ativo por atualizarLateral().

function _itemAtivo(telaAtiva) {
  const params = new URLSearchParams(window.location.search)
  if (telaAtiva === 'pedidos') {
    const filtro = params.get('filtro') || sessao.lateral.filtroPedidos
    return filtro === 'pendentes' ? 'fila' : 'pedidos'
  }
  if (telaAtiva === 'config-cadastros') return `cad-${params.get('aba') || 'empresas'}`
  if (telaAtiva === 'config-usuarios') return 'usuarios'
  return telaAtiva
}

// Os contadores ficam guardados na sessão do navegador: ao recarregar uma tela
// que não os calcula (detalhe, relatórios), a barra mostra os últimos vistos
const _CHAVE_CONTAGENS = 'praxis_lateral_contagens'
function _carregarContagens() {
  if (Object.keys(sessao.lateral.contagens).length) return
  try { Object.assign(sessao.lateral.contagens, JSON.parse(sessionStorage.getItem(_CHAVE_CONTAGENS) || '{}')) } catch {}
}

function _contador(chave) {
  const n = sessao.lateral.contagens[chave]
  return Number.isFinite(n) ? String(n) : ''
}

export function renderTopbar(telaAtiva, modoConfig = false) {
  const { usuario } = sessao
  if (!usuario) return ''

  const pode  = _acessos(usuario.perfil)
  const ativo = _itemAtivo(telaAtiva)
  _carregarContagens()

  const item = (chave, tela, rotulo, extra = {}) => {
    const qs = new URLSearchParams({ tela, ...extra }).toString()
    const dados = Object.entries(extra).map(([k, v]) => `data-${k}="${v}"`).join(' ')
    const on = ativo === chave
    return `<a class="lateral-item ${on ? 'active' : ''}" href="?${qs}" data-nav="${tela}" data-item="${chave}" ${dados} ${on ? 'aria-current="page"' : ''}><span class="lateral-item-rotulo">${rotulo}</span><span class="lateral-n" data-n="${chave}">${_contador(chave)}</span></a>`
  }

  return `
    <aside class="lateral" data-mode="${modoConfig ? 'config' : 'main'}">
      <div class="lateral-topo">
        <a class="lateral-marca" href="?tela=pedidos&filtro=todos" data-nav="pedidos" data-filtro="todos" aria-label="Praxis: ${t('navPedidos')}">${marcaPraxis()}</a>
        <div class="notif-wrap" id="notif-wrap">
          <button type="button" class="lateral-icone" id="btn-notif" aria-label="${t('tooltipNotificacoes')}" aria-haspopup="dialog" aria-expanded="false" aria-controls="notif-dropdown" data-tooltip="${t('tooltipNotificacoes')}">
            ${ICO.sino(17)}
            <span class="notif-badge" id="notif-count" style="display:none" aria-hidden="true">0</span>
          </button>
          <div class="notif-dropdown" id="notif-dropdown" role="dialog" aria-label="${t('tooltipNotificacoes')}"></div>
        </div>
      </div>

      <nav class="lateral-nav" aria-label="${t('navNavegacao')}">
        ${item('pedidos', 'pedidos', t('navPedidos'), { filtro: 'todos' })}
        ${item('fila', 'pedidos', t('navMinhaFila'), { filtro: 'pendentes' })}
        ${pode.relatorios ? item('relatorios', 'relatorios', t('navRelatorios')) : ''}
        ${pode.config ? `
        <div class="lateral-grupo" id="lateral-cadastros" role="group" aria-labelledby="lateral-cadastros-rotulo">
          <span class="lateral-grupo-rotulo" id="lateral-cadastros-rotulo">${t('navCadastros')}</span>
          ${item('cad-empresas', 'config-cadastros', t('secaoEmpresas'), { aba: 'empresas' })}
          ${item('cad-categorias', 'config-cadastros', t('secaoCategorias'), { aba: 'categorias' })}
          ${item('cad-fornecedores', 'config-cadastros', t('secaoFornecedores'), { aba: 'fornecedores' })}
          ${item('usuarios', 'config-usuarios', t('configUsuarios'))}
          ${item('config-geral', 'config-geral', t('navAjustes'))}
        </div>` : ''}
      </nav>

      <div class="lateral-rodape">
        <button type="button" class="lateral-conta" id="btn-avatar" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu" aria-label="${t('tooltipConta')}: ${_esc(usuario.nome)}">
          <span class="lateral-conta-nome">${_esc(usuario.nome)}</span>
          ${ICO.setas(14)}
        </button>
      </div>
    </aside>
  `
}

// Atualiza a barra lateral sem redesenhar a tela.
//   contagens:     { pedidos, fila, relatorios, 'cad-empresas', 'cad-categorias', 'cad-fornecedores', usuarios }
//   filtroPedidos: pill ativa na tela de pedidos ('pendentes' acende "Minha fila")
//   ativo:         chave do item a destacar
export function atualizarLateral({ contagens, filtroPedidos, ativo } = {}) {
  if (contagens) {
    Object.assign(sessao.lateral.contagens, contagens)
    try { sessionStorage.setItem(_CHAVE_CONTAGENS, JSON.stringify(sessao.lateral.contagens)) } catch {}
  }
  if (filtroPedidos) sessao.lateral.filtroPedidos = filtroPedidos
  const raiz = document.querySelector('.lateral')
  if (!raiz) return
  if (contagens) {
    for (const chave of Object.keys(contagens)) {
      raiz.querySelectorAll(`[data-n="${chave}"]`).forEach(el => { el.textContent = _contador(chave) })
    }
  }
  const chave = ativo || (filtroPedidos ? (filtroPedidos === 'pendentes' ? 'fila' : 'pedidos') : null)
  if (chave) {
    raiz.querySelectorAll('.lateral-item').forEach(a => {
      const on = a.dataset.item === chave
      a.classList.toggle('active', on)
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current')
    })
  }
}

// A tela de pedidos registra aqui como trocar de filtro sem refazer a tela
// (clicar em "Pedidos" ou "Minha fila" estando nela). Limpo a cada troca de tela.
let _trocarFiltroPedidos = null
export function registrarFiltroLateral(fn) {
  _trocarFiltroPedidos = fn
  registrarLimpador(() => { if (_trocarFiltroPedidos === fn) _trocarFiltroPedidos = null })
}

// Listeners de documento: registrados uma vez só (antes cada renderização
// da topbar somava um listener novo de clique no documento)
let _docListeners = false
function _registrarListenersDocumento() {
  if (_docListeners) return
  _docListeners = true

  document.addEventListener('click', e => {
    const wrap = document.getElementById('notif-wrap')
    if (_notifPainel && !_notifPainel.contains(e.target) && !wrap?.contains(e.target)) _fecharNotificacoes()
    const menu = document.getElementById('user-menu')
    if (menu?.classList.contains('open') && !menu.contains(e.target) && !e.target.closest('#btn-avatar, #bnav-conta')) {
      _fecharMenuUsuario(false)
    }
  })

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (document.getElementById('user-menu')?.classList.contains('open')) {
      e.stopImmediatePropagation()
      _fecharMenuUsuario(true)
      return
    }
    if (_notifPainel) {
      e.stopImmediatePropagation()
      _fecharNotificacoes()
      document.getElementById('btn-notif')?.focus()
    }
  }, true)

  window.addEventListener('resize', () => {
    _fecharMenuUsuario(false)
    if (_notifPainel) {
      _posicionarNotificacoes()
      _fundoNotificacoes(false)
      _fundoNotificacoes(true)
    }
  })
}

export function initTopbarEvents(modoConfig = false) {
  _registrarListenersDocumento()

  // Links da barra lateral (marca e itens) — navegação sem recarregar
  document.querySelectorAll('.lateral [data-nav]').forEach(a => {
    a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return
      e.preventDefault()
      const tela = a.dataset.nav
      const params = {}
      if (a.dataset.filtro) params.filtro = a.dataset.filtro
      if (a.dataset.aba) params.aba = a.dataset.aba
      const telaAtual = new URLSearchParams(window.location.search).get('tela') || 'pedidos'
      // Já na tela de pedidos: só troca o filtro, sem refazer a tela
      if (tela === 'pedidos' && telaAtual === 'pedidos' && _trocarFiltroPedidos) {
        _trocarFiltroPedidos(params.filtro || 'todos')
        return
      }
      navegar(tela, params)
    })
  })

  document.getElementById('btn-cmd-palette')?.addEventListener('click', () => abrirCommandPalette())

  document.getElementById('btn-avatar')?.addEventListener('click', e => {
    e.stopPropagation()
    _alternarMenuUsuario(e.currentTarget)
  })

  document.getElementById('btn-notif')?.addEventListener('click', e => {
    if (_notifPainel) { _fecharNotificacoes(); return }
    _abrirNotificacoes(e.detail === 0)
  })

  _renderBottomNav()
}

// O painel mora no sino, mas abre pendurado no <body>: assim o position:fixed
// vale para a janela (no celular a faixa do topo tem backdrop-filter, que
// prenderia o painel nela) e ele fica acima do fundo escuro e da barra
// inferior. Ao fechar, volta para o sino (ou some, se a tela já mudou).
let _notifPainel = null
let _notifCasa = null

function _abrirNotificacoes(peloTeclado = false) {
  const dd = document.getElementById('notif-dropdown')
  if (!dd) return
  _fecharMenuUsuario(false)
  _notifCasa = dd.parentElement
  _notifPainel = dd
  document.body.appendChild(dd)
  dd.classList.add('open')
  _posicionarNotificacoes()
  _fundoNotificacoes(true)
  document.getElementById('btn-notif')?.setAttribute('aria-expanded', 'true')
  // Pelo teclado, o foco entra no painel (Tab circula dentro, Esc devolve ao sino)
  if (peloTeclado) {
    dd.tabIndex = -1
    setTimeout(() => (dd.querySelector('button') || dd).focus({ preventScroll: true }), 30)
  }
  if (!dd._prenderTab) {
    dd._prenderTab = true
    dd.addEventListener('keydown', ev => {
      if (ev.key !== 'Tab') return
      const els = [...dd.querySelectorAll('button')]
      if (!els.length) { ev.preventDefault(); return }
      const i = els.indexOf(document.activeElement)
      ev.preventDefault()
      els[ev.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length].focus()
    })
  }
}

function _fecharNotificacoes() {
  _fundoNotificacoes(false)
  const dd = _notifPainel
  if (!dd) return
  dd.classList.remove('open')
  if (_notifCasa?.isConnected) _notifCasa.appendChild(dd)
  else dd.remove()
  _notifPainel = null
  _notifCasa = null
  document.getElementById('btn-notif')?.setAttribute('aria-expanded', 'false')
}

// Celular: o resto da tela escurece abaixo do painel (a faixa do topo, com o
// sino, continua tocável). Tocar no escuro só fecha o painel.
function _fundoNotificacoes(mostrar) {
  let fundo = document.getElementById('notif-fundo')
  if (!mostrar) { if (fundo) fundo.hidden = true; return }
  if (!window.matchMedia('(max-width: 767px)').matches) return
  if (!fundo) {
    fundo = document.createElement('div')
    fundo.id = 'notif-fundo'
    fundo.className = 'notif-fundo'
    fundo.setAttribute('aria-hidden', 'true')
    document.body.appendChild(fundo)
  }
  const topo = document.getElementById('notif-dropdown')?.style.getPropertyValue('--notif-top')
  if (topo) fundo.style.setProperty('--notif-top', topo)
  fundo.hidden = false
}

// O painel abre preso ao sino. No computador sai da barra lateral para a
// direita, com o fio do alto na altura do sino; no celular desce rente à
// faixa do topo, na largura toda (o CSS cuida das laterais)
function _posicionarNotificacoes() {
  const dd = document.getElementById('notif-dropdown')
  const btn = document.getElementById('btn-notif')
  if (!dd || !btn) return
  const r = btn.getBoundingClientRect()
  const lateral = document.querySelector('.lateral')?.getBoundingClientRect()
  const movel = window.matchMedia('(max-width: 767px)').matches
  if (movel) {
    dd.style.setProperty('--notif-top', `${Math.round(lateral?.bottom ?? r.bottom)}px`)
    dd.style.setProperty('--notif-left', '0px')
    return
  }
  const largura = dd.offsetWidth || 384
  const esquerda = Math.round((lateral?.right ?? r.right) + 10)
  dd.style.setProperty('--notif-top', `${Math.max(8, Math.round(r.top - 2))}px`)
  dd.style.setProperty('--notif-left', `${Math.max(12, Math.min(esquerda, window.innerWidth - largura - 12))}px`)
}

// ── Menu do usuário ───────────────────────────────────────────
// Desktop: menu suspenso preso ao avatar. Celular: folha que sobe de baixo,
// aberta pelo item "Conta" da barra inferior.
// Cabeçalho tipográfico (nome, e-mail e, abaixo de um fio tracejado como o
// pé dos cartões do quadro, o perfil com o ponto da cor dele); depois as ações.
const _PONTO_PERFIL = { gold: 'dot-gold', green: 'dot-green', blue: 'dot-blue', red: 'dot-red' }
function _menuUsuarioHTML() {
  const { usuario } = sessao
  const claro = document.documentElement.classList.contains('light')
  const perfil = usuario.perfil
  const ponto = _PONTO_PERFIL[PERFIS_COLOR[perfil]] || 'dot-gray'
  return `
    <div class="um-cabecalho">
      <div class="um-nome">${_esc(usuario.nome)}</div>
      <div class="um-email">${_esc(usuario.email || '')}</div>
      <div class="um-perfil">
        <span class="um-perfil-rotulo">${t('menuPerfil')}</span>
        <span class="um-perfil-valor"><span class="dot ${ponto}" aria-hidden="true"></span>${_esc(PERFIS_LABEL[perfil] || perfil)}</span>
      </div>
    </div>
    <div class="um-sep" role="separator"></div>
    <button type="button" class="um-item" role="menuitem" data-acao="tema">
      ${claro ? ICO.lua(16) : ICO.sol(16)}
      <span>${claro ? t('menuTemaEscuro') : t('menuTemaClaro')}</span>
    </button>
    ${_acessos(perfil).config ? `
    <button type="button" class="um-item" role="menuitem" data-acao="ajustes">
      ${ICO.ajustes(16)}
      <span>${t('navAjustes')}</span>
    </button>` : ''}
    <button type="button" class="um-item um-so-desktop" role="menuitem" data-acao="buscar">
      ${ICO.busca(16)}
      <span>${t('menuAtalhos')}</span>
      <kbd>${_atalhoBusca}</kbd>
    </button>
    <div class="um-sep" role="separator"></div>
    <button type="button" class="um-item um-sair" role="menuitem" data-acao="sair">
      ${ICO.sair(16)}
      <span>${t('navSair')}</span>
    </button>
  `
}

function _garantirMenuUsuario() {
  let menu = document.getElementById('user-menu')
  if (menu) return menu
  const fundo = document.createElement('div')
  fundo.id = 'user-menu-fundo'
  fundo.className = 'user-menu-fundo'
  fundo.addEventListener('click', () => _fecharMenuUsuario(false))
  document.body.appendChild(fundo)

  menu = document.createElement('div')
  menu.id = 'user-menu'
  menu.className = 'user-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', t('tooltipConta'))
  menu.addEventListener('click', _acaoMenuUsuario)
  menu.addEventListener('keydown', e => {
    const itens = [...menu.querySelectorAll('.um-item')].filter(b => b.offsetParent !== null)
    const i = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); itens[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); itens.at(-1)?.focus() }
    else if (e.key === 'Tab') { _fecharMenuUsuario(false) }
  })
  document.body.appendChild(menu)
  return menu
}

let _menuGatilho = null

function _alternarMenuUsuario(gatilho) {
  const menu = document.getElementById('user-menu')
  if (menu?.classList.contains('open')) { _fecharMenuUsuario(true); return }
  _abrirMenuUsuario(gatilho)
}

function _abrirMenuUsuario(gatilho) {
  if (!sessao.usuario) return
  _fecharNotificacoes()
  const menu = _garantirMenuUsuario()
  menu.innerHTML = _menuUsuarioHTML()
  _menuGatilho = gatilho || null

  const movel = window.matchMedia('(max-width: 767px)').matches
  menu.classList.toggle('folha', movel)
  menu.style.top = menu.style.right = menu.style.bottom = menu.style.left = ''
  if (!movel && gatilho) {
    // Aberto pela conta no pé da barra lateral: sobe a partir dela
    const r = gatilho.getBoundingClientRect()
    menu.style.left   = `${Math.round(r.left)}px`
    menu.style.bottom = `${Math.round(window.innerHeight - r.top + 8)}px`
  }
  menu.classList.add('open')
  document.getElementById('user-menu-fundo')?.classList.toggle('open', movel)
  document.getElementById('btn-avatar')?.setAttribute('aria-expanded', 'true')
  document.getElementById('bnav-conta')?.setAttribute('aria-expanded', 'true')
  setTimeout(() => menu.querySelector('.um-item')?.focus({ preventScroll: true }), 30)
}

function _fecharMenuUsuario(devolverFoco = true) {
  const menu = document.getElementById('user-menu')
  if (!menu?.classList.contains('open')) return
  menu.classList.remove('open')
  document.getElementById('user-menu-fundo')?.classList.remove('open')
  document.getElementById('btn-avatar')?.setAttribute('aria-expanded', 'false')
  document.getElementById('bnav-conta')?.setAttribute('aria-expanded', 'false')
  if (devolverFoco && _menuGatilho?.isConnected) _menuGatilho.focus()
  _menuGatilho = null
}

async function _acaoMenuUsuario(e) {
  const item = e.target.closest('.um-item')
  if (!item) return
  const acao = item.dataset.acao
  if (acao === 'tema') {
    const { toggleTheme } = await import('./ui.js')
    toggleTheme()
    // Atualiza o texto do item sem fechar: a troca é visível na hora
    const menu = document.getElementById('user-menu')
    if (menu) {
      menu.innerHTML = _menuUsuarioHTML()
      menu.querySelector('[data-acao="tema"]')?.focus({ preventScroll: true })
    }
    return
  }
  if (acao === 'buscar') {
    _fecharMenuUsuario(false)
    abrirCommandPalette()
    return
  }
  if (acao === 'ajustes') {
    _fecharMenuUsuario(false)
    navegar('config-geral')
    return
  }
  if (acao === 'sair') {
    _fecharMenuUsuario(false)
    await confirmarSaida()
  }
}

export async function confirmarSaida() {
  const { prxConfirm } = await import('./ui.js')
  const ok = await prxConfirm(t('confirmarSair'), t('confirmarSairMsg'), t('navSair'), t('btnCancelar'))
  if (ok) fazerLogout()
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

// ── Barra inferior (celular) ──────────────────────────────────
// Pedidos · Relatórios* · Buscar · Ajustes* · Conta   (*conforme o perfil)
function _renderBottomNav() {
  const { usuario } = sessao
  if (!usuario) { document.getElementById('bottom-nav')?.remove(); return }

  const pode     = _acessos(usuario.perfil)
  const tela     = new URLSearchParams(window.location.search).get('tela') || 'pedidos'
  const isConfig = TELAS_CONFIG.includes(tela)
  const ativoPedidos = tela === 'pedidos' || tela === 'detalhe'
  const { gerarIniciais: gi } = window.__praxisUtils

  let nav = document.getElementById('bottom-nav')
  if (!nav) {
    nav = document.createElement('nav')
    nav.id = 'bottom-nav'
    nav.className = 'bottom-nav'
    nav.setAttribute('aria-label', t('navNavegacao'))
    document.body.appendChild(nav)
  }

  const item = (chave, ativo, icone, rotulo) => `
    <button type="button" class="bottom-nav-item ${ativo ? 'active' : ''}" data-bnav="${chave}" ${ativo ? 'aria-current="page"' : ''}>
      ${icone}<span>${rotulo}</span>
    </button>`

  nav.innerHTML = `
    ${item('pedidos', ativoPedidos, ICO.quadro(20), t('navPedidos'))}
    ${pode.relatorios ? item('relatorios', tela === 'relatorios', ICO.barras(20), t('navRelatorios')) : ''}
    <button type="button" class="bottom-nav-item" id="bnav-buscar" aria-label="${t('tooltipPaleta')}">
      ${ICO.busca(20)}<span>${t('navBuscar')}</span>
    </button>
    ${pode.config ? item('config-usuarios', isConfig, ICO.engren(20), t('navAjustes')) : ''}
    <button type="button" class="bottom-nav-item" id="bnav-conta" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu">
      <span class="bnav-avatar" aria-hidden="true">${_esc(gi(usuario.nome))}</span><span>${t('navConta')}</span>
    </button>
  `

  nav.querySelectorAll('[data-bnav]').forEach(btn => {
    btn.addEventListener('click', () => navegar(btn.dataset.bnav))
  })
  document.getElementById('bnav-buscar')?.addEventListener('click', () => abrirCommandPalette())
  document.getElementById('bnav-conta')?.addEventListener('click', e => {
    e.stopPropagation()
    _alternarMenuUsuario(e.currentTarget)
  })
}
