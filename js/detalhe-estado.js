// Estado da tela de detalhe do pedido, compartilhado pelos módulos dela
// (js/pedido-detalhe.js, detalhe-painel.js, detalhe-acoes.js, detalhe-dados.js).
// Um objeto só: os módulos leem e trocam os campos (D.pedido, D.historico...).
export const D = {
  unsubPedido: null,
  unsubHistorico: null,
  pedidoId: null,
  pedido: null,
  posAnterior: null,
  avancouDe: null,
  avancouEm: 0,
  cotacoes: [],
  comentarios: [],
  comentEditando: null, // { id, rascunho }: o comentário aberto para edição
  notaInterna: false, // seletor "Só equipe de compras" do compositor
  secoesAlternadas: {},
  historico: [],
  parcelas: [],
  anexos: [],
  empresas: [],
  categorias: [],
  usuarios: [],
  fornecedores: [],
  fecharMenuDoc: null,
  menuLimpadorReg: false,
  mentionIndex: -1,
}
