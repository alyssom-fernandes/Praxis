// Alçadas de aprovação (C07): quem aprova cada pedido conforme a empresa e o
// valor da cotação indicada. Funções puras, sem Firebase nem DOM, para os
// testes de unidade; a tela fica em js/config-alcadas.js e o voto, no detalhe.
//
// A alçada de uma empresa (/alcadas/{empresaId}) é uma lista de faixas em
// ordem de valor; a última não tem teto (ate: null). Cada faixa tem de 1 a 3
// níveis em sequência:
//   { nome, perfis: ['aprovador', 'gestor', 'supremo'], usuarios: [uid],
//     minimo: aprovações necessárias }
// Pode votar no nível quem tem um dos perfis ou está entre as pessoas.
//
// Ao entrar em aprovação, o pedido guarda o retrato da faixa em que cai
// (aprovacao: { faixa, valor, niveis, nivelAtual, votos: { '0': [uid] } }),
// e as regras (firestore.rules) conferem o retrato contra a alçada. Mudar a
// alçada depois não mexe nos pedidos que já estão em aprovação.
// Empresa sem alçada: um aprovador decide, como antes.

export const MAX_FAIXAS  = 6
export const MAX_NIVEIS  = 3
export const MAX_PESSOAS = 10
export const PERFIS_QUE_APROVAM = ['aprovador', 'gestor', 'supremo']

// Índice da faixa em que o valor cai (as faixas vêm em ordem de valor)
export function faixaDoValor(faixas, valor) {
  const i = (faixas || []).findIndex(f => f.ate == null || valor <= f.ate)
  return i < 0 ? null : i
}

// O que o pedido grava ao entrar em aprovação: o retrato da faixa e quem
// aparece na fila do primeiro nível. Sem alçada, nada.
export function retratoAprovacao(alcada, valor) {
  if (!alcada?.faixas?.length) return null
  const faixa = faixaDoValor(alcada.faixas, valor)
  if (faixa == null) return null
  const niveis = alcada.faixas[faixa].niveis
  return {
    aprovacao: { faixa, valor, niveis, nivelAtual: 0, votos: {} },
    aprovadorIds: niveis[0].usuarios,
  }
}

const _votos = (a, n) => a?.votos?.[String(n)] || []

// Votou em algum nível deste pedido (a separação de funções vale para todos
// os que aprovaram, não só para o último)
export function votouNoPedido(pedido, uid) {
  const a = pedido?.aprovacao
  if (!a || !uid) return false
  return Object.values(a.votos || {}).some(lista => lista.includes(uid))
}

// O nível atual: número (1 em diante), total, nome, votos e quantos faltam
export function situacaoAprovacao(pedido) {
  const a = pedido?.aprovacao
  if (!a?.niveis?.length) return null
  const n = a.nivelAtual || 0
  const nivel = a.niveis[n]
  const votos = _votos(a, n)
  return { numero: n + 1, total: a.niveis.length, nome: nivel.nome, minimo: nivel.minimo,
    votos, faltam: Math.max(0, nivel.minimo - votos.length), nivel }
}

// A pessoa está no nível atual (pelo perfil ou pelo nome)?
export function estaNoNivel(nivel, usuario) {
  if (!nivel || !usuario?.id) return false
  if (!PERFIS_QUE_APROVAM.includes(usuario.perfil)) return false
  return (nivel.perfis || []).includes(usuario.perfil) || (nivel.usuarios || []).includes(usuario.id)
}

// Por que a pessoa não vota agora neste pedido com alçada: 'votou' (já votou
// em algum nível) ou 'foraDoNivel'; null se pode. A separação de funções
// (quem abriu ou cotou) é conferida antes, em utils.impedimentoDeFuncao.
export function impedimentoNaAlcada(pedido, usuario) {
  const s = situacaoAprovacao(pedido)
  if (!s) return null
  if (votouNoPedido(pedido, usuario?.id)) return 'votou'
  if (!estaNoNivel(s.nivel, usuario)) return 'foraDoNivel'
  return null
}

// O voto de uid no nível atual: os campos a gravar no pedido e o que
// aconteceu ('voto', 'avancou' para o próximo nível ou 'aprovado').
// Quem chama acrescenta os dados de quem aprovou e as datas.
export function aplicarVoto(pedido, uid) {
  const a = pedido.aprovacao
  const n = a.nivelAtual || 0
  const votos = [..._votos(a, n), uid]
  const nova = { ...a, votos: { ...(a.votos || {}), [String(n)]: votos } }
  const completo = votos.length >= a.niveis[n].minimo
  if (!completo) return { campos: { aprovacao: nova }, resultado: 'voto' }
  if (n < a.niveis.length - 1) {
    return {
      campos: { aprovacao: { ...nova, nivelAtual: n + 1 }, aprovadorIds: a.niveis[n + 1].usuarios },
      resultado: 'avancou',
    }
  }
  return { campos: { aprovacao: nova, aprovadorIds: [] }, resultado: 'aprovado' }
}

// Confere a alçada antes de gravar (as regras conferem de novo). Devolve a
// lista de problemas: { chave, faixa?, nivel? } com índices a partir de 1.
export function problemasDaAlcada(faixas) {
  const p = []
  if (!Array.isArray(faixas) || !faixas.length) return [{ chave: 'alcErroSemFaixa' }]
  if (faixas.length > MAX_FAIXAS) p.push({ chave: 'alcErroFaixas' })
  faixas.forEach((f, i) => {
    const ultima = i === faixas.length - 1
    if (!ultima && !(Number.isFinite(f.ate) && f.ate > 0)) p.push({ chave: 'alcErroTeto', faixa: i + 1 })
    if (!ultima && i > 0 && Number.isFinite(f.ate) && Number.isFinite(faixas[i - 1].ate) && f.ate <= faixas[i - 1].ate) {
      p.push({ chave: 'alcErroOrdem', faixa: i + 1 })
    }
    if (!f.niveis?.length || f.niveis.length > MAX_NIVEIS) p.push({ chave: 'alcErroNiveis', faixa: i + 1 })
    ;(f.niveis || []).forEach((nv, j) => {
      const onde = { faixa: i + 1, nivel: j + 1 }
      if (!String(nv.nome || '').trim()) p.push({ chave: 'alcErroNomeNivel', ...onde })
      const perfis = nv.perfis || [], usuarios = nv.usuarios || []
      if (!perfis.length && !usuarios.length) p.push({ chave: 'alcErroQuem', ...onde })
      if (usuarios.length > MAX_PESSOAS) p.push({ chave: 'alcErroPessoas', ...onde })
      if (!Number.isInteger(nv.minimo) || nv.minimo < 1 || nv.minimo > MAX_PESSOAS ||
          (!perfis.length && nv.minimo > usuarios.length)) p.push({ chave: 'alcErroMinimo', ...onde })
    })
  })
  return p
}

// A alçada no formato gravado: só os campos conhecidos, a última faixa sem
// teto e os nomes sem espaços nas pontas
export function limparAlcada(faixas) {
  return faixas.map((f, i) => ({
    ate: i === faixas.length - 1 ? null : Number(f.ate),
    niveis: f.niveis.map(nv => ({
      nome: String(nv.nome || '').trim(),
      perfis: PERFIS_QUE_APROVAM.filter(x => (nv.perfis || []).includes(x)),
      usuarios: [...new Set(nv.usuarios || [])],
      minimo: Number(nv.minimo) || 1,
    })),
  }))
}
