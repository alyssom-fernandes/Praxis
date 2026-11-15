// Testes das funções puras das Cloud Functions: datas no fuso de São Paulo,
// quem recebe cada aviso e as chaves que impedem aviso repetido. Rodam sem
// Firebase e sem emulador.
//
//   npm run testar-unidade

import { test } from 'node:test'
import assert from 'node:assert/strict'
import datas from '../functions/src/datas.js'
import avisos from '../functions/src/avisos.js'
import email from '../functions/src/email.js'

const { diaSP, horaSP, somarDias, diasEntre, momentoSP, dataBR } = datas
const { planoDoPedido, avisoParado, avisoParcela, chaveAviso, distribuir, quemBuscar, alcancaEmpresa } = avisos

// ── Datas ──────────────────────────────────────────────────────
test('o dia e a hora são os de São Paulo, não os do servidor em UTC', () => {
  // 21h30 em Brasília do dia 15 já é dia 16 em UTC
  const noite = new Date('2026-11-16T00:30:00Z')
  assert.equal(diaSP(noite), '2026-11-15')
  assert.equal(horaSP(noite), 21)
  assert.equal(diaSP(new Date('2026-11-16T03:00:00Z')), '2026-11-16')
  assert.equal(horaSP(new Date('2026-11-16T03:00:00Z')), 0)
})

test('somar dias atravessa meses e anos sem depender do fuso', () => {
  assert.equal(somarDias('2026-11-29', 3), '2026-12-02')
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(somarDias('2028-03-01', -1), '2028-02-29')
  assert.equal(somarDias('não é data', 1), 'não é data')
  assert.equal(diasEntre('2026-11-15', '2026-11-18'), 3)
  assert.equal(diasEntre('2026-11-15', '2026-11-12'), -3)
})

test('o momento de uma data e hora de Brasília, e a data no formato brasileiro', () => {
  assert.equal(momentoSP('2026-11-15', 8, 5).toISOString(), '2026-11-15T11:05:00.000Z')
  assert.equal(dataBR('2026-11-05'), '05/11/2026')
  assert.equal(dataBR(''), '')
  assert.equal(dataBR(undefined), '')
})

// ── Avisos do pedido ───────────────────────────────────────────
const PEDIDO = {
  id: 'p1', numeroPedido: 'PRX-0042', titulo: 'Toner', empresaId: 'e1',
  status: 'solicitado', solicitanteId: 'sol', compradorId: null, urgente: false,
}

test('pedido aberto avisa a fila de compra, menos quem abriu; urgente também por e-mail', () => {
  const [normal] = planoDoPedido(null, PEDIDO)
  assert.equal(normal.evento, 'ag_cotacao')
  assert.equal(normal.email, false)
  assert.deepEqual(normal.perfis, ['comprador', 'gestor', 'supremo'])
  assert.deepEqual(normal.excluir, ['sol'])
  assert.equal(normal.corpo, 'PRX-0042 "Toner" aguarda um comprador.')

  const [urgente] = planoDoPedido(null, { ...PEDIDO, urgente: true })
  assert.equal(urgente.evento, 'pedido_urgente')
  assert.equal(urgente.titulo, 'Pedido urgente aberto')
  assert.equal(urgente.email, true)
})

test('assumir avisa pela troca do comprador, não como pedido novo', () => {
  const antes  = PEDIDO
  const depois = { ...PEDIDO, status: 'ag_cotacao', compradorId: 'comp', compradorNome: 'Carla' }
  const plano = planoDoPedido(antes, depois)
  assert.equal(plano.length, 1)
  assert.equal(plano[0].evento, 'comprador_assumiu')
  assert.equal(plano[0].corpo, 'Carla assumiu PRX-0042 "Toner".')
  assert.deepEqual(plano[0].ids, ['sol'])
  assert.deepEqual(plano[0].excluir, ['comp'])
})

test('devolver à fila avisa quem saiu e a fila de compra', () => {
  const antes  = { ...PEDIDO, status: 'ag_cotacao', compradorId: 'comp' }
  const depois = { ...PEDIDO, status: 'solicitado', compradorId: null }
  const [saiu, fila] = planoDoPedido(antes, depois)
  assert.equal(saiu.evento, 'pedido_liberado')
  assert.deepEqual(saiu.ids, ['comp'])
  assert.equal(fila.evento, 'pedido_liberado')
  assert.deepEqual(fila.perfis, ['comprador', 'gestor', 'supremo'])
})

test('urgência marcada depois de aberto avisa quem cuida da etapa', () => {
  const emCotacao = { ...PEDIDO, status: 'ag_cotacao', compradorId: 'comp' }
  const [aviso] = planoDoPedido(emCotacao, { ...emCotacao, urgente: true })
  assert.equal(aviso.evento, 'pedido_urgente')
  assert.equal(aviso.titulo, 'Pedido marcado como urgente')
  assert.deepEqual(aviso.perfis, ['gestor', 'supremo'])
  assert.deepEqual(aviso.ids, ['comp'])
  // Pedido encerrado não avisa
  const pago = { ...PEDIDO, status: 'pago' }
  assert.deepEqual(planoDoPedido(pago, { ...pago, urgente: true }), [])
})

test('em aprovação chama quem decide, menos quem abriu e quem cotou', () => {
  const antes  = { ...PEDIDO, status: 'ag_cotacao', compradorId: 'comp' }
  const [aviso] = planoDoPedido(antes, { ...antes, status: 'em_aprovacao' })
  assert.equal(aviso.evento, 'cotacoes_prontas')
  assert.deepEqual(aviso.perfis, ['aprovador', 'gestor', 'supremo'])
  assert.deepEqual(aviso.excluir, ['sol', 'comp'])
})

test('aprovação, reprovação e cancelamento não avisam quem fez a ação', () => {
  const base = { ...PEDIDO, status: 'em_aprovacao', compradorId: 'comp' }
  const aprov = planoDoPedido(base, { ...base, status: 'aprovado', aprovadoPor: 'apr' })
  assert.deepEqual(aprov.map(a => a.ids), [['comp'], ['sol']])
  assert.ok(aprov.every(a => a.excluir.includes('apr')))
  assert.match(aprov[0].corpo, /Falta registrar a compra/)

  const [reprov] = planoDoPedido(base, {
    ...base, status: 'reprovado', reprovadoPor: 'apr',
    motivoReprovacao: 'Outros', motivoReprovacaoOutros: 'Fora do orçamento',
  })
  assert.equal(reprov.corpo, 'PRX-0042 "Toner" foi reprovado. Motivo: Fora do orçamento.')
  assert.deepEqual(reprov.excluir, ['apr'])

  const aprovado = { ...base, status: 'aprovado', aprovadoPor: 'apr' }
  const [canc] = planoDoPedido(aprovado, {
    ...aprovado, status: 'cancelado', canceladoPor: 'ges', motivoCancelamento: 'Duplicado',
  })
  assert.deepEqual(canc.ids, ['sol', 'comp', 'apr'])
  assert.deepEqual(canc.excluir, ['ges'])
  assert.match(canc.corpo, /Motivo: Duplicado\.$/)
})

test('compra e entrega avisam o financeiro, e a entrega também quem pediu', () => {
  const aprovado = { ...PEDIDO, status: 'aprovado', compradorId: 'comp' }
  const [comprado] = planoDoPedido(aprovado, { ...aprovado, status: 'comprado' })
  assert.equal(comprado.evento, 'pedido_comprado')
  assert.deepEqual(comprado.excluir, ['comp'])
  const comp = { ...aprovado, status: 'comprado' }
  const entregue = planoDoPedido(comp, { ...comp, status: 'entregue' })
  assert.deepEqual(entregue.map(a => a.evento), ['pedido_entregue', 'pedido_entregue_solic'])
})

test('marca de visto, comentário e pedidos da demo não geram aviso', () => {
  assert.deepEqual(planoDoPedido(PEDIDO, { ...PEDIDO, vistoPor: { x: 1 } }), [])
  assert.deepEqual(planoDoPedido(PEDIDO, { ...PEDIDO, ultimoComentarioEm: 1 }), [])
  assert.deepEqual(planoDoPedido(null, { ...PEDIDO, isDemo: true }), [])
  const demo = { ...PEDIDO, isDemo: true }
  assert.deepEqual(planoDoPedido(demo, { ...demo, status: 'cancelado' }), [])
})

// ── Destinatários ──────────────────────────────────────────────
const PESSOAS = [
  { id: 'sol',  perfil: 'solicitante', empresas: ['e1'], ativo: true },
  { id: 'comp', perfil: 'comprador',   empresas: ['e1'], ativo: true },
  { id: 'c2',   perfil: 'comprador',   empresas: { e1: true }, ativo: true },  // formato antigo
  { id: 'c3',   perfil: 'comprador',   empresas: ['e2'], ativo: true },        // outra empresa
  { id: 'ges',  perfil: 'gestor',      empresas: ['e1'], ativo: true },
  { id: 'sup',  perfil: 'supremo',     empresas: [], ativo: true },
  { id: 'fin',  perfil: 'financeiro',  empresas: ['e1'], ativo: false },       // inativo
]

test('destinatários: só quem alcança a empresa, ativo, sem o excluído e sem repetir', () => {
  const plano = planoDoPedido(null, PEDIDO)
  const ids = distribuir(plano, 'e1', PESSOAS).map(e => e.usuario.id)
  assert.deepEqual(ids.sort(), ['c2', 'comp', 'ges', 'sup'])

  // Quem está em dois avisos da mesma mudança recebe só o primeiro
  const antes = { ...PEDIDO, status: 'ag_cotacao', compradorId: 'comp' }
  const entregas = distribuir(planoDoPedido(antes, { ...antes, status: 'solicitado', compradorId: null }), 'e1', PESSOAS)
  const doComprador = entregas.filter(e => e.usuario.id === 'comp')
  assert.equal(doComprador.length, 1)
  assert.equal(doComprador[0].aviso.titulo, 'Você saiu do pedido')

  // Pedido sem empresa só chega ao supremo
  assert.equal(alcancaEmpresa(PESSOAS[4], undefined), false)
  assert.equal(alcancaEmpresa(PESSOAS[5], undefined), true)
})

test('o servidor busca só os perfis e as pessoas que os avisos pedem', () => {
  const base = { ...PEDIDO, status: 'em_aprovacao', compradorId: 'comp' }
  const busca = quemBuscar(planoDoPedido(base, { ...base, status: 'aprovado', aprovadoPor: 'apr' }))
  assert.deepEqual(busca, { perfis: [], ids: ['comp', 'sol'] })
})

// ── Rotinas agendadas ──────────────────────────────────────────
test('pedido parado avisa uma vez por prazo: 4h se urgente, 48h se não', () => {
  const agora = new Date('2026-11-15T12:00:00Z')
  const h = n => new Date(agora.getTime() - n * 3600 * 1000)
  assert.equal(avisoParado(PEDIDO, h(47), agora), null)
  const aviso = avisoParado(PEDIDO, h(49), agora)
  assert.equal(aviso.titulo, 'Pedido parado há 48h sem comprador')
  assert.equal(aviso.chave, 'pedido_parado__p1__48h')
  assert.equal(avisoParado({ ...PEDIDO, urgente: true }, h(5), agora).chave, 'pedido_parado__p1__4h')
  // Com comprador, fora da fila, da demo ou sem data, não avisa
  assert.equal(avisoParado({ ...PEDIDO, compradorId: 'comp' }, h(99), agora), null)
  assert.equal(avisoParado({ ...PEDIDO, status: 'ag_cotacao' }, h(99), agora), null)
  assert.equal(avisoParado({ ...PEDIDO, isDemo: true }, h(99), agora), null)
  assert.equal(avisoParado(PEDIDO, undefined, agora), null)
})

test('parcela avisa uma vez por vencimento, a vencer em até 3 dias ou vencida', () => {
  const hoje = '2026-11-15'
  const parc = { id: 'x1', numero: 2, total: 3, vencimento: '2026-11-17', pago: false }
  const aVencer = avisoParcela(parc, PEDIDO, hoje)
  assert.equal(aVencer.evento, 'parcela_vencendo')
  assert.equal(aVencer.corpo, 'Parcela 2/3 de PRX-0042 "Toner" vence em 2 dias (17/11/2026).')
  assert.equal(aVencer.chave, 'parcela_vencendo__p1__x1__2026-11-17')
  assert.match(avisoParcela({ ...parc, vencimento: hoje }, PEDIDO, hoje).corpo, /vence hoje \(15\/11\/2026\)/)
  assert.match(avisoParcela({ ...parc, vencimento: '2026-11-16' }, PEDIDO, hoje).corpo, /vence amanhã/)
  assert.equal(avisoParcela({ ...parc, vencimento: '2026-11-19' }, PEDIDO, hoje), null)

  const vencida = avisoParcela({ ...parc, vencimento: '2026-11-10' }, PEDIDO, hoje)
  assert.equal(vencida.evento, 'parcela_vencida')
  assert.equal(vencida.corpo, 'Parcela 2/3 de PRX-0042 "Toner" venceu em 10/11/2026.')
  // A chave muda se o vencimento mudar; paga, da demo ou sem pedido, não avisa
  assert.notEqual(vencida.chave, aVencer.chave)
  assert.equal(avisoParcela({ ...parc, pago: true }, PEDIDO, hoje), null)
  assert.equal(avisoParcela(parc, { ...PEDIDO, isDemo: true }, hoje), null)
  assert.equal(avisoParcela(parc, null, hoje), null)
})

test('a chave do aviso serve de ID de documento', () => {
  assert.equal(chaveAviso('evt', 'abc/def ghi'), 'evt__abc_def_ghi')
  assert.equal(chaveAviso('a', null, undefined), 'a____')
  assert.ok(chaveAviso('x', 'y'.repeat(2000)).length <= 400)
})

// ── E-mail ─────────────────────────────────────────────────────
test('o e-mail escapa o que as pessoas digitaram e mostra o motivo escrito', () => {
  const pedido = {
    ...PEDIDO, titulo: '<img src=x onerror=alert(1)> & cia', status: 'reprovado',
    motivoReprovacao: 'Outros', motivoReprovacaoOutros: '<b>caro</b>',
  }
  const m = email.modeloDoEmail('pedido_reprovado', pedido, { nome: 'Ana' })
  assert.ok(!m.body.includes('<img'))
  assert.ok(m.body.includes('&lt;img src=x onerror=alert(1)&gt; &amp; cia'))
  assert.ok(m.body.includes('Motivo: &lt;b&gt;caro&lt;/b&gt;'))
  // O assunto é texto puro
  assert.equal(m.subject, '❌ Pedido reprovado: PRX-0042 · <img src=x onerror=alert(1)> & cia')

  const parcela = email.modeloDoEmail('parcela_vencida', { ...PEDIDO, parcela: { numero: 1, total: 2, vencimento: '2026-11-10' } })
  assert.match(parcela.body, /Parcela 1\/2 — Venceu em: 10\/11\/2026/)
  assert.equal(email.modeloDoEmail('evento_sem_modelo', PEDIDO), null)
})
