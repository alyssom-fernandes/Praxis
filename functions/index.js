const admin = require('firebase-admin')
admin.initializeApp()

const triggers  = require('./src/triggers')
const scheduled = require('./src/scheduled')

// triggerDemoSeed — aciona o reset/seed do demo sob demanda (usado uma vez)
const { onCall } = require('firebase-functions/v2/https')

const triggerDemoSeed = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    if (!request.auth) {
      throw new Error('Autenticacao necessaria.')
    }
    await scheduled.__runDemoReset()
    return { ok: true }
  }
)

module.exports = {
  ...triggers,
  ...scheduled,
  triggerDemoSeed,
}
