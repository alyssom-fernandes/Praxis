// Estado da tela de relatórios, compartilhado por js/relatorios.js e
// relatorios-exportar.js. Um objeto só: os módulos leem e trocam os campos.
export const R = {
  todos: [], // todos os pedidos visíveis ao usuário
  parcelas: [], // { id, pedidoId, ...parcela }
  cotacoes: {}, // { pedidoId: [cotacao] }
  historicos: {}, // { pedidoId: [entrada do histórico] }, para o tempo do processo
  empresas: [],
  categorias: [],
  filtroPer: '30d',
  filtroEmp: 'todas',
  dataIni: '',
  dataFim: '',
  vistaMensal: 'grafico',
  carregado: false,
  geracao: 0,
}
