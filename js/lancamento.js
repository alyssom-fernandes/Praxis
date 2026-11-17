// Compra já feita (lançamento): uma compra que aconteceu antes de passar pelo
// Praxis, registrada depois só para ficar rastreada. Sem Firebase nem DOM: a
// tela (js/lancar-compra.js), o detalhe do pedido e os testes usam as mesmas
// funções. As regras do Firestore conferem o que sai daqui (lancamentoValido,
// revisarAutorizacao, parcelaDoLancamento).
import { STATUS, PERFIS } from './constants.js'
import { dividirEmParcelas, vencimentosMensais, empresasDoUsuario } from './utils.js'
import { conferirNota } from './nota.js'

// Por que a compra foi direto, sem solicitação nem cotação (rótulo em
// lancMotivo_{chave}); "outro" pede a explicação no texto
export const MOTIVOS_LANCAMENTO = ['simples', 'urgente', 'decidida', 'habitual', 'outro']
export const MAX_NOME = 120
export const MAX_NOTA = 60

// Etapa em que o pedido nasce: ainda não chegou (Comprado), chegou e falta
// pagar (Entregue) ou chegou e já foi pago (Pago)
export function statusDoLancamento({ recebido, pago }) {
  return recebido ? (pago ? STATUS.PAGO : STATUS.ENTREGUE) : STATUS.COMPRADO
}

// Pessoa do lançamento: alguém do Praxis (com o id) ou só o nome digitado
export function pessoa(id, nome) {
  return { id: id || null, nome: String(nome || '').trim().slice(0, MAX_NOME) }
}

const _url = s => /^https?:\/\/[^\s]+$/i.test(String(s || '').trim())

// Erros do formulário, como [campo, chave do texto]; vazio quando está tudo certo
export function errosDoLancamento(v, hoje) {
  const erros = []
  const exigir = (campo, ok) => { if (!ok) erros.push([campo, 'campoObrigatorio']) }
  exigir('lc-titulo', String(v.titulo || '').trim())
  exigir('lc-empresa', v.empresaId)
  exigir('lc-fornecedor', String(v.fornecedorNome || '').trim())
  if (!(Number(v.valorFinal) > 0)) erros.push(['lc-valor', 'lancValorInvalido'])
  if (!v.dataCompra) erros.push(['lc-data', 'campoObrigatorio'])
  else if (hoje && v.dataCompra > hoje) erros.push(['lc-data', 'lancDataFutura'])
  const nome = p => String(p?.nome || '').trim()
  exigir('lc-pedido-por', nome(v.pedidoPor))
  exigir('lc-autorizado-por', nome(v.autorizadoPor))
  exigir('lc-comprado-por', nome(v.compradoPor))
  if (!MOTIVOS_LANCAMENTO.includes(v.motivo)) erros.push(['lc-motivo', 'campoObrigatorio'])
  else if (v.motivo === 'outro' && !String(v.detalhes || '').trim()) erros.push(['lc-detalhes', 'lancExpliqueOutro'])
  if (!v.pago) {
    if (!v.vencimento) erros.push(['lc-vencimento', 'campoObrigatorio'])
    const n = Number(v.parcelas)
    if (!(Number.isInteger(n) && n >= 1 && n <= 60)) erros.push(['lc-parcelas', 'lancParcelasInvalidas'])
  }
  if (v.link && !_url(v.link)) erros.push(['lc-link', 'lancLinkInvalido'])
  const nota = conferirNota(v.notaFiscal)
  if (String(v.notaFiscal || '').trim().length > MAX_NOTA) erros.push(['lc-nota', 'lancNotaLonga'])
  else if (nota === 'digito') erros.push(['lc-nota', 'notaDigitoErrado'])
  else if (nota === 'tamanho') erros.push(['lc-nota', 'notaTamanhoErrado'])
  return erros
}

// O pedido e as parcelas do lançamento. `quem` é a pessoa logada ({ id, nome });
// `ts` é a marca de hora do servidor (serverTimestamp() no app). O número do
// pedido entra na transação, junto com o contador
export function montarLancamento(v, quem, ts) {
  const status = statusDoLancamento(v)
  const autorizadoPor = pessoa(v.autorizadoPor?.id, v.autorizadoPor?.nome)
  const compradoPor = pessoa(v.compradoPor?.id, v.compradoPor?.nome)
  // Só o gestor (ou o supremo) que autorizou a própria compra a lança
  // confirmada; os outros perfis passam pela revisão (como nas regras)
  const euAutorizei = autorizadoPor.id === quem.id && [PERFIS.GESTOR, PERFIS.SUPREMO].includes(quem.perfil)
  const valorFinal = Math.round(Number(v.valorFinal) * 100) / 100
  const pedido = {
    titulo: String(v.titulo).trim().slice(0, 120),
    descricao: String(v.detalhes || '').trim(),
    empresaId: v.empresaId,
    quantidade: Number(v.quantidade) >= 1 ? Number(v.quantidade) : 1,
    unidade: v.unidade || 'un',
    dataNecessaria: null,
    valorEstimado: null,
    centroCusto: null,
    categoriaId: v.categoriaId || '',
    urgente: false,
    status,
    solicitanteId: quem.id,
    solicitanteNome: quem.nome || null,
    compradorId: compradoPor.id,
    compradorNome: compradoPor.nome,
    compradorAssumiuEm: null,
    aprovadorIds: [],
    aprovadoPor: null,
    aprovadoEm: null,
    reprovadoPor: null,
    reprovadoEm: null,
    motivoReprovacao: null,
    motivoReprovacaoOutros: null,
    canceladoPor: null,
    canceladoEm: null,
    motivoCancelamento: null,
    motivoCancelamentoOutros: null,
    cotacaoIndicadaId: null,
    fornecedorId: v.fornecedorId || null,
    fornecedorNome: String(v.fornecedorNome).trim(),
    valorFinal,
    condicaoPagamento: v.pago ? 'a_vista' : 'apos_recebimento',
    dataCompra: v.dataCompra,
    dataEntrega: v.recebido ? v.dataCompra : null,
    notaFiscal: String(v.notaFiscal || '').trim() || null,
    linkCompra: String(v.link || '').trim() || null,
    lancamento: {
      lancadoPor: quem.id,
      lancadoPorNome: quem.nome || '',
      pedidoPor: pessoa(v.pedidoPor?.id, v.pedidoPor?.nome),
      autorizadoPor,
      compradoPor,
      motivo: v.motivo,
      recebido: !!v.recebido,
      pago: !!v.pago,
      autorizacao: euAutorizei ? 'confirmada' : 'pendente',
      autorizacaoEm: euAutorizei ? ts : null,
      autorizacaoPor: euAutorizei ? quem.id : null,
      autorizacaoPorNome: euAutorizei ? (quem.nome || '') : null,
    },
    criadoEm: ts,
    atualizadoEm: ts,
  }
  // Já pago: uma parcela paga na data da compra. A pagar: as parcelas mensais
  // a partir do vencimento, em centavos (a última leva a diferença)
  const parcelas = v.pago
    ? [{ numero: 1, total: 1, valor: valorFinal, vencimento: v.dataCompra, pago: true, pagoEm: ts, comprovante: null }]
    : (() => {
      const n = Number(v.parcelas) || 1
      const valores = dividirEmParcelas(valorFinal, n)
      const datas = vencimentosMensais(v.vencimento, n)
      return valores.map((valor, i) => ({ numero: i + 1, total: n, valor, vencimento: datas[i], pago: false, pagoEm: null, comprovante: null }))
    })()
  return { pedido, parcelas }
}

// Quem pode confirmar ou negar a autorização de um lançamento pendente: a
// pessoa apontada como autorizadora ou um gestor da empresa; nunca quem lançou
export function podeRevisarAutorizacao(pedido, usuario) {
  const l = pedido?.lancamento
  if (!l || l.autorizacao !== 'pendente' || !usuario?.id || l.lancadoPor === usuario.id) return false
  if (l.autorizadoPor?.id && l.autorizadoPor.id === usuario.id) return true
  const gestor = [PERFIS.GESTOR, PERFIS.SUPREMO].includes(usuario.perfil)
  const daEmpresa = usuario.perfil === PERFIS.SUPREMO || empresasDoUsuario(usuario).includes(pedido.empresaId)
  return gestor && daEmpresa && l.lancadoPor !== usuario.id
}

// O que muda no pedido ao confirmar ou negar ('confirmada' | 'negada')
export function revisaoDaAutorizacao(pedido, usuario, resultado, ts, eventoId) {
  return {
    lancamento: {
      ...pedido.lancamento,
      autorizacao: resultado,
      autorizacaoEm: ts,
      autorizacaoPor: usuario.id,
      autorizacaoPorNome: usuario.nome || '',
    },
    autorizacaoEventoId: eventoId,
    atualizadoEm: ts,
  }
}
