import { t, idioma } from './constants.js'

export function formatCurrency(value) {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Só "aaaa-mm-dd" vira data; qualquer outra coisa volta escapada, porque o
// resultado vai para innerHTML e o campo é gravado por quem usa a demo
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr))
  if (!m) return esc(dateStr)
  return `${m[3]}/${m[2]}/${m[1]}`
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

  const local = idioma() === 'en' ? 'en-US' : 'pt-BR'
  let label
  if (diffMin < 1)    label = t('relAgora')
  else if (diffMin < 60)  label = t('relMinutos', { n: diffMin })
  else if (diffH < 24)    label = t('relHoras', { n: diffH })
  else if (diffD === 1)   label = t('relOntem')
  else if (diffD < 30)    label = t('relDias', { n: diffD })
  else if (diffM === 1)   label = t('relMes1')
  else if (diffM < 12)    label = t('relMeses', { n: diffM })
  else label = date.toLocaleDateString(local, { day: '2-digit', month: 'short', year: 'numeric' })

  const title = date.toLocaleString(local, { dateStyle: 'short', timeStyle: 'short' })
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

// As iniciais vão direto para innerHTML: só letras e números entram
export function gerarIniciais(nome) {
  const partes = String(nome ?? '').split(/\s+/)
    .map(p => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
  if (!partes.length) return '?'
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

// Link vindo do banco: só http(s); "javascript:" e afins viram "#"
export function urlSegura(url) {
  try {
    const u = new URL(String(url ?? ''), location.href)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '#'
  } catch {
    return '#'
  }
}

export function parseMoeda(str) {
  if (!str) return 0
  const n = String(str).replace(/[R$\s.]/g, '').replace(',', '.')
  return parseFloat(n) || 0
}

// Divide um valor em n parcelas, em centavos: as primeiras com o valor
// arredondado para baixo e a última com a diferença, para a soma bater com o
// total (R$ 100,00 em 3 vira 33,33 + 33,33 + 33,34)
export function dividirEmParcelas(valor, n) {
  const qtd = Math.max(1, Math.floor(Number(n) || 1))
  const totalCentavos = Math.round(Number(valor) * 100)
  if (!Number.isFinite(totalCentavos)) return []
  const base = Math.floor(totalCentavos / qtd)
  const resto = totalCentavos - base * qtd
  return Array.from({ length: qtd }, (_, i) => (i === qtd - 1 ? base + resto : base) / 100)
}

// Vencimentos mensais a partir do primeiro (aaaa-mm-dd), no mesmo dia de cada
// mês ou no último dia quando o mês é mais curto (31/01 → 28/02 ou 29/02)
export function vencimentosMensais(primeiroISO, n) {
  const [ano, mes, dia] = String(primeiroISO || '').split('-').map(Number)
  if (!ano || !mes || !dia) return []
  const qtd = Math.max(1, Math.floor(Number(n) || 1))
  return Array.from({ length: qtd }, (_, i) => {
    const indice = mes - 1 + i
    const a = ano + Math.floor(indice / 12)
    const m = indice % 12
    const ultimoDia = new Date(Date.UTC(a, m + 1, 0)).getUTCDate()
    return `${a}-${String(m + 1).padStart(2, '0')}-${String(Math.min(dia, ultimoDia)).padStart(2, '0')}`
  })
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes/1024).toFixed(1)} KB`
  return `${(bytes/1048576).toFixed(1)} MB`
}

// O Storage recusou o envio por plano ou cota, não por permissão: desde
// 03/02/2026 o Cloud Storage do Firebase exige o plano Blaze, e no plano
// gratuito todo envio volta 402 (storage/quota-exceeded)
export function arquivoIndisponivel(err) {
  return err?.code === 'storage/quota-exceeded' || err?.status === 402
}

// Separação de funções, como nas regras do Firestore: quem abriu ou cotou o
// pedido não decide sobre ele (aprovar ou reprovar), e quem o aprovou não
// registra a compra nem o pagamento. Vale para todos os perfis, o supremo
// inclusive. Devolve o motivo ('abriu', 'cotou' ou 'aprovou') ou null.
//   acao: 'decidir' | 'comprar' | 'pagar'
export function impedimentoDeFuncao(pedido, usuario, acao) {
  if (!pedido || !usuario?.id) return null
  if (acao === 'decidir') {
    if (pedido.solicitanteId === usuario.id) return 'abriu'
    if (pedido.compradorId === usuario.id) return 'cotou'
  }
  if ((acao === 'comprar' || acao === 'pagar') && pedido.aprovadoPor === usuario.id) return 'aprovou'
  return null
}

// Empresas da pessoa, sempre como lista de IDs: é o formato que o app grava e
// que as consultas (array-contains-any) e as Functions esperam. Um objeto
// { id: true } ainda é lido, mas só aqui; o resto do código vê a lista.
export function empresasDoUsuario(usuario) {
  const r = usuario?.empresas
  if (Array.isArray(r)) return r
  return r && typeof r === 'object' ? Object.keys(r) : []
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
// Prazo em palavras a partir dos dias que faltam (negativo: atraso)
export function textoPrazo(dias) {
  if (dias < 0) return dias === -1 ? t('prazoAtrasado1') : t('prazoAtrasado', { n: -dias })
  if (dias === 0) return t('prazoVenceHoje')
  return dias === 1 ? t('prazoFalta1') : t('prazoFaltam', { n: dias })
}

export function calcularSLA(dataNecessaria) {
  if (!dataNecessaria) return null
  const dias = Math.round((new Date(dataNecessaria) - new Date(hojeISO())) / 86400000)
  const classe = dias <= 0 ? 'sla-danger' : dias <= 3 ? 'sla-warn' : 'sla-ok'
  return { label: textoPrazo(dias), classe }
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
