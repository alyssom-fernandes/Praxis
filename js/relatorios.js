import { db, collection, query, where, getDocs } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { prxToast, marcaPraxis } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { STATUS, STATUS_LABEL, PERFIS, t, tomDaCor } from './constants.js'
import { formatCurrency, formatDate, esc } from './utils.js'

// ── Textos da tela (PT e EN) ──────────────────────────────────
const TXT = {
  pt: {
    per30d: '30 dias', perMes: 'Mês', perTri: 'Trimestre', perAno: 'Ano', perLivre: 'Livre',
    nome30d: 'Últimos 30 dias', nomeLivre: 'Período livre', triN: 'º trimestre de',
    vs30d: 'vs. 30 dias anteriores', vsMes: 'vs. mês anterior', vsTri: 'vs. trimestre anterior',
    vsAno: 'vs. ano anterior', vsLivre: 'vs. período anterior', semBase: 'Sem base anterior',
    ate: 'até', a: 'a', dataIni: 'Data inicial', dataFim: 'Data final', periodo: 'Período', empresa: 'Empresa',
    imprimir: 'Imprimir', exportar: 'Exportar', expXlsx: 'Excel', expPdf: 'PDF',
    expXlsxDesc: 'Pedidos, parcelas e resumo em abas', expPdfDesc: 'Relatório pronto para enviar', imprimirDesc: 'Esta página, em papel',
    kGasto: 'Gasto', kPedidos: 'Pedidos', kAprov: 'Em aprovação', kEconomia: 'Economia', kVencer: 'A vencer em 7 dias',
    kAprovados: 'Aprovados', kReprovados: 'Reprovados',
    urgente1: 'urgente', urgenteN: 'urgentes', semUrgentes: 'Nenhum urgente',
    economiaSub: 'Frente à maior cotação', economiaSubN: 'Em {n}, frente à maior cotação', compra1: 'compra', compraN: 'compras',
    parcela1: 'parcela', parcelaN: 'parcelas', vencida1: 'vencida', vencidaN: 'vencidas',
    taxaAprov: 'do total decidido', reprovSub: 'No período', agoraSub: 'Agora, em todas as datas',
    tMensal: 'Gasto mensal', tMensalQtd: 'Pedidos por mês', seisMeses: 'Últimos 6 meses',
    tDinheiro: 'Para onde vai o dinheiro', tDinheiroQtd: 'De onde vêm os pedidos',
    porCategoria: 'Por categoria', porEmpresa: 'Por empresa', porFornecedor: 'Por fornecedor',
    tCategoria: 'Gasto por categoria', tEmpresa: 'Gasto por empresa', tFornecedor: 'Gasto por fornecedor',
    tParcelas: 'Parcelas a vencer', tMaiores: 'Maiores compras', tFila: 'Aguardando aprovação',
    tEtapas: 'Etapas dos pedidos', etapasMeta1: '1 pedido criado no período', etapasMetaN: '{n} pedidos criados no período',
    parcelasAbertas: 'Parcelas em aberto', parcial: 'em andamento', semFornecedor: 'Fornecedor não informado',
    fornecedor1: 'fornecedor', fornecedorN: 'fornecedores', empresa1: 'empresa', empresaN: 'empresas',
    proximos30: 'Vencidas e próximos 30 dias', noPeriodo: 'No período', compradasPeriodo: 'Compras fechadas no período',
    grafico: 'Gráfico', tabela: 'Tabela', mes: 'Mês', variacao: 'Variação', pedidos: 'pedidos', pedido: 'pedido',
    outras: 'Outras', semCategoria: 'Sem categoria', total: 'Total', media: 'média',
    mediaMensal: 'Média mensal', maiorMes: 'Maior mês', esteMes: 'Este mês', daMedia: 'da média', semGasto: 'sem gasto',
    hoje: 'Hoje', amanha: 'Amanhã', vencida: 'Vencida', venceHoje: 'Vence hoje', venceAmanha: 'Vence amanhã',
    vencidaHa1: 'Vencida há 1 dia', vencidaHaN: 'Vencida há {n} dias', emDias: 'Em {n} dias',
    haDias: 'há {n} dias', haDia: 'há 1 dia', hojeCurto: 'hoje',
    vazioTit: 'Nenhum pedido neste período', vazioTxt: 'Não há pedidos criados entre {ini} e {fim}. Experimente um período maior ou outra empresa.',
    verAno: 'Ver o ano todo',
    vazioCompras: 'Nenhuma compra com valor final no período.', vazioMensal: 'Sem compras nos últimos 6 meses.',
    semComprasTit: 'Nenhuma compra fechada neste período', semComprasTxt1: 'O pedido do período ainda não tem valor final.', semComprasTxtN: 'Os {n} pedidos do período ainda não têm valor final.', semComprasTxt: 'Categorias e empresas aparecem aqui quando a compra é registrada.',
    ver30: 'Ver últimos 30 dias', vsMesmo: 'vs. mesmo período de {a}',
    vazioParcelasTit: 'Nenhuma parcela em aberto', vazioParcelasTxt: 'Não há parcelas vencidas nem a vencer nos próximos 30 dias.',
    vazioFilaTit: 'Fila vazia', vazioFilaTxt: 'Nenhum pedido aguarda aprovação agora.',
    erroTit: 'Não foi possível carregar os relatórios', erroTxt: 'Verifique a conexão e tente de novo.', tentar: 'Tentar de novo',
    totalParcelas: '{n} em aberto', semPermissao: 'Sem permissão para exportar dados financeiros.',
    erroExport: 'Não foi possível gerar o arquivo. Verifique a conexão.',
    relatorioCompras: 'Relatório de compras', geradoEm: 'Gerado em', todas: 'Todas as empresas',
    colNum: 'Nº', colTitulo: 'Título', colEmpresa: 'Empresa', colCategoria: 'Categoria', colStatus: 'Status',
    colUrgente: 'Urgente', colCriado: 'Criado em', colEstimado: 'Valor estimado', colFinal: 'Valor final',
    colVenc: 'Vencimento', colParcela: 'Parcela', colValor: 'Valor', colSituacao: 'Situação', colQtd: 'Pedidos', colPct: '%',
    sim: 'Sim', nao: 'Não', aberta: 'Em aberto', indicador: 'Indicador', pagina: 'Página', de: 'de',
    resumo: 'Resumo', abaPedidos: 'Pedidos', abaParcelas: 'Parcelas', pedidosPeriodo: 'Pedidos do período',
    graficoMensalAria: 'Gráfico de colunas: {t} nos últimos 6 meses', etapasAria: 'Pedidos do período por etapa',
  },
  en: {
    per30d: '30 days', perMes: 'Month', perTri: 'Quarter', perAno: 'Year', perLivre: 'Custom',
    nome30d: 'Last 30 days', nomeLivre: 'Custom range', triN: ' quarter of',
    vs30d: 'vs. previous 30 days', vsMes: 'vs. previous month', vsTri: 'vs. previous quarter',
    vsAno: 'vs. previous year', vsLivre: 'vs. previous period', semBase: 'No prior data',
    ate: 'to', a: 'to', dataIni: 'Start date', dataFim: 'End date', periodo: 'Period', empresa: 'Company',
    imprimir: 'Print', exportar: 'Export', expXlsx: 'Excel', expPdf: 'PDF',
    expXlsxDesc: 'Orders, installments and summary', expPdfDesc: 'Report ready to share', imprimirDesc: 'This page, on paper',
    kGasto: 'Spend', kPedidos: 'Orders', kAprov: 'Pending approval', kEconomia: 'Savings', kVencer: 'Due in 7 days',
    kAprovados: 'Approved', kReprovados: 'Rejected',
    urgente1: 'urgent', urgenteN: 'urgent', semUrgentes: 'No urgent orders',
    economiaSub: 'Against the highest quote', economiaSubN: 'Across {n}, against the highest quote', compra1: 'purchase', compraN: 'purchases',
    parcela1: 'installment', parcelaN: 'installments', vencida1: 'overdue', vencidaN: 'overdue',
    taxaAprov: 'of decided orders', reprovSub: 'In period', agoraSub: 'Right now, any date',
    tMensal: 'Monthly spend', tMensalQtd: 'Orders per month', seisMeses: 'Last 6 months',
    tDinheiro: 'Where the money goes', tDinheiroQtd: 'Where orders come from',
    porCategoria: 'By category', porEmpresa: 'By company', porFornecedor: 'By supplier',
    tCategoria: 'Spend by category', tEmpresa: 'Spend by company', tFornecedor: 'Spend by supplier',
    tParcelas: 'Upcoming installments', tMaiores: 'Largest purchases', tFila: 'Awaiting approval',
    tEtapas: 'Order stages', etapasMeta1: '1 order created in the period', etapasMetaN: '{n} orders created in the period',
    parcelasAbertas: 'Open installments', parcial: 'in progress', semFornecedor: 'Supplier not set',
    fornecedor1: 'supplier', fornecedorN: 'suppliers', empresa1: 'company', empresaN: 'companies',
    proximos30: 'Overdue and next 30 days', noPeriodo: 'In period', compradasPeriodo: 'Purchases closed in period',
    grafico: 'Chart', tabela: 'Table', mes: 'Month', variacao: 'Change', pedidos: 'orders', pedido: 'order',
    outras: 'Others', semCategoria: 'Uncategorized', total: 'Total', media: 'average',
    mediaMensal: 'Monthly average', maiorMes: 'Biggest month', esteMes: 'This month', daMedia: 'of average', semGasto: 'no spend',
    hoje: 'Today', amanha: 'Tomorrow', vencida: 'Overdue', venceHoje: 'Due today', venceAmanha: 'Due tomorrow',
    vencidaHa1: 'Overdue by 1 day', vencidaHaN: 'Overdue by {n} days', emDias: 'In {n} days',
    haDias: '{n} days ago', haDia: '1 day ago', hojeCurto: 'today',
    vazioTit: 'No orders in this period', vazioTxt: 'No orders were created between {ini} and {fim}. Try a longer period or another company.',
    verAno: 'View the whole year',
    vazioCompras: 'No purchases with a final amount in this period.', vazioMensal: 'No purchases in the last 6 months.',
    semComprasTit: 'No closed purchases in this period', semComprasTxt1: 'The order in this period has no final amount yet.', semComprasTxtN: 'The {n} orders in this period have no final amount yet.', semComprasTxt: 'Categories and companies show up here once the purchase is recorded.',
    ver30: 'View last 30 days', vsMesmo: 'vs. same period of {a}',
    vazioParcelasTit: 'No open installments', vazioParcelasTxt: 'Nothing overdue or due in the next 30 days.',
    vazioFilaTit: 'Queue is empty', vazioFilaTxt: 'No orders are awaiting approval right now.',
    erroTit: 'Could not load reports', erroTxt: 'Check your connection and try again.', tentar: 'Try again',
    totalParcelas: '{n} open', semPermissao: 'You are not allowed to export financial data.',
    erroExport: 'Could not generate the file. Check your connection.',
    relatorioCompras: 'Purchasing report', geradoEm: 'Generated on', todas: 'All companies',
    colNum: 'No.', colTitulo: 'Title', colEmpresa: 'Company', colCategoria: 'Category', colStatus: 'Status',
    colUrgente: 'Urgent', colCriado: 'Created', colEstimado: 'Estimated', colFinal: 'Final amount',
    colVenc: 'Due date', colParcela: 'Installment', colValor: 'Amount', colSituacao: 'State', colQtd: 'Orders', colPct: '%',
    sim: 'Yes', nao: 'No', aberta: 'Open', indicador: 'Metric', pagina: 'Page', de: 'of',
    resumo: 'Summary', abaPedidos: 'Orders', abaParcelas: 'Installments', pedidosPeriodo: 'Orders in period',
    graficoMensalAria: 'Column chart: {t} over the last 6 months', etapasAria: 'Orders in the period by stage',
  },
}
function _lang() { try { return sessionStorage.getItem('praxis_lang') || 'pt' } catch { return 'pt' } }
function tr(chave, vars) {
  let s = (TXT[_lang()] || TXT.pt)[chave] ?? TXT.pt[chave] ?? t(chave)
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v)
  return s
}
function _locale() { return _lang() === 'en' ? 'en-US' : 'pt-BR' }

// ── Ícones (traço 2, mesma família) ───────────────────────────
const ic = (d, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ICONE = {
  imprimir: ic('<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>'),
  baixar: ic('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  seta: ic('<path d="m6 9 6 6 6-6"/>', 14),
  planilha: ic('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  pdf: ic('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
  grafico: ic('<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>', 14),
  tabela: ic('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M9 10v10"/>', 14),
  calendario: ic('<rect x="3" y="4" width="18" height="17" rx="1"/><path d="M16 2v4M8 2v4M3 10h18"/>', 22),
  moedas: ic('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>', 22),
  check: ic('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>', 22),
  alerta: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>', 22),
  sobe: ic('<path d="M7 17 17 7M9 7h8v8"/>', 13),
  desce: ic('<path d="M7 7l10 10M17 9v8H9"/>', 13),
  igual: ic('<path d="M5 12h14"/>', 13),
}

// ── Estado ────────────────────────────────────────────────────
let _todos      = []   // todos os pedidos visíveis ao usuário
let _parcelas   = []   // { id, pedidoId, ...parcela }
let _cotacoes   = {}   // { pedidoId: [cotacao] }
let _empresas   = []
let _categorias = []
let _filtroPer  = '30d'
let _filtroEmp  = 'todas'
let _dataIni    = ''
let _dataFim    = ''
let _vistaMensal = 'grafico'
let _carregado  = false
let _geracao    = 0

const CONCLUIDOS = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
// As sete etapas do caminho, na ordem do quadro; reprovados e cancelados ficam à parte
const ETAPAS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO,
  STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
const FORA = [STATUS.REPROVADO, STATUS.CANCELADO]
const ORDEM_STATUS = [...ETAPAS, ...FORA]
// Ponto de cor do status nas listas (texto + ponto, sem etiqueta colorida)
const COR_STATUS = {
  solicitado: 'var(--text3)', ag_cotacao: 'var(--blue)', em_aprovacao: 'var(--amber)',
  aprovado: 'var(--green)', comprado: 'var(--green)', entregue: 'var(--green)', pago: 'var(--green)',
  reprovado: 'var(--red)', cancelado: 'var(--text3)',
}

// Tons das categorias: a cor cadastrada escolhe o matiz, e o tom vem da paleta
// quente da tela (variáveis --rel-* em views.css, uma por tema). Nada de azul
// ou vermelho saturados. A ordem é a de desempate quando dois matizes coincidem.
const TONS = ['ocre', 'oliva', 'egeu', 'vinho', 'areia', 'mar', 'ametista', 'rosa', 'argila']
// Os mesmos tons no papel (PDF), iguais aos do tema claro
const TONS_PAPEL = {
  ocre: [154, 106, 20], oliva: [79, 122, 58], egeu: [65, 103, 140], vinho: [142, 63, 51], areia: [140, 115, 70],
  mar: [61, 117, 108], ametista: [108, 88, 136], rosa: [154, 84, 98], argila: [125, 110, 92],
}
// Atribui um tom por categoria da lista, sem repetir tons na mesma lista
function _tonsDaLista(ids) {
  const usados = new Set(), mapa = {}
  ids.forEach(id => {
    if (id === '__outras__') return
    let tom = tomDaCor(_categorias.find(c => c.id === id)?.cor) || TONS[0]
    if (usados.has(tom)) tom = TONS.find(x => !usados.has(x)) || tom
    usados.add(tom); mapa[id] = tom
  })
  return mapa
}

// Aprovador NÃO acessa relatórios financeiros consolidados (spec §8.4)
function _podeVerFinanceiro() {
  return [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.FINANCEIRO].includes(sessao.usuario?.perfil)
}

// ── Datas ─────────────────────────────────────────────────────
const _pad = n => String(n).padStart(2, '0')
const _iso = d => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`
const _deIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
const _somaDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const _hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const _diasEntre = (a, b) => Math.round((_deIso(b) - _deIso(a)) / 86400000)
function _menosMeses(d, k) {
  const alvo = new Date(d.getFullYear(), d.getMonth() - k, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(d.getDate(), ultimo))
  return alvo
}
function _dataPedido(p) {
  if (!p.criadoEm) return null
  const d = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
  return isNaN(d) ? null : d
}
function _isoPedido(p) { const d = _dataPedido(p); return d ? _iso(d) : null }
const _capital = s => s.charAt(0).toUpperCase() + s.slice(1)

// Intervalo atual e o período anterior equivalente (para comparação)
function _intervalo() {
  const hoje = _hoje()
  let ini, fim = hoje, antIni, antFim, nome, vs
  const y = hoje.getFullYear(), m = hoje.getMonth()
  if (_filtroPer === 'mes') {
    ini = new Date(y, m, 1)
    antIni = _menosMeses(ini, 1); antFim = _menosMeses(fim, 1)
    nome = _capital(ini.toLocaleDateString(_locale(), { month: 'long', year: 'numeric' })); vs = tr('vsMes')
  } else if (_filtroPer === 'tri') {
    const q = Math.floor(m / 3)
    ini = new Date(y, q * 3, 1)
    antIni = _menosMeses(ini, 3); antFim = _menosMeses(fim, 3)
    nome = _lang() === 'en' ? `Q${q + 1} ${y}` : `${q + 1}${tr('triN')} ${y}`; vs = tr('vsTri')
  } else if (_filtroPer === 'ano') {
    ini = new Date(y, 0, 1)
    antIni = _menosMeses(ini, 12); antFim = _menosMeses(fim, 12)
    nome = String(y); vs = tr('vsAno')
  } else if (_filtroPer === 'livre' && _dataIni && _dataFim) {
    ini = _deIso(_dataIni); fim = _deIso(_dataFim)
    if (ini > fim) [ini, fim] = [fim, ini]
    const dias = Math.round((fim - ini) / 86400000) + 1
    antFim = _somaDias(ini, -1); antIni = _somaDias(antFim, -(dias - 1))
    nome = tr('nomeLivre'); vs = tr('vsLivre')
  } else {
    ini = _somaDias(hoje, -29)
    antFim = _somaDias(ini, -1); antIni = _somaDias(antFim, -29)
    nome = tr('nome30d'); vs = tr('vs30d')
  }
  if (antFim >= ini) antFim = _somaDias(ini, -1)
  const dm = d => `${_pad(d.getDate())}/${_pad(d.getMonth() + 1)}`
  if (_filtroPer === 'ano') vs = tr('vsMesmo', { a: antIni.getFullYear() })
  else if (_filtroPer !== '30d') vs = `vs. ${dm(antIni)} ${tr('a')} ${dm(antFim)}`
  return { ini: _iso(ini), fim: _iso(fim), antIni: _iso(antIni), antFim: _iso(antFim), nome, vs }
}

// ── Formatação ────────────────────────────────────────────────
function _brl(v) { return formatCurrency(v || 0) }
function _brlCompacto(v) {
  if (!v) return 'R$ 0'
  if (Math.abs(v) < 1000) return 'R$ ' + Math.round(v).toLocaleString(_locale())
  return 'R$ ' + new Intl.NumberFormat(_locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}
// Valor em numeral grande: "R$" e centavos menores, a parte inteira manda
function _numMoeda(v) {
  const s = _brl(v).replace(/\s/g, ' ')
  const m = /^(-?)R\$ ?(.+?)([,.]\d{2})$/.exec(s)
  if (!m) return esc(s)
  return `<span class="rel-moeda">R$</span>${m[1]}${m[2]}<span class="rel-cent">${m[3]}</span>`
}
function _pct(parte, total) { return total ? Math.round((parte / total) * 100) : 0 }
const _nomeEmpresa = id => _empresas.find(e => e.id === id)?.nome || '—'
const _nomeCategoria = id => id ? (_categorias.find(c => c.id === id)?.nome || tr('semCategoria')) : tr('semCategoria')
const _plural = (n, s, p) => `${n} ${n === 1 ? s : p}`
const _num = n => Number(n).toLocaleString(_locale(), { maximumFractionDigits: 1 })

// ── Render da página ──────────────────────────────────────────
export async function renderRelatorios() {
  const fin = _podeVerFinanceiro()
  _carregado = false
  const app = document.getElementById('app')
  const pers = ['30d', 'mes', 'tri', 'ano', 'livre']
  const rotPer = { '30d': tr('per30d'), mes: tr('perMes'), tri: tr('perTri'), ano: tr('perAno'), livre: tr('perLivre') }
  // Quem não vê dados financeiros só imprime: um botão, sem menu de um item só
  const acao = fin ? `
    <div class="rel-menu-wrap">
      <button class="btn-secondary rel-btn-exportar" id="btn-exportar" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="rel-menu" aria-label="${tr('exportar')}">
        ${ICONE.baixar}<span class="rel-btn-rot">${tr('exportar')}</span><span class="rel-btn-seta">${ICONE.seta}</span>
      </button>
      <div class="rel-menu" id="rel-menu" role="menu" hidden>
        ${_itemMenu('data-export="pdf"', ICONE.pdf, tr('expPdf'), tr('expPdfDesc'))}
        ${_itemMenu('data-export="xlsx"', ICONE.planilha, tr('expXlsx'), tr('expXlsxDesc'))}
        <div class="rel-menu-sep" role="separator"></div>
        ${_itemMenu('data-acao="imprimir"', ICONE.imprimir, tr('imprimir'), tr('imprimirDesc'))}
      </div>
    </div>`
    : `<button class="btn-secondary rel-btn-exportar" id="btn-imprimir" type="button" aria-label="${tr('imprimir')}">${ICONE.imprimir}<span class="rel-btn-rot">${tr('imprimir')}</span></button>`
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('relatorios')}
      <div class="main-content rel-page">
        <div class="rel-print-head" aria-hidden="true">
          ${marcaPraxis('rel-print-marca')}
          <span class="rel-print-doc">${tr('relatorioCompras')}</span>
        </div>
        <header class="rel-head">
          <h1 class="titulo-pagina">${t('relatorios')}</h1>
          <p class="rel-frase" id="rel-sub">&nbsp;</p>
        </header>

        <div class="rel-barra">
          <div class="rel-seg" id="period-pills" role="group" aria-label="${tr('periodo')}">
            ${pers.map(p => `<button type="button" class="rel-seg-btn${p === _filtroPer ? ' active' : ''}" data-per="${p}" aria-pressed="${p === _filtroPer}">${rotPer[p]}</button>`).join('')}
          </div>
          <div class="rel-datas" id="date-range-wrap" ${_filtroPer === 'livre' ? '' : 'hidden'}>
            <input type="date" id="data-ini" aria-label="${tr('dataIni')}">
            <span class="rel-datas-ate">${tr('a')}</span>
            <input type="date" id="data-fim" aria-label="${tr('dataFim')}">
          </div>
          <div class="rel-barra-fim">
            <select id="filtro-empresa" class="rel-empresa" aria-label="${tr('empresa')}">
              <option value="todas">${t('todasEmpresas')}</option>
            </select>
            ${acao}
          </div>
        </div>

        <div id="dash-content" aria-live="polite">${_skeleton(fin)}</div>
        <div class="rel-dica" id="rel-dica" role="tooltip" hidden></div>
      </div>
      ${renderFooter()}
    </div>
  `
  initTopbarEvents(false)
  renderNotificacoes()
  _bindEvents()
  if (_filtroPer === 'livre') {
    const a = document.getElementById('data-ini'), b = document.getElementById('data-fim')
    if (a) a.value = _dataIni
    if (b) b.value = _dataFim
  }
  await _carregar()
}

function _itemMenu(attr, icone, titulo, desc) {
  return `<button class="rel-menu-item" role="menuitem" type="button" ${attr}>
    ${icone}<span class="rel-menu-txt"><strong>${titulo}</strong><small>${desc}</small></span>
  </button>`
}

function _skeleton(fin) {
  const n = fin ? 5 : 4
  const kpi = i => `<div class="rel-kpi${fin && i === 0 ? ' destaque' : ''}"><div class="skeleton" style="height:38px;width:${i === 0 ? 78 : 52}%"></div><div class="skeleton skeleton-text" style="width:46%;margin-top:12px"></div><div class="skeleton skeleton-text" style="width:64%"></div></div>`
  return `<div class="rel-dash" aria-busy="true">
    <div class="rel-kpis rel-kpis-${n}">${Array.from({ length: n }, (_, i) => kpi(i)).join('')}</div>
    <div class="rel-grade">
      <section class="rel-secao rel-larg-12">
        <div class="skeleton skeleton-title" style="width:180px"></div>
        <div class="skeleton skeleton-text" style="width:240px"></div>
        <div class="skeleton" style="height:230px;margin-top:18px"></div>
      </section>
    </div>
  </div>`
}

async function _carregar() {
  const geracao = ++_geracao
  const container = document.getElementById('dash-content')
  try {
    await _carregarDados()
    if (geracao !== _geracao || !document.getElementById('dash-content')) return
    _preencherEmpresas()
    _carregado = true
    _renderDash()
  } catch (err) {
    if (geracao !== _geracao) return
    console.warn('Relatórios: falha ao carregar', err)
    if (container) container.innerHTML = `
      <div class="rel-erro">
        ${_vazio(ICONE.alerta, tr('erroTit'), tr('erroTxt'), `<button class="btn-secondary btn-sm" type="button" id="rel-tentar">${tr('tentar')}</button>`)}
      </div>`
    document.getElementById('rel-tentar')?.addEventListener('click', () => {
      container.innerHTML = _skeleton(_podeVerFinanceiro())
      _carregar()
    })
  }
}

function _bindEvents() {
  document.getElementById('period-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-per]')
    if (!btn || btn.dataset.per === _filtroPer) return
    _definirPeriodo(btn.dataset.per)
  })

  const iniEl = document.getElementById('data-ini')
  const fimEl = document.getElementById('data-fim')
  const aoMudarData = () => {
    if (!iniEl.value || !fimEl.value) return
    _dataIni = iniEl.value; _dataFim = fimEl.value
    if (_dataIni > _dataFim) { [_dataIni, _dataFim] = [_dataFim, _dataIni]; iniEl.value = _dataIni; fimEl.value = _dataFim }
    _renderDash()
  }
  iniEl?.addEventListener('change', aoMudarData)
  fimEl?.addEventListener('change', aoMudarData)

  document.getElementById('filtro-empresa')?.addEventListener('change', e => {
    _filtroEmp = e.target.value
    _renderDash()
  })

  document.getElementById('btn-imprimir')?.addEventListener('click', () => window.print())

  // Menu Exportar: PDF, Excel e Imprimir
  const btnExp = document.getElementById('btn-exportar')
  const menu = document.getElementById('rel-menu')
  const fechar = () => { if (menu && !menu.hidden) { menu.hidden = true; btnExp?.setAttribute('aria-expanded', 'false') } }
  btnExp?.addEventListener('click', e => {
    e.stopPropagation()
    const abrir = menu.hidden
    menu.hidden = !abrir
    btnExp.setAttribute('aria-expanded', String(abrir))
    if (abrir) menu.querySelector('.rel-menu-item')?.focus({ preventScroll: true })
  })
  menu?.addEventListener('click', e => {
    const item = e.target.closest('.rel-menu-item')
    if (!item) return
    fechar()
    if (item.dataset.acao === 'imprimir') { window.print(); return }
    if (item.dataset.export === 'xlsx') _exportarExcel()
    else if (item.dataset.export === 'pdf') _exportarPDF()
  })
  menu?.addEventListener('keydown', e => {
    const itens = [...menu.querySelectorAll('.rel-menu-item')]
    const i = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus() }
    if (e.key === 'Tab') fechar()
  })
  const aoClicarFora = e => {
    if (!e.target.closest?.('.rel-menu-wrap')) fechar()
    if (!e.target.closest?.('.rel-col')) _esconderDica()
  }
  const aoRolar = () => _esconderDica()
  window.addEventListener('scroll', aoRolar, { passive: true })
  const aoTeclar = e => { if (e.key === 'Escape' && menu && !menu.hidden) { fechar(); btnExp?.focus() } }
  document.addEventListener('click', aoClicarFora)
  document.addEventListener('keydown', aoTeclar)
  registrarLimpador(() => {
    document.removeEventListener('click', aoClicarFora)
    document.removeEventListener('keydown', aoTeclar)
    window.removeEventListener('scroll', aoRolar)
  })

  // Painel (delegação): ações dentro das seções
  document.getElementById('dash-content')?.addEventListener('click', e => {
    const vista = e.target.closest('[data-vista]')
    if (vista) { _vistaMensal = vista.dataset.vista; _renderDash(); return }
    const per = e.target.closest('[data-ir-per]')
    if (per) { _definirPeriodo(per.dataset.irPer); return }
    const ped = e.target.closest('[data-pedido]')
    if (ped) { navegar('detalhe', { id: ped.dataset.pedido }); return }
    const col = e.target.closest('.rel-col')
    if (col) _mostrarDica(col)
  })
}

function _definirPeriodo(per) {
  _filtroPer = per
  document.querySelectorAll('#period-pills .rel-seg-btn').forEach(b => {
    const ativo = b.dataset.per === per
    b.classList.toggle('active', ativo)
    b.setAttribute('aria-pressed', String(ativo))
  })
  const wrap = document.getElementById('date-range-wrap')
  if (per === 'livre') {
    // Começa nos últimos 30 dias, para nunca ficar vazio
    if (!_dataIni || !_dataFim) {
      const hoje = _hoje()
      _dataIni = _iso(_somaDias(hoje, -29)); _dataFim = _iso(hoje)
    }
    const a = document.getElementById('data-ini'), b = document.getElementById('data-fim')
    if (a) a.value = _dataIni
    if (b) b.value = _dataFim
  }
  if (wrap) wrap.hidden = per !== 'livre'
  _renderDash()
}

async function _carregarDados() {
  const perfil = sessao.usuario.perfil
  const raw    = sessao.usuario.empresas
  const ids    = Array.isArray(raw) ? raw : Object.keys(raw || {})
  const fin    = _podeVerFinanceiro()

  const [empSnap, catSnap, pedSnap] = await Promise.all([
    getDocs(collection(db, 'empresas')),
    getDocs(collection(db, 'categorias')),
    perfil === PERFIS.SUPREMO
      ? getDocs(collection(db, 'pedidos'))
      : (ids.length ? getDocs(query(collection(db, 'pedidos'), where('empresaId', 'in', ids.slice(0, 10)))) : Promise.resolve(null)),
  ])
  _empresas   = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _todos      = pedSnap ? pedSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []
  _parcelas   = []
  _cotacoes   = {}
  if (!fin) return

  // Parcelas e cotações só existem em pedidos com valor final
  const comValor = _todos.filter(p => p.valorFinal)
  await Promise.all(comValor.map(async p => {
    const [pSnap, cSnap] = await Promise.all([
      getDocs(collection(db, 'pedidos', p.id, 'parcelas')).catch(() => null),
      getDocs(collection(db, 'pedidos', p.id, 'cotacoes')).catch(() => null),
    ])
    pSnap?.docs.forEach(d => _parcelas.push({ id: d.id, pedidoId: p.id, ...d.data() }))
    _cotacoes[p.id] = cSnap ? cSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []
  }))
}

function _preencherEmpresas() {
  const sel = document.getElementById('filtro-empresa')
  if (!sel || sel.options.length > 1) return
  const perfil = sessao.usuario.perfil
  const raw    = sessao.usuario.empresas
  const ids    = Array.isArray(raw) ? raw : Object.keys(raw || {})
  _empresas
    .filter(e => perfil === PERFIS.SUPREMO || ids.includes(e.id))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      sel.appendChild(opt)
    })
  sel.value = _filtroEmp
  if (sel.value !== _filtroEmp) { _filtroEmp = 'todas'; sel.value = 'todas' }
}

// ── Cálculo dos dados do painel ───────────────────────────────
function _calcular() {
  const iv = _intervalo()
  const daEmpresa = p => _filtroEmp === 'todas' || p.empresaId === _filtroEmp
  const base = _todos.filter(daEmpresa)
  const noIntervalo = (p, a, b) => { const d = _isoPedido(p); return d && d >= a && d <= b }
  const ped = base.filter(p => noIntervalo(p, iv.ini, iv.fim))
    .sort((a, b) => (_dataPedido(b) || 0) - (_dataPedido(a) || 0))
  const ant = base.filter(p => noIntervalo(p, iv.antIni, iv.antFim))

  const comGasto = arr => arr.filter(p => p.valorFinal && ![STATUS.CANCELADO, STATUS.REPROVADO].includes(p.status))
  const soma = arr => arr.reduce((s, p) => s + (Number(p.valorFinal) || 0), 0)
  const gasto = soma(comGasto(ped)), gastoAnt = soma(comGasto(ant))

  const emAprov = base.filter(p => p.status === STATUS.EM_APROVACAO)
  const urgentes = emAprov.filter(p => p.urgente).length

  let economia = 0, nEconomia = 0
  comGasto(ped).forEach(p => {
    const cots = _cotacoes[p.id] || []
    const ind = cots.find(c => c.indicada)
    if (cots.length < 2 || !ind) return
    const s = Math.max(...cots.map(c => Number(c.valor) || 0)) - (Number(ind.valor) || 0)
    if (s > 0) { economia += s; nEconomia++ }
  })

  // Parcelas em aberto (independem do período: são vencimentos)
  const idsBase = new Set(base.map(p => p.id))
  const hoje = _iso(_hoje()), em7 = _iso(_somaDias(_hoje(), 7)), em30 = _iso(_somaDias(_hoje(), 30))
  const abertas = _parcelas.filter(pc => idsBase.has(pc.pedidoId) && !pc.pago && pc.vencimento)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
  const vencer7 = abertas.filter(pc => pc.vencimento >= hoje && pc.vencimento <= em7)
  const vencidas = abertas.filter(pc => pc.vencimento < hoje)
  const proximas = abertas.filter(pc => pc.vencimento <= em30)

  // Etapas: quantidade e valor (final, ou estimado enquanto não há compra)
  const porStatus = {}, valorStatus = {}
  ped.forEach(p => {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1
    valorStatus[p.status] = (valorStatus[p.status] || 0) + (Number(p.valorFinal) || Number(p.valorEstimado) || 0)
  })
  const decididos = ped.filter(p => CONCLUIDOS.includes(p.status) || p.status === STATUS.REPROVADO).length
  const aprovados = ped.filter(p => CONCLUIDOS.includes(p.status)).length

  // Agrupamentos (valor para quem vê financeiro; contagem para o aprovador)
  const fin = _podeVerFinanceiro()
  const agrupar = chave => {
    const m = {}
    const fonte = fin ? comGasto(ped) : ped
    fonte.forEach(p => {
      const k = p[chave] || ''
      m[k] = m[k] || { id: k, valor: 0, qtd: 0 }
      m[k].valor += Number(p.valorFinal) || 0
      m[k].qtd++
    })
    return Object.values(m).sort((a, b) => fin ? b.valor - a.valor : b.qtd - a.qtd)
  }

  // Últimos 6 meses (independe do período, respeita a empresa)
  const meses = []
  const agora = _hoje()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    meses.push({ ano: d.getFullYear(), mes: d.getMonth(), valor: 0, qtd: 0, atual: i === 0 })
  }
  base.forEach(p => {
    const d = _dataPedido(p); if (!d) return
    const m = meses.find(x => x.ano === d.getFullYear() && x.mes === d.getMonth()); if (!m) return
    if (fin) {
      if (p.valorFinal && ![STATUS.CANCELADO, STATUS.REPROVADO].includes(p.status)) { m.valor += Number(p.valorFinal) || 0; m.qtd++ }
    } else { m.qtd++; m.valor++ }
  })

  return {
    iv, ped, ant, gasto, gastoAnt, emAprov, urgentes, economia, nEconomia,
    abertas, vencer7, vencidas, proximas, porStatus, valorStatus, decididos, aprovados,
    porCategoria: agrupar('categoriaId'), porEmpresa: agrupar('empresaId'), porFornecedor: _porFornecedor(comGasto(ped)), meses,
    compras: comGasto(ped).length,
    maiores: comGasto(ped).sort((a, b) => b.valorFinal - a.valorFinal).slice(0, 5),
    reprovados: ped.filter(p => p.status === STATUS.REPROVADO).length,
  }
}

function _nomeFornecedor(p) {
  if (p.fornecedorNome) return p.fornecedorNome
  return (_cotacoes[p.id] || []).find(c => c.indicada)?.fornecedorNome || ''
}
function _porFornecedor(lista) {
  const m = {}
  lista.forEach(p => {
    const k = _nomeFornecedor(p)
    m[k] = m[k] || { id: k, valor: 0, qtd: 0 }
    m[k].valor += Number(p.valorFinal) || 0
    m[k].qtd++
  })
  return Object.values(m).sort((a, b) => b.valor - a.valor)
}

// ── Render do painel ──────────────────────────────────────────
// Ordem: indicadores → mensal → para onde vai o dinheiro → parcelas e
// maiores compras (ou a fila, para o aprovador) → régua das etapas
function _renderDash() {
  const container = document.getElementById('dash-content')
  if (!container || !_carregado) return
  _esconderDica()
  const fin = _podeVerFinanceiro()
  const D = _calcular()
  const sub = document.getElementById('rel-sub')
  const emp = _filtroEmp === 'todas' ? t('todasEmpresas') : _nomeEmpresa(_filtroEmp)
  if (sub) sub.innerHTML = `<span>${esc(D.iv.nome)}</span><span class="rel-frase-sep" aria-hidden="true">·</span><span class="num">${formatDate(D.iv.ini)} ${tr('a')} ${formatDate(D.iv.fim)}</span><span class="rel-frase-sep rel-frase-emp" aria-hidden="true">·</span><span class="rel-frase-emp">${esc(emp)}</span>`

  const kpis = fin ? _kpisFinanceiro(D) : _kpisAprovador(D)
  const nK = fin ? 5 : 4
  let grade
  if (!D.ped.length) {
    grade = `
      ${_secao({ id: 'bloco-vazio', larg: 12, titulo: tr('pedidosPeriodo'), corpo: _vazio(ICONE.calendario, tr('vazioTit'),
        tr('vazioTxt', { ini: formatDate(D.iv.ini), fim: formatDate(D.iv.fim) }),
        _filtroPer !== 'ano' ? `<button class="btn-secondary btn-sm" type="button" data-ir-per="ano">${tr('verAno')}</button>` : '') })}
      ${_blocoMensal(D)}
      ${fin ? _blocoParcelas(D, 12) : ''}`
  } else if (fin) {
    const semCompras = !D.maiores.length
    const acao = _filtroPer !== '30d' ? `<button class="btn-secondary btn-sm" type="button" data-ir-per="30d">${tr('ver30')}</button>` : ''
    grade = `
      ${_blocoMensal(D)}
      ${semCompras
        ? _secao({ id: 'bloco-dinheiro', larg: 12, titulo: tr('tDinheiro'), corpo: _vazio(ICONE.moedas, tr('semComprasTit'),
            `${D.ped.length === 1 ? tr('semComprasTxt1') : tr('semComprasTxtN', { n: D.ped.length })} ${tr('semComprasTxt')}`, acao) })
        : _blocoDinheiro(D)}
      ${_blocoParcelas(D, semCompras ? 12 : 6)}
      ${semCompras ? '' : _blocoMaiores(D)}
      ${_blocoEtapas(D)}`
  } else {
    grade = `
      ${_blocoMensal(D)}
      ${_blocoDinheiro(D)}
      ${_blocoFila(D)}
      ${_blocoEtapas(D)}`
  }
  container.innerHTML = `
    <div class="rel-dash" data-pronto="1" data-per="${_filtroPer}">
      <div class="rel-kpis rel-kpis-${nK}">${kpis}</div>
      <div class="rel-grade">${grade}</div>
    </div>`
  _ligarDicas()
}

// Variação contra o período anterior: seta e percentual em texto pequeno, sem cor
// de "bom" ou "ruim" (gastar mais não é bom nem ruim por si)
function _delta(atual, anterior, vs) {
  if (!anterior && !atual) return `<span class="rel-var">${ICONE.igual}0%</span><span>${vs}</span>`
  if (!anterior) return `<span>${tr('semBase')}</span>`
  const pct = Math.round(((atual - anterior) / anterior) * 100)
  const icone = pct > 0 ? ICONE.sobe : pct < 0 ? ICONE.desce : ICONE.igual
  const txt = (pct > 0 ? '+' : pct < 0 ? '−' : '') + Math.abs(pct).toLocaleString(_locale()) + '%'
  return `<span class="rel-var">${icone}${txt}</span><span>${vs}</span>`
}
const _alerta = (txt, cor) => `<span class="rel-alerta" style="--cor:${cor}">${txt}</span>`

function _kpi({ rotulo, valor, sub, destaque = false }) {
  return `<div class="rel-kpi${destaque ? ' destaque' : ''}">
    <div class="rel-kpi-valor">${valor}</div>
    <div class="rel-kpi-rotulo">${rotulo}</div>
    <div class="rel-kpi-sub">${sub}</div>
  </div>`
}

function _kpisFinanceiro(D) {
  const urg = D.urgentes ? _alerta(_plural(D.urgentes, tr('urgente1'), tr('urgenteN')), 'var(--gold)') : `<span>${tr('semUrgentes')}</span>`
  const totalV7 = D.vencer7.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const venc = `<span>${_plural(D.vencer7.length, tr('parcela1'), tr('parcelaN'))}</span>${D.vencidas.length ? _alerta(_plural(D.vencidas.length, tr('vencida1'), tr('vencidaN')), 'var(--red)') : ''}`
  const econ = `<span>${D.nEconomia ? tr('economiaSubN', { n: _plural(D.nEconomia, tr('compra1'), tr('compraN')) }) : tr('economiaSub')}</span>`
  return [
    _kpi({ rotulo: tr('kGasto'), valor: _numMoeda(D.gasto), sub: _delta(D.gasto, D.gastoAnt, D.iv.vs), destaque: true }),
    _kpi({ rotulo: tr('kPedidos'), valor: D.ped.length, sub: _delta(D.ped.length, D.ant.length, D.iv.vs) }),
    _kpi({ rotulo: tr('kAprov'), valor: D.emAprov.length, sub: urg }),
    _kpi({ rotulo: tr('kEconomia'), valor: _numMoeda(D.economia), sub: econ }),
    _kpi({ rotulo: tr('kVencer'), valor: _numMoeda(totalV7), sub: venc }),
  ].join('')
}

// Sem dados financeiros: o número que pede ação é a fila de aprovação
function _kpisAprovador(D) {
  const urg = D.urgentes ? _alerta(_plural(D.urgentes, tr('urgente1'), tr('urgenteN')), 'var(--gold)') : `<span>${tr('semUrgentes')}</span>`
  const taxa = D.decididos ? `${_pct(D.aprovados, D.decididos)}% ${tr('taxaAprov')}` : tr('noPeriodo')
  return [
    _kpi({ rotulo: tr('kAprov'), valor: D.emAprov.length, sub: urg, destaque: true }),
    _kpi({ rotulo: tr('kPedidos'), valor: D.ped.length, sub: _delta(D.ped.length, D.ant.length, D.iv.vs) }),
    _kpi({ rotulo: tr('kAprovados'), valor: D.aprovados, sub: `<span>${taxa}</span>` }),
    _kpi({ rotulo: tr('kReprovados'), valor: D.reprovados, sub: `<span>${tr('reprovSub')}</span>` }),
  ].join('')
}

function _secao({ id, larg = 12, titulo, meta = '', acoes = '', corpo, cls = '' }) {
  return `<section class="rel-secao rel-larg-${larg}${cls ? ' ' + cls : ''}" id="${id}" aria-labelledby="${id}-tit">
    <header class="rel-secao-cab">
      <div class="rel-secao-tit"><h2 id="${id}-tit">${titulo}</h2>${meta ? `<p class="rel-secao-meta">${meta}</p>` : ''}</div>
      ${acoes}
    </header>
    <div class="rel-secao-corpo">${corpo}</div>
  </section>`
}

function _vazio(icone, titulo, texto, acao = '') {
  return `<div class="rel-vazio">
    <span class="rel-vazio-ic">${icone}</span>
    <p class="rel-vazio-tit">${titulo}</p>
    ${texto ? `<p class="rel-vazio-txt">${texto}</p>` : ''}
    ${acao}
  </div>`
}

// Escala "bonita" para o eixo Y
function _escala(max, n = 4, inteiro = false) {
  if (max <= 0) return { topo: n, passo: 1, n }
  const bruto = max / n
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)))
  const norm = bruto / mag
  let passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  if (inteiro) passo = Math.max(1, Math.ceil(passo))
  const k = Math.max(2, Math.ceil(max / passo - 1e-9))
  return { topo: passo * k, passo, n: k }
}

// Leitura dos 6 meses: média dos meses fechados, o maior mês e o mês corrente
function _leituraMeses(D) {
  const fechados = D.meses.filter(m => !m.atual)
  const media = fechados.reduce((s, m) => s + m.valor, 0) / (fechados.length || 1)
  const maior = D.meses.reduce((a, m) => (m.valor > a.valor ? m : a), D.meses[0])
  const atual = D.meses.find(m => m.atual)
  return { media, maior, atual, fechados }
}

function _blocoMensal(D) {
  const fin = _podeVerFinanceiro()
  const loc = _locale()
  const nomeMes = m => new Date(m.ano, m.mes, 1).toLocaleDateString(loc, { month: 'short' }).replace('.', '')
  const nomeMesSo = m => _capital(new Date(m.ano, m.mes, 1).toLocaleDateString(loc, { month: 'long' }))
  const nomeMesLongo = m => _capital(new Date(m.ano, m.mes, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' }))
  const fmt = v => fin ? _brl(v) : String(v)
  const fmtEixo = v => fin ? _brlCompacto(v) : String(Math.round(v))
  const max = Math.max(...D.meses.map(m => m.valor), 0)
  const titulo = fin ? tr('tMensal') : tr('tMensalQtd')
  const L = _leituraMeses(D)
  const toggle = `<div class="rel-mini-seg" role="group" aria-label="${tr('grafico')} / ${tr('tabela')}">
      <button type="button" class="${_vistaMensal === 'grafico' ? 'active' : ''}" data-vista="grafico" aria-pressed="${_vistaMensal === 'grafico'}" aria-label="${tr('grafico')}" data-tooltip="${tr('grafico')}">${ICONE.grafico}</button>
      <button type="button" class="${_vistaMensal === 'tabela' ? 'active' : ''}" data-vista="tabela" aria-pressed="${_vistaMensal === 'tabela'}" aria-label="${tr('tabela')}" data-tooltip="${tr('tabela')}">${ICONE.tabela}</button>
    </div>`

  let grafico
  if (!max) {
    grafico = _vazio(ICONE.moedas, tr('vazioMensal'), '')
  } else if (_vistaMensal === 'tabela') {
    grafico = `<div class="rel-tabela-wrap"><table class="rel-tabela">
      <thead><tr><th>${tr('mes')}</th><th class="dir">${tr('colQtd')}</th>${fin ? `<th class="dir">${tr('kGasto')}</th>` : ''}<th class="dir">${tr('variacao')}</th></tr></thead>
      <tbody>${D.meses.map((m, i) => {
        const ant = i ? D.meses[i - 1].valor : null
        const v = ant && !m.atual ? Math.round(((m.valor - ant) / ant) * 100) : null
        const vtxt = v == null ? '—' : `<span class="rel-var">${v > 0 ? ICONE.sobe : v < 0 ? ICONE.desce : ICONE.igual}${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%</span>`
        const curto = `${nomeMes(m)}/${String(m.ano).slice(2)}`
        return `<tr${m.atual ? ' class="atual"' : ''}><td><span class="rel-mes-longo">${nomeMesLongo(m)}</span><span class="rel-mes-curto">${curto}</span>${m.atual ? ` <span class="rel-parcial">${tr('parcial')}</span>` : ''}</td><td class="dir num">${m.qtd}</td>${fin ? `<td class="dir num">${_brl(m.valor)}</td>` : ''}<td class="dir">${vtxt}</td></tr>`
      }).join('')}</tbody>
      <tfoot><tr><td>${tr('total')}</td><td class="dir num">${D.meses.reduce((s, m) => s + m.qtd, 0)}</td>${fin ? `<td class="dir num">${_brl(D.meses.reduce((s, m) => s + m.valor, 0))}</td>` : ''}<td></td></tr></tfoot>
    </table></div>`
  } else {
    const esc4 = _escala(max, 4, !fin)
    const linhas = Array.from({ length: esc4.n + 1 }, (_, i) => {
      const v = esc4.passo * i
      return `<div class="rel-grade-linha${i === 0 ? ' base' : ''}" style="bottom:${(v / esc4.topo) * 100}%"><span>${fmtEixo(v)}</span></div>`
    }).join('')
    const media = L.media > 0
      ? `<div class="rel-media" style="bottom:${(L.media / esc4.topo) * 100}%" aria-hidden="true"></div>`
      : ''
    grafico = `<div class="rel-colchart" role="img" aria-label="${tr('graficoMensalAria', { t: titulo.toLowerCase() })}">
      <div class="rel-plot">
        ${linhas}
        ${media}
        <div class="rel-cols">
          ${D.meses.map((m, i) => {
            const h = (m.valor / esc4.topo) * 100
            const qtdTxt = _plural(m.qtd, tr('pedido'), tr('pedidos'))
            const rotulo = m.valor ? (fin ? _brlCompacto(m.valor) : m.valor) : (m.atual ? tr('parcial') : '')
            return `<button type="button" class="rel-col${m.atual ? ' atual' : ''}${m.valor ? '' : ' zero'}" data-i="${i}"
                data-titulo="${esc(nomeMesLongo(m))}${m.atual ? ' · ' + tr('parcial') : ''}" data-valor="${esc(fin ? _brl(m.valor) : qtdTxt)}" data-sub="${esc(fin ? qtdTxt : '')}"
                aria-label="${esc(nomeMesLongo(m))}: ${esc(fin ? _brl(m.valor) : qtdTxt)}">
                <span class="rel-col-valor num">${rotulo}</span>
                <span class="rel-col-barra" style="height:${m.valor ? Math.max(h, 1.5) : 0}%"></span>
              </button>`
          }).join('')}
        </div>
      </div>
      <div class="rel-eixo-x">${D.meses.map(m => `<span class="${m.atual ? 'atual' : ''}">${nomeMes(m)}</span>`).join('')}</div>
    </div>`
  }

  // Leitura ao lado do gráfico
  const valor = v => fin ? _numMoeda(v) : _num(v)
  const daMedia = L.media > 0 ? `${_pct(L.atual.valor, L.media)}% ${tr('daMedia')}` : tr('parcial')
  const de = L.fechados[0], ate = L.fechados[L.fechados.length - 1]
  const leitura = max ? `<dl class="rel-leitura">
      <div class="media"><dt>${tr('mediaMensal')}</dt><dd><span class="rel-leitura-num">${valor(L.media)}</span><span class="rel-leitura-sub">${nomeMes(de)} ${tr('a')} ${nomeMes(ate)}</span></dd></div>
      <div class="maior"><dt>${tr('maiorMes')}</dt><dd><span class="rel-leitura-num">${valor(L.maior.valor)}</span><span class="rel-leitura-sub">${nomeMesSo(L.maior)}${L.maior.atual ? ` · ${tr('parcial')}` : ''}</span></dd></div>
      <div class="atual"><dt>${tr('esteMes')}</dt><dd><span class="rel-leitura-num">${valor(L.atual.valor)}</span><span class="rel-leitura-sub">${L.atual.valor ? `${daMedia} · ${tr('parcial')}` : fin ? `${tr('semGasto')} · ${tr('parcial')}` : tr('parcial')}</span></dd></div>
    </dl>` : ''
  const total = D.meses.reduce((s, m) => s + m.valor, 0)
  const meta = `${tr('seisMeses')} · <span class="num">${fmt(total)}</span>${fin ? '' : ` ${tr('pedidos')}`}`
  return _secao({ id: 'bloco-mensal', larg: 12, titulo, meta, acoes: max ? toggle : '',
    corpo: `<div class="rel-mensal${leitura ? '' : ' so-grafico'}"><div class="rel-mensal-graf">${grafico}</div>${leitura}</div>` })
}

// Categoria e empresa lado a lado, na mesma escala: a barra é a fatia do total
function _blocoDinheiro(D) {
  const fin = _podeVerFinanceiro()
  const met = x => fin ? x.valor : x.qtd
  const total = fin ? D.gasto : D.ped.length
  const top = (itens, n) => {
    if (itens.length <= n) return itens
    const resto = itens.slice(n - 1)
    return [...itens.slice(0, n - 1), { id: '__outras__', valor: resto.reduce((s, x) => s + x.valor, 0), qtd: resto.reduce((s, x) => s + x.qtd, 0) }]
  }
  const cats = top(D.porCategoria, 6)
  const tons = _tonsDaLista(cats.map(x => x.id))
  const corCat = x => x.id === '__outras__' ? 'var(--rel-outras)' : `var(--rel-${tons[x.id]})`
  const nomeCat = x => x.id === '__outras__' ? tr('outras') : _nomeCategoria(x.id)

  const porForn = _filtroEmp !== 'todas' && fin
  const seg = porForn ? top(D.porFornecedor, 6) : top(D.porEmpresa, 6)
  const nomeSeg = x => x.id === '__outras__' ? tr('outras') : porForn ? (x.id || tr('semFornecedor')) : _nomeEmpresa(x.id)

  const lista = (itens, nome, cor, cls) => `<ul class="rel-barras ${cls}">${itens.map(x => {
    const p = _pct(met(x), total)
    const largura = total ? (met(x) / total) * 100 : 0
    return `<li class="rel-barra-item" style="--cor:${cor(x)}">
      <div class="rel-barra-topo">
        <span class="rel-barra-cor" aria-hidden="true"></span>
        <span class="rel-barra-nome">${esc(nome(x))}${fin ? `<span class="rel-barra-qtd">${_plural(x.qtd, tr('pedido'), tr('pedidos'))}</span>` : ''}</span>
        <span class="rel-barra-valor num">${fin ? _brl(x.valor) : x.qtd}</span>
        <span class="rel-barra-pct num">${p}%</span>
      </div>
      <div class="rel-trilho" aria-hidden="true"><span style="width:${Math.max(largura, 0.6)}%"></span></div>
    </li>`
  }).join('')}</ul>`

  const coluna = (titulo, corpo) => `<div class="rel-dinheiro-col"><h3 class="rel-subtit">${titulo}</h3>${corpo}</div>`
  const vazio = `<p class="rel-vazio-linha">${tr('vazioCompras')}</p>`
  const corpo = `<div class="rel-dinheiro">
    ${coluna(tr('porCategoria'), cats.length ? lista(cats, nomeCat, corCat, 'cat') : vazio)}
    ${coluna(porForn ? tr('porFornecedor') : tr('porEmpresa'), seg.length ? lista(seg, nomeSeg, () => 'var(--rel-neutra)', 'seg') : vazio)}
  </div>`
  const meta = fin
    ? `<span class="num">${_brl(D.gasto)}</span> · ${_plural(D.compras, tr('compra1'), tr('compraN'))}`
    : `<span class="num">${_plural(D.ped.length, tr('pedido'), tr('pedidos'))}</span>`
  return _secao({ id: 'bloco-dinheiro', larg: 12, titulo: fin ? tr('tDinheiro') : tr('tDinheiroQtd'), meta, corpo })
}

function _estadoVenc(iso) {
  const diff = _diasEntre(_iso(_hoje()), iso)
  if (diff < 0) return `<span class="rel-estado atraso" style="--cor:var(--red)">${diff === -1 ? tr('vencidaHa1') : tr('vencidaHaN', { n: -diff })}</span>`
  if (diff === 0) return `<span class="rel-estado forte" style="--cor:var(--gold)">${tr('venceHoje')}</span>`
  if (diff === 1) return `<span class="rel-estado" style="--cor:var(--amber)">${tr('venceAmanha')}</span>`
  return `<span class="rel-estado sem-ponto">${tr('emDias', { n: diff })}</span>`
}
const _cod = p => p?.numeroPedido ? `<span class="rel-cod">${esc(p.numeroPedido)}</span>` : ''

function _blocoParcelas(D, larg) {
  const lista = D.proximas
  const totalAberto = lista.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  if (!lista.length) {
    return _secao({ id: 'bloco-parcelas', larg, titulo: tr('tParcelas'), meta: tr('proximos30'),
      corpo: _vazio(ICONE.check, tr('vazioParcelasTit'), tr('vazioParcelasTxt')) })
  }
  const loc = _locale()
  const linhas = lista.slice(0, 6).map(pc => {
    const p = _todos.find(x => x.id === pc.pedidoId)
    const d = _deIso(pc.vencimento)
    return `<li><button type="button" class="rel-linha" data-pedido="${esc(pc.pedidoId)}">
      <span class="rel-data"><strong>${_pad(d.getDate())}</strong><small>${d.toLocaleDateString(loc, { month: 'short' }).replace('.', '')}</small></span>
      <span class="rel-linha-txt">
        <span class="rel-linha-tit">${esc(p?.titulo || '—')}</span>
        <span class="rel-linha-sub">${_cod(p)}<span>${tr('colParcela')} ${pc.numero}/${pc.total}</span></span>
      </span>
      <span class="rel-linha-fim">
        <span class="rel-linha-valor num">${_brl(pc.valor)}</span>
        ${_estadoVenc(pc.vencimento)}
      </span>
    </button></li>`
  }).join('')
  const meta = `<span class="num">${_brl(totalAberto)}</span> · ${tr('totalParcelas', { n: lista.length })} · ${tr('proximos30').toLowerCase()}`
  return _secao({ id: 'bloco-parcelas', larg, titulo: tr('tParcelas'), meta, corpo: `<ul class="rel-linhas">${linhas}</ul>` })
}

function _blocoMaiores(D) {
  const linhas = D.maiores.map((p, i) => `
    <li><button type="button" class="rel-linha" data-pedido="${esc(p.id)}">
      <span class="rel-rank" aria-hidden="true">${_pad(i + 1)}</span>
      <span class="rel-linha-txt">
        <span class="rel-linha-tit">${esc(p.titulo)}</span>
        <span class="rel-linha-sub">${_cod(p)}<span>${esc(_nomeEmpresa(p.empresaId))}</span><span>${esc(_nomeCategoria(p.categoriaId))}</span></span>
      </span>
      <span class="rel-linha-fim">
        <span class="rel-linha-valor num">${_brl(p.valorFinal)}</span>
        <span class="rel-estado" style="--cor:${COR_STATUS[p.status] || 'var(--text3)'}">${STATUS_LABEL[p.status] || p.status}</span>
      </span>
    </button></li>`).join('')
  return _secao({ id: 'bloco-maiores', larg: 6, titulo: tr('tMaiores'), meta: tr('compradasPeriodo'), corpo: `<ul class="rel-linhas">${linhas}</ul>` })
}

function _blocoFila(D) {
  const fila = [...D.emAprov].sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || (_dataPedido(a) || 0) - (_dataPedido(b) || 0))
  if (!fila.length) return _secao({ id: 'bloco-fila', larg: 12, titulo: tr('tFila'), corpo: _vazio(ICONE.check, tr('vazioFilaTit'), tr('vazioFilaTxt')) })
  const linhas = fila.slice(0, 6).map((p, i) => {
    const d = _isoPedido(p)
    const dias = d ? _diasEntre(d, _iso(_hoje())) : 0
    const ha = dias <= 0 ? tr('hojeCurto') : dias === 1 ? tr('haDia') : tr('haDias', { n: dias })
    return `<li><button type="button" class="rel-linha" data-pedido="${esc(p.id)}">
      <span class="rel-rank" aria-hidden="true">${_pad(i + 1)}</span>
      <span class="rel-linha-txt">
        <span class="rel-linha-tit">${esc(p.titulo)}</span>
        <span class="rel-linha-sub">${_cod(p)}<span>${esc(_nomeEmpresa(p.empresaId))}</span><span>${esc(_nomeCategoria(p.categoriaId))}</span></span>
      </span>
      <span class="rel-linha-fim">
        <span class="rel-quando">${_capital(ha)}</span>
        ${p.urgente ? `<span class="rel-estado forte" style="--cor:var(--gold)">${t('urgente')}</span>` : ''}
      </span>
    </button></li>`
  }).join('')
  return _secao({ id: 'bloco-fila', larg: 12, titulo: tr('tFila'), meta: `<span class="num">${_plural(fila.length, tr('pedido'), tr('pedidos'))}</span> · ${tr('agoraSub').toLowerCase()}`, corpo: `<ul class="rel-linhas">${linhas}</ul>` })
}

// Régua das sete etapas, como o cabeçalho do quadro: numeral por etapa
function _blocoEtapas(D) {
  const fin = _podeVerFinanceiro()
  const total = D.ped.length
  const celula = (s, fora = false) => {
    const n = D.porStatus[s] || 0
    const sub = !n ? '—' : fin ? _brlCompacto(D.valorStatus[s] || 0) : `${_pct(n, total)}%`
    return `<li class="rel-etapa${fora ? ' fora' : ''}${n ? '' : ' zero'}">
      <span class="rel-etapa-num">${_pad(n)}</span>
      <span class="rel-etapa-nome">${STATUS_LABEL[s]}</span>
      <span class="rel-etapa-sub num">${sub}</span>
    </li>`
  }
  const corpo = `<ol class="rel-etapas" aria-label="${tr('etapasAria')}">
    ${ETAPAS.map(s => celula(s)).join('')}
    <li class="rel-etapas-sep" aria-hidden="true"></li>
    ${FORA.map(s => celula(s, true)).join('')}
  </ol>`
  const meta = total === 1 ? tr('etapasMeta1') : tr('etapasMetaN', { n: total })
  return _secao({ id: 'bloco-etapas', larg: 12, titulo: tr('tEtapas'), meta, corpo })
}

// ── Dica do gráfico de colunas ────────────────────────────────
function _temHover() { try { return matchMedia('(hover: hover) and (pointer: fine)').matches } catch { return true } }
function _ligarDicas() {
  document.querySelectorAll('#bloco-mensal .rel-col').forEach(col => {
    // Só mouse de verdade abre a dica no hover; no toque ela abre pelo clique.
    // pointermove (e não pointerenter): só movimento real do mouse abre a dica,
    // não a mudança de layout que coloca a coluna sob um cursor parado
    col.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && _temHover() && !col.classList.contains('ativa')) _mostrarDica(col) })
    col.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') _esconderDica() })
    col.addEventListener('focus', () => { if (col.matches(':focus-visible')) _mostrarDica(col) })
    col.addEventListener('blur', _esconderDica)
  })
}
function _mostrarDica(col) {
  const dica = document.getElementById('rel-dica')
  if (!dica) return
  document.querySelectorAll('.rel-col.ativa').forEach(c => c.classList.remove('ativa'))
  col.classList.add('ativa')
  dica.innerHTML = `<span class="rel-dica-tit">${col.dataset.titulo}</span><strong class="num">${col.dataset.valor}</strong>${col.dataset.sub ? `<span class="rel-dica-sub">${col.dataset.sub}</span>` : ''}`
  dica.hidden = false
  const barra = col.querySelector('.rel-col-barra')
  const r = (barra && barra.offsetHeight > 2 ? barra : col).getBoundingClientRect()
  const w = dica.offsetWidth, h = dica.offsetHeight
  let x = r.left + r.width / 2 - w / 2
  x = Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8))
  let y = r.top - h - 10
  if (y < 64) y = r.top + 10
  dica.style.left = x + 'px'
  dica.style.top = y + 'px'
}
function _esconderDica() {
  const dica = document.getElementById('rel-dica')
  if (dica) dica.hidden = true
  document.querySelectorAll('.rel-col.ativa').forEach(c => c.classList.remove('ativa'))
}

// ── Exportações ───────────────────────────────────────────────
// Paleta do papel (a mesma do tema claro e da impressão)
const PAPEL = {
  tinta: [26, 21, 16], texto2: [87, 73, 58], texto3: [116, 100, 79],
  terracota: [181, 80, 46], terracotaTxt: [164, 70, 42], apagada: [222, 200, 182],
  argila: [239, 230, 215], argilaClara: [250, 245, 237], linha: [226, 213, 193], linhaForte: [205, 187, 160],
  neutra: [150, 135, 117], branco: [255, 255, 255], afn: [107, 31, 42], cinzaAfn: [80, 80, 80],
}
const _hex = rgb => 'FF' + rgb.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()

function _carregarScript(src, global) {
  if (window[global]) return Promise.resolve(window[global])
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = src; s.async = true
    s.onload = () => window[global] ? res(window[global]) : rej(new Error('Biblioteca indisponível'))
    s.onerror = () => { s.remove(); rej(new Error('Falha ao carregar ' + src)) }
    document.head.appendChild(s)
  })
}

function _baixar(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

function _nomeArquivo(ext) {
  const iv = _intervalo()
  return `praxis-relatorio-${iv.ini}_a_${iv.fim}.${ext}`
}

const _dataUTC = d => `${_pad(d.getUTCDate())}/${_pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`

function _linhasExport(D) {
  return D.ped.map(p => {
    const d = _dataPedido(p)
    return {
      num: p.numeroPedido || '',
      titulo: p.titulo || '',
      empresa: _nomeEmpresa(p.empresaId),
      categoria: _nomeCategoria(p.categoriaId),
      status: STATUS_LABEL[p.status] || p.status || '',
      urgente: p.urgente ? tr('sim') : tr('nao'),
      data: d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null,
      estimado: Number(p.valorEstimado) || null,
      final: Number(p.valorFinal) || null,
    }
  })
}

async function _comBotao(fn) {
  const btn = document.getElementById('btn-exportar')
  if (btn) { btn.disabled = true; btn.classList.add('loading') }
  try { await fn() } catch (err) {
    console.warn('Relatórios: falha na exportação', err)
    prxToast(tr('erroExport'), 'error')
  } finally { if (btn) { btn.disabled = false; btn.classList.remove('loading') } }
}

async function _exportarExcel() {
  if (!_podeVerFinanceiro()) { prxToast(tr('semPermissao'), 'warning'); return }
  await _comBotao(async () => {
    const ExcelJS = await _carregarScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js', 'ExcelJS')
    const D = _calcular()
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Praxis'; wb.created = new Date()
    const C = {
      tinta: _hex(PAPEL.tinta), texto3: _hex(PAPEL.texto3), terracota: _hex(PAPEL.terracota),
      argila: _hex(PAPEL.argila), argilaClara: _hex(PAPEL.argilaClara), linha: _hex(PAPEL.linha), linhaForte: _hex(PAPEL.linhaForte),
    }
    const FONTE = 'Calibri'
    const FMT_BRL = '"R$" #,##0.00;-"R$" #,##0.00'
    const FMT_DATA = 'dd/mm/yyyy'
    const solido = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
    // Cabeçalho de tabela: argila com o fio de tinta embaixo, como nas inscrições
    const cabecalho = row => {
      row.height = 22
      row.eachCell(c => {
        c.font = { name: FONTE, bold: true, color: { argb: C.tinta }, size: 10 }
        c.fill = solido(C.argila)
        c.border = { bottom: { style: 'medium', color: { argb: C.tinta } } }
        c.alignment = { vertical: 'middle', horizontal: c.alignment?.horizontal || 'left' }
      })
    }
    const zebra = (ws, de, ate, cols) => {
      for (let r = de; r <= ate; r++) {
        const row = ws.getRow(r)
        for (let c = 1; c <= cols; c++) {
          const cel = row.getCell(c)
          cel.font = { name: FONTE, size: 10, color: { argb: C.tinta } }
          cel.border = { bottom: { style: 'thin', color: { argb: C.linha } } }
          if ((r - de) % 2 === 1) cel.fill = solido(C.argilaClara)
        }
      }
    }
    const totais = row => row.eachCell({ includeEmpty: true }, c => {
      c.font = { name: FONTE, bold: true, size: 10, color: { argb: C.tinta } }
      c.border = { top: { style: 'thin', color: { argb: C.tinta } } }
      c.fill = solido(C.argila)
    })
    const emp = _filtroEmp === 'todas' ? tr('todas') : _nomeEmpresa(_filtroEmp)

    // Ordem das abas: Resumo, Pedidos, Parcelas
    const wr = wb.addWorksheet(tr('resumo'), { properties: { tabColor: { argb: C.terracota } }, views: [{ showGridLines: false }] })

    // Aba Pedidos
    const ws = wb.addWorksheet(tr('abaPedidos'), { properties: { tabColor: { argb: C.tinta } }, views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = [
      { header: tr('colNum'), key: 'num', width: 12 },
      { header: tr('colTitulo'), key: 'titulo', width: 44 },
      { header: tr('colEmpresa'), key: 'empresa', width: 24 },
      { header: tr('colCategoria'), key: 'categoria', width: 20 },
      { header: tr('colStatus'), key: 'status', width: 15 },
      { header: tr('colUrgente'), key: 'urgente', width: 10 },
      { header: tr('colCriado'), key: 'data', width: 13, style: { numFmt: FMT_DATA } },
      { header: tr('colEstimado'), key: 'estimado', width: 17, style: { numFmt: FMT_BRL } },
      { header: tr('colFinal'), key: 'final', width: 17, style: { numFmt: FMT_BRL } },
    ]
    const linhas = _linhasExport(D)
    linhas.forEach(l => ws.addRow(l))
    const n = linhas.length
    zebra(ws, 2, n + 1, 9)
    ;['estimado', 'final'].forEach(k => { ws.getColumn(k).alignment = { horizontal: 'right' } })
    ws.getColumn('data').alignment = { horizontal: 'center' }
    ws.getColumn('urgente').alignment = { horizontal: 'center' }
    cabecalho(ws.getRow(1))
    if (n) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: n + 1, column: 9 } }
      const somaE = linhas.reduce((s, l) => s + (l.estimado || 0), 0)
      const somaF = linhas.reduce((s, l) => s + (l.final || 0), 0)
      const tot = ws.addRow({ num: tr('total'), titulo: _plural(n, tr('pedido'), tr('pedidos')) })
      tot.getCell('estimado').value = { formula: `SUM(H2:H${n + 1})`, result: somaE }
      tot.getCell('final').value = { formula: `SUM(I2:I${n + 1})`, result: somaF }
      totais(tot)
    }

    // Aba Parcelas (em aberto e próximas)
    const wp = wb.addWorksheet(tr('abaParcelas'), { properties: { tabColor: { argb: C.linhaForte } }, views: [{ state: 'frozen', ySplit: 1 }] })
    wp.columns = [
      { header: tr('colVenc'), key: 'venc', width: 13, style: { numFmt: FMT_DATA, alignment: { horizontal: 'center' } } },
      { header: tr('colNum'), key: 'num', width: 12 },
      { header: tr('colTitulo'), key: 'titulo', width: 44 },
      { header: tr('colEmpresa'), key: 'empresa', width: 24 },
      { header: tr('colParcela'), key: 'parc', width: 10, style: { alignment: { horizontal: 'center' } } },
      { header: tr('colValor'), key: 'valor', width: 17, style: { numFmt: FMT_BRL, alignment: { horizontal: 'right' } } },
      { header: tr('colSituacao'), key: 'sit', width: 13 },
    ]
    D.abertas.forEach(pc => {
      const p = _todos.find(x => x.id === pc.pedidoId)
      const diff = _diasEntre(_iso(_hoje()), pc.vencimento)
      const [vy, vm, vd] = pc.vencimento.split('-').map(Number)
      wp.addRow({ venc: new Date(Date.UTC(vy, vm - 1, vd)), num: p?.numeroPedido || '', titulo: p?.titulo || '', empresa: _nomeEmpresa(p?.empresaId),
        parc: `${pc.numero}/${pc.total}`, valor: Number(pc.valor) || 0, sit: diff < 0 ? tr('vencida') : tr('aberta') })
    })
    const m = D.abertas.length
    zebra(wp, 2, m + 1, 7)
    for (let r = 2; r <= m + 1; r++) {
      const sit = wp.getRow(r).getCell('sit')
      if (sit.value === tr('vencida')) sit.font = { name: FONTE, size: 10, bold: true, color: { argb: _hex([179, 38, 30]) } }
    }
    cabecalho(wp.getRow(1))
    if (m) {
      wp.autoFilter = { from: { row: 1, column: 1 }, to: { row: m + 1, column: 7 } }
      const tot = wp.addRow({ venc: null, num: tr('total'), titulo: _plural(m, tr('parcela1'), tr('parcelaN')) })
      tot.getCell('valor').value = { formula: `SUM(F2:F${m + 1})`, result: D.abertas.reduce((s, p) => s + (Number(p.valor) || 0), 0) }
      totais(tot)
    }

    // Aba Resumo: letreiro, período e as tabelas da tela
    wb.views = [{ activeTab: 0 }]
    wr.columns = [{ width: 34 }, { width: 20 }, { width: 12 }, { width: 10 }]
    const r1 = wr.addRow(['PRAXIS'])
    r1.height = 30
    r1.getCell(1).font = { name: FONTE, size: 20, bold: true, color: { argb: C.tinta } }
    const r2 = wr.addRow([tr('relatorioCompras')])
    r2.getCell(1).font = { name: FONTE, size: 12, bold: true, color: { argb: C.terracota } }
    for (let c = 1; c <= 4; c++) r2.getCell(c).border = { bottom: { style: 'medium', color: { argb: C.tinta } } }
    wr.addRow([])
    wr.addRow([tr('periodo'), `${D.iv.nome} (${formatDate(D.iv.ini)} ${tr('a')} ${formatDate(D.iv.fim)})`])
    wr.addRow([tr('empresa'), emp])
    const ag = new Date()
    wr.addRow([tr('geradoEm'), `${formatDate(_iso(ag))} ${_pad(ag.getHours())}:${_pad(ag.getMinutes())}`])
    ;[4, 5, 6].forEach(r => {
      wr.getRow(r).getCell(1).font = { name: FONTE, size: 10, color: { argb: C.texto3 } }
      wr.getRow(r).getCell(2).font = { name: FONTE, size: 10, color: { argb: C.tinta } }
      wr.getRow(r).getCell(2).alignment = { horizontal: 'left' }
    })
    wr.addRow([])
    const secao = (titulos, linhasSec, fmts) => {
      cabecalho(wr.addRow(titulos))
      const de = wr.rowCount + 1
      linhasSec.forEach(l => {
        const r = wr.addRow(l)
        fmts.forEach((f, i) => { if (f) r.getCell(i + 1).numFmt = f })
        for (let i = 2; i <= l.length; i++) r.getCell(i).alignment = { horizontal: 'right' }
      })
      zebra(wr, de, wr.rowCount, titulos.length)
      wr.addRow([])
      return de
    }
    const totalV7 = D.vencer7.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const ini = secao([tr('indicador'), tr('colValor')], [
      [tr('kGasto'), D.gasto], [tr('kPedidos'), D.ped.length], [tr('kAprov'), D.emAprov.length],
      [tr('kEconomia'), D.economia], [tr('kVencer'), totalV7],
    ], [null, null])
    ;[0, 3, 4].forEach(k => { wr.getRow(ini + k).getCell(2).numFmt = FMT_BRL })
    // O gasto é o destaque, em terracota, como na tela
    wr.getRow(ini).getCell(2).font = { name: FONTE, size: 10, bold: true, color: { argb: C.terracota } }
    const totEmp = D.porEmpresa.reduce((s, x) => s + x.valor, 0) || 1
    secao([tr('colEmpresa'), tr('kGasto'), tr('colQtd'), tr('colPct')],
      D.porEmpresa.map(x => [_nomeEmpresa(x.id), x.valor, x.qtd, x.valor / totEmp]), [null, FMT_BRL, null, '0%'])
    const totCat = D.porCategoria.reduce((s, x) => s + x.valor, 0) || 1
    secao([tr('colCategoria'), tr('kGasto'), tr('colQtd'), tr('colPct')],
      D.porCategoria.map(x => [_nomeCategoria(x.id), x.valor, x.qtd, x.valor / totCat]), [null, FMT_BRL, null, '0%'])
    const totF = D.porFornecedor.reduce((s, x) => s + x.valor, 0) || 1
    secao([_capital(tr('fornecedor1')), tr('kGasto'), tr('colQtd'), tr('colPct')],
      D.porFornecedor.map(x => [x.id || tr('semFornecedor'), x.valor, x.qtd, x.valor / totF]), [null, FMT_BRL, null, '0%'])
    secao([tr('colStatus'), tr('colQtd')], ORDEM_STATUS.filter(s => D.porStatus[s]).map(s => [STATUS_LABEL[s], D.porStatus[s]]), [null, null])

    // Impressão das abas: paisagem, uma página de largura, rodapé com a marca e a paginação
    wb.eachSheet(aba => {
      aba.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
      aba.headerFooter = { oddFooter: `&L&8PRAXIS · ${tr('relatorioCompras')}&R&8${tr('pagina')} &P ${tr('de')} &N` }
    })

    const buf = await wb.xlsx.writeBuffer()
    _baixar(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), _nomeArquivo('xlsx'))
  })
}

// Símbolo do Praxis (o triângulo vazado) desenhado com as primitivas do jsPDF.
// O desenho é o _TRI de js/ui.js: o Λ do GFS Didot fechado na base. A fonte
// não vai embutida no PDF; o símbolo vai como vetor e o nome em Helvetica.
const _TRI_PDF = 'M296 100H323L466 527V535H521V553H77V535Q128 535 145 495ZM289 197L185 470Q172 505 175 525Q180 535 215 535H405Z'
function _subcaminhos(d) {
  const tk = d.match(/[MHVLQZ]|-?\d*\.?\d+/g) || []
  const subs = []
  let i = 0, cmd = '', cx = 0, cy = 0, atual = null
  const num = () => Number(tk[i++])
  while (i < tk.length) {
    if (/[MHVLQZ]/.test(tk[i])) cmd = tk[i++]
    if (cmd === 'M') { cx = num(); cy = num(); atual = { ini: [cx, cy], segs: [] }; subs.push(atual); cmd = 'L' }
    else if (cmd === 'H') { const x = num(); atual.segs.push({ t: 'L', p: [x, cy] }); cx = x }
    else if (cmd === 'V') { const y = num(); atual.segs.push({ t: 'L', p: [cx, y] }); cy = y }
    else if (cmd === 'L') { const x = num(), y = num(); atual.segs.push({ t: 'L', p: [x, y] }); cx = x; cy = y }
    else if (cmd === 'Q') { const qx = num(), qy = num(), x = num(), y = num(); atual.segs.push({ t: 'Q', c: [qx, qy], p: [x, y] }); cx = x; cy = y }
    else if (cmd === 'Z') { if (atual) { cx = atual.ini[0]; cy = atual.ini[1] } cmd = '' }
    else i++
  }
  return subs
}
function _desenharSimbolo(doc, x, y, altura, cor, fundo) {
  const s = altura / 453                      // altura do glifo no viewBox da marca
  const X = v => x + (v - 67.16) * s, Y = v => y + (v - 100) * s
  _subcaminhos(_TRI_PDF).forEach((sp, k) => {
    // Primeiro o contorno cheio; depois o vazado, na cor do papel
    doc.setFillColor(...(k === 0 ? cor : fundo))
    let [px, py] = [X(sp.ini[0]), Y(sp.ini[1])]
    const linhas = sp.segs.map(sg => {
      const [nx, ny] = [X(sg.p[0]), Y(sg.p[1])]
      let r
      if (sg.t === 'L') r = [nx - px, ny - py]
      else {
        // Quadrática → cúbica
        const [qx, qy] = [X(sg.c[0]), Y(sg.c[1])]
        const c1 = [px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py)]
        const c2 = [nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny)]
        r = [c1[0] - px, c1[1] - py, c2[0] - px, c2[1] - py, nx - px, ny - py]
      }
      px = nx; py = ny
      return r
    })
    doc.lines(linhas, X(sp.ini[0]), Y(sp.ini[1]), [1, 1], 'F', true)
  })
}

async function _exportarPDF() {
  if (!_podeVerFinanceiro()) { prxToast(tr('semPermissao'), 'warning'); return }
  await _comBotao(async () => {
    const lib = await _carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'jspdf')
    const { jsPDF } = lib
    const D = _calcular()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setProperties({ title: `Praxis · ${tr('relatorioCompras')}`, subject: _nomeArquivo('pdf'), author: 'Praxis', creator: 'Praxis' })
    const W = 297, H = 210, M = 14, LARG = W - 2 * M
    const TOPO_CONT = M + 14                  // início do conteúdo nas páginas seguintes
    const limpo = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/[–—−]/g, '-').replace(/[^\x00-\xFF]/g, '')
    const brl = v => limpo(_brl(v))
    const compacto = v => limpo(_brlCompacto(v))
    const cor = (rgb, tipo = 'text') => doc[tipo === 'text' ? 'setTextColor' : tipo === 'fill' ? 'setFillColor' : 'setDrawColor'](...rgb)
    const fonte = (peso, tam) => { doc.setFont('helvetica', peso); doc.setFontSize(tam) }
    const corta = (s, w) => {
      s = limpo(s)
      if (doc.getTextWidth(s) <= w) return s
      while (s.length > 1 && doc.getTextWidth(s + '...') > w) s = s.slice(0, -1)
      return s.trimEnd() + '...'
    }
    const dir = (s, x, yy) => doc.text(s, x, yy, { align: 'right' })
    // Caixa alta espaçada, letra a letra (o charSpace do jsPDF desalinha o texto à direita)
    const larguraEsp = (s, cs) => [...s].reduce((w, ch) => w + doc.getTextWidth(ch), 0) + cs * Math.max(0, [...s].length - 1)
    const espacado = (s, x, yy, cs, aDireita = false) => {
      let cx = aDireita ? x - larguraEsp(s, cs) : x
      for (const ch of s) { doc.text(ch, cx, yy); cx += doc.getTextWidth(ch) + cs }
    }
    const fio = (x1, yy, x2, grosso = true) => { cor(grosso ? PAPEL.tinta : PAPEL.linha, 'draw'); doc.setLineWidth(grosso ? 0.55 : 0.25); doc.line(x1, yy, x2, yy) }
    const tituloSecao = (x, yy, w, titulo, meta) => {
      fio(x, yy, x + w)
      fonte('bold', 9.5); cor(PAPEL.tinta)
      doc.text(limpo(titulo), x, yy + 5.5)
      if (meta) { fonte('normal', 7.2); cor(PAPEL.texto3); dir(limpo(meta), x + w, yy + 5.5) }
      return yy + 10
    }
    const vazio = (x, yy, txt) => { fonte('normal', 7.8); cor(PAPEL.texto3); doc.text(limpo(txt), x, yy + 3.5); return yy + 8 }
    const emp = _filtroEmp === 'todas' ? tr('todas') : _nomeEmpresa(_filtroEmp)
    const periodo = limpo(`${D.iv.nome} · ${formatDate(D.iv.ini)} ${tr('a')} ${formatDate(D.iv.fim)} · ${emp}`)
    const agora = new Date()
    const hojeIso = _iso(_hoje())
    const VERMELHO = [179, 38, 30]

    // ── Página 1: o resumo, na mesma ordem da tela ──
    // Cabeçalho: símbolo em terracota + PRAXIS espaçado; à direita, o documento
    let y = M
    _desenharSimbolo(doc, M, y, 9, PAPEL.terracota, PAPEL.branco)
    fonte('normal', 16); cor(PAPEL.tinta)
    espacado('PRAXIS', M + 13, y + 8.6, 1.9)
    fonte('bold', 12.5); cor(PAPEL.tinta)
    espacado(limpo(tr('relatorioCompras')).toUpperCase(), W - M, y + 4, 0.55, true)
    fonte('normal', 8.5); cor(PAPEL.texto3)
    dir(periodo, W - M, y + 9)
    y += 13
    fio(M, y, W - M)
    y += 8

    // Indicadores: numeral sob o fio de tinta, sem caixa; o gasto em terracota
    const totalV7 = D.vencer7.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const variacao = (a, b) => {
      if (!b) return a ? tr('semBase') : '0%'
      const p = Math.round(((a - b) / b) * 100)
      return `${p > 0 ? '+' : p < 0 ? '-' : ''}${Math.abs(p)}% ${D.iv.vs}`
    }
    const kpis = [
      [brl(D.gasto), tr('kGasto'), variacao(D.gasto, D.gastoAnt)],
      [String(D.ped.length), tr('kPedidos'), variacao(D.ped.length, D.ant.length)],
      [String(D.emAprov.length), tr('kAprov'), D.urgentes ? _plural(D.urgentes, tr('urgente1'), tr('urgenteN')) : tr('semUrgentes')],
      [brl(D.economia), tr('kEconomia'), D.nEconomia ? tr('economiaSubN', { n: _plural(D.nEconomia, tr('compra1'), tr('compraN')) }) : tr('economiaSub')],
      [brl(totalV7), tr('kVencer'), `${_plural(D.vencer7.length, tr('parcela1'), tr('parcelaN'))}${D.vencidas.length ? ' · ' + _plural(D.vencidas.length, tr('vencida1'), tr('vencidaN')) : ''}`],
    ]
    const gapK = 6, pesos = [1.35, 1, 1, 1, 1], somaP = pesos.reduce((a, b) => a + b, 0)
    let kx = M
    kpis.forEach(([val, rot, sub], i) => {
      const kw = (LARG - gapK * 4) * pesos[i] / somaP
      fio(kx, y, kx + kw)
      fonte('bold', i === 0 ? 20 : 16); cor(i === 0 ? PAPEL.terracota : PAPEL.tinta)
      doc.text(val, kx, y + 9.5)
      fonte('bold', 8.2); cor(PAPEL.tinta)
      doc.text(limpo(rot), kx, y + 15)
      fonte('normal', 7); cor(PAPEL.texto3)
      doc.text(corta(sub, kw - 1), kx, y + 19)
      kx += kw + gapK
    })
    y += 26

    // Três colunas: gasto mensal, categoria, empresa (ou fornecedor)
    const gapC = 10, cw = (LARG - 2 * gapC) / 3
    const topoLinha = y
    const xm = M
    const ym = tituloSecao(xm, y, cw, tr('tMensal'), tr('seisMeses'))
    const maxM = Math.max(...D.meses.map(mm => mm.valor), 0)
    const altG = 26, baseG = ym + 5 + altG
    let fimMensal
    if (maxM) {
      const passo = cw / 6
      const L = _leituraMeses(D)
      // Média dos meses fechados, tracejada, atrás das colunas
      if (L.media > 0) {
        const yMed = baseG - (L.media / maxM) * altG
        cor(PAPEL.texto2, 'draw'); doc.setLineWidth(0.2); doc.setLineDashPattern([0.8, 0.8], 0)
        doc.line(xm, yMed, xm + cw, yMed); doc.setLineDashPattern([], 0)
      }
      D.meses.forEach((mm, i) => {
        const h = (mm.valor / maxM) * altG
        const bx = xm + i * passo + passo * 0.2, bw = passo * 0.6
        if (h > 0) { cor(mm.atual ? PAPEL.terracota : PAPEL.apagada, 'fill'); doc.rect(bx, baseG - h, bw, h, 'F') }
        else if (mm.atual) { cor(PAPEL.terracota, 'fill'); doc.rect(bx, baseG - 0.5, bw, 0.5, 'F') }
        fonte('bold', 6.4); cor(mm.atual ? PAPEL.tinta : PAPEL.texto2)
        if (mm.valor) {
          // Fundo do papel atrás do rótulo: a média tracejada nunca corta o número
          const rot = compacto(mm.valor), lw = doc.getTextWidth(rot)
          cor(PAPEL.branco, 'fill'); doc.rect(bx + bw / 2 - lw / 2 - 0.8, baseG - h - 4, lw + 1.6, 3.2, 'F')
          doc.text(rot, bx + bw / 2, baseG - h - 1.5, { align: 'center' })
        }
        cor(mm.atual ? PAPEL.tinta : PAPEL.texto3)
        const nm = new Date(mm.ano, mm.mes, 1).toLocaleDateString(_locale(), { month: 'short' }).replace('.', '').toUpperCase()
        doc.text(limpo(nm), bx + bw / 2, baseG + 4, { align: 'center' })
      })
      cor(PAPEL.texto3, 'draw'); doc.setLineWidth(0.25); doc.line(xm, baseG, xm + cw, baseG)
      // Legenda: a média e o mês corrente
      const yl = baseG + 9.5
      cor(PAPEL.texto2, 'draw'); doc.setLineWidth(0.2); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(xm, yl - 1, xm + 5, yl - 1); doc.setLineDashPattern([], 0)
      fonte('normal', 6.6); cor(PAPEL.texto3)
      doc.text(limpo(`${tr('mediaMensal')} ${brl(L.media)}`), xm + 7, yl)
      const meio = xm + cw / 2 + 2
      cor(PAPEL.terracota, 'fill'); doc.rect(meio, yl - 2.1, 2, 2, 'F')
      doc.text(limpo(`${tr('esteMes')} ${brl(L.atual.valor)}`), meio + 3.5, yl)
      fimMensal = yl + 2
    } else {
      fimMensal = vazio(xm, ym, tr('vazioMensal'))
    }

    // Listas com barras finas na mesma escala (fatia do total do período)
    const topo5 = itens => itens.length <= 5 ? itens
      : [...itens.slice(0, 4), { id: '__outras__', valor: itens.slice(4).reduce((s, x) => s + x.valor, 0), qtd: itens.slice(4).reduce((s, x) => s + x.qtd, 0) }]
    const listaBarras = (x, yy, w, itens, nome, corItem) => {
      const total = D.gasto || 1
      if (!itens.length) return vazio(x, yy, tr('vazioCompras'))
      topo5(itens).forEach(it => {
        const c = it.id === '__outras__' ? PAPEL.linhaForte : corItem(it)
        cor(c, 'fill'); doc.rect(x, yy + 0.9, 2, 2, 'F')
        fonte('normal', 7.8); cor(PAPEL.tinta)
        doc.text(corta(it.id === '__outras__' ? tr('outras') : nome(it), w - 50), x + 4, yy + 2.8)
        fonte('bold', 7.8); dir(brl(it.valor), x + w - 11, yy + 2.8)
        fonte('normal', 7.2); cor(PAPEL.texto3); dir(`${_pct(it.valor, total)}%`, x + w, yy + 2.8)
        cor(PAPEL.argila, 'fill'); doc.rect(x + 4, yy + 4.6, w - 4, 0.8, 'F')
        cor(c, 'fill'); doc.rect(x + 4, yy + 4.6, Math.max(0.4, (w - 4) * (it.valor / total)), 0.8, 'F')
        yy += 7.8
      })
      return yy
    }
    const xc = M + cw + gapC
    const yc = tituloSecao(xc, y, cw, tr('porCategoria'), brl(D.gasto))
    const tons = _tonsDaLista(topo5(D.porCategoria).map(x => x.id))
    const fimCat = listaBarras(xc, yc, cw, D.porCategoria, x => _nomeCategoria(x.id), x => TONS_PAPEL[tons[x.id]] || PAPEL.neutra)
    const xe = M + 2 * (cw + gapC)
    const porForn = _filtroEmp !== 'todas'
    const ye = tituloSecao(xe, y, cw, porForn ? tr('porFornecedor') : tr('porEmpresa'),
      porForn ? _plural(D.porFornecedor.length, tr('fornecedor1'), tr('fornecedorN')) : _plural(D.porEmpresa.length, tr('empresa1'), tr('empresaN')))
    const fimEmp = porForn
      ? listaBarras(xe, ye, cw, D.porFornecedor, x => x.id || tr('semFornecedor'), () => PAPEL.neutra)
      : listaBarras(xe, ye, cw, D.porEmpresa, x => _nomeEmpresa(x.id), () => PAPEL.neutra)
    y = Math.max(fimMensal, fimCat, fimEmp, topoLinha + 46) + 5

    // Parcelas a vencer e maiores compras, lado a lado
    const hw = (LARG - gapC) / 2, ALTL = 6.1
    const linhaLista = (yy, x, w) => { cor(PAPEL.linha, 'draw'); doc.setLineWidth(0.15); doc.line(x, yy, x + w, yy) }
    const totalProx = D.proximas.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    let yp = tituloSecao(M, y, hw, tr('tParcelas'), D.proximas.length ? `${brl(totalProx)} · ${tr('totalParcelas', { n: D.proximas.length })}` : tr('proximos30')) - 1.5
    if (!D.proximas.length) yp = vazio(M, yp, tr('vazioParcelasTit'))
    D.proximas.slice(0, 5).forEach(pc => {
      const p = _todos.find(x => x.id === pc.pedidoId)
      const diff = _diasEntre(hojeIso, pc.vencimento)
      const sit = diff < 0 ? (diff === -1 ? tr('vencidaHa1') : tr('vencidaHaN', { n: -diff })) : diff === 0 ? tr('venceHoje') : diff === 1 ? tr('venceAmanha') : tr('emDias', { n: diff })
      fonte('bold', 7.6); cor(PAPEL.tinta)
      doc.text(formatDate(pc.vencimento).slice(0, 5), M, yp + 4)
      fonte('normal', 7.6)
      doc.text(corta(p?.titulo || '-', hw - 13 - 12 - 26 - 30), M + 13, yp + 4)
      fonte('normal', 7); cor(PAPEL.texto3); dir(`${pc.numero}/${pc.total}`, M + hw - 58, yp + 4)
      fonte('bold', 7.6); cor(PAPEL.tinta); dir(brl(pc.valor), M + hw - 30, yp + 4)
      fonte(diff < 0 ? 'bold' : 'normal', 7); cor(diff < 0 ? VERMELHO : diff === 0 ? PAPEL.terracotaTxt : PAPEL.texto2)
      dir(limpo(sit), M + hw, yp + 4)
      yp += ALTL; linhaLista(yp, M, hw)
    })
    const xmc = M + hw + gapC
    let yc2 = tituloSecao(xmc, y, hw, tr('tMaiores'), tr('compradasPeriodo')) - 1.5
    if (!D.maiores.length) yc2 = vazio(xmc, yc2, tr('vazioCompras'))
    D.maiores.forEach((p, i) => {
      fonte('bold', 7.6); cor(PAPEL.texto3)
      doc.text(_pad(i + 1), xmc, yc2 + 4)
      cor(PAPEL.tinta); fonte('normal', 7.6)
      doc.text(corta(p.titulo, hw - 8 - 77), xmc + 8, yc2 + 4)
      fonte('normal', 7); cor(PAPEL.texto3)
      doc.text(corta(_nomeEmpresa(p.empresaId), 36), xmc + hw - 74, yc2 + 4)
      cor(PAPEL.texto2); doc.text(limpo(STATUS_LABEL[p.status] || p.status), xmc + hw - 35, yc2 + 4)
      fonte('bold', 7.6); cor(PAPEL.tinta); dir(brl(p.valorFinal), xmc + hw, yc2 + 4)
      yc2 += ALTL; linhaLista(yc2, xmc, hw)
    })
    y = Math.max(yp, yc2) + 7

    // Régua das etapas: sete numerais e, à parte, reprovados e cancelados
    y = tituloSecao(M, y, LARG, tr('tEtapas'), D.ped.length === 1 ? tr('etapasMeta1') : tr('etapasMetaN', { n: D.ped.length })) - 2
    const gE = 4, sepE = 8
    const ew = (LARG - sepE - gE * 7) / (7 + 2 * 0.85)
    let ex = M
    ORDEM_STATUS.forEach((s, i) => {
      const fora = i >= 7
      const w = fora ? ew * 0.85 : ew
      if (i === 7) ex += sepE - gE
      const n = D.porStatus[s] || 0
      cor(fora ? PAPEL.linhaForte : PAPEL.tinta, 'draw'); doc.setLineWidth(fora ? 0.25 : 0.45); doc.line(ex, y, ex + w, y)
      fonte('bold', 15); cor(n ? PAPEL.tinta : PAPEL.linhaForte)
      doc.text(_pad(n), ex, y + 7.4)
      fonte('bold', 7.4); cor(PAPEL.tinta); doc.text(corta(STATUS_LABEL[s], w - 1), ex, y + 11.6)
      fonte('normal', 6.8); cor(PAPEL.texto3); doc.text(n ? compacto(D.valorStatus[s] || 0) : '-', ex, y + 15)
      ex += w + gE
    })

    // ── Páginas seguintes: o detalhe, em tabelas ──
    const ALT = 6.2
    const novaPagina = () => { doc.addPage(); y = TOPO_CONT }
    const tabela = (titulo, cols, linhas, rodape) => {
      const larguraFixa = cols.reduce((s, c) => s + (c.w || 0), 0)
      const flex = cols.filter(c => !c.w).length
      const larg = cols.map(c => c.w || ((LARG - larguraFixa) / flex))
      const desenharCab = () => {
        cor(PAPEL.argila, 'fill'); doc.rect(M, y, LARG, ALT + 0.6, 'F')
        fio(M, y + ALT + 0.6, W - M)
        fonte('bold', 6.9); cor(PAPEL.tinta)
        let cx = M
        cols.forEach((c, i) => {
          const rot = limpo(c.t).toUpperCase()
          if (c.dir) espacado(rot, cx + larg[i] - 2.5, y + 4.4, 0.3, true)
          else espacado(rot, cx + 2.5, y + 4.4, 0.3)
          cx += larg[i]
        })
        y += ALT + 0.9
      }
      const precisaPagina = h => { if (y + h > H - M - 8) { novaPagina(); return true } return false }
      precisaPagina(ALT * 4 + 12)
      y = tituloSecao(M, y, LARG, titulo, '') - 2.5
      desenharCab()
      linhas.forEach((l, li) => {
        // A última linha desce junto com o total: nada de total órfão no alto da página
        if (precisaPagina(li === linhas.length - 1 && rodape ? ALT * 2 + 1 : ALT)) desenharCab()
        if (li % 2 === 1) { cor(PAPEL.argilaClara, 'fill'); doc.rect(M, y, LARG, ALT, 'F') }
        let cx = M
        cols.forEach((c, i) => {
          const atraso = c.atraso && l[i] === tr('vencida')
          cor(c.sub ? PAPEL.texto3 : atraso ? VERMELHO : PAPEL.tinta)
          fonte(c.sub || atraso ? 'bold' : 'normal', c.sub ? 7.4 : 7.8)
          const s = corta(l[i], larg[i] - 5)
          if (c.dir) dir(s, cx + larg[i] - 2.5, y + 4.2)
          else if (c.sub) espacado(s, cx + 2.5, y + 4.2, 0.2)
          else doc.text(s, cx + 2.5, y + 4.2)
          cx += larg[i]
        })
        y += ALT
        cor(PAPEL.linha, 'draw'); doc.setLineWidth(0.15); doc.line(M, y, W - M, y)
      })
      if (rodape) {
        precisaPagina(ALT + 1)
        fio(M, y, W - M)
        fonte('bold', 7.8); cor(PAPEL.tinta)
        let cx = M
        cols.forEach((c, i) => {
          if (rodape[i]) {
            if (c.dir) dir(limpo(rodape[i]), cx + larg[i] - 2.5, y + 4.4)
            else doc.text(limpo(rodape[i]), cx + 2.5, y + 4.4)
          }
          cx += larg[i]
        })
        y += ALT + 1
      }
      y += 9
    }

    novaPagina()
    const linhasPed = _linhasExport(D)
    if (linhasPed.length) {
      const somaE = linhasPed.reduce((s, l) => s + (l.estimado || 0), 0)
      const somaF = linhasPed.reduce((s, l) => s + (l.final || 0), 0)
      tabela(`${tr('pedidosPeriodo')} (${linhasPed.length})`, [
        { t: tr('colNum'), w: 22, sub: true }, { t: tr('colTitulo') }, { t: tr('colEmpresa'), w: 42 }, { t: tr('colCategoria'), w: 32 },
        { t: tr('colStatus'), w: 25 }, { t: tr('colCriado'), w: 22 }, { t: tr('colEstimado'), w: 30, dir: true }, { t: tr('colFinal'), w: 30, dir: true },
      ], linhasPed.map(l => [l.num, l.titulo, l.empresa, l.categoria, l.status, l.data ? _dataUTC(l.data) : '-',
        l.estimado ? brl(l.estimado) : '-', l.final ? brl(l.final) : '-']),
      [tr('total'), _plural(linhasPed.length, tr('pedido'), tr('pedidos')), '', '', '', '', brl(somaE), brl(somaF)])
    } else {
      y = tituloSecao(M, y, LARG, tr('pedidosPeriodo'), '')
      y = vazio(M, y, tr('vazioTxt', { ini: formatDate(D.iv.ini), fim: formatDate(D.iv.fim) })) + 8
    }

    if (D.abertas.length) {
      tabela(tr('parcelasAbertas'), [
        { t: tr('colVenc'), w: 24 }, { t: tr('colNum'), w: 22, sub: true }, { t: tr('colTitulo') }, { t: tr('colEmpresa'), w: 48 },
        { t: tr('colParcela'), w: 22, dir: true }, { t: tr('colValor'), w: 32, dir: true }, { t: tr('colSituacao'), w: 26, atraso: true },
      ], D.abertas.map(pc => {
        const p = _todos.find(x => x.id === pc.pedidoId)
        const diff = _diasEntre(hojeIso, pc.vencimento)
        return [formatDate(pc.vencimento), p?.numeroPedido || '', p?.titulo || '', _nomeEmpresa(p?.empresaId), `${pc.numero}/${pc.total}`, brl(pc.valor), diff < 0 ? tr('vencida') : tr('aberta')]
      }), [tr('total'), '', _plural(D.abertas.length, tr('parcela1'), tr('parcelaN')), '', '', brl(D.abertas.reduce((s, p) => s + (Number(p.valor) || 0), 0)), ''])
    }

    // Cabeçalho corrido (páginas 2+) e rodapé em todas: assinatura AFN, data e paginação
    const total = doc.getNumberOfPages()
    const gerado = `${tr('geradoEm')} ${agora.toLocaleDateString('pt-BR')} ${_pad(agora.getHours())}:${_pad(agora.getMinutes())}`
    for (let i = 1; i <= total; i++) {
      doc.setPage(i)
      if (i > 1) {
        _desenharSimbolo(doc, M, M - 1, 5, PAPEL.terracota, PAPEL.branco)
        fonte('normal', 9); cor(PAPEL.tinta); espacado('PRAXIS', M + 7.5, M + 3.8, 1)
        fonte('normal', 7.4); cor(PAPEL.texto3); dir(`${limpo(tr('relatorioCompras'))} · ${periodo}`, W - M, M + 3.8)
        fio(M, M + 7, W - M, false)
      }
      fio(M, H - 10, W - M, false)
      fonte('bold', 7.2)
      cor(PAPEL.afn); espacado('AFN', M, H - 6, 0.4)
      let fx = M + larguraEsp('AFN', 0.4) + 1.6
      cor(PAPEL.cinzaAfn); espacado('SYSTEMS', fx, H - 6, 0.4)
      fx += larguraEsp('SYSTEMS', 0.4) + 3
      fonte('normal', 7.2); doc.text('|  Praxis', fx, H - 6)
      cor(PAPEL.texto3); doc.text(limpo(gerado), W / 2, H - 6, { align: 'center' })
      dir(`${tr('pagina')} ${i} ${tr('de')} ${total}`, W - M, H - 6)
    }
    doc.save(_nomeArquivo('pdf'))
  })
}
