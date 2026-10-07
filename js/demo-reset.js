// ── Renovação da demonstração, feita pelo próprio app ─────────
// A demo pública é renovada uma vez por dia, no primeiro acesso do dia à
// conta demo (e na hora, pelo "Restaurar dados" da faixa). Tudo pelo
// navegador, sem Cloud Functions: o projeto roda no plano gratuito.
//
// O que sai: os pedidos de exemplo e tudo o que os visitantes criaram com a
// conta demo (pedidos, cotações, comentários, parcelas, histórico, anexos,
// fornecedores novos) e as notificações da conta demo. As empresas de exemplo
// são regravadas com os mesmos IDs, para as permissões da conta continuarem.
// Nada de outros usuários é tocado. As regras do Firestore só deixam a conta
// demo apagar isso (função eDemo() em firestore.rules).
//
// O que volta: assets/demo/seed.json, com as datas andando até hoje.
import {
  db, collection, doc, getDoc, getDocs, setDoc, query, where, writeBatch, runTransaction,
  serverTimestamp, Timestamp,
} from './firebase.js'

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

// Grava em lotes de até 450 operações (o limite do Firestore é 500). Só entra
// no lote o que as regras liberam sem consultar outro documento: num lote, as
// regras podem fazer no máximo 20 consultas no total (get), e o histórico e os
// comentários consultam o pedido a cada item. Esses vão um a um (_avulsos).
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

// ── Trava: um visitante renova, os outros esperam ─────────────
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

// ── Limpeza ──────────────────────────────────────────────────
async function _apagarDemo(uid) {
  const lote = _lotes()

  // Pedidos de exemplo (isDemo) e os que os visitantes abriram com a conta demo
  const pedidos = new Map()
  for (const q of [
    query(collection(db, 'pedidos'), where('isDemo', '==', true)),
    query(collection(db, 'pedidos'), where('solicitanteId', '==', uid)),
  ]) (await getDocs(q)).docs.forEach(d => pedidos.set(d.id, d.ref))

  await Promise.all([...pedidos.values()].map(async ref => {
    for (const sub of SUBCOLECOES) {
      (await getDocs(collection(ref, sub))).docs.forEach(d => lote.del(d.ref))
    }
  }))
  pedidos.forEach(ref => lote.del(ref))

  ;(await getDocs(query(collection(db, 'fornecedores'), where('isDemo', '==', true)))).docs.forEach(d => lote.del(d.ref))
  ;(await getDocs(collection(db, 'notificacoes', uid, 'items'))).docs.forEach(d => lote.del(d.ref))
  // Perfis antigos da conta demo (de quando ela foi recriada no console)
  ;(await getDocs(query(collection(db, 'usuarios'), where('email', '==', 'demo@praxis.app')))).docs
    .filter(d => d.id !== uid).forEach(d => lote.del(d.ref))
  await lote.fim()
}

// ── Recriação a partir do seed ────────────────────────────────
async function _aplicarSeed(seed, usuario) {
  const uid = usuario.id
  const nomeUsuario = usuario.nome || 'Demo Praxis'
  const agora = new Date()
  const agoraTs = Timestamp.fromDate(agora)
  const lote = _lotes()
  const avulsos = []

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
    fornMap[nomeNorm] = id
  }

  // 2. Empresas: mantêm o ID de antes (achadas pelo nome, com ou sem a marca
  // isDemo), para as permissões dos usuários, os filtros e as visões salvas
  // continuarem valendo
  const empresaMap = {}
  const empresasAntes = (await getDocs(collection(db, 'empresas'))).docs
  for (const emp of seed.empresas || []) {
    const { key, ...dados } = emp
    const antes = empresasAntes.find(d => _normalizar(d.data().nome) === _normalizar(emp.nome))
    const id = antes ? antes.id : `demo-${key || _slug(emp.nome)}`
    lote.set(doc(db, 'empresas', id), { ...dados, isDemo: true, criadaEm: agoraTs })
    empresaMap[key] = id
  }
  const empresasIds = Object.values(empresaMap)

  // 3. Categorias: reaproveita as existentes pelo nome; cria as que faltarem
  const categoriaMap = {}
  const existentes = (await getDocs(collection(db, 'categorias'))).docs
  for (const c of CATEGORIAS_BASE) {
    const achada = existentes.find(d => _normalizar(d.data().nome) === _normalizar(c.nome))
    if (achada) { categoriaMap[c.key] = achada.id; continue }
    const id = `demo-${c.key}`
    lote.set(doc(db, 'categorias', id), { nome: c.nome, cor: c.cor, tipo: 'padrao', criadaEm: agoraTs })
    categoriaMap[c.key] = id
  }

  // 4. Pedidos (IDs fixos) e subcoleções (IDs novos a cada renovação, para
  // nunca regravar um histórico, que é imutável)
  let n = 0
  for (const ped of seed.pedidos || []) {
    n++
    const { empresaKey, categoriaKey, key, historico, comentarios, cotacoes, parcelas, ...dados } = ped
    const hist = historico || []
    const numeroPedido = 'PRX-' + String(n).padStart(4, '0')
    const pedRef = doc(db, 'pedidos', `demo-${String(n).padStart(4, '0')}`)
    for (const campo of ['dataNecessaria', 'dataCompra', 'dataEntrega']) if (dados[campo]) dados[campo] = deslocar(dados[campo])
    const indicada = (cotacoes || []).find(c => c.indicada)
    const quando = st => hist.find(h => h.status === st)?.diasAtras

    lote.set(pedRef, {
      ...dados,
      empresaId:          empresaMap[empresaKey] || empresasIds[0] || '',
      categoriaId:        categoriaMap[categoriaKey] || '',
      solicitanteId:      uid,
      solicitanteNome:    nomeUsuario,
      compradorId:        dados.dataCompra ? uid : null,
      compradorAssumiuEm: dados.dataCompra ? ts(hist[1]?.diasAtras ?? 1) : null,
      aprovadorIds:       [],
      aprovadoPor:        null,
      aprovadoEm:         ['aprovado', 'comprado', 'entregue', 'pago'].includes(dados.status) ? ts(quando('aprovado') ?? 5) : null,
      reprovadoPor:       dados.status === 'reprovado' ? uid : null,
      reprovadoEm:        dados.status === 'reprovado' ? ts(quando('reprovado') ?? 3) : null,
      canceladoPor:       dados.status === 'cancelado' ? uid : null,
      canceladoEm:        dados.status === 'cancelado' ? ts(quando('cancelado') ?? 3) : null,
      motivoCancelamento:       dados.motivoCancelamento || null,
      motivoCancelamentoOutros: dados.motivoCancelamentoOutros || null,
      motivoReprovacao:         dados.motivoReprovacao || null,
      motivoReprovacaoOutros:   dados.motivoReprovacaoOutros || null,
      fornecedorId:       indicada ? (fornMap[_normalizar(indicada.fornecedorNome)] || null) : null,
      numeroPedido,
      isDemo:             true,
      criadoEm:           hist.length ? ts(hist[0].diasAtras) : agoraTs,
      atualizadoEm:       hist.length ? ts(hist[hist.length - 1].diasAtras) : agoraTs,
    })
    hist.forEach((h, i) => avulsos.push([doc(collection(pedRef, 'historico')), {
      status: h.status, nota: h.nota || null, autorId: uid, criadoEm: ts(h.diasAtras),
    }]))
    ;(comentarios || []).forEach((c, i) => avulsos.push([doc(collection(pedRef, 'comentarios')), {
      texto: c.texto, autorId: uid, criadoEm: ts(c.diasAtras),
    }]))
    ;(cotacoes || []).forEach((c, i) => lote.set(doc(collection(pedRef, 'cotacoes')), {
      fornecedorId: fornMap[_normalizar(c.fornecedorNome)] || null,
      fornecedorNome: c.fornecedorNome, valor: c.valor,
      prazoEntrega: c.prazoEntrega || null, condicoesComerciais: c.condicoesComerciais || null,
      indicada: c.indicada === true, registradoPor: uid, criadoEm: agoraTs,
    }))
    ;(parcelas || []).forEach((p, i) => lote.set(doc(collection(pedRef, 'parcelas')), {
      numero: p.numero, total: p.total, valor: p.valor,
      vencimento: p.vencimentoDias != null ? maisDias(p.vencimentoDias) : deslocar(p.vencimento),
      pago: p.pago === true, pagoEm: p.pago && p.diasAtras != null ? ts(p.diasAtras) : null,
      criadoEm: agoraTs,
    }))
  }

  // 5. Contador dos números de pedido e empresas da conta demo
  lote.mesclar(doc(db, '_meta', 'contadores'), { totalPedidos: n })
  lote.mesclar(doc(db, 'usuarios', uid), { empresas: empresasIds, atualizadoEm: serverTimestamp() })
  await lote.fim()
  // Histórico e comentários depois dos pedidos (as regras deles leem o pedido)
  for (let i = 0; i < avulsos.length; i += 25) {
    await Promise.all(avulsos.slice(i, i + 25).map(([ref, dados]) => setDoc(ref, dados)))
  }
  return n
}

// ── Ponto de entrada ─────────────────────────────────────────
// Garante a demo do dia (forcar=false) ou renova agora (forcar=true).
// Devolve 'em-dia' quando não precisou renovar e 'renovada' quando renovou.
// aoComecar: chamado só quando a renovação vai mesmo acontecer (para avisar
// na tela de carregamento).
export async function renovarDemo(usuario, { forcar = false, aoComecar } = {}) {
  let trava = await _pegarTrava(forcar)
  if (trava === 'em-dia') return 'em-dia'
  if (trava === 'ocupado') {
    aoComecar?.()
    await _esperarOutroVisitante()
    if (!forcar) return 'em-dia'
    trava = await _pegarTrava(true)
    if (trava !== 'minha') return 'em-dia'
  }
  aoComecar?.()
  try {
    const resp = await fetch('/assets/demo/seed.json', { cache: 'no-store' })
    if (!resp.ok) throw new Error(`seed ${resp.status}`)
    const seed = await resp.json()
    await _apagarDemo(usuario.id)
    await _aplicarSeed(seed, usuario)
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
