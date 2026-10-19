const admin = require('firebase-admin')
admin.initializeApp()

const triggers  = require('./src/triggers')
const scheduled = require('./src/scheduled')
const { EMAIL_DEMO, TRAVA_MS, hojeSP, podeRenovarDemo, situacaoRenovacao } = require('./src/demo-acesso')

const { onCall, HttpsError } = require('firebase-functions/v2/https')

// triggerDemoSeed — reset completo dos dados demo (apaga e recria tudo).
// Só a conta demo ou um supremo, e no máximo uma vez por dia: cada chamada
// apaga e regrava centenas de documentos.
const triggerDemoSeed = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Autenticação necessária.')
    if (!podeRenovarDemo(request.auth.token)) {
      throw new HttpsError('permission-denied', 'Só a conta demo ou um supremo renova a demonstração.')
    }

    // A mesma trava de js/demo-reset.js, em _meta/demo
    const metaRef = admin.firestore().doc('_meta/demo')
    const situacao = await admin.firestore().runTransaction(async tx => {
      const agora = new Date()
      const s = situacaoRenovacao((await tx.get(metaRef)).data(), agora)
      if (s === 'livre') tx.set(metaRef, { travadoAte: agora.getTime() + TRAVA_MS }, { merge: true })
      return s
    })
    if (situacao === 'em-dia') throw new HttpsError('resource-exhausted', 'A demonstração já foi renovada hoje.')
    if (situacao === 'ocupado') throw new HttpsError('aborted', 'A demonstração já está sendo renovada.')

    try {
      await scheduled.__runDemoReset()
      await metaRef.set({
        dia: hojeSP(), renovadaEm: admin.firestore.FieldValue.serverTimestamp(), travadoAte: 0,
      }, { merge: true })
    } catch (err) {
      console.error('triggerDemoSeed:', err)
      await metaRef.set({ travadoAte: 0 }, { merge: true }).catch(() => {})
      throw new HttpsError('internal', 'Não foi possível renovar a demonstração.')
    }
    return { ok: true }
  }
)

// fixDemoClaims — define custom claims do usuário demo sem resetar dados.
// O perfil é sempre 'demo': as regras não dão à conta demo nenhum outro.
const fixDemoClaims = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    if (!request.auth || request.auth.token.email !== EMAIL_DEMO) {
      throw new HttpsError('permission-denied', 'Apenas o usuário demo pode chamar esta função.')
    }
    const snap = await admin.firestore()
      .collection('usuarios').where('email', '==', EMAIL_DEMO).limit(1).get()
    if (snap.empty) throw new HttpsError('not-found', 'Documento do usuário demo não encontrado.')
    const uid = snap.docs[0].id
    const userData = snap.docs[0].data()
    const empresas = Array.isArray(userData.empresas) ? userData.empresas : []
    await admin.auth().setCustomUserClaims(uid, { perfil: 'demo', empresas })
    return { ok: true }
  }
)

module.exports = {
  ...triggers,
  ...scheduled,
  triggerDemoSeed,
  fixDemoClaims,
}
