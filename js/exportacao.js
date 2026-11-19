// Cópia dos dados da empresa num arquivo JSON (Ajustes › Dados). Sem Firebase
// nem DOM: monta o pacote a partir do que a tela leu, e os testes de unidade
// o conferem direto. A leitura fica em js/exportar-dados.js.

export const FORMATO = 'praxis-exportacao'
export const VERSAO = 1
// As subcoleções de cada pedido, todas na cópia
export const SUBCOLECOES_PEDIDO = ['historico', 'cotacoes', 'parcelas', 'comentarios', 'notasInternas', 'anexos']
// As coleções da raiz, na ordem do arquivo
export const COLECOES = ['empresas', 'categorias', 'fornecedores', 'usuarios', 'convites', 'alcadas', 'auditoria']

// Valor pronto para JSON: Timestamp do Firestore e Date viram texto ISO,
// referência a documento vira o caminho; listas e objetos, campo a campo
export function paraJSON(valor) {
  if (valor == null) return null
  if (typeof valor.toDate === 'function') {
    const d = valor.toDate()
    return isNaN(d) ? null : d.toISOString()
  }
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor.toISOString()
  if (typeof valor.path === 'string' && valor.firestore) return valor.path
  if (Array.isArray(valor)) return valor.map(paraJSON)
  if (typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, paraJSON(v)]))
  return valor
}

// Documentos em ordem estável (pelo ID), cada um com o seu ID
const _ordenar = lista => [...(lista || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))

// O pacote: cabeçalho (formato, versão, quando, quem, de quais empresas),
// contagens para conferir a restauração, as coleções e os pedidos com as
// subcoleções dentro de cada um. `faltas` lista o que não pôde ser lido.
export function montarExportacao({ geradoEm, geradoPor, empresaIds = [], colecoes = {}, pedidos = [], faltas = [] }) {
  const dados = Object.fromEntries(COLECOES.map(c => [c, _ordenar(colecoes[c]).map(paraJSON)]))
  const listaPedidos = _ordenar(pedidos).map(p => {
    const sub = Object.fromEntries(SUBCOLECOES_PEDIDO.map(s => [s, _ordenar(p[s]).map(paraJSON)]))
    const campos = Object.fromEntries(Object.entries(p).filter(([k]) => !SUBCOLECOES_PEDIDO.includes(k)))
    return { ...paraJSON(campos), ...sub }
  })
  const contagens = Object.fromEntries(COLECOES.map(c => [c, dados[c].length]))
  contagens.pedidos = listaPedidos.length
  SUBCOLECOES_PEDIDO.forEach(s => { contagens[s] = listaPedidos.reduce((n, p) => n + p[s].length, 0) })
  return {
    formato: FORMATO,
    versao: VERSAO,
    geradoEm: paraJSON(geradoEm),
    geradoPor: paraJSON(geradoPor),
    empresaIds: [...empresaIds].sort(),
    contagens,
    faltas: [...faltas],
    ...dados,
    pedidos: listaPedidos,
  }
}

// praxis-dados-2026-11-17.json (data local de quem baixa)
export function nomeDoArquivo(data = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `praxis-dados-${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}.json`
}
