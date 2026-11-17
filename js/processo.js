// Tempo do processo de compra, calculado do histórico dos pedidos.
// Sem Firebase nem DOM: o detalhe (tempo por etapa de um pedido) e os
// relatórios (tempo de ciclo, tempo por etapa e por comprador) usam as mesmas
// funções, e os testes de unidade as leem direto.
import { STATUS } from './constants.js'

// As sete etapas do caminho, na ordem do quadro
export const ETAPAS_CAMINHO = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO,
  STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
// Onde o pedido termina: dali em diante não corre tempo
export const TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]

// Milissegundos de um Timestamp do Firestore, de uma Date ou de um texto
export function msDe(ts) {
  if (!ts) return 0
  const ms = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime()
  return Number.isFinite(ms) ? ms : 0
}

// Entradas do histórico que mudam a etapa, da mais antiga à mais nova
export function transicoes(historico) {
  return (historico || [])
    .filter(h => h.status && (!h.tipo || h.tipo === 'status'))
    .sort((a, b) => msDe(a.criadoEm) - msDe(b.criadoEm))
}

// Cada passagem do pedido por uma etapa: { status, inicio, fim, durMs, emAndamento }.
// Em pedido encerrado, a última transição marca o fim (não conta tempo depois
// dela); nos outros, a etapa atual corre até `agora`.
export function segmentosDoPedido(pedido, historico, agora = Date.now()) {
  const lista = transicoes(historico)
  if (lista.length < 2) return []
  const terminal = TERMINAIS.includes(pedido?.status)
  const base = terminal ? lista.slice(0, -1) : lista
  return base.map((h, i) => {
    const inicio = msDe(h.criadoEm)
    const fim = i < lista.length - 1 ? msDe(lista[i + 1].criadoEm) : agora
    return { status: h.status, inicio, fim, durMs: Math.max(0, fim - inicio), emAndamento: !terminal && i === base.length - 1 }
  })
}

// Quando o pedido entrou em cada etapa (vale a última entrada: um pedido
// liberado volta a Solicitado). Solicitado cai na abertura se faltar.
export function entradas(pedido, historico) {
  const m = {}
  transicoes(historico).forEach(h => { m[h.status] = h.criadoEm })
  if (!m[STATUS.SOLICITADO] && pedido?.criadoEm) m[STATUS.SOLICITADO] = pedido.criadoEm
  return m
}

// Abertura, compra e pagamento do pedido, em ms (0 quando não houve)
export function marcosDoPedido(pedido, historico) {
  const lista = transicoes(historico)
  const primeira = (s) => { const h = lista.find(x => x.status === s); return h ? msDe(h.criadoEm) : 0 }
  const aberto = msDe(pedido?.criadoEm) || (lista.length ? msDe(lista[0].criadoEm) : 0)
  return { aberto, comprado: primeira(STATUS.COMPRADO), pago: primeira(STATUS.PAGO) }
}

// "3d 4h", "5h", "12min"; travessão quando não há tempo
export function formatarDuracao(ms) {
  if (!ms || ms < 0) return '—'
  const minutos = Math.floor(ms / 60000)
  const horas = Math.floor(minutos / 60)
  const dias = Math.floor(horas / 24)
  const h = horas % 24
  if (dias > 0) return h > 0 ? `${dias}d ${h}h` : `${dias}d`
  if (horas > 0) return `${horas}h`
  return `${minutos}min`
}

// Percentil por interpolação linear (p = 0,5 é a mediana); null sem dados
export function percentil(valores, p) {
  const v = (valores || []).filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const pos = (v.length - 1) * p
  const i = Math.floor(pos)
  return i + 1 < v.length ? v[i] + (v[i + 1] - v[i]) * (pos - i) : v[i]
}
const _resumo = (valores) => ({ n: valores.length, mediana: percentil(valores, 0.5), p85: percentil(valores, 0.85) })

// Resumo do processo de uma lista de pedidos, cada um com o seu histórico:
// itens = [{ pedido, historico }], janela = { ini, fim } em ms.
// - ciclo: da abertura à compra e ao pagamento, dos pedidos que chegaram lá
//   dentro da janela (a data que conta é a do fim, como no gráfico de controle);
// - etapas: o tempo que cada pedido passou em cada etapa (somando as voltas),
//   das passagens que terminaram na janela; mais os que estão nela agora e há
//   quanto tempo o mais antigo espera;
// - gargalo: a etapa de maior mediana, entre as que têm ao menos 2 passagens;
// - compradores: por comprador, a cotação (Aguardando cotação) e a compra
//   (de Aprovado a Comprado), as duas etapas que estão nas mãos dele.
export function resumoDoProcesso(itens, janela, agora = Date.now()) {
  const dentro = (ms) => ms && ms >= janela.ini && ms <= janela.fim
  const ateCompra = [], atePago = []
  const porEtapa = Object.fromEntries(ETAPAS_CAMINHO.filter(s => s !== STATUS.PAGO).map(s => [s, { tempos: [], agora: [] }]))
  const compradores = {}

  for (const { pedido, historico } of itens || []) {
    // A compra já feita não passou pelas etapas: fica fora do tempo do processo
    if (pedido?.lancamento) continue
    const marcos = marcosDoPedido(pedido, historico)
    if (marcos.aberto && dentro(marcos.comprado)) ateCompra.push(marcos.comprado - marcos.aberto)
    if (marcos.aberto && dentro(marcos.pago)) atePago.push(marcos.pago - marcos.aberto)

    // Tempo por etapa deste pedido: soma das passagens que terminaram na janela
    const soma = {}
    for (const seg of segmentosDoPedido(pedido, historico, agora)) {
      if (!porEtapa[seg.status]) continue
      if (seg.emAndamento) { porEtapa[seg.status].agora.push(seg.durMs); continue }
      if (!dentro(seg.fim)) continue
      soma[seg.status] = (soma[seg.status] || 0) + seg.durMs
    }
    Object.entries(soma).forEach(([s, ms]) => porEtapa[s].tempos.push(ms))

    const nome = pedido?.compradorNome
    if (nome && (soma[STATUS.AG_COTACAO] != null || soma[STATUS.APROVADO] != null)) {
      const chave = pedido.compradorId || nome
      const c = compradores[chave] = compradores[chave] || { nome, cotacao: [], compra: [] }
      if (soma[STATUS.AG_COTACAO] != null) c.cotacao.push(soma[STATUS.AG_COTACAO])
      if (soma[STATUS.APROVADO] != null) c.compra.push(soma[STATUS.APROVADO])
    }
  }

  const etapas = Object.entries(porEtapa).map(([status, e]) => ({
    status, ..._resumo(e.tempos), agora: e.agora.length, maisAntigo: e.agora.length ? Math.max(...e.agora) : 0,
  }))
  const candidatas = etapas.filter(e => e.n >= 2)
  const gargalo = candidatas.length ? candidatas.reduce((a, b) => (b.mediana > a.mediana ? b : a)).status : null

  return {
    ciclo: { compra: _resumo(ateCompra), pagamento: _resumo(atePago) },
    etapas,
    gargalo,
    compradores: Object.values(compradores)
      .map(c => ({ nome: c.nome, cotacao: _resumo(c.cotacao), compra: _resumo(c.compra) }))
      .sort((a, b) => (b.cotacao.n + b.compra.n) - (a.cotacao.n + a.compra.n) || a.nome.localeCompare(b.nome, 'pt-BR')),
  }
}
