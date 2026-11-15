// Datas das Functions sempre no fuso de São Paulo. O servidor das Functions
// roda em UTC: sem isto, "hoje" vira o dia seguinte às 21h de Brasília. Funções
// puras (sem Firebase), testadas em tests/functions.test.mjs.

const FUSO = 'America/Sao_Paulo'

// Desde 2019 o Brasil não tem horário de verão: São Paulo fica sempre em UTC-3
const DESLOCAMENTO_SP = '-03:00'

const _ISO = /^\d{4}-\d{2}-\d{2}$/

// Dia de um momento em São Paulo, como AAAA-MM-DD
function diaSP(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora)
}

// Hora de um momento em São Paulo (0 a 23)
function horaSP(agora = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' }).format(agora)
  return Number(h)
}

// Soma dias a uma data AAAA-MM-DD (negativo subtrai), sem depender do fuso
function somarDias(iso, dias) {
  if (!_ISO.test(String(iso || ''))) return iso
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Dias entre duas datas AAAA-MM-DD (b − a)
function diasEntre(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5)
}

// O momento em que o relógio de São Paulo marca aquela data e hora
function momentoSP(iso, hora = 12, minuto = 0) {
  const hh = String(hora).padStart(2, '0')
  const mm = String(minuto).padStart(2, '0')
  return new Date(`${iso}T${hh}:${mm}:00${DESLOCAMENTO_SP}`)
}

// AAAA-MM-DD → DD/MM/AAAA
function dataBR(iso) {
  if (!_ISO.test(String(iso || ''))) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

module.exports = { FUSO, diaSP, horaSP, somarDias, diasEntre, momentoSP, dataBR }
