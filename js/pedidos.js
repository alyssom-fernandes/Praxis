import { db, collection, query, where, orderBy, getDocs, onSnapshot, doc, runTransaction, serverTimestamp, updateDoc, addDoc } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, skeletonKanban, skeletonLista, abrirModal, fecharModal, exigirConexao, iniciarTour } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR,
  PERFIS, KANBAN_COLUNAS, CATEGORIAS_PADRAO, UNIDADES, MOTIVOS_CANCELAMENTO, t,
} from './constants.js'
import { formatCurrency, formatDate, gerarIniciais, hojeISO, debounce, normalizarTexto, parseMoeda, calcularSLA, esc } from './utils.js'

let _pedidoFonteDuplicar = null
export function agendarDuplicar(pedido) { _pedidoFonteDuplicar = pedido }

let _unsubPedidos = null
let _pedidos = []
window.__getPedidos = () => _pedidos
let _categorias = []
let _empresas = []
let _usuarios = []
let _viewMode = 'kanban' // 'kanban' | 'lista'
const _LANE_LIMIT = 4
let _filtroAtivo = 'todos'
let _termoBusca = ''
let _filtroCategoria = ''
let _filtroEmpresa = ''
let _filtroComprador = ''
let _filtroDataIni = ''
let _filtroDataFim = ''
let _ordemCampo = 'criadoEm'
let _ordemDesc = true
let _paginaAtual = 0
const _PAGE_SIZE = 20
let _viewsSalvas = []
const _VIEWS_MAX = 8
let _selecionados = new Set()

// ── Render da tela ────────────────────────────────────────────
export async function renderPedidos() {
  const app = document.getElementById('app')

  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('pedidos')}
      <div class="main-content">
        <div class="pedidos-header">
          <div>
            <h1 class="pedidos-title">${t('titulo')}</h1>
          </div>
          <div class="pedidos-toolbar">
            <div class="filter-pills" id="filter-pills">
              <button class="pill" data-filtro="pendentes">${t('meusPendentes')}</button>
              <button class="pill active" data-filtro="todos">${t('todos')}</button>
              <button class="pill" data-filtro="urgentes">${t('urgentes')}</button>
              <button class="pill" data-filtro="meus">${t('meusPedidos')}</button>
              <button class="pill" data-filtro="semana">${t('estaSemana')}</button>
              <button class="pill" data-filtro="encerrados">${t('encerrados')}</button>
            </div>

            <div class="search-input-wrap" style="width:200px">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="busca-pedidos" placeholder="${t('buscarPedido')}">
            </div>

            <div class="view-toggle" id="view-toggle">
              <button class="active" id="btn-kanban" title="Kanban">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              </button>
              <button id="btn-lista" title="Lista">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
            </div>

            <button class="btn-ghost btn-sm" id="btn-salvar-visao" title="${t('salvarVisao')}">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
              ${t('salvarVisao')}
            </button>

            <button class="btn-primary" id="btn-novo-pedido">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${t('novoPedido')}
            </button>
          </div>
          <div class="pedidos-date-filter" id="pedidos-date-filter">
            <select id="fl-empresa-global" style="display:none">
              <option value="">${t('todasEmpresas')}</option>
            </select>
            <span class="date-filter-label">${t('periodo')}</span>
            <input type="date" id="filtro-data-ini" title="Data inicial">
            <span class="date-filter-sep">–</span>
            <input type="date" id="filtro-data-fim" title="Data final">
            <button class="btn-ghost btn-sm" id="btn-limpar-datas" style="display:none">${t('limpar')}</button>
          </div>
        </div>

        <div id="views-salvas-row" class="pedidos-views-row" style="display:none"></div>
        <div id="pedidos-view">${skeletonKanban(4)}</div>
      </div>
      ${renderFooter()}
    </div>

    <!-- Modal Novo Pedido -->
    <div class="modal-overlay" id="modal-novo-pedido">
      <div class="modal" style="max-width:680px">
        <div class="modal-header">
          <h2>${t('novoPedido')}</h2>
          <button class="btn-icon" data-close-modal title="Fechar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <form id="form-novo-pedido" novalidate>
            <div class="form-grid form-grid-3" style="gap:1rem">
              <div class="form-group col-span-3">
                <label for="np-titulo">${t('npTitulo')} *</label>
                <input type="text" id="np-titulo" placeholder="${t('npTituloPlaceholder')}" required maxlength="120">
              </div>
              <div class="form-group">
                <label for="np-empresa">${t('npEmpresa')} *</label>
                <select id="np-empresa" required><option value="">${t('selecionar')}</option></select>
              </div>
              <div class="form-group">
                <label for="np-quantidade">${t('npQuantidade')} *</label>
                <input type="number" id="np-quantidade" placeholder="1" min="1" required>
              </div>
              <div class="form-group">
                <label for="np-unidade">${t('npUnidade')} *</label>
                <select id="np-unidade" required><option value="">${t('selecionar')}</option></select>
              </div>
              <div class="form-group">
                <label for="np-data">${t('npData')} *</label>
                <input type="date" id="np-data" required min="${hojeISO()}">
              </div>
              <div class="form-group">
                <label for="np-valor">${t('npValor')}</label>
                <input type="text" id="np-valor" placeholder="R$ 0,00">
              </div>
              <div class="form-group">
                <label for="np-cc">${t('npCC')}</label>
                <input type="text" id="np-cc" placeholder="${t('opcional')}" maxlength="60">
              </div>
              <div class="form-group col-span-3">
                <label>${t('npCategoria')} *</label>
                <div class="category-chips" id="np-categorias"></div>
              </div>
              <div class="form-group col-span-3">
                <div class="toggle-wrap" id="np-urgente-wrap" style="padding:0.5rem 0">
                  <div class="toggle" id="np-urgente-toggle"></div>
                  <span class="toggle-label" style="display:flex;align-items:center;gap:0.4rem">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="color:var(--red)">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    ${t('npUrgente')}
                  </span>
                </div>
              </div>
              <div class="form-group col-span-3">
                <label for="np-obs">${t('npObs')}</label>
                <textarea id="np-obs" placeholder="${t('npObsPlaceholder')}" rows="3"></textarea>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('cancelar')}</button>
          <button class="btn-primary" id="btn-abrir-pedido">${t('btnAbrirPedido')}</button>
        </div>
      </div>
    </div>
    <!-- Barra de ações em massa (4.6) -->
    <div class="bulk-bar" id="bulk-bar" style="display:none">
      <span class="bulk-count" id="bulk-count"></span>
      <div class="bulk-bar-actions">
        <button class="btn-ghost btn-sm" id="btn-bulk-export">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          ${t('exportarCSV')}
        </button>
        <button class="btn-ghost btn-sm" id="btn-bulk-cancel" style="display:none">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          ${t('cancelarSelecionados')}
        </button>
      </div>
      <button class="btn-icon" id="btn-bulk-clear" title="${t('desmarcarTudo')}">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <!-- Modal Cancelamento em Massa -->
    <div class="modal-overlay" id="modal-bulk-cancel">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2>${t('cancelarSelecionados')}</h2>
          <button class="btn-icon" data-close-bulk-cancel title="Fechar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p id="bulk-cancel-msg" style="margin-bottom:1rem;font-size:0.875rem;color:var(--text2)"></p>
          <div class="form-group">
            <label for="bulk-motivo">${t('motivoLabel')} *</label>
            <select id="bulk-motivo">
              <option value="">${t('motivoPlaceholder')}</option>
            </select>
          </div>
          <div class="form-group" id="bulk-motivo-outros-wrap" style="display:none">
            <label for="bulk-motivo-outros">${t('motivoOutros')} *</label>
            <textarea id="bulk-motivo-outros" rows="2" maxlength="200" placeholder="${t('motivoOutros')}…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-bulk-cancel>${t('voltar')}</button>
          <button class="btn-primary" id="btn-confirmar-bulk-cancel">${t('confirmarCancelamento')}</button>
        </div>
      </div>
    </div>

    <!-- Modal Salvar Visão -->
    <div class="modal-overlay" id="modal-salvar-visao">
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2>${t('salvarVisao')}</h2>
          <button class="btn-icon" data-close-modal-visao title="Fechar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="visao-nome">${t('nomeVisao')}</label>
            <input type="text" id="visao-nome" placeholder="${t('nomeVisaoPlaceholder')}" maxlength="40" autocomplete="off">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal-visao>${t('cancelar')}</button>
          <button class="btn-primary" id="btn-confirmar-salvar-visao">${t('salvar')}</button>
        </div>
      </div>
    </div>
  `

  initTopbarEvents(false)
  iniciarTour(sessao.isDemo)
  await _carregarDadosAuxiliares()
  _preencherFiltroEmpresaGlobal()
  _preencherModalNovoPedido()
  _bindEvents()
  _carregarViews()
  _renderViewsSalvasRow()

  const fonteDuplicar = _pedidoFonteDuplicar
  _pedidoFonteDuplicar = null
  if (fonteDuplicar) {
    _preencherModalDuplicar(fonteDuplicar)
    abrirModal('modal-novo-pedido')
  }

  _iniciarListenerPedidos()
  renderNotificacoes()
  _initPullToRefresh()
}

// ── Pull-to-refresh (mobile) ──────────────────────────────────
function _initPullToRefresh() {
  document.getElementById('pull-indicator')?.remove()

  const indicator = document.createElement('div')
  indicator.id = 'pull-indicator'
  indicator.className = 'pull-indicator'
  indicator.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
  </svg>`
  document.body.appendChild(indicator)

  let startY = 0
  let pulling = false

  function onTouchStart(e) {
    if (window.scrollY > 2) return
    startY = e.touches[0].clientY
    pulling = true
    indicator.style.transform = ''
  }

  function onTouchMove(e) {
    if (!pulling) return
    const dy = e.touches[0].clientY - startY
    if (dy <= 0) { pulling = false; indicator.classList.remove('visible'); return }
    const clamped = Math.min(dy, 100)
    const offset  = Math.round(clamped * 0.35 - 70)
    indicator.style.transform = `translateX(-50%) translateY(${offset}px)`
    indicator.classList.toggle('visible', dy > 24)
  }

  function onTouchEnd(e) {
    if (!pulling) return
    pulling = false
    const dy = e.changedTouches[0].clientY - startY
    if (dy >= 68) {
      indicator.classList.add('refreshing')
      setTimeout(() => {
        indicator.classList.remove('visible', 'refreshing')
        indicator.style.transform = ''
        window.__navegar('pedidos')
      }, 550)
    } else {
      indicator.classList.remove('visible')
      indicator.style.transform = ''
    }
  }

  const app = document.getElementById('app')
  app.addEventListener('touchstart', onTouchStart, { passive: true })
  app.addEventListener('touchmove',  onTouchMove,  { passive: true })
  app.addEventListener('touchend',   onTouchEnd,   { passive: true })

  registrarLimpador(() => {
    app.removeEventListener('touchstart', onTouchStart)
    app.removeEventListener('touchmove',  onTouchMove)
    app.removeEventListener('touchend',   onTouchEnd)
    document.getElementById('pull-indicator')?.remove()
  })
}

// ── Eventos ───────────────────────────────────────────────────
function _bindEvents() {
  // Filtros
  document.getElementById('filter-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filtro]')
    if (!btn) return
    document.querySelectorAll('#filter-pills .pill').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    _filtroAtivo = btn.dataset.filtro
    _paginaAtual = 0
    _renderView()
  })

  // Busca
  document.getElementById('busca-pedidos')?.addEventListener('input',
    debounce(e => { _termoBusca = e.target.value; _paginaAtual = 0; _renderView() }, 300)
  )

  // Toggle de view
  document.getElementById('btn-kanban')?.addEventListener('click', () => {
    _viewMode = 'kanban'
    document.getElementById('btn-kanban')?.classList.add('active')
    document.getElementById('btn-lista')?.classList.remove('active')
    _renderView()
  })
  document.getElementById('btn-lista')?.addEventListener('click', () => {
    _viewMode = 'lista'
    _paginaAtual = 0
    document.getElementById('btn-lista')?.classList.add('active')
    document.getElementById('btn-kanban')?.classList.remove('active')
    _renderView()
  })

  // Filtro de empresa global (toolbar)
  document.getElementById('fl-empresa-global')?.addEventListener('change', e => {
    _filtroEmpresa = e.target.value
    _paginaAtual = 0
    _renderView()
  })

  // Filtro de data
  const _atualizarBotaoLimparData = () => {
    const btn = document.getElementById('btn-limpar-datas')
    if (btn) btn.style.display = (_filtroDataIni || _filtroDataFim) ? '' : 'none'
  }
  document.getElementById('filtro-data-ini')?.addEventListener('change', e => {
    _filtroDataIni = e.target.value
    _paginaAtual = 0
    _atualizarBotaoLimparData()
    _renderView()
  })
  document.getElementById('filtro-data-fim')?.addEventListener('change', e => {
    _filtroDataFim = e.target.value
    _paginaAtual = 0
    _atualizarBotaoLimparData()
    _renderView()
  })
  document.getElementById('btn-limpar-datas')?.addEventListener('click', () => {
    _filtroDataIni = ''; _filtroDataFim = ''
    const ini = document.getElementById('filtro-data-ini')
    const fim = document.getElementById('filtro-data-fim')
    if (ini) ini.value = ''; if (fim) fim.value = ''
    _paginaAtual = 0
    _atualizarBotaoLimparData()
    _renderView()
  })

  // Urgente toggle no modal
  document.getElementById('np-urgente-wrap')?.addEventListener('click', () => {
    document.getElementById('np-urgente-toggle')?.classList.toggle('on')
  })

  // Chips de categoria
  document.getElementById('np-categorias')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip')
    if (!chip) return
    // Seleção exclusiva
    document.querySelectorAll('#np-categorias .chip').forEach(c => c.classList.remove('selected'))
    chip.classList.add('selected')
  })

  // Abrir modal
  document.getElementById('btn-novo-pedido')?.addEventListener('click', () => {
    document.getElementById('form-novo-pedido')?.reset()
    document.getElementById('np-urgente-toggle')?.classList.remove('on')
    document.querySelectorAll('#np-categorias .chip').forEach(c => c.classList.remove('selected'))
    abrirModal('modal-novo-pedido')
  })

  // Fechar modal
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal('modal-novo-pedido'))
  })
  document.getElementById('modal-novo-pedido')?.addEventListener('click', e => {
    if (e.target.id === 'modal-novo-pedido') fecharModal('modal-novo-pedido')
  })

  // Submit
  document.getElementById('btn-abrir-pedido')?.addEventListener('click', _submeterNovoPedido)

  // Bulk actions (4.6)
  document.getElementById('btn-bulk-clear')?.addEventListener('click', () => {
    _selecionados.clear()
    _atualizarBulkBar()
    document.querySelectorAll('.bulk-cb').forEach(cb => { cb.checked = false })
    const cbAll = document.getElementById('cb-select-all')
    if (cbAll) cbAll.checked = false
  })
  document.getElementById('btn-bulk-export')?.addEventListener('click', _exportarCSV)
  document.getElementById('btn-bulk-cancel')?.addEventListener('click', _abrirModalBulkCancel)
  document.querySelectorAll('[data-close-bulk-cancel]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal('modal-bulk-cancel'))
  })
  document.getElementById('modal-bulk-cancel')?.addEventListener('click', e => {
    if (e.target.id === 'modal-bulk-cancel') fecharModal('modal-bulk-cancel')
  })
  document.getElementById('bulk-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('bulk-motivo-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === 'Outros' ? '' : 'none'
  })
  document.getElementById('btn-confirmar-bulk-cancel')?.addEventListener('click', _confirmarBulkCancel)

  // Salvar visão
  document.getElementById('btn-salvar-visao')?.addEventListener('click', () => {
    const inp = document.getElementById('visao-nome')
    if (inp) inp.value = ''
    abrirModal('modal-salvar-visao')
  })
  document.querySelectorAll('[data-close-modal-visao]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal('modal-salvar-visao'))
  })
  document.getElementById('modal-salvar-visao')?.addEventListener('click', e => {
    if (e.target.id === 'modal-salvar-visao') fecharModal('modal-salvar-visao')
  })
  document.getElementById('btn-confirmar-salvar-visao')?.addEventListener('click', _confirmarSalvarVisao)
  document.getElementById('visao-nome')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); _confirmarSalvarVisao() }
  })
}

async function _submeterNovoPedido() {
  const titulo     = document.getElementById('np-titulo')?.value.trim()
  const empresaId  = document.getElementById('np-empresa')?.value
  const quantidade = document.getElementById('np-quantidade')?.value
  const unidade    = document.getElementById('np-unidade')?.value
  const data       = document.getElementById('np-data')?.value
  const valorStr   = document.getElementById('np-valor')?.value.trim()
  const cc         = document.getElementById('np-cc')?.value.trim()
  const obs        = document.getElementById('np-obs')?.value.trim()
  const urgente    = document.getElementById('np-urgente-toggle')?.classList.contains('on')
  const catChip    = document.querySelector('#np-categorias .chip.selected')
  const categoriaId = catChip?.dataset.id || ''

  if (!titulo || !empresaId || !quantidade || !unidade || !data || !categoriaId) {
    prxToast('Preencha todos os campos obrigatórios.', 'error')
    return
  }

  const valorEstimado = valorStr ? parseMoeda(valorStr) : null

  if (!exigirConexao()) return
  const btnAbrir = document.getElementById('btn-abrir-pedido')
  if (btnAbrir) btnAbrir.disabled = true
  mostrarSpinner()
  try {
    const contadorRef  = doc(db, '_meta', 'contadores')
    const novoPedidoRef = doc(collection(db, 'pedidos'))
    await runTransaction(db, async (tx) => {
      const snap  = await tx.get(contadorRef)
      const total = ((snap.exists() ? snap.data().totalPedidos : 0) || 0) + 1
      const numeroPedido = `PRX-${String(total).padStart(4, '0')}`
      tx.set(novoPedidoRef, {
        titulo,
        descricao:       obs || '',
        empresaId,
        quantidade:      Number(quantidade),
        unidade,
        dataNecessaria:  data,
        valorEstimado:   valorEstimado,
        centroCusto:     cc || null,
        categoriaId,
        urgente,
        status:          STATUS.SOLICITADO,
        solicitanteId:   sessao.usuario.id,
        compradorId:     null,
        compradorAssumiuEm: null,
        aprovadorIds:    [],
        aprovadoPor:     null,
        aprovadoEm:      null,
        reprovadoPor:    null,
        reprovadoEm:     null,
        motivoReprovacao: null,
        motivoReprovacaoOutros: null,
        canceladoPor:    null,
        canceladoEm:     null,
        motivoCancelamento: null,
        motivoCancelamentoOutros: null,
        fornecedorId:    null,
        valorFinal:      null,
        condicaoPagamento: null,
        dataCompra:      null,
        dataEntrega:     null,
        numeroPedido,
        criadoEm:        serverTimestamp(),
        atualizadoEm:    serverTimestamp(),
      })
      tx.set(contadorRef, { totalPedidos: total }, { merge: true })
    })

    fecharModal('modal-novo-pedido')
    prxToast('Pedido aberto com sucesso!', 'success')
  } catch (err) {
    prxToast('Erro ao abrir pedido. Tente novamente.', 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btnAbrir) btnAbrir.disabled = false
  }
}

// ── Listener em tempo real ────────────────────────────────────
function _iniciarListenerPedidos() {
  if (_unsubPedidos) _unsubPedidos()

  const perfil = sessao.usuario.perfil

  let q
  if (perfil === PERFIS.SUPREMO) {
    // Supremo enxerga todos os pedidos sem filtro por empresa
    q = query(collection(db, 'pedidos'), orderBy('criadoEm', 'desc'))
  } else if (perfil === PERFIS.SOLICITANTE) {
    // Solicitante vê apenas pedidos que ele mesmo abriu
    q = query(
      collection(db, 'pedidos'),
      where('solicitanteId', '==', sessao.usuario.id),
      orderBy('criadoEm', 'desc')
    )
  } else {
    // Demais perfis veem todos os pedidos das empresas que têm acesso
    const raw = sessao.usuario.empresas
    const empresas = Array.isArray(raw) ? raw : Object.keys(raw || {})
    if (!empresas.length) {
      _pedidos = []
      _renderView()
      return
    }
    // Firebase limita 'in' a 30 itens — MVP com ≤10 empresas está OK
    q = query(
      collection(db, 'pedidos'),
      where('empresaId', 'in', empresas.slice(0, 10)),
      orderBy('criadoEm', 'desc')
    )
  }

  _unsubPedidos = onSnapshot(q, snap => {
    _pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    _renderView()
  }, err => {
    console.error(err)
    prxToast('Erro ao carregar pedidos.', 'error')
    const container = document.getElementById('pedidos-view')
    if (container) {
      container.innerHTML = `
        <div class="card no-hover">
          <div class="empty-state-branded">
            <div class="empty-icon">
              <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div class="empty-title">${t('erroCarregarPedidos')}</div>
            <div class="empty-sub">${t('verificarConexao')}</div>
          </div>
        </div>
      `
    }
  })

  registrarLimpador(() => {
    if (_unsubPedidos) { _unsubPedidos(); _unsubPedidos = null }
  })
}

// ── Filtragem ─────────────────────────────────────────────────
function _filtrarPedidos() {
  let lista = [..._pedidos]
  const uid = sessao.usuario.id
  const hoje = hojeISO()
  const [y, m, d] = hoje.split('-').map(Number)
  const inicioSemana = new Date(y, m - 1, d - new Date(y, m-1, d).getDay())

  switch (_filtroAtivo) {
    case 'urgentes':   lista = lista.filter(p => p.urgente); break
    case 'meus':       lista = lista.filter(p => p.solicitanteId === uid || p.compradorId === uid); break
    case 'encerrados': lista = lista.filter(p => [STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status)); break
    case 'semana':
      lista = lista.filter(p => {
        if (!p.criadoEm) return false
        const ts = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
        return ts >= inicioSemana
      })
      break
    case 'pendentes': {
      const perfil = sessao.usuario.perfil
      const agora  = Date.now()
      const h48    = 48 * 3600000
      const TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
      if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
        lista = lista.filter(p => {
          if (TERMINAIS.includes(p.status)) return false
          if (p.urgente) return true
          const ts = p.atualizadoEm?.toDate ? p.atualizadoEm.toDate() : (p.atualizadoEm ? new Date(p.atualizadoEm) : null)
          return ts && (agora - ts.getTime()) > h48
        })
      } else if (perfil === PERFIS.APROVADOR) {
        lista = lista.filter(p => p.status === STATUS.EM_APROVACAO)
      } else if (perfil === PERFIS.COMPRADOR) {
        lista = lista.filter(p =>
          (p.status === STATUS.SOLICITADO && !p.compradorId) ||
          (p.status === STATUS.AG_COTACAO && p.compradorId === uid)
        )
      } else if (perfil === PERFIS.FINANCEIRO) {
        lista = lista.filter(p => p.status === STATUS.ENTREGUE)
      } else {
        // solicitante: seus pedidos não encerrados
        lista = lista.filter(p => p.solicitanteId === uid && !TERMINAIS.includes(p.status))
      }
      break
    }
  }

  if (_filtroCategoria) lista = lista.filter(p => p.categoriaId === _filtroCategoria)
  if (_filtroEmpresa)   lista = lista.filter(p => p.empresaId   === _filtroEmpresa)
  if (_filtroComprador) lista = lista.filter(p => p.compradorId === _filtroComprador)

  if (_filtroDataIni || _filtroDataFim) {
    lista = lista.filter(p => {
      const ts = p.criadoEm?.toDate ? p.criadoEm.toDate() : (p.criadoEm ? new Date(p.criadoEm) : null)
      if (!ts) return true
      const iso = ts.toISOString().slice(0, 10)
      if (_filtroDataIni && iso < _filtroDataIni) return false
      if (_filtroDataFim && iso > _filtroDataFim) return false
      return true
    })
  }

  if (_termoBusca) {
    const termo = normalizarTexto(_termoBusca)
    lista = lista.filter(p =>
      normalizarTexto(p.titulo || '').includes(termo) ||
      normalizarTexto(p.descricao || '').includes(termo)
    )
  }

  if (_viewMode === 'lista' && _ordemCampo !== 'criadoEm') {
    lista.sort((a, b) => {
      let va, vb
      switch (_ordemCampo) {
        case 'titulo':
          va = normalizarTexto(a.titulo || ''); vb = normalizarTexto(b.titulo || ''); break
        case 'valorEstimado':
          va = a.valorEstimado || 0; vb = b.valorEstimado || 0; break
        case 'status':
          va = STATUS_LABEL[a.status] || ''; vb = STATUS_LABEL[b.status] || ''; break
        default: va = 0; vb = 0
      }
      if (va < vb) return _ordemDesc ? 1 : -1
      if (va > vb) return _ordemDesc ? -1 : 1
      return 0
    })
  }

  return lista
}

// ── Render view ───────────────────────────────────────────────
function _atualizarPillPendentes() {
  const pill = document.querySelector('#filter-pills .pill[data-filtro="pendentes"]')
  if (!pill) return
  const salvo = _filtroAtivo
  _filtroAtivo = 'pendentes'
  const n = _filtrarPedidos().length
  _filtroAtivo = salvo
  pill.textContent = n > 0 ? `Meus pendentes (${n})` : 'Meus pendentes'
}

function _renderView() {
  const container = document.getElementById('pedidos-view')
  if (!container) return
  const lista = _filtrarPedidos()

  if (_viewMode === 'kanban') {
    _selecionados.clear()
    _atualizarBulkBar()
    container.innerHTML = _renderKanban(lista)
    container.querySelectorAll('.kcard').forEach(card => {
      card.addEventListener('click', () => navegar('detalhe', { id: card.dataset.id }))
    })
    _bindDragDrop(container)
  } else {
    const totalFiltrada = lista.length
    const totalPaginas = Math.max(1, Math.ceil(totalFiltrada / _PAGE_SIZE))
    if (_paginaAtual >= totalPaginas) _paginaAtual = Math.max(0, totalPaginas - 1)
    const listaPaginada = lista.slice(_paginaAtual * _PAGE_SIZE, (_paginaAtual + 1) * _PAGE_SIZE)

    container.innerHTML = _renderLista(listaPaginada)
    container.querySelectorAll('tbody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => navegar('detalhe', { id: row.dataset.id }))
    })
    container.querySelectorAll('th.sortable[data-campo]').forEach(th => {
      th.addEventListener('click', () => {
        const campo = th.dataset.campo
        if (_ordemCampo === campo) { _ordemDesc = !_ordemDesc } else { _ordemCampo = campo; _ordemDesc = true }
        _paginaAtual = 0
        _renderView()
      })
    })
    container.querySelector('#fl-categoria')?.addEventListener('change', e => { _filtroCategoria = e.target.value; _paginaAtual = 0; _renderView() })
    container.querySelector('#fl-comprador')?.addEventListener('change', e => { _filtroComprador = e.target.value; _paginaAtual = 0; _renderView() })
    container.querySelector('#fl-limpar')?.addEventListener('click', () => {
      _filtroCategoria = ''; _filtroComprador = ''; _paginaAtual = 0; _renderView()
    })

    // Checkboxes de seleção múltipla
    container.querySelectorAll('td.bulk-cb-cell').forEach(td => {
      td.addEventListener('click', e => e.stopPropagation())
    })
    container.querySelectorAll('.bulk-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) { _selecionados.add(cb.dataset.id) }
        else { _selecionados.delete(cb.dataset.id) }
        _atualizarBulkBar()
        const todos = container.querySelectorAll('.bulk-cb')
        const cbAll = container.querySelector('#cb-select-all')
        if (cbAll) cbAll.checked = todos.length > 0 && [...todos].every(c => c.checked)
      })
    })
    const cbAll = container.querySelector('#cb-select-all')
    cbAll?.addEventListener('change', () => {
      container.querySelectorAll('.bulk-cb').forEach(cb => {
        cb.checked = cbAll.checked
        if (cbAll.checked) { _selecionados.add(cb.dataset.id) }
        else { _selecionados.delete(cb.dataset.id) }
      })
      _atualizarBulkBar()
    })

    if (totalFiltrada > _PAGE_SIZE) {
      const pag = document.createElement('div')
      pag.className = 'lista-paginacao'
      pag.innerHTML = `
        <button id="btn-pagina-ant" class="btn-ghost btn-sm"${_paginaAtual === 0 ? ' disabled' : ''}>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
          ${t('paginaAnt')}
        </button>
        <span class="pagina-info">Página ${_paginaAtual + 1} de ${totalPaginas} &middot; <strong>${totalFiltrada}</strong> ${t('titulo').toLowerCase()}</span>
        <button id="btn-pagina-prox" class="btn-ghost btn-sm"${_paginaAtual >= totalPaginas - 1 ? ' disabled' : ''}>
          ${t('paginaProx')}
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      `
      container.appendChild(pag)
      pag.querySelector('#btn-pagina-ant')?.addEventListener('click', () => {
        if (_paginaAtual > 0) { _paginaAtual--; _renderView() }
      })
      pag.querySelector('#btn-pagina-prox')?.addEventListener('click', () => {
        if (_paginaAtual < totalPaginas - 1) { _paginaAtual++; _renderView() }
      })
    }
  }

  _atualizarPillPendentes()
}

// ── Drag & drop ───────────────────────────────────────
function _transicoesDragPermitidas(perfil) {
  if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    return {
      [STATUS.SOLICITADO]:   [STATUS.EM_APROVACAO],
      [STATUS.EM_APROVACAO]: [STATUS.APROVADO],
      [STATUS.APROVADO]:     [STATUS.AG_COTACAO],
      [STATUS.AG_COTACAO]:   [STATUS.COMPRADO],
      [STATUS.COMPRADO]:     [STATUS.ENTREGUE],
      [STATUS.ENTREGUE]:     [STATUS.PAGO],
    }
  }
  if (perfil === PERFIS.APROVADOR) return {
    [STATUS.SOLICITADO]:   [STATUS.EM_APROVACAO],
    [STATUS.EM_APROVACAO]: [STATUS.APROVADO],
  }
  if (perfil === PERFIS.COMPRADOR) return {
    [STATUS.APROVADO]:   [STATUS.AG_COTACAO],
    [STATUS.AG_COTACAO]: [STATUS.COMPRADO],
    [STATUS.COMPRADO]:   [STATUS.ENTREGUE],
  }
  if (perfil === PERFIS.FINANCEIRO) return {
    [STATUS.ENTREGUE]: [STATUS.PAGO],
  }
  return {}
}

async function _tentarMoverPedido(id, statusOrigem, statusDestino) {
  const perfil   = sessao.usuario.perfil
  const permitidos = _transicoesDragPermitidas(perfil)
  const destinos   = permitidos[statusOrigem] || []

  if (statusOrigem === statusDestino) return
  if (!destinos.includes(statusDestino)) {
    prxToast(`Transição de "${STATUS_LABEL[statusOrigem]}" para "${STATUS_LABEL[statusDestino]}" não é permitida para o seu perfil. Use a tela de detalhes.`, 'error')
    return
  }

  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const campos = { status: statusDestino, atualizadoEm: serverTimestamp() }
    if (statusDestino === STATUS.AG_COTACAO) {
      campos.compradorId       = sessao.usuario.id
      campos.compradorAssumiuEm = serverTimestamp()
    }
    if (statusDestino === STATUS.APROVADO && statusOrigem === STATUS.EM_APROVACAO) {
      campos.aprovadoPor = sessao.usuario.id
      campos.aprovadoEm  = serverTimestamp()
    }
    await updateDoc(doc(db, 'pedidos', id), campos)
    addDoc(collection(db, 'pedidos', id, 'historico'), {
      status:    statusDestino,
      autorId:   sessao.usuario.id,
      autorNome: sessao.usuario.nome || '',
      nota:      null,
      criadoEm:  serverTimestamp(),
    }).catch(() => {})
    prxToast(`Pedido movido para "${STATUS_LABEL[statusDestino]}".`, 'success')
  } catch (err) {
    prxToast('Erro ao mover pedido: ' + (err.message || 'tente novamente'), 'error')
  } finally {
    esconderSpinner()
  }
}

function _bindDragDrop(container) {
  const perfil   = sessao.usuario.perfil
  const permitidos = _transicoesDragPermitidas(perfil)

  let _dragId     = null
  let _dragStatus = null
  let _touchGhost = null
  let _touchId    = null
  let _touchStatus = null

  // ── HTML5 drag ──
  container.querySelectorAll('.kcard').forEach(card => {
    card.addEventListener('dragstart', e => {
      _dragId     = card.dataset.id
      _dragStatus = card.closest('.kanban-col')?.dataset.status
      card.classList.add('kcard-dragging')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', _dragId)
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('kcard-dragging')
      container.querySelectorAll('.kanban-cards.drop-over').forEach(z => z.classList.remove('drop-over'))
    })
  })

  container.querySelectorAll('.kanban-cards').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault()
      const destStatus = zone.dataset.status
      const permitidosOrigem = permitidos[_dragStatus] || []
      e.dataTransfer.dropEffect = permitidosOrigem.includes(destStatus) ? 'move' : 'none'
      zone.classList.toggle('drop-over', permitidosOrigem.includes(destStatus) && destStatus !== _dragStatus)
    })
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-over')
    })
    zone.addEventListener('drop', e => {
      e.preventDefault()
      zone.classList.remove('drop-over')
      const destStatus = zone.dataset.status
      _tentarMoverPedido(_dragId, _dragStatus, destStatus)
    })
  })

  // ── Touch drag (longpress 280ms para não conflitar com scroll horizontal) ──
  let _touchTimer  = null
  let _touchStartX = 0
  let _touchStartY = 0

  container.querySelectorAll('.kcard').forEach(card => {
    card.addEventListener('touchstart', e => {
      const touch = e.touches[0]
      _touchStartX = touch.clientX
      _touchStartY = touch.clientY
      _touchId     = card.dataset.id
      _touchStatus = card.closest('.kanban-col')?.dataset.status

      // Só inicia drag após segurar 280ms sem mover horizontalmente
      _touchTimer = setTimeout(() => {
        _touchTimer = null
        card.classList.add('kcard-drag-active')
        _touchGhost = card.cloneNode(true)
        Object.assign(_touchGhost.style, {
          position: 'fixed', zIndex: '9999', opacity: '0.85', pointerEvents: 'none',
          width: card.offsetWidth + 'px', transform: 'rotate(2deg)',
          left: (touch.clientX - card.offsetWidth / 2) + 'px',
          top:  (touch.clientY - 20) + 'px',
          boxShadow: '0 8px 32px rgba(0,0,0,.35)',
        })
        document.body.appendChild(_touchGhost)
      }, 280)
    }, { passive: true })

    card.addEventListener('touchmove', e => {
      const touch = e.touches[0]
      const dx = Math.abs(touch.clientX - _touchStartX)
      const dy = Math.abs(touch.clientY - _touchStartY)

      // Movimento horizontal detectado antes do timer → cancela drag, deixa kanban scrollar
      if (_touchTimer && dx > 8 && dx > dy) {
        clearTimeout(_touchTimer)
        _touchTimer = null
        _touchId = null
        return
      }

      if (!_touchGhost) return
      _touchGhost.style.left = (touch.clientX - _touchGhost.offsetWidth / 2) + 'px'
      _touchGhost.style.top  = (touch.clientY - 20) + 'px'

      _touchGhost.style.display = 'none'
      const el = document.elementFromPoint(touch.clientX, touch.clientY)
      _touchGhost.style.display = ''

      container.querySelectorAll('.kanban-cards').forEach(z => z.classList.remove('drop-over'))
      const zone = el?.closest('.kanban-cards')
      if (zone) {
        const destStatus = zone.dataset.status
        if ((permitidos[_touchStatus] || []).includes(destStatus) && destStatus !== _touchStatus)
          zone.classList.add('drop-over')
      }
    }, { passive: true })

    card.addEventListener('touchend', e => {
      clearTimeout(_touchTimer)
      _touchTimer = null
      card.classList.remove('kcard-drag-active')

      const hadGhost = !!_touchGhost
      if (_touchGhost) { _touchGhost.remove(); _touchGhost = null }
      container.querySelectorAll('.kanban-cards').forEach(z => z.classList.remove('drop-over'))

      if (!hadGhost || !_touchId || !_touchStatus) { _touchId = null; _touchStatus = null; return }

      const touch = e.changedTouches[0]
      const el    = document.elementFromPoint(touch.clientX, touch.clientY)
      const zone  = el?.closest('.kanban-cards')
      if (!zone) { _touchId = null; _touchStatus = null; return }

      const destStatus = zone.dataset.status
      _tentarMoverPedido(_touchId, _touchStatus, destStatus)
      _touchId = null; _touchStatus = null
    })
  })
}

function _renderKanban(lista) {
  const cor = {
    solicitado:'#8A8278', ag_cotacao:'#5BA3E0', em_aprovacao:'#C8A96E',
    aprovado:'#4EC08A', comprado:'#4EC08A', entregue:'#4EC08A', pago:'#4EC08A',
    reprovado:'#E05040', cancelado:'#E05040',
  }

  // Empty state global quando não há pedidos no filtro ativo
  if (!lista.length) {
    const temBusca = !!_termoBusca || _filtroAtivo !== 'todos'
    return _renderEmptyState(temBusca)
  }

  const colunasVisiveis = _filtroAtivo === 'encerrados'
    ? [STATUS.REPROVADO, STATUS.CANCELADO]
    : KANBAN_COLUNAS

  const colunas = colunasVisiveis.map(status => {
    const cards = lista.filter(p => p.status === status)
    return `
      <div class="kanban-col" data-status="${status}">
        <div class="kanban-col-header">
          <div class="kanban-col-title">
            <span style="width:8px;height:8px;border-radius:50%;background:${cor[status]||'#8A8278'};flex-shrink:0"></span>
            ${STATUS_LABEL[status]}
          </div>
          <span class="kanban-col-count">${cards.length}</span>
        </div>
        <div class="kanban-cards" data-status="${status}">
          ${cards.length ? cards.map(_renderKcard).join('') : `
            <div class="empty-state" style="padding:1rem 0.5rem">
              <p style="font-size:0.76rem;color:var(--text3)">${t('semPedidosColuna')}</p>
            </div>
          `}
        </div>
      </div>
    `
  }).join('')

  return `<div class="kanban-board">${colunas}</div>`
}

function _tsMs(ts) {
  if (!ts) return 0
  return ts.toMillis ? ts.toMillis() : (ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime())
}

function _renderKcard(p) {
  const uid     = sessao.usuario.id
  const empresa = _empresas.find(e => e.id === p.empresaId)
  const nomeEmp = esc(empresa?.nome || p.empresaId || '—')
  const valor   = p.valorFinal ?? p.valorEstimado
  const temComentNaoLido = p.ultimoComentarioEm &&
    _tsMs(p.ultimoComentarioEm) > _tsMs(p.vistoPor?.[uid])
  const urgBadge = p.urgente
    ? `<span class="badge badge-red" style="font-size:0.68rem">
        <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Urgente
       </span>`
    : ''
  const estados_terminais = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
  const slaBadge = (!estados_terminais.includes(p.status) && p.dataNecessaria)
    ? (() => { const s = calcularSLA(p.dataNecessaria); return s ? `<span class="sla-badge ${s.classe}">${s.label}</span>` : '' })()
    : ''

  return `
    <div class="kcard ${p.urgente ? 'kcard-urgente' : ''}" data-id="${p.id}" draggable="true" style="position:relative">
      ${temComentNaoLido ? '<span class="kcard-unread-dot" title="Comentário não lido"></span>' : ''}
      ${p.numeroPedido ? `<div class="kcard-num">${p.numeroPedido}</div>` : ''}
      <div class="kcard-title">${esc(p.titulo)}</div>
      <div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin-bottom:0.3rem">${urgBadge}${slaBadge}</div>
      <div class="kcard-meta">
        <span class="kcard-empresa truncate">${nomeEmp}</span>
        ${valor ? `<span style="font-size:0.78rem;font-weight:700;color:var(--gold)">${formatCurrency(valor)}</span>` : ''}
      </div>
    </div>
  `
}

function _renderEmptyState(temBusca) {
  if (temBusca) {
    return `
      <div class="card no-hover">
        <div class="empty-state-branded">
          <div class="empty-icon">
            <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </div>
          <div class="empty-title">${t('nenhumResultado')}</div>
          <div class="empty-sub">${t('ajustarFiltro')}</div>
        </div>
      </div>
    `
  }
  return `
    <div class="card no-hover">
      <div class="empty-state-branded">
        <div class="empty-icon">
          <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="2"/><line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </div>
        <div class="empty-title">${t('nenhumPedido')}</div>
        <div class="empty-sub">${t('abrirPrimeiro')}</div>
      </div>
    </div>
  `
}

function _sortIcon(campo) {
  if (_ordemCampo !== campo) return `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="opacity:0.3"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="18 13 12 19 6 13"/></svg>`
  return _ordemDesc
    ? `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="color:var(--gold)"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>`
    : `<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="color:var(--gold)"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="18 13 12 19 6 13"/></svg>`
}

function _renderLista(lista) {
  const temBusca = !!_termoBusca || _filtroAtivo !== 'todos' || _filtroCategoria || _filtroEmpresa || _filtroComprador
  if (!lista.length) return _renderEmptyState(temBusca)

  const compradores = _usuarios.filter(u => [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(u.perfil))

  const barraFiltros = `
    <div class="lista-filtros">
      <select id="fl-categoria">
        <option value="">${t('todasCategorias')}</option>
        ${_categorias.map(c => `<option value="${c.id}"${_filtroCategoria === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}
      </select>
      ${compradores.length ? `
      <select id="fl-comprador">
        <option value="">${t('TodosCompradores')}</option>
        ${compradores.map(u => `<option value="${u.id}"${_filtroComprador === u.id ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')}
      </select>` : ''}
      ${(_filtroCategoria || _filtroComprador) ? `<button class="btn-secondary" id="fl-limpar" style="padding:0.25rem 0.7rem;font-size:0.8rem">${t('limparFiltros')}</button>` : ''}
    </div>
  `

  const linhas = lista.map(p => {
    const empresa = _empresas.find(e => e.id === p.empresaId)
    const solicit  = _usuarios.find(u => u.id === p.solicitanteId)
    const color    = STATUS_COLOR[p.status] || 'neutral'
    const label    = STATUS_LABEL[p.status] || p.status
    const urgDot   = p.urgente ? `<span class="dot dot-red" style="margin-right:0.4rem"></span>` : ''
    const checked  = _selecionados.has(p.id) ? ' checked' : ''

    return `
      <tr data-id="${p.id}">
        <td class="bulk-cb-cell" style="width:2.5rem;padding-right:0"><input type="checkbox" class="bulk-cb" data-id="${p.id}"${checked}></td>
        <td>${urgDot}${p.numeroPedido ? `<span class="kcard-num" style="margin-right:0.4rem">${p.numeroPedido}</span>` : ''}${esc(p.titulo)}</td>
        <td data-label="Empresa">${esc(empresa?.nome || '—')}</td>
        <td data-label="Solicitante">${esc(solicit?.nome || '—')}</td>
        <td data-label="Valor est.">${p.valorEstimado ? formatCurrency(p.valorEstimado) : '—'}</td>
        <td data-label="Status"><span class="badge badge-${color}">${label}</span></td>
        <td data-label="Data">${p.criadoEm ? formatDate(_tsToISO(p.criadoEm)) : '—'}</td>
      </tr>
    `
  }).join('')

  const todasSelecionadas = lista.length > 0 && lista.every(p => _selecionados.has(p.id))
  return `
    ${barraFiltros}
    <div class="card no-hover" style="overflow:hidden">
      <div class="table-wrapper">
        <table class="table-card-mobile">
          <thead>
            <tr>
              <th style="width:2.5rem;padding-right:0"><input type="checkbox" id="cb-select-all"${todasSelecionadas ? ' checked' : ''}></th>
              <th class="sortable" data-campo="titulo">${t('colPedido')} ${_sortIcon('titulo')}</th>
              <th>${t('colEmpresa')}</th><th>${t('colSolicitante')}</th>
              <th class="sortable" data-campo="valorEstimado">${t('colValorEst')} ${_sortIcon('valorEstimado')}</th>
              <th class="sortable" data-campo="status">Status ${_sortIcon('status')}</th>
              <th class="sortable" data-campo="criadoEm">${t('colData')} ${_sortIcon('criadoEm')}</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>
  `
}

// ── Auxiliares ────────────────────────────────────────────────
async function _carregarDadosAuxiliares() {
  const [catSnap, empSnap] = await Promise.all([
    getDocs(collection(db, 'categorias')),
    getDocs(collection(db, 'empresas')),
  ])
  _categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _empresas   = empSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.ativa !== false)
  // usuarios: regra permite list apenas para gestor+; demais perfis recebem lista vazia
  try {
    const usrSnap = await getDocs(collection(db, 'usuarios'))
    _usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    _usuarios = []
  }
}

function _preencherFiltroEmpresaGlobal() {
  const sel = document.getElementById('fl-empresa-global')
  if (!sel) return

  const raw = sessao.usuario.empresas
  const empIds = Array.isArray(raw) ? raw : Object.keys(raw || {})
  const disponiveis = sessao.usuario.perfil === PERFIS.SUPREMO
    ? _empresas
    : _empresas.filter(e => empIds.includes(e.id))

  if (disponiveis.length < 2) return

  disponiveis.forEach(e => {
    const opt = document.createElement('option')
    opt.value = e.id
    opt.textContent = e.nome
    sel.appendChild(opt)
  })
  sel.style.display = ''
}

function _preencherModalNovoPedido() {
  // Empresas — filtra pelas do usuário
  const empSel = document.getElementById('np-empresa')
  if (empSel) {
    const raw = sessao.usuario.empresas
    const empIds = Array.isArray(raw) ? raw : Object.keys(raw || {})
    const disponiveis = _empresas.filter(e =>
      sessao.usuario.perfil === PERFIS.SUPREMO || empIds.includes(e.id)
    )
    disponiveis.forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      empSel.appendChild(opt)
    })
  }

  // Unidades
  const unidSel = document.getElementById('np-unidade')
  if (unidSel) {
    UNIDADES.forEach(u => {
      const opt = document.createElement('option')
      opt.value = u; opt.textContent = u
      unidSel.appendChild(opt)
    })
  }

  // Categorias
  const catWrap = document.getElementById('np-categorias')
  if (catWrap) {
    const lista = _categorias.length ? _categorias : CATEGORIAS_PADRAO.map((c, i) => ({ id: String(i), ...c }))
    lista.forEach(c => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.dataset.id = c.id
      chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.cor};display:inline-block;margin-right:4px"></span>${c.nome}`
      catWrap.appendChild(chip)
    })
  }
}

function _preencherModalDuplicar(p) {
  const titulo  = document.getElementById('np-titulo')
  const empresa = document.getElementById('np-empresa')
  const quant   = document.getElementById('np-quantidade')
  const unid    = document.getElementById('np-unidade')
  const valor   = document.getElementById('np-valor')
  const cc      = document.getElementById('np-cc')
  const obs     = document.getElementById('np-obs')

  if (titulo)  titulo.value  = `(Cópia) ${p.titulo || ''}`
  if (empresa) empresa.value = p.empresaId || ''
  if (quant)   quant.value   = p.quantidade || ''
  if (unid)    unid.value    = p.unidade || ''
  if (valor && p.valorEstimado) valor.value = String(p.valorEstimado).replace('.', ',')
  if (cc)      cc.value      = p.centroCusto || p.cc || ''
  if (obs)     obs.value     = p.descricao || ''

  if (p.urgente) document.getElementById('np-urgente-toggle')?.classList.add('on')

  if (p.categoriaId) {
    const chip = document.querySelector(`#np-categorias .chip[data-id="${p.categoriaId}"]`)
    if (chip) chip.classList.add('selected')
  }

  const h2 = document.querySelector('#modal-novo-pedido h2')
  if (h2) h2.textContent = 'Duplicar pedido'
}

function _tsToISO(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Visões salvas (4.12) ──────────────────────────────────────
function _carregarViews() {
  const uid = sessao.usuario.id
  try {
    const raw = localStorage.getItem(`praxis_views_${uid}`)
    _viewsSalvas = raw ? JSON.parse(raw) : []
  } catch {
    _viewsSalvas = []
  }
}

function _persistirViews() {
  const uid = sessao.usuario.id
  localStorage.setItem(`praxis_views_${uid}`, JSON.stringify(_viewsSalvas))
}

function _capturarEstadoFiltros() {
  return {
    filtroAtivo:     _filtroAtivo,
    termoBusca:      _termoBusca,
    filtroCategoria: _filtroCategoria,
    filtroEmpresa:   _filtroEmpresa,
    filtroComprador: _filtroComprador,
    filtroDataIni:   _filtroDataIni,
    filtroDataFim:   _filtroDataFim,
    ordemCampo:      _ordemCampo,
    ordemDesc:       _ordemDesc,
    viewMode:        _viewMode,
  }
}

function _aplicarView(estado) {
  _filtroAtivo     = estado.filtroAtivo     ?? 'todos'
  _termoBusca      = estado.termoBusca      ?? ''
  _filtroCategoria = estado.filtroCategoria ?? ''
  _filtroEmpresa   = estado.filtroEmpresa   ?? ''
  _filtroComprador = estado.filtroComprador ?? ''
  _filtroDataIni   = estado.filtroDataIni   ?? ''
  _filtroDataFim   = estado.filtroDataFim   ?? ''
  _ordemCampo      = estado.ordemCampo      ?? 'criadoEm'
  _ordemDesc       = estado.ordemDesc       ?? true
  _viewMode        = estado.viewMode        ?? 'kanban'
  _paginaAtual     = 0

  // Sincronizar DOM
  document.querySelectorAll('#filter-pills .pill').forEach(p => {
    p.classList.toggle('active', p.dataset.filtro === _filtroAtivo)
  })
  const busca = document.getElementById('busca-pedidos')
  if (busca) busca.value = _termoBusca
  const flEmpGlobal = document.getElementById('fl-empresa-global')
  if (flEmpGlobal) flEmpGlobal.value = _filtroEmpresa
  const ini = document.getElementById('filtro-data-ini')
  const fim = document.getElementById('filtro-data-fim')
  if (ini) ini.value = _filtroDataIni
  if (fim) fim.value = _filtroDataFim
  const btnLimparDatas = document.getElementById('btn-limpar-datas')
  if (btnLimparDatas) btnLimparDatas.style.display = (_filtroDataIni || _filtroDataFim) ? '' : 'none'
  document.getElementById('btn-kanban')?.classList.toggle('active', _viewMode === 'kanban')
  document.getElementById('btn-lista')?.classList.toggle('active', _viewMode === 'lista')

  _renderViewsSalvasRow()
  _renderView()
}

function _renderViewsSalvasRow() {
  const row = document.getElementById('views-salvas-row')
  if (!row) return
  if (!_viewsSalvas.length) { row.style.display = 'none'; return }
  row.style.display = ''
  row.innerHTML = _viewsSalvas.map(v => `
    <div class="view-salva-pill" data-view-id="${v.id}">
      <button class="view-salva-nome" data-aplicar-view="${v.id}" title="Aplicar visão">${esc(v.nome)}</button>
      <button class="view-salva-rename btn-icon" data-renomear-view="${v.id}" title="Renomear">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="view-salva-del btn-icon" data-remover-view="${v.id}" title="Remover">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `).join('')

  row.querySelectorAll('[data-aplicar-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = _viewsSalvas.find(x => x.id === btn.dataset.aplicarView)
      if (v) _aplicarView(v.estado)
    })
  })
  row.querySelectorAll('[data-renomear-view]').forEach(btn => {
    btn.addEventListener('click', () => _renomearView(btn.dataset.renomearView))
  })
  row.querySelectorAll('[data-remover-view]').forEach(btn => {
    btn.addEventListener('click', () => _removerView(btn.dataset.removerView))
  })
}

function _confirmarSalvarVisao() {
  const nome = document.getElementById('visao-nome')?.value.trim()
  if (!nome) {
    prxToast('Informe um nome para a visão.', 'error')
    return
  }
  if (_viewsSalvas.length >= _VIEWS_MAX) {
    prxToast(`Limite de ${_VIEWS_MAX} visões atingido. Remova uma para salvar.`, 'error')
    return
  }
  _viewsSalvas.push({ id: Date.now().toString(), nome, estado: _capturarEstadoFiltros() })
  _persistirViews()
  fecharModal('modal-salvar-visao')
  _renderViewsSalvasRow()
  prxToast('Visão salva!', 'success')
}

function _renomearView(viewId) {
  const view = _viewsSalvas.find(v => v.id === viewId)
  if (!view) return
  const pill = document.querySelector(`.view-salva-pill[data-view-id="${viewId}"]`)
  if (!pill) return
  const nomeBtn = pill.querySelector('.view-salva-nome')
  if (!nomeBtn) return
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.className = 'view-salva-input'
  inp.value = view.nome
  inp.maxLength = 40
  pill.replaceChild(inp, nomeBtn)
  inp.focus()
  inp.select()
  const confirmar = () => {
    const novo = inp.value.trim()
    if (novo) { view.nome = novo; _persistirViews() }
    _renderViewsSalvasRow()
  }
  inp.addEventListener('blur', confirmar)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur() }
    if (e.key === 'Escape') { inp.value = view.nome; inp.blur() }
  })
}

function _removerView(viewId) {
  const view = _viewsSalvas.find(v => v.id === viewId)
  if (!view) return
  prxConfirm(`Remover a visão "${view.nome}"?`, ok => {
    if (!ok) return
    _viewsSalvas = _viewsSalvas.filter(v => v.id !== viewId)
    _persistirViews()
    _renderViewsSalvasRow()
  })
}

// ── Bulk actions (4.6) ────────────────────────────────────────
function _atualizarBulkBar() {
  const bar = document.getElementById('bulk-bar')
  if (!bar) return
  const n = _selecionados.size
  bar.style.display = n > 0 ? 'flex' : 'none'
  const countEl = document.getElementById('bulk-count')
  if (countEl) countEl.textContent = `${n} ${n !== 1 ? t('selecionados') : t('selecionado')}`
  const btnCancel = document.getElementById('btn-bulk-cancel')
  if (btnCancel) {
    const perfil = sessao.usuario.perfil
    btnCancel.style.display = [PERFIS.GESTOR, PERFIS.SUPREMO, PERFIS.SOLICITANTE].includes(perfil) ? '' : 'none'
  }
}

function _exportarCSV() {
  const ids = [..._selecionados]
  const lista = _pedidos.filter(p => ids.includes(p.id))
  if (!lista.length) return
  const cabecalho = ['Número', 'Título', 'Empresa', 'Status', 'Valor estimado', 'Data']
  const linhas = lista.map(p => {
    const empresa = _empresas.find(e => e.id === p.empresaId)
    const valor = p.valorFinal ?? p.valorEstimado ?? ''
    const data = p.criadoEm ? _tsToISO(p.criadoEm) : ''
    return [
      p.numeroPedido || '',
      `"${(p.titulo || '').replace(/"/g, '""')}"`,
      `"${(empresa?.nome || '').replace(/"/g, '""')}"`,
      STATUS_LABEL[p.status] || p.status,
      valor ? String(valor).replace('.', ',') : '',
      data,
    ].join(';')
  })
  const csv = [cabecalho.join(';'), ...linhas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'praxis-pedidos.csv'
  a.click()
  URL.revokeObjectURL(url)
  prxToast(`${lista.length} ${lista.length !== 1 ? t('pedidosExportados') : t('pedidoExportado')}.`, 'success')
}

function _abrirModalBulkCancel() {
  const CANCELAVEIS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO]
  const perfil = sessao.usuario.perfil
  const uid = sessao.usuario.id
  const ids = [..._selecionados]
  const candidatos = _pedidos.filter(p => {
    if (!ids.includes(p.id)) return false
    if (!CANCELAVEIS.includes(p.status)) return false
    if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) return true
    if (perfil === PERFIS.SOLICITANTE) return p.solicitanteId === uid
    return false
  })
  if (!candidatos.length) {
    prxToast(t('bulkNenhumCancelavel'), 'error')
    return
  }
  const msg = document.getElementById('bulk-cancel-msg')
  if (msg) msg.textContent = `${candidatos.length} / ${ids.length} ${ids.length !== 1 ? t('selecionados') : t('selecionado')} — ${candidatos.length} ${t('seraoCancelados')}.`
  const sel = document.getElementById('bulk-motivo')
  if (sel) {
    sel.innerHTML = '<option value="">Selecionar motivo…</option>'
    MOTIVOS_CANCELAMENTO.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m; opt.textContent = m
      sel.appendChild(opt)
    })
  }
  const wrap = document.getElementById('bulk-motivo-outros-wrap')
  if (wrap) wrap.style.display = 'none'
  const outros = document.getElementById('bulk-motivo-outros')
  if (outros) outros.value = ''
  abrirModal('modal-bulk-cancel')
}

async function _confirmarBulkCancel() {
  const motivo = document.getElementById('bulk-motivo')?.value
  const motivoOutros = document.getElementById('bulk-motivo-outros')?.value.trim()
  if (!motivo) { prxToast(t('selecionarMotivo'), 'error'); return }
  if (motivo === 'Outros' && !motivoOutros) { prxToast(t('descreverMotivo'), 'error'); return }

  const CANCELAVEIS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO]
  const perfil = sessao.usuario.perfil
  const uid = sessao.usuario.id
  const ids = [..._selecionados]
  const candidatos = _pedidos.filter(p => {
    if (!ids.includes(p.id)) return false
    if (!CANCELAVEIS.includes(p.status)) return false
    if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) return true
    if (perfil === PERFIS.SOLICITANTE) return p.solicitanteId === uid
    return false
  })
  if (!candidatos.length) { fecharModal('modal-bulk-cancel'); return }

  const btnConfirmar = document.getElementById('btn-confirmar-bulk-cancel')
  if (btnConfirmar) btnConfirmar.disabled = true
  mostrarSpinner()
  try {
    await Promise.all(candidatos.map(async p => {
      await updateDoc(doc(db, 'pedidos', p.id), {
        status: STATUS.CANCELADO,
        canceladoPor: uid,
        canceladoEm: serverTimestamp(),
        motivoCancelamento: motivo,
        motivoCancelamentoOutros: motivo === 'Outros' ? motivoOutros : null,
        atualizadoEm: serverTimestamp(),
      })
      addDoc(collection(db, 'pedidos', p.id, 'historico'), {
        status: STATUS.CANCELADO,
        autorId: uid,
        autorNome: sessao.usuario.nome || '',
        nota: motivo === 'Outros' ? motivoOutros : motivo,
        criadoEm: serverTimestamp(),
      }).catch(() => {})
    }))
    fecharModal('modal-bulk-cancel')
    _selecionados.clear()
    _atualizarBulkBar()
    prxToast(`${candidatos.length} ${candidatos.length !== 1 ? t('pedidosCancelados') : t('pedidoCancelado')}.`, 'success')
  } catch (err) {
    prxToast(t('erroCancelarPedidos') + (err.message || 'tente novamente'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btnConfirmar) btnConfirmar.disabled = false
  }
}
