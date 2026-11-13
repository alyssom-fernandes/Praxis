// Testes das regras do Firestore e do Storage, no emulador.
//
//   npm run testar-regras
//
// Cada perfil tenta o que pode e o que não pode. As permissões chegam no
// token (custom claims), como com a Cloud Function setUserClaims: { perfil,
// empresas }. As contas sem claims testam o plano gratuito, em que as regras
// leem o perfil do documento da pessoa em /usuarios.

import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, writeBatch, increment,
} from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject, listAll } from 'firebase/storage'

const PROJETO = 'demo-praxis'
let env

// ── Pessoas ────────────────────────────────────────────────────
const conta = {
  supremo:     ['u-sup', { perfil: 'supremo', empresas: [] }],
  gestor:      ['u-ges', { perfil: 'gestor', empresas: ['e1'] }],
  gestorE2:    ['u-ges2', { perfil: 'gestor', empresas: ['e2'] }],
  aprovador:   ['u-apr', { perfil: 'aprovador', empresas: ['e1'] }],
  comprador:   ['u-com', { perfil: 'comprador', empresas: ['e1'] }],
  compradorB:  ['u-com3', { perfil: 'comprador', empresas: ['e1'] }],
  compradorE2: ['u-com2', { perfil: 'comprador', empresas: ['e2'] }],
  financeiro:  ['u-fin', { perfil: 'financeiro', empresas: ['e1'] }],
  solicitante: ['u-sol', { perfil: 'solicitante', empresas: ['e1'] }],
  semPerfil:   ['u-x', {}],
  // Sem claims (plano gratuito): o perfil vem do documento em /usuarios
  semClaims:      ['u-doc', { email: 'doc@x.com' }],
  gestorSemClaims: ['u-gdoc', { email: 'gdoc@x.com' }],
  inativo:        ['u-inat', { email: 'inat@x.com' }],
  // Convites: quem foi convidado, quem não foi e quem tem convite vencido
  convidado:      ['u-conv', { email: 'convidado@x.com' }],
  intruso:        ['u-intr', { email: 'outro@x.com' }],
  convidadoVelho: ['u-velho', { email: 'velho@x.com' }],
  // A conta demo pública: mesmo com permissões de supremo no token (como
  // as que uma Cloud Function poderia gravar), vale só o perfil 'demo'
  demo:        ['u-demo', { email: 'demo@praxis.app', perfil: 'supremo', empresas: ['e1', 'e2'] }],
}
const db = quem => env.authenticatedContext(...conta[quem]).firestore()
const st = quem => env.authenticatedContext(...conta[quem]).storage()

// ── Dados de partida ───────────────────────────────────────────
const pedido = (extra = {}) => ({
  numeroPedido: 'PRX-0001', titulo: 'Notebook', empresaId: 'e1', status: 'solicitado',
  solicitanteId: 'u-sol', compradorId: null, dataNecessaria: '2026-11-30', ...extra,
})
const pedidoDemo = (extra = {}) => pedido({ empresaId: 'demo-nexara', solicitanteId: 'demo-solicitante', isDemo: true, ...extra })
const daqui = dias => new Date(Date.now() + dias * 864e5)
const convite = (extra = {}) => ({
  email: 'novo@x.com', nome: 'Convidado', perfil: 'comprador', empresas: ['e1'], ativo: true,
  criadoPor: 'u-ges', criadoPorNome: 'Ges', criadoEm: new Date(), expiraEm: daqui(30), ...extra,
})

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJETO,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})
after(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'usuarios/u-sol'), { nome: 'Sol', perfil: 'solicitante', empresas: ['e1'] })
    await setDoc(doc(f, 'usuarios/u-com'), { nome: 'Com', perfil: 'comprador', empresas: ['e1'] })
    await setDoc(doc(f, 'usuarios/u-com2'), { nome: 'Com2', perfil: 'comprador', empresas: ['e2'] })
    await setDoc(doc(f, 'usuarios/u-multi'), { nome: 'Multi', perfil: 'comprador', empresas: ['e1', 'e2'] })
    await setDoc(doc(f, 'usuarios/u-sup'), { nome: 'Sup', perfil: 'supremo', empresas: [] })
    await setDoc(doc(f, 'usuarios/demo-gestor'), { nome: 'Pessoa da demo', perfil: 'gestor', empresas: ['demo-nexara'], isDemo: true })
    await setDoc(doc(f, 'usuarios/u-demo-antigo'), { nome: 'Demo antiga', email: 'demo@praxis.app', perfil: 'supremo' })
    await setDoc(doc(f, 'usuarios/u-doc'), { nome: 'Doc', email: 'doc@x.com', perfil: 'comprador', empresas: ['e1'], ativo: true })
    await setDoc(doc(f, 'usuarios/u-inat'), { nome: 'Inat', email: 'inat@x.com', perfil: 'gestor', empresas: ['e1'], ativo: false })
    await setDoc(doc(f, 'convites/convidado@x.com'), convite({ email: 'convidado@x.com' }))
    await setDoc(doc(f, 'convites/velho@x.com'), convite({ email: 'velho@x.com', expiraEm: daqui(-1) }))
    await setDoc(doc(f, 'empresas/e1'), { nome: 'Empresa 1' })
    await setDoc(doc(f, 'empresas/e2'), { nome: 'Empresa 2' })
    await setDoc(doc(f, 'empresas/demo-nexara'), { nome: 'Empresa da demo', isDemo: true })
    await setDoc(doc(f, 'categorias/cat1'), { nome: 'Categoria real' })
    await setDoc(doc(f, 'fornecedores/f1'), { nome: 'fornecedor real' })
    await setDoc(doc(f, '_meta/contadores'), { totalPedidos: 5 })
    await setDoc(doc(f, '_meta/demo'), { dia: '2026-10-13', travadoAte: 0 })
    await setDoc(doc(f, 'pedidos/p1'), pedido())
    await setDoc(doc(f, 'pedidos/p2'), pedido({ numeroPedido: 'PRX-0002', empresaId: 'e2', solicitanteId: 'u-outro' }))
    await setDoc(doc(f, 'pedidos/emAprov'), pedido({ status: 'em_aprovacao', compradorId: 'u-com' }))
    await setDoc(doc(f, 'pedidos/emAprovGes'), pedido({ status: 'em_aprovacao', compradorId: 'u-com', solicitanteId: 'u-ges' }))
    await setDoc(doc(f, 'pedidos/cotando'), pedido({ status: 'ag_cotacao', compradorId: 'u-com' }))
    await setDoc(doc(f, 'pedidos/comprado'), pedido({ status: 'comprado', compradorId: 'u-com' }))
    await setDoc(doc(f, 'pedidos/entregue'), pedido({ status: 'entregue', compradorId: 'u-com' }))
    await setDoc(doc(f, 'pedidos/demo-0001'), pedidoDemo())
    await setDoc(doc(f, 'pedidos/p1/comentarios/c1'), { texto: 'oi', autorId: 'u-com', criadoEm: new Date('2026-10-01') })
  })
})

// ── Leitura ────────────────────────────────────────────────────
test('sem login ou sem perfil, nada é lido', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'pedidos/p1')))
  await assertFails(getDoc(doc(db('semPerfil'), 'empresas/e1')))
  await assertFails(getDoc(doc(db('semPerfil'), '_meta/contadores')))
})

test('cada um vê só os pedidos das suas empresas', async () => {
  await assertSucceeds(getDoc(doc(db('comprador'), 'pedidos/p1')))
  await assertFails(getDoc(doc(db('compradorE2'), 'pedidos/p1')))
  // Listar sem filtrar pela empresa só o supremo pode
  await assertFails(getDocs(collection(db('comprador'), 'pedidos')))
  await assertSucceeds(getDocs(collection(db('supremo'), 'pedidos')))
  await assertSucceeds(getDocs(query(collection(db('comprador'), 'pedidos'), where('empresaId', 'in', ['e1']))))
  await assertFails(getDocs(query(collection(db('comprador'), 'pedidos'), where('empresaId', 'in', ['e1', 'e2']))))
  // O solicitante lista os pedidos que ele abriu
  await assertSucceeds(getDocs(query(collection(db('solicitante'), 'pedidos'), where('solicitanteId', '==', 'u-sol'))))
})

// ── Usuários: ninguém se promove ───────────────────────────────
test('o usuário não muda o próprio perfil nem as empresas', async () => {
  await assertFails(updateDoc(doc(db('solicitante'), 'usuarios/u-sol'), { perfil: 'supremo' }))
  await assertFails(updateDoc(doc(db('solicitante'), 'usuarios/u-sol'), { empresas: ['e1', 'e2'] }))
  await assertSucceeds(updateDoc(doc(db('solicitante'), 'usuarios/u-sol'), { ultimoAcesso: new Date() }))
})

test('o gestor não cria supremo nem dá empresa que não tem', async () => {
  await assertFails(setDoc(doc(db('gestor'), 'usuarios/novo'), { nome: 'N', perfil: 'supremo', empresas: ['e1'] }))
  await assertFails(setDoc(doc(db('gestor'), 'usuarios/novo'), { nome: 'N', perfil: 'comprador', empresas: ['e2'] }))
  await assertSucceeds(setDoc(doc(db('gestor'), 'usuarios/novo'), { nome: 'N', perfil: 'comprador', empresas: ['e1'] }))
  await assertFails(updateDoc(doc(db('gestor'), 'usuarios/u-sup'), { nome: 'Outro' }))
})

test('o gestor só lê e edita usuários das empresas dele', async () => {
  // Leitura: o da própria empresa sim, o de outra não
  await assertSucceeds(getDoc(doc(db('gestor'), 'usuarios/u-sol')))
  await assertFails(getDoc(doc(db('gestorE2'), 'usuarios/u-sol')))
  // Listar exige filtrar pelas empresas dele
  await assertFails(getDocs(collection(db('gestor'), 'usuarios')))
  await assertSucceeds(getDocs(query(collection(db('gestor'), 'usuarios'), where('empresas', 'array-contains-any', ['e1']))))
  await assertFails(getDocs(query(collection(db('gestorE2'), 'usuarios'), where('empresas', 'array-contains-any', ['e1']))))
  // Edição: o gestor de e2 não puxa para a empresa dele nem muda o perfil de quem é de e1
  await assertFails(updateDoc(doc(db('gestorE2'), 'usuarios/u-com'), { empresas: ['e2'] }))
  await assertFails(updateDoc(doc(db('gestorE2'), 'usuarios/u-com'), { perfil: 'gestor' }))
  // Quem também é de outra empresa só o supremo edita
  await assertFails(updateDoc(doc(db('gestor'), 'usuarios/u-multi'), { empresas: ['e1'] }))
  await assertSucceeds(updateDoc(doc(db('supremo'), 'usuarios/u-multi'), { empresas: ['e1'] }))
  await assertSucceeds(updateDoc(doc(db('gestor'), 'usuarios/u-com'), { perfil: 'aprovador' }))
})

test('o gestor só edita as empresas a que tem acesso', async () => {
  await assertFails(updateDoc(doc(db('gestorE2'), 'empresas/e1'), { nome: 'Tomada' }))
  await assertSucceeds(updateDoc(doc(db('gestor'), 'empresas/e1'), { nome: 'Empresa 1 S.A.' }))
  await assertSucceeds(updateDoc(doc(db('supremo'), 'empresas/e2'), { nome: 'Empresa 2 S.A.' }))
})

// ── Pedidos: cada passo com o seu perfil ───────────────────────
test('só quem aprova aprova, e sem mexer em outros campos', async () => {
  const aprovar = quem => ({ status: 'aprovado', aprovadoPor: conta[quem][0], aprovadoEm: new Date() })
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/emAprov'), aprovar('solicitante')))
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/emAprov'), aprovar('comprador')))
  await assertFails(updateDoc(doc(db('aprovador'), 'pedidos/emAprov'), { ...aprovar('aprovador'), valorFinal: 1 }))
  await assertSucceeds(updateDoc(doc(db('aprovador'), 'pedidos/emAprov'), aprovar('aprovador')))
})

test('quem abriu o pedido não aprova nem reprova o próprio pedido', async () => {
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/emAprovGes'), { status: 'aprovado', aprovadoPor: 'u-ges' }))
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/emAprovGes'), { status: 'reprovado', reprovadoPor: 'u-ges', motivoReprovacao: 'x' }))
  await assertSucceeds(updateDoc(doc(db('aprovador'), 'pedidos/emAprovGes'), { status: 'reprovado', reprovadoPor: 'u-apr', motivoReprovacao: 'x' }))
  // Outro pedido, que o gestor não abriu, ele aprova
  await assertSucceeds(updateDoc(doc(db('gestor'), 'pedidos/emAprov'), { status: 'aprovado', aprovadoPor: 'u-ges' }))
})

test('o comprador assume em nome próprio', async () => {
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-outro' }))
  await assertFails(updateDoc(doc(db('compradorE2'), 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-com2' }))
  await assertSucceeds(updateDoc(doc(db('comprador'), 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-com' }))
})

test('o recebimento é do comprador responsável ou de quem pediu', async () => {
  const receber = { status: 'entregue', dataEntrega: '2026-10-19' }
  await assertFails(updateDoc(doc(db('compradorB'), 'pedidos/comprado'), receber))
  await assertFails(updateDoc(doc(db('financeiro'), 'pedidos/comprado'), receber))
  await assertSucceeds(updateDoc(doc(db('comprador'), 'pedidos/comprado'), receber))
})

test('o solicitante confirma o recebimento do próprio pedido', async () => {
  await assertSucceeds(updateDoc(doc(db('solicitante'), 'pedidos/comprado'), { status: 'entregue', dataEntrega: '2026-10-19' }))
})

test('só o financeiro (ou gestor) confirma o pagamento', async () => {
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/entregue'), { status: 'pago' }))
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/entregue'), { status: 'pago' }))
  await assertSucceeds(updateDoc(doc(db('financeiro'), 'pedidos/entregue'), { status: 'pago' }))
})

test('separação de funções: quem cotou não decide; quem aprovou não compra nem paga', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    // O gestor assumiu este como comprador e aprovou os outros dois
    await setDoc(doc(f, 'pedidos/cotGes'), pedido({ status: 'em_aprovacao', compradorId: 'u-ges' }))
    await setDoc(doc(f, 'pedidos/aprovGes'), pedido({ status: 'aprovado', compradorId: 'u-com', aprovadoPor: 'u-ges' }))
    await setDoc(doc(f, 'pedidos/entrGes'), pedido({ status: 'entregue', compradorId: 'u-com', aprovadoPor: 'u-ges' }))
    await setDoc(doc(f, 'pedidos/entrGes/parcelas/x1'), {
      numero: 1, total: 1, valor: 100, vencimento: '2026-12-01', pago: false, pagoEm: null, comprovante: null,
    })
    // O supremo assumiu este: a mesma trava vale para ele
    await setDoc(doc(f, 'pedidos/cotSup'), pedido({ status: 'em_aprovacao', compradorId: 'u-sup' }))
  })
  // Quem cotou não aprova nem reprova; outro aprovador, sim
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/cotGes'), { status: 'aprovado', aprovadoPor: 'u-ges' }))
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/cotGes'), { status: 'reprovado', reprovadoPor: 'u-ges', motivoReprovacao: 'x' }))
  await assertSucceeds(updateDoc(doc(db('aprovador'), 'pedidos/cotGes'), { status: 'aprovado', aprovadoPor: 'u-apr' }))
  await assertFails(updateDoc(doc(db('supremo'), 'pedidos/cotSup'), { status: 'aprovado', aprovadoPor: 'u-sup' }))
  await assertSucceeds(updateDoc(doc(db('aprovador'), 'pedidos/cotSup'), { status: 'aprovado', aprovadoPor: 'u-apr' }))
  // Quem aprovou não registra a compra; o comprador responsável, sim
  const compra = {
    status: 'comprado', fornecedorId: 'f1', fornecedorNome: 'Fornecedor', valorFinal: 100,
    condicaoPagamento: 'avista', dataCompra: '2026-11-12',
  }
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/aprovGes'), compra))
  await assertSucceeds(updateDoc(doc(db('comprador'), 'pedidos/aprovGes'), compra))
  // Nem o pagamento: a parcela, o comprovante (no Firestore e no Storage) e a conclusão
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/entrGes/parcelas/x1'), { pago: true, pagoEm: new Date() }))
  const fg = db('gestor')
  const lote = writeBatch(fg)
  const entrada = doc(collection(fg, 'pedidos/entrGes/historico'))
  lote.update(doc(fg, 'pedidos/entrGes/parcelas/x1'), { comprovante: 'https://exemplo/recibo.pdf', comprovanteEventoId: entrada.id })
  lote.set(entrada, { tipo: 'comprovante', parcelaNumero: '1/1', autorId: 'u-ges', criadoEm: new Date() })
  await assertFails(lote.commit())
  const recibo = new Uint8Array([37, 80, 68, 70]) // "%PDF"
  const caminho = 'pedidos/entrGes/comprovantes/x1/recibo.pdf'
  await assertFails(uploadBytes(ref(st('gestor'), caminho), recibo, { contentType: 'application/pdf' }))
  await assertSucceeds(uploadBytes(ref(st('financeiro'), caminho), recibo, { contentType: 'application/pdf' }))
  await assertSucceeds(updateDoc(doc(db('financeiro'), 'pedidos/entrGes/parcelas/x1'), { pago: true, pagoEm: new Date() }))
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/entrGes'), { status: 'pago' }))
  await assertSucceeds(updateDoc(doc(db('financeiro'), 'pedidos/entrGes'), { status: 'pago' }))
})

test('o solicitante cancela o próprio pedido só antes da cotação', async () => {
  const cancelar = { status: 'cancelado', canceladoPor: 'u-sol', motivoCancelamento: 'Pedido duplicado' }
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/emAprov'), cancelar))
  await assertSucceeds(updateDoc(doc(db('solicitante'), 'pedidos/p1'), cancelar))
})

test('reprovar e cancelar exigem o motivo e, em "Outros", também o texto', async () => {
  const reprovar = extra => ({ status: 'reprovado', reprovadoPor: 'u-apr', ...extra })
  const a = db('aprovador')
  await assertFails(updateDoc(doc(a, 'pedidos/emAprov'), reprovar({})))
  await assertFails(updateDoc(doc(a, 'pedidos/emAprov'), reprovar({ motivoReprovacao: '   ' })))
  await assertFails(updateDoc(doc(a, 'pedidos/emAprov'), reprovar({ motivoReprovacao: 'Outros' })))
  await assertFails(updateDoc(doc(a, 'pedidos/emAprov'), reprovar({ motivoReprovacao: 'Outros', motivoReprovacaoOutros: ' ' })))
  await assertSucceeds(updateDoc(doc(a, 'pedidos/emAprov'), reprovar({ motivoReprovacao: 'Outros', motivoReprovacaoOutros: 'Fora do escopo do contrato' })))
  const cancelar = extra => ({ status: 'cancelado', canceladoPor: 'u-ges', ...extra })
  const g = db('gestor')
  await assertFails(updateDoc(doc(g, 'pedidos/cotando'), cancelar({})))
  await assertFails(updateDoc(doc(g, 'pedidos/cotando'), cancelar({ motivoCancelamento: 'Outros', motivoCancelamentoOutros: null })))
  await assertSucceeds(updateDoc(doc(g, 'pedidos/cotando'), cancelar({ motivoCancelamento: 'Compra não necessária' })))
})

test('o pedido reaberto traz a justificativa', async () => {
  const reaberto = extra => pedido({ reabertoDe: 'p9', reabertaDeNum: 'PRX-0009', ...extra })
  await assertFails(setDoc(doc(db('solicitante'), 'pedidos/reab1'), reaberto()))
  await assertFails(setDoc(doc(db('solicitante'), 'pedidos/reab2'), reaberto({ justificativaReabertura: '  ' })))
  await assertSucceeds(setDoc(doc(db('solicitante'), 'pedidos/reab3'), reaberto({ justificativaReabertura: 'Nova cotação com o valor revisto' })))
})

test('quem abre o pedido assina como solicitante', async () => {
  await assertSucceeds(setDoc(doc(db('solicitante'), 'pedidos/novo'), pedido()))
  await assertFails(setDoc(doc(db('solicitante'), 'pedidos/novo2'), pedido({ solicitanteId: 'u-outro' })))
  await assertFails(setDoc(doc(db('solicitante'), 'pedidos/novo3'), pedido({ status: 'aprovado' })))
  await assertFails(setDoc(doc(db('semPerfil'), 'pedidos/novo4'), pedido()))
})

test('a mudança de status e a entrada do histórico gravam juntas, num lote', async () => {
  const f = db('comprador')
  const lote = writeBatch(f)
  lote.update(doc(f, 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-com' })
  lote.set(doc(collection(f, 'pedidos/p1/historico')), { status: 'ag_cotacao', autorId: 'u-com' })
  await assertSucceeds(lote.commit())
  // Se a entrada do histórico é recusada, o status também não muda (o resto
  // do lote, com a cotação indicada, estaria certo)
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'pedidos/cotando/cotacoes/q1'), { valor: 10, fornecedorNome: 'Fornecedor', indicada: false })
  })
  const f2 = db('comprador')
  const lote2 = writeBatch(f2)
  lote2.update(doc(f2, 'pedidos/cotando/cotacoes/q1'), { indicada: true })
  lote2.update(doc(f2, 'pedidos/cotando'), { status: 'em_aprovacao', cotacaoIndicadaId: 'q1' })
  lote2.set(doc(collection(f2, 'pedidos/cotando/historico')), { status: 'em_aprovacao', autorId: 'u-outro' })
  await assertFails(lote2.commit())
  await env.withSecurityRulesDisabled(async ctx => {
    const snap = await getDoc(doc(ctx.firestore(), 'pedidos/cotando'))
    if (snap.data().status !== 'ag_cotacao') throw new Error('o status mudou sem o histórico')
  })
})

test('data fora do formato é recusada, até para a conta demo', async () => {
  const xss = '2026-01-<img src=x onerror=alert(1)>'
  await assertFails(setDoc(doc(db('demo'), 'pedidos/demo-xss'), pedidoDemo({ dataNecessaria: xss })))
  await assertFails(updateDoc(doc(db('demo'), 'pedidos/demo-0001'), { dataNecessaria: xss }))
  await assertSucceeds(updateDoc(doc(db('demo'), 'pedidos/demo-0001'), { dataNecessaria: '2026-12-01' }))
})

test('só a demo apaga, e só pedidos dela', async () => {
  await assertFails(deleteDoc(doc(db('gestor'), 'pedidos/p1')))
  await assertFails(deleteDoc(doc(db('supremo'), 'pedidos/p1')))
  await assertFails(deleteDoc(doc(db('demo'), 'pedidos/p1')))
  await assertSucceeds(deleteDoc(doc(db('demo'), 'pedidos/demo-0001')))
})

test('um pedido real não vira demo: marcar e depois apagar não passa', async () => {
  // Ninguém marca um pedido real como demo, nem o supremo
  await assertFails(updateDoc(doc(db('supremo'), 'pedidos/p1'), { isDemo: true }))
  await assertFails(updateDoc(doc(db('gestor'), 'pedidos/p1'), { isDemo: true, titulo: 'Notebook' }))
  await assertFails(updateDoc(doc(db('demo'), 'pedidos/p1'), { isDemo: true }))
  await assertFails(deleteDoc(doc(db('demo'), 'pedidos/p1')))
  // Nem desmarca um da demo, nem cria um pedido real já marcado ou com ID da demo
  await assertFails(updateDoc(doc(db('demo'), 'pedidos/demo-0001'), { isDemo: false }))
  await assertFails(updateDoc(doc(db('supremo'), 'pedidos/demo-0001'), { isDemo: false }))
  await assertFails(setDoc(doc(db('solicitante'), 'pedidos/novo'), pedido({ isDemo: true })))
  await assertFails(setDoc(doc(db('supremo'), 'pedidos/demo-9999'), pedido()))
  await env.withSecurityRulesDisabled(async ctx => {
    const snap = await getDoc(doc(ctx.firestore(), 'pedidos/p1'))
    if (!snap.exists() || snap.data().isDemo) throw new Error('o pedido real foi marcado ou apagado')
  })
})

// Cotação nova, como o app grava: no mesmo lote, a entrada do histórico com o
// mesmo ID da cotação
const cotar = (quem, uid, { pedidoId = 'cotando', historico = true, tipo = 'cotacao' } = {}) => {
  const f = db(quem)
  const lote = writeBatch(f)
  const cotacao = doc(collection(f, `pedidos/${pedidoId}/cotacoes`))
  lote.set(cotacao, { valor: 10, fornecedorNome: 'Fornecedor', indicada: false, compradorId: uid })
  if (historico) {
    lote.set(doc(f, `pedidos/${pedidoId}/historico/${cotacao.id}`), {
      tipo, fornecedorNome: 'Fornecedor', valor: 10, autorId: uid, criadoEm: new Date(),
    })
  }
  return lote.commit()
}

test('cotação só pelo comprador responsável, da empresa do pedido', async () => {
  await assertFails(cotar('compradorE2', 'u-com2'))
  await assertFails(cotar('solicitante', 'u-sol'))
  // Outro comprador da mesma empresa, que não assumiu o pedido, não cota
  await assertFails(cotar('compradorB', 'u-com3'))
  await assertSucceeds(cotar('comprador', 'u-com'))
  await assertSucceeds(cotar('gestor', 'u-ges'))
})

test('para ir a "Em aprovação", o pedido aponta a cotação indicada; depois, as propostas não mudam', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'pedidos/cotando/cotacoes/q1'), { valor: 10, fornecedorNome: 'Fornecedor', indicada: false })
    await setDoc(doc(f, 'pedidos/cotando/cotacoes/q2'), { valor: 12, fornecedorNome: 'Outro', indicada: false })
  })
  // Como o app grava: marca a cotação, aponta no pedido e registra no histórico
  const indicar = ({ cotacaoId = 'q1', marcar = true, apontar = true } = {}) => {
    const f = db('comprador')
    const lote = writeBatch(f)
    if (marcar) lote.update(doc(f, 'pedidos/cotando/cotacoes/q1'), { indicada: true })
    lote.update(doc(f, 'pedidos/cotando'), apontar ? { status: 'em_aprovacao', cotacaoIndicadaId: cotacaoId } : { status: 'em_aprovacao' })
    lote.set(doc(collection(f, 'pedidos/cotando/historico')), { status: 'em_aprovacao', autorId: 'u-com', criadoEm: new Date() })
    return lote.commit()
  }
  await assertFails(indicar({ apontar: false }))
  await assertFails(indicar({ cotacaoId: 'nao-existe' }))
  await assertFails(indicar({ marcar: false }))
  // Na cotação, a indicação muda só a marca, e o gestor ainda apaga uma proposta
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/cotando/cotacoes/q1'), { valor: 1 }))
  await assertSucceeds(deleteDoc(doc(db('gestor'), 'pedidos/cotando/cotacoes/q2')))
  await assertSucceeds(indicar())
  // Em aprovação, nada muda nas propostas: nem a marca, nem uma nova, nem apagar
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/cotando/cotacoes/q1'), { indicada: false }))
  await assertFails(cotar('comprador', 'u-com'))
  await assertFails(deleteDoc(doc(db('gestor'), 'pedidos/cotando/cotacoes/q1')))
  // Nem o arquivo de uma proposta, no Storage
  await assertFails(uploadBytes(ref(st('comprador'), 'pedidos/cotando/cotacoes/q3/proposta.pdf'),
    new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' }))
  // E a cotação indicada fica no pedido
  await env.withSecurityRulesDisabled(async ctx => {
    const snap = await getDoc(doc(ctx.firestore(), 'pedidos/cotando'))
    if (snap.data().cotacaoIndicadaId !== 'q1') throw new Error('o pedido não guardou a cotação indicada')
  })
})

test('o supremo segue as etapas e as travas, como um gestor de todas as empresas', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'pedidos/supAbriu'), pedido({ status: 'em_aprovacao', compradorId: 'u-com', solicitanteId: 'u-sup' }))
    await setDoc(doc(f, 'pedidos/supAprovou'), pedido({ status: 'entregue', compradorId: 'u-com', aprovadoPor: 'u-sup' }))
    await setDoc(doc(f, 'pedidos/supAprovou/parcelas/x1'), {
      numero: 1, total: 1, valor: 100, vencimento: '2026-12-01', pago: false, pagoEm: null, comprovante: null,
    })
  })
  const s = db('supremo')
  // Não pula etapas, não cria pedido já adiantado nem muda campos à vontade
  await assertFails(updateDoc(doc(s, 'pedidos/p1'), { status: 'aprovado', aprovadoPor: 'u-sup' }))
  await assertFails(updateDoc(doc(s, 'pedidos/p1'), { valorFinal: 1 }))
  await assertFails(setDoc(doc(s, 'pedidos/supNovo'), pedido({ status: 'aprovado', solicitanteId: 'u-sup' })))
  // Abre pedido em qualquer empresa, em "Solicitado"
  await assertSucceeds(setDoc(doc(s, 'pedidos/supNovo2'), pedido({ empresaId: 'e2', solicitanteId: 'u-sup' })))
  // Não decide o que abriu; aprova o que não abriu nem cotou
  await assertFails(updateDoc(doc(s, 'pedidos/supAbriu'), { status: 'aprovado', aprovadoPor: 'u-sup' }))
  await assertSucceeds(updateDoc(doc(s, 'pedidos/emAprov'), { status: 'aprovado', aprovadoPor: 'u-sup' }))
  // Não registra o pagamento do que aprovou, nem no Storage
  await assertFails(updateDoc(doc(s, 'pedidos/supAprovou/parcelas/x1'), { pago: true, pagoEm: new Date() }))
  await assertFails(updateDoc(doc(s, 'pedidos/supAprovou'), { status: 'pago' }))
  await assertFails(uploadBytes(ref(st('supremo'), 'pedidos/supAprovou/comprovantes/x1/recibo.pdf'),
    new Uint8Array([37, 80, 68, 70]), { contentType: 'application/pdf' }))
  // Grava com a entrada do histórico e assina com o próprio UID
  await assertFails(cotar('supremo', 'u-sup', { historico: false }))
  await assertFails(addDoc(collection(s, 'pedidos/p1/historico'), { status: 'x', autorId: 'u-sol' }))
  await assertFails(addDoc(collection(s, 'pedidos/p1/comentarios'), { texto: 'oi', autorId: 'u-sol' }))
  await assertSucceeds(cotar('supremo', 'u-sup'))
  // E continua administrando os cadastros
  await assertSucceeds(updateDoc(doc(s, 'empresas/e2'), { nome: 'Empresa 2 Ltda.' }))
})

test('comentário e histórico assinados por quem escreve', async () => {
  await assertFails(addDoc(collection(db('comprador'), 'pedidos/p1/comentarios'), { texto: 'oi', autorId: 'u-sol' }))
  await assertSucceeds(addDoc(collection(db('comprador'), 'pedidos/p1/comentarios'), { texto: 'oi', autorId: 'u-com' }))
  await assertFails(addDoc(collection(db('compradorE2'), 'pedidos/p1/historico'), { status: 'x', autorId: 'u-com2' }))
})

test('comentário: só o texto muda, e só dentro da empresa do pedido', async () => {
  // O gestor de outra empresa não edita nem apaga
  await assertFails(updateDoc(doc(db('gestorE2'), 'pedidos/p1/comentarios/c1'), { texto: 'trocado' }))
  await assertFails(deleteDoc(doc(db('gestorE2'), 'pedidos/p1/comentarios/c1')))
  // O autor muda o texto, mas não a assinatura nem a data
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/p1/comentarios/c1'), { autorId: 'u-sol' }))
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/p1/comentarios/c1'), { criadoEm: new Date() }))
  await assertSucceeds(updateDoc(doc(db('comprador'), 'pedidos/p1/comentarios/c1'), { texto: 'oi, corrigido', editadoEm: new Date() }))
  // Quem não é autor nem gestor não edita
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/p1/comentarios/c1'), { texto: 'meu agora' }))
  // O gestor da empresa apaga
  await assertSucceeds(deleteDoc(doc(db('gestor'), 'pedidos/p1/comentarios/c1')))
})

// ── Nada muda sem registro: o histórico no mesmo lote ──────────
// Edição do pedido, cotação, anexo e comprovante só passam com a entrada do
// histórico gravada no mesmo lote, do tipo certo e assinada por quem grava
test('a edição do pedido só passa com o histórico no mesmo lote', async () => {
  const editar = (quem, uid, { historico = true, tipo = 'edicao', entradaId } = {}) => {
    const f = db(quem)
    const lote = writeBatch(f)
    const entrada = entradaId ? doc(f, `pedidos/p1/historico/${entradaId}`) : doc(collection(f, 'pedidos/p1/historico'))
    lote.update(doc(f, 'pedidos/p1'), { titulo: 'Notebook 16 GB', ultimaEdicaoId: entrada.id, atualizadoEm: new Date() })
    if (historico) {
      lote.set(entrada, {
        tipo, campo: 'titulo', valorAnterior: 'Notebook', valorNovo: 'Notebook 16 GB', autorId: uid, criadoEm: new Date(),
      })
    }
    return lote.commit()
  }
  // Sem a entrada ou com outro tipo: negado
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/p1'), { titulo: 'Notebook 16 GB', atualizadoEm: new Date() }))
  await assertFails(editar('solicitante', 'u-sol', { historico: false }))
  await assertFails(editar('solicitante', 'u-sol', { tipo: 'cotacao' }))
  // Apontar para uma entrada que já existia não vale: ela nasce no mesmo lote
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'pedidos/p1/historico/antiga'), { tipo: 'edicao', autorId: 'u-sol', criadoEm: new Date() })
  })
  await assertFails(editar('solicitante', 'u-sol', { historico: false, entradaId: 'antiga' }))
  // Com a entrada no lote, passa: quem pediu (em Solicitado) e o gestor
  await assertSucceeds(editar('solicitante', 'u-sol'))
  await assertSucceeds(editar('gestor', 'u-ges'))
})

test('a cotação nova só passa com o histórico de mesmo ID no mesmo lote', async () => {
  await assertFails(addDoc(collection(db('comprador'), 'pedidos/cotando/cotacoes'), { valor: 10 }))
  await assertFails(cotar('comprador', 'u-com', { historico: false }))
  await assertFails(cotar('comprador', 'u-com', { tipo: 'anexo' }))
  await assertSucceeds(cotar('comprador', 'u-com'))
})

test('o anexo só passa com o histórico de mesmo ID; apaga quem anexou ou o gestor da empresa', async () => {
  const anexar = (quem, uid, { historico = true, tipo = 'anexo' } = {}) => {
    const f = db(quem)
    const lote = writeBatch(f)
    const anexo = doc(collection(f, 'pedidos/p1/anexos'))
    lote.set(anexo, { nome: 'nota.pdf', autorId: uid, criadoEm: new Date() })
    if (historico) {
      lote.set(doc(f, `pedidos/p1/historico/${anexo.id}`), { tipo, nomeArquivo: 'nota.pdf', autorId: uid, criadoEm: new Date() })
    }
    return lote.commit()
  }
  await assertFails(addDoc(collection(db('comprador'), 'pedidos/p1/anexos'), { nome: 'nota.pdf', autorId: 'u-com' }))
  await assertFails(anexar('comprador', 'u-com', { historico: false }))
  await assertFails(anexar('comprador', 'u-com', { tipo: 'cotacao' }))
  await assertFails(anexar('compradorE2', 'u-com2'))
  await assertSucceeds(anexar('comprador', 'u-com'))
  await assertSucceeds(anexar('solicitante', 'u-sol'))
  // Apagar: quem anexou ou um gestor da empresa do pedido, não o de outra.
  // Quem anexou e depois perdeu o acesso ao pedido (u-com2, só da e2) não
  // apaga mais
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'pedidos/p1/anexos/a1'), { nome: 'nota.pdf', autorId: 'u-com', criadoEm: new Date() })
    await setDoc(doc(f, 'pedidos/p1/anexos/a2'), { nome: 'nota.pdf', autorId: 'u-com', criadoEm: new Date() })
    await setDoc(doc(f, 'pedidos/p1/anexos/a3'), { nome: 'nota.pdf', autorId: 'u-com2', criadoEm: new Date() })
  })
  await assertFails(deleteDoc(doc(db('gestorE2'), 'pedidos/p1/anexos/a1')))
  await assertFails(deleteDoc(doc(db('solicitante'), 'pedidos/p1/anexos/a1')))
  await assertSucceeds(deleteDoc(doc(db('gestor'), 'pedidos/p1/anexos/a1')))
  await assertSucceeds(deleteDoc(doc(db('comprador'), 'pedidos/p1/anexos/a2')))
  await assertFails(deleteDoc(doc(db('compradorE2'), 'pedidos/p1/anexos/a3')))
})

test('o comprovante só passa com o histórico no mesmo lote; o pagamento segue igual', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'pedidos/entregue/parcelas/x1'), {
      numero: 1, total: 1, valor: 100, vencimento: '2026-12-01', pago: false, pagoEm: null, comprovante: null,
    })
  })
  const comprovar = (quem, uid, { historico = true, tipo = 'comprovante', apontar = true } = {}) => {
    const f = db(quem)
    const lote = writeBatch(f)
    const entrada = doc(collection(f, 'pedidos/entregue/historico'))
    lote.update(doc(f, 'pedidos/entregue/parcelas/x1'), apontar
      ? { comprovante: 'https://exemplo/recibo.pdf', comprovanteEventoId: entrada.id }
      : { comprovante: 'https://exemplo/recibo.pdf' })
    if (historico) lote.set(entrada, { tipo, parcelaNumero: '1/1', autorId: uid, criadoEm: new Date() })
    return lote.commit()
  }
  await assertFails(comprovar('financeiro', 'u-fin', { historico: false }))
  await assertFails(comprovar('financeiro', 'u-fin', { apontar: false }))
  await assertFails(comprovar('financeiro', 'u-fin', { tipo: 'anexo' }))
  await assertFails(comprovar('comprador', 'u-com'))
  await assertSucceeds(comprovar('financeiro', 'u-fin'))
  // Registrar o pagamento continua sem entrada própria: só pago e pagoEm
  await assertSucceeds(updateDoc(doc(db('financeiro'), 'pedidos/entregue/parcelas/x1'), { pago: true, pagoEm: new Date() }))
  await assertFails(updateDoc(doc(db('financeiro'), 'pedidos/entregue/parcelas/x1'), { valor: 1 }))
})

// ── Conta demo: só a área da demonstração ──────────────────────
test('a conta demo não lê nem grava dados reais', async () => {
  const d = db('demo')
  await assertFails(getDoc(doc(d, 'pedidos/p1')))
  await assertFails(getDocs(collection(d, 'pedidos')))
  await assertFails(updateDoc(doc(d, 'pedidos/p1'), { titulo: 'Vandalizado' }))
  await assertFails(setDoc(doc(d, 'pedidos/qualquer'), pedidoDemo()))
  await assertFails(getDoc(doc(d, 'empresas/e1')))
  await assertFails(updateDoc(doc(d, 'empresas/e1'), { nome: 'Vandalizada', isDemo: true }))
  await assertFails(deleteDoc(doc(d, 'empresas/demo-nexara')))
  await assertFails(updateDoc(doc(d, 'categorias/cat1'), { nome: 'X', isDemo: true }))
  await assertFails(setDoc(doc(d, 'categorias/nova'), { nome: 'Sem marca' }))
  await assertFails(deleteDoc(doc(d, 'fornecedores/f1')))
  await assertFails(getDoc(doc(d, 'usuarios/u-sol')))
  await assertFails(getDocs(collection(d, 'usuarios')))
  await assertFails(setDoc(doc(d, 'usuarios/u-novo'), { nome: 'Invasor', perfil: 'supremo', empresas: ['e1'], isDemo: true }))
  await assertFails(updateDoc(doc(d, 'usuarios/u-sol'), { perfil: 'supremo' }))
  await assertFails(getDoc(doc(d, '_meta/contadores')))
  await assertFails(setDoc(doc(d, '_meta/contadores'), { totalPedidos: 1 }))
  await assertFails(addDoc(collection(d, 'pedidos/p1/comentarios'), { texto: 'oi', autorId: 'u-demo' }))
  await assertFails(getDocs(collection(d, 'pedidos/p1/historico')))
  await assertFails(addDoc(collection(d, 'notificacoes/u-sol/items'), { evento: 'mencao_comentario', lida: false }))
})

test('a conta demo não cria um perfil que vale como permissão', async () => {
  const d = db('demo')
  // O próprio perfil nasce como 'demo' (as regras ignoram o que estiver nele)
  await assertFails(setDoc(doc(d, 'usuarios/u-demo'), { nome: 'Demo', email: 'demo@praxis.app', perfil: 'supremo' }))
  await assertSucceeds(setDoc(doc(d, 'usuarios/u-demo'), { nome: 'Demo', email: 'demo@praxis.app', perfil: 'demo' }))
  await assertFails(updateDoc(doc(d, 'usuarios/u-demo'), { perfil: 'supremo' }))
  await assertSucceeds(updateDoc(doc(d, 'usuarios/u-demo'), { empresas: ['demo-nexara'] }))
  // As pessoas da demo têm ID "demo-…" e a marca isDemo
  await assertFails(setDoc(doc(d, 'usuarios/demo-nova'), { nome: 'Sem marca', perfil: 'comprador' }))
  await assertSucceeds(setDoc(doc(d, 'usuarios/demo-nova'), { nome: 'Pessoa', perfil: 'comprador', isDemo: true }))
})

test('a conta demo trabalha com o que é da demonstração', async () => {
  const d = db('demo')
  // Lê com o filtro da demo
  await assertSucceeds(getDocs(query(collection(d, 'pedidos'), where('isDemo', '==', true))))
  await assertSucceeds(getDocs(query(collection(d, 'empresas'), where('isDemo', '==', true))))
  await assertSucceeds(getDocs(query(collection(d, 'usuarios'), where('isDemo', '==', true))))
  await assertSucceeds(getDocs(query(collection(d, 'usuarios'), where('email', '==', 'demo@praxis.app'))))
  await assertSucceeds(getDoc(doc(d, 'pedidos/demo-0001')))
  // Abre pedido com ID da demo, marcado, e numera pelo contador da demo
  await assertSucceeds(setDoc(doc(d, 'pedidos/demo-abc'), pedidoDemo()))
  await assertSucceeds(setDoc(doc(d, '_meta/contadoresDemo'), { totalPedidos: 35 }))
  // Move o pedido pelas etapas e grava as subcoleções, em lote
  const lote = writeBatch(d)
  lote.update(doc(d, 'pedidos/demo-0001'), { status: 'ag_cotacao', compradorId: 'demo-comprador' })
  lote.set(doc(collection(d, 'pedidos/demo-0001/historico')), { status: 'ag_cotacao', autorId: 'demo-comprador' })
  lote.set(doc(collection(d, 'pedidos/demo-0001/cotacoes')), { valor: 10 })
  lote.set(doc(collection(d, 'pedidos/demo-0001/comentarios')), { texto: 'oi', autorId: 'demo-gestor' })
  lote.set(doc(collection(d, 'pedidos/demo-0001/parcelas')), { numero: 1, total: 1, valor: 10 })
  await assertSucceeds(lote.commit())
  // Cadastros da demo e avisos das pessoas da demo
  await assertSucceeds(setDoc(doc(d, 'empresas/demo-nova'), { nome: 'Nova', isDemo: true }))
  await assertSucceeds(updateDoc(doc(d, 'empresas/demo-nexara'), { nome: 'Nexara', isDemo: true }))
  await assertSucceeds(setDoc(doc(d, 'categorias/demo-ti'), { nome: 'TI', isDemo: true }))
  await assertSucceeds(addDoc(collection(d, 'fornecedores'), { nome: 'novo', isDemo: true }))
  await assertSucceeds(addDoc(collection(d, 'notificacoes/demo-financeiro/items'), { evento: 'parcela_vencida', lida: false }))
  // E apaga na renovação: os perfis antigos da própria conta, não os outros
  await assertSucceeds(deleteDoc(doc(d, 'usuarios/u-demo-antigo')))
  await assertFails(deleteDoc(doc(d, 'usuarios/demo-gestor')))
})

// ── Metadados ──────────────────────────────────────────────────
test('o contador do número do pedido só anda de um em um', async () => {
  await assertSucceeds(setDoc(doc(db('comprador'), '_meta/contadores'), { totalPedidos: 6 }))
  await assertFails(setDoc(doc(db('comprador'), '_meta/contadores'), { totalPedidos: 99 }))
  await assertFails(setDoc(doc(db('semPerfil'), '_meta/contadores'), { totalPedidos: 6 }))
})

test('só a conta demo mexe na trava da renovação', async () => {
  await assertFails(setDoc(doc(db('gestor'), '_meta/demo'), { travadoAte: 9e15 }))
  await assertFails(setDoc(doc(db('semPerfil'), '_meta/demo'), { dia: '2099-01-01' }))
  await assertFails(setDoc(doc(db('supremo'), '_meta/contadoresDemo'), { totalPedidos: 1 }))
  await assertSucceeds(setDoc(doc(db('demo'), '_meta/demo'), { travadoAte: 0 }, { merge: true }))
})

// ── Notificações ───────────────────────────────────────────────
test('ninguém cria aviso falso para outra pessoa', async () => {
  const mencao = autorId => ({
    evento: 'mencao_comentario', titulo: 'Você foi mencionado', corpo: 'x', pedidoId: 'p1', lida: false, autorId,
  })
  await assertFails(addDoc(collection(db('comprador'), 'notificacoes/u-sol/items'), { ...mencao('u-com'), evento: 'pedido_aprovado' }))
  await assertFails(addDoc(collection(db('comprador'), 'notificacoes/u-sol/items'), mencao('u-sup')))
  await assertFails(addDoc(collection(db('semPerfil'), 'notificacoes/u-sol/items'), mencao('u-x')))
  await assertSucceeds(addDoc(collection(db('comprador'), 'notificacoes/u-sol/items'), mencao('u-com')))
  // A demo grava os avisos das pessoas da demonstração
  await assertSucceeds(addDoc(collection(db('demo'), 'notificacoes/demo-financeiro/items'), { evento: 'parcela_vencida', lida: false }))
  await assertFails(addDoc(collection(db('demo'), 'notificacoes/u-sol/items'), { evento: 'parcela_vencida', lida: false }))
})

// ── Compra num lote só ─────────────────────────────────────────
// A tela aceita até 60 parcelas; fornecedor, pedido, histórico e parcelas vão
// juntos, e as regras precisam caber no limite de leituras de um lote
test('a compra grava fornecedor, pedido, histórico e 60 parcelas num lote só', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'pedidos/aprov1'), pedido({ status: 'aprovado', compradorId: 'u-com' }))
    await setDoc(doc(ctx.firestore(), 'pedidos/aprov2'), pedido({ status: 'aprovado', compradorId: 'u-doc' }))
  })
  const compra = (quem, uid, id, n) => {
    const f = db(quem)
    const lote = writeBatch(f)
    lote.update(doc(f, 'fornecedores/f1'), { usos: increment(1) })
    lote.update(doc(f, `pedidos/${id}`), {
      status: 'comprado', fornecedorId: 'f1', fornecedorNome: 'Fornecedor', valorFinal: 1000,
      condicaoPagamento: 'parcelado', dataCompra: '2026-11-12', atualizadoEm: new Date(),
    })
    lote.set(doc(collection(f, `pedidos/${id}/historico`)), { status: 'comprado', autorId: uid, nota: 'Compra', criadoEm: new Date() })
    for (let i = 0; i < n; i++) {
      lote.set(doc(collection(f, `pedidos/${id}/parcelas`)), {
        numero: i + 1, total: n, valor: 16.66, vencimento: '2026-12-12', pago: false, pagoEm: null, comprovante: null,
      })
    }
    return lote.commit()
  }
  await assertSucceeds(compra('comprador', 'u-com', 'aprov1', 60))
  // Sem claims, o perfil vem do documento, também dentro do lote
  await assertSucceeds(compra('semClaims', 'u-doc', 'aprov2', 60))
})

// ── Perfil sem custom claims (plano gratuito) ──────────────────
test('sem claims, o perfil e as empresas vêm do documento do usuário', async () => {
  await assertSucceeds(getDoc(doc(db('semClaims'), 'pedidos/p1')))
  await assertFails(getDoc(doc(db('semClaims'), 'pedidos/p2')))
  await assertSucceeds(getDocs(query(collection(db('semClaims'), 'pedidos'), where('empresaId', 'in', ['e1']))))
  await assertFails(getDocs(query(collection(db('semClaims'), 'pedidos'), where('empresaId', 'in', ['e1', 'e2']))))
  // Age como o comprador que o documento diz que é, e só como ele
  await assertSucceeds(updateDoc(doc(db('semClaims'), 'pedidos/p1'), {
    status: 'ag_cotacao', compradorId: 'u-doc', compradorNome: 'Doc', compradorAssumiuEm: new Date(), atualizadoEm: new Date(),
  }))
  await assertFails(updateDoc(doc(db('semClaims'), 'pedidos/emAprov'), {
    status: 'aprovado', aprovadoPor: 'u-doc', aprovadoPorNome: 'Doc', aprovadoEm: new Date(), atualizadoEm: new Date(),
  }))
  // E não muda o próprio perfil nem as próprias empresas
  await assertFails(updateDoc(doc(db('semClaims'), 'usuarios/u-doc'), { perfil: 'gestor' }))
  await assertFails(updateDoc(doc(db('semClaims'), 'usuarios/u-doc'), { empresas: ['e1', 'e2'] }))
})

test('usuário inativo fica sem perfil, mesmo com o documento', async () => {
  await assertFails(getDoc(doc(db('inativo'), 'pedidos/p1')))
  await assertFails(getDoc(doc(db('inativo'), 'empresas/e1')))
  await assertFails(setDoc(doc(db('inativo'), 'usuarios/novo2'), { nome: 'N', perfil: 'comprador', empresas: ['e1'] }))
})

// Sem claims, cada consulta ao perfil lê o documento da pessoa, e as regras
// do pedido testam os passos em ordem: os do fim da lista (pagar, cancelar,
// editar, reabrir) precisam caber no limite de 1000 expressões por avaliação
test('sem claims, cada passo do pedido cabe no limite das regras', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const f = ctx.firestore()
    await setDoc(doc(f, 'usuarios/u-gdoc'), { nome: 'Gdoc', email: 'gdoc@x.com', perfil: 'gestor', empresas: ['e1'], ativo: true })
    await setDoc(doc(f, 'pedidos/cotDoc'), pedido({ status: 'ag_cotacao', compradorId: 'u-doc' }))
    await setDoc(doc(f, 'pedidos/cotDoc/cotacoes/q1'), { valor: 10, fornecedorNome: 'Fornecedor', indicada: false })
    await setDoc(doc(f, 'pedidos/reprov'), pedido({ status: 'reprovado', compradorId: 'u-com', reprovadoPor: 'u-apr' }))
  })
  // Indicar a cotação (lote com a cotação, o pedido e o histórico)
  const c = db('semClaims')
  const lote = writeBatch(c)
  lote.update(doc(c, 'pedidos/cotDoc/cotacoes/q1'), { indicada: true })
  lote.update(doc(c, 'pedidos/cotDoc'), { status: 'em_aprovacao', cotacaoIndicadaId: 'q1' })
  lote.set(doc(collection(c, 'pedidos/cotDoc/historico')), { status: 'em_aprovacao', autorId: 'u-doc', criadoEm: new Date() })
  await assertSucceeds(lote.commit())
  const g = db('gestorSemClaims')
  // Aprovar, pagar e cancelar
  await assertSucceeds(updateDoc(doc(g, 'pedidos/cotDoc'), { status: 'aprovado', aprovadoPor: 'u-gdoc' }))
  await assertSucceeds(updateDoc(doc(g, 'pedidos/entregue'), { status: 'pago' }))
  await assertSucceeds(updateDoc(doc(g, 'pedidos/cotando'), { status: 'cancelado', canceladoPor: 'u-gdoc', motivoCancelamento: 'Erro no pedido' }))
  // Editar, com a entrada do histórico no mesmo lote
  const ed = writeBatch(g)
  const entrada = doc(collection(g, 'pedidos/p1/historico'))
  ed.update(doc(g, 'pedidos/p1'), { titulo: 'Notebook 16 GB', ultimaEdicaoId: entrada.id, atualizadoEm: new Date() })
  ed.set(entrada, { tipo: 'edicao', campo: 'titulo', autorId: 'u-gdoc', criadoEm: new Date() })
  await assertSucceeds(ed.commit())
  // Reabrir, como o app faz: o pedido novo, o reprovado ligado a ele e o contador
  const re = writeBatch(g)
  re.set(doc(g, 'pedidos/reaberto'), pedido({ reabertoDe: 'reprov', reabertaDeNum: 'PRX-0001', justificativaReabertura: 'Valor revisto' }))
  re.update(doc(g, 'pedidos/reprov'), { reabertoPara: 'reaberto', reabertaParaNum: 'PRX-0006', atualizadoEm: new Date() })
  re.set(doc(g, '_meta/contadores'), { totalPedidos: 6 })
  await assertSucceeds(re.commit())
})

// ── Convites ───────────────────────────────────────────────────
test('o gestor convida só para as empresas dele, sem supremo e com prazo', async () => {
  await assertSucceeds(setDoc(doc(db('gestor'), 'convites/novo@x.com'), convite()))
  await assertFails(setDoc(doc(db('gestor'), 'convites/outro@x.com'), convite({ email: 'outro@x.com', empresas: ['e2'] })))
  await assertFails(setDoc(doc(db('gestor'), 'convites/outro@x.com'), convite({ email: 'outro@x.com', perfil: 'supremo' })))
  await assertFails(setDoc(doc(db('gestor'), 'convites/outro@x.com'), convite({ email: 'outro@x.com', expiraEm: daqui(90) })))
  await assertFails(setDoc(doc(db('gestor'), 'convites/Outro@x.com'), convite({ email: 'Outro@x.com' })))
  await assertFails(setDoc(doc(db('gestor'), 'convites/outro@x.com'), convite({ email: 'outro@x.com', criadoPor: 'u-sup' })))
  await assertFails(setDoc(doc(db('comprador'), 'convites/outro@x.com'), convite({ email: 'outro@x.com', criadoPor: 'u-com' })))
  await assertFails(setDoc(doc(db('demo'), 'convites/outro@x.com'), convite({ email: 'outro@x.com', criadoPor: 'u-demo' })))
  // Listar exige filtrar pelas empresas; o gestor de outra empresa não lê
  await assertSucceeds(getDocs(query(collection(db('gestor'), 'convites'), where('empresas', 'array-contains-any', ['e1']))))
  await assertFails(getDocs(collection(db('gestor'), 'convites')))
  await assertFails(getDoc(doc(db('gestorE2'), 'convites/convidado@x.com')))
  await assertFails(deleteDoc(doc(db('gestorE2'), 'convites/convidado@x.com')))
  await assertSucceeds(deleteDoc(doc(db('gestor'), 'convites/novo@x.com')))
})

test('no primeiro acesso, o convidado cria o próprio perfil igual ao convite', async () => {
  const aceite = (quem, uid, email, mudar = {}) => {
    const f = db(quem)
    const lote = writeBatch(f)
    lote.set(doc(f, `usuarios/${uid}`), {
      nome: 'Convidado', email, perfil: 'comprador', empresas: ['e1'], ativo: true,
      convidadoPor: 'u-ges', criadoEm: new Date(), ultimoAcesso: null, ...mudar,
    })
    lote.delete(doc(f, `convites/${email}`))
    return lote.commit()
  }
  // Quem não foi convidado não lê nem usa o convite de outra pessoa
  await assertFails(getDoc(doc(db('intruso'), 'convites/convidado@x.com')))
  await assertFails(aceite('intruso', 'u-intr', 'convidado@x.com'))
  // O convidado não muda o que o convite diz, e convite vencido não vale
  await assertFails(aceite('convidado', 'u-conv', 'convidado@x.com', { perfil: 'gestor' }))
  await assertFails(aceite('convidado', 'u-conv', 'convidado@x.com', { empresas: ['e1', 'e2'] }))
  await assertFails(aceite('convidadoVelho', 'u-velho', 'velho@x.com'))
  // Lê o próprio convite e cria o perfil a partir dele, apagando o convite
  await assertSucceeds(getDoc(doc(db('convidado'), 'convites/convidado@x.com')))
  await assertSucceeds(aceite('convidado', 'u-conv', 'convidado@x.com'))
  // A partir daí, o perfil vale: lê os pedidos da empresa do convite
  await assertSucceeds(getDoc(doc(db('convidado'), 'pedidos/p1')))
  await assertFails(getDoc(doc(db('convidado'), 'pedidos/p2')))
})

// ── Storage ────────────────────────────────────────────────────
const pdf = new Uint8Array([37, 80, 68, 70]) // "%PDF"

test('anexo: assinado por quem envia, apagado por ele ou por um gestor', async () => {
  const caminho = 'pedidos/p1/anexos/1_nota.pdf'
  await assertFails(uploadBytes(ref(st('semPerfil'), caminho), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-x' } }))
  await assertFails(uploadBytes(ref(st('comprador'), caminho), pdf, { contentType: 'application/pdf' }))
  await assertFails(uploadBytes(ref(st('comprador'), caminho), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-sol' } }))
  await assertFails(uploadBytes(ref(st('comprador'), 'pedidos/p1/anexos/2_pagina.html'), pdf, { contentType: 'text/html', customMetadata: { autorUid: 'u-com' } }))
  await assertSucceeds(uploadBytes(ref(st('comprador'), caminho), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-com' } }))
  await assertFails(getBytes(ref(st('semPerfil'), caminho)))
  await assertSucceeds(getBytes(ref(st('solicitante'), caminho)))
  await assertFails(deleteObject(ref(st('solicitante'), caminho)))
  await assertSucceeds(deleteObject(ref(st('gestor'), caminho)))
  // Quem enviou apaga o próprio anexo enquanto vê o pedido; se perdeu o
  // acesso a ele (u-com2, só da e2), não apaga mais
  const meu = 'pedidos/p1/anexos/2_nota.pdf'
  await assertSucceeds(uploadBytes(ref(st('comprador'), meu), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-com' } }))
  await assertSucceeds(deleteObject(ref(st('comprador'), meu)))
  const antigo = 'pedidos/p1/anexos/3_antigo.pdf'
  await env.withSecurityRulesDisabled(async ctx => {
    await uploadBytes(ref(ctx.storage(), antigo), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-com2' } })
  })
  await assertFails(deleteObject(ref(st('compradorE2'), antigo)))
})

test('cotação em arquivo só pelo comprador que assumiu o pedido ou por um gestor da empresa', async () => {
  const caminho = 'pedidos/cotando/cotacoes/c1/proposta.pdf'
  const meta = { contentType: 'application/pdf' }
  await assertFails(uploadBytes(ref(st('solicitante'), caminho), pdf, meta))
  await assertFails(uploadBytes(ref(st('compradorB'), caminho), pdf, meta))
  await assertFails(uploadBytes(ref(st('compradorE2'), caminho), pdf, meta))
  await assertFails(uploadBytes(ref(st('gestorE2'), caminho), pdf, meta))
  await assertSucceeds(uploadBytes(ref(st('comprador'), caminho), pdf, meta))
  await assertSucceeds(uploadBytes(ref(st('gestor'), 'pedidos/cotando/cotacoes/c2/proposta.pdf'), pdf, meta))
  // E apaga o que enviou, como o app faz quando o lote do Firestore falha
  await assertSucceeds(deleteObject(ref(st('comprador'), caminho)))
})

test('cada arquivo só para quem vê o pedido: outra empresa não lê, não lista nem envia', async () => {
  const meta = uid => ({ contentType: 'application/pdf', customMetadata: { autorUid: uid } })
  // p2 é da empresa e2
  await assertSucceeds(uploadBytes(ref(st('compradorE2'), 'pedidos/p2/anexos/1_e2.pdf'), pdf, meta('u-com2')))
  await assertSucceeds(getBytes(ref(st('gestorE2'), 'pedidos/p2/anexos/1_e2.pdf')))
  await assertSucceeds(getBytes(ref(st('supremo'), 'pedidos/p2/anexos/1_e2.pdf')))
  await assertSucceeds(listAll(ref(st('gestorE2'), 'pedidos/p2/anexos')))
  await assertFails(getBytes(ref(st('comprador'), 'pedidos/p2/anexos/1_e2.pdf')))
  await assertFails(listAll(ref(st('comprador'), 'pedidos/p2/anexos')))
  await assertFails(deleteObject(ref(st('gestor'), 'pedidos/p2/anexos/1_e2.pdf')))
  await assertFails(uploadBytes(ref(st('comprador'), 'pedidos/p2/anexos/2_intruso.pdf'), pdf, meta('u-com')))
  // Comprovante: o financeiro da empresa do pedido, não de outra
  await assertFails(uploadBytes(ref(st('financeiro'), 'pedidos/p2/comprovantes/x1/recibo.pdf'), pdf, { contentType: 'application/pdf' }))
  await assertSucceeds(uploadBytes(ref(st('financeiro'), 'pedidos/p1/comprovantes/x1/recibo.pdf'), pdf, { contentType: 'application/pdf' }))
  // Quem pediu vê os arquivos do próprio pedido, mesmo de outra empresa
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'pedidos/p3'), pedido({ numeroPedido: 'PRX-0003', empresaId: 'e2', solicitanteId: 'u-sol' }))
  })
  await assertSucceeds(uploadBytes(ref(st('compradorE2'), 'pedidos/p3/anexos/1_p3.pdf'), pdf, meta('u-com2')))
  await assertSucceeds(getBytes(ref(st('solicitante'), 'pedidos/p3/anexos/1_p3.pdf')))
  // Pedido que não existe: nada feito
  await assertFails(uploadBytes(ref(st('comprador'), 'pedidos/naoexiste/anexos/1.pdf'), pdf, meta('u-com')))
})

test('sem claims, os arquivos seguem o perfil do documento', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'pedidos/cotDoc'), pedido({ status: 'ag_cotacao', compradorId: 'u-doc' }))
  })
  // Cada avaliação lê dois documentos do Firestore, o limite do Storage: o
  // perfil (sem claims) e o pedido
  const caminho = 'pedidos/cotDoc/cotacoes/c2/proposta.pdf'
  await assertSucceeds(uploadBytes(ref(st('semClaims'), caminho), pdf, { contentType: 'application/pdf' }))
  await assertFails(uploadBytes(ref(st('semClaims'), 'pedidos/cotDoc/comprovantes/x1/recibo.pdf'), pdf, { contentType: 'application/pdf' }))
  await assertFails(uploadBytes(ref(st('semClaims'), 'pedidos/p2/anexos/1_e2.pdf'), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-doc' } }))
  await assertSucceeds(getBytes(ref(st('semClaims'), caminho)))
  await assertFails(getBytes(ref(st('inativo'), caminho)))
})

test('a conta demo só mexe em arquivos de pedidos da demo', async () => {
  const meta = { contentType: 'application/pdf', customMetadata: { autorUid: 'u-demo' } }
  // Arquivo de um pedido real: nem lê, nem envia, nem apaga
  await assertSucceeds(uploadBytes(ref(st('comprador'), 'pedidos/p1/anexos/real.pdf'), pdf, { contentType: 'application/pdf', customMetadata: { autorUid: 'u-com' } }))
  await assertFails(getBytes(ref(st('demo'), 'pedidos/p1/anexos/real.pdf')))
  await assertFails(deleteObject(ref(st('demo'), 'pedidos/p1/anexos/real.pdf')))
  await assertFails(uploadBytes(ref(st('demo'), 'pedidos/p1/anexos/demo.pdf'), pdf, meta))
  await assertFails(uploadBytes(ref(st('demo'), 'pedidos/p1/cotacoes/c1/proposta.pdf'), pdf, meta))
  await assertFails(uploadBytes(ref(st('demo'), 'qualquer/lugar.pdf'), pdf, meta))
  // Na área da demo, com o tipo e o tamanho conferidos como para todos
  await assertFails(uploadBytes(ref(st('demo'), 'pedidos/demo-0001/anexos/pagina.html'), pdf, { contentType: 'text/html', customMetadata: { autorUid: 'u-demo' } }))
  await assertSucceeds(uploadBytes(ref(st('demo'), 'pedidos/demo-0001/anexos/nota.pdf'), pdf, meta))
  await assertSucceeds(uploadBytes(ref(st('demo'), 'pedidos/demo-0001/cotacoes/c1/proposta.pdf'), pdf, meta))
  await assertSucceeds(uploadBytes(ref(st('demo'), 'pedidos/demo-0001/comprovantes/p1/recibo.pdf'), pdf, meta))
  await assertSucceeds(getBytes(ref(st('demo'), 'pedidos/demo-0001/anexos/nota.pdf')))
  await assertSucceeds(deleteObject(ref(st('demo'), 'pedidos/demo-0001/anexos/nota.pdf')))
})
