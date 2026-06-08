export function formatCurrency(value) {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = String(dateStr).split('-')
  if (!y || !m || !d) return dateStr
  return `${d}/${m}/${y}`
}

export function formatDateRelative(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((date - today) / 86400000)
  if (diff === 0)  return 'Hoje'
  if (diff === 1)  return 'Amanhã'
  if (diff === -1) return 'Ontem'
  if (diff > 1)    return `Em ${diff} dias`
  return `${Math.abs(diff)} dias atrás`
}

export function formatTimestamp(ts) {
  if (!ts) return ''
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffH   = Math.floor(diffMs / 3600000)
  const diffD   = Math.floor(diffMs / 86400000)
  if (diffMin < 1)  return 'Agora'
  if (diffMin < 60) return `Há ${diffMin} min`
  if (diffH   < 24) return `Há ${diffH}h`
  if (diffD   < 7)  return `Há ${diffD} dia${diffD > 1 ? 's' : ''}`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function formatCNPJ(cnpj) {
  if (!cnpj) return ''
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return cnpj
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`
}

export function debounce(fn, delay = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function sanitizeString(str) {
  if (typeof str !== 'string') return ''
  return str.replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
  }[c]))
}

export function gerarIniciais(nome) {
  if (!nome) return '?'
  const partes = nome.trim().split(' ')
  if (partes.length === 1) return partes[0][0].toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

export function normalizarTexto(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function maisXDiasISO(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export function dataEhPassado(dateStr) {
  if (!dateStr) return false
  return dateStr < hojeISO()
}

export function dataEhProximos(dateStr, dias = 3) {
  if (!dateStr) return false
  const limite = maisXDiasISO(dias)
  return dateStr >= hojeISO() && dateStr <= limite
}

export function agruparPor(arr, chave) {
  return arr.reduce((acc, item) => {
    const k = item[chave]
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
}

export function ordenarPor(arr, chave, desc = false) {
  return [...arr].sort((a, b) => {
    if (a[chave] < b[chave]) return desc ? 1 : -1
    if (a[chave] > b[chave]) return desc ? -1 : 1
    return 0
  })
}

export function esc(str) {
  return sanitizeString(String(str ?? ''))
}

export function parseMoeda(str) {
  if (!str) return 0
  const n = String(str).replace(/[R$\s.]/g, '').replace(',', '.')
  return parseFloat(n) || 0
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

export function pluralizar(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`
}
