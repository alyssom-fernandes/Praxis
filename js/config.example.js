// Copie este arquivo para js/config.js (o config.js não vai para o git).
//
// Como está, ele já funciona com os emuladores do Firebase: em localhost o app
// se conecta ao Auth, Firestore e Storage locais (ver js/firebase.js),
// e a senha da conta de demonstração é a do seed do emulador.
// Para publicar no seu próprio projeto, troque pelos valores do console do Firebase
// (Configurações do projeto → Seus apps). A senha da conta demo vai para o site
// publicado: só crie a conta demo num projeto feito para a demonstração pública,
// nunca num projeto com dados reais (ver README).

export const FIREBASE_CONFIG = {
  apiKey:            'chave-local',
  authDomain:        'localhost',
  projectId:         'praxis-af618',
  storageBucket:     'praxis-af618.appspot.com',
  messagingSenderId: '0',
  appId:             'praxis-local',
}

export const DEMO_CREDENTIALS = {
  email:    'demo@praxis.app',
  password: 'demo1234',
}
