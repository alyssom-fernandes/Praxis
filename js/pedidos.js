// Tela de pedidos: o quadro guardado no navegador, a tela, o puxar para
// atualizar, os controles, o painel de filtros e os eventos. As outras partes:
// pedidos-fluxo.js (validação do novo pedido, escuta do Firestore, filtragem,
// cabeçalho, régua do celular, arrastar e soltar) e pedidos-quadro.js (quadro,
// lista, estados vazios, dados auxiliares, visões salvas, ações em massa); o
// estado em pedidos-estado.js.
import {
  renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador, atualizarLateral,
  registrarFiltroLateral,
} from './app.js'
import { sessao, registrarPedidos } from './estado.js'
import { prxAlert, atalhosLigados, abrirModal, fecharModal, empilharVoltar, desempilharVoltar } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { STATUS, KANBAN_COLUNAS, MOTIVO_OUTROS, t } from './constants.js'
import { hojeISO, maisXDiasISO, debounce, prefereMenosMovimento } from './utils.js'
import {
  _limparErroCampo, _resetarModalNovoPedido, _marcarPrazo, _submeterNovoPedido,
  _iniciarListenerPedidos, _renderView, _moverPorTeclado, _andarEntreItens,
} from './pedidos-fluxo.js'
import {
  _carregarDadosAuxiliares, _preencherFiltros, _preencherModalNovoPedido, _preencherModalDuplicar,
  _carregarViews, _preencherResumoVisao, _aplicarView, _renderVisoes, _confirmarSalvarVisao,
  _renomearView, _removerView, _atualizarBulkBar, _exportarCSV, _abrirModalBulkCancel,
  _confirmarBulkCancel, _tituloTela,
} from './pedidos-quadro.js'
import { Q } from './pedidos-estado.js'
import { _resumoAutomatico, _placaMudou, _centrosDeCusto, montarItensNovoPedido } from './novo-pedido.js'

export function agendarDuplicar(pedido, { deNovo = false } = {}) { Q.pedidoFonteDuplicar = pedido; Q.duplicarDeNovo = deNovo }

// Novo pedido aberto de fora da tela (o "+" da barra inferior): na própria
// tela abre na hora; em outra, abre ao chegar
export function abrirNovoPedido() {
  if (!document.getElementById('modal-novo-pedido')) { Q.abrirNovoAoEntrar = true; navegar('pedidos'); return }
  _fecharPainel(false)
  _resetarModalNovoPedido()
  abrirModal('modal-novo-pedido')
}

// A paleta de comandos (ui.js) busca nesta lista, pelo estado
registrarPedidos(() => Q.pedidos)
export const _LANE_LIMIT = 5
export const _PAGE_SIZE = 20
export const _VIEWS_MAX = 8
// Enquanto um cartão está sendo arrastado, mudanças que chegam do banco
// esperam o fim do arrasto (refazer o quadro no meio dele perde o cartão)
export function _fimDoArrasto() {
  Q.arrastoAtivo = false
  if (Q.renderPendente) { Q.renderPendente = false; _renderMostrandoMudancas() }
}

// Pedidos que mudaram de etapa (ou chegaram) desde a leitura anterior, por
// esta pessoa ou por outra em tempo real. O quadro mostra para onde foram: o
// cartão desliza até a nova coluna (View Transitions, onde houver) e fica
// realçado por um instante. A primeira leitura não anima nada.
// Quando cada cartão mudou: o anel segue de onde estava se o quadro se
// redesenhar logo em seguida (outra leitura do banco), em vez de recomeçar
export const _mudouEm = new Map()
export function _renderMostrandoMudancas() {
  const animar = Q.mudaramAgora.size && document.startViewTransition &&
    !prefereMenosMovimento() && document.visibilityState === 'visible'
  const desenhar = () => { _renderView(); Q.mudaramAgora = new Set() }
  if (!animar) { desenhar(); return }
  // Só os cartões que mudaram ganham nome de transição (no quadro antigo e no
  // novo): eles deslizam; o resto troca na hora. Nomear todos fazia os cartões
  // passarem por cima da faixa fixa do topo durante a transição.
  Q.mudaramAgora.forEach(id => {
    const antigo = document.querySelector(`.kcard[data-id="${CSS.escape(id)}"]`)
    if (antigo) antigo.style.viewTransitionName = _nomeTransicao(id)
  })
  document.startViewTransition(desenhar)
}
export const _nomeTransicao = id => `kc-${String(id).replace(/[^\w-]/g, '')}`
export const _TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]

// ── Quadro guardado no navegador ─────────────────────────────
// A última lista de pedidos fica no localStorage: ao reabrir o app, o quadro
// se desenha com ela na hora, e a escuta do Firestore atualiza em seguida (o
// que mudou desde a última visita desliza para a etapa nova). Sai junto com a
// sessão (esquecerMemorias, js/firebase.js: prefixo praxis_memo_). As datas
// (Timestamp) vão como milissegundos e voltam com toDate e toMillis
export const _chaveQuadro = () => `praxis_memo_quadro_${sessao.fireUser?.uid || ''}_${sessao.usuario?.id || ''}`
export function _guardarQuadro() {
  clearTimeout(Q.tGuardarQuadro)
  Q.tGuardarQuadro = setTimeout(() => {
    try {
      const json = JSON.stringify(Q.pedidos, function (k, v) {
        const original = this[k]
        return original && typeof original.toMillis === 'function' ? { __t: original.toMillis() } : v
      })
      // Uma lista muito grande não vale o espaço do navegador: fica só a escuta
      if (json.length < 1500000) localStorage.setItem(_chaveQuadro(), json)
      else localStorage.removeItem(_chaveQuadro())
    } catch { /* cheio ou bloqueado */ }
  }, 1200)
}
export function _lerQuadro() {
  try {
    const json = localStorage.getItem(_chaveQuadro())
    if (!json) return null
    const lista = JSON.parse(json, (k, v) => (v && typeof v === 'object' && typeof v.__t === 'number'
      ? { toMillis: () => v.__t, toDate: () => new Date(v.__t), seconds: Math.floor(v.__t / 1000), nanoseconds: 0 }
      : v))
    return Array.isArray(lista) ? lista : null
  } catch { return null }
}

// ── Ícones (traço 2, mesma família da barra lateral) ───────────
export const _svg = (n, corpo) => `<svg width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`
export const ICO = {
  mais:     n => _svg(n, '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  recibo:   n => _svg(n, '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/>'),
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
  repetir:  n => _svg(n, '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>'),
}

// ── Filtros rápidos ───────────────────────────────────────────
// 'pendentes' é a "Minha fila" da barra lateral: continua sendo um filtro
// desta tela (e do endereço ?filtro=pendentes), mas não aparece na fileira.
export const _FILTROS_PILL = ['todos', 'pendentes', 'urgentes', 'meus', 'semana', 'encerrados']
export const _FILTROS_RAPIDOS = ['todos', 'urgentes', 'meus', 'semana', 'encerrados']
export function _rotuloFiltro(f) {
  return ({
    todos: t('todos'), urgentes: t('urgentes'), meus: t('meusPedidos'),
    semana: t('estaSemana'), encerrados: t('encerrados'), pendentes: t('navMinhaFila'),
  })[f] || f
}

// ── Render da tela ────────────────────────────────────────────
export async function renderPedidos() {
  const app = document.getElementById('app')
  Q.arrastoAtivo = false
  Q.renderPendente = false

  // Filtro pedido pelo endereço (?filtro=pendentes vem de "Minha fila" na barra lateral)
  const filtroUrl = new URLSearchParams(window.location.search).get('filtro')
  if (filtroUrl && _FILTROS_PILL.includes(filtroUrl)) {
    if (filtroUrl !== Q.filtroAtivo) { Q.filtroAtivo = filtroUrl; Q.visaoAtiva = null; Q.paginaAtual = 0; Q.etapaMovel = null }
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
      <main class="main-content pedidos-tela">
        <header class="pedidos-head">
          <div class="pedidos-head-top">
            <div class="pedidos-head-titulo">
              <h1 class="titulo-pagina pedidos-title" id="pedidos-titulo">${_tituloTela()}</h1>
              <p class="pedidos-resumo" id="pedidos-resumo" aria-live="polite">&nbsp;</p>
            </div>
            <div class="pedidos-head-acoes">
              <button class="btn-secondary pedidos-btn-lancar" id="btn-lancar-compra" title="${t('novoLancarCompraDesc')}">
                ${ICO.recibo(16)}<span>${t('lancSalvar')}</span>
              </button>
              <button class="btn-primary pedidos-btn-novo" id="btn-novo-pedido" aria-label="${t('novoPedido')}">
                ${ICO.mais(16)}<span class="pedidos-btn-novo-txt">${t('novoPedido')}</span><span class="pedidos-btn-novo-curto" aria-hidden="true">${t('cfgNovoCurto')}</span>
              </button>
            </div>
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
      </main>
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
              <div class="form-group col-span-3 np-itens" data-campo="np-itens">
                <span class="form-label-falso" id="np-itens-rot">${t('npItens')} <span class="np-req" aria-hidden="true">*</span></span>
                <div id="np-itens-ed" role="group" aria-labelledby="np-itens-rot"></div>
              </div>
              <div class="form-group col-span-3" data-campo="np-titulo" id="np-titulo-grupo" hidden>
                <label for="np-titulo">${t('npResumo')}</label>
                <input type="text" id="np-titulo" maxlength="120" autocomplete="off" aria-describedby="np-titulo-dica">
                <p class="np-dica" id="np-titulo-dica">${t('npResumoDica')}</p>
              </div>
              <div class="form-group" data-campo="np-empresa">
                <label for="np-empresa">${t('npEmpresa')} <span class="np-req" aria-hidden="true">*</span></label>
                <select id="np-empresa" required><option value="">${t('selecionar')}</option></select>
              </div>
              <div class="form-group" data-campo="np-placa">
                <label for="np-placa">${t('npVeiculo')} <span class="np-opcional">${t('opcional')}</span></label>
                <input type="text" id="np-placa" list="np-placas" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="${t('npPlacaPlaceholder')}">
                <datalist id="np-placas"></datalist>
              </div>
              <div class="form-group" data-campo="np-km">
                <label for="np-km">${t('npKm')} <span class="np-opcional">${t('opcional')}</span></label>
                <input type="text" id="np-km" inputmode="numeric" maxlength="9" autocomplete="off" disabled>
              </div>
              <div class="form-group col-span-3 np-prazo" data-campo="np-data">
                <span class="form-label-falso" id="np-prazo-rot">${t('npPrazo')} <span class="np-opcional">${t('opcional')}</span></span>
                <div class="category-chips np-prazos" id="np-prazos" role="group" aria-labelledby="np-prazo-rot">
                  <button type="button" class="chip" data-prazo="0" aria-pressed="false">${t('npPrazoHoje')}</button>
                  <button type="button" class="chip" data-prazo="1" aria-pressed="false">${t('npPrazoAmanha')}</button>
                  <button type="button" class="chip" data-prazo="7" aria-pressed="false">${t('npPrazo7')}</button>
                  <button type="button" class="chip" data-prazo="" aria-pressed="false">${t('npSemPressa')}</button>
                </div>
                <input type="date" id="np-data" min="${hojeISO()}" aria-label="${t('npData')}">
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
              <details class="np-mais col-span-3" id="np-mais">
                <summary>${t('npMaisDetalhes')}</summary>
                <div class="np-mais-corpo">
                  <div class="form-group" data-campo="np-categorias">
                    <span class="form-label-falso" id="np-categorias-label">${t('npCategoria')} <span class="np-opcional">${t('opcional')}</span></span>
                    <div class="category-chips" id="np-categorias" role="radiogroup" aria-labelledby="np-categorias-label"></div>
                  </div>
                  <div class="form-group" data-campo="np-cc" id="np-cc-grupo" hidden>
                    <label for="np-cc">${t('npCC')} <span class="np-opcional">${t('opcional')}</span></label>
                    <select id="np-cc"><option value="">${t('selecionar')}</option></select>
                  </div>
                  <div class="form-group">
                    <label for="np-obs">${t('npObs')} <span class="np-opcional">${t('opcional')}</span></label>
                    <textarea id="np-obs" placeholder="${t('npObsPlaceholder')}" rows="3"></textarea>
                  </div>
                </div>
              </details>
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
    Q.filtroAtivo = _FILTROS_PILL.includes(filtro) ? filtro : 'todos'
    _sincronizarControles()
    _mudouFiltro()
  })
  _sincronizarLateral()
  // Empresas e categorias e a escuta dos pedidos começam juntas: os cartões
  // são desenhados quando as duas chegam (antes, a escuta só começava depois)
  const auxiliares = _carregarDadosAuxiliares()
  Q.esperaAuxiliares = auxiliares.catch(() => {})
  _iniciarListenerPedidos()
  await auxiliares
  Q.esperaAuxiliares = null
  _preencherFiltros()
  _preencherModalNovoPedido()
  montarItensNovoPedido()
  _bindEvents()
  _carregarViews()
  _sincronizarControles()
  _renderVisoes()
  // Ainda sem a primeira leitura: o quadro da última visita, na hora
  if (!Q.recebeuPedidos) {
    const guardado = _lerQuadro()
    if (guardado) {
      Q.pedidos = guardado
      Q.etapaAntes = new Map(guardado.map(p => [p.id, p.status]))
      _renderView()
    }
  }

  const fonteDuplicar = Q.pedidoFonteDuplicar
  Q.pedidoFonteDuplicar = null
  if (fonteDuplicar) {
    _resetarModalNovoPedido()
    _preencherModalDuplicar(fonteDuplicar, { deNovo: !!Q.duplicarDeNovo })
    abrirModal('modal-novo-pedido')
  } else if (Q.abrirNovoAoEntrar) {
    Q.abrirNovoAoEntrar = false
    _resetarModalNovoPedido()
    abrirModal('modal-novo-pedido')
  }

  renderNotificacoes()
  _initPullToRefresh()
}

// Esqueleto: a mesma inscrição do quadro (fio, numeral, nome, soma) ou as
// linhas da lista, para a tela não "pular" quando os dados chegam
export function _skeleton() {
  if (Q.viewMode === 'lista') {
    const linhas = Array.from({ length: 8 }, (_, i) => `
      <div class="sk-linha" aria-hidden="true">
        <span class="skeleton" data-estilo="width:64px"></span>
        <span class="skeleton" data-estilo="width:${[46, 38, 52, 34, 44, 40, 48, 36][i]}%"></span>
        <span class="skeleton sk-fim" data-estilo="width:84px"></span>
      </div>`).join('')
    return `<div class="pedidos-esqueleto-lista" aria-busy="true" aria-label="${t('carregandoPedidos')}">${linhas}</div>`
  }
  const alturas = [[118, 104, 128], [128, 104], [118], [104, 118, 104], [128, 104], [104, 118], [104]]
  const regua = KANBAN_COLUNAS.map(() => `<span class="regua-etapa regua-item regua-sk" aria-hidden="true"><span class="skeleton sk-regua-n"></span><span class="skeleton sk-regua-nome"></span></span>`).join('')
  const cols = alturas.map((cards, i) => `
    <div class="kanban-col kanban-col-skeleton${i === 0 ? ' atual' : ''}" aria-hidden="true">
      <div class="kanban-col-header">
        <span class="skeleton sk-n"></span>
        <span class="skeleton sk-nome"></span>
        <span class="skeleton sk-soma"></span>
      </div>
      <div class="kanban-cards">
        ${cards.map(h => `<div class="skeleton sk-card" data-estilo="height:${h}px"></div>`).join('')}
      </div>
    </div>`).join('')
  return `<div class="kanban-wrap" aria-busy="true" aria-label="${t('carregandoPedidos')}">
      <div class="regua">${regua}</div>
      <div class="kanban-board" data-estilo="--cols:7">${cols}</div>
    </div>`
}

// ── Pull-to-refresh (celular) ─────────────────────────────────
export function _initPullToRefresh() {
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
    if (Q.arrastandoToque) { pulling = false; indicator.classList.remove('visible'); return }
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
        navegar('pedidos')
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
export function _sincronizarControles() {
  document.querySelectorAll('#filter-pills .rapido').forEach(p => {
    const ativo = p.dataset.filtro === Q.filtroAtivo
    p.classList.toggle('active', ativo)
    p.setAttribute('aria-pressed', ativo ? 'true' : 'false')
  })
  _mostrarRapidoAtivo()
  const busca = document.getElementById('busca-pedidos')
  if (busca && busca.value !== Q.termoBusca) busca.value = Q.termoBusca
  const setSel = (id, v) => { const el = document.getElementById(id); if (el) el.value = v }
  setSel('fl-empresa-global', Q.filtroEmpresa)
  setSel('fl-categoria', Q.filtroCategoria)
  setSel('fl-comprador', Q.filtroComprador)
  setSel('fl-ordem', `${Q.ordemCampo}:${Q.ordemDesc ? 'desc' : 'asc'}`)
  const ini = document.getElementById('filtro-data-ini')
  const fim = document.getElementById('filtro-data-fim')
  if (ini) { ini.value = Q.filtroDataIni; ini.max = Q.filtroDataFim || '' }
  if (fim) { fim.value = Q.filtroDataFim; fim.min = Q.filtroDataIni || '' }
  const kb = document.getElementById('btn-kanban')
  const ls = document.getElementById('btn-lista')
  kb?.classList.toggle('active', Q.viewMode === 'kanban')
  ls?.classList.toggle('active', Q.viewMode === 'lista')
  kb?.setAttribute('aria-pressed', String(Q.viewMode === 'kanban'))
  ls?.setAttribute('aria-pressed', String(Q.viewMode === 'lista'))
  const painel = document.getElementById('painel-filtros')
  if (painel) painel.dataset.modo = Q.viewMode
  _atualizarIndicadorFiltros()
}

// Celular: a fileira de filtros rápidos rola sozinha até o ativo
export function _mostrarRapidoAtivo() {
  const fileira = document.getElementById('filter-pills')
  const ativo = fileira?.querySelector('.rapido.active')
  if (!fileira || !ativo || fileira.scrollWidth <= fileira.clientWidth) return
  const esq = ativo.offsetLeft - fileira.offsetLeft
  if (esq < fileira.scrollLeft || esq + ativo.offsetWidth > fileira.scrollLeft + fileira.clientWidth) {
    fileira.scrollLeft = Math.max(0, esq - 16)
  }
}

export function _contarFiltrosPainel() {
  return (Q.filtroEmpresa ? 1 : 0) + ((Q.filtroDataIni || Q.filtroDataFim) ? 1 : 0) +
    (Q.filtroCategoria ? 1 : 0) + (Q.filtroComprador ? 1 : 0)
}

// Filtros do painel: número no botão, "N ativos" e "Limpar"
export function _atualizarIndicadorFiltros() {
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
export function _sincronizarLateral() {
  atualizarLateral({ filtroPedidos: Q.filtroAtivo })
  const url = new URL(window.location)
  if (url.searchParams.get('tela') !== 'pedidos' && url.searchParams.has('tela')) return
  if (Q.filtroAtivo === 'todos') url.searchParams.delete('filtro'); else url.searchParams.set('filtro', Q.filtroAtivo)
  if (url.toString() !== window.location.href) window.history.replaceState({}, '', url)
}

export function _mudouFiltro() {
  _sincronizarLateral()
  Q.paginaAtual = 0
  Q.etapaMovel = null
  if (Q.visaoAtiva) { Q.visaoAtiva = null; _renderVisoes() }
  _atualizarIndicadorFiltros()
  _renderView()
}

export function _limparTodosFiltros() {
  Q.filtroAtivo = 'todos'
  Q.termoBusca = ''
  Q.filtroCategoria = ''
  Q.filtroEmpresa = ''
  Q.filtroComprador = ''
  Q.filtroDataIni = ''
  Q.filtroDataFim = ''
  _sincronizarControles()
  _mudouFiltro()
}

export function _limparFiltrosPainel() {
  Q.filtroCategoria = ''
  Q.filtroEmpresa = ''
  Q.filtroComprador = ''
  Q.filtroDataIni = ''
  Q.filtroDataFim = ''
  _sincronizarControles()
  _mudouFiltro()
}

// ── Painel de filtros ─────────────────────────────────────────
export function _painelAberto() {
  const p = document.getElementById('painel-filtros')
  return !!p && !p.hidden
}

export function _abrirPainel() {
  const painel = document.getElementById('painel-filtros')
  const btn = document.getElementById('btn-filtros')
  if (!painel || !btn) return
  painel.hidden = false
  document.getElementById('pf-fundo')?.removeAttribute('hidden')
  btn.setAttribute('aria-expanded', 'true')
  btn.classList.add('aberto')
  document.body.classList.add('pf-aberto')
  // Celular: o voltar do Android fecha o painel, sem sair da tela
  if (!painel._voltar) painel._voltar = empilharVoltar(() => { painel._voltar = null; _fecharPainel() }, 'painel-filtros')
  _renderVisoes()
  // Computador: o painel termina antes da borda de baixo da janela (o corpo rola por dentro)
  painel.style.maxHeight = ''
  if (getComputedStyle(painel).position === 'absolute') {
    painel.style.maxHeight = Math.max(320, window.innerHeight - painel.getBoundingClientRect().top - 16) + 'px'
  }
  requestAnimationFrame(() => painel.focus({ preventScroll: true }))
}

export function _fecharPainel(devolverFoco = false) {
  const painel = document.getElementById('painel-filtros')
  const btn = document.getElementById('btn-filtros')
  if (!painel || painel.hidden) return
  painel.hidden = true
  if (painel._voltar) { desempilharVoltar(painel._voltar); painel._voltar = null }
  document.getElementById('pf-fundo')?.setAttribute('hidden', '')
  btn?.setAttribute('aria-expanded', 'false')
  btn?.classList.remove('aberto')
  document.body.classList.remove('pf-aberto')
  if (devolverFoco) btn?.focus({ preventScroll: true })
}

// Resultado mostrado no rodapé do painel ("Ver 12 pedidos")
export function _atualizarResultadoPainel(n) {
  const txt = n === 0 ? `${t('verResultado0')} · ${t('fechar')}` : (n === 1 ? t('verResultado1') : t('verResultado').replace('{n}', n))
  const btn = document.getElementById('btn-ver-resultado')
  if (btn) btn.textContent = txt
  const res = document.getElementById('pf-resultado')
  if (res) res.innerHTML = n === 0 ? t('verResultado0') : `<span class="numeral">${n}</span> ${n === 1 ? t('pedidoSing') : t('pedidosPlural')}`
}

// ── Eventos ───────────────────────────────────────────────────
export function _bindEvents() {
  // Filtros rápidos
  // No celular os filtros rápidos vão para o topo da folha "Filtros" (o mesmo
  // elemento, com os mesmos eventos); no computador ficam na barra
  const fileiraRapidos = document.getElementById('filter-pills')
  const lugarRapidos = fileiraRapidos?.parentElement
  const proximoRapidos = fileiraRapidos?.nextElementSibling
  const corpoFiltros = document.querySelector('#painel-filtros .pf-corpo')
  const celular = window.matchMedia('(max-width: 1023px), (max-width: 1279px) and (pointer: coarse)')
  const posicionarRapidos = () => {
    if (!fileiraRapidos || !corpoFiltros || !lugarRapidos) return
    if (celular.matches) corpoFiltros.prepend(fileiraRapidos)
    else lugarRapidos.insertBefore(fileiraRapidos, proximoRapidos)
  }
  posicionarRapidos()
  celular.addEventListener('change', posicionarRapidos)
  registrarLimpador(() => celular.removeEventListener('change', posicionarRapidos))

  document.getElementById('filter-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filtro]')
    if (!btn) return
    Q.filtroAtivo = btn.dataset.filtro
    _sincronizarControles()
    _mudouFiltro()
  })

  // Busca
  document.getElementById('busca-pedidos')?.addEventListener('input',
    debounce(e => { Q.termoBusca = e.target.value; _mudouFiltro() }, 250)
  )

  // Teclado no quadro (fora de campos de texto e de diálogos): "/" foca a
  // busca; os de uma tecla (C, J, K, M, ?) podem ser desligados em Ajustes
  const onKey = e => {
    if (e.key === 'Escape' && _painelAberto()) {
      if (document.querySelector('.calendario.aberto, .dialog-overlay.visible')) return
      e.preventDefault()
      _fecharPainel(true)
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const alvo = e.target
    if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return
    if (document.querySelector('.modal-overlay.visible, .dialog-overlay.visible, .cmd-palette-overlay.visible')) return
    if (e.key === '/') {
      const busca = document.getElementById('busca-pedidos')
      if (!busca || !busca.offsetParent) return
      e.preventDefault()
      busca.focus()
      return
    }
    if (!atalhosLigados()) return
    const tecla = e.key.toLowerCase()
    if (tecla === 'c') { e.preventDefault(); document.getElementById('btn-novo-pedido')?.click() }
    else if (tecla === 'j' || tecla === 'k') { e.preventDefault(); _andarEntreItens(tecla === 'j' ? 1 : -1) }
    else if (tecla === 'm') {
      const item = alvo?.closest?.('#pedidos-view [data-id]')
      if (item) { e.preventDefault(); _moverPorTeclado(item.dataset.id) }
    } else if (e.key === '?') { e.preventDefault(); prxAlert(t('atalhosTitulo'), t('atalhosLista')) }
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
    if (Q.viewMode === modo) return
    Q.viewMode = modo
    Q.paginaAtual = 0
    _sincronizarControles()
    if (Q.visaoAtiva) { Q.visaoAtiva = null; _renderVisoes() }
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
  document.getElementById('fl-empresa-global')?.addEventListener('change', e => { Q.filtroEmpresa = e.target.value; _mudouFiltro() })
  document.getElementById('fl-categoria')?.addEventListener('change', e => { Q.filtroCategoria = e.target.value; _mudouFiltro() })
  document.getElementById('fl-comprador')?.addEventListener('change', e => { Q.filtroComprador = e.target.value; _mudouFiltro() })
  document.getElementById('fl-ordem')?.addEventListener('change', e => {
    const [campo, dir] = e.target.value.split(':')
    Q.ordemCampo = campo; Q.ordemDesc = dir === 'desc'
    _mudouFiltro()
  })
  document.getElementById('filtro-data-ini')?.addEventListener('change', e => {
    Q.filtroDataIni = e.target.value
    const fim = document.getElementById('filtro-data-fim')
    if (fim) fim.min = Q.filtroDataIni || ''
    _mudouFiltro()
  })
  document.getElementById('filtro-data-fim')?.addEventListener('change', e => {
    Q.filtroDataFim = e.target.value
    const ini = document.getElementById('filtro-data-ini')
    if (ini) ini.max = Q.filtroDataFim || ''
    _mudouFiltro()
  })

  // Visões salvas (dentro do painel)
  document.getElementById('pf-visoes-lista')?.addEventListener('click', e => {
    const aplicar = e.target.closest('[data-aplicar-view]')
    const renomear = e.target.closest('[data-renomear-view]')
    const remover = e.target.closest('[data-remover-view]')
    if (aplicar) {
      const v = Q.viewsSalvas.find(x => x.id === aplicar.dataset.aplicarView)
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
    // A categoria é opcional: tocar de novo na escolhida desmarca
    const marcar = !chip.classList.contains('selected')
    document.querySelectorAll('#np-categorias .chip').forEach(c => {
      const on = marcar && c === chip
      c.classList.toggle('selected', on)
      c.setAttribute('aria-checked', on ? 'true' : 'false')
    })
    _limparErroCampo('np-categorias')
  })

  // Limpa o erro do campo assim que o usuário mexe nele
  ;['np-titulo', 'np-empresa', 'np-data', 'np-placa'].forEach(id => {
    const el = document.getElementById(id)
    el?.addEventListener('input', () => _limparErroCampo(id))
    el?.addEventListener('change', () => _limparErroCampo(id))
  })
  // Itens: o erro some da linha que mudou
  document.getElementById('np-itens-ed')?.addEventListener('input', e => {
    const g = e.target.closest('[data-campo]')
    if (g) _limparErroCampo(g.dataset.campo)
  })
  // Resumo: digitado à mão, deixa de acompanhar os itens
  document.getElementById('np-titulo')?.addEventListener('input', e => {
    e.target.dataset.manual = e.target.value.trim() ? '1' : ''
    if (!e.target.dataset.manual) _resumoAutomatico()
  })
  // Placa: o KM só vale com veículo; a empresa traz os centros de custo dela
  document.getElementById('np-placa')?.addEventListener('input', _placaMudou)
  document.getElementById('np-empresa')?.addEventListener('change', () => _centrosDeCusto())

  // Compra já feita: o formulário próprio (js/lancar-compra.js)
  document.getElementById('btn-lancar-compra')?.addEventListener('click', async () => {
    _fecharPainel(false)
    const { abrirLancamento } = await import('./lancar-compra.js')
    abrirLancamento()
  })

  // Prazo: o botão preenche a data; mudar a data à mão apaga o botão aceso
  document.getElementById('np-prazos')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip')
    if (!chip) return
    const dias = chip.dataset.prazo
    const data = document.getElementById('np-data')
    if (data) data.value = dias === '' ? '' : maisXDiasISO(Number(dias))
    _marcarPrazo(dias)
    _limparErroCampo('np-data')
  })
  document.getElementById('np-data')?.addEventListener('change', e => {
    const v = e.target.value
    const igual = ['0', '1', '7'].find(d => maisXDiasISO(Number(d)) === v)
    _marcarPrazo(v ? (igual ?? null) : null)
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
    Q.selecionados.clear()
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
    if (wrap) wrap.hidden = e.target.value !== MOTIVO_OUTROS
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
