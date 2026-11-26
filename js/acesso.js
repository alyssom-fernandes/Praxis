// Acesso sem e-mail (A3): o gestor cria um login curto (joao.oficina) e uma
// senha inicial, que a pessoa troca no primeiro acesso. Por baixo, a conta de
// login usa um endereço que não recebe e-mail (domínio .invalid, reservado
// pela RFC 2606): ninguém recebe mensagem por ele. Sem Firebase nem DOM.

export const DOMINIO_LOGIN = 'usuarios.praxis.invalid'

// O login como é guardado: minúsculas, sem acento, espaço vira ponto
export function normalizarLogin(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '')
}

// De 3 a 32 caracteres, começando por letra ou número
export function loginValido(login) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(login || '')
}

export function emailDoLogin(login) { return `${normalizarLogin(login)}@${DOMINIO_LOGIN}` }
export function eAcessoSemEmail(email) { return String(email || '').toLowerCase().endsWith(`@${DOMINIO_LOGIN}`) }
export function loginDoEmail(email) { return eAcessoSemEmail(email) ? String(email).split('@')[0] : '' }

// O que a pessoa digita na entrada: com @ é e-mail; sem, é o login
export function emailParaEntrar(texto) {
  const v = String(texto || '').trim()
  return v.includes('@') ? v : emailDoLogin(v)
}

// Senha inicial fácil de ditar: duas sílabas, quatro números e duas sílabas
// (ex.: "rato-4821-mibe"). `aleatorio(n)` devolve um inteiro de 0 a n-1
const _SILABAS = ['ba', 'be', 'bi', 'bo', 'ca', 'ce', 'co', 'da', 'de', 'di', 'fa', 'fe', 'fi', 'ga', 'go', 'la', 'le', 'li', 'lo', 'lu',
  'ma', 'me', 'mi', 'mo', 'na', 'ne', 'no', 'pa', 'pe', 'pi', 'po', 'ra', 're', 'ri', 'ro', 'sa', 'se', 'si', 'so', 'ta', 'te', 'ti', 'to', 'va', 've', 'vi']
export function senhaInicial(aleatorio = _aleatorio) {
  const s = () => _SILABAS[aleatorio(_SILABAS.length)]
  const n = String(aleatorio(9000) + 1000)
  return `${s()}${s()}-${n}-${s()}${s()}`
}
function _aleatorio(n) {
  const a = new Uint32Array(1)
  globalThis.crypto.getRandomValues(a)
  return a[0] % n
}

// A senha nova do primeiro acesso: pelo menos 8 caracteres e diferente da inicial
export function erroDaSenhaNova(nova, confirmacao) {
  if (String(nova || '').length < 8) return 'senhaCurta'
  if (nova !== confirmacao) return 'senhasDiferentes'
  return null
}
