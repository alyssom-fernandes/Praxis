const admin = require('firebase-admin')
admin.initializeApp()

const triggers  = require('./src/triggers')
const scheduled = require('./src/scheduled')

const { onCall } = require('firebase-functions/v2/https')

// triggerDemoSeed — reset completo dos dados demo (apaga e recria tudo)
const triggerDemoSeed = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    if (!request.auth) throw new Error('Autenticacao necessaria.')
    await scheduled.__runDemoReset()
    return { ok: true }
  }
)

// fixDemoClaims — define custom claims do usuário demo sem resetar dados
// Chamado automaticamente pelo app quando o demo não tem perfil no token
const fixDemoClaims = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    if (!request.auth || request.auth.token.email !== 'demo@praxis.app') {
      throw new Error('Apenas o usuario demo pode chamar esta funcao.')
    }
    const snap = await admin.firestore()
      .collection('usuarios').where('email', '==', 'demo@praxis.app').limit(1).get()
    if (snap.empty) throw new Error('Documento do usuario demo nao encontrado.')
    const uid = snap.docs[0].id
    const userData = snap.docs[0].data()
    const empresas = Array.isArray(userData.empresas) ? userData.empresas : []
    await admin.auth().setCustomUserClaims(uid, {
      perfil:   userData.perfil || 'supremo',
      empresas,
    })
    return { ok: true }
  }
)

module.exports = {
  ...triggers,
  ...scheduled,
  triggerDemoSeed,
  fixDemoClaims,
}
