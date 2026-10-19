// Testes das regras do Firestore e do Storage, no emulador.
//
//   npm run testar-regras
//
// Cada perfil tenta o que pode e o que não pode. As permissões chegam no
// token (custom claims), como em produção: { perfil, empresas }.

import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, writeBatch,
} from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

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

test('o solicitante cancela o próprio pedido só antes da cotação', async () => {
  await assertSucceeds(updateDoc(doc(db('solicitante'), 'pedidos/p1'), { status: 'cancelado', canceladoPor: 'u-sol' }))
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/emAprov'), { status: 'cancelado', canceladoPor: 'u-sol' }))
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
  // Se a entrada do histórico é recusada, o status também não muda
  const f2 = db('comprador')
  const lote2 = writeBatch(f2)
  lote2.update(doc(f2, 'pedidos/cotando'), { status: 'em_aprovacao' })
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

test('cotação só pelo comprador responsável, da empresa do pedido', async () => {
  await assertFails(addDoc(collection(db('compradorE2'), 'pedidos/cotando/cotacoes'), { valor: 10 }))
  await assertFails(addDoc(collection(db('solicitante'), 'pedidos/cotando/cotacoes'), { valor: 10 }))
  // Outro comprador da mesma empresa, que não assumiu o pedido, não cota
  await assertFails(addDoc(collection(db('compradorB'), 'pedidos/cotando/cotacoes'), { valor: 10 }))
  await assertSucceeds(addDoc(collection(db('comprador'), 'pedidos/cotando/cotacoes'), { valor: 10 }))
  await assertSucceeds(addDoc(collection(db('gestor'), 'pedidos/cotando/cotacoes'), { valor: 12 }))
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
})

test('cotação em arquivo só por quem compra', async () => {
  const caminho = 'pedidos/p1/cotacoes/c1/proposta.pdf'
  await assertFails(uploadBytes(ref(st('solicitante'), caminho), pdf, { contentType: 'application/pdf' }))
  await assertSucceeds(uploadBytes(ref(st('comprador'), caminho), pdf, { contentType: 'application/pdf' }))
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
