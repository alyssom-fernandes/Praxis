export const STATUS = {
  SOLICITADO:   'solicitado',
  AG_COTACAO:   'ag_cotacao',
  EM_APROVACAO: 'em_aprovacao',
  APROVADO:     'aprovado',
  COMPRADO:     'comprado',
  ENTREGUE:     'entregue',
  PAGO:         'pago',
  REPROVADO:    'reprovado',
  CANCELADO:    'cancelado',
}

// Rótulos que mudam com o idioma: cada leitura passa por t(), então
// STATUS_LABEL[status] já vem no idioma da sessão (chaves status_*, perfil_*
// e condicao_* do dicionário)
function _rotulos(valores, prefixo) {
  const rotulos = {}
  for (const v of valores) Object.defineProperty(rotulos, v, { get: () => t(prefixo + v), enumerable: true })
  return Object.freeze(rotulos)
}

export const STATUS_LABEL = _rotulos(Object.values(STATUS), 'status_')

// A cor da etapa vem da categoria, não da etapa (como no Jira): aguardando,
// em andamento, concluído e encerrado sem compra. O nome exato da etapa vai
// sempre no texto ao lado do ponto (docs/glossario.md)
export const CATEGORIA_ETAPA = {
  solicitado:   'aguardando',
  ag_cotacao:   'andamento',
  em_aprovacao: 'andamento',
  aprovado:     'andamento',
  comprado:     'andamento',
  entregue:     'andamento',
  pago:         'concluido',
  reprovado:    'encerrado',
  cancelado:    'encerrado',
}
// As duas formas da mesma cor: a classe do ponto (.dot-*, css/base.css) e o
// token, para quem pinta por --cor (relatórios)
const _PONTO_DA_CATEGORIA = { aguardando: 'dot-gray', andamento: 'dot-blue', concluido: 'dot-green', encerrado: 'dot-red' }
const _COR_DA_CATEGORIA = { aguardando: 'var(--text3)', andamento: 'var(--blue)', concluido: 'var(--green)', encerrado: 'var(--red)' }
const _porEtapa = mapa => Object.fromEntries(Object.entries(CATEGORIA_ETAPA).map(([etapa, cat]) => [etapa, mapa[cat]]))
export const STATUS_DOT_COLOR = _porEtapa(_PONTO_DA_CATEGORIA)
export const COR_DA_ETAPA     = _porEtapa(_COR_DA_CATEGORIA)

export const PERFIS = {
  SUPREMO:     'supremo',
  GESTOR:      'gestor',
  APROVADOR:   'aprovador',
  COMPRADOR:   'comprador',
  FINANCEIRO:  'financeiro',
  SOLICITANTE: 'solicitante',
}

// 'nenhum' e 'prestador': as contas sem Compras (acesso por módulo, js/modulos.js)
export const PERFIS_LABEL = _rotulos([...Object.values(PERFIS), 'nenhum', 'prestador'], 'perfil_')

// Motivos de reprovação e de cancelamento. O valor gravado no pedido é o texto
// em português (as regras do Firestore conferem o 'Outros'); a tela mostra o
// rótulo do idioma da sessão com rotuloMotivo()
export const MOTIVO_OUTROS = 'Outros'

export const MOTIVOS_REPROVACAO = [
  'Valor acima do orçamento',
  'Cotações insuficientes',
  'Justificativa inadequada',
  'Fornecedor não aprovado',
  MOTIVO_OUTROS,
]

export const MOTIVOS_CANCELAMENTO = [
  'Compra não necessária',
  'Fornecedor indisponível',
  'Erro no pedido',
  'Pedido duplicado',
  MOTIVO_OUTROS,
]

const _CHAVE_MOTIVO = {
  'Valor acima do orçamento': 'motivoValorAcima',
  'Cotações insuficientes':   'motivoCotacoesInsuf',
  'Justificativa inadequada': 'motivoJustificativa',
  'Fornecedor não aprovado':  'motivoFornecedorNaoAprov',
  'Compra não necessária':    'motivoCompraDesnecessaria',
  'Fornecedor indisponível':  'motivoFornecedorIndisp',
  'Erro no pedido':           'motivoErroPedido',
  'Pedido duplicado':         'motivoDuplicado',
  [MOTIVO_OUTROS]:            'motivoOutrosRotulo',
}
export function rotuloMotivo(valor) {
  return _CHAVE_MOTIVO[valor] ? t(_CHAVE_MOTIVO[valor]) : valor
}

// Nota do histórico gravada como texto (antes de o app gravar a chave, e na
// semente da demo): a do sistema aparece no idioma da sessão, e o motivo de
// lista também; o resto (justificativas, observações) fica como foi escrito
const _NOTA_TEXTO = {
  'Comprador assumiu':               'notaAssumiu',
  'Comprador assumiu o pedido':      'notaAssumiu',
  'Claim liberado pelo gestor':      'notaLiberado',
  'Cotação indicada':                'notaIndicada',
  'Cotação indicada pelo comprador': 'notaIndicada',
  'Última parcela paga':             'notaUltimaParcela',
}
export function rotuloNota(texto) {
  if (_NOTA_TEXTO[texto]) return t(_NOTA_TEXTO[texto])
  const compra = /^Fornecedor: (.+) · (R\$\s?[\d.,]+)$/.exec(texto || '')
  if (compra) return t('notaCompra', { fornecedor: compra[1], valor: compra[2] })
  const reaberto = /^Reaberto a partir de (\S+) — ([\s\S]+)$/.exec(texto || '')
  if (reaberto) return t('notaReaberto', { numero: reaberto[1], justificativa: reaberto[2] })
  return rotuloMotivo(texto)
}

// Urgência gravada no histórico de edições ('Urgente' ou 'Normal'; 'Urgent' se
// quem editou usava o inglês), no idioma da sessão
export function rotuloUrgencia(valor) {
  if (valor === 'Urgente' || valor === 'Urgent') return t('urgente')
  if (valor === 'Normal') return t('campoNormal')
  return valor || '—'
}

// Paleta das categorias: os tons quentes de cerâmica e afresco que os relatórios
// usam (variáveis --rel-* em telas.css). O que fica gravado é o hex canônico do
// tom; qualquer outra cor (cadastros antigos, escolha à mão) é levada ao tom mais
// próximo, para a categoria ter a mesma cor em toda parte.
export const TONS_CATEGORIA = {
  ocre: '#D3A04E', areia: '#C9B48C', oliva: '#93AE7C', mar: '#82ADA3', egeu: '#8CA6C2',
  ametista: '#A893BC', rosa: '#C88E96', vinho: '#B9746B', argila: '#A09282',
}
export const CORES_CATEGORIA = Object.values(TONS_CATEGORIA)
export function tomDaCor(hex) {
  const c = String(hex || '').trim().toUpperCase()
  const exato = Object.keys(TONS_CATEGORIA).find(k => TONS_CATEGORIA[k].toUpperCase() === c)
  if (exato) return exato
  const m = /^#?([0-9A-F]{6})$/.exec(c)
  if (!m) return null
  const n = parseInt(m[1], 16)
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (s < 0.16) return 'argila'
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 18 || h >= 345) return 'vinho'
  if (h < 46) return 'ocre'
  if (h < 70) return 'areia'
  if (h < 165) return 'oliva'
  if (h < 200) return 'mar'
  if (h < 255) return 'egeu'
  if (h < 300) return 'ametista'
  return 'rosa'
}
export function corCategoria(cor) {
  return TONS_CATEGORIA[tomDaCor(cor) || 'argila']
}

export const CATEGORIAS_PADRAO = [
  { nome: 'Manutenção',       cor: '#B9746B' },
  { nome: 'Escritório',       cor: '#8CA6C2' },
  { nome: 'Operacional',      cor: '#C9B48C' },
  { nome: 'Alimentação',      cor: '#93AE7C' },
  { nome: 'Uniformes e EPIs', cor: '#A893BC' },
  { nome: 'Marketing',        cor: '#D3A04E' },
  { nome: 'TI',               cor: '#82ADA3' },
  { nome: 'Serviços',         cor: '#A09282' },
]

export const EVENTOS = {
  PEDIDO_URGENTE:        'pedido_urgente',
  AG_COTACAO:            'ag_cotacao',
  COMPRADOR_ASSUMIU:     'comprador_assumiu',
  PEDIDO_LIBERADO:       'pedido_liberado',
  COTACOES_PRONTAS:      'cotacoes_prontas',
  PEDIDO_APROVADO:       'pedido_aprovado',
  PEDIDO_REPROVADO:      'pedido_reprovado',
  PEDIDO_CANCELADO:      'pedido_cancelado',
  PEDIDO_COMPRADO:       'pedido_comprado',
  PEDIDO_ENTREGUE:       'pedido_entregue',
  PARCELA_VENCENDO:      'parcela_vencendo',
  PARCELA_VENCIDA:       'parcela_vencida',
  MENCAO_COMENTARIO:     'mencao_comentario',
  PEDIDO_PARADO:         'pedido_parado',
  PEDIDO_ENTREGUE_SOLIC: 'pedido_entregue_solic',
}

export const EVENTOS_ICON_CLASS = {
  pedido_urgente:        'notif-icon-red',
  ag_cotacao:            'notif-icon-blue',
  comprador_assumiu:     'notif-icon-gold',
  pedido_liberado:       'notif-icon-blue',
  cotacoes_prontas:      'notif-icon-blue',
  pedido_aprovado:       'notif-icon-green',
  pedido_reprovado:      'notif-icon-red',
  pedido_cancelado:      'notif-icon-red',
  pedido_comprado:       'notif-icon-green',
  pedido_entregue:       'notif-icon-green',
  parcela_vencendo:      'notif-icon-gold',
  parcela_vencida:       'notif-icon-red',
  mencao_comentario:     'notif-icon-gold',
  pedido_parado:         'notif-icon-gold',
  pedido_entregue_solic: 'notif-icon-green',
}

export const UNIDADES = [
  'un', 'cx', 'kg', 'L', 'm', 'm²', 'm³',
  'par', 'pct', 'kit', 'rolo', 'saco',
  'hora', 'mês', 'pessoa', 'licença', 'serviço',
]

export const CONDICAO_PAGAMENTO = _rotulos(['a_vista', 'antecipado', 'apos_recebimento'], 'condicao_')

// ── Traduções ────────────────────────────────────────────────
// O português vem com o app (js/textos-pt.js); o inglês só é baixado por quem
// escolhe o inglês (js/textos-en.js), antes da primeira tela (carregarIdioma,
// em js/app.js). Antes os dois vinham juntos neste arquivo para todo mundo.
import PT from './textos-pt.js'
let EN = null

// Os dois dicionários (o inglês, depois de carregado): para os testes
export const TRADUCOES = { pt: PT, get en() { return EN } }

// Baixa o dicionário do idioma da sessão (o português já está aqui)
export async function carregarIdioma() {
  if (idioma() === 'en' && !EN) EN = (await import('./textos-en.js')).default
}

// Idioma: 'en' ou 'pt' (o padrão, também fora do navegador). A escolha fica
// neste navegador (Ajustes e a entrada); a aba pode ter a sua (sessionStorage)
export function idioma() {
  try {
    const l = globalThis.sessionStorage?.getItem('praxis_lang') || globalThis.localStorage?.getItem('praxis_lang')
    return l === 'en' ? 'en' : 'pt'
  } catch { return 'pt' }
}

// Troca o idioma e recarrega: cada tela nasce no idioma novo
export function trocarIdioma(lingua) {
  try {
    globalThis.localStorage?.setItem('praxis_lang', lingua)
    globalThis.sessionStorage?.setItem('praxis_lang', lingua)
  } catch { /* sem armazenamento: vale só para esta página */ }
  globalThis.location?.reload()
}

// Texto da chave no idioma da sessão; sem tradução, cai no português. Cada
// {nome} do texto é trocado por vars.nome: t('prazoFaltam', { n: 3 })
export function t(chave, vars) {
  let s = (idioma() === 'en' && EN ? EN[chave] : undefined) ?? PT[chave] ?? chave
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v)
  return s
}

export const KANBAN_COLUNAS = [
  STATUS.SOLICITADO,
  STATUS.AG_COTACAO,
  STATUS.EM_APROVACAO,
  STATUS.APROVADO,
  STATUS.COMPRADO,
  STATUS.ENTREGUE,
  STATUS.PAGO,
]

// Envio de arquivos (cotação, anexo e comprovante) pela conta da demo pública.
// Fica desligado: desde 03/02/2026 o Cloud Storage do Firebase exige o plano
// Blaze, e no plano gratuito, em que a demo roda, todo envio volta 402
// (storage/quota-exceeded). Com o projeto no Blaze, troque para true.
export const DEMO_ENVIA_ARQUIVOS = false

export const STORAGE_PATHS = {
  cotacao:     (pedidoId, cotacaoId) => `pedidos/${pedidoId}/cotacoes/${cotacaoId}`,
  comprovante: (pedidoId, parcelaId) => `pedidos/${pedidoId}/comprovantes/${parcelaId}`,
  anexo:       (pedidoId)            => `pedidos/${pedidoId}/anexos`,
}
