// Catálogo dos avisos automáticos: o que cada mudança do pedido avisa, a quem e
// com que texto. Funções puras (sem Firebase), testadas em
// tests/functions.test.mjs. Os textos seguem os avisos de exemplo da demo
// (js/demo-reset.js), e os destinatários respeitam a separação de funções das
// regras: quem abriu ou cotou o pedido não é chamado para decidir.
//
// Cada aviso é { evento, titulo, corpo, email, perfis, ids, excluir }:
//   perfis  → todas as pessoas ativas desses perfis que alcançam a empresa do pedido
//   ids     → pessoas certas (solicitante, comprador...), mesmo fora dos perfis
//   excluir → quem não recebe (em geral, quem fez a ação)

const { dataBR, diasEntre } = require('./datas')

const PERFIS = {
  FILA:       ['comprador', 'gestor', 'supremo'],   // quem pode assumir um pedido
  GESTAO:     ['gestor', 'supremo'],
  DECISAO:    ['aprovador', 'gestor', 'supremo'],
  FINANCEIRO: ['financeiro', 'gestor', 'supremo'],
}

const ETAPAS_ENCERRADAS = ['entregue', 'pago', 'reprovado', 'cancelado']

// Prazo sem comprador até o aviso de pedido parado
const HORAS_PARADO = { urgente: 4, normal: 48 }

// Parcelas a vencer avisam com até 3 dias de antecedência
const DIAS_ANTES_DO_VENCIMENTO = 3

function _aviso(evento, titulo, corpo, { email = false, perfis = [], ids = [], excluir = [] } = {}) {
  return { evento, titulo, corpo, email, perfis, ids: ids.filter(Boolean), excluir: excluir.filter(Boolean) }
}

// Como o pedido aparece no texto: número e título, como na demo
function nomeDoPedido(p) {
  const titulo = `"${p.titulo || 'Pedido'}"`
  return p.numeroPedido ? `${p.numeroPedido} ${titulo}` : titulo
}

// Motivo gravado; em "Outros", o texto que a pessoa escreveu
function motivoDe(p, campo) {
  const m = p[campo]
  return m === 'Outros' ? (p[`${campo}Outros`] || m) : m
}

const _comMotivo = (texto, motivo) => motivo ? `${texto} Motivo: ${motivo}.` : texto

// Os avisos de uma gravação do pedido. antes = null na criação. Pedidos da demo
// não avisam ninguém: a demo tem os próprios avisos de exemplo.
function planoDoPedido(antes, depois) {
  if (!depois || depois.isDemo) return []
  const nome = nomeDoPedido(depois)

  if (!antes) {
    if (depois.status !== 'solicitado') return []
    return depois.urgente
      ? [_aviso('pedido_urgente', 'Pedido urgente aberto', `${nome} aguarda um comprador.`,
          { email: true, perfis: PERFIS.FILA, excluir: [depois.solicitanteId] })]
      : [_aviso('ag_cotacao', 'Novo pedido na fila', `${nome} aguarda um comprador.`,
          { perfis: PERFIS.FILA, excluir: [depois.solicitanteId] })]
  }

  // Assumir e devolver à fila mudam o comprador e a etapa na mesma gravação:
  // o aviso sai pela troca do comprador, não pela etapa
  if (!antes.compradorId && depois.compradorId) {
    const quem = depois.compradorNome || 'Um comprador'
    return [_aviso('comprador_assumiu', 'Comprador assumiu o pedido', `${quem} assumiu ${nome}.`,
      { perfis: PERFIS.GESTAO, ids: [depois.solicitanteId], excluir: [depois.compradorId] })]
  }
  if (antes.compradorId && !depois.compradorId) {
    return [
      _aviso('pedido_liberado', 'Você saiu do pedido', `${nome} voltou para a fila, e outro comprador pode assumir.`,
        { ids: [antes.compradorId] }),
      _aviso('pedido_liberado', 'Pedido de volta à fila', `${nome} voltou para a fila e aguarda um comprador.`,
        { perfis: PERFIS.FILA }),
    ]
  }

  const avisos = []

  // Marcado como urgente depois de aberto (edição do solicitante ou do gestor)
  if (!antes.urgente && depois.urgente && !ETAPAS_ENCERRADAS.includes(depois.status)) {
    const perfis = depois.status === 'solicitado' ? PERFIS.FILA
      : depois.status === 'em_aprovacao' ? PERFIS.DECISAO
      : PERFIS.GESTAO
    avisos.push(_aviso('pedido_urgente', 'Pedido marcado como urgente', `${nome} foi marcado como urgente.`,
      { email: true, perfis, ids: [depois.compradorId] }))
  }

  if (antes.status === depois.status) return avisos

  switch (depois.status) {
    case 'em_aprovacao':
      avisos.push(_aviso('cotacoes_prontas', 'Pedido aguarda aprovação', `${nome} tem cotações prontas para análise.`,
        { email: true, perfis: PERFIS.DECISAO, excluir: [depois.solicitanteId, depois.compradorId] }))
      break
    case 'aprovado':
      avisos.push(
        _aviso('pedido_aprovado', 'Pedido aprovado', `${nome} foi aprovado. Falta registrar a compra.`,
          { email: true, ids: [depois.compradorId], excluir: [depois.aprovadoPor] }),
        _aviso('pedido_aprovado', 'Pedido aprovado', `${nome} foi aprovado.`,
          { email: true, ids: [depois.solicitanteId], excluir: [depois.aprovadoPor] }),
      )
      break
    case 'reprovado':
      avisos.push(_aviso('pedido_reprovado', 'Pedido reprovado',
        _comMotivo(`${nome} foi reprovado.`, motivoDe(depois, 'motivoReprovacao')),
        { email: true, ids: [depois.solicitanteId, depois.compradorId], excluir: [depois.reprovadoPor] }))
      break
    case 'cancelado':
      // aprovadorIds: com alçada (js/alcadas.js), as pessoas do nível atual
      avisos.push(_aviso('pedido_cancelado', 'Pedido cancelado',
        _comMotivo(`${nome} foi cancelado.`, motivoDe(depois, 'motivoCancelamento')),
        { email: true,
          ids: [depois.solicitanteId, depois.compradorId, depois.aprovadoPor, ...(depois.aprovadorIds || [])],
          excluir: [depois.canceladoPor] }))
      break
    case 'comprado':
      avisos.push(_aviso('pedido_comprado', 'Pedido comprado', `${nome} foi comprado. Aguardando entrega.`,
        { email: true, perfis: PERFIS.FINANCEIRO, excluir: [depois.compradorId] }))
      break
    case 'entregue':
      avisos.push(
        _aviso('pedido_entregue', 'Pedido entregue', `${nome} foi entregue. Confirme o pagamento.`,
          { perfis: ['financeiro'] }),
        _aviso('pedido_entregue_solic', 'Seu pedido foi entregue', `${nome} chegou.`,
          { ids: [depois.solicitanteId] }),
      )
      break
  }
  return avisos
}

// Pedido parado sem comprador: aviso único por pedido e prazo
function avisoParado(pedido, criadoEm, agora = new Date()) {
  if (!pedido || pedido.isDemo || pedido.status !== 'solicitado' || pedido.compradorId) return null
  if (!(criadoEm instanceof Date) || Number.isNaN(criadoEm.getTime())) return null
  const horas = pedido.urgente ? HORAS_PARADO.urgente : HORAS_PARADO.normal
  if (agora.getTime() - criadoEm.getTime() < horas * 3600 * 1000) return null
  return {
    chave: chaveAviso('pedido_parado', pedido.id, `${horas}h`),
    ..._aviso('pedido_parado', `Pedido parado há ${horas}h sem comprador`,
      `${nomeDoPedido(pedido)} ainda não foi assumido por nenhum comprador.`,
      { email: true, perfis: PERFIS.GESTAO }),
  }
}

function _quandoVence(dias, data) {
  if (dias === 0) return `vence hoje (${data})`
  if (dias === 1) return `vence amanhã (${data})`
  return `vence em ${dias} dias (${data})`
}

// Parcela a vencer (até 3 dias) ou vencida: aviso único por parcela e
// vencimento (se o vencimento mudar, a parcela avisa de novo)
function avisoParcela(parcela, pedido, hoje) {
  if (!parcela || !pedido || pedido.isDemo || parcela.pago || !parcela.vencimento) return null
  const dias = diasEntre(hoje, parcela.vencimento)
  if (Number.isNaN(dias) || dias > DIAS_ANTES_DO_VENCIMENTO) return null
  const qual = `Parcela ${parcela.numero}/${parcela.total} de ${nomeDoPedido(pedido)}`
  const data = dataBR(parcela.vencimento)
  const evento = dias < 0 ? 'parcela_vencida' : 'parcela_vencendo'
  return {
    chave: chaveAviso(evento, pedido.id, parcela.id, parcela.vencimento),
    ...(dias < 0
      ? _aviso(evento, 'Parcela vencida', `${qual} venceu em ${data}.`, { email: true, perfis: PERFIS.FINANCEIRO })
      : _aviso(evento, 'Parcela a vencer', `${qual} ${_quandoVence(dias, data)}.`, { email: true, perfis: PERFIS.FINANCEIRO })),
  }
}

// Chave de idempotência de um aviso, que também serve de ID de documento
// (sem barra, com tamanho limitado)
function chaveAviso(...partes) {
  return partes.map(p => String(p ?? '').replace(/[^\w.-]/g, '_')).join('__').slice(0, 400)
}

// Empresas da pessoa sempre como lista (o perfil antigo gravava um mapa)
function empresasDe(usuario) {
  const r = usuario?.empresas
  if (Array.isArray(r)) return r
  return r && typeof r === 'object' ? Object.keys(r) : []
}

// Quem alcança o pedido: o supremo, ou quem tem a empresa dele
function alcancaEmpresa(usuario, empresaId) {
  if (usuario?.perfil === 'supremo') return true
  return !!empresaId && empresasDe(usuario).includes(empresaId)
}

// Quem recebe cada aviso, a partir das pessoas candidatas (as dos perfis e as
// dos IDs). Cada pessoa recebe no máximo um aviso por mudança: vale o primeiro
// da lista em que ela aparece.
function distribuir(avisos, empresaId, candidatos) {
  const porId = new Map((candidatos || []).filter(u => u && u.id).map(u => [u.id, u]))
  const vistos = new Set()
  const entregas = []
  for (const aviso of avisos) {
    const fora = new Set(aviso.excluir)
    const alvo = [
      ...aviso.ids.map(id => porId.get(id)).filter(Boolean),
      ...[...porId.values()].filter(u => aviso.perfis.includes(u.perfil) && alcancaEmpresa(u, empresaId)),
    ]
    for (const u of alvo) {
      if (u.ativo === false || fora.has(u.id) || vistos.has(u.id)) continue
      vistos.add(u.id)
      entregas.push({ usuario: u, aviso })
    }
  }
  return entregas
}

// Perfis e IDs que o servidor precisa buscar para distribuir os avisos
function quemBuscar(avisos) {
  return {
    perfis: [...new Set(avisos.flatMap(a => a.perfis))],
    ids:    [...new Set(avisos.flatMap(a => a.ids))],
  }
}

module.exports = {
  PERFIS, HORAS_PARADO, DIAS_ANTES_DO_VENCIMENTO,
  nomeDoPedido, motivoDe, planoDoPedido, avisoParado, avisoParcela,
  chaveAviso, empresasDe, alcancaEmpresa, distribuir, quemBuscar,
}
