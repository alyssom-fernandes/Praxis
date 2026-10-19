// ── Renovação da demonstração, feita pelo próprio app ─────────
// A demo pública é renovada uma vez por dia, no primeiro acesso do dia à
// conta demo (e na hora, pelo "Restaurar dados" da faixa). Tudo pelo
// navegador, sem Cloud Functions: o projeto roda no plano gratuito. A
// renovação do dia corre em segundo plano (js/app.js): quem entra vê o
// quadro na hora, com os dados de ontem, e os pedidos voltam ao lugar
// conforme as gravações chegam.
//
// As seis pessoas da demo (js/demo-pessoas.js) e três colegas ganham o perfil
// em /usuarios e a sua parte nos dados: os pedidos são abertos pela
// solicitante, pela gestora e por um colega de cada empresa; a compradora cota
// e compra, o aprovador decide, o financeiro paga. Histórico e comentários saem
// assinados por quem fez cada coisa, e cada pessoa recebe os avisos que lhe
// caberiam (na demo não rodam as Cloud Functions que os gerariam).
//
// O que volta: assets/demo/seed.json, com as datas andando até hoje. Os
// pedidos de exemplo, as pessoas, as empresas e os fornecedores têm IDs
// fixos e são regravados por cima (o quadro aberto não chega a esvaziar).
//
// O que sai: tudo o que os visitantes criaram com a conta demo (pedidos,
// cotações, comentários, parcelas, histórico, anexos, fornecedores novos), as
// subcoleções antigas dos pedidos de exemplo e os avisos da demo. A conta
// demo só alcança o que é da demonstração (perfil 'demo' em firestore.rules:
// documentos marcados com isDemo e pedidos com ID "demo-…"); nada de outros
// usuários é lido nem tocado.
import {
  db, collection, doc, getDoc, getDocs, query, where, writeBatch, runTransaction,
  serverTimestamp, Timestamp,
} from './firebase.js'
import { PESSOAS_DEMO, COLEGAS_DEMO } from './demo-pessoas.js'

const SUBCOLECOES = ['cotacoes', 'comentarios', 'parcelas', 'historico', 'anexos']
const CATEGORIAS_BASE = [
  { key: 'manutencao',  nome: 'Manutenção',       cor: '#C0705A' },
  { key: 'escritorio',  nome: 'Escritório',       cor: '#6E8FA8' },
  { key: 'operacional', nome: 'Operacional',      cor: '#B8894A' },
  { key: 'alimentacao', nome: 'Alimentação',      cor: '#7E9A62' },
  { key: 'uniformes',   nome: 'Uniformes e EPIs', cor: '#8E7AA0' },
  { key: 'marketing',   nome: 'Marketing',        cor: '#C29A55' },
  { key: 'ti',          nome: 'TI',               cor: '#5E8F8A' },
  { key: 'servicos',    nome: 'Serviços',         cor: '#9A8B78' },
]
const TRAVA_MS = 3 * 60 * 1000

// Dia de hoje em São Paulo (a renovação vira à meia-noite de Brasília)
function _hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

const _normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const _slug = s => _normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Grava em lotes de até 450 operações (o limite do Firestore é 500). Para a
// conta demo, as regras decidem pelo ID do pedido, sem consultar o
// pedido-pai, então histórico e comentários também cabem nos lotes.
function _lotes() {
  let batch = writeBatch(db), n = 0
  const pendentes = []
  return {
    set(ref, dados) { batch.set(ref, dados); if (++n >= 450) this.virar() },
    mesclar(ref, dados) { batch.set(ref, dados, { merge: true }); if (++n >= 450) this.virar() },
    del(ref) { batch.delete(ref); if (++n >= 450) this.virar() },
    virar() { if (n) pendentes.push(batch.commit()); batch = writeBatch(db); n = 0 },
    async fim() { this.virar(); await Promise.all(pendentes) },
  }
}

// ── Trava: um visitante renova de cada vez ────────────────────
async function _pegarTrava(forcar) {
  const ref = doc(db, '_meta', 'demo')
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    const d = snap.exists() ? snap.data() : {}
    const agora = Date.now()
    if (!forcar && d.dia === _hojeSP()) return 'em-dia'
    if (d.travadoAte && d.travadoAte > agora) return 'ocupado'
    tx.set(ref, { travadoAte: agora + TRAVA_MS }, { merge: true })
    return 'minha'
  })
}

async function _esperarOutroVisitante() {
  const ref = doc(db, '_meta', 'demo')
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500))
    const d = (await getDoc(ref)).data() || {}
    if (!d.travadoAte || d.travadoAte < Date.now()) return
  }
}

// ── O que a demo tem agora ────────────────────────────────────
// Só o que a conta demo alcança: pedidos marcados, as subcoleções dos que
// estão na área da demo (ID "demo-…"), fornecedores marcados, os avisos das
// pessoas da demo e os perfis antigos da própria conta (de quando ela foi
// recriada no console)
async function _lerDemoAtual(uid) {
  const [perfisConta, pedidos, fornecedores] = await Promise.all([
    getDocs(query(collection(db, 'usuarios'), where('email', '==', 'demo@praxis.app'))),
    getDocs(query(collection(db, 'pedidos'), where('isDemo', '==', true))),
    getDocs(query(collection(db, 'fornecedores'), where('isDemo', '==', true))),
  ])
  const subdocs = []
  await Promise.all(pedidos.docs.filter(d => d.id.startsWith('demo-')).map(async d => {
    const snaps = await Promise.all(SUBCOLECOES.map(sub => getDocs(collection(d.ref, sub))))
    snaps.forEach(s => s.docs.forEach(x => subdocs.push(x.ref)))
  }))
  const donos = [uid, ...PESSOAS_DEMO.map(p => p.id), ...COLEGAS_DEMO.map(p => p.id)]
  const avisos = (await Promise.all(donos.map(dono => getDocs(collection(db, 'notificacoes', dono, 'items')))))
    .flatMap(s => s.docs.map(d => d.ref))
  return {
    pedidos: pedidos.docs.map(d => d.ref),
    fornecedores: fornecedores.docs.map(d => d.ref),
    perfisAntigos: perfisConta.docs.filter(d => d.id !== uid).map(d => d.ref),
    subdocs, avisos,
  }
}

// ── Recriação a partir do seed ────────────────────────────────
// Grava o seed por cima e apaga o que não voltou. Nenhum documento é
// regravado e apagado na mesma renovação (os lotes vão em paralelo).
async function _aplicarSeed(seed, usuario, antes, aoProgresso) {
  const uid = usuario.id
  const agora = new Date()
  const agoraTs = Timestamp.fromDate(agora)
  const lote = _lotes()
  const gravados = new Set()

  // Horários "naturais" (entre 8h e 18h), sempre os mesmos para o mesmo item
  let semente = 7
  const aleatorio = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280 }
  const ts = diasAtras => {
    if (diasAtras == null) return agoraTs
    const d = new Date(agora)
    d.setDate(d.getDate() - diasAtras)
    d.setHours(8 + Math.floor(aleatorio() * 10), Math.floor(aleatorio() * 60), 0, 0)
    return Timestamp.fromDate(d)
  }
  // As datas fixas do seed foram escritas para seed._dataReferencia; todas
  // andam a mesma distância até hoje, para a demo nunca envelhecer
  const ref = seed._dataReferencia ? new Date(seed._dataReferencia + 'T12:00:00') : null
  const hojeMeio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12)
  const desloc = ref ? Math.round((hojeMeio - ref) / 864e5) : 0
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const deslocar = s => { if (!s || !desloc) return s; const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + desloc); return iso(d) }
  const maisDias = n => { const d = new Date(agora); d.setDate(d.getDate() + n); return iso(d) }

  // 1. Fornecedores (nome normalizado, como o app consulta)
  const fornMap = {}
  for (const forn of seed.fornecedores || []) {
    const { usos, ...dados } = forn
    const nomeNorm = _normalizar(forn.nome)
    const id = `demo-${_slug(forn.nome)}`
    lote.set(doc(db, 'fornecedores', id), { ...dados, usos: usos || 0, nome: nomeNorm, nomeExibicao: forn.nome, ativo: true, isDemo: true, criadoEm: agoraTs })
    gravados.add(`fornecedores/${id}`)
    fornMap[nomeNorm] = id
  }

  // 2. Empresas: mantêm o ID de antes (achadas pelo nome entre as da demo),
  // para as permissões dos usuários, os filtros e as visões salvas
  // continuarem valendo
  const empresaMap = {}
  const empresasAntes = (await getDocs(query(collection(db, 'empresas'), where('isDemo', '==', true)))).docs
  for (const emp of seed.empresas || []) {
    const { key, ...dados } = emp
    const antes = empresasAntes.find(d => _normalizar(d.data().nome) === _normalizar(emp.nome))
    const id = antes ? antes.id : `demo-${key || _slug(emp.nome)}`
    lote.set(doc(db, 'empresas', id), { ...dados, isDemo: true, criadaEm: agoraTs })
    empresaMap[key] = id
  }
  const empresasIds = Object.values(empresaMap)

  // Perfis das pessoas da demo e dos colegas (IDs fixos, regravados a cada
  // renovação). O último acesso fica em horários plausíveis; o de quem entra
  // agora é gravado na entrada (js/app.js)
  const P = Object.fromEntries(PESSOAS_DEMO.map(p => [p.perfil, p.id]))
  const TODOS = [...PESSOAS_DEMO, ...COLEGAS_DEMO]
  const nomeDe = Object.fromEntries(TODOS.map(p => [p.id, p.nome]))
  const empresasDe = Object.fromEntries(TODOS.map(p => [p.id, p.empresas.length ? p.empresas.map(k => empresaMap[k]).filter(Boolean) : empresasIds]))
  const HORAS_SEM_ENTRAR = {
    'demo-supremo': 1, 'demo-gestor': 3, 'demo-aprovador': 26, 'demo-comprador': 2,
    'demo-financeiro': 50, 'demo-solicitante': 6, 'demo-gustavo': 30, 'demo-helena': 75, 'demo-igor': 290,
  }
  const horasAtras = h => Timestamp.fromDate(new Date(agora.getTime() - h * 3600e3))
  for (const p of TODOS) {
    lote.set(doc(db, 'usuarios', p.id), {
      nome: p.nome, email: p.email, perfil: p.perfil, ativo: true, isDemo: true,
      empresas: empresasDe[p.id], ultimoAcesso: horasAtras(HORAS_SEM_ENTRAR[p.id] ?? 48), criadoEm: agoraTs,
    })
  }
  const colegaDa = Object.fromEntries(COLEGAS_DEMO.map(c => [c.empresas[0], c.id]))
  const resumo = []

  // 3. Categorias: reaproveita as da demo pelo nome; cria as que faltarem
  const categoriaMap = {}
  const existentes = (await getDocs(query(collection(db, 'categorias'), where('isDemo', '==', true)))).docs
  for (const c of CATEGORIAS_BASE) {
    const achada = existentes.find(d => _normalizar(d.data().nome) === _normalizar(c.nome))
    if (achada) { categoriaMap[c.key] = achada.id; continue }
    const id = `demo-${c.key}`
    lote.set(doc(db, 'categorias', id), { nome: c.nome, cor: c.cor, tipo: 'padrao', isDemo: true, criadaEm: agoraTs })
    categoriaMap[c.key] = id
  }

  // 4. Pedidos (IDs fixos) e subcoleções (IDs novos a cada renovação, para
  // nunca regravar um histórico, que é imutável)
  // Pedido reaberto ("reabertoDeKey" no seed): os dois ficam ligados, como no
  // "Reabrir" do detalhe (reabertoDe no novo, reabertoPara no reprovado)
  const idDe = i => `demo-${String(i).padStart(4, '0')}`
  const numDe = i => 'PRX-' + String(i).padStart(4, '0')
  const nDaKey = {}, reabertoComo = {}
  ;(seed.pedidos || []).forEach((p, i) => {
    nDaKey[p.key] = i + 1
    if (p.reabertoDeKey) reabertoComo[p.reabertoDeKey] = i + 1
  })
  let n = 0
  for (const ped of seed.pedidos || []) {
    n++
    const { empresaKey, categoriaKey, key, abertoPor, reabertoDeKey, historico, comentarios, cotacoes, parcelas, ...dados } = ped
    const hist = historico || []
    const numeroPedido = numDe(n)
    const pedRef = doc(db, 'pedidos', idDe(n))
    gravados.add(`pedidos/${pedRef.id}`)
    const de = nDaKey[reabertoDeKey], como = reabertoComo[key]
    if (de) Object.assign(dados, { reabertoDe: idDe(de), reabertaDeNum: numDe(de) })
    if (como) Object.assign(dados, { reabertoPara: idDe(como), reabertaParaNum: numDe(como) })
    for (const campo of ['dataNecessaria', 'dataCompra', 'dataEntrega']) if (dados[campo]) dados[campo] = deslocar(dados[campo])
    const indicada = (cotacoes || []).find(c => c.indicada)
    // Um horário por etapa, o mesmo no pedido e no histórico (ts() sorteia a hora)
    const tsHist = hist.map(h => ts(h.diasAtras))
    const quando = (st, padrao) => { const i = hist.findIndex(h => h.status === st); return i >= 0 ? tsHist[i] : ts(padrao) }
    // Quem fez o quê: o Artur, o Carlos e o Eduardo abriram os pedidos marcados
    // com "abertoPor" no seed (dois cada, para ninguém ver "Meus pedidos 0");
    // a Fernanda (solicitante), um em cada quatro; a Beatriz (gestora), alguns
    // nas empresas dela; os outros, o colega da empresa. A Diana comprou o que
    // passou da cotação; o Carlos decidiu; o Eduardo pagou
    const solicitante = P[abertoPor] ? P[abertoPor]
      : n % 4 === 1 ? P.solicitante
      : n % 4 === 0 && empresasDe[P.gestor].includes(empresaMap[empresaKey]) ? P.gestor
      : colegaDa[empresaKey] || P.solicitante
    const temComprador = ['ag_cotacao', 'em_aprovacao', 'aprovado', 'comprado', 'entregue', 'pago', 'reprovado'].includes(dados.status)
    const autorDaEtapa = {
      solicitado: solicitante, ag_cotacao: P.comprador, em_aprovacao: P.comprador,
      aprovado: P.aprovador, reprovado: P.aprovador, comprado: P.comprador,
      entregue: P.comprador, pago: P.financeiro, cancelado: solicitante,
    }
    const comentaristas = [solicitante, temComprador ? P.comprador : P.gestor, P.aprovador]

    lote.set(pedRef, {
      ...dados,
      empresaId:          empresaMap[empresaKey] || empresasIds[0] || '',
      categoriaId:        categoriaMap[categoriaKey] || '',
      solicitanteId:      solicitante,
      solicitanteNome:    nomeDe[solicitante],
      compradorId:        temComprador ? P.comprador : null,
      compradorNome:      temComprador ? nomeDe[P.comprador] : null,
      compradorAssumiuEm: temComprador ? quando('ag_cotacao', hist[1]?.diasAtras ?? 1) : null,
      aprovadorIds:       [],
      aprovadoPor:        ['aprovado', 'comprado', 'entregue', 'pago'].includes(dados.status) ? P.aprovador : null,
      aprovadoEm:         ['aprovado', 'comprado', 'entregue', 'pago'].includes(dados.status) ? quando('aprovado', 5) : null,
      reprovadoPor:       dados.status === 'reprovado' ? P.aprovador : null,
      reprovadoEm:        dados.status === 'reprovado' ? quando('reprovado', 3) : null,
      canceladoPor:       dados.status === 'cancelado' ? solicitante : null,
      canceladoEm:        dados.status === 'cancelado' ? quando('cancelado', 3) : null,
      motivoCancelamento:       dados.motivoCancelamento || null,
      motivoCancelamentoOutros: dados.motivoCancelamentoOutros || null,
      motivoReprovacao:         dados.motivoReprovacao || null,
      motivoReprovacaoOutros:   dados.motivoReprovacaoOutros || null,
      fornecedorId:       indicada ? (fornMap[_normalizar(indicada.fornecedorNome)] || null) : null,
      numeroPedido,
      isDemo:             true,
      criadoEm:           hist.length ? tsHist[0] : agoraTs,
      atualizadoEm:       hist.length ? tsHist[hist.length - 1] : agoraTs,
    })
    hist.forEach((h, i) => lote.set(doc(collection(pedRef, 'historico')), {
      status: h.status, nota: h.nota || null, autorId: autorDaEtapa[h.status] || solicitante, criadoEm: tsHist[i],
    }))
    ;(comentarios || []).forEach((c, i) => lote.set(doc(collection(pedRef, 'comentarios')), {
      texto: c.texto, autorId: comentaristas[i % comentaristas.length], criadoEm: ts(c.diasAtras),
    }))
    ;(cotacoes || []).forEach((c, i) => lote.set(doc(collection(pedRef, 'cotacoes')), {
      fornecedorId: fornMap[_normalizar(c.fornecedorNome)] || null,
      fornecedorNome: c.fornecedorNome, valor: c.valor,
      prazoEntrega: c.prazoEntrega || null, condicoesComerciais: c.condicoesComerciais || null,
      indicada: c.indicada === true, registradoPor: P.comprador, criadoEm: agoraTs,
    }))
    resumo.push({
      id: pedRef.id, numero: numeroPedido, titulo: dados.titulo, status: dados.status, urgente: dados.urgente === true,
      solicitante, hist, parcelas: parcelas || [],
      comentarios: (comentarios || []).map((c, i) => ({ ...c, autor: comentaristas[i % comentaristas.length] })),
    })
    ;(parcelas || []).forEach((p, i) => lote.set(doc(collection(pedRef, 'parcelas')), {
      numero: p.numero, total: p.total, valor: p.valor,
      vencimento: p.vencimentoDias != null ? maisDias(p.vencimentoDias) : deslocar(p.vencimento),
      pago: p.pago === true, pagoEm: p.pago && p.diasAtras != null ? ts(p.diasAtras) : null,
      pagoPor: p.pago === true ? P.financeiro : null,
      criadoEm: agoraTs,
    }))
  }

  // 5. Avisos de exemplo, os mais recentes primeiro (até 6 por pessoa, 3 novos)
  const porPessoa = {}
  for (const a of _avisosDaDemo(resumo, P, nomeDe)) (porPessoa[a.para] ||= []).push(a)
  for (const [para, lista] of Object.entries(porPessoa)) {
    lista.sort((a, b) => a.horas - b.horas).slice(0, 6).forEach((a, i) => {
      lote.set(doc(collection(db, 'notificacoes', para, 'items')), {
        evento: a.evento, titulo: a.titulo, corpo: a.corpo, pedidoId: a.pedidoId,
        lida: i >= 3, criadaEm: horasAtras(a.horas), isDemo: true,
      })
    })
  }

  // 6. Contador dos números de pedido da demo e empresas da conta demo
  lote.mesclar(doc(db, '_meta', 'contadoresDemo'), { totalPedidos: n })
  lote.mesclar(doc(db, 'usuarios', uid), { empresas: empresasIds, atualizadoEm: serverTimestamp() })

  // 7. Sai o que não voltou: pedidos e fornecedores criados pelos visitantes,
  // as subcoleções e os avisos de antes e os perfis antigos da conta demo.
  // Os pedidos marcados fora da área da demo (de seeds antigos, com ID
  // automático) saem sem as subcoleções, que a conta demo não alcança.
  const sobra = ref => !gravados.has(ref.path)
  antes.pedidos.filter(sobra).forEach(ref => lote.del(ref))
  antes.fornecedores.filter(sobra).forEach(ref => lote.del(ref))
  antes.subdocs.forEach(ref => lote.del(ref))
  antes.avisos.forEach(ref => lote.del(ref))
  antes.perfisAntigos.forEach(ref => lote.del(ref))

  aoProgresso?.('pedidos', 0)
  await lote.fim()
  return n
}

// ── Avisos que as Cloud Functions mandariam ───────────────────
// Os mesmos eventos de functions/src (triggers.js e scheduled.js), tirados
// dos próprios pedidos: só para as pessoas em quem dá para entrar
function _avisosDaDemo(resumo, P, nomeDe) {
  const avisos = []
  const pessoas = new Set(PESSOAS_DEMO.map(p => p.id))
  const porNome = Object.fromEntries(PESSOAS_DEMO.map(p => [_normalizar(p.nome.split(' ')[0]), p.id]))
  const add = (para, evento, titulo, corpo, p, horas) => {
    if (pessoas.has(para)) avisos.push({ para, evento, titulo, corpo, pedidoId: p.id, horas })
  }
  for (const p of resumo) {
    const nome = `${p.numero} "${p.titulo}"`
    const horasDesde = st => ((p.hist.find(h => h.status === st)?.diasAtras ?? 0) * 24) + 2
    switch (p.status) {
      case 'solicitado':
        if (p.urgente) {
          for (const quem of [P.comprador, P.gestor, P.supremo]) {
            add(quem, 'pedido_urgente', 'Pedido urgente aberto', `${nome} aguarda um comprador.`, p, horasDesde('solicitado'))
          }
        }
        break
      case 'em_aprovacao':
        add(P.aprovador, 'cotacoes_prontas', 'Pedido aguarda aprovação', `${nome} tem cotações prontas para análise.`, p, horasDesde('em_aprovacao'))
        break
      case 'aprovado':
        add(P.comprador, 'pedido_aprovado', 'Pedido aprovado', `${nome} foi aprovado. Falta registrar a compra.`, p, horasDesde('aprovado'))
        add(p.solicitante, 'pedido_aprovado', 'Pedido aprovado', `${nome} foi aprovado.`, p, horasDesde('aprovado'))
        break
      case 'reprovado':
        add(p.solicitante, 'pedido_reprovado', 'Pedido reprovado', `${nome} foi reprovado.`, p, horasDesde('reprovado'))
        break
      case 'entregue':
        add(P.financeiro, 'pedido_entregue', 'Pedido entregue', `${nome} foi entregue. Confirme o pagamento.`, p, horasDesde('entregue'))
        add(p.solicitante, 'pedido_entregue_solic', 'Seu pedido foi entregue', `${nome} chegou.`, p, horasDesde('entregue'))
        break
    }
    for (const parc of p.parcelas) {
      if (parc.pago || parc.vencimentoDias == null) continue
      const qual = `Parcela ${parc.numero}/${parc.total} de ${p.numero}`
      const d = parc.vencimentoDias
      // A rotina diária avisa cedo; a parcela que vence antes aparece por último
      if (d < 0) add(P.financeiro, 'parcela_vencida', 'Parcela vencida', `${qual} venceu ${d === -1 ? 'ontem' : `há ${-d} dias`}.`, p, 5)
      else if (d <= 7) add(P.financeiro, 'parcela_vencendo', 'Parcela a vencer', `${qual} vence ${d === 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`}.`, p, 9 - d * 0.2)
    }
    for (const c of p.comentarios) {
      for (const m of c.texto.match(/@[\p{L}]+/gu) || []) {
        const alvo = porNome[_normalizar(m.slice(1))]
        if (alvo && alvo !== c.autor) {
          add(alvo, 'mencao_comentario', 'Você foi mencionado', `${nomeDe[c.autor] || 'Alguém'} mencionou você em ${nome}.`, p, (c.diasAtras ?? 0) * 24 + 4)
        }
      }
    }
  }
  return avisos
}

// ── Ponto de entrada ─────────────────────────────────────────
// Garante a demo do dia (forcar=false) ou renova agora (forcar=true).
// Devolve 'em-dia' quando não precisou renovar (ou quando outro visitante já
// está renovando) e 'renovada' quando renovou.
// aoComecar: chamado só quando a renovação vai mesmo acontecer.
// aoProgresso(fase): 'limpando' (lendo o que existe) e 'pedidos' (gravando),
// para a tela de espera do "Restaurar dados" dizer o que está acontecendo.
export async function renovarDemo(usuario, { forcar = false, aoComecar, aoProgresso } = {}) {
  let trava = await _pegarTrava(forcar)
  if (trava === 'em-dia') return 'em-dia'
  if (trava === 'ocupado') {
    // A entrada do dia não espera: o outro visitante já está renovando, e os
    // pedidos chegam sozinhos ao quadro. O "Restaurar dados" espera ele
    // terminar e renova de novo.
    if (!forcar) return 'em-dia'
    aoComecar?.()
    await _esperarOutroVisitante()
    trava = await _pegarTrava(true)
    if (trava !== 'minha') return 'em-dia'
  }
  aoComecar?.()
  try {
    const resp = await fetch('/assets/demo/seed.json', { cache: 'no-store' })
    if (!resp.ok) throw new Error(`seed ${resp.status}`)
    const seed = await resp.json()
    aoProgresso?.('limpando', 0)
    const antes = await _lerDemoAtual(usuario.id)
    await _aplicarSeed(seed, usuario, antes, aoProgresso)
    await runTransaction(db, async tx => {
      tx.set(doc(db, '_meta', 'demo'), { dia: _hojeSP(), renovadaEm: serverTimestamp(), travadoAte: 0 }, { merge: true })
    })
    return 'renovada'
  } catch (err) {
    // Solta a trava para o próximo visitante tentar
    try { await runTransaction(db, async tx => tx.set(doc(db, '_meta', 'demo'), { travadoAte: 0 }, { merge: true })) } catch {}
    throw err
  }
}
