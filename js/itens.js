// Itens, desconto e veículo do pedido (Fase 1 da análise de uso). Sem Firebase
// nem DOM: o formulário (js/itens-editor.js), o detalhe, a compra já feita e
// os testes de unidade usam as mesmas funções.
import { normalizarTexto } from './utils.js'

export const MAX_ITENS = 30
export const MAX_DESC_ITEM = 120
export const MAX_KM = 9999999

const _num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const _centavos = v => Math.round(v * 100) / 100

// ── Itens ─────────────────────────────────────────────────────
// Um item: descrição, quantidade, unidade e, opcional, o valor unitário
/** @param {{ descricao?: any, quantidade?: any, unidade?: any, valorUnitario?: any }} [dados] */
export function item({ descricao, quantidade, unidade, valorUnitario } = {}) {
  const q = _num(quantidade)
  const vu = _num(valorUnitario)
  return {
    descricao: String(descricao || '').trim().slice(0, MAX_DESC_ITEM),
    quantidade: q != null && q > 0 ? q : 1,
    unidade: String(unidade || 'un'),
    valorUnitario: vu != null && vu > 0 ? _centavos(vu) : null,
  }
}

// Os itens de um pedido. Os pedidos de antes da Fase 1 têm só o título, a
// quantidade e a unidade: viram um item
export function itensDoPedido(p) {
  if (Array.isArray(p?.itens) && p.itens.length) return p.itens.map(item)
  return [item({ descricao: p?.titulo, quantidade: p?.quantidade ?? 1, unidade: p?.unidade || 'un' })]
}

// Só os itens com descrição contam
export function itensPreenchidos(itens) {
  return (itens || []).map(item).filter(i => i.descricao)
}

// O título automático: o primeiro item, e quantos mais vêm com ele.
// `texto(chave, vars)` é o t() do app (os testes passam um próprio)
export function resumoDosItens(itens, texto) {
  const lista = itensPreenchidos(itens)
  if (!lista.length) return ''
  const primeiro = lista[0].descricao
  if (lista.length === 1) return primeiro
  const n = lista.length - 1
  return texto(n === 1 ? 'itensResumoUm' : 'itensResumoVarios', { nome: primeiro, n }).slice(0, 120)
}

// Soma dos itens com valor unitário; null quando nenhum tem valor
export function subtotalDosItens(itens) {
  const comValor = itensPreenchidos(itens).filter(i => i.valorUnitario != null)
  if (!comValor.length) return null
  return _centavos(comValor.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0))
}

// ── Desconto ──────────────────────────────────────────────────
// No total: { tipo: 'valor' | 'pct', valor }. Zero ou vazio é sem desconto
export function desconto(tipo, valor) {
  const v = _num(valor)
  if (v == null || v <= 0) return null
  if (tipo === 'pct') return { tipo: 'pct', valor: Math.min(100, _centavos(v)) }
  return { tipo: 'valor', valor: _centavos(v) }
}

export function valorDoDesconto(subtotal, d) {
  if (subtotal == null || !d) return 0
  const bruto = d.tipo === 'pct' ? subtotal * d.valor / 100 : d.valor
  return _centavos(Math.min(subtotal, Math.max(0, bruto)))
}

export function totalComDesconto(subtotal, d) {
  if (subtotal == null) return null
  return _centavos(subtotal - valorDoDesconto(subtotal, d))
}

// ── Veículo ───────────────────────────────────────────────────
// Placa antiga (ABC1234) ou Mercosul (ABC1D23). As duas vão para o mesmo
// registro: na conversão oficial, o segundo número da antiga vira letra
// (0=A … 9=J), então ABC1234 e ABC1C34 são o mesmo veículo. A chave é a
// forma antiga
const _ANTIGA = /^[A-Z]{3}[0-9]{4}$/
const _MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

export function lerPlaca(texto) {
  const p = String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!p) return null
  if (_ANTIGA.test(p)) return { placa: p, chave: p }
  if (_MERCOSUL.test(p)) {
    const letra = p.charCodeAt(4) - 65
    const chave = letra <= 9 ? p.slice(0, 4) + letra + p.slice(5) : p
    return { placa: p, chave }
  }
  return { invalida: true, placa: p }
}

// Como a placa aparece: a antiga com hífen (ABC-1234), a Mercosul sem
export function placaParaExibir(placa) {
  const p = String(placa || '')
  return _ANTIGA.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p
}

// O veículo do pedido, ou null. Sem placa, o KM não vai
export function veiculo(placaTexto, kmTexto) {
  const pl = lerPlaca(placaTexto)
  if (!pl || pl.invalida) return null
  const km = _num(String(kmTexto ?? '').replace(/\D/g, '') || null)
  return { placa: pl.placa, chave: pl.chave, km: km != null && km > 0 && km <= MAX_KM ? km : null }
}

// ── Erros do formulário ───────────────────────────────────────
// [campo, chave do texto]; o campo é o do primeiro item com problema
export function errosDosItens(itens, { prefixo = 'np' } = {}) {
  const lista = itens || []
  const preenchidos = lista.filter(i => String(i?.descricao || '').trim())
  if (!preenchidos.length) return [[`${prefixo}-item-0`, 'campoObrigatorio']]
  if (preenchidos.length > MAX_ITENS) return [[`${prefixo}-itens`, 'itensDemais']]
  const erros = []
  lista.forEach((i, n) => {
    if (!String(i?.descricao || '').trim()) return
    const q = _num(i.quantidade)
    if (!(q > 0)) erros.push([`${prefixo}-item-${n}`, 'quantidadeMinima'])
  })
  return erros
}

export function erroDaPlaca(texto) {
  const pl = lerPlaca(texto)
  return pl?.invalida ? 'placaInvalida' : null
}

// ── Histórico: sugestões ao digitar ───────────────────────────
// A partir dos pedidos que o app já leu (sem leitura a mais): para cada item
// comprado, a descrição, a unidade, a categoria, o último preço, o fornecedor
// e quantas vezes apareceu. O preço é o unitário do item ou, no pedido de um
// item só, o valor da compra dividido pela quantidade
const _ms = ts => (ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds * 1000 : (typeof ts === 'number' ? ts : 0)))

export function historicoDeItens(pedidos) {
  const mapa = new Map()
  const ordenados = (pedidos || []).filter(p => p && !['cancelado', 'reprovado'].includes(p.status))
    .slice().sort((a, b) => _ms(b.criadoEm) - _ms(a.criadoEm))
  for (const p of ordenados) {
    const itens = itensPreenchidos(itensDoPedido(p))
    itens.forEach(i => {
      const chave = normalizarTexto(i.descricao)
      if (!chave) return
      const atual = mapa.get(chave)
      if (atual) { atual.vezes++; return }
      let preco = i.valorUnitario
      if (preco == null && itens.length === 1 && Number(p.valorFinal) > 0) preco = _centavos(Number(p.valorFinal) / i.quantidade)
      mapa.set(chave, {
        descricao: i.descricao, unidade: i.unidade, categoriaId: p.categoriaId || '',
        preco: preco ?? null, fornecedorNome: p.fornecedorNome || '',
        data: p.dataCompra || null, vezes: 1,
      })
    })
  }
  return mapa
}

// As sugestões para o que foi digitado: primeiro as que começam com o texto,
// depois as que o contêm; dentro de cada grupo, as mais compradas
export function sugerirItens(historico, texto, max = 6) {
  const q = normalizarTexto(texto || '')
  if (q.length < 2) return []
  const comeca = [], contem = []
  for (const [chave, h] of historico) {
    if (chave === q) continue
    if (chave.startsWith(q)) comeca.push(h)
    else if (chave.includes(q)) contem.push(h)
  }
  const porVezes = (a, b) => b.vezes - a.vezes || a.descricao.localeCompare(b.descricao, 'pt-BR')
  return [...comeca.sort(porVezes), ...contem.sort(porVezes)].slice(0, max)
}

export function itemDoHistorico(historico, texto) {
  return historico.get(normalizarTexto(texto || '')) || null
}

// As placas já usadas, da mais recente para a mais antiga (uma por veículo)
export function placasDoHistorico(pedidos) {
  const vistas = new Map()
  ;(pedidos || []).slice().sort((a, b) => _ms(b.criadoEm) - _ms(a.criadoEm)).forEach(p => {
    const v = p?.veiculo
    if (v?.chave && !vistas.has(v.chave)) vistas.set(v.chave, v.placa)
  })
  return [...vistas.values()]
}

// ── Lembretes de recorrência (S4) ──────────────────────────────
// Para cada item comprado em três datas ou mais, o intervalo típico (a
// mediana dos intervalos, em dias) e há quantos dias foi a última compra.
// Avisa quando já passou de 85% do intervalo e não há pedido em andamento
// com o item. Sem IA: uma conta sobre os pedidos que o app já leu
const _DIA = 864e5
const _EM_ANDAMENTO = ['solicitado', 'ag_cotacao', 'em_aprovacao', 'aprovado']
const _COMPRADOS = ['comprado', 'entregue', 'pago']
function _diaDaCompra(p) {
  if (p.dataCompra && /^\d{4}-\d{2}-\d{2}/.test(p.dataCompra)) return Date.parse(p.dataCompra.slice(0, 10) + 'T12:00:00')
  const ms = _ms(p.criadoEm)
  return ms || null
}
export function lembretesDeRecorrencia(pedidos, hojeMs = Date.now(), max = 3) {
  const compras = new Map()
  const abertos = new Set()
  for (const p of pedidos || []) {
    const itens = itensPreenchidos(itensDoPedido(p))
    if (_EM_ANDAMENTO.includes(p.status)) itens.forEach(i => abertos.add(normalizarTexto(i.descricao)))
    if (!_COMPRADOS.includes(p.status)) continue
    const dia = _diaDaCompra(p)
    if (!dia) continue
    itens.forEach(i => {
      const k = normalizarTexto(i.descricao)
      const x = compras.get(k) || { descricao: i.descricao, dias: new Set(), ultimo: null }
      x.dias.add(Math.round(dia / _DIA))
      if (!x.ultimo || dia > x.ultimo.dia) x.ultimo = { dia, pedidoId: p.id }
      compras.set(k, x)
    })
  }
  const hoje = Math.round(hojeMs / _DIA)
  const lista = []
  for (const [k, x] of compras) {
    if (abertos.has(k) || x.dias.size < 3) continue
    const dias = [...x.dias].sort((a, b) => a - b)
    const intervalos = dias.slice(1).map((d, i) => d - dias[i]).sort((a, b) => a - b)
    const meio = Math.floor(intervalos.length / 2)
    const intervalo = intervalos.length % 2 ? intervalos[meio] : Math.round((intervalos[meio - 1] + intervalos[meio]) / 2)
    const desde = hoje - dias[dias.length - 1]
    if (intervalo < 3 || desde < intervalo * 0.85) continue
    lista.push({ descricao: x.descricao, intervalo, desde, pedidoId: x.ultimo.pedidoId, razao: desde / intervalo })
  }
  return lista.sort((a, b) => b.razao - a.razao).slice(0, max)
}

// ── Busca (V2) ────────────────────────────────────────────────
// O pedido aparece na busca pelo título, pela descrição, pelo número, pela
// empresa (`extras`), pelo fornecedor, por qualquer item e pela placa. A
// placa vale em qualquer forma: "abc-1234", "ABC1C34" e "abc1c34" acham o
// mesmo veículo
export function casaBusca(p, texto, extras = []) {
  const termo = normalizarTexto(texto || '')
  if (!termo) return true
  const pl = lerPlaca(texto)
  if (pl && !pl.invalida && p?.veiculo?.chave === pl.chave) return true
  const campos = [
    p?.titulo, p?.descricao, p?.numeroPedido, p?.fornecedorNome, p?.centroCusto,
    p?.veiculo?.placa, p?.veiculo?.placa ? placaParaExibir(p.veiculo.placa) : '',
    ...itensDoPedido(p).map(i => i.descricao), ...extras,
  ]
  return campos.some(c => c && normalizarTexto(c).includes(termo))
}

// ── Aviso pelo WhatsApp ───────────────────────────────────────
// Quem o pedido espera agora (chave do texto) ou null
export function esperaDoPedido(p) {
  if (!p) return null
  if (p.lancamento?.autorizacao === 'pendente') return 'waEsperaAutorizacao'
  return {
    solicitado: 'waEsperaComprador',
    ag_cotacao: 'waEsperaCotacao',
    em_aprovacao: 'waEsperaAprovacao',
    aprovado: 'waEsperaCompra',
    comprado: 'waEsperaEntrega',
    entregue: 'waEsperaPagamento',
  }[p.status] || null
}

// O link do WhatsApp com a mensagem pronta (a pessoa escolhe o contato)
export function linkWhatsApp(p, url, texto) {
  const espera = esperaDoPedido(p)
  if (!espera) return null
  const msg = texto('waMensagem', {
    num: p.numeroPedido || '',
    titulo: p.titulo || '',
    espera: texto(espera),
    url,
  })
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}
