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
  return formatarDataRelativa(ts).label
}

export function formatarDataRelativa(ts) {
  if (!ts) return { label: '—', title: '' }
  const date   = ts.toDate ? ts.toDate() : new Date(ts)
  const now    = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffH   = Math.floor(diffMs / 3600000)
  const diffD   = Math.floor(diffMs / 86400000)
  const diffM   = Math.floor(diffD / 30)

  let label
  if (diffMin < 1)    label = 'Agora'
  else if (diffMin < 60)  label = `Há ${diffMin} min`
  else if (diffH < 24)    label = `Há ${diffH}h`
  else if (diffD === 1)   label = 'Ontem'
  else if (diffD < 30)    label = `Há ${diffD} dias`
  else if (diffM === 1)   label = 'Há 1 mês'
  else if (diffM < 12)    label = `Há ${diffM} meses`
  else label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  const title = date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  return { label, title }
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

// ── Acessibilidade ────────────────────────────────────────────
export function prefereMenosMovimento() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

// ── Animação de contagem ──────────────────────────────────────
export function animarNumero(elemento, valorFinal, duracaoMs = 900, formatador = null) {
  if (!elemento) return
  if (prefereMenosMovimento()) {
    elemento.textContent = formatador ? formatador(valorFinal) : String(valorFinal)
    return
  }
  const inicio = performance.now()
  const step = (agora) => {
    const progresso = Math.min((agora - inicio) / duracaoMs, 1)
    // ease-out cubic
    const fator = 1 - Math.pow(1 - progresso, 3)
    const valor = fator * valorFinal
    elemento.textContent = formatador ? formatador(valor) : String(Math.round(valor))
    if (progresso < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ── SLA badge ─────────────────────────────────────────────────
export function calcularSLA(dataNecessaria) {
  if (!dataNecessaria) return null
  const hoje = hojeISO()
  if (dataNecessaria < hoje) {
    const dias = Math.round((new Date(hoje) - new Date(dataNecessaria)) / 86400000)
    return { label: `Atrasado ${dias} dia${dias !== 1 ? 's' : ''}`, classe: 'sla-danger' }
  }
  const diff = Math.round((new Date(dataNecessaria) - new Date(hoje)) / 86400000)
  if (diff === 0) return { label: 'Vence hoje', classe: 'sla-danger' }
  if (diff <= 3)  return { label: `Faltam ${diff} dia${diff !== 1 ? 's' : ''}`, classe: 'sla-warn' }
  return { label: `Faltam ${diff} dias`, classe: 'sla-ok' }
}

// ── Validação de formulários ──────────────────────────────────
export function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())
}

export function validarRequerido(val) {
  return val !== null && val !== undefined && String(val).trim() !== ''
}

export function validarNumeroPositivo(val) {
  const n = typeof val === 'number' ? val : parseMoeda(val)
  return !isNaN(n) && n > 0
}
