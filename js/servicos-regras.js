// Serviços: as regras do chamado, sem Firebase nem DOM (testadas em
// tests/unidade.test.mjs). As mesmas passagens de etapa são conferidas pelas
// regras do Firestore (firestore.rules, /chamados).

export const ST = {
  PREVISTA: 'prevista',           // visita periódica, criada pelo app
  ABERTO: 'aberto',               // chamado aberto, esperando o prestador
  AGENDADO: 'agendado',
  ATENDIMENTO: 'atendimento',     // o técnico leu o QR de chegada
  CONCLUIDO: 'concluido',         // o técnico concluiu: espera quem pediu
  CONFIRMADO: 'confirmado',
  CONTESTADO: 'contestado',       // volta ao prestador
  NAO_REALIZADA: 'nao_realizada', // visita cuja janela passou sem chegada
  CANCELADO: 'cancelado',
}
export const TERMINAIS_CH = [ST.CONFIRMADO, ST.NAO_REALIZADA, ST.CANCELADO]
export const EM_ANDAMENTO_CH = [ST.PREVISTA, ST.ABERTO, ST.AGENDADO, ST.ATENDIMENTO, ST.CONCLUIDO, ST.CONTESTADO]

// A régua: cinco passos (a visita começa em "prevista", no lugar de "aberto")
export const PASSOS_CH = ['aberto', 'agendado', 'atendimento', 'concluido', 'confirmado']
export function posicaoNaRegua(status) {
  if (status === ST.PREVISTA) return 0
  if (status === ST.CONTESTADO) return 1   // volta para o prestador reagendar
  const i = PASSOS_CH.indexOf(status)
  return i < 0 ? 0 : i
}

// Categoria da etapa, para a cor (a mesma lógica dos pedidos)
export function categoriaCh(status) {
  if (status === ST.CONFIRMADO) return 'concluido'
  if ([ST.NAO_REALIZADA, ST.CANCELADO, ST.CONTESTADO].includes(status)) return 'encerrado'
  if ([ST.PREVISTA, ST.ABERTO].includes(status)) return 'aguardando'
  return 'andamento'
}

// Quem pode fazer o próximo passo. `u` é o usuário da sessão; `papel`, o papel
// dele em Serviços (js/modulos.js). O prestador só mexe nos chamados da
// prestadora dele; quem pediu (ou o gestor) confirma
export function acoesDoChamado(ch, u, papel) {
  const souPrestador = papel === 'prestador' && ch.fornecedorId === u.fornecedorId
  const souGestor = papel === 'gestor'
  const pediu = ch.solicitanteId === u.id
  const a = []
  if (souPrestador) {
    if ([ST.ABERTO, ST.PREVISTA, ST.CONTESTADO, ST.AGENDADO].includes(ch.status)) a.push('agendar')
    if ([ST.AGENDADO, ST.PREVISTA, ST.CONTESTADO].includes(ch.status)) a.push('chegar')
    if (ch.status === ST.ATENDIMENTO) a.push('fotos', 'extra', 'concluir')
  }
  if ((pediu || souGestor) && ch.status === ST.CONCLUIDO) a.push('confirmar', 'contestar')
  if ((pediu || souGestor) && [ST.ABERTO, ST.AGENDADO].includes(ch.status) && ch.tipo !== 'visita') a.push('cancelar')
  return a
}

// O passo está com esta pessoa? (o "com você" da lista e das contagens)
export function comVoce(ch, u, papel) {
  const a = acoesDoChamado(ch, u, papel)
  return a.some(x => ['agendar', 'chegar', 'concluir', 'confirmar'].includes(x)) &&
    !(papel === 'prestador' && ch.status === ST.AGENDADO && !_hojeOuAntes(ch.agendadoPara))
}
// agendadoPara vem do banco como Timestamp (nos testes, texto ou ms)
function _hojeOuAntes(v, agora = new Date()) {
  if (!v) return true
  const ms = typeof v?.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v)
  const fimDeHoje = new Date(agora); fimDeHoje.setHours(23, 59, 59, 999)
  return !(ms > fimDeHoje.getTime())
}

// Prazo de atendimento: abertura + horas do serviço contratado
export function prazoDoChamado(criadoMs, prazoHoras) {
  return prazoHoras > 0 ? criadoMs + prazoHoras * 3600000 : null
}
// A situação do prazo agora: atrasado e quanto falta (ou passou), em ms
export function situacaoDoPrazo(ch, agoraMs, prazoMs = ch.prazoMs) {
  if (!prazoMs || [ST.CONCLUIDO, ST.CONFIRMADO, ST.CANCELADO, ST.NAO_REALIZADA].includes(ch.status)) return null
  // Chegou ao local: o prazo de atendimento foi cumprido ou não na chegada
  const fim = ch.chegadaMs || agoraMs
  return { atrasado: fim > prazoMs, restaMs: prazoMs - fim, cumprido: !!ch.chegadaMs }
}

// Distância entre dois pontos (metros), pela fórmula do haversine
export function distanciaM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => typeof v !== 'number' || Number.isNaN(v))) return null
  const R = 6371000, rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}
// Até 300 m da unidade conta como "no local" (o GPS do celular erra dezenas de metros)
export const RAIO_DO_LOCAL_M = 300

// ── Visitas periódicas ─────────────────────────────────────────────
// Cada serviço contratado do tipo periódico (na ficha da prestadora) tem a
// frequência em dias, o início e as unidades. O app garante, para cada
// unidade, a visita do período atual e a dos dois anteriores: com o ID fixo,
// duas pessoas abrindo a tela ao mesmo tempo gravam o mesmo documento. A
// visita cujo período passou sem a chegada do técnico nasce (ou fica) "não
// realizada"; as regras conferem a data.
const _DIA = 86400000
const _iso = ms => new Date(ms).toISOString().slice(0, 10)
const _msDe = iso => Date.parse(`${iso}T00:00:00Z`)

export function idDaVisita(fornecedorId, servicoId, unidadeId, previstaISO) {
  return `vp-${fornecedorId}-${servicoId}-${unidadeId}-${previstaISO}`
}

export function visitasDevidas(fornecedor, servico, hojeISO, { periodos = 3 } = {}) {
  if (servico?.tipo !== 'periodico' || !(servico.frequenciaDias > 0) || !servico.inicio) return []
  const freq = Math.round(servico.frequenciaDias)
  const inicio = _msDe(servico.inicio), hoje = _msDe(hojeISO)
  if (Number.isNaN(inicio) || hoje < inicio) return []
  const atual = Math.floor((hoje - inicio) / (freq * _DIA))
  const saida = []
  for (let k = Math.max(0, atual - periodos + 1); k <= atual; k++) {
    const prevista = inicio + k * freq * _DIA
    const fimJanela = prevista + freq * _DIA - 1    // o último instante do período
    for (const unidadeId of servico.unidades || []) {
      saida.push({
        id: idDaVisita(fornecedor.id, servico.id, unidadeId, _iso(prevista)),
        unidadeId, servicoId: servico.id, previstaPara: _iso(prevista), janelaAteMs: fimJanela,
        vencida: hoje > fimJanela,
      })
    }
  }
  return saida
}

// ── Conferência do mês ─────────────────────────────────────────────
// O que a prestadora pode cobrar no mês (atendimentos confirmados e extras
// aprovados) e o que não pode (contestados, visitas não realizadas, extras
// reprovados ou sem aprovação). `mes` é 'AAAA-MM'; datas em ms
export function resumoDoMes(chamados, extras, mes) {
  const noMes = ms => !!ms && _iso(ms).slice(0, 7) === mes
  const r = { confirmados: [], visitasFeitas: [], naoRealizadas: [], contestados: [], extrasAprovados: [], extrasRecusados: [], totalExtras: 0 }
  for (const c of chamados) {
    if (c.status === ST.CONFIRMADO && noMes(c.confirmadoMs)) (c.tipo === 'visita' ? r.visitasFeitas : r.confirmados).push(c)
    if (c.status === ST.NAO_REALIZADA && (c.previstaPara || '').slice(0, 7) === mes) r.naoRealizadas.push(c)
    if (c.status === ST.CONTESTADO && noMes(c.contestadoMs)) r.contestados.push(c)
  }
  for (const e of extras) {
    if (e.status === 'aprovado' && noMes(e.decididoMs)) { r.extrasAprovados.push(e); r.totalExtras += Number(e.valor) || 0 }
    if (e.status === 'reprovado' && noMes(e.decididoMs)) r.extrasRecusados.push(e)
  }
  r.totalExtras = Math.round(r.totalExtras * 100) / 100
  return r
}

// ── Painel da prestadora (últimos N dias) ──────────────────────────
export function painelDaPrestadora(chamados, extras, agoraMs, dias = 90) {
  const desde = agoraMs - dias * _DIA
  const ch = chamados.filter(c => (c.criadoMs || c.previstaMs || 0) >= desde)
  const reais = ch.filter(c => c.tipo !== 'visita' && c.status !== ST.CANCELADO)
  const comPrazo = reais.filter(c => c.prazoMs && c.chegadaMs)
  // Só as visitas que já fecharam: a agendada ou em andamento ainda não conta
  const visitas = ch.filter(c => c.tipo === 'visita' && [ST.CONFIRMADO, ST.CONCLUIDO, ST.CONTESTADO, ST.NAO_REALIZADA].includes(c.status))
  const ex = extras.filter(e => (e.criadoMs || 0) >= desde)
  return {
    chamados: reais.length,
    noPrazo: comPrazo.filter(c => c.chegadaMs <= c.prazoMs).length,
    comPrazo: comPrazo.length,
    visitasFeitas: visitas.filter(c => c.status !== ST.NAO_REALIZADA).length,
    visitas: visitas.length,
    contestados: ch.filter(c => c.contestacoes > 0 || c.status === ST.CONTESTADO).length,
    extrasAprovados: Math.round(ex.filter(e => e.status === 'aprovado').reduce((s, e) => s + (Number(e.valor) || 0), 0) * 100) / 100,
    extrasPedidos: Math.round(ex.reduce((s, e) => s + (Number(e.valor) || 0), 0) * 100) / 100,
  }
}

// Número do chamado: CH-0001
export const numeroDoChamado = n => `CH-${String(n).padStart(4, '0')}`
