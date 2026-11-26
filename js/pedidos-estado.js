// Estado da tela de pedidos (quadro e lista), compartilhado pelos módulos dela
// (js/pedidos.js, pedidos-fluxo.js, pedidos-quadro.js). Um objeto só: os
// módulos leem e trocam os campos (Q.pedidos, Q.filtroAtivo...).
export const Q = {
  pedidoFonteDuplicar: null,
  abrirNovoAoEntrar: false,
  unsubPedidos: null,
  resizeLigado: false, // um só ouvinte de resize para as setas do quadro
  pedidos: [],
  categorias: [],
  empresas: [], // ativas — usadas nos seletores
  empresasTodas: [], // todas — usadas para exibir o nome (pedidos antigos de empresa inativa)
  usuarios: [],
  viewMode: 'kanban', // 'kanban' | 'lista'
  colunasExpandidas: new Set(),
  filtroAtivo: 'todos',
  termoBusca: '',
  filtroCategoria: '',
  filtroEmpresa: '',
  filtroComprador: '',
  filtroDataIni: '',
  filtroDataFim: '',
  ordemCampo: 'criadoEm',
  ordemDesc: true,
  paginaAtual: 0,
  viewsSalvas: [],
  visaoAtiva: null,
  selecionados: new Set(),
  etapaMovel: null, // etapa mostrada no celular (régua)
  arrastandoToque: false,
  arrastoAtivo: false,
  renderPendente: false,
  etapaAntes: null,
  mudaramAgora: new Set(),
  tGuardarQuadro: null,
  recebeuPedidos: false,
  esperaAuxiliares: null,
  // Escuta só os encerrados recentes (js/pedidos-fluxo.js); verTodos traz os
  // demais nesta visita
  encerradosNoLimite: false,
  lidos: {}, // pedidos que a pessoa já abriu (lidos/{uid}, js/pedidos-fluxo.js)
  verTodos: false,
}
