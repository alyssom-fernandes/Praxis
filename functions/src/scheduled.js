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
            titulo:   `Pedido parado há ${label} sem comprador`,
            corpo:    `"${pedido.titulo}" ainda não foi assumido por nenhum comprador.`,
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
// Roda às 8h — verifica parcelas com vencimento em 3 dias
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
          titulo:   'Parcela vencendo em breve ⏰',
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
// Roda às 8h — verifica parcelas já vencidas
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
          titulo:   'Parcela vencida! 🔴',
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

// ── demoReset ─────────────────────────────────────────────────
// Roda todo domingo às 3h — limpa e recria dados de demo
exports.demoReset = onSchedule(
  { schedule: 'every sunday 03:00', region: 'southamerica-east1', timeZone: 'America/Sao_Paulo' },
  async () => {
    console.log('Iniciando reset do modo demo…')

    const colecoes = ['pedidos', 'empresas', 'categorias', 'fornecedores']

    for (const col of colecoes) {
      const snap = await db.collection(col).where('isDemo', '==', true).get()
      const batch = db.batch()
      snap.docs.forEach(doc => {
        // Deleta subcoleções dos pedidos demo
        if (col === 'pedidos') {
          _deletarSubcolecoes(doc.id)
        }
        batch.delete(doc.ref)
      })
      await batch.commit()
      console.log(`Deletados ${snap.size} documentos demo em /${col}`)
    }

    // Deleta notificações do usuário demo
    const demoUser = await _buscarUsuarioDemo()
    if (demoUser) {
      const notifSnap = await db.collection('notificacoes').doc(demoUser.id).collection('items').get()
      const batch = db.batch()
      notifSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
    }

    // Re-seed a partir do seed.json
    try {
      const seed = require('../../assets/demo/seed.json')
      await _aplicarSeed(seed)
      console.log('Seed aplicado com sucesso.')
    } catch (err) {
      console.error('Erro ao aplicar seed:', err)
    }
  }
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

async function _aplicarSeed(seed) {
  const agora = admin.firestore.FieldValue.serverTimestamp()
  const batch = db.batch()

  // Empresas
  for (const emp of (seed.empresas || [])) {
    const ref = db.collection('empresas').doc()
    batch.set(ref, { ...emp, isDemo: true, criadaEm: agora })
  }

  await batch.commit()

  // Pedidos (em lotes menores)
  for (const ped of (seed.pedidos || [])) {
    const ref = db.collection('pedidos').doc()
    await ref.set({ ...ped, isDemo: true, criadoEm: agora, atualizadoEm: agora })
  }
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
