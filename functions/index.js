const admin = require('firebase-admin')
admin.initializeApp()

// Exporta todas as functions de cada módulo
const triggers  = require('./src/triggers')
const scheduled = require('./src/scheduled')

module.exports = {
  ...triggers,
  ...scheduled,
}
