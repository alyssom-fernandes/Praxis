const { onSchedule } = require('firebase-functions/v2/scheduler')
const admin = require('firebase-admin')
const { criarNotificacao, buscarUsuariosPorPerfil } = require('./utils')
const { enviarEmail } = require('./email')

const db = admin.firestore()

// ── checkClaimTimeout ──────────────────────────────────────────
// Roda a cada hora — verifica pedidos sem comprador há muito tempo
exports.checkClaimTimeout = onSchedule(
  { schedule: 'every 1 hours', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    const agora    = new Date()
    const h48      = new Date(agora.getTime() - 48 * 3600 * 1000)
    const h4       = new Date(agora.getTime() - 4  * 3600 * 1000)

    const snap = await db.collection('pedidos')
      .where('status', '==', 'solicitado')
      .where('compradorId', '==', null)
      .get()

    for (const doc of snap.docs) {
      const pedido   = { id: doc.id, ...doc.data() }
      const criadoTs = pedido.criadoEm?.toDate?.() || new Date(0)
      const isUrgente = pedido.urgente
      const limite   = isUrgente ? h4 : h48

      if (criadoTs <= limite) {
        const gestores = await buscarUsuariosPorPerfil(['gestor', 'supremo'], pedido.empresaId)
        const label    = isUrgente ? '4h' : '48h'
        await Promise.all(gestores.map(u =>
          criarNotificacao(u.id, {
            evento:   'pedido_parado',
            titulo:   `Pedido parado ha ${label} sem comprador`,
            corpo:    `"${pedido.titulo}" ainda nao foi assumido por nenhum comprador.`,
            pedidoId: pedido.id,
          })
        ))
        await Promise.all(gestores.map(u =>
          enviarEmail({ to: u.email, evento: 'pedido_parado', pedido, usuario: u })
        ))
      }
    }
  }
)

// ── checkParcelasVencendo ──────────────────────────────────────
// Roda as 8h — verifica parcelas com vencimento em 3 dias
exports.checkParcelasVencendo = onSchedule(
  { schedule: 'every day 08:00', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    const hoje  = _isoHoje()
    const em3   = _isoMaisDias(3)

    const snap = await db.collectionGroup('parcelas')
      .where('pago', '==', false)
      .where('vencimento', '>=', hoje)
      .where('vencimento', '<=', em3)
      .get()

    for (const doc of snap.docs) {
      const parcela  = { id: doc.id, ...doc.data() }
      const pedidoId = doc.ref.parent.parent.id
      const pedSnap  = await db.collection('pedidos').doc(pedidoId).get()
      if (!pedSnap.exists) continue
      const pedido   = { id: pedidoId, ...pedSnap.data() }

      const destinatarios = await buscarUsuariosPorPerfil(['financeiro', 'gestor', 'supremo'], pedido.empresaId)
      await Promise.all(destinatarios.map(u =>
        criarNotificacao(u.id, {
          evento:   'parcela_vencendo',
          titulo:   'Parcela vencendo em breve',
          corpo:    `Parcela ${parcela.numero}/${parcela.total} de "${pedido.titulo}" vence em ${_formatarData(parcela.vencimento)}.`,
          pedidoId: pedidoId,
        })
      ))
      await Promise.all(destinatarios.map(u =>
        enviarEmail({ to: u.email, evento: 'parcela_vencendo', pedido: { ...pedido, parcela }, usuario: u })
      ))
    }
  }
)

// ── checkParcelasVencidas ──────────────────────────────────────
// Roda as 8h — verifica parcelas ja vencidas
exports.checkParcelasVencidas = onSchedule(
  { schedule: 'every day 08:00', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    const hoje = _isoHoje()

    const snap = await db.collectionGroup('parcelas')
      .where('pago', '==', false)
      .where('vencimento', '<', hoje)
      .get()

    for (const doc of snap.docs) {
      const parcela  = { id: doc.id, ...doc.data() }
      const pedidoId = doc.ref.parent.parent.id
      const pedSnap  = await db.collection('pedidos').doc(pedidoId).get()
      if (!pedSnap.exists) continue
      const pedido   = { id: pedidoId, ...pedSnap.data() }

      const destinatarios = await buscarUsuariosPorPerfil(['financeiro', 'gestor', 'supremo'], pedido.empresaId)
      await Promise.all(destinatarios.map(u =>
        criarNotificacao(u.id, {
          evento:   'parcela_vencida',
          titulo:   'Parcela vencida!',
          corpo:    `Parcela ${parcela.numero}/${parcela.total} de "${pedido.titulo}" venceu em ${_formatarData(parcela.vencimento)}.`,
          pedidoId: pedidoId,
        })
      ))
      await Promise.all(destinatarios.map(u =>
        enviarEmail({ to: u.email, evento: 'parcela_vencida', pedido: { ...pedido, parcela }, usuario: u })
      ))
    }
  }
)

// ── Logica central do reset demo (reutilizavel por triggerDemoSeed) ─────────
async function _executarDemoReset() {
  console.log('Iniciando reset do modo demo...')

  const colecoes = ['pedidos', 'empresas', 'categorias', 'fornecedores']

  for (const col of colecoes) {
    const snap = await db.collection(col).where('isDemo', '==', true).get()
    const batch = db.batch()
    snap.docs.forEach(doc => {
      if (col === 'pedidos') _deletarSubcolecoes(doc.id)
      batch.delete(doc.ref)
    })
    await batch.commit()
    console.log(`Deletados ${snap.size} documentos demo em /${col}`)
  }

  // Deleta notificacoes do usuario demo
  const demoUser = await _buscarUsuarioDemo()
  if (demoUser) {
    const notifSnap = await db.collection('notificacoes').doc(demoUser.id).collection('items').get()
    const batch = db.batch()
    notifSnap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }

  // Re-seed (seed.json esta dentro de functions/)
  const seed = require('../seed.json')
  await _aplicarSeed(seed)
  console.log('Seed aplicado com sucesso.')
}

// Exporta para uso pelo triggerDemoSeed no index.js
exports.__runDemoReset = _executarDemoReset

// ── demoReset ─────────────────────────────────────────────────
// Roda todo domingo as 3h — limpa e recria dados de demo
exports.demoReset = onSchedule(
  { schedule: 'every sunday 03:00', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => { await _executarDemoReset() }
)

// ── Helpers ───────────────────────────────────────────────────
async function _deletarSubcolecoes(pedidoId) {
  const subs = ['cotacoes', 'comentarios', 'parcelas', 'historico']
  for (const sub of subs) {
    const snap = await db.collection('pedidos').doc(pedidoId).collection(sub).get()
    const batch = db.batch()
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
}

async function _buscarUsuarioDemo() {
  const snap = await db.collection('usuarios').where('email', '==', 'demo@praxis.app').limit(1).get()
  if (snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

// Normaliza nome de fornecedor (igual ao normalizarTexto do cliente)
function _normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

async function _aplicarSeed(seed) {
  const agora = new Date()

  // Converte diasAtras em Timestamp real
  function _ts(diasAtras) {
    if (diasAtras == null) return admin.firestore.Timestamp.now()
    const d = new Date(agora)
    d.setDate(d.getDate() - diasAtras)
    // Hora aleatória entre 8h e 18h para parecer natural
    d.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0)
    return admin.firestore.Timestamp.fromDate(d)
  }

  const agoraTs = admin.firestore.Timestamp.now()

  // 1. Cria fornecedores demo e mapeia nome normalizado => id
  // (nome normalizado para coincidir com a query de _executarCompra no cliente)
  const fornMap = {}
  for (const forn of (seed.fornecedores || [])) {
    const { usos, ...fornData } = forn
    const nomeNorm = _normalizar(forn.nome)
    const ref = await db.collection('fornecedores').add({
      ...fornData,
      nome: nomeNorm,          // armazenado normalizado (igual ao que o cliente usa)
      nomeExibicao: forn.nome, // nome original para exibição
      ativo: true,
      isDemo: true,
      criadoEm: agoraTs,
    })
    fornMap[nomeNorm] = ref.id
  }
  console.log('Fornecedores demo criados:', Object.keys(fornMap).length)

  // 2. Cria empresas e mapeia key => id real
  const empresaMap = {}
  const empBatch = db.batch()
  for (const emp of (seed.empresas || [])) {
    const ref = db.collection('empresas').doc()
    const { key, ...empData } = emp
    empBatch.set(ref, { ...empData, isDemo: true, criadaEm: agoraTs })
    if (key) empresaMap[key] = ref.id
  }
  await empBatch.commit()
  console.log('Empresas demo criadas:', empresaMap)

  // 3. Garante categorias — cria se nao existirem
  const catSnap = await db.collection('categorias').limit(1).get()
  const categoriaMap = {}
  if (catSnap.empty) {
    const cats = [
      { key: 'manutencao', nome: 'Manutencao',       cor: '#E05040' },
      { key: 'escritorio', nome: 'Escritorio',        cor: '#5BA3E0' },
      { key: 'operacional',nome: 'Operacional',       cor: '#C8A96E' },
      { key: 'alimentacao',nome: 'Alimentacao',       cor: '#4EC08A' },
      { key: 'uniformes',  nome: 'Uniformes e EPIs',  cor: '#A07FD0' },
      { key: 'marketing',  nome: 'Marketing',         cor: '#E0A040' },
      { key: 'ti',         nome: 'TI',                cor: '#40B8D0' },
      { key: 'servicos',   nome: 'Servicos',          cor: '#8A8278' },
    ]
    for (const cat of cats) {
      const ref = await db.collection('categorias').add({ nome: cat.nome, cor: cat.cor, tipo: 'padrao', criadaEm: agoraTs })
      categoriaMap[cat.key] = ref.id
    }
  } else {
    const allCats = await db.collection('categorias').get()
    const keyMap = {
      'Manutencao': 'manutencao', 'Escritorio': 'escritorio',
      'Operacional': 'operacional', 'Alimentacao': 'alimentacao',
      'Uniformes e EPIs': 'uniformes', 'Marketing': 'marketing',
      'TI': 'ti', 'Servicos': 'servicos',
    }
    allCats.docs.forEach(d => {
      const k = keyMap[d.data().nome]
      if (k) categoriaMap[k] = d.id
    })
    const fallbackId = allCats.docs[0]?.id || ''
    if (fallbackId) {
      ['manutencao','escritorio','operacional','alimentacao','uniformes','marketing','ti','servicos']
        .forEach(k => { if (!categoriaMap[k]) categoriaMap[k] = fallbackId })
    }
  }

  // 4. Busca usuario demo — vincula empresas criadas
  const demoUser = await _buscarUsuarioDemo()
  const solicitanteId = demoUser?.id || 'demo'
  const todasEmpresasIds = Object.values(empresaMap)

  if (demoUser) {
    await db.collection('usuarios').doc(demoUser.id).update({
      empresas: todasEmpresasIds,
      atualizadoEm: agoraTs,
    })
    try {
      await admin.auth().setCustomUserClaims(demoUser.id, {
        perfil:   demoUser.perfil || 'supremo',
        empresas: todasEmpresasIds,
      })
    } catch (e) {
      console.warn('Nao foi possivel atualizar claims do demo:', e.message)
    }
    console.log('Empresas do usuario demo atualizadas:', todasEmpresasIds)
  }

  // 5. Cria pedidos com subcoleções
  for (const ped of (seed.pedidos || [])) {
    const {
      empresaKey, categoriaKey, key,
      historico, comentarios, cotacoes, parcelas,
      ...pedData
    } = ped

    const empresaId   = empresaMap[empresaKey]     || todasEmpresasIds[0] || ''
    const categoriaId = categoriaMap[categoriaKey] || ''

    // Determina timestamps com base no histórico (primeiro entry = criadoEm)
    const hist        = historico || []
    const primeiroTs  = hist.length ? _ts(hist[0].diasAtras) : agoraTs
    const ultimoTs    = hist.length ? _ts(hist[hist.length - 1].diasAtras) : agoraTs

    // Identifica fornecedor indicado
    const cotIndicada  = (cotacoes || []).find(c => c.indicada)
    const fornecedorId = cotIndicada ? (fornMap[_normalizar(cotIndicada.fornecedorNome)] || null) : null

    const pedRef = db.collection('pedidos').doc()
    await pedRef.set({
      ...pedData,
      empresaId,
      categoriaId,
      solicitanteId,
      compradorId:              pedData.dataCompra ? solicitanteId : null,
      compradorAssumiuEm:       pedData.dataCompra ? _ts((hist[1]?.diasAtras) ?? 1) : null,
      aprovadorIds:             [],
      aprovadoPor:              null,
      aprovadoEm:               pedData.status === 'aprovado' || ['comprado','entregue','pago'].includes(pedData.status)
                                  ? _ts(hist.find(h => h.status === 'aprovado')?.diasAtras ?? 5)
                                  : null,
      reprovadoPor:             pedData.status === 'reprovado' ? solicitanteId : null,
      reprovadoEm:              pedData.status === 'reprovado'
                                  ? _ts(hist.find(h => h.status === 'reprovado')?.diasAtras ?? 3)
                                  : null,
      canceladoPor:             pedData.status === 'cancelado' ? solicitanteId : null,
      canceladoEm:              pedData.status === 'cancelado'
                                  ? _ts(hist.find(h => h.status === 'cancelado')?.diasAtras ?? 3)
                                  : null,
      motivoCancelamento:       pedData.motivoCancelamento || null,
      motivoCancelamentoOutros: pedData.motivoCancelamentoOutros || null,
      motivoReprovacao:         pedData.motivoReprovacao || null,
      motivoReprovacaoOutros:   pedData.motivoReprovacaoOutros || null,
      fornecedorId,
      isDemo:      true,
      criadoEm:    primeiroTs,
      atualizadoEm: ultimoTs,
    })

    // 5a. Histórico
    if (hist.length) {
      const histBatch = db.batch()
      hist.forEach(h => {
        const ref = pedRef.collection('historico').doc()
        histBatch.set(ref, {
          status:   h.status,
          nota:     h.nota || null,
          autorId:  solicitanteId,
          criadoEm: _ts(h.diasAtras),
        })
      })
      await histBatch.commit()
    }

    // 5b. Comentários
    if (comentarios?.length) {
      const comBatch = db.batch()
      comentarios.forEach(c => {
        const ref = pedRef.collection('comentarios').doc()
        comBatch.set(ref, {
          texto:    c.texto,
          autorId:  solicitanteId,
          criadoEm: _ts(c.diasAtras),
        })
      })
      await comBatch.commit()
    }

    // 5c. Cotações
    if (cotacoes?.length) {
      const cotBatch = db.batch()
      cotacoes.forEach(cot => {
        const ref = pedRef.collection('cotacoes').doc()
        const fId = fornMap[_normalizar(cot.fornecedorNome)] || null
        cotBatch.set(ref, {
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
      await cotBatch.commit()
    }

    // 5d. Parcelas
    if (parcelas?.length) {
      const parBatch = db.batch()
      parcelas.forEach(p => {
        const ref = pedRef.collection('parcelas').doc()
        parBatch.set(ref, {
          numero:     p.numero,
          total:      p.total,
          valor:      p.valor,
          vencimento: p.vencimento,
          pago:       p.pago === true,
          pagoEm:     p.pago && p.diasAtras != null ? _ts(p.diasAtras) : null,
          criadoEm:   agoraTs,
        })
      })
      await parBatch.commit()
    }
  }
  console.log(`${seed.pedidos?.length || 0} pedidos demo criados com subcoleções.`)
}

function _isoHoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function _isoMaisDias(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function _formatarData(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
