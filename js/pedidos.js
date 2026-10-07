import { db, collection, query, where, orderBy, getDocs, onSnapshot, doc, runTransaction, serverTimestamp, updateDoc, addDoc } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador, atualizarLateral, registrarFiltroLateral } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, exigirConexao, iniciarTour } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL, STATUS_DOT_COLOR,
  PERFIS, KANBAN_COLUNAS, CATEGORIAS_PADRAO, UNIDADES, MOTIVOS_CANCELAMENTO, corCategoria, t,
} from './constants.js'
import { formatCurrency, formatDate, hojeISO, debounce, normalizarTexto, parseMoeda, esc } from './utils.js'

let _pedidoFonteDuplicar = null
export function agendarDuplicar(pedido) { _pedidoFonteDuplicar = pedido }

let _unsubPedidos = null
let _pedidos = []
window.__getPedidos = () => _pedidos
let _categorias = []
let _empresas = []        // ativas — usadas nos seletores
let _empresasTodas = []   // todas — usadas para exibir o nome (pedidos antigos de empresa inativa)
let _usuarios = []
let _viewMode = 'kanban' // 'kanban' | 'lista'
const _LANE_LIMIT = 5
let _colunasExpandidas = new Set()
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
let _visaoAtiva = null
const _VIEWS_MAX = 8
let _selecionados = new Set()
let _etapaMovel = null      // etapa mostrada no celular (régua)
let _arrastandoToque = false
// Enquanto um cartão está sendo arrastado, mudanças que chegam do banco
// esperam o fim do arrasto (refazer o quadro no meio dele perde o cartão)
let _arrastoAtivo = false
let _renderPendente = false
function _fimDoArrasto() {
  _arrastoAtivo = false
  if (_renderPendente) { _renderPendente = false; _renderView() }
}
const _TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]

// ── Ícones (traço 2, mesma família da barra lateral) ───────────
const _svg = (n, corpo) => `<svg width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`
const ICO = {
  mais:     n => _svg(n, '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  busca:    n => _svg(n, '<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.2" y2="16.2"/>'),
  filtros:  n => _svg(n, '<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>'),
  quadro:   n => _svg(n, '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>'),
  lista:    n => _svg(n, '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>'),
  x:        n => _svg(n, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  relogio:  n => _svg(n, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  setaEsq:  n => _svg(n, '<path d="M15 18l-6-6 6-6"/>'),
  setaDir:  n => _svg(n, '<path d="M9 18l6-6-6-6"/>'),
  editar:   n => _svg(n, '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
  baixar:   n => _svg(n, '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  proibido: n => _svg(n, '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'),
  alerta:   n => _svg(n, '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  marcador: n => _svg(n, '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>'),
}

// ── Filtros rápidos ───────────────────────────────────────────
// 'pendentes' é a "Minha fila" da barra lateral: continua sendo um filtro
// desta tela (e do endereço ?filtro=pendentes), mas não aparece na fileira.
const _FILTROS_PILL = ['todos', 'pendentes', 'urgentes', 'meus', 'semana', 'encerrados']
const _FILTROS_RAPIDOS = ['todos', 'urgentes', 'meus', 'semana', 'encerrados']
function _rotuloFiltro(f) {
  return ({
    todos: t('todos'), urgentes: t('urgentes'), meus: t('meusPedidos'),
    semana: t('estaSemana'), encerrados: t('encerrados'), pendentes: t('navMinhaFila'),
  })[f] || f
}

const _CHAVE_ETAPA_CURTA = {
  solicitado: 'etapaCurtaSolicitado', ag_cotacao: 'etapaCurtaCotacao', em_aprovacao: 'etapaCurtaAprovacao',
  aprovado: 'etapaCurtaAprovado', comprado: 'etapaCurtaComprado', entregue: 'etapaCurtaEntregue',
  pago: 'etapaCurtaPago', reprovado: 'etapaCurtaReprovado', cancelado: 'etapaCurtaCancelado',
}

// ── Render da tela ────────────────────────────────────────────
export async function renderPedidos() {
  const app = document.getElementById('app')
  _arrastoAtivo = false
  _renderPendente = false

  // Filtro pedido pelo endereço (?filtro=pendentes vem de "Minha fila" na barra lateral)
  const filtroUrl = new URLSearchParams(window.location.search).get('filtro')
  if (filtroUrl && _FILTROS_PILL.includes(filtroUrl)) {
    if (filtroUrl !== _filtroAtivo) { _filtroAtivo = filtroUrl; _visaoAtiva = null; _paginaAtual = 0; _etapaMovel = null }
  }

  const opOrdem = [
    ['criadoEm:desc', t('ordemRecentes')], ['criadoEm:asc', t('ordemAntigos')],
    ['prazo:asc', t('ordemPrazo')],
    ['valorEstimado:desc', t('ordemMaiorValor')], ['valorEstimado:asc', t('ordemMenorValor')],
    ['titulo:asc', t('ordemTitulo')], ['status:asc', t('ordemStatus')],
  ]

  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('pedidos')}
      <div class="main-content pedidos-tela">
        <header class="pedidos-head">
          <div class="pedidos-head-top">
            <div class="pedidos-head-titulo">
              <h1 class="titulo-pagina pedidos-title" id="pedidos-titulo">${_filtroAtivo === 'pendentes' ? t('navMinhaFila') : t('titulo')}</h1>
              <p class="pedidos-resumo" id="pedidos-resumo" aria-live="polite">&nbsp;</p>
            </div>
            <button class="btn-primary pedidos-btn-novo" id="btn-novo-pedido" aria-label="${t('novoPedido')}">
              ${ICO.mais(16)}<span class="pedidos-btn-novo-txt">${t('novoPedido')}</span><span class="pedidos-btn-novo-curto" aria-hidden="true">${t('cfgNovoCurto')}</span>
            </button>
          </div>

          <div class="pedidos-controles" id="pedidos-controles">
            <div class="search-input-wrap pedidos-busca">
              ${ICO.busca(15)}
              <input type="search" id="busca-pedidos" placeholder="${t('buscarPedido')}" aria-label="${t('buscarPedido')}" autocomplete="off" enterkeyhint="search">
            </div>

            <div class="pedidos-rapidos" id="filter-pills" role="group" aria-label="${t('filtrosRapidos')}">
              ${_FILTROS_RAPIDOS.map(f => `
                <button type="button" class="rapido" data-filtro="${f}" aria-pressed="false">
                  <span class="rapido-rotulo">${_rotuloFiltro(f)}</span><span class="rapido-n" data-n-filtro="${f}"></span>
                </button>`).join('')}
            </div>

            <div class="pedidos-filtros-wrap">
              <button type="button" class="btn-secondary pedidos-btn-filtros" id="btn-filtros" aria-haspopup="dialog" aria-expanded="false" aria-controls="painel-filtros">
                ${ICO.filtros(15)}<span class="pedidos-btn-filtros-txt">${t('filtros')}</span><span class="pedidos-filtros-n" id="pedidos-filtros-n" hidden></span>
              </button>

              <div class="painel-filtros" id="painel-filtros" role="dialog" aria-modal="false" aria-labelledby="pf-titulo" tabindex="-1" hidden>
                <div class="pf-cabeca">
                  <h2 class="pf-titulo" id="pf-titulo">${t('filtros')}</h2>
                  <span class="pf-ativos" id="pf-ativos"></span>
                  <button type="button" class="pf-limpar" id="btn-limpar-filtros" hidden>${t('limpar')}</button>
                  <button type="button" class="btn-icon pf-fechar" id="btn-fechar-filtros" aria-label="${t('fechar')}">${ICO.x(16)}</button>
                </div>
                <div class="pf-corpo">
                  <div class="pf-grade">
                    <div class="pf-campo" id="pf-campo-empresa" hidden>
                      <label for="fl-empresa-global">${t('colEmpresa')}</label>
                      <select id="fl-empresa-global"><option value="">${t('todasEmpresas')}</option></select>
                    </div>
                    <div class="pf-campo" id="pf-campo-comprador" hidden>
                      <label for="fl-comprador">${t('colComprador')}</label>
                      <select id="fl-comprador"><option value="">${t('TodosCompradores')}</option></select>
                    </div>
                    <div class="pf-campo">
                      <label for="fl-categoria">${t('npCategoria')}</label>
                      <select id="fl-categoria"><option value="">${t('todasCategorias')}</option></select>
                    </div>
                    <div class="pf-campo pf-periodo" role="group" aria-labelledby="pf-periodo-rotulo">
                      <span class="pf-rotulo" id="pf-periodo-rotulo">${t('periodoCriacao')}</span>
                      <div class="pf-datas">
                        <input type="date" id="filtro-data-ini" aria-label="${t('dataInicial')}">
                        <span class="pf-e" aria-hidden="true">${t('periodoE')}</span>
                        <input type="date" id="filtro-data-fim" aria-label="${t('dataFinal')}">
                      </div>
                    </div>
                    <div class="pf-campo pf-ordem">
                      <label for="fl-ordem">${t('ordenarPor')}</label>
                      <select id="fl-ordem">${opOrdem.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
                    </div>
                  </div>
                  <section class="pf-visoes" aria-labelledby="pf-visoes-rotulo">
                    <h3 class="rotulo-secao" id="pf-visoes-rotulo">${t('visoesSalvas')}</h3>
                    <ul class="pf-visoes-lista" id="pf-visoes-lista"></ul>
                    <button type="button" class="pf-salvar" id="btn-salvar-visao">${ICO.marcador(14)}<span>${t('salvarVisaoAtual')}</span></button>
                  </section>
                </div>
                <div class="pf-rodape">
                  <span class="pf-resultado" id="pf-resultado" aria-live="polite"></span>
                  <button type="button" class="btn-primary pf-ver" id="btn-ver-resultado"></button>
                </div>
              </div>
            </div>

            <div class="view-toggle" id="view-toggle" role="group" aria-label="${t('visualizacao')}">
              <button type="button" id="btn-kanban" class="active" aria-pressed="true" aria-label="${t('visaoQuadro')}" title="${t('visaoQuadro')}">${ICO.quadro(15)}</button>
              <button type="button" id="btn-lista" aria-pressed="false" aria-label="${t('visaoLista')}" title="${t('visaoLista')}">${ICO.lista(15)}</button>
            </div>
          </div>
        </header>

        <div id="pedidos-view">${_skeleton()}</div>
      </div>
      ${renderFooter()}
    </div>
    <div class="pf-fundo" id="pf-fundo" hidden></div>

    <!-- Modal Novo Pedido -->
    <div class="modal-overlay" id="modal-novo-pedido" role="dialog" aria-modal="true" aria-labelledby="np-h2">
      <div class="modal np-modal pedidos-modal">
        <div class="modal-header">
          <div class="np-head">
            <h2 id="np-h2">${t('novoPedido')}</h2>
            <p class="np-sub" id="np-sub" hidden></p>
          </div>
          <button class="btn-icon" data-close-modal title="${t('fechar')}" aria-label="${t('fechar')}">${ICO.x(16)}</button>
        </div>
        <div class="modal-body">
          <form id="form-novo-pedido" novalidate>
            <div class="form-grid form-grid-3 np-grid">
              <div class="form-group col-span-3" data-campo="np-titulo">
                <label for="np-titulo">${t('npTitulo')} <span class="np-req" aria-hidden="true">*</span></label>
                <input type="text" id="np-titulo" placeholder="${t('npTituloPlaceholder')}" required maxlength="120" autocomplete="off">
              </div>
              <div class="form-group" data-campo="np-empresa">
                <label for="np-empresa">${t('npEmpresa')} <span class="np-req" aria-hidden="true">*</span></label>
                <select id="np-empresa" required><option value="">${t('selecionar')}</option></select>
              </div>
              <div class="form-group" data-campo="np-quantidade">
                <label for="np-quantidade">${t('npQuantidade')} <span class="np-req" aria-hidden="true">*</span></label>
                <input type="number" id="np-quantidade" placeholder="1" min="1" step="1" inputmode="numeric" required>
              </div>
              <div class="form-group" data-campo="np-unidade">
                <label for="np-unidade">${t('npUnidade')} <span class="np-req" aria-hidden="true">*</span></label>
                <select id="np-unidade" required><option value="">${t('selecionar')}</option></select>
              </div>
              <div class="form-group" data-campo="np-data">
                <label for="np-data">${t('npData')} <span class="np-req" aria-hidden="true">*</span></label>
                <input type="date" id="np-data" required min="${hojeISO()}">
              </div>
              <div class="form-group" data-campo="np-valor">
                <label for="np-valor">${t('npValor')}</label>
                <input type="text" id="np-valor" placeholder="R$ 0,00" inputmode="decimal" autocomplete="off">
              </div>
              <div class="form-group" data-campo="np-cc">
                <label for="np-cc">${t('npCC')}</label>
                <input type="text" id="np-cc" placeholder="${t('opcional')}" maxlength="60" autocomplete="off">
              </div>
              <div class="form-group col-span-3" data-campo="np-categorias">
                <label id="np-categorias-label">${t('npCategoria')} <span class="np-req" aria-hidden="true">*</span></label>
                <div class="category-chips" id="np-categorias" role="radiogroup" aria-labelledby="np-categorias-label"></div>
              </div>
              <div class="form-group col-span-3">
                <div class="toggle-wrap np-urgente" id="np-urgente-wrap" role="switch" aria-checked="false" aria-labelledby="np-urgente-rotulo" aria-describedby="np-urgente-desc" tabindex="0">
                  <div class="np-urgente-txt">
                    <span class="toggle-label" id="np-urgente-rotulo">${t('npUrgente')}<span class="kcard-urg np-urgente-selo" aria-hidden="true">${t('urgenteTag')}</span></span>
                    <span class="np-urgente-desc" id="np-urgente-desc">${t('npUrgenteDesc')}</span>
                  </div>
                  <div class="toggle" id="np-urgente-toggle"></div>
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
          <span class="np-legenda"><span class="np-req">*</span> ${t('campoObrigatorio')}</span>
          <button class="btn-secondary" data-close-modal>${t('cancelar')}</button>
          <button class="btn-primary" id="btn-abrir-pedido">${t('btnAbrirPedido')}</button>
        </div>
      </div>
    </div>

    <!-- Barra de ações em massa (lista) -->
    <div class="bulk-bar" id="bulk-bar" role="region" aria-label="${t('selecionados')}" hidden>
      <span class="bulk-count" id="bulk-count"></span>
      <span class="bulk-sep" aria-hidden="true"></span>
      <div class="bulk-bar-actions">
        <button class="btn-ghost btn-sm" id="btn-bulk-export">
          ${ICO.baixar(14)}<span class="lbl-longo">${t('exportarCSV')}</span><span class="lbl-curto">CSV</span>
        </button>
        <button class="btn-ghost btn-sm bulk-btn-cancel" id="btn-bulk-cancel" hidden>
          ${ICO.proibido(14)}<span class="lbl-longo">${t('cancelarSelecionados')}</span><span class="lbl-curto">${t('cancelar')}</span>
        </button>
      </div>
      <button class="btn-icon bulk-clear" id="btn-bulk-clear" title="${t('desmarcarTudo')}" aria-label="${t('desmarcarTudo')}">${ICO.x(14)}</button>
    </div>

    <!-- Modal Cancelamento em Massa -->
    <div class="modal-overlay" id="modal-bulk-cancel" role="dialog" aria-modal="true" aria-labelledby="bulk-cancel-h2">
      <div class="modal pedidos-modal pedidos-modal-estreito">
        <div class="modal-header">
          <h2 id="bulk-cancel-h2">${t('cancelarSelecionados')}</h2>
          <button class="btn-icon" data-close-bulk-cancel title="${t('fechar')}" aria-label="${t('fechar')}">${ICO.x(16)}</button>
        </div>
        <div class="modal-body">
          <p class="bulk-cancel-msg" id="bulk-cancel-msg"></p>
          <ul class="bulk-cancel-lista" id="bulk-cancel-lista"></ul>
          <div class="form-group" data-campo="bulk-motivo">
            <label for="bulk-motivo">${t('motivoLabel')} <span class="np-req" aria-hidden="true">*</span></label>
            <select id="bulk-motivo">
              <option value="">${t('motivoPlaceholder')}</option>
            </select>
          </div>
          <div class="form-group bulk-motivo-outros" id="bulk-motivo-outros-wrap" data-campo="bulk-motivo-outros" hidden>
            <label for="bulk-motivo-outros">${t('motivoOutros')} <span class="np-req" aria-hidden="true">*</span></label>
            <textarea id="bulk-motivo-outros" rows="2" maxlength="200" placeholder="${t('motivoOutros')}…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-bulk-cancel>${t('voltar')}</button>
          <button class="btn-danger" id="btn-confirmar-bulk-cancel">${t('confirmarCancelamento')}</button>
        </div>
      </div>
    </div>

    <!-- Modal Salvar Visão -->
    <div class="modal-overlay" id="modal-salvar-visao" role="dialog" aria-modal="true" aria-labelledby="visao-h2">
      <div class="modal pedidos-modal pedidos-modal-estreito">
        <div class="modal-header">
          <h2 id="visao-h2">${t('salvarVisao')}</h2>
          <button class="btn-icon" data-close-modal-visao title="${t('fechar')}" aria-label="${t('fechar')}">${ICO.x(16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-group" data-campo="visao-nome">
            <label for="visao-nome">${t('nomeVisao')}</label>
            <input type="text" id="visao-nome" placeholder="${t('nomeVisaoPlaceholder')}" maxlength="40" autocomplete="off">
          </div>
          <div class="visao-resumo">
            <span class="visao-resumo-rotulo">${t('visaoInclui')}</span>
            <div class="visao-resumo-itens" id="visao-resumo-itens"></div>
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
  // "Pedidos" e "Minha fila" na barra lateral trocam o filtro sem refazer a tela
  registrarFiltroLateral(filtro => {
    _filtroAtivo = _FILTROS_PILL.includes(filtro) ? filtro : 'todos'
    _sincronizarControles()
    _mudouFiltro()
  })
  _sincronizarLateral()
  iniciarTour(sessao.isDemo)
  await _carregarDadosAuxiliares()
  _preencherFiltros()
  _preencherModalNovoPedido()
  _bindEvents()
  _carregarViews()
  _sincronizarControles()
  _renderVisoes()

  const fonteDuplicar = _pedidoFonteDuplicar
  _pedidoFonteDuplicar = null
  if (fonteDuplicar) {
    _resetarModalNovoPedido()
    _preencherModalDuplicar(fonteDuplicar)
    abrirModal('modal-novo-pedido')
  }

  _iniciarListenerPedidos()
  renderNotificacoes()
  _initPullToRefresh()
}

// Esqueleto: a mesma inscrição do quadro (fio, numeral, nome, soma) ou as
// linhas da lista, para a tela não "pular" quando os dados chegam
function _skeleton() {
  if (_viewMode === 'lista') {
    const linhas = Array.from({ length: 8 }, (_, i) => `
      <div class="sk-linha" aria-hidden="true">
        <span class="skeleton" style="width:64px"></span>
        <span class="skeleton" style="width:${[46, 38, 52, 34, 44, 40, 48, 36][i]}%"></span>
        <span class="skeleton sk-fim" style="width:84px"></span>
      </div>`).join('')
    return `<div class="pedidos-esqueleto-lista" aria-busy="true" aria-label="${t('carregandoPedidos')}">${linhas}</div>`
  }
  const alturas = [[118, 104, 128], [128, 104], [118], [104, 118, 104], [128, 104], [104, 118], [104]]
  const regua = KANBAN_COLUNAS.map(() => `<span class="regua-item regua-sk" aria-hidden="true"><span class="skeleton sk-regua-n"></span><span class="skeleton sk-regua-nome"></span></span>`).join('')
  const cols = alturas.map((cards, i) => `
    <div class="kanban-col kanban-col-skeleton${i === 0 ? ' atual' : ''}" aria-hidden="true">
      <div class="kanban-col-header">
        <span class="skeleton sk-n"></span>
        <span class="skeleton sk-nome"></span>
        <span class="skeleton sk-soma"></span>
      </div>
      <div class="kanban-cards">
        ${cards.map(h => `<div class="skeleton sk-card" style="height:${h}px"></div>`).join('')}
      </div>
    </div>`).join('')
  return `<div class="kanban-wrap" aria-busy="true" aria-label="${t('carregandoPedidos')}">
      <div class="regua">${regua}</div>
      <div class="kanban-board" style="--cols:7">${cols}</div>
    </div>`
}

// ── Pull-to-refresh (celular) ─────────────────────────────────
function _initPullToRefresh() {
  document.getElementById('pull-indicator')?.remove()

  const indicator = document.createElement('div')
  indicator.id = 'pull-indicator'
  indicator.className = 'pull-indicator'
  indicator.setAttribute('aria-hidden', 'true')
  indicator.innerHTML = _svg(16, '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>')
  document.body.appendChild(indicator)

  let startY = 0
  let pulling = false

  function onTouchStart(e) {
    if (window.scrollY > 2 || document.body.classList.contains('pf-aberto')) return
    startY = e.touches[0].clientY
    pulling = true
    indicator.style.transform = ''
  }

  function onTouchMove(e) {
    if (!pulling) return
    if (_arrastandoToque) { pulling = false; indicator.classList.remove('visible'); return }
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

// ── Estado → controles ────────────────────────────────────────
// O estado dos filtros vive no módulo e sobrevive à navegação; os controles
// são recriados a cada render, então precisam refletir o estado atual.
function _sincronizarControles() {
  document.querySelectorAll('#filter-pills .rapido').forEach(p => {
    const ativo = p.dataset.filtro === _filtroAtivo
    p.classList.toggle('active', ativo)
    p.setAttribute('aria-pressed', ativo ? 'true' : 'false')
  })
  _mostrarRapidoAtivo()
  const busca = document.getElementById('busca-pedidos')
  if (busca && busca.value !== _termoBusca) busca.value = _termoBusca
  const setSel = (id, v) => { const el = document.getElementById(id); if (el) el.value = v }
  setSel('fl-empresa-global', _filtroEmpresa)
  setSel('fl-categoria', _filtroCategoria)
  setSel('fl-comprador', _filtroComprador)
  setSel('fl-ordem', `${_ordemCampo}:${_ordemDesc ? 'desc' : 'asc'}`)
  const ini = document.getElementById('filtro-data-ini')
  const fim = document.getElementById('filtro-data-fim')
  if (ini) { ini.value = _filtroDataIni; ini.max = _filtroDataFim || '' }
  if (fim) { fim.value = _filtroDataFim; fim.min = _filtroDataIni || '' }
  const kb = document.getElementById('btn-kanban')
  const ls = document.getElementById('btn-lista')
  kb?.classList.toggle('active', _viewMode === 'kanban')
  ls?.classList.toggle('active', _viewMode === 'lista')
  kb?.setAttribute('aria-pressed', String(_viewMode === 'kanban'))
  ls?.setAttribute('aria-pressed', String(_viewMode === 'lista'))
  const painel = document.getElementById('painel-filtros')
  if (painel) painel.dataset.modo = _viewMode
  _atualizarIndicadorFiltros()
}

// Celular: a fileira de filtros rápidos rola sozinha até o ativo
function _mostrarRapidoAtivo() {
  const fileira = document.getElementById('filter-pills')
  const ativo = fileira?.querySelector('.rapido.active')
  if (!fileira || !ativo || fileira.scrollWidth <= fileira.clientWidth) return
  const esq = ativo.offsetLeft - fileira.offsetLeft
  if (esq < fileira.scrollLeft || esq + ativo.offsetWidth > fileira.scrollLeft + fileira.clientWidth) {
    fileira.scrollLeft = Math.max(0, esq - 16)
  }
}

function _contarFiltrosPainel() {
  return (_filtroEmpresa ? 1 : 0) + ((_filtroDataIni || _filtroDataFim) ? 1 : 0) +
    (_filtroCategoria ? 1 : 0) + (_filtroComprador ? 1 : 0)
}

// Filtros do painel: número no botão, "N ativos" e "Limpar"
function _atualizarIndicadorFiltros() {
  const n = _contarFiltrosPainel()
  const badge = document.getElementById('pedidos-filtros-n')
  if (badge) { badge.hidden = n === 0; badge.textContent = String(n) }
  const btn = document.getElementById('btn-filtros')
  btn?.classList.toggle('tem-filtro', n > 0)
  btn?.setAttribute('aria-label', n ? `${t('filtros')}: ${n === 1 ? t('filtrosAtivos1') : t('filtrosAtivos').replace('{n}', n)}` : t('filtros'))
  const ativos = document.getElementById('pf-ativos')
  if (ativos) ativos.textContent = n ? (n === 1 ? t('filtrosAtivos1') : t('filtrosAtivos').replace('{n}', n)) : ''
  const limpar = document.getElementById('btn-limpar-filtros')
  if (limpar) limpar.hidden = n === 0
}

// Barra lateral e endereço acompanham o filtro ativo ("Minha fila" = pendentes)
function _sincronizarLateral() {
  atualizarLateral({ filtroPedidos: _filtroAtivo })
  const url = new URL(window.location)
  if (url.searchParams.get('tela') !== 'pedidos' && url.searchParams.has('tela')) return
  if (_filtroAtivo === 'todos') url.searchParams.delete('filtro'); else url.searchParams.set('filtro', _filtroAtivo)
  if (url.toString() !== window.location.href) window.history.replaceState({}, '', url)
}

function _mudouFiltro() {
  _sincronizarLateral()
  _paginaAtual = 0
  _etapaMovel = null
  if (_visaoAtiva) { _visaoAtiva = null; _renderVisoes() }
  _atualizarIndicadorFiltros()
  _renderView()
}

function _limparTodosFiltros() {
  _filtroAtivo = 'todos'
  _termoBusca = ''
  _filtroCategoria = ''
  _filtroEmpresa = ''
  _filtroComprador = ''
  _filtroDataIni = ''
  _filtroDataFim = ''
  _sincronizarControles()
  _mudouFiltro()
}

function _limparFiltrosPainel() {
  _filtroCategoria = ''
  _filtroEmpresa = ''
  _filtroComprador = ''
  _filtroDataIni = ''
  _filtroDataFim = ''
  _sincronizarControles()
  _mudouFiltro()
}

// ── Painel de filtros ─────────────────────────────────────────
function _painelAberto() {
  const p = document.getElementById('painel-filtros')
  return !!p && !p.hidden
}

function _abrirPainel() {
  const painel = document.getElementById('painel-filtros')
  const btn = document.getElementById('btn-filtros')
  if (!painel || !btn) return
  painel.hidden = false
  document.getElementById('pf-fundo')?.removeAttribute('hidden')
  btn.setAttribute('aria-expanded', 'true')
  btn.classList.add('aberto')
  document.body.classList.add('pf-aberto')
  _renderVisoes()
  // Computador: o painel termina antes da borda de baixo da janela (o corpo rola por dentro)
  painel.style.maxHeight = ''
  if (getComputedStyle(painel).position === 'absolute') {
    painel.style.maxHeight = Math.max(320, window.innerHeight - painel.getBoundingClientRect().top - 16) + 'px'
  }
  requestAnimationFrame(() => painel.focus({ preventScroll: true }))
}

function _fecharPainel(devolverFoco = false) {
  const painel = document.getElementById('painel-filtros')
  const btn = document.getElementById('btn-filtros')
  if (!painel || painel.hidden) return
  painel.hidden = true
  document.getElementById('pf-fundo')?.setAttribute('hidden', '')
  btn?.setAttribute('aria-expanded', 'false')
  btn?.classList.remove('aberto')
  document.body.classList.remove('pf-aberto')
  if (devolverFoco) btn?.focus({ preventScroll: true })
}

// Resultado mostrado no rodapé do painel ("Ver 12 pedidos")
function _atualizarResultadoPainel(n) {
  const txt = n === 0 ? `${t('verResultado0')} · ${t('fechar')}` : (n === 1 ? t('verResultado1') : t('verResultado').replace('{n}', n))
  const btn = document.getElementById('btn-ver-resultado')
  if (btn) btn.textContent = txt
  const res = document.getElementById('pf-resultado')
  if (res) res.innerHTML = n === 0 ? t('verResultado0') : `<span class="numeral">${n}</span> ${n === 1 ? t('pedidoSing') : t('pedidosPlural')}`
}

// ── Eventos ───────────────────────────────────────────────────
function _bindEvents() {
  // Filtros rápidos
  document.getElementById('filter-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filtro]')
    if (!btn) return
    _filtroAtivo = btn.dataset.filtro
    _sincronizarControles()
    _mudouFiltro()
  })

  // Busca
  document.getElementById('busca-pedidos')?.addEventListener('input',
    debounce(e => { _termoBusca = e.target.value; _mudouFiltro() }, 250)
  )

  // Atalho "/" foca a busca (fora de campos de texto)
  const onKey = e => {
    if (e.key === 'Escape' && _painelAberto()) {
      if (document.querySelector('.calendario.aberto, .dialog-overlay.visible')) return
      e.preventDefault()
      _fecharPainel(true)
      return
    }
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
    const alvo = e.target
    if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return
    if (document.querySelector('.modal-overlay.visible')) return
    const busca = document.getElementById('busca-pedidos')
    if (!busca || !busca.offsetParent) return
    e.preventDefault()
    busca.focus()
  }
  document.addEventListener('keydown', onKey)

  // Clique fora fecha o painel (o calendário e os diálogos ficam fora dele, mas contam como dentro)
  const onFora = e => {
    if (!_painelAberto()) return
    const alvo = e.target
    if (alvo.closest?.('#painel-filtros, #btn-filtros, .calendario, .dialog-overlay, .modal-overlay')) return
    _fecharPainel(false)
  }
  document.addEventListener('mousedown', onFora, true)
  registrarLimpador(() => {
    document.removeEventListener('keydown', onKey)
    document.removeEventListener('mousedown', onFora, true)
    document.body.classList.remove('pf-aberto', 'pedidos-com-selecao')
  })

  // Alternar quadro / lista
  const trocarVisualizacao = modo => {
    if (_viewMode === modo) return
    _viewMode = modo
    _paginaAtual = 0
    _sincronizarControles()
    if (_visaoAtiva) { _visaoAtiva = null; _renderVisoes() }
    _renderView()
  }
  document.getElementById('btn-kanban')?.addEventListener('click', () => trocarVisualizacao('kanban'))
  document.getElementById('btn-lista')?.addEventListener('click', () => trocarVisualizacao('lista'))

  // Painel de filtros
  document.getElementById('btn-filtros')?.addEventListener('click', () => {
    if (_painelAberto()) _fecharPainel(true); else _abrirPainel()
  })
  document.getElementById('btn-fechar-filtros')?.addEventListener('click', () => _fecharPainel(true))
  document.getElementById('btn-ver-resultado')?.addEventListener('click', () => _fecharPainel(true))
  document.getElementById('pf-fundo')?.addEventListener('click', () => _fecharPainel(true))
  document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
    _limparFiltrosPainel()
    document.getElementById('painel-filtros')?.focus({ preventScroll: true })
  })
  document.getElementById('fl-empresa-global')?.addEventListener('change', e => { _filtroEmpresa = e.target.value; _mudouFiltro() })
  document.getElementById('fl-categoria')?.addEventListener('change', e => { _filtroCategoria = e.target.value; _mudouFiltro() })
  document.getElementById('fl-comprador')?.addEventListener('change', e => { _filtroComprador = e.target.value; _mudouFiltro() })
  document.getElementById('fl-ordem')?.addEventListener('change', e => {
    const [campo, dir] = e.target.value.split(':')
    _ordemCampo = campo; _ordemDesc = dir === 'desc'
    _mudouFiltro()
  })
  document.getElementById('filtro-data-ini')?.addEventListener('change', e => {
    _filtroDataIni = e.target.value
    const fim = document.getElementById('filtro-data-fim')
    if (fim) fim.min = _filtroDataIni || ''
    _mudouFiltro()
  })
  document.getElementById('filtro-data-fim')?.addEventListener('change', e => {
    _filtroDataFim = e.target.value
    const ini = document.getElementById('filtro-data-ini')
    if (ini) ini.max = _filtroDataFim || ''
    _mudouFiltro()
  })

  // Visões salvas (dentro do painel)
  document.getElementById('pf-visoes-lista')?.addEventListener('click', e => {
    const aplicar = e.target.closest('[data-aplicar-view]')
    const renomear = e.target.closest('[data-renomear-view]')
    const remover = e.target.closest('[data-remover-view]')
    if (aplicar) {
      const v = _viewsSalvas.find(x => x.id === aplicar.dataset.aplicarView)
      if (v) { _aplicarView(v); _fecharPainel(true) }
    } else if (renomear) _renomearView(renomear.dataset.renomearView)
    else if (remover) _removerView(remover.dataset.removerView)
  })
  document.getElementById('btn-salvar-visao')?.addEventListener('click', () => {
    _fecharPainel(false)
    const inp = document.getElementById('visao-nome')
    if (inp) inp.value = ''
    _limparErroCampo('visao-nome')
    _preencherResumoVisao()
    abrirModal('modal-salvar-visao')
    setTimeout(() => inp?.focus(), 60)
  })

  // Modal novo pedido — urgente (switch acessível)
  const wrapUrg = document.getElementById('np-urgente-wrap')
  const alternarUrgente = () => {
    const on = document.getElementById('np-urgente-toggle')?.classList.toggle('on')
    wrapUrg?.setAttribute('aria-checked', on ? 'true' : 'false')
    wrapUrg?.classList.toggle('on', !!on)
  }
  wrapUrg?.addEventListener('click', alternarUrgente)
  wrapUrg?.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternarUrgente() }
  })

  // Chips de categoria (seleção exclusiva)
  document.getElementById('np-categorias')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip')
    if (!chip) return
    document.querySelectorAll('#np-categorias .chip').forEach(c => {
      c.classList.toggle('selected', c === chip)
      c.setAttribute('aria-checked', c === chip ? 'true' : 'false')
    })
    _limparErroCampo('np-categorias')
  })

  // Limpa o erro do campo assim que o usuário mexe nele
  ;['np-titulo', 'np-empresa', 'np-quantidade', 'np-unidade', 'np-data'].forEach(id => {
    const el = document.getElementById(id)
    el?.addEventListener('input', () => _limparErroCampo(id))
    el?.addEventListener('change', () => _limparErroCampo(id))
  })

  // Valor estimado: formata ao sair do campo
  document.getElementById('np-valor')?.addEventListener('blur', e => {
    const v = e.target.value.trim()
    if (!v) return
    const n = parseMoeda(v)
    e.target.value = n > 0 ? formatCurrency(n) : ''
  })

  // Abrir modal
  document.getElementById('btn-novo-pedido')?.addEventListener('click', () => {
    _fecharPainel(false)
    _resetarModalNovoPedido()
    abrirModal('modal-novo-pedido')
    setTimeout(() => document.getElementById('np-titulo')?.focus(), 60)
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

  // Ações em massa
  document.getElementById('btn-bulk-clear')?.addEventListener('click', () => {
    _selecionados.clear()
    _atualizarBulkBar()
    document.querySelectorAll('.bulk-cb').forEach(cb => { cb.checked = false })
    document.querySelectorAll('tr.selecionada').forEach(tr => tr.classList.remove('selecionada'))
    const cbAll = document.getElementById('cb-select-all')
    if (cbAll) { cbAll.checked = false; cbAll.indeterminate = false }
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
    if (wrap) wrap.hidden = e.target.value !== 'Outros'
    _limparErroCampo('bulk-motivo')
  })
  document.getElementById('bulk-motivo-outros')?.addEventListener('input', () => _limparErroCampo('bulk-motivo-outros'))
  document.getElementById('btn-confirmar-bulk-cancel')?.addEventListener('click', _confirmarBulkCancel)

  // Salvar visão (modal)
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
  document.getElementById('visao-nome')?.addEventListener('input', () => _limparErroCampo('visao-nome'))
}

// ── Validação inline ──────────────────────────────────────────
function _marcarErroCampo(campo, msg) {
  const grupo = document.querySelector(`[data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.add('invalido')
  let el = grupo.querySelector('.form-error')
  if (!el) {
    el = document.createElement('span')
    el.className = 'form-error'
    el.id = `${campo}-erro`
    grupo.appendChild(el)
  }
  el.textContent = msg
  const input = document.getElementById(campo)
  if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id) }
}

function _limparErroCampo(campo) {
  const grupo = document.querySelector(`[data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.remove('invalido')
  grupo.querySelector('.form-error')?.remove()
  const input = document.getElementById(campo)
  if (input) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby') }
}

function _resetarModalNovoPedido() {
  document.getElementById('form-novo-pedido')?.reset()
  const tg = document.getElementById('np-urgente-toggle')
  tg?.classList.remove('on')
  const wrap = document.getElementById('np-urgente-wrap')
  wrap?.setAttribute('aria-checked', 'false')
  wrap?.classList.remove('on')
  document.querySelectorAll('#np-categorias .chip').forEach(c => {
    c.classList.remove('selected'); c.setAttribute('aria-checked', 'false')
  })
  document.querySelectorAll('#form-novo-pedido [data-campo]').forEach(g => _limparErroCampo(g.dataset.campo))
  const h2 = document.getElementById('np-h2')
  if (h2) h2.textContent = t('novoPedido')
  const sub = document.getElementById('np-sub')
  if (sub) { sub.hidden = true; sub.textContent = '' }
  const btn = document.getElementById('btn-abrir-pedido')
  if (btn) btn.textContent = t('btnAbrirPedido')
  // Com uma única empresa disponível, ela já vem escolhida
  const emp = document.getElementById('np-empresa')
  if (emp && emp.options.length === 2) emp.selectedIndex = 1
}

function _validarNovoPedido(v) {
  const erros = []
  if (!v.titulo) erros.push(['np-titulo', t('campoObrigatorio')])
  if (!v.empresaId) erros.push(['np-empresa', t('campoObrigatorio')])
  if (!v.quantidade) erros.push(['np-quantidade', t('campoObrigatorio')])
  else if (!(Number(v.quantidade) >= 1)) erros.push(['np-quantidade', t('quantidadeMinima')])
  if (!v.unidade) erros.push(['np-unidade', t('campoObrigatorio')])
  if (!v.data) erros.push(['np-data', t('campoObrigatorio')])
  else if (v.data < hojeISO()) erros.push(['np-data', t('dataNoPassado')])
  if (!v.categoriaId) erros.push(['np-categorias', t('escolhaCategoria')])
  return erros
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

  document.querySelectorAll('#form-novo-pedido [data-campo]').forEach(g => _limparErroCampo(g.dataset.campo))
  const erros = _validarNovoPedido({ titulo, empresaId, quantidade, unidade, data, categoriaId })
  if (erros.length) {
    erros.forEach(([campo, msg]) => _marcarErroCampo(campo, msg))
    const primeiro = document.getElementById(erros[0][0])
    const visivel = primeiro?.classList.contains('campo-data-nativo') ? primeiro.nextElementSibling : primeiro
    if (visivel && visivel.focus) visivel.focus({ preventScroll: true })
    document.querySelector(`[data-campo="${erros[0][0]}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    prxToast(t('erroCamposObrigatorios'), 'error')
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
        solicitanteNome: sessao.usuario.nome || null,
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
    prxToast(t('pedidoAberto'), 'success')
  } catch (err) {
    prxToast(t('erroAbrirPedido'), 'error')
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
    // Seleção só guarda pedidos que ainda existem
    const ids = new Set(_pedidos.map(p => p.id))
    ;[..._selecionados].forEach(id => { if (!ids.has(id)) _selecionados.delete(id) })
    if (_arrastoAtivo) { _renderPendente = true; return }
    _renderView()
  }, err => {
    console.error(err)
    prxToast(t('erroCarregarPedidos'), 'error')
    const container = document.getElementById('pedidos-view')
    if (container) {
      container.innerHTML = _estadoVazioHTML({
        icone: ICO.alerta(22),
        titulo: t('erroCarregarPedidos'),
        sub: t('verificarConexao'),
        acao: `<button class="btn-secondary btn-sm" id="btn-empty-recarregar">${t('recarregar')}</button>`,
      })
      container.querySelector('#btn-empty-recarregar')?.addEventListener('click', () => window.location.reload())
    }
  })

  registrarLimpador(() => {
    if (_unsubPedidos) { _unsubPedidos(); _unsubPedidos = null }
  })
}

// ── Filtragem ─────────────────────────────────────────────────
function _tsDate(ts) {
  if (!ts) return null
  return ts.toDate ? ts.toDate() : new Date(ts)
}

// Aplica só o filtro rápido — usado também para contar cada um e a "Minha fila"
function _aplicarPill(lista, filtro) {
  const uid = sessao.usuario.id
  switch (filtro) {
    case 'urgentes':   return lista.filter(p => p.urgente)
    case 'meus':       return lista.filter(p => p.solicitanteId === uid || p.compradorId === uid)
    case 'encerrados': return lista.filter(p => [STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
    case 'semana': {
      const hoje = hojeISO()
      const [y, m, d] = hoje.split('-').map(Number)
      const inicioSemana = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay())
      return lista.filter(p => {
        const ts = _tsDate(p.criadoEm)
        return ts ? ts >= inicioSemana : false
      })
    }
    case 'pendentes': {
      const perfil = sessao.usuario.perfil
      const agora  = Date.now()
      const h48    = 48 * 3600000
      if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
        return lista.filter(p => {
          if (_TERMINAIS.includes(p.status)) return false
          if (p.urgente) return true
          const ts = _tsDate(p.atualizadoEm)
          return ts && (agora - ts.getTime()) > h48
        })
      }
      if (perfil === PERFIS.APROVADOR) return lista.filter(p => p.status === STATUS.EM_APROVACAO)
      if (perfil === PERFIS.COMPRADOR) {
        return lista.filter(p =>
          (p.status === STATUS.SOLICITADO && !p.compradorId) ||
          (p.status === STATUS.AG_COTACAO && p.compradorId === uid)
        )
      }
      if (perfil === PERFIS.FINANCEIRO) return lista.filter(p => p.status === STATUS.ENTREGUE)
      // solicitante: seus pedidos não encerrados
      return lista.filter(p => p.solicitanteId === uid && !_TERMINAIS.includes(p.status))
    }
    default: return lista
  }
}

function _valorPedido(p) {
  return p.valorFinal ?? p.valorEstimado ?? null
}

// Filtros do painel e busca (tudo menos o filtro rápido)
function _aplicarExtras(origem) {
  let lista = [...origem]
  if (_filtroCategoria) lista = lista.filter(p => p.categoriaId === _filtroCategoria)
  if (_filtroEmpresa)   lista = lista.filter(p => p.empresaId   === _filtroEmpresa)
  if (_filtroComprador) lista = lista.filter(p => p.compradorId === _filtroComprador)

  if (_filtroDataIni || _filtroDataFim) {
    lista = lista.filter(p => {
      const ts = _tsDate(p.criadoEm)
      if (!ts) return true
      const iso = _tsToISO(ts)
      if (_filtroDataIni && iso < _filtroDataIni) return false
      if (_filtroDataFim && iso > _filtroDataFim) return false
      return true
    })
  }

  if (_termoBusca.trim()) {
    const termo = normalizarTexto(_termoBusca.trim())
    lista = lista.filter(p =>
      normalizarTexto(p.titulo || '').includes(termo) ||
      normalizarTexto(p.descricao || '').includes(termo) ||
      normalizarTexto(p.numeroPedido || '').includes(termo) ||
      normalizarTexto(_nomeEmpresa(p.empresaId)).includes(termo)
    )
  }
  return lista
}

function _ordenarLista(lista) {
  if (_viewMode !== 'lista') return lista
  const dir = _ordemDesc ? -1 : 1
  return lista.sort((a, b) => {
    let va, vb
    switch (_ordemCampo) {
      case 'titulo':
        va = normalizarTexto(a.titulo || ''); vb = normalizarTexto(b.titulo || ''); break
      case 'valorEstimado':
        va = _valorPedido(a) || 0; vb = _valorPedido(b) || 0; break
      case 'status':
        va = _ordemStatus(a.status); vb = _ordemStatus(b.status); break
      case 'prazo':
        // Encerrados e sem prazo vão para o fim
        va = (!_TERMINAIS.includes(a.status) && a.dataNecessaria) || '9999'
        vb = (!_TERMINAIS.includes(b.status) && b.dataNecessaria) || '9999'
        break
      default:
        va = _tsMs(a.criadoEm); vb = _tsMs(b.criadoEm)
    }
    if (va < vb) return -dir
    if (va > vb) return dir
    return 0
  })
}

function _filtrarPedidos() {
  return _ordenarLista(_aplicarPill(_aplicarExtras(_pedidos), _filtroAtivo))
}

// Ordena status pela etapa do fluxo, não pelo nome
function _ordemStatus(status) {
  const ordem = [...KANBAN_COLUNAS, STATUS.REPROVADO, STATUS.CANCELADO]
  const i = ordem.indexOf(status)
  return i === -1 ? 99 : i
}

// Etapa que concentra a fila do usuário (numeral em terracota no quadro)
function _statusDaFila() {
  const fila = _aplicarPill(_pedidos, 'pendentes')
  if (!fila.length) return null
  const cont = {}
  fila.forEach(p => { cont[p.status] = (cont[p.status] || 0) + 1 })
  let melhor = null
  KANBAN_COLUNAS.forEach(st => { if ((cont[st] || 0) > (cont[melhor] || 0)) melhor = st })
  return melhor
}

// ── Cabeçalho: título, resumo e contadores ────────────────────
const _moedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })

function _atualizarContadores(base) {
  // Lateral: totais sem os filtros da tela
  const fila = _aplicarPill(_pedidos, 'pendentes').length
  atualizarLateral({ contagens: { pedidos: _pedidos.length, fila } })
  // Fileira: quanto cada filtro rápido mostraria com a busca e o painel atuais
  document.querySelectorAll('#filter-pills [data-n-filtro]').forEach(el => {
    el.textContent = String(_aplicarPill(base, el.dataset.nFiltro).length)
  })
}

function _descricaoFila() {
  const perfil = sessao.usuario.perfil
  if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) return t('filaDescGestor')
  if (perfil === PERFIS.APROVADOR) return t('filaDescAprovador')
  if (perfil === PERFIS.COMPRADOR) return t('filaDescComprador')
  if (perfil === PERFIS.FINANCEIRO) return t('filaDescFinanceiro')
  return t('filaDescSolicitante')
}

function _atualizarTitulo() {
  const h1 = document.getElementById('pedidos-titulo')
  const titulo = _filtroAtivo === 'pendentes' ? t('navMinhaFila') : t('titulo')
  if (h1 && h1.textContent !== titulo) h1.textContent = titulo
}

function _atualizarResumo(lista) {
  const el = document.getElementById('pedidos-resumo')
  if (!el) return
  const n = lista.length
  const abertos = lista.filter(p => !_TERMINAIS.includes(p.status))
  const urgentes = abertos.filter(p => p.urgente).length
  const valorAberto = abertos.reduce((s, p) => s + (Number(_valorPedido(p)) || 0), 0)
  const partes = [n === 0 ? t('resumoNenhum') : `${n} ${n === 1 ? t('pedidoSing') : t('pedidosPlural')}`]
  if (urgentes) partes.push(`${urgentes} ${urgentes === 1 ? t('urgenteSing') : t('urgentesPlural')}`)
  if (valorAberto > 0) partes.push(`<span title="${formatCurrency(valorAberto)}">${_moedaCompacta.format(valorAberto)}</span> ${t('emAberto')}`)
  let extra = ''
  if (_filtroAtivo === 'pendentes') extra = _descricaoFila()
  else if (_filtroAtivo === 'encerrados') extra = t('resumoEncerrados')
  else if (_viewMode === 'kanban' && n > 0) extra = t('resumoEtapas')
  el.innerHTML = `${partes.join(', ')}.${extra ? ` <span class="resumo-extra">${extra}</span>` : ''}`
}

// ── Render view ───────────────────────────────────────────────
function _renderView() {
  const container = document.getElementById('pedidos-view')
  if (!container) return
  const base = _aplicarExtras(_pedidos)
  const lista = _ordenarLista(_aplicarPill(base, _filtroAtivo))
  _atualizarTitulo()
  _atualizarResumo(lista)
  _atualizarContadores(base)
  _atualizarResultadoPainel(lista.length)

  if (_viewMode === 'kanban') {
    _selecionados.clear()
    _atualizarBulkBar()
    const scrollAnterior = container.querySelector('.kanban-board')?.scrollLeft || 0
    container.innerHTML = _renderKanban(lista)
    container.querySelectorAll('.kcard').forEach(card => {
      card.addEventListener('click', () => navegar('detalhe', { id: card.dataset.id }))
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); navegar('detalhe', { id: card.dataset.id }) }
      })
    })
    container.querySelectorAll('[data-ver-mais]').forEach(btn => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.verMais
        if (_colunasExpandidas.has(st)) _colunasExpandidas.delete(st)
        else _colunasExpandidas.add(st)
        _etapaMovel = st
        _renderView()
      })
    })
    _bindEmptyActions(container)
    _bindRegua(container)
    _bindDragDrop(container)
    _bindBoardScroll(container, scrollAnterior)
    return
  }

  const totalFiltrada = lista.length
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrada / _PAGE_SIZE))
  if (_paginaAtual >= totalPaginas) _paginaAtual = Math.max(0, totalPaginas - 1)
  const inicio = _paginaAtual * _PAGE_SIZE
  const listaPaginada = lista.slice(inicio, inicio + _PAGE_SIZE)

  container.innerHTML = _renderLista(listaPaginada, totalFiltrada, totalPaginas, inicio)
  _bindEmptyActions(container)

  container.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar('detalhe', { id: row.dataset.id }))
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target === row) { e.preventDefault(); navegar('detalhe', { id: row.dataset.id }) }
    })
  })
  container.querySelectorAll('th.sortable[data-campo]').forEach(th => {
    const ordenar = () => {
      const campo = th.dataset.campo
      if (_ordemCampo === campo) { _ordemDesc = !_ordemDesc } else { _ordemCampo = campo; _ordemDesc = !['titulo', 'prazo', 'status'].includes(campo) }
      _sincronizarControles()
      _mudouFiltro()
    }
    th.addEventListener('click', ordenar)
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar() } })
  })

  // Seleção múltipla
  const sincronizarCabecalho = () => {
    const todos = [...container.querySelectorAll('.bulk-cb')]
    const cbAll = container.querySelector('#cb-select-all')
    if (!cbAll) return
    const marcados = todos.filter(c => c.checked).length
    cbAll.checked = todos.length > 0 && marcados === todos.length
    cbAll.indeterminate = marcados > 0 && marcados < todos.length
  }
  container.querySelectorAll('td.bulk-cb-cell').forEach(td => {
    td.addEventListener('click', e => {
      e.stopPropagation()
      // Clique na célula (fora do checkbox) também marca — alvo de toque maior
      if (e.target.tagName !== 'INPUT') {
        const cb = td.querySelector('.bulk-cb')
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')) }
      }
    })
  })
  container.querySelectorAll('.bulk-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _selecionados.add(cb.dataset.id)
      else _selecionados.delete(cb.dataset.id)
      cb.closest('tr')?.classList.toggle('selecionada', cb.checked)
      _atualizarBulkBar()
      sincronizarCabecalho()
    })
  })
  const cbAll = container.querySelector('#cb-select-all')
  cbAll?.addEventListener('change', () => {
    container.querySelectorAll('.bulk-cb').forEach(cb => {
      cb.checked = cbAll.checked
      cb.closest('tr')?.classList.toggle('selecionada', cbAll.checked)
      if (cbAll.checked) _selecionados.add(cb.dataset.id)
      else _selecionados.delete(cb.dataset.id)
    })
    _atualizarBulkBar()
  })
  sincronizarCabecalho()
  _atualizarBulkBar()

  container.querySelector('#btn-pagina-ant')?.addEventListener('click', () => {
    if (_paginaAtual > 0) { _paginaAtual--; _renderView(); _rolarParaLista() }
  })
  container.querySelector('#btn-pagina-prox')?.addEventListener('click', () => {
    if (_paginaAtual < totalPaginas - 1) { _paginaAtual++; _renderView(); _rolarParaLista() }
  })
}

function _rolarParaLista() {
  const alvo = document.getElementById('pedidos-view')
  if (!alvo) return
  const topo = alvo.getBoundingClientRect().top + window.scrollY - 80
  if (window.scrollY > topo) window.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' })
}

// ── Quadro: rolagem horizontal com indicação (telas estreitas) ─
function _bindBoardScroll(container, scrollInicial = 0) {
  const wrap  = container.querySelector('.kanban-wrap')
  const board = wrap?.querySelector('.kanban-board')
  if (!wrap || !board) return
  const atualizar = () => {
    const max = board.scrollWidth - board.clientWidth
    wrap.classList.toggle('tem-esq', board.scrollLeft > 4)
    wrap.classList.toggle('tem-dir', board.scrollLeft < max - 4)
  }
  if (scrollInicial) board.scrollLeft = scrollInicial
  board.addEventListener('scroll', atualizar, { passive: true })
  const passo = () => {
    const col = board.querySelector('.kanban-col')
    const w = col ? col.getBoundingClientRect().width + 10 : 160
    return Math.max(w, Math.floor(board.clientWidth / w) * w - w)
  }
  wrap.querySelector('[data-board-ant]')?.addEventListener('click', () => board.scrollBy({ left: -passo(), behavior: 'smooth' }))
  wrap.querySelector('[data-board-prox]')?.addEventListener('click', () => board.scrollBy({ left: passo(), behavior: 'smooth' }))
  atualizar()
  if (!window.__pedidosResizeBound) {
    window.__pedidosResizeBound = true
    const onResize = debounce(() => {
      const w = document.querySelector('#pedidos-view .kanban-wrap')
      const b = w?.querySelector('.kanban-board')
      if (!w || !b) return
      const max = b.scrollWidth - b.clientWidth
      w.classList.toggle('tem-esq', b.scrollLeft > 4)
      w.classList.toggle('tem-dir', b.scrollLeft < max - 4)
    }, 120)
    window.addEventListener('resize', onResize)
    registrarLimpador(() => { window.removeEventListener('resize', onResize); window.__pedidosResizeBound = false })
  }
}

// ── Celular: régua de etapas ──────────────────────────────────
// Os sete numerais ficam numa régua tocável; a etapa escolhida aparece
// sozinha, em lista vertical. Deslizar para os lados troca de etapa.
function _selecionarEtapa(status, { focar = false, rolar = false } = {}) {
  const view = document.getElementById('pedidos-view')
  if (!view || !status) return
  _etapaMovel = status
  view.querySelectorAll('.regua-item[data-etapa]').forEach(b => {
    const on = b.dataset.etapa === status
    b.classList.toggle('ativa', on)
    b.setAttribute('aria-selected', on ? 'true' : 'false')
    b.tabIndex = on ? 0 : -1
    if (on && focar) b.focus({ preventScroll: true })
  })
  view.querySelectorAll('.kanban-col[data-status]').forEach(c => c.classList.toggle('atual', c.dataset.status === status))
  if (rolar) {
    const regua = view.querySelector('.regua')
    const wrap = view.querySelector('.kanban-wrap')
    if (regua && wrap) {
      const fixo = parseFloat(getComputedStyle(regua).top) || 0
      const topoWrap = wrap.getBoundingClientRect().top + window.scrollY - fixo
      if (window.scrollY > topoWrap) window.scrollTo({ top: topoWrap })
    }
  }
}

function _bindRegua(container) {
  const regua = container.querySelector('.regua[role="tablist"]')
  if (!regua) return
  const itens = () => [...regua.querySelectorAll('.regua-item[data-etapa]')]
  regua.addEventListener('click', e => {
    const b = e.target.closest('.regua-item[data-etapa]')
    if (b) _selecionarEtapa(b.dataset.etapa, { rolar: true })
  })
  regua.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const lista = itens()
    const i = lista.findIndex(b => b.dataset.etapa === _etapaMovel)
    let j = i
    if (e.key === 'ArrowLeft') j = Math.max(0, i - 1)
    if (e.key === 'ArrowRight') j = Math.min(lista.length - 1, i + 1)
    if (e.key === 'Home') j = 0
    if (e.key === 'End') j = lista.length - 1
    e.preventDefault()
    _selecionarEtapa(lista[j].dataset.etapa, { focar: true })
  })

  // Deslizar a lista para os lados troca de etapa
  const board = container.querySelector('.kanban-board')
  let x0 = 0, y0 = 0, ativo = false
  board?.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { ativo = false; return }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; ativo = true
  }, { passive: true })
  board?.addEventListener('touchend', e => {
    if (!ativo || _arrastandoToque) { ativo = false; return }
    ativo = false
    if (!regua.offsetParent) return // só no celular, com a régua visível
    const dx = e.changedTouches[0].clientX - x0
    const dy = e.changedTouches[0].clientY - y0
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return
    const lista = itens()
    const i = lista.findIndex(b => b.dataset.etapa === _etapaMovel)
    const j = dx < 0 ? i + 1 : i - 1
    if (j >= 0 && j < lista.length) _selecionarEtapa(lista[j].dataset.etapa, { rolar: true })
  }, { passive: true })
}

// ── Arrastar e soltar ─────────────────────────────────────────
// Só passos de uma etapa que não exigem dados extras. Indicar cotação (Em cotação → Em aprovação)
// e registrar a compra (Aprovado → Comprado) pedem informações e ficam na tela do pedido.
function _transicoesDragPermitidas(perfil) {
  if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    return {
      [STATUS.SOLICITADO]:   [STATUS.AG_COTACAO],
      [STATUS.EM_APROVACAO]: [STATUS.APROVADO],
      [STATUS.COMPRADO]:     [STATUS.ENTREGUE],
      [STATUS.ENTREGUE]:     [STATUS.PAGO],
    }
  }
  if (perfil === PERFIS.APROVADOR) return {
    [STATUS.EM_APROVACAO]: [STATUS.APROVADO],
  }
  if (perfil === PERFIS.COMPRADOR) return {
    [STATUS.SOLICITADO]: [STATUS.AG_COTACAO],
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
    prxToast(`Seu perfil não move pedidos de "${STATUS_LABEL[statusOrigem]}" para "${STATUS_LABEL[statusDestino]}". Use a tela do pedido.`, 'error')
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
    prxToast('Não foi possível mover o pedido: ' + (err.message || 'tente novamente'), 'error')
  } finally {
    esconderSpinner()
  }
}

// Zonas de soltura: a coluna inteira (computador) e os numerais da régua (celular)
function _bindDragDrop(container) {
  const permitidos = _transicoesDragPermitidas(sessao.usuario.perfil)
  const podeSoltar = (origem, destino) => !!origem && destino !== origem && (permitidos[origem] || []).includes(destino)
  const zonas = () => container.querySelectorAll('[data-drop-status]')
  const marcarDestinos = origem => {
    container.classList.add('arrastando')
    zonas().forEach(z => z.classList.toggle('drop-ok', podeSoltar(origem, z.dataset.dropStatus)))
  }
  const limpar = () => {
    container.classList.remove('arrastando')
    zonas().forEach(z => z.classList.remove('drop-over', 'drop-ok'))
  }

  // ── HTML5 ──
  let dragId = null
  let dragStatus = null
  container.querySelectorAll('.kcard[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId     = card.dataset.id
      dragStatus = card.closest('.kanban-col')?.dataset.status
      card.classList.add('kcard-dragging')
      _arrastoAtivo = true
      marcarDestinos(dragStatus)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', dragId)
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('kcard-dragging')
      dragId = null; dragStatus = null
      limpar()
      _fimDoArrasto()
    })
  })
  zonas().forEach(zone => {
    zone.addEventListener('dragover', e => {
      if (!dragId) return
      const ok = podeSoltar(dragStatus, zone.dataset.dropStatus)
      if (!ok) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      zone.classList.add('drop-over')
    })
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-over')
    })
    zone.addEventListener('drop', e => {
      e.preventDefault()
      zone.classList.remove('drop-over')
      if (dragId) _tentarMoverPedido(dragId, dragStatus, zone.dataset.dropStatus)
    })
  })

  // ── Toque: segurar 280 ms e arrastar até um numeral da régua ──
  let ghost = null
  let timer = null
  let tId = null
  let tStatus = null
  let x0 = 0, y0 = 0

  container.querySelectorAll('.kcard[draggable="true"]').forEach(card => {
    card.addEventListener('touchstart', e => {
      const toque = e.touches[0]
      x0 = toque.clientX; y0 = toque.clientY
      tId = card.dataset.id
      tStatus = card.closest('.kanban-col')?.dataset.status
      timer = setTimeout(() => {
        timer = null
        _arrastandoToque = true
        _arrastoAtivo = true
        card.classList.add('kcard-drag-active')
        marcarDestinos(tStatus)
        ghost = card.cloneNode(true)
        ghost.classList.add('kcard-ghost')
        Object.assign(ghost.style, {
          position: 'fixed', zIndex: '9999', pointerEvents: 'none',
          width: card.offsetWidth + 'px',
          left: (toque.clientX - card.offsetWidth / 2) + 'px',
          top:  (toque.clientY - 20) + 'px',
        })
        document.body.appendChild(ghost)
      }, 280)
    }, { passive: true })

    card.addEventListener('touchmove', e => {
      const toque = e.touches[0]
      // Mexeu antes do tempo: é rolagem, não arrasto
      if (timer && (Math.abs(toque.clientX - x0) > 8 || Math.abs(toque.clientY - y0) > 8)) {
        clearTimeout(timer); timer = null; tId = null
        return
      }
      if (!ghost) return
      ghost.style.left = (toque.clientX - ghost.offsetWidth / 2) + 'px'
      ghost.style.top  = (toque.clientY - 20) + 'px'
      ghost.style.display = 'none'
      const el = document.elementFromPoint(toque.clientX, toque.clientY)
      ghost.style.display = ''
      zonas().forEach(z => z.classList.remove('drop-over'))
      const zona = el?.closest('[data-drop-status]')
      if (zona && podeSoltar(tStatus, zona.dataset.dropStatus)) zona.classList.add('drop-over')
    }, { passive: true })

    const terminar = e => {
      clearTimeout(timer); timer = null
      card.classList.remove('kcard-drag-active')
      const tinhaGhost = !!ghost
      if (ghost) { ghost.remove(); ghost = null }
      limpar()
      setTimeout(() => { _arrastandoToque = false }, 0)
      if (!tinhaGhost || !tId || !tStatus || e.type === 'touchcancel') { tId = null; tStatus = null; if (tinhaGhost) _fimDoArrasto(); return }
      const toque = e.changedTouches[0]
      const zona = document.elementFromPoint(toque.clientX, toque.clientY)?.closest('[data-drop-status]')
      if (zona) _tentarMoverPedido(tId, tStatus, zona.dataset.dropStatus)
      tId = null; tStatus = null
      _fimDoArrasto()
    }
    card.addEventListener('touchend', terminar)
    card.addEventListener('touchcancel', terminar)
  })
}

// ── Quadro ────────────────────────────────────────────────────
function _dois(n) { return String(n).padStart(2, '0') }

function _renderKanban(lista) {
  if (!lista.length) return _renderEmptyState(_tipoVazio())

  const encerrados = _filtroAtivo === 'encerrados'
  const colunas = encerrados ? [STATUS.REPROVADO, STATUS.CANCELADO] : KANBAN_COLUNAS
  const statusFila = encerrados ? null : _statusDaFila()
  const porEtapa = {}
  colunas.forEach(st => { porEtapa[st] = [] })
  lista.forEach(p => { if (porEtapa[p.status]) porEtapa[p.status].push(p) })

  // Celular: etapa mostrada — a escolhida; senão a da fila; senão a primeira com pedidos
  let atual = colunas.includes(_etapaMovel) ? _etapaMovel : null
  if (!atual) atual = (statusFila && porEtapa[statusFila]?.length) ? statusFila : (colunas.find(st => porEtapa[st].length) || colunas[0])
  _etapaMovel = atual

  const regua = `
    <div class="regua" role="tablist" aria-label="${t('etapas')}" style="--cols:${colunas.length}">
      ${colunas.map(st => {
        const n = porEtapa[st].length
        const sel = st === atual
        const classes = ['regua-item', sel ? 'ativa' : '', st === statusFila ? 'eh-fila' : '', n === 0 ? 'zero' : ''].filter(Boolean).join(' ')
        const nome = colunas.length > 4 ? t(_CHAVE_ETAPA_CURTA[st]) : STATUS_LABEL[st]
        return `<button type="button" role="tab" class="${classes}" id="regua-${st}" data-etapa="${st}" data-drop-status="${st}"
          aria-selected="${sel}" aria-controls="coluna-${st}" tabindex="${sel ? 0 : -1}" aria-label="${esc(STATUS_LABEL[st])}: ${n}">
          <span class="regua-n" aria-hidden="true">${_dois(n)}</span><span class="regua-nome" aria-hidden="true">${esc(nome)}</span>
        </button>`
      }).join('')}
    </div>`

  const cols = colunas.map(status => {
    // Urgentes primeiro; dentro de cada grupo mantém a ordem (mais recentes antes)
    const cards = porEtapa[status]
      .map((p, i) => [p, i])
      .sort((a, b) => (b[0].urgente ? 1 : 0) - (a[0].urgente ? 1 : 0) || a[1] - b[1])
      .map(([p]) => p)
    // Recolhe só quando sobram pelo menos 2 (esconder 1 cartão atrás de um botão não compensa)
    const recolhe   = cards.length > _LANE_LIMIT + 1
    const expandida = _colunasExpandidas.has(status)
    const visiveis  = (expandida || !recolhe) ? cards : cards.slice(0, _LANE_LIMIT)
    const restantes = cards.length - visiveis.length
    const soma = cards.reduce((s, p) => s + (Number(_valorPedido(p)) || 0), 0)
    const label = STATUS_LABEL[status]
    const ehFila = status === statusFila

    let rodape = ''
    if (restantes > 0) {
      rodape = `<button type="button" class="kanban-ver-mais" data-ver-mais="${status}">${t('verMais')} <span class="numeral">${restantes}</span></button>`
    } else if (expandida && recolhe) {
      rodape = `<button type="button" class="kanban-ver-mais" data-ver-mais="${status}">${t('verMenos')}</button>`
    }

    return `
      <section class="kanban-col${ehFila ? ' eh-fila' : ''}${status === atual ? ' atual' : ''}" id="coluna-${status}" data-status="${status}" data-drop-status="${status}" aria-labelledby="etapa-${status}">
        <header class="kanban-col-header"${ehFila ? ` title="${t('etapaDaFila')}"` : ''}>
          <span class="etapa-n${cards.length ? '' : ' zero'}" aria-hidden="true">${_dois(cards.length)}</span>
          <h2 class="etapa-nome" id="etapa-${status}">${label}<span class="sr-only">: ${cards.length} ${cards.length === 1 ? t('pedidoSing') : t('pedidosPlural')}${ehFila ? `. ${t('etapaDaFila')}` : ''}</span></h2>
          <span class="etapa-soma">${soma > 0 ? `<span title="${formatCurrency(soma)}">${_moedaCompacta.format(soma)}</span>` : '—'}</span>
        </header>
        <div class="kanban-cards" data-status="${status}">
          ${visiveis.length ? visiveis.map(_renderKcard).join('') : `<div class="kanban-vazio">${t('semPedidosColuna')}</div>`}
          ${rodape}
        </div>
      </section>
    `
  }).join('')

  return `
    <div class="kanban-wrap${encerrados ? ' kanban-poucas' : ''}">
      ${regua}
      <button type="button" class="kanban-nav kanban-nav-ant" data-board-ant aria-label="${t('colunasAnteriores')}" title="${t('colunasAnteriores')}">${ICO.setaEsq(16)}</button>
      <div class="kanban-board" style="--cols:${colunas.length}">${cols}</div>
      <button type="button" class="kanban-nav kanban-nav-prox" data-board-prox aria-label="${t('proximasColunas')}" title="${t('proximasColunas')}">${ICO.setaDir(16)}</button>
    </div>`
}

function _tsMs(ts) {
  if (!ts) return 0
  return ts.toMillis ? ts.toMillis() : (ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime())
}

function _nomeEmpresa(id) {
  if (!id) return ''
  const e = _empresasTodas.find(x => x.id === id) || _empresas.find(x => x.id === id)
  return e?.nome || ''
}

function _nomeSolicitante(p) {
  const u = _usuarios.find(x => x.id === p.solicitanteId)
  if (u?.nome) return u.nome
  if (p.solicitanteId && p.solicitanteId === sessao.usuario.id) return sessao.usuario.nome || ''
  return p.solicitanteNome || ''
}

// Data (texto ISO ou Timestamp) → aaaa-mm-dd
function _isoDe(v) {
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  return _tsToISO(v)
}
function _diasEntre(isoA, isoB) {
  return Math.round((new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / 86400000)
}
function _ddmm(iso) {
  const [y, m, d] = iso.split('-')
  return String(new Date().getFullYear()) === y ? `${d}/${m}` : `${d}/${m}/${y.slice(2)}`
}

// Prazo em texto, como no quadro aprovado: "Falta 1 dia", "Faltam 22 dias",
// "Atrasado 8 dias", "Entregue há 2 dias", "Pago em 26/09".
//   classe: '' | 'perto' (até 3 dias) | 'hoje' | 'atrasado' | 'feito' | 'sem'
function _prazoPedido(p) {
  const hoje = hojeISO()
  const emData = (chave, campo) => {
    const iso = _isoDe(p[campo]) || _isoDe(p.atualizadoEm)
    return iso ? { texto: t(chave).replace('{d}', _ddmm(iso)), classe: 'feito' } : null
  }
  switch (p.status) {
    case STATUS.PAGO:      return emData('prazoPagoEm', 'pagoEm')
    case STATUS.REPROVADO: return emData('prazoReprovadoEm', 'reprovadoEm')
    case STATUS.CANCELADO: return emData('prazoCanceladoEm', 'canceladoEm')
    case STATUS.ENTREGUE: {
      const iso = _isoDe(p.dataEntrega) || _isoDe(p.atualizadoEm)
      if (!iso) return null
      const n = Math.max(0, _diasEntre(iso, hoje))
      return { texto: n === 0 ? t('prazoEntregueHoje') : (n === 1 ? t('prazoEntregue1') : t('prazoEntregue').replace('{n}', n)), classe: 'feito' }
    }
    default: {
      if (!p.dataNecessaria) return { texto: t('prazoSem'), classe: 'sem' }
      const n = _diasEntre(hoje, p.dataNecessaria)
      if (n < 0) return { texto: n === -1 ? t('prazoAtrasado1') : t('prazoAtrasado').replace('{n}', -n), classe: 'atrasado' }
      if (n === 0) return { texto: t('prazoVenceHoje'), classe: 'hoje' }
      if (n === 1) return { texto: t('prazoFalta1'), classe: 'perto' }
      return { texto: t('prazoFaltam').replace('{n}', n), classe: n <= 3 ? 'perto' : '' }
    }
  }
}

function _podeArrastar(status) {
  return (_transicoesDragPermitidas(sessao.usuario.perfil)[status] || []).length > 0
}

function _temComentarioNaoLido(p) {
  return p.ultimoComentarioEm && _tsMs(p.ultimoComentarioEm) > _tsMs(p.vistoPor?.[sessao.usuario.id])
}

function _renderKcard(p) {
  const nomeEmp = _nomeEmpresa(p.empresaId)
  const valor   = _valorPedido(p)
  const naoLido = _temComentarioNaoLido(p)
  const prazo   = _prazoPedido(p)
  const rotulo  = [p.numeroPedido, p.titulo, p.urgente ? t('urgenteTag') : '', prazo?.texto, valor ? formatCurrency(valor) : '']
    .filter(Boolean).join(', ')

  return `
    <article class="kcard${p.urgente ? ' kcard-urgente' : ''}" data-id="${p.id}"${_podeArrastar(p.status) ? ' draggable="true"' : ''} tabindex="0"
      aria-label="${esc(rotulo)}">
      <div class="kcard-top">
        ${p.numeroPedido ? `<span class="kcard-num">${esc(p.numeroPedido)}</span>` : ''}
        ${naoLido ? `<span class="kcard-unread-dot" title="${t('comentarioNaoLido')}" role="img" aria-label="${t('comentarioNaoLido')}"></span>` : ''}
        ${p.urgente ? `<span class="kcard-urg">${t('urgenteTag')}</span>` : ''}
      </div>
      <h3 class="kcard-title">${esc(p.titulo)}</h3>
      ${nomeEmp ? `<div class="kcard-empresa" title="${esc(nomeEmp)}">${esc(nomeEmp)}</div>` : ''}
      <div class="kcard-pe">
        ${prazo ? `<span class="kcard-prazo${prazo.classe ? ' ' + prazo.classe : ''}">${ICO.relogio(12)}<span>${prazo.texto}</span></span>` : ''}
        ${valor ? `<span class="kcard-valor">${formatCurrency(valor)}</span>` : `<span class="kcard-sem-valor">${t('semValor')}</span>`}
      </div>
    </article>
  `
}

// ── Estados vazios ────────────────────────────────────────────
function _tipoVazio() {
  const temFiltroExtra = !!(_termoBusca.trim() || _filtroCategoria || _filtroEmpresa || _filtroComprador || _filtroDataIni || _filtroDataFim)
  if (temFiltroExtra) return 'busca'
  if (_filtroAtivo === 'pendentes') return 'pendentes'
  if (_filtroAtivo !== 'todos') return 'filtro'
  return 'vazio'
}

// Mesma inscrição do quadro: fio de tinta, numeral grande (00), título e a saída
function _estadoVazioHTML({ icone = '', titulo, sub, acao = '' }) {
  return `
    <div class="pedidos-vazio">
      ${icone ? `<span class="pedidos-vazio-icone">${icone}</span>` : '<span class="pedidos-vazio-n" aria-hidden="true">00</span>'}
      <h2 class="pedidos-vazio-titulo">${titulo}</h2>
      <p class="pedidos-vazio-sub">${sub}</p>
      ${acao ? `<div class="pedidos-vazio-acao">${acao}</div>` : ''}
    </div>`
}

function _renderEmptyState(tipo) {
  if (tipo === 'busca') {
    const termo = _termoBusca.trim()
    return _estadoVazioHTML({
      titulo: termo ? `${t('nenhumResultadoPara')} “${esc(termo)}”` : t('nenhumResultado'),
      sub: t('ajustarFiltro'),
      acao: `<button class="btn-secondary btn-sm" data-empty-limpar>${t('limparFiltros')}</button>`,
    })
  }
  if (tipo === 'pendentes') {
    return _estadoVazioHTML({ titulo: t('semPendentesTitulo'), sub: t('semPendentesSub'),
      acao: `<button class="btn-secondary btn-sm" data-empty-limpar>${t('verTodos')}</button>` })
  }
  if (tipo === 'filtro') {
    return _estadoVazioHTML({ titulo: t('semPedidosFiltro'), sub: t('semPedidosFiltroSub'),
      acao: `<button class="btn-secondary btn-sm" data-empty-limpar>${t('verTodos')}</button>` })
  }
  return _estadoVazioHTML({
    titulo: t('nenhumPedido'),
    sub: t('semPedidosSub'),
    acao: `<button class="btn-secondary btn-sm" data-empty-novo>${ICO.mais(14)}${t('novoPedido')}</button>`,
  })
}

function _bindEmptyActions(container) {
  container.querySelector('[data-empty-limpar]')?.addEventListener('click', _limparTodosFiltros)
  container.querySelector('[data-empty-novo]')?.addEventListener('click', () => document.getElementById('btn-novo-pedido')?.click())
}

// ── Lista ─────────────────────────────────────────────────────
function _sortIcon(campo) {
  if (_ordemCampo !== campo) return `<svg class="sort-ico" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="7 9 12 4 17 9"/><polyline points="7 15 12 20 17 15"/></svg>`
  return _ordemDesc
    ? `<svg class="sort-ico ativo" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="18 13 12 19 6 13"/></svg>`
    : `<svg class="sort-ico ativo" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>`
}

function _thOrdenavel(campo, rotulo, classe = '') {
  const ativo = _ordemCampo === campo
  const aria = ativo ? (_ordemDesc ? 'descending' : 'ascending') : 'none'
  return `<th class="sortable${ativo ? ' ativo' : ''}${classe ? ' ' + classe : ''}" data-campo="${campo}" tabindex="0" aria-sort="${aria}" scope="col">${rotulo}${_sortIcon(campo)}</th>`
}

function _renderLista(lista, totalFiltrada, totalPaginas, inicio) {
  if (!lista.length) return _renderEmptyState(_tipoVazio())

  const linhas = lista.map(p => {
    const nomeEmp  = _nomeEmpresa(p.empresaId)
    const solicit  = _nomeSolicitante(p)
    const label    = STATUS_LABEL[p.status] || p.status
    const sel      = _selecionados.has(p.id)
    const valor    = _valorPedido(p)
    const prazo    = _prazoPedido(p)
    const rotulo   = esc((p.numeroPedido ? p.numeroPedido + ' ' : '') + (p.titulo || ''))

    return `
      <tr data-id="${p.id}" tabindex="0" class="${sel ? 'selecionada' : ''}">
        <td class="bulk-cb-cell c-cb"><input type="checkbox" class="bulk-cb" data-id="${p.id}" aria-label="${t('selecionar')} ${rotulo}"${sel ? ' checked' : ''}></td>
        <td class="c-pedido">
          <div class="lp-linha">
            ${p.numeroPedido ? `<span class="lp-num">${esc(p.numeroPedido)}</span>` : ''}
            <span class="lp-titulo">${esc(p.titulo)}</span>
            ${_temComentarioNaoLido(p) ? `<span class="kcard-unread-dot" title="${t('comentarioNaoLido')}" role="img" aria-label="${t('comentarioNaoLido')}"></span>` : ''}
            ${p.urgente ? `<span class="kcard-urg">${t('urgenteTag')}</span>` : ''}
          </div>
        </td>
        <td class="c-empresa">${esc(nomeEmp || '—')}</td>
        <td class="c-solic">${esc(solicit || '—')}</td>
        <td class="c-status"><span class="lp-etapa"><span class="dot ${STATUS_DOT_COLOR[p.status] || 'dot-gray'}" aria-hidden="true"></span>${label}</span></td>
        <td class="c-prazo">${prazo ? `<span class="lp-prazo${prazo.classe ? ' ' + prazo.classe : ''}">${prazo.texto}</span>` : '—'}</td>
        <td class="c-valor">${valor ? `<span class="lp-valor">${formatCurrency(valor)}</span>` : `<span class="lp-nulo">${t('semValor')}</span>`}</td>
        <td class="c-data">${p.criadoEm ? formatDate(_tsToISO(p.criadoEm)) : '—'}</td>
      </tr>
    `
  }).join('')

  const todasSelecionadas = lista.length > 0 && lista.every(p => _selecionados.has(p.id))
  const fim = inicio + lista.length
  const paginacao = totalPaginas > 1 ? `
    <nav class="lista-paginacao" aria-label="${t('paginacao')}">
      <span class="pagina-info"><span class="numeral">${inicio + 1}–${fim}</span> ${t('paginaDe')} <span class="numeral">${totalFiltrada}</span></span>
      <div class="pagina-btns">
        <button type="button" id="btn-pagina-ant" class="btn-ghost btn-sm"${_paginaAtual === 0 ? ' disabled' : ''} aria-label="${t('paginaAnt')}">
          ${ICO.setaEsq(15)}<span>${t('paginaAnt')}</span>
        </button>
        <span class="pagina-atual"><span class="numeral">${_paginaAtual + 1}</span> / ${totalPaginas}</span>
        <button type="button" id="btn-pagina-prox" class="btn-ghost btn-sm"${_paginaAtual >= totalPaginas - 1 ? ' disabled' : ''} aria-label="${t('paginaProx')}">
          <span>${t('paginaProx')}</span>${ICO.setaDir(15)}
        </button>
      </div>
    </nav>` : ''

  return `
    <div class="pedidos-tabela-wrap${_selecionados.size ? ' com-selecao' : ''}">
      <table class="table-card-mobile pedidos-tabela">
        <thead>
          <tr>
            <th class="c-cb" scope="col"><input type="checkbox" id="cb-select-all" aria-label="${t('selecionarPagina')}"${todasSelecionadas ? ' checked' : ''}></th>
            ${_thOrdenavel('titulo', t('colPedido'), 'c-pedido')}
            <th class="c-empresa" scope="col">${t('colEmpresa')}</th>
            <th class="c-solic" scope="col">${t('colSolicitante')}</th>
            ${_thOrdenavel('status', t('colEtapa'), 'c-status')}
            ${_thOrdenavel('prazo', t('colPrazo'), 'c-prazo')}
            ${_thOrdenavel('valorEstimado', t('colValor'), 'c-valor')}
            ${_thOrdenavel('criadoEm', t('colCriadoEm'), 'c-data')}
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    ${paginacao}
  `
}

// ── Auxiliares ────────────────────────────────────────────────
async function _carregarDadosAuxiliares() {
  const [catSnap, empSnap] = await Promise.all([
    getDocs(collection(db, 'categorias')),
    getDocs(collection(db, 'empresas')),
  ])
  _categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _empresasTodas = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  // Seletores mostram só as ativas; o nome das inativas segue disponível para pedidos antigos
  _empresas = _empresasTodas.filter(e => e.ativa !== false)
  // usuarios: regra permite list apenas para gestor+; demais perfis recebem lista vazia
  try {
    const usrSnap = await getDocs(collection(db, 'usuarios'))
    _usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    _usuarios = []
  }
}

function _empresasDoUsuario(lista) {
  const raw = sessao.usuario.empresas
  const empIds = Array.isArray(raw) ? raw : Object.keys(raw || {})
  return sessao.usuario.perfil === PERFIS.SUPREMO ? lista : lista.filter(e => empIds.includes(e.id))
}

// Seletores do painel: empresa (com 2 ou mais), categoria e comprador (quando a lista de usuários é legível)
function _preencherFiltros() {
  const add = (sel, valor, texto) => {
    const opt = document.createElement('option')
    opt.value = valor; opt.textContent = texto
    sel.appendChild(opt)
  }
  const selEmp = document.getElementById('fl-empresa-global')
  if (selEmp) {
    // No filtro entram também as inativas: há pedidos antigos delas no quadro
    const disponiveis = _empresasDoUsuario(_empresasTodas)
      .slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    if (disponiveis.length >= 2) {
      disponiveis.forEach(e => add(selEmp, e.id, e.ativa === false ? `${e.nome} (${t('inativa')})` : e.nome))
      document.getElementById('pf-campo-empresa')?.removeAttribute('hidden')
    }
  }
  const selCat = document.getElementById('fl-categoria')
  if (selCat) {
    _categorias.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      .forEach(c => add(selCat, c.id, c.nome))
  }
  const selComp = document.getElementById('fl-comprador')
  const compradores = _usuarios.filter(u => [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(u.perfil))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  if (selComp && compradores.length) {
    compradores.forEach(u => add(selComp, u.id, u.nome))
    document.getElementById('pf-campo-comprador')?.removeAttribute('hidden')
  }
  // Grade de duas colunas sem buraco: com número ímpar de seletores, o último ocupa a linha
  const simples = [...document.querySelectorAll('#painel-filtros .pf-campo:not(.pf-periodo):not(.pf-ordem)')].filter(c => !c.hidden)
  if (simples.length % 2) simples[simples.length - 1].classList.add('pf-largo')
}

function _preencherModalNovoPedido() {
  // Empresas — só as ativas às quais o usuário tem acesso
  const empSel = document.getElementById('np-empresa')
  if (empSel) {
    _empresasDoUsuario(_empresas).forEach(e => {
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
      chip.setAttribute('role', 'radio')
      chip.setAttribute('aria-checked', 'false')
      chip.innerHTML = `<span class="chip-dot" style="background:${esc(c.cor ? corCategoria(c.cor) : 'var(--text3)')}"></span>${esc(c.nome)}`
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

  if (titulo)  titulo.value  = p.titulo || ''
  if (empresa) {
    // Empresa inativa (ou sem acesso) não está entre as opções: o campo volta para "Selecionar…"
    empresa.value = p.empresaId || ''
    if (empresa.value !== (p.empresaId || '')) empresa.value = ''
  }
  if (quant)   quant.value   = p.quantidade || ''
  if (unid)    unid.value    = p.unidade || ''
  if (valor && p.valorEstimado) valor.value = formatCurrency(p.valorEstimado)
  if (cc)      cc.value      = p.centroCusto || p.cc || ''
  if (obs)     obs.value     = p.descricao || ''
  // A data necessária não é copiada: o prazo do original quase sempre já passou

  if (p.urgente) {
    document.getElementById('np-urgente-toggle')?.classList.add('on')
    const wrap = document.getElementById('np-urgente-wrap')
    wrap?.setAttribute('aria-checked', 'true')
    wrap?.classList.add('on')
  }

  if (p.categoriaId) {
    const chip = document.querySelector(`#np-categorias .chip[data-id="${p.categoriaId}"]`)
    if (chip) { chip.classList.add('selected'); chip.setAttribute('aria-checked', 'true') }
  }

  const h2 = document.getElementById('np-h2')
  if (h2) h2.textContent = t('duplicarPedido')
  const sub = document.getElementById('np-sub')
  if (sub) {
    sub.innerHTML = `${t('duplicarBase')} ${p.numeroPedido ? `<span class="np-sub-num">${esc(p.numeroPedido)}</span> · ` : ''}${t('duplicarAjuste')}`
    sub.hidden = false
  }
  const btn = document.getElementById('btn-abrir-pedido')
  if (btn) btn.textContent = t('btnCriarCopia')
}

function _tsToISO(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Visões salvas (dentro do painel de filtros) ───────────────
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
  try { localStorage.setItem(`praxis_views_${uid}`, JSON.stringify(_viewsSalvas)) } catch {}
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

// O que uma visão guarda, em itens curtos (modal de salvar e lista do painel)
function _itensDoEstado(e) {
  const itens = [
    e.viewMode === 'lista' ? t('visaoLista') : t('visaoQuadro'),
    _rotuloFiltro(e.filtroAtivo || 'todos'),
  ]
  if (e.filtroEmpresa) itens.push(_nomeEmpresa(e.filtroEmpresa))
  if (e.filtroDataIni || e.filtroDataFim) itens.push(`${e.filtroDataIni ? formatDate(e.filtroDataIni) : '…'} – ${e.filtroDataFim ? formatDate(e.filtroDataFim) : '…'}`)
  if (e.termoBusca) itens.push(`“${e.termoBusca}”`)
  if (e.filtroCategoria) itens.push(_categorias.find(c => c.id === e.filtroCategoria)?.nome || '')
  if (e.filtroComprador) itens.push(_usuarios.find(u => u.id === e.filtroComprador)?.nome || '')
  return itens.filter(Boolean)
}

function _preencherResumoVisao() {
  const el = document.getElementById('visao-resumo-itens')
  if (!el) return
  el.innerHTML = _itensDoEstado(_capturarEstadoFiltros()).map(i => `<span class="visao-resumo-item">${esc(i)}</span>`).join('')
}

function _aplicarView(v) {
  const estado = v.estado || {}
  _filtroAtivo     = _FILTROS_PILL.includes(estado.filtroAtivo) ? estado.filtroAtivo : 'todos'
  _termoBusca      = estado.termoBusca      ?? ''
  _filtroCategoria = estado.filtroCategoria ?? ''
  _filtroEmpresa   = estado.filtroEmpresa   ?? ''
  _filtroComprador = estado.filtroComprador ?? ''
  _filtroDataIni   = estado.filtroDataIni   ?? ''
  _filtroDataFim   = estado.filtroDataFim   ?? ''
  _ordemCampo      = estado.ordemCampo      ?? 'criadoEm'
  _ordemDesc       = estado.ordemDesc       ?? true
  _viewMode        = estado.viewMode === 'lista' ? 'lista' : 'kanban'
  _paginaAtual     = 0
  _etapaMovel      = null
  _visaoAtiva      = v.id

  _sincronizarControles()
  _sincronizarLateral()
  _renderVisoes()
  _renderView()
}

function _renderVisoes() {
  const ul = document.getElementById('pf-visoes-lista')
  if (!ul) return
  if (!_viewsSalvas.length) {
    ul.innerHTML = `<li class="pf-visoes-vazio">${t('visoesVazio')}</li>`
    return
  }
  ul.innerHTML = _viewsSalvas.map(v => {
    const ativa = _visaoAtiva === v.id
    return `
      <li class="pf-visao${ativa ? ' ativa' : ''}" data-view-id="${v.id}">
        <button type="button" class="pf-visao-nome" data-aplicar-view="${v.id}" aria-pressed="${ativa}">
          <span class="pf-visao-titulo">${esc(v.nome)}</span>
          <span class="pf-visao-desc">${esc(_itensDoEstado(v.estado || {}).join(' · '))}</span>
        </button>
        <button type="button" class="btn-icon pf-visao-acao" data-renomear-view="${v.id}" title="${t('renomear')}" aria-label="${t('renomear')} ${esc(v.nome)}">${ICO.editar(13)}</button>
        <button type="button" class="btn-icon pf-visao-acao pf-visao-del" data-remover-view="${v.id}" title="${t('remover')}" aria-label="${t('remover')} ${esc(v.nome)}">${ICO.x(13)}</button>
      </li>`
  }).join('')
}

function _confirmarSalvarVisao() {
  const nome = document.getElementById('visao-nome')?.value.trim()
  if (!nome) {
    _marcarErroCampo('visao-nome', t('informeNomeVisao'))
    document.getElementById('visao-nome')?.focus()
    return
  }
  if (_viewsSalvas.length >= _VIEWS_MAX) {
    prxToast(`Limite de ${_VIEWS_MAX} visões atingido. Remova uma para salvar outra.`, 'error')
    return
  }
  const nova = { id: Date.now().toString(), nome, estado: _capturarEstadoFiltros() }
  _viewsSalvas.push(nova)
  _visaoAtiva = nova.id
  _persistirViews()
  fecharModal('modal-salvar-visao')
  _renderVisoes()
  prxToast(t('visaoSalva'), 'success')
}

function _renomearView(viewId) {
  const view = _viewsSalvas.find(v => v.id === viewId)
  if (!view) return
  const item = document.querySelector(`.pf-visao[data-view-id="${viewId}"]`)
  const nomeBtn = item?.querySelector('.pf-visao-nome')
  if (!item || !nomeBtn) return
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.className = 'pf-visao-input'
  inp.value = view.nome
  inp.maxLength = 40
  inp.setAttribute('aria-label', t('nomeVisao'))
  item.replaceChild(inp, nomeBtn)
  inp.focus()
  inp.select()
  let feito = false
  const confirmar = () => {
    if (feito) return
    feito = true
    const novo = inp.value.trim()
    if (novo) { view.nome = novo; _persistirViews() }
    _renderVisoes()
    document.querySelector(`.pf-visao[data-view-id="${viewId}"] .pf-visao-nome`)?.focus({ preventScroll: true })
  }
  inp.addEventListener('blur', confirmar)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmar() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = view.nome; confirmar() }
  })
}

function _removerView(viewId) {
  const view = _viewsSalvas.find(v => v.id === viewId)
  if (!view) return
  prxConfirm(`Remover a visão "${view.nome}"?`, t('visaoRemoverMsg'), t('remover'), t('cancelar'), true).then(ok => {
    if (!ok) return
    _viewsSalvas = _viewsSalvas.filter(v => v.id !== viewId)
    if (_visaoAtiva === viewId) _visaoAtiva = null
    _persistirViews()
    _renderVisoes()
  })
}

// ── Ações em massa ────────────────────────────────────────────
function _atualizarBulkBar() {
  const bar = document.getElementById('bulk-bar')
  if (!bar) return
  const n = _selecionados.size
  bar.hidden = n === 0
  document.body.classList.toggle('pedidos-com-selecao', n > 0)
  document.querySelector('#pedidos-view .pedidos-tabela-wrap')?.classList.toggle('com-selecao', n > 0)
  const countEl = document.getElementById('bulk-count')
  if (countEl) countEl.innerHTML = `<span class="numeral">${n}</span> ${n !== 1 ? t('selecionados') : t('selecionado')}`
  const btnCancel = document.getElementById('btn-bulk-cancel')
  if (btnCancel) {
    const perfil = sessao.usuario.perfil
    btnCancel.hidden = ![PERFIS.GESTOR, PERFIS.SUPREMO, PERFIS.SOLICITANTE].includes(perfil)
  }
}

// CSV para o Excel em português: separador ";", BOM UTF-8, CRLF,
// números com vírgula decimal e datas dd/mm/aaaa.
function _csvCampo(v) {
  if (v == null) return ''
  const s = String(v)
  return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function _csvNumero(n) {
  if (n == null || n === '' || isNaN(Number(n))) return ''
  return Number(n).toFixed(2).replace('.', ',')
}

function _exportarCSV() {
  const ids = new Set(_selecionados)
  // Mantém a ordem em que aparecem na tela
  const ordem = _filtrarPedidos().map(p => p.id)
  const lista = _pedidos.filter(p => ids.has(p.id))
    .sort((a, b) => {
      const ia = ordem.indexOf(a.id), ib = ordem.indexOf(b.id)
      return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib)
    })
  if (!lista.length) return
  const cabecalho = [
    'Número', 'Título', 'Empresa', 'Categoria', 'Solicitante', 'Status', 'Urgente',
    'Quantidade', 'Unidade', 'Valor estimado (R$)', 'Valor final (R$)',
    'Necessário até', 'Criado em', 'Centro de custo',
  ]
  const linhas = lista.map(p => [
    p.numeroPedido || '',
    p.titulo || '',
    _nomeEmpresa(p.empresaId),
    _categorias.find(c => c.id === p.categoriaId)?.nome || '',
    _nomeSolicitante(p),
    STATUS_LABEL[p.status] || p.status || '',
    p.urgente ? 'Sim' : 'Não',
    p.quantidade ?? '',
    p.unidade || '',
    _csvNumero(p.valorEstimado),
    _csvNumero(p.valorFinal),
    p.dataNecessaria ? formatDate(p.dataNecessaria) : '',
    p.criadoEm ? formatDate(_tsToISO(p.criadoEm)) : '',
    p.centroCusto || '',
  ].map(_csvCampo).join(';'))
  const csv = [cabecalho.map(_csvCampo).join(';'), ...linhas].join('\r\n') + '\r\n'
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `praxis-pedidos-${hojeISO()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  prxToast(`${lista.length} ${lista.length !== 1 ? t('pedidosExportados') : t('pedidoExportado')}.`, 'success')
}

function _candidatosCancelamento() {
  const CANCELAVEIS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO]
  const perfil = sessao.usuario.perfil
  const uid = sessao.usuario.id
  return _pedidos.filter(p => {
    if (!_selecionados.has(p.id)) return false
    if (!CANCELAVEIS.includes(p.status)) return false
    if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) return true
    if (perfil === PERFIS.SOLICITANTE) return p.solicitanteId === uid
    return false
  })
}

function _abrirModalBulkCancel() {
  const total = _selecionados.size
  const candidatos = _candidatosCancelamento()
  if (!candidatos.length) {
    prxToast(t('bulkNenhumCancelavel'), 'error')
    return
  }
  const msg = document.getElementById('bulk-cancel-msg')
  if (msg) {
    const n = candidatos.length
    let texto = `${n} ${n === 1 ? t('bulkSeraCancelado') : t('bulkSeraoCancelados')}`
    if (n < total) texto += ` ${t('bulkDemaisFicam').replace('{n}', String(total - n))}`
    msg.textContent = texto
  }
  const ul = document.getElementById('bulk-cancel-lista')
  if (ul) {
    const MAX = 5
    ul.innerHTML = candidatos.slice(0, MAX).map(p => `
      <li><span class="lp-num">${esc(p.numeroPedido || '')}</span><span class="bulk-cancel-titulo">${esc(p.titulo || '')}</span></li>
    `).join('') + (candidatos.length > MAX ? `<li class="bulk-cancel-mais">+ ${candidatos.length - MAX} ${t('outros')}</li>` : '')
  }
  const sel = document.getElementById('bulk-motivo')
  if (sel) {
    sel.innerHTML = `<option value="">${t('motivoPlaceholder')}</option>`
    MOTIVOS_CANCELAMENTO.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m; opt.textContent = m
      sel.appendChild(opt)
    })
  }
  _limparErroCampo('bulk-motivo')
  _limparErroCampo('bulk-motivo-outros')
  const wrap = document.getElementById('bulk-motivo-outros-wrap')
  if (wrap) wrap.hidden = true
  const outros = document.getElementById('bulk-motivo-outros')
  if (outros) outros.value = ''
  abrirModal('modal-bulk-cancel')
}

async function _confirmarBulkCancel() {
  const motivo = document.getElementById('bulk-motivo')?.value
  const motivoOutros = document.getElementById('bulk-motivo-outros')?.value.trim()
  if (!motivo) { _marcarErroCampo('bulk-motivo', t('selecionarMotivo')); return }
  if (motivo === 'Outros' && !motivoOutros) { _marcarErroCampo('bulk-motivo-outros', t('descreverMotivo')); return }

  const uid = sessao.usuario.id
  const candidatos = _candidatosCancelamento()
  if (!candidatos.length) { fecharModal('modal-bulk-cancel'); return }

  if (!exigirConexao()) return
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
    _renderView()
    prxToast(`${candidatos.length} ${candidatos.length !== 1 ? t('pedidosCancelados') : t('pedidoCancelado')}.`, 'success')
  } catch (err) {
    prxToast(t('erroCancelarPedidos') + (err.message || 'tente novamente'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btnConfirmar) btnConfirmar.disabled = false
  }
}
