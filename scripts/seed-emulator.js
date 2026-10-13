/**
 * Seed do emulador Firebase — Praxis
 *
 * Uso (com o emulador no ar em localhost:9090 / localhost:9099):
 *   node _build/seed-emulator.js
 *
 * O que faz:
 *   1. Apaga dados de demo existentes no emulador
 *   2. Cria as 6 contas de Auth (uma por perfil) com senha "demo1234"
 *   3. Cria usuários no Firestore vinculados às empresas
 *   4. Cria empresas, categorias, fornecedores e 33 pedidos (com subcoleções)
 *   5. Define Custom Claims via Admin SDK (perfil + empresas[])
 *
 * Datas relativas: campos diasAtras (histórico/comentários) e vencimentoDias
 * (parcelas) são calculados relativamente à data de hoje, garantindo que os
 * dados nunca "envelheçam".
 */

'use strict'

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:9090'
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099'

// firebase-admin vem das dependências das Functions: o seed roda de qualquer pasta
const admin = require(require.resolve('firebase-admin', { paths: [require('path').join(__dirname, '..', 'functions')] }))
const seed  = require('../functions/seed.json')

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'praxis-af618' })
const db   = admin.firestore()
const auth = admin.auth()

// ── Helpers ─────────────────────────────────────────────────────────────────

const agora = new Date()

function ts(diasAtras) {
  if (diasAtras == null) return admin.firestore.Timestamp.now()
  const d = new Date(agora)
  d.setDate(d.getDate() - diasAtras)
  d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0)
  return admin.firestore.Timestamp.fromDate(d)
}

function isoMaisDias(n) {
  const d = new Date(agora)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const agoraTs = admin.firestore.Timestamp.now()

// As datas fixas do seed (necessidade, compra, entrega, vencimento) foram
// escritas para seed._dataReferencia; todas andam a mesma distância até hoje,
// para o demo não envelhecer (mesma regra do _aplicarSeed das Functions)
const _refSeed  = seed._dataReferencia ? new Date(seed._dataReferencia + 'T12:00:00') : null
const _hojeMeio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12)
const _desloc   = _refSeed ? Math.round((_hojeMeio - _refSeed) / 864e5) : 0
function deslocar(iso) {
  if (!iso || !_desloc) return iso
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + _desloc)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Usuários por perfil ──────────────────────────────────────────────────────
// Senha padrão de teste: demo1234
// Em produção estes usuários não existem — são só para testes no emulador.

const USUARIOS_SEED = [
  {
    email: 'supremo@praxis.app',
    senha: 'demo1234',
    nome: 'Artur Mendes',
    perfil: 'supremo',
    cargo: 'CEO',
  },
  {
    email: 'gestor@praxis.app',
    senha: 'demo1234',
    nome: 'Beatriz Nunes',
    perfil: 'gestor',
    cargo: 'Gerente Geral',
  },
  {
    email: 'aprovador@praxis.app',
    senha: 'demo1234',
    nome: 'Carlos Ferreira',
    perfil: 'aprovador',
    cargo: 'Diretor de Compras',
  },
  {
    email: 'comprador@praxis.app',
    senha: 'demo1234',
    nome: 'Diana Alves',
    perfil: 'comprador',
    cargo: 'Analista de Compras',
  },
  {
    email: 'financeiro@praxis.app',
    senha: 'demo1234',
    nome: 'Eduardo Lima',
    perfil: 'financeiro',
    cargo: 'Analista Financeiro',
  },
  {
    email: 'solicitante@praxis.app',
    senha: 'demo1234',
    nome: 'Fernanda Costa',
    perfil: 'solicitante',
    cargo: 'Colaboradora',
  },
  {
    // Conta demo "unificada" — usada pelo botão Modo Demo (perfil supremo)
    email: 'demo@praxis.app',
    senha: 'demo1234',
    nome: 'Demo Praxis',
    perfil: 'supremo',
    cargo: 'Demo',
  },
]

// ── Categorias padrão ────────────────────────────────────────────────────────

const CATEGORIAS = [
  { key: 'manutencao',  nome: 'Manutenção',       cor: '#E05040' },
  { key: 'escritorio',  nome: 'Escritório',        cor: '#5BA3E0' },
  { key: 'operacional', nome: 'Operacional',       cor: '#C8A96E' },
  { key: 'alimentacao', nome: 'Alimentação',       cor: '#4EC08A' },
  { key: 'uniformes',   nome: 'Uniformes e EPIs',  cor: '#A07FD0' },
  { key: 'marketing',   nome: 'Marketing',         cor: '#E0A040' },
  { key: 'ti',          nome: 'TI',                cor: '#40B8D0' },
  { key: 'servicos',    nome: 'Serviços',          cor: '#8A8278' },
  // 2 categorias personalizadas
  { key: 'seguranca',   nome: 'Segurança',         cor: '#D05080', tipo: 'personalizada' },
  { key: 'rh',          nome: 'Recursos Humanos',  cor: '#80A060', tipo: 'personalizada' },
]

// ── Limpar dados existentes ──────────────────────────────────────────────────

async function limparDados() {
  console.log('Limpando dados demo existentes...')
  const colecoes = ['pedidos', 'empresas', 'categorias', 'fornecedores', 'usuarios']

  for (const col of colecoes) {
    const snap = await db.collection(col).get()
    // Limpeza em batches de 500
    const docs = snap.docs
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch()
      docs.slice(i, i + 400).forEach(d => batch.delete(d.ref))
      await batch.commit()
    }
    if (docs.length) console.log(`  Removidos ${docs.length} docs de /${col}`)
  }

  // Limpa notificações
  const notifSnap = await db.collection('notificacoes').get()
  for (const userDoc of notifSnap.docs) {
    const itemsSnap = await userDoc.ref.collection('items').get()
    const batch = db.batch()
    itemsSnap.docs.forEach(d => batch.delete(d.ref))
    batch.delete(userDoc.ref)
    await batch.commit()
  }

  // Limpa usuários do Auth do emulador
  try {
    const listResult = await auth.listUsers(100)
    for (const user of listResult.users) {
      await auth.deleteUser(user.uid)
    }
    if (listResult.users.length) console.log(`  Removidos ${listResult.users.length} usuários do Auth`)
  } catch (e) {
    console.warn('  Aviso ao limpar Auth:', e.message)
  }
}

// ── Criar usuários ────────────────────────────────────────────────────────────

async function criarUsuarios(todasEmpresasIds) {
  console.log('Criando usuários...')
  const mapaUsuarios = {}  // email => { id, perfil }

  for (const u of USUARIOS_SEED) {
    let uid
    try {
      const record = await auth.createUser({
        email:         u.email,
        password:      u.senha,
        displayName:   u.nome,
        emailVerified: true,
      })
      uid = record.uid
    } catch (e) {
      console.warn(`  Aviso ao criar Auth para ${u.email}:`, e.message)
      continue
    }

    // Custom Claims
    await auth.setCustomUserClaims(uid, {
      perfil:   u.perfil,
      empresas: todasEmpresasIds,
    })

    // Doc no Firestore
    await db.collection('usuarios').doc(uid).set({
      nome:         u.nome,
      email:        u.email,
      perfil:       u.perfil,
      cargo:        u.cargo,
      empresas:     todasEmpresasIds,
      ativo:        true,
      criadoEm:     agoraTs,
      atualizadoEm: agoraTs,
    })

    mapaUsuarios[u.email] = { id: uid, perfil: u.perfil }
    console.log(`  ✓ ${u.email} (${u.perfil})`)
  }

  return mapaUsuarios
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Praxis — Seed do Emulador ===')
  console.log(`Data base: ${agora.toISOString()}\n`)

  await limparDados()

  // 1. Empresas
  console.log('\nCriando empresas...')
  const empresaMap = {}
  const empBatch = db.batch()
  for (const emp of seed.empresas || []) {
    const ref = db.collection('empresas').doc()
    const { key, ...empData } = emp
    empBatch.set(ref, { ...empData, isDemo: true, criadaEm: agoraTs })
    if (key) empresaMap[key] = ref.id
  }
  await empBatch.commit()
  const todasEmpresasIds = Object.values(empresaMap)
  console.log('  Empresas:', JSON.stringify(empresaMap))

  // 2. Usuários (Auth + Firestore + Custom Claims)
  const mapaUsuarios = await criarUsuarios(todasEmpresasIds)
  const demoUserId   = mapaUsuarios['demo@praxis.app']?.id
  const solicitanteId = demoUserId || 'demo'
  const solicitanteNome = 'Demo Praxis'

  // 3. Categorias
  console.log('\nCriando categorias...')
  const categoriaMap = {}
  for (const cat of CATEGORIAS) {
    const ref = await db.collection('categorias').add({
      nome:     cat.nome,
      cor:      cat.cor,
      tipo:     cat.tipo || 'padrao',
      isDemo:   true,
      criadaEm: agoraTs,
    })
    categoriaMap[cat.key] = ref.id
  }
  console.log(`  ${CATEGORIAS.length} categorias criadas`)

  // 4. Fornecedores
  console.log('\nCriando fornecedores...')
  const fornMap = {}
  for (const forn of seed.fornecedores || []) {
    const { usos, ...fornData } = forn
    const nomeNorm = normalizar(forn.nome)
    const ref = await db.collection('fornecedores').add({
      ...fornData,
      nome:         nomeNorm,
      nomeExibicao: forn.nome,
      ativo:        true,
      isDemo:       true,
      criadoEm:     agoraTs,
    })
    fornMap[nomeNorm] = ref.id
  }
  console.log(`  ${Object.keys(fornMap).length} fornecedores criados`)

  // 5. Pedidos
  console.log('\nCriando pedidos...')
  let totalPedidos = 0

  for (const ped of seed.pedidos || []) {
    const {
      empresaKey, categoriaKey, key,
      historico, comentarios, cotacoes, parcelas,
      ...pedData
    } = ped

    const empresaId   = empresaMap[empresaKey]     || todasEmpresasIds[0] || ''
    const categoriaId = categoriaMap[categoriaKey] || ''
    const hist        = historico || []
    const primeiroTs  = hist.length ? ts(hist[0].diasAtras) : agoraTs
    const ultimoTs    = hist.length ? ts(hist[hist.length - 1].diasAtras) : agoraTs

    const cotIndicada  = (cotacoes || []).find(c => c.indicada)
    const fornecedorId = cotIndicada ? (fornMap[normalizar(cotIndicada.fornecedorNome)] || null) : null

    for (const campo of ['dataNecessaria', 'dataCompra', 'dataEntrega']) {
      if (pedData[campo]) pedData[campo] = deslocar(pedData[campo])
    }

    const numeroPedido = `PRX-${String(totalPedidos + 1).padStart(4, '0')}`
    const pedRef = db.collection('pedidos').doc()
    await pedRef.set({
      ...pedData,
      empresaId,
      categoriaId,
      solicitanteId,
      solicitanteNome,
      numeroPedido,
      compradorId:              pedData.dataCompra ? solicitanteId : null,
      compradorAssumiuEm:       pedData.dataCompra ? ts(hist[1]?.diasAtras ?? 1) : null,
      aprovadorIds:             [],
      aprovadoPor:              null,
      aprovadoEm:               ['aprovado','comprado','entregue','pago'].includes(pedData.status)
                                  ? ts(hist.find(h => h.status === 'aprovado')?.diasAtras ?? 5)
                                  : null,
      reprovadoPor:             pedData.status === 'reprovado' ? solicitanteId : null,
      reprovadoEm:              pedData.status === 'reprovado'
                                  ? ts(hist.find(h => h.status === 'reprovado')?.diasAtras ?? 3)
                                  : null,
      canceladoPor:             pedData.status === 'cancelado' ? solicitanteId : null,
      canceladoEm:              pedData.status === 'cancelado'
                                  ? ts(hist.find(h => h.status === 'cancelado')?.diasAtras ?? 3)
                                  : null,
      motivoCancelamento:       pedData.motivoCancelamento || null,
      motivoCancelamentoOutros: pedData.motivoCancelamentoOutros || null,
      motivoReprovacao:         pedData.motivoReprovacao || null,
      motivoReprovacaoOutros:   pedData.motivoReprovacaoOutros || null,
      fornecedorId,
      isDemo:       true,
      criadoEm:     primeiroTs,
      atualizadoEm: ultimoTs,
    })

    // Histórico
    if (hist.length) {
      const batch = db.batch()
      hist.forEach(h => {
        batch.set(pedRef.collection('historico').doc(), {
          status:   h.status,
          nota:     h.nota || null,
          autorId:  solicitanteId,
          criadoEm: ts(h.diasAtras),
        })
      })
      await batch.commit()
    }

    // Comentários
    if (comentarios?.length) {
      const batch = db.batch()
      comentarios.forEach(c => {
        batch.set(pedRef.collection('comentarios').doc(), {
          texto:    c.texto,
          autorId:  solicitanteId,
          criadoEm: ts(c.diasAtras),
        })
      })
      await batch.commit()
    }

    // Cotações
    if (cotacoes?.length) {
      const batch = db.batch()
      cotacoes.forEach(cot => {
        const fId = fornMap[normalizar(cot.fornecedorNome)] || null
        batch.set(pedRef.collection('cotacoes').doc(), {
          fornecedorId:        fId,
          fornecedorNome:      cot.fornecedorNome,
          valor:               cot.valor,
          prazoEntrega:        cot.prazoEntrega || null,
          condicoesComerciais: cot.condicoesComerciais || null,
          indicada:            cot.indicada === true,
          registradoPor:       solicitanteId,
          criadoEm:            agoraTs,
        })
      })
      await batch.commit()
    }

    // Parcelas
    if (parcelas?.length) {
      const batch = db.batch()
      parcelas.forEach(p => {
        const vencimento = p.vencimentoDias != null
          ? isoMaisDias(p.vencimentoDias)
          : deslocar(p.vencimento)
        batch.set(pedRef.collection('parcelas').doc(), {
          numero:    p.numero,
          total:     p.total,
          valor:     p.valor,
          vencimento,
          pago:      p.pago === true,
          pagoEm:    p.pago && p.diasAtras != null ? ts(p.diasAtras) : null,
          criadoEm:  agoraTs,
        })
      })
      await batch.commit()
    }

    totalPedidos++
  }

  console.log(`  ${totalPedidos} pedidos criados com subcoleções`)

  // Atualiza contador atômico para que novos pedidos continuem a sequência
  await db.collection('_meta').doc('contadores').set({ totalPedidos })
  console.log(`  _meta/contadores atualizado: totalPedidos=${totalPedidos}`)

  console.log('\n=== Seed concluído! ===')
  console.log('\nContas de teste (senha: demo1234):')
  USUARIOS_SEED.forEach(u => console.log(`  ${u.perfil.padEnd(12)} | ${u.email}`))
  console.log('\nAbra http://localhost:5000 para acessar o app.')
  console.log('UI do emulador: http://localhost:4000\n')
}

main().catch(err => {
  console.error('ERRO no seed:', err)
  process.exit(1)
})
