// Quem pode pedir a renovação da demo pelo servidor, e quando. Funções puras
// (sem Firebase), testadas em tests/unidade.test.mjs.

const EMAIL_DEMO = 'demo@praxis.app'
const TRAVA_MS = 3 * 60 * 1000

// Dia de hoje em São Paulo (a renovação vira à meia-noite de Brasília), como
// em js/demo-reset.js
function hojeSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)
}

// Só a conta demo e o supremo renovam a demo
function podeRenovarDemo(token) {
  return !!token && (token.email === EMAIL_DEMO || token.perfil === 'supremo')
}

// 'em-dia' (já renovada hoje), 'ocupado' (outra renovação em andamento) ou
// 'livre', a partir de _meta/demo
function situacaoRenovacao(meta, agora = new Date()) {
  const d = meta || {}
  if (d.dia === hojeSP(agora)) return 'em-dia'
  if (d.travadoAte && d.travadoAte > agora.getTime()) return 'ocupado'
  return 'livre'
}

module.exports = { EMAIL_DEMO, TRAVA_MS, hojeSP, podeRenovarDemo, situacaoRenovacao }
