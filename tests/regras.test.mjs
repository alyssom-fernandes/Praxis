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
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where,
} from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

const PROJETO = 'demo-praxis'
let env

// ── Pessoas ────────────────────────────────────────────────────
const conta = {
  supremo:     ['u-sup', { perfil: 'supremo', empresas: [] }],
  gestor:      ['u-ges', { perfil: 'gestor', empresas: ['e1'] }],
  aprovador:   ['u-apr', { perfil: 'aprovador', empresas: ['e1'] }],
  comprador:   ['u-com', { perfil: 'comprador', empresas: ['e1'] }],
  compradorE2: ['u-com2', { perfil: 'comprador', empresas: ['e2'] }],
  financeiro:  ['u-fin', { perfil: 'financeiro', empresas: ['e1'] }],
  solicitante: ['u-sol', { perfil: 'solicitante', empresas: ['e1'] }],
  semPerfil:   ['u-x', {}],
  demo:        ['u-demo', { email: 'demo@praxis.app' }],
}
const db = quem => env.authenticatedContext(...conta[quem]).firestore()
const st = quem => env.authenticatedContext(...conta[quem]).storage()

// ── Dados de partida ───────────────────────────────────────────
const pedido = (extra = {}) => ({
  numeroPedido: 'PRX-0001', titulo: 'Notebook', empresaId: 'e1', status: 'solicitado',
  solicitanteId: 'u-sol', compradorId: null, dataNecessaria: '2026-11-30', ...extra,
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
    await setDoc(doc(f, 'usuarios/u-sup'), { nome: 'Sup', perfil: 'supremo', empresas: [] })
    await setDoc(doc(f, 'empresas/e1'), { nome: 'Empresa 1' })
    await setDoc(doc(f, '_meta/contadores'), { totalPedidos: 5 })
    await setDoc(doc(f, '_meta/demo'), { dia: '2026-10-13', travadoAte: 0 })
    await setDoc(doc(f, 'pedidos/p1'), pedido())
    await setDoc(doc(f, 'pedidos/p2'), pedido({ numeroPedido: 'PRX-0002', empresaId: 'e2', solicitanteId: 'u-outro' }))
    await setDoc(doc(f, 'pedidos/emAprov'), pedido({ status: 'em_aprovacao', compradorId: 'u-com' }))
    await setDoc(doc(f, 'pedidos/entregue'), pedido({ status: 'entregue', compradorId: 'u-com' }))
    await setDoc(doc(f, 'pedidos/demo1'), pedido({ isDemo: true }))
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

// ── Pedidos: cada passo com o seu perfil ───────────────────────
test('só quem aprova aprova, e sem mexer em outros campos', async () => {
  const aprovar = quem => ({ status: 'aprovado', aprovadoPor: conta[quem][0], aprovadoEm: new Date() })
  await assertFails(updateDoc(doc(db('solicitante'), 'pedidos/emAprov'), aprovar('solicitante')))
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/emAprov'), aprovar('comprador')))
  await assertFails(updateDoc(doc(db('aprovador'), 'pedidos/emAprov'), { ...aprovar('aprovador'), valorFinal: 1 }))
  await assertSucceeds(updateDoc(doc(db('aprovador'), 'pedidos/emAprov'), aprovar('aprovador')))
})

test('o comprador assume em nome próprio', async () => {
  await assertFails(updateDoc(doc(db('comprador'), 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-outro' }))
  await assertFails(updateDoc(doc(db('compradorE2'), 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-com2' }))
  await assertSucceeds(updateDoc(doc(db('comprador'), 'pedidos/p1'), { status: 'ag_cotacao', compradorId: 'u-com' }))
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

test('data fora do formato é recusada, até para a conta demo', async () => {
  const xss = '2026-01-<img src=x onerror=alert(1)>'
  await assertFails(setDoc(doc(db('demo'), 'pedidos/xss'), pedido({ dataNecessaria: xss })))
  await assertFails(updateDoc(doc(db('demo'), 'pedidos/p1'), { dataNecessaria: xss }))
  await assertSucceeds(updateDoc(doc(db('demo'), 'pedidos/p1'), { dataNecessaria: '2026-12-01' }))
})

test('só a demo apaga, e só pedidos dela', async () => {
  await assertFails(deleteDoc(doc(db('gestor'), 'pedidos/p1')))
  await assertFails(deleteDoc(doc(db('demo'), 'pedidos/p1')))
  await assertSucceeds(deleteDoc(doc(db('demo'), 'pedidos/demo1')))
})

test('cotação só da empresa do comprador', async () => {
  await assertFails(addDoc(collection(db('compradorE2'), 'pedidos/p1/cotacoes'), { valor: 10 }))
  await assertSucceeds(addDoc(collection(db('comprador'), 'pedidos/p1/cotacoes'), { valor: 10 }))
  await assertFails(addDoc(collection(db('solicitante'), 'pedidos/p1/cotacoes'), { valor: 10 }))
})

test('comentário e histórico assinados por quem escreve', async () => {
  await assertFails(addDoc(collection(db('comprador'), 'pedidos/p1/comentarios'), { texto: 'oi', autorId: 'u-sol' }))
  await assertSucceeds(addDoc(collection(db('comprador'), 'pedidos/p1/comentarios'), { texto: 'oi', autorId: 'u-com' }))
  await assertFails(addDoc(collection(db('compradorE2'), 'pedidos/p1/historico'), { status: 'x', autorId: 'u-com2' }))
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
