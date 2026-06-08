const admin = require('firebase-admin')
const db = admin.firestore()

// ── Cria uma notificação in-app para um usuário ───────────────
async function criarNotificacao(userId, { evento, titulo, corpo, pedidoId = null }) {
  if (!userId) return
  try {
    await db.collection('notificacoes').doc(userId).collection('items').add({
      evento,
      titulo,
      corpo,
      pedidoId,
      lida:     false,
      criadaEm: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (err) {
    console.error(`criarNotificacao error (${userId}):`, err.message)
  }
}

// ── Busca usuários por perfil(is) e empresa ───────────────────
async function buscarUsuariosPorPerfil(perfis, empresaId) {
  try {
    const snap = await db.collection('usuarios')
      .where('perfil', 'in', perfis)
      .where('ativo', '==', true)
      .get()

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u =>
        !empresaId ||
        u.perfil === 'supremo' ||
        (u.empresas || []).includes(empresaId)
      )
  } catch (err) {
    console.error('buscarUsuariosPorPerfil error:', err.message)
    return []
  }
}

// ── Formata data YYYY-MM-DD → DD/MM/YYYY ─────────────────────
function formatarData(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).split('-')
  return `${d}/${m}/${y}`
}

// ── Data ISO de hoje ──────────────────────────────────────────
function isoHoje() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

module.exports = { criarNotificacao, buscarUsuariosPorPerfil, formatarData, isoHoje }
