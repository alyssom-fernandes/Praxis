// Testes das regras do Firestore e do Storage dos módulos Serviços e
// Equipamentos e do acesso por módulo, no emulador.
//
//   npm run testar-regras
//
// As contas não têm claims (o plano gratuito, como o site no ar): as regras
// leem o papel de cada módulo no documento da pessoa em /usuarios.

import { test, before, after, beforeEach } from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, writeBatch, serverTimestamp, Timestamp, increment,
} from 'firebase/firestore'
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage'

const PROJETO = 'demo-praxis'
let env

// ── Pessoas (o papel vem do documento) ─────────────────────────
const PESSOAS = {
  'u-ssol': { nome: 'Fernanda', perfil: 'nenhum', servicos: 'solicitante', empresas: ['e1'] },
  'u-ssol2': { nome: 'Paulo', perfil: 'solicitante', servicos: 'solicitante', empresas: ['e1'] },
  'u-sges': { nome: 'Beatriz', perfil: 'nenhum', servicos: 'gestor', empresas: ['e1'] },
  'u-sfin': { nome: 'Eduardo', perfil: 'financeiro', servicos: 'financeiro', empresas: ['e1'] },
  'u-sE2': { nome: 'Outra', perfil: 'nenhum', servicos: 'solicitante', empresas: ['e2'] },
  'u-comp': { nome: 'Diana', perfil: 'comprador', empresas: ['e1'] },
  'u-ges': { nome: 'Gestor de compras', perfil: 'gestor', empresas: ['e1'] },
  'u-sup': { nome: 'Supremo', perfil: 'supremo', empresas: [] },
  'u-tec': { nome: 'João Clima', perfil: 'prestador', fornecedorId: 'f1', empresas: ['e1'] },
  'u-tec2': { nome: 'Ana Pragas', perfil: 'prestador', fornecedorId: 'f2', empresas: ['e1'] },
  'u-padm': { nome: 'Clima Sul', perfil: 'prestador', fornecedorId: 'f1', prestadorAdmin: true, empresas: ['e1'] },
  'u-eqres': { nome: 'Resp', perfil: 'nenhum', equipamentos: 'responsavel', empresas: ['e1'] },
  'u-eqcon': { nome: 'Cons', perfil: 'nenhum', equipamentos: 'consulta', empresas: ['e1'] },
  'u-eqges': { nome: 'GesEq', perfil: 'nenhum', equipamentos: 'gestor', empresas: ['e1'] },
  'u-inat': { nome: 'Inativo', perfil: 'nenhum', servicos: 'gestor', equipamentos: 'gestor', empresas: ['e1'], ativo: false },
}
const ctx = uid => env.authenticatedContext(uid, { email: `${uid}@x.com` })
const db = uid => ctx(uid).firestore()
const demo = () => env.authenticatedContext('u-demo', { email: 'demo@praxis.app' }).firestore()

const UNIDADE = { empresaId: 'e1', nome: 'Posto Centro', ativa: true }
const CODIGO = 'codigo-da-placa-0001'
// A prova que o app grava (js/presenca.js): SHA-256 de "código|ID do chamado"
const prova = (codigo, chamadoId) => createHash('sha256').update(`${codigo}|${chamadoId}`).digest('hex')
const agora = () => serverTimestamp()
const daqui = dias => Timestamp.fromMillis(Date.now() + dias * 864e5)

// Grava como o app: o documento com ultimoEventoId e a entrada do histórico
let _seq = 0
function comEvento(uid, colecao, id, dados, { tipo = 'update', evento = {}, extra = l => l } = {}) {
  const f = db(uid)
  const eid = `ev-${++_seq}`
  const lote = writeBatch(f)
  if (tipo === 'set') lote.set(doc(f, `${colecao}/${id}`), { ...dados, ultimoEventoId: eid })
  else lote.update(doc(f, `${colecao}/${id}`), { ...dados, ultimoEventoId: eid, atualizadoEm: agora() })
  lote.set(doc(f, `${colecao}/${id}/historico/${eid}`), { autorId: uid, criadoEm: agora(), tipo: 'passo', ...evento })
  extra(lote, f)
  return lote.commit()
}
const chamadoNovo = (extra = {}) => ({
  numero: 1, tipo: 'chamado', empresaId: 'e1', unidadeId: 'un1', unidadeNome: 'Posto Centro', fornecedorId: 'f1',
  fornecedorNome: 'Clima Sul', titulo: 'Ar não gela', descricao: 'Só sopra ar quente', urgente: false,
  solicitanteId: 'u-ssol', solicitanteNome: 'Fernanda', status: 'aberto', criadoEm: agora(), atualizadoEm: agora(), ...extra,
})
// Chamado já gravado, na etapa pedida (pelo emulador, sem regras)
async function semear(id, extra = {}) {
  await env.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore(), `chamados/${id}`), { ...chamadoNovo(), criadoEm: new Date(), atualizadoEm: new Date(), ...extra })
  })
}
const abrir = (uid, id, extra = {}) => comEvento(uid, 'chamados', id, chamadoNovo({ solicitanteId: uid, ...extra }), {
  tipo: 'set', extra: (l, f) => l.set(doc(f, '_meta/contadorChamados'), { total: increment(1) }, { merge: true }),
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
  await env.withSecurityRulesDisabled(async c => {
    const f = c.firestore()
    for (const [id, p] of Object.entries(PESSOAS)) await setDoc(doc(f, `usuarios/${id}`), { email: `${id}@x.com`, ativo: true, ...p })
    await setDoc(doc(f, 'empresas/e1'), { nome: 'Empresa 1' })
    await setDoc(doc(f, 'empresas/e2'), { nome: 'Empresa 2' })
    await setDoc(doc(f, 'unidades/un1'), UNIDADE)
    await setDoc(doc(f, 'unidades/un1/privado/placa'), { codigo: CODIGO })
    await setDoc(doc(f, 'unidades/un2'), { ...UNIDADE, empresaId: 'e2', nome: 'Posto Norte' })
    await setDoc(doc(f, 'unidades/un2/privado/placa'), { codigo: 'codigo-da-placa-0002' })
    await setDoc(doc(f, 'fornecedores/f1'), { nome: 'clima sul', nomeExibicao: 'Clima Sul', usos: 1 })
    await setDoc(doc(f, 'fornecedores/f2'), { nome: 'dedetiza ja', nomeExibicao: 'Dedetiza Já', usos: 1 })
    await setDoc(doc(f, 'pedidos/p1'), { titulo: 'Notebook', empresaId: 'e1', status: 'solicitado', solicitanteId: 'u-comp' })
  })
})

// ── Acesso por módulo ──────────────────────────────────────────
test('módulos: quem não tem Serviços não vê chamados; quem não tem Compras não vê pedidos', async () => {
  await semear('c1')
  const lista = uid => getDocs(query(collection(db(uid), 'chamados'), where('empresaId', 'in', ['e1'])))
  await assertSucceeds(lista('u-ssol'))
  await assertSucceeds(lista('u-sfin'))
  await assertFails(lista('u-comp'))
  await assertFails(lista('u-eqres'))
  await assertFails(lista('u-inat'))
  await assertFails(getDoc(doc(db('u-sE2'), 'chamados/c1')))
  // Sem Compras
  await assertFails(getDoc(doc(db('u-ssol'), 'pedidos/p1')))
  await assertFails(getDocs(query(collection(db('u-sges'), 'pedidos'), where('empresaId', 'in', ['e1']))))
  await assertFails(getDoc(doc(db('u-tec'), 'pedidos/p1')))
  // Mas lê as empresas e as unidades
  await assertSucceeds(getDoc(doc(db('u-ssol'), 'empresas/e1')))
  await assertSucceeds(getDoc(doc(db('u-eqcon'), 'unidades/un1')))
  await assertFails(getDoc(doc(db('u-eqcon'), 'unidades/un2')))
})

test('prestador: só os chamados da prestadora dele; lê a própria ficha e as unidades que atende', async () => {
  await semear('c1')
  await semear('c2', { fornecedorId: 'f2' })
  await assertSucceeds(getDocs(query(collection(db('u-tec'), 'chamados'), where('fornecedorId', '==', 'f1'))))
  await assertFails(getDocs(query(collection(db('u-tec'), 'chamados'), where('fornecedorId', '==', 'f2'))))
  await assertFails(getDocs(query(collection(db('u-tec'), 'chamados'), where('empresaId', 'in', ['e1']))))
  await assertSucceeds(getDoc(doc(db('u-tec'), 'chamados/c1')))
  await assertFails(getDoc(doc(db('u-tec'), 'chamados/c2')))
  await assertSucceeds(getDoc(doc(db('u-tec'), 'fornecedores/f1')))
  await assertFails(getDoc(doc(db('u-tec'), 'fornecedores/f2')))
  await assertSucceeds(getDoc(doc(db('u-tec'), 'unidades/un1')))
  // O código da placa: só quem cuida das unidades lê; a prestadora, nunca
  await assertFails(getDoc(doc(db('u-tec'), 'unidades/un1/privado/placa')), 'técnico não lê o código')
  await assertFails(getDoc(doc(db('u-padm'), 'unidades/un1/privado/placa')), 'conta da prestadora não lê o código')
  await assertFails(getDoc(doc(db('u-ssol'), 'unidades/un1/privado/placa')), 'quem só abre chamado não lê')
  await assertSucceeds(getDoc(doc(db('u-sges'), 'unidades/un1/privado/placa')))
  await assertFails(setDoc(doc(db('u-tec'), 'unidades/un1/privado/placa'), { codigo: 'codigo-do-tecnico-01' }), 'técnico não troca o código')
  await assertSucceeds(setDoc(doc(db('u-sges'), 'unidades/un1/privado/placa'), { codigo: CODIGO }))
  await assertFails(getDoc(doc(db('u-tec'), 'unidades/un2')))
  await assertFails(getDoc(doc(db('u-tec'), 'usuarios/u-ssol')))
})

// ── Unidades ───────────────────────────────────────────────────
function unidadeAuditada(uid, id, dados) {
  const f = db(uid), aid = `aud-${++_seq}`, lote = writeBatch(f)
  lote.set(doc(f, `auditoria/${aid}`), { autorId: uid, autorNome: 'T', em: serverTimestamp(), entidade: 'unidade', entidadeId: id, acao: 'criar', antes: null, depois: null, empresaIds: [dados.empresaId] })
  lote.set(doc(f, `unidades/${id}`), { ...dados, auditoriaId: aid })
  return lote.commit()
}
test('unidades: o gestor de um módulo cadastra nas empresas dele, com a auditoria', async () => {
  await assertSucceeds(unidadeAuditada('u-sges', 'un9', { ...UNIDADE, nome: 'Loja nova' }))
  await assertSucceeds(unidadeAuditada('u-eqges', 'un8', { ...UNIDADE, nome: 'Oficina' }))
  await assertSucceeds(unidadeAuditada('u-ges', 'un7', { ...UNIDADE, nome: 'Escritório' }))
  await assertFails(unidadeAuditada('u-ssol', 'un6', UNIDADE))
  await assertFails(unidadeAuditada('u-eqres', 'un6', UNIDADE))
  await assertFails(unidadeAuditada('u-sges', 'un6', { ...UNIDADE, empresaId: 'e2' }))
  await assertFails(unidadeAuditada('u-sges', 'un6', { ...UNIDADE, codigo: 'nao-vai-aqui-0001' }), 'o código não fica na unidade')
  await assertFails(setDoc(doc(db('u-sges'), 'unidades/un5'), UNIDADE), 'sem a auditoria, não')
})

// ── Chamados: abrir ────────────────────────────────────────────
test('abrir chamado: quem tem Serviços na empresa, em nome próprio e com o histórico', async () => {
  await assertSucceeds(abrir('u-ssol', 'c1'))
  await assertSucceeds(abrir('u-sfin', 'c2'))
  await assertFails(abrir('u-comp', 'c3'), 'sem Serviços')
  await assertFails(abrir('u-tec', 'c3'), 'o prestador não abre chamado')
  await assertFails(abrir('u-sE2', 'c3'), 'outra empresa')
  await assertFails(abrir('u-ssol', 'c3', { unidadeId: 'un2' }), 'unidade de outra empresa')
  await assertFails(abrir('u-ssol', 'c3', { status: 'confirmado' }), 'já adiantado')
  await assertFails(abrir('u-ssol', 'c3', { fornecedorId: 'nao-existe' }), 'prestadora que não existe')
  await assertFails(setDoc(doc(db('u-ssol'), 'chamados/c4'), { ...chamadoNovo(), ultimoEventoId: 'x' }), 'sem a entrada do histórico')
  await assertFails(comEvento('u-ssol', 'chamados', 'c5', { ...chamadoNovo({ solicitanteId: 'u-ssol2' }) }, { tipo: 'set' }), 'em nome de outra pessoa')
})

// ── Chamados: o atendimento ────────────────────────────────────
test('o prestador agenda, chega pelo QR, conclui; quem pediu confirma', async () => {
  await semear('c1')
  const agendar = uid => comEvento(uid, 'chamados', 'c1', { status: 'agendado', agendadoPara: daqui(1), tecnicoId: uid, tecnicoNome: 'T' })
  await assertFails(agendar('u-tec2'), 'outra prestadora')
  await assertFails(agendar('u-ssol'), 'quem pediu não agenda')
  await assertSucceeds(agendar('u-tec'))
  const chegada = codigo => ({ em: agora(), via: 'qr', prova: prova(codigo, 'c1'), lat: -23.5, lng: -46.6, distanciaM: 18 })
  const chegar = (uid, c) => comEvento(uid, 'chamados', 'c1', { status: 'atendimento', chegada: c, tecnicoId: uid, tecnicoNome: 'T' })
  await assertFails(chegar('u-tec', chegada('codigo-errado-0000')), 'QR de outra placa')
  await assertFails(chegar('u-tec', { ...chegada(CODIGO), em: Timestamp.fromMillis(Date.now() - 3600e3) }), 'hora que não é a do servidor')
  await assertFails(chegar('u-tec', { ...chegada(CODIGO), codigo: CODIGO }), 'o código não é gravado no chamado')
  await assertFails(chegar('u-tec', { ...chegada(CODIGO), prova: prova(CODIGO, 'outro-chamado') }), 'prova de outro chamado')
  await assertSucceeds(chegar('u-tec', chegada(CODIGO)))
  // Extra durante o atendimento; aprovado pelo gestor de Serviços
  const f = db('u-tec')
  await assertSucceeds(setDoc(doc(f, 'chamados/c1/extras/x1'), { descricao: 'Capacitor', valor: 380, status: 'aguardando', criadoPor: 'u-tec', criadoPorNome: 'T', criadoEm: agora() }))
  await assertFails(setDoc(doc(f, 'chamados/c1/extras/x2'), { descricao: 'Grátis', valor: 0, status: 'aguardando', criadoPor: 'u-tec', criadoPorNome: 'T', criadoEm: agora() }))
  const decidir = (uid, status, extra = {}) => updateDoc(doc(db(uid), 'chamados/c1/extras/x1'), { status, decididoPor: uid, decididoPorNome: 'B', decididoEm: agora(), ...extra })
  await assertFails(decidir('u-ssol', 'aprovado'), 'só o gestor de Serviços aprova')
  await assertFails(decidir('u-tec', 'aprovado'), 'o prestador não aprova o próprio extra')
  await assertFails(decidir('u-sges', 'reprovado'), 'reprovar pede o motivo')
  await assertSucceeds(decidir('u-sges', 'aprovado'))
  // Foto: só o técnico, durante o atendimento
  const foto = (uid, tipo, id) => setDoc(doc(db(uid), `chamados/c1/fotos/${id}`), { tipo, storagePath: `chamados/c1/fotos/${id}.jpg`, autorId: uid, autorNome: 'T', criadoEm: agora(), tamanho: 1000 })
  await assertSucceeds(foto('u-tec', 'antes', 'fa'))
  await assertFails(foto('u-ssol', 'antes', 'fb'))
  await assertFails(foto('u-tec', 'antes', 'fc').then(() => updateDoc(doc(db('u-tec'), 'chamados/c1/fotos/fa'), { tipo: 'depois' })), 'a foto não muda')
  // Concluir: com o relatório e o QR de saída
  const concluir = (uid, rel) => comEvento(uid, 'chamados', 'c1', { status: 'concluido', saida: chegada(CODIGO), relatorio: rel, pecas: ['Capacitor'] })
  await assertFails(concluir('u-tec', ''), 'sem relatório')
  await assertFails(concluir('u-tec2', 'Feito'))
  await assertSucceeds(concluir('u-tec', 'Troca do capacitor'))
  // Confirmar: quem pediu ou o gestor de Serviços
  const confirmar = uid => comEvento(uid, 'chamados', 'c1', { status: 'confirmado', confirmadoPor: uid, confirmadoPorNome: 'F', confirmadoEm: agora(), extrasAprovados: 380 })
  await assertFails(confirmar('u-tec'))
  await assertFails(confirmar('u-ssol2'), 'outra pessoa da empresa, sem ser gestor')
  await assertSucceeds(confirmar('u-ssol'))
})

test('contestar e cancelar: quem pediu ou o gestor; a visita não se cancela', async () => {
  await semear('c1', { status: 'concluido', tecnicoId: 'u-tec', chegada: { em: new Date(Date.now() - 7200e3), via: 'qr' }, saida: { em: new Date(Date.now() - 3600e3), via: 'qr' }, relatorio: 'x' })
  const contestar = (uid, n) => comEvento(uid, 'chamados', 'c1', { status: 'contestado', contestacao: { motivo: 'O problema continua', texto: '' }, contestacoes: n, contestadoEm: agora() })
  await assertFails(contestar('u-tec', 1))
  await assertFails(contestar('u-ssol', 5), 'a contagem só sobe 1')
  await assertSucceeds(contestar('u-sges', 1))
  // Volta ao prestador: chega de novo
  await assertSucceeds(comEvento('u-tec', 'chamados', 'c1', { status: 'atendimento', chegada: { em: agora(), via: 'manual' }, tecnicoId: 'u-tec', tecnicoNome: 'T' }))
  await semear('c2')
  const cancelar = (uid, id) => comEvento(uid, 'chamados', id, { status: 'cancelado', cancelamento: { motivo: 'Resolvido sem o prestador' } })
  await assertFails(cancelar('u-tec', 'c2'))
  await assertSucceeds(cancelar('u-ssol', 'c2'))
  await semear('v1', { tipo: 'visita', status: 'prevista', janelaAte: new Date(Date.now() + 864e5) })
  await assertFails(cancelar('u-sges', 'v1'))
})

// ── Visitas periódicas ─────────────────────────────────────────
test('visitas: ID fixo; prevista só com a janela aberta; não realizada só depois dela', async () => {
  const visita = (id, status, janela, extra = {}) => comEvento('u-ssol', 'chamados', id, {
    tipo: 'visita', empresaId: 'e1', unidadeId: 'un1', unidadeNome: 'Posto Centro', fornecedorId: 'f2', fornecedorNome: 'Dedetiza',
    servicoId: 's1', titulo: 'Dedetização mensal', previstaPara: '2026-11-01', janelaAte: janela, status,
    criadoEm: agora(), atualizadoEm: agora(), ...extra,
  }, { tipo: 'set' })
  const ID = 'vp-f2-s1-un1-2026-11-01'
  await assertSucceeds(visita(ID, 'prevista', daqui(3)))
  await assertFails(visita('vp-f2-s1-un1-2026-12-01', 'prevista', daqui(3)), 'o ID não bate com a data')
  await assertFails(visita('vp-f2-s1-un1-2026-11-01x', 'prevista', daqui(3)))
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async c => {
    const f = c.firestore()
    for (const [id, p] of Object.entries(PESSOAS)) await setDoc(doc(f, `usuarios/${id}`), { email: `${id}@x.com`, ativo: true, ...p })
    await setDoc(doc(f, 'unidades/un1'), UNIDADE)
    await setDoc(doc(f, 'fornecedores/f2'), { nome: 'dedetiza ja' })
  })
  await assertFails(visita(ID, 'nao_realizada', daqui(3)), 'a janela ainda está aberta')
  await assertSucceeds(visita(ID, 'nao_realizada', daqui(-1)))
  // Uma prevista cuja janela passou vira não realizada
  await semear('vp-f2-s1-un1-2026-10-01', { tipo: 'visita', fornecedorId: 'f2', servicoId: 's1', previstaPara: '2026-10-01', status: 'prevista', janelaAte: new Date(Date.now() - 864e5) })
  await assertSucceeds(comEvento('u-tec2', 'chamados', 'vp-f2-s1-un1-2026-10-01', { status: 'nao_realizada' }))
  await semear('vp-f2-s1-un1-2026-12-01', { tipo: 'visita', fornecedorId: 'f2', servicoId: 's1', previstaPara: '2026-12-01', status: 'prevista', janelaAte: new Date(Date.now() + 864e5) })
  await assertFails(comEvento('u-ssol', 'chamados', 'vp-f2-s1-un1-2026-12-01', { status: 'nao_realizada' }), 'janela aberta')
})

test('conversa no chamado: quem vê comenta, assinando; só o gestor apaga', async () => {
  await semear('c1')
  const comentar = (uid, autor = uid) => setDoc(doc(db(uid), `chamados/c1/comentarios/k${++_seq}`), { texto: 'Chego às 14h', autorId: autor, autorNome: 'X', criadoEm: agora() })
  await assertSucceeds(comentar('u-tec'))
  await assertSucceeds(comentar('u-ssol'))
  await assertFails(comentar('u-tec2'))
  await assertFails(comentar('u-comp'))
  await assertFails(comentar('u-tec', 'u-ssol'), 'em nome de outro')
})

// ── Usuários: os papéis por módulo e a conta da prestadora ─────
function usuarioAuditado(uid, id, dados, tipo = 'set') {
  const f = db(uid), aid = `aud-${++_seq}`, lote = writeBatch(f)
  lote.set(doc(f, `auditoria/${aid}`), { autorId: uid, autorNome: 'T', em: serverTimestamp(), entidade: 'usuario', entidadeId: id, acao: tipo === 'set' ? 'criar' : 'editar', antes: null, depois: null, empresaIds: ['e1'] })
  if (tipo === 'set') lote.set(doc(f, `usuarios/${id}`), { ...dados, auditoriaId: aid })
  else lote.update(doc(f, `usuarios/${id}`), { ...dados, auditoriaId: aid })
  return lote.commit()
}
test('usuários: o gestor dá papéis válidos por módulo; prestador sempre com a prestadora', async () => {
  const novo = extra => ({ nome: 'Nova', email: 'n@x.com', perfil: 'nenhum', empresas: ['e1'], ativo: true, ...extra })
  await assertSucceeds(usuarioAuditado('u-ges', 'n1', novo({ servicos: 'gestor', equipamentos: 'consulta' })))
  await assertFails(usuarioAuditado('u-ges', 'n2', novo({ servicos: 'dono' })))
  await assertFails(usuarioAuditado('u-ges', 'n3', novo({ perfil: 'prestador' })), 'prestador sem prestadora')
  await assertFails(usuarioAuditado('u-ges', 'n4', novo({ perfil: 'prestador', fornecedorId: 'f1', servicos: 'gestor' })), 'prestador com outro módulo')
  await assertSucceeds(usuarioAuditado('u-ges', 'n5', novo({ perfil: 'prestador', fornecedorId: 'f1', prestadorAdmin: true })))
  await assertFails(usuarioAuditado('u-sges', 'n6', novo({ servicos: 'gestor' })), 'o gestor de Serviços não administra usuários')
})

test('a conta da prestadora cria e edita os técnicos dela, e só eles', async () => {
  const tec = extra => ({ nome: 'Técnico novo', email: 'tn@usuarios.praxis.invalid', perfil: 'prestador', fornecedorId: 'f1', empresas: ['e1'], ativo: true, ...extra })
  await assertSucceeds(usuarioAuditado('u-padm', 't1', tec()))
  await assertFails(usuarioAuditado('u-padm', 't2', tec({ fornecedorId: 'f2' })), 'de outra prestadora')
  await assertFails(usuarioAuditado('u-padm', 't3', tec({ prestadorAdmin: true })), 'outra conta da prestadora')
  await assertFails(usuarioAuditado('u-padm', 't4', tec({ perfil: 'solicitante' })), 'gente da empresa')
  await assertFails(usuarioAuditado('u-padm', 't5', tec({ empresas: ['e2'] })), 'empresa que a prestadora não atende')
  await assertFails(usuarioAuditado('u-tec', 't6', tec()), 'o técnico não cria técnicos')
  await assertSucceeds(usuarioAuditado('u-padm', 'u-tec', { ativo: false }, 'update'))
  await assertFails(usuarioAuditado('u-padm', 'u-tec2', { ativo: false }, 'update'), 'técnico de outra prestadora')
  await assertFails(usuarioAuditado('u-padm', 'u-ssol', { ativo: false }, 'update'))
  await assertSucceeds(getDoc(doc(db('u-padm'), 'usuarios/u-tec')))
  await assertFails(getDoc(doc(db('u-padm'), 'usuarios/u-tec2')))
})

test('ficha da prestadora: o gestor de Serviços configura só os serviços contratados', async () => {
  const configurar = (uid, dados) => {
    const f = db(uid), aid = `aud-${++_seq}`, lote = writeBatch(f)
    lote.set(doc(f, `auditoria/${aid}`), { autorId: uid, autorNome: 'T', em: serverTimestamp(), entidade: 'fornecedor', entidadeId: 'f1', acao: 'editar', antes: null, depois: null, empresaIds: [] })
    lote.update(doc(f, 'fornecedores/f1'), { ...dados, auditoriaId: aid })
    return lote.commit()
  }
  const servicos = [{ id: 's1', nome: 'Preventiva mensal', tipo: 'periodico', frequenciaDias: 30, prazoHoras: 0, unidades: ['un1'], inicio: '2026-11-01' }]
  await assertSucceeds(configurar('u-sges', { servicosContratados: servicos }))
  await assertFails(configurar('u-sges', { nomeExibicao: 'Outro nome' }))
  await assertFails(configurar('u-ssol', { servicosContratados: servicos }))
  await assertFails(configurar('u-tec', { servicosContratados: servicos }))
})

// ── Equipamentos ───────────────────────────────────────────────
const equip = (extra = {}) => ({
  etiqueta: 'AC-0001', tipo: 'ar_condicionado', descricao: 'Split 12.000 BTU', empresaId: 'e1', unidadeId: 'un1',
  unidadeNome: 'Posto Centro', status: 'uso', precoNovo: 3000, custos: [], criadoEm: agora(), atualizadoEm: agora(), ...extra,
})
// O contador do prefixo sobe 1 no mesmo lote (_meta/contadorEquip-AC)
const cadastrar = (uid, id, extra = {}) => comEvento(uid, 'equipamentos', id, equip(extra), {
  tipo: 'set', extra: (l, f) => l.set(doc(f, '_meta/contadorEquip-AC'), { total: increment(1) }, { merge: true }),
})
test('equipamentos: o responsável e o gestor cadastram, com a etiqueta do contador', async () => {
  await assertSucceeds(cadastrar('u-eqres', 'q1'))
  await assertFails(cadastrar('u-eqres', 'q2', { etiqueta: 'AC-0009' }), 'etiqueta fora do contador')
  await assertSucceeds(cadastrar('u-eqges', 'q3', { etiqueta: 'AC-0002' }))
  await assertFails(cadastrar('u-eqcon', 'q4', { etiqueta: 'AC-0003' }), 'consulta não cadastra')
  await assertFails(cadastrar('u-ssol', 'q4', { etiqueta: 'AC-0003' }))
  await assertFails(cadastrar('u-eqres', 'q4', { etiqueta: 'AC-0003', unidadeId: 'un2' }), 'unidade de outra empresa')
  // Leitura: quem tem Equipamentos ou Serviços na empresa
  await assertSucceeds(getDoc(doc(db('u-eqcon'), 'equipamentos/q1')))
  await assertSucceeds(getDoc(doc(db('u-ssol'), 'equipamentos/q1')))
  await assertFails(getDoc(doc(db('u-comp'), 'equipamentos/q1')))
  await assertFails(getDoc(doc(db('u-tec'), 'equipamentos/q1')))
})

test('equipamentos: o responsável registra conserto e movimento; baixa e preço só o gestor', async () => {
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'equipamentos/q1'), { ...equip(), criadoEm: new Date(), atualizadoEm: new Date() }) })
  const mudar = (uid, dados) => comEvento(uid, 'equipamentos', 'q1', dados)
  await assertSucceeds(mudar('u-eqres', { status: 'conserto', conserto: { oficina: 'Ponto Frio', motivo: 'Não liga', desde: '2026-11-27' } }))
  await assertFails(mudar('u-eqcon', { setor: 'Loja' }))
  await assertFails(mudar('u-eqres', { status: 'baixado' }), 'baixa é do gestor')
  await assertFails(mudar('u-eqres', { precoNovo: 1 }), 'preço de referência é do gestor')
  await assertFails(mudar('u-eqres', { etiqueta: 'AC-0099' }), 'a etiqueta não muda')
  await assertSucceeds(mudar('u-eqges', { status: 'baixado', baixa: { motivo: 'Sem conserto', em: '2026-11-27' } }))
  await assertFails(updateDoc(doc(db('u-eqges'), 'equipamentos/q1'), { setor: 'X', atualizadoEm: agora() }), 'sem a entrada do histórico')
})

test('o custo de um chamado confirmado entra no aparelho pelo Serviços', async () => {
  await env.withSecurityRulesDisabled(async c => {
    const f = c.firestore()
    await setDoc(doc(f, 'equipamentos/q1'), { ...equip({ custos: [{ data: '2026-10-01', valor: 100 }] }), criadoEm: new Date(), atualizadoEm: new Date() })
    await setDoc(doc(f, 'chamados/c1'), { ...chamadoNovo({ status: 'confirmado', equipamentoId: 'q1' }), criadoEm: new Date(), atualizadoEm: new Date() })
    await setDoc(doc(f, 'chamados/c2'), { ...chamadoNovo({ status: 'concluido', equipamentoId: 'q1' }), criadoEm: new Date(), atualizadoEm: new Date() })
  })
  const custo = (uid, chamadoId, custos) => comEvento(uid, 'equipamentos', 'q1', { custos })
  await assertSucceeds(custo('u-ssol', 'c1', [{ data: '2026-10-01', valor: 100 }, { data: '2026-11-27', valor: 380, chamadoId: 'c1' }]))
  await assertFails(custo('u-ssol', 'c2', [{ data: '2026-10-01', valor: 100 }, { data: '2026-11-27', valor: 380, chamadoId: 'c1' }, { data: '2026-11-27', valor: 1, chamadoId: 'c2' }]), 'chamado não confirmado')
  await assertFails(custo('u-ssol2', 'c1', [{ data: '2026-11-27', valor: 0, chamadoId: 'c1' }]), 'apagando os custos de antes')
})

test('contagem da unidade: o responsável registra; a consulta só lê', async () => {
  const contar = uid => setDoc(doc(db(uid), `contagens/k${++_seq}`), { empresaId: 'e1', unidadeId: 'un1', unidadeNome: 'Posto Centro', porId: uid, porNome: 'R', em: agora(), encontrados: ['q1'], faltando: [], foraDoLugar: [], total: 1 })
  await assertSucceeds(contar('u-eqres'))
  await assertFails(contar('u-eqcon'))
  await assertFails(contar('u-ssol'))
})

// ── Demo ───────────────────────────────────────────────────────
test('demo: a conta demo mexe só nos chamados e equipamentos da demonstração', async () => {
  await semear('c1')
  await assertSucceeds(setDoc(doc(demo(), 'chamados/demo-ch-1'), { ...chamadoNovo({ empresaId: 'demo-nexara' }), isDemo: true }))
  await assertFails(getDoc(doc(demo(), 'chamados/c1')))
  await assertFails(setDoc(doc(demo(), 'chamados/c9'), chamadoNovo()))
  await assertSucceeds(setDoc(doc(demo(), 'equipamentos/demo-eq-1'), { ...equip({ empresaId: 'demo-nexara' }), isDemo: true }))
})

// ── Storage: fotos dos chamados ────────────────────────────────
test('fotos no Storage: o técnico no atendimento; quem vê o chamado lê; ninguém apaga', async () => {
  await semear('c1', { status: 'atendimento', tecnicoId: 'u-tec' })
  const st = uid => ctx(uid).storage()
  const jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])
  const enviar = (uid, autor = uid) => uploadBytes(ref(st(uid), 'chamados/c1/fotos/f1.jpg'), jpg, { contentType: 'image/jpeg', customMetadata: { autorUid: autor } })
  await assertFails(enviar('u-ssol'), 'quem pediu só envia na abertura')
  await assertFails(enviar('u-tec2'))
  await assertFails(enviar('u-tec', 'u-ssol'), 'assinado por outro')
  await assertSucceeds(enviar('u-tec'))
  await assertSucceeds(getBytes(ref(st('u-ssol'), 'chamados/c1/fotos/f1.jpg')))
  await assertFails(getBytes(ref(st('u-comp'), 'chamados/c1/fotos/f1.jpg')))
  await assertFails(deleteObject(ref(st('u-tec'), 'chamados/c1/fotos/f1.jpg')))
})
