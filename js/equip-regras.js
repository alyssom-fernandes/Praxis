// Equipamentos: as regras puras (etiqueta, garantia, idade, aviso de troca e
// contagem), sem Firebase nem DOM. Testadas em tests/unidade.test.mjs.

// Os tipos, com o prefixo da etiqueta (AC-0123) e o ícone (js/icones.js)
export const TIPOS_EQUIP = [
  { id: 'ar_condicionado', prefixo: 'AC' },
  { id: 'computador', prefixo: 'PC' },
  { id: 'notebook', prefixo: 'NB' },
  { id: 'monitor', prefixo: 'MON' },
  { id: 'impressora', prefixo: 'IMP' },
  { id: 'camera', prefixo: 'CAM' },
  { id: 'rede', prefixo: 'RED' },
  { id: 'nobreak', prefixo: 'NBK' },
  { id: 'celular', prefixo: 'CEL' },
  { id: 'tv', prefixo: 'TV' },
  { id: 'bomba', prefixo: 'BMB' },
  { id: 'outro', prefixo: 'EQ' },
]
export const prefixoDoTipo = tipo => (TIPOS_EQUIP.find(t => t.id === tipo) || TIPOS_EQUIP.at(-1)).prefixo
export const etiquetaDe = (prefixo, n) => `${prefixo}-${String(n).padStart(4, '0')}`

export const ST_EQUIP = { USO: 'uso', CONSERTO: 'conserto', RESERVA: 'reserva', BAIXADO: 'baixado' }

// Os limites padrão do aviso de troca (cada empresa ajusta os dela)
export const TROCA_PADRAO = { pct: 60, qtdAno: 3 }

const _DIA = 86400000
const _ms = iso => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)

// Os consertos do aparelho contra o preço de um novo: a soma de todos e a
// quantidade nos últimos 12 meses. Passou de um dos limites, avalia a troca
export function avaliacaoTroca(equip, limites = TROCA_PADRAO, hojeISO = new Date().toISOString().slice(0, 10)) {
  const custos = Array.isArray(equip?.custos) ? equip.custos : []
  const soma = Math.round(custos.reduce((s, c) => s + (Number(c.valor) || 0), 0) * 100) / 100
  const umAno = _ms(hojeISO) - 365 * _DIA
  const noAno = custos.filter(c => _ms(c.data) > umAno).length
  const preco = Number(equip?.precoNovo) || 0
  const pct = preco > 0 ? Math.round(soma / preco * 100) : null
  const lim = { ...TROCA_PADRAO, ...(limites || {}) }
  const porValor = pct != null && pct >= lim.pct
  const porVezes = noAno > lim.qtdAno
  return { soma, noAno, pct, trocar: equip?.status !== ST_EQUIP.BAIXADO && (porValor || porVezes), porValor, porVezes, limites: lim }
}

// Garantia: vencida, vence em até 30 dias ou em dia
export function situacaoGarantia(garantiaAte, hojeISO = new Date().toISOString().slice(0, 10)) {
  if (!garantiaAte) return null
  const dias = Math.round((_ms(garantiaAte) - _ms(hojeISO)) / _DIA)
  return { dias, vencida: dias < 0, perto: dias >= 0 && dias <= 30 }
}

// Idade a partir da data de compra: anos e meses completos
export function idadeDe(dataISO, hojeISO = new Date().toISOString().slice(0, 10)) {
  if (!dataISO) return null
  const [a1, m1, d1] = dataISO.split('-').map(Number), [a2, m2, d2] = hojeISO.split('-').map(Number)
  let meses = (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (meses < 0) meses = 0
  return { anos: Math.floor(meses / 12), meses: meses % 12, total: meses }
}

// O que precisa de atenção na lista: troca, conserto parado, garantia perto
export function precisaAtencao(equip, limites, hojeISO, diasParadoMax = 7) {
  const motivos = []
  if (avaliacaoTroca(equip, limites, hojeISO).trocar) motivos.push('troca')
  if (equip.status === ST_EQUIP.CONSERTO && equip.conserto?.desde &&
      (_ms(hojeISO) - _ms(equip.conserto.desde)) / _DIA > diasParadoMax) motivos.push('parado')
  const g = situacaoGarantia(equip.garantiaAte, hojeISO)
  if (g?.perto && equip.status !== ST_EQUIP.BAIXADO) motivos.push('garantia')
  return motivos
}

// A contagem de uma unidade: o que se esperava encontrar (os equipamentos da
// unidade que não estão baixados nem em conserto) contra o que foi marcado
export function conferirContagem(esperados, encontradosIds, todosPorId = {}) {
  const achados = new Set(encontradosIds)
  const esperadosIds = esperados.map(e => e.id)
  return {
    encontrados: esperadosIds.filter(id => achados.has(id)),
    faltando: esperadosIds.filter(id => !achados.has(id)),
    foraDoLugar: [...achados].filter(id => !esperadosIds.includes(id) && todosPorId[id]),
  }
}
