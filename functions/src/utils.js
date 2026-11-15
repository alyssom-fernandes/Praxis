const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore')
const { enviarEmail } = require('./email')
const { distribuir, quemBuscar } = require('./avisos')
const db = getFirestore()

// As marcas de aviso entregue podem sair depois deste prazo (política de TTL
// do Firestore sobre o campo expiraEm, se for ligada)
const DIAS_GUARDANDO_MARCA = 120

// ── Cria uma notificação in-app para um usuário ───────────────
// Com id, a gravação só acontece uma vez: devolve false se já existia
async function criarNotificacao(userId, { evento, titulo, corpo, pedidoId = null }, id = null) {
  if (!userId) return false
  const itens = db.collection('notificacoes').doc(userId).collection('items')
  const dados = { evento, titulo, corpo, pedidoId, lida: false, criadaEm: FieldValue.serverTimestamp() }
  try {
    if (id) await itens.doc(id).create(dados)
    else await itens.add(dados)
    return true
  } catch (err) {
    if (err.code === 6) return false // ALREADY_EXISTS: este aviso já foi entregue
    console.error(`criarNotificacao error (${userId}):`, err.message)
    return false
  }
}

// ── Pessoas candidatas aos avisos: as dos perfis e as dos IDs ──
async function buscarCandidatos(avisos) {
  const { perfis, ids } = quemBuscar(avisos)
  const [porPerfil, porId] = await Promise.all([
    perfis.length
      ? db.collection('usuarios').where('perfil', 'in', perfis).where('ativo', '==', true).get()
          .then(s => s.docs)
      : [],
    ids.length ? db.getAll(...ids.map(id => db.collection('usuarios').doc(id))) : [],
  ])
  return [...porPerfil, ...porId].filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }))
}

// ── Entrega os avisos uma vez só ──────────────────────────────
// chave identifica o aviso (o evento do gatilho, ou pedido + parcela +
// vencimento nas rotinas). A marca em _avisos/{chave} impede repetir o aviso
// na próxima rodada; o ID da notificação ({chave}__{uid}) impede repetir para a
// mesma pessoa se a entrega for interrompida e retomada. O e-mail só sai com a
// notificação nova.
async function entregarAvisos(chave, avisos, pedido) {
  if (!avisos.length) return 0
  const marca = db.collection('_avisos').doc(chave)
  if ((await marca.get()).exists) return 0

  const entregas = distribuir(avisos, pedido.empresaId, await buscarCandidatos(avisos))
  let novas = 0
  for (const { usuario, aviso } of entregas) {
    const nova = await criarNotificacao(usuario.id, {
      evento: aviso.evento, titulo: aviso.titulo, corpo: aviso.corpo, pedidoId: pedido.id,
    }, `${chave}__${usuario.id}`)
    if (!nova) continue
    novas++
    if (aviso.email) await enviarEmail({ to: usuario.email, evento: aviso.evento, pedido, usuario })
  }
  await marca.set({
    pedidoId: pedido.id || null,
    entregues: novas,
    criadoEm: FieldValue.serverTimestamp(),
    expiraEm: Timestamp.fromMillis(Date.now() + DIAS_GUARDANDO_MARCA * 864e5),
  })
  return novas
}

module.exports = { criarNotificacao, buscarCandidatos, entregarAvisos }
