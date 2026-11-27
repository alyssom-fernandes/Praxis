// Serviços e Equipamentos na demonstração (27/11/2026): as unidades das três
// empresas de exemplo, os serviços contratados de três prestadoras, chamados
// em cada etapa (aberto, agendado, técnico no local, esperando a confirmação,
// confirmado, contestado, cancelado), as visitas periódicas dos últimos meses
// (uma não realizada), os aparelhos com consertos, garantia e aviso de troca,
// e uma contagem. Tudo com datas relativas a hoje, regravado a cada renovação
// (js/demo-reset.js). Os IDs levam "demo-" (firestore.rules decide por ele).
import { Timestamp } from './firebase.js'

const _normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const _slug = s => _normalizar(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const FORN = nome => `demo-${_slug(nome)}`
const EXPRESS = FORN('Manutenção Express Serviços')
const ENERGIA = FORN('Energia Total Equipamentos')
const GERAIS = FORN('Soluções Gerais ME')
const NOME_FORN = { [EXPRESS]: 'Manutenção Express Serviços', [ENERGIA]: 'Energia Total Equipamentos', [GERAIS]: 'Soluções Gerais ME' }

// O técnico da Manutenção Express que se pode escolher na demo
// (js/demo-pessoas.js) e um colega dele, que só aparece na lista de técnicos
export const PRESTADORA_DA_DEMO = EXPRESS
export const TECNICOS_DEMO = [
  { id: 'demo-lucas', nome: 'Lucas Pereira', email: 'lucas.pereira@usuarios.praxis.invalid', perfil: 'prestador', fornecedorId: EXPRESS, prestadorAdmin: false, empresas: [] },
]

export const UNIDADES_DEMO = [
  { key: 'nx-sede', empresa: 'nexara', nome: 'Nexara · Sede', endereco: 'Av. Paulista, 1500, São Paulo', lat: -23.5614, lng: -46.6559 },
  { key: 'nx-campinas', empresa: 'nexara', nome: 'Nexara · Campinas', endereco: 'Av. Norte-Sul, 800, Campinas', lat: -22.8949, lng: -47.0517 },
  { key: 'vt-matriz', empresa: 'veltora', nome: 'Veltora · Matriz', endereco: 'Rua Vergueiro, 3200, São Paulo', lat: -23.5869, lng: -46.6366 },
  { key: 'vt-centro', empresa: 'veltora', nome: 'Veltora · Loja Centro', endereco: 'Rua Direita, 120, São Paulo', lat: -23.5481, lng: -46.6352 },
  { key: 'ox-fabrica', empresa: 'orbix', nome: 'Orbix · Fábrica', endereco: 'Rod. Anhanguera, km 28, Cajamar', lat: -23.3556, lng: -46.8770 },
  { key: 'ox-deposito', empresa: 'orbix', nome: 'Orbix · Depósito', endereco: 'Av. Industrial, 45, Barueri', lat: -23.5057, lng: -46.8761 },
]
const UN = key => `demo-un-${key}`
const _un = key => UNIDADES_DEMO.find(u => u.key === key)

const _iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function _dia(agora, n) { const d = new Date(agora); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d }

// Os serviços contratados (vão na ficha de cada prestadora). As visitas
// periódicas começam em datas que dão três períodos até hoje
export function servicosDaDemo(agora = new Date()) {
  return {
    [EXPRESS]: [
      { id: 'demo-s-prev', nome: 'Manutenção preventiva dos ar-condicionados', tipo: 'periodico', frequenciaDias: 30, inicio: _iso(_dia(agora, -75)), prazoHoras: 0, unidades: [UN('nx-sede'), UN('vt-matriz')] },
      { id: 'demo-s-ar', nome: 'Conserto de ar-condicionado', tipo: 'chamado', prazoHoras: 24, unidades: [] },
    ],
    [ENERGIA]: [
      { id: 'demo-s-nbk', nome: 'Revisão dos nobreaks e do gerador', tipo: 'periodico', frequenciaDias: 90, inicio: _iso(_dia(agora, -100)), prazoHoras: 0, unidades: [UN('ox-fabrica')] },
      { id: 'demo-s-ele', nome: 'Elétrica', tipo: 'chamado', prazoHoras: 8, unidades: [] },
    ],
    [GERAIS]: [
      { id: 'demo-s-rep', nome: 'Pequenos reparos', tipo: 'chamado', prazoHoras: 48, unidades: [] },
    ],
  }
}

// O resto: devolve os documentos a gravar, cada um com as subcoleções
export function modulosDaDemo({ agora = new Date(), empresaMap, P, nomeDe }) {
  const ts = (dias, h = 10, m = 0) => { const d = _dia(agora, dias); d.setHours(h, m, 0, 0); return Timestamp.fromDate(d) }
  const horas = h => Timestamp.fromMillis(agora.getTime() - h * 3600e3)
  const docs = []
  const empresaDe = key => empresaMap[_un(key).empresa] || ''

  // ── Unidades ──
  for (const u of UNIDADES_DEMO) {
    docs.push({ col: 'unidades', id: UN(u.key), dados: {
      empresaId: empresaDe(u.key), nome: u.nome, endereco: u.endereco, lat: u.lat, lng: u.lng, precisaoM: 12,
      ativa: true, criadoEm: ts(-120), atualizadoEm: ts(-120),
    }, sub: [{ col: 'privado', id: 'placa', dados: { codigo: `demo${_slug(u.key).replace(/-/g, '')}placa2026` } }] })
  }

  // ── Equipamentos ──
  const EQ = []
  const eq = (etiqueta, tipo, un, setor, descricao, extra = {}) => {
    const e = { id: `demo-eq-${etiqueta.toLowerCase()}`, etiqueta, tipo, unidadeKey: un, setor, descricao, ...extra }
    EQ.push(e)
    return e
  }
  const ar1 = eq('AC-0001', 'ar_condicionado', 'nx-sede', 'Recepção', 'Split 12.000 BTUs', { marca: 'LG', modelo: 'Dual Inverter', serie: 'LG12-88412', compra: [-700, 2390], garantiaDias: 30, precoNovo: 2600,
    custos: [[-210, 380, 'Troca do sensor de temperatura', 'Manutenção Express Serviços'], [-60, 450, 'Limpeza e carga de gás', 'Manutenção Express Serviços']] })
  const ar2 = eq('AC-0002', 'ar_condicionado', 'nx-sede', 'Diretoria', 'Split 18.000 BTUs', { marca: 'Daikin', modelo: 'EcoSwing', serie: 'DK18-30177', compra: [-900, 3890], precoNovo: 4100,
    custos: [[-26, 320, 'Troca da placa eletrônica', 'Manutenção Express Serviços']] })
  eq('AC-0003', 'ar_condicionado', 'nx-sede', 'Sala de reunião', 'Split 9.000 BTUs', { marca: 'Springer', modelo: 'Midea', serie: 'SP09-11820', compra: [-2200, 1490], precoNovo: 2200,
    custos: [[-320, 600, 'Troca do compressor', 'Refrigeração Polar'], [-190, 550, 'Vazamento de gás', 'Manutenção Express Serviços'], [-95, 480, 'Troca do motor da ventilação', 'Manutenção Express Serviços'], [-40, 390, 'Placa e sensor', 'Manutenção Express Serviços']] })
  const ar4 = eq('AC-0004', 'ar_condicionado', 'nx-campinas', 'Sala 2', 'Split 12.000 BTUs', { marca: 'Samsung', modelo: 'WindFree', serie: 'SM12-55103', compra: [-420, 2790], garantiaDias: 310, precoNovo: 2900 })
  eq('AC-0005', 'ar_condicionado', 'vt-matriz', 'Atendimento', 'Split 24.000 BTUs', { marca: 'LG', modelo: 'Dual Inverter', serie: 'LG24-90021', compra: [-500, 4690], precoNovo: 4900 })
  eq('PC-0001', 'computador', 'nx-sede', 'Recepção', 'Desktop da recepção', { marca: 'Dell', modelo: 'OptiPlex 3000', serie: 'D3K-7781', compra: [-640, 3890], precoNovo: 4200 })
  eq('PC-0002', 'computador', 'nx-sede', 'Financeiro', 'Desktop antigo do financeiro', { marca: 'Positivo', modelo: 'Master D', serie: 'PS-22019', compra: [-2400, 2190], precoNovo: 3500,
    status: 'baixado', baixa: { motivo: 'Trocado por um notebook', data: _iso(_dia(agora, -150)), porNome: nomeDe[P.gestor] } })
  eq('NB-0001', 'notebook', 'nx-sede', 'TI', 'Notebook Dell Latitude', { marca: 'Dell', modelo: 'Latitude 5440', serie: 'DL54-01992', compra: [-150, 6890], garantiaDias: 580, precoNovo: 6900, pedido: ['demo-0001', 'PRX-0001', 'TechSupply Comércio'] })
  eq('NB-0002', 'notebook', 'nx-sede', 'TI', 'Notebook Dell Latitude', { marca: 'Dell', modelo: 'Latitude 5440', serie: 'DL54-01993', compra: [-150, 6890], garantiaDias: 580, precoNovo: 6900, pedido: ['demo-0001', 'PRX-0001', 'TechSupply Comércio'] })
  eq('IMP-0001', 'impressora', 'nx-sede', 'Administrativo', 'Multifuncional laser', { marca: 'HP', modelo: 'LaserJet M428', serie: 'HPM4-55012', compra: [-800, 2890], precoNovo: 3100,
    status: 'conserto', conserto: { oficina: 'TechSupply Comércio', motivo: 'Atolando papel e manchando', desde: _iso(_dia(agora, -12)) } })
  eq('MON-0001', 'monitor', 'nx-campinas', 'Sala 2', 'Monitor 24 polegadas', { marca: 'AOC', modelo: '24B2XH', serie: 'AOC-88123', compra: [-300, 790], precoNovo: 820 })
  eq('NBK-0001', 'nobreak', 'vt-matriz', 'Rack', 'Nobreak 3 kVA do rack', { marca: 'SMS', modelo: 'Sinus Triad', serie: 'SMS3-40021', compra: [-345, 3490], garantiaDias: 20, precoNovo: 3600 })
  eq('CAM-0001', 'camera', 'vt-matriz', 'Entrada', 'Câmera da entrada', { marca: 'Intelbras', modelo: 'VHD 1220', serie: 'IB-12201', compra: [-500, 290], precoNovo: 320 })
  eq('TV-0001', 'tv', 'vt-centro', 'Vitrine', 'TV 50 polegadas da vitrine', { marca: 'Samsung', modelo: 'Crystal UHD', serie: 'SM50-77120', compra: [-260, 2490], precoNovo: 2600 })
  eq('BMB-0001', 'bomba', 'ox-fabrica', 'Casa de máquinas', 'Bomba d’água 2 cv', { marca: 'Schneider', modelo: 'BC-92', serie: 'SCH-2210', compra: [-1300, 2890], precoNovo: 3200,
    custos: [[-150, 690, 'Troca do selo mecânico', 'Energia Total Equipamentos']] })
  eq('NBK-0002', 'nobreak', 'ox-fabrica', 'Sala elétrica', 'Nobreak 10 kVA', { marca: 'APC', modelo: 'Smart-UPS', serie: 'APC10-1188', compra: [-1000, 18900], precoNovo: 21000 })
  eq('RED-0001', 'rede', 'ox-fabrica', 'Rack', 'Switch 24 portas', { marca: 'TP-Link', modelo: 'TL-SG1024', serie: 'TPL-24-5501', compra: [-700, 890], precoNovo: 950 })
  eq('CAM-0002', 'camera', 'ox-deposito', 'Doca', 'Câmera da doca', { marca: 'Intelbras', modelo: 'VHD 3230', serie: 'IB-32301', compra: [-380, 390], precoNovo: 420 })
  eq('EQ-0001', 'outro', 'ox-deposito', 'Expedição', 'Paleteira elétrica', { marca: 'Paletrans', modelo: 'PE 1520', serie: 'PLT-1520-09', compra: [-900, 15900], precoNovo: 17500 })

  const rotuloDo = e => `${e.etiqueta} · ${e.descricao}`
  for (const e of EQ) {
    const u = _un(e.unidadeKey)
    const custos = (e.custos || []).map(([d, valor, descricao, oficina]) => ({ data: _iso(_dia(agora, d)), valor, descricao, oficina }))
    const hist = [{ tipo: 'cadastro', texto: e.etiqueta, autor: P.comprador, em: ts(e.compra[0] + 2, 9, 30) }]
    for (const c of e.custos || []) hist.push({ tipo: 'custo', texto: `${c[2]} · R$ ${c[1].toLocaleString('pt-BR')}`, autor: P.comprador, em: ts(c[0], 16, 10) })
    if (e.status === 'conserto') hist.push({ tipo: 'conserto_saida', texto: `${e.conserto.oficina} · ${e.conserto.motivo}`, autor: P.comprador, em: ts(-12, 11, 5) })
    if (e.status === 'baixado') hist.push({ tipo: 'baixa', texto: e.baixa.motivo, autor: P.gestor, em: ts(-150, 15) })
    docs.push({ col: 'equipamentos', id: e.id, dados: {
      etiqueta: e.etiqueta, tipo: e.tipo, descricao: e.descricao, marca: e.marca || '', modelo: e.modelo || '', serie: e.serie || '',
      empresaId: empresaDe(e.unidadeKey), unidadeId: UN(e.unidadeKey), unidadeNome: u.nome, setor: e.setor, status: e.status || 'uso',
      aquisicao: { data: _iso(_dia(agora, e.compra[0])), valor: e.compra[1], fornecedorNome: e.pedido?.[2] || '',
        ...(e.pedido ? { pedidoId: e.pedido[0], pedidoNum: e.pedido[1] } : {}) },
      ...(e.garantiaDias != null ? { garantiaAte: _iso(_dia(agora, e.garantiaDias)) } : {}),
      precoNovo: e.precoNovo, custos, conserto: e.conserto || null, baixa: e.baixa || null, notas: '',
      criadoEm: hist[0].em, atualizadoEm: hist.at(-1).em,
    }, sub: hist.map(h => ({ col: 'historico', dados: { tipo: h.tipo, texto: h.texto, autorId: h.autor, autorNome: nomeDe[h.autor] || '', criadoEm: h.em } })) })
  }

  // ── Chamados ──
  const rafael = { id: 'demo-prestador', nome: nomeDe['demo-prestador'] || 'Rafael Souza' }
  const marcos = { id: 'demo-ext-marcos', nome: 'Marcos Teixeira' }
  const paulo = { id: 'demo-ext-paulo', nome: 'Paulo Mendes' }
  const presenca = (em, key, dist, via = 'qr') => {
    const u = _un(key)
    return { em, via, lat: u.lat + dist / 111000, lng: u.lng, precisaoM: 9, distanciaM: dist }
  }
  let numero = 0
  const ev = (tipo, autor, em, texto = '') => ({ tipo, autor, em, texto })
  const ch = c => {
    const u = _un(c.un)
    const forn = c.forn
    const hist = c.hist
    const dados = {
      tipo: c.tipo || 'chamado', empresaId: empresaDe(c.un), unidadeId: UN(c.un), unidadeNome: u.nome,
      fornecedorId: forn, fornecedorNome: NOME_FORN[forn], servicoId: c.servicoId || '', titulo: c.titulo, descricao: c.descricao || '',
      urgente: !!c.urgente, status: c.status, criadoEm: hist[0].em, atualizadoEm: hist.at(-1).em, ...c.campos,
    }
    if (dados.tipo === 'chamado') {
      dados.numero = ++numero
      dados.solicitanteId = c.solicitante || P.solicitante
      dados.solicitanteNome = nomeDe[dados.solicitanteId] || ''
      if (c.prazoHoras) dados.prazoEm = Timestamp.fromMillis(hist[0].em.toMillis() + c.prazoHoras * 3600e3)
    }
    if (c.equip) Object.assign(dados, { equipamentoId: c.equip.id, equipamentoRotulo: rotuloDo(c.equip) })
    const sub = [
      ...hist.map(h => ({ col: 'historico', dados: { tipo: h.tipo, texto: h.texto, autorId: h.autor.id || h.autor, autorNome: h.autor.nome || nomeDe[h.autor] || '', criadoEm: h.em } })),
      ...(c.comentarios || []).map(([autor, em, texto]) => ({ col: 'comentarios', dados: { texto, autorId: autor.id || autor, autorNome: autor.nome || nomeDe[autor] || '', criadoEm: em } })),
      ...(c.extras || []).map(x => ({ col: 'extras', dados: x })),
    ]
    docs.push({ col: 'chamados', id: c.id, dados, sub })
  }
  const extra = (descricao, valor, status, criado, decisao = null) => ({
    descricao, valor, status, criadoPor: rafael.id, criadoPorNome: rafael.nome, criadoEm: criado,
    ...(decisao ? { decididoPor: P.gestor, decididoPorNome: nomeDe[P.gestor], decididoEm: decisao, ...(status === 'reprovado' ? { motivo: 'Não aprovado pelo gestor' } : {}) } : {}),
  })
  const sol = P.solicitante, ges = P.gestor

  // 1. Aberto e urgente: a prestadora ainda não agendou
  ch({ id: 'demo-ch-01', un: 'nx-sede', forn: EXPRESS, servicoId: 'demo-s-ar', status: 'aberto', urgente: true, prazoHoras: 24, equip: ar1,
    titulo: 'Ar-condicionado da recepção pingando', descricao: 'Pinga água em cima do balcão desde ontem à tarde. Já desligamos para não molhar os papéis.',
    hist: [ev('aberto', sol, horas(3))] })
  // 2. Agendado para amanhã
  ch({ id: 'demo-ch-02', un: 'vt-matriz', forn: ENERGIA, servicoId: 'demo-s-ele', status: 'agendado', prazoHoras: 8,
    titulo: 'Tomada queimada na sala de reunião', descricao: 'A tomada ao lado da TV escureceu e cheira a queimado. Está isolada com fita.',
    campos: { agendadoPara: ts(1, 9, 30), tecnicoId: marcos.id, tecnicoNome: marcos.nome },
    hist: [ev('aberto', ges, horas(20)), ev('agendado', marcos, horas(18), _dia(agora, 1).toLocaleDateString('pt-BR').slice(0, 5) + ' 09:30')] })
  // 3. Técnico no local, com um extra esperando o gestor
  ch({ id: 'demo-ch-03', un: 'nx-campinas', forn: EXPRESS, servicoId: 'demo-s-ar', status: 'atendimento', prazoHoras: 24, equip: ar4,
    titulo: 'Split da sala 2 não gela', descricao: 'Liga, ventila, mas sai ar quente. A sala fica abafada à tarde.',
    campos: { tecnicoId: rafael.id, tecnicoNome: rafael.nome, agendadoPara: horas(1), chegada: presenca(horas(0.7), 'nx-campinas', 14) },
    hist: [ev('aberto', sol, horas(26)), ev('agendado', rafael, horas(24), new Date(agora.getTime() - 3600e3).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })), ev('chegada', rafael, horas(0.7), 'pela placa')],
    extras: [extra('Troca do capacitor do compressor', 280, 'aguardando', horas(0.4))],
    comentarios: [[rafael, horas(0.5), 'O capacitor está estufado. Pedi o extra para trocar hoje mesmo; tenho a peça no carro.']] })
  // 4. Concluído, esperando quem pediu confirmar
  ch({ id: 'demo-ch-04', un: 'vt-centro', forn: GERAIS, servicoId: 'demo-s-rep', status: 'concluido', prazoHoras: 48,
    titulo: 'Vazamento na pia da copa', descricao: 'O sifão está pingando e o armário embaixo da pia está molhado.',
    campos: { tecnicoId: paulo.id, tecnicoNome: paulo.nome, chegada: presenca(ts(-1, 14, 10), 'vt-centro', 22), saida: presenca(ts(-1, 15, 5), 'vt-centro', 19),
      relatorio: 'Troca do sifão e da vedação da válvula. Testado com a pia cheia: sem vazamento.', pecas: ['Sifão sanfonado', 'Vedação de borracha'] },
    hist: [ev('aberto', sol, ts(-2, 9, 40)), ev('agendado', paulo, ts(-2, 11), '14:00'), ev('chegada', paulo, ts(-1, 14, 10), 'pela placa'), ev('concluido', paulo, ts(-1, 15, 5), 'pela placa')] })
  // 5. Confirmado neste mês, com extra aprovado
  ch({ id: 'demo-ch-05', un: 'ox-fabrica', forn: ENERGIA, servicoId: 'demo-s-ele', status: 'confirmado', prazoHoras: 8,
    titulo: 'Disjuntor geral desarmando', descricao: 'O disjuntor do quadro 2 desarma quando a prensa liga.',
    campos: { tecnicoId: marcos.id, tecnicoNome: marcos.nome, chegada: presenca(ts(-6, 13, 20), 'ox-fabrica', 35), saida: presenca(ts(-6, 16, 40), 'ox-fabrica', 31),
      relatorio: 'Disjuntor subdimensionado para a carga da prensa. Troca por um de 63 A e reaperto do barramento.', pecas: ['Disjuntor tripolar 63 A'],
      confirmadoPor: ges, confirmadoPorNome: nomeDe[ges], confirmadoEm: ts(-5, 9, 15), extrasAprovados: 450 },
    hist: [ev('aberto', P.supremo, ts(-6, 8, 50)), ev('agendado', marcos, ts(-6, 9, 30), '13:00'), ev('chegada', marcos, ts(-6, 13, 20), 'pela placa'),
      ev('concluido', marcos, ts(-6, 16, 40), 'pela placa'), ev('confirmado', ges, ts(-5, 9, 15))],
    extras: [{ ...extra('Disjuntor tripolar 63 A (peça)', 450, 'aprovado', ts(-6, 14, 5), ts(-6, 14, 30)), criadoPor: marcos.id, criadoPorNome: marcos.nome }] })
  // 6. Contestado: o problema voltou
  ch({ id: 'demo-ch-06', un: 'nx-sede', forn: EXPRESS, servicoId: 'demo-s-ar', status: 'contestado', prazoHoras: 24, equip: ar2,
    titulo: 'Ar da diretoria fazendo barulho', descricao: 'Barulho alto de vibração quando liga.',
    campos: { tecnicoId: rafael.id, tecnicoNome: rafael.nome, chegada: presenca(ts(-4, 10, 5), 'nx-sede', 11), saida: presenca(ts(-4, 10, 50), 'nx-sede', 12),
      relatorio: 'Reaperto dos parafusos do suporte da condensadora.', pecas: [],
      contestacao: { motivo: 'O problema continua', texto: 'No dia seguinte o barulho voltou igual.' }, contestacoes: 1, contestadoEm: ts(-3, 9, 20) },
    hist: [ev('aberto', ges, ts(-5, 15, 30)), ev('agendado', rafael, ts(-5, 16), '10:00'), ev('chegada', rafael, ts(-4, 10, 5), 'pela placa'),
      ev('concluido', rafael, ts(-4, 10, 50), 'pela placa'), ev('contestado', ges, ts(-3, 9, 20), 'O problema continua')],
    comentarios: [[ges, ts(-3, 9, 22), 'Rafael, o barulho voltou na manhã seguinte. Consegue vir esta semana?'], [rafael, ts(-3, 11, 40), 'Consigo sim. Vou levar a borracha antivibração nova.']] })
  // 7. Confirmado no mês passado, com extra aprovado e o custo no aparelho
  ch({ id: 'demo-ch-07', un: 'nx-sede', forn: EXPRESS, servicoId: 'demo-s-ar', status: 'confirmado', prazoHoras: 24, equip: ar2,
    titulo: 'Ar da diretoria desligando sozinho', descricao: 'Desliga depois de uns 20 minutos ligado.',
    campos: { tecnicoId: rafael.id, tecnicoNome: rafael.nome, chegada: presenca(ts(-27, 9, 40), 'nx-sede', 9), saida: presenca(ts(-27, 11, 15), 'nx-sede', 10),
      relatorio: 'Placa eletrônica com o relé danificado. Troca da placa e teste por 40 minutos.', pecas: ['Placa eletrônica da evaporadora'],
      confirmadoPor: sol, confirmadoPorNome: nomeDe[sol], confirmadoEm: ts(-26, 10, 5), extrasAprovados: 320 },
    hist: [ev('aberto', sol, ts(-28, 14)), ev('agendado', rafael, ts(-28, 15), '09:30'), ev('chegada', rafael, ts(-27, 9, 40), 'pela placa'),
      ev('concluido', rafael, ts(-27, 11, 15), 'pela placa'), ev('confirmado', sol, ts(-26, 10, 5))],
    extras: [extra('Placa eletrônica da evaporadora', 320, 'aprovado', ts(-27, 10), ts(-27, 10, 20)), extra('Higienização completa do aparelho', 180, 'reprovado', ts(-27, 10, 5), ts(-27, 10, 25))] })
  // 8. Cancelado
  ch({ id: 'demo-ch-08', un: 'vt-matriz', forn: GERAIS, servicoId: 'demo-s-rep', status: 'cancelado', prazoHoras: 48,
    titulo: 'Porta do banheiro sem trinco', campos: { cancelamento: { motivo: 'A equipe da loja trocou o trinco', porNome: nomeDe[ges] } },
    hist: [ev('aberto', ges, ts(-9, 10)), ev('cancelado', ges, ts(-8, 16), 'A equipe da loja trocou o trinco')] })

  // Visitas periódicas (o ID é o que o app gera: js/servicos-regras.js)
  const S = servicosDaDemo(agora)
  const visita = (forn, serv, key, k, status, campos = {}, histExtra = []) => {
    const s = S[forn].find(x => x.id === serv)
    const inicio = new Date(`${s.inicio}T12:00:00`)
    const prev = new Date(inicio); prev.setDate(prev.getDate() + k * s.frequenciaDias)
    const fim = new Date(prev); fim.setDate(fim.getDate() + s.frequenciaDias - 1); fim.setHours(23, 59, 59, 999)
    const previstaPara = _iso(prev)
    const dPrev = Math.round((prev - _dia(agora, 0)) / 864e5)
    ch({ id: `demo-vp-${forn}-${serv}-${UN(key)}-${previstaPara}`, tipo: 'visita', un: key, forn, servicoId: serv, status, titulo: s.nome,
      campos: { previstaPara, janelaAte: Timestamp.fromDate(fim), ...campos },
      hist: [ev('prevista', P.gestor, ts(dPrev, 7)), ...histExtra] })
  }
  const feita = (key, d, dist, quem = rafael, confirmou = sol) => ({
    campos: { tecnicoId: quem.id, tecnicoNome: quem.nome, chegada: presenca(ts(d, 9, 10), key, dist), saida: presenca(ts(d, 11, 0), key, dist + 2),
      relatorio: 'Limpeza dos filtros e da serpentina, medição de pressão e teste de funcionamento. Tudo em ordem.', pecas: [],
      confirmadoPor: confirmou, confirmadoPorNome: nomeDe[confirmou], confirmadoEm: ts(d + 1, 9), extrasAprovados: 0 },
    hist: [ev('chegada', quem, ts(d, 9, 10), 'pela placa'), ev('concluido', quem, ts(d, 11, 0), 'pela placa'), ev('confirmado', confirmou, ts(d + 1, 9))],
  })
  const v1 = feita('nx-sede', -73, 8), v2 = feita('vt-matriz', -70, 16, rafael, ges), v3 = feita('nx-sede', -43, 10), v4 = feita('nx-sede', -13, 7)
  visita(EXPRESS, 'demo-s-prev', 'nx-sede', 0, 'confirmado', v1.campos, v1.hist)
  visita(EXPRESS, 'demo-s-prev', 'vt-matriz', 0, 'confirmado', v2.campos, v2.hist)
  visita(EXPRESS, 'demo-s-prev', 'nx-sede', 1, 'confirmado', v3.campos, v3.hist)
  visita(EXPRESS, 'demo-s-prev', 'vt-matriz', 1, 'nao_realizada', {}, [ev('nao_realizada', P.gestor, ts(-15, 7))])
  visita(EXPRESS, 'demo-s-prev', 'nx-sede', 2, 'confirmado', v4.campos, v4.hist)
  visita(EXPRESS, 'demo-s-prev', 'vt-matriz', 2, 'agendado', { agendadoPara: ts(2, 14), tecnicoId: rafael.id, tecnicoNome: rafael.nome },
    [ev('agendado', rafael, ts(-3, 17), _dia(agora, 2).toLocaleDateString('pt-BR').slice(0, 5) + ' 14:00')])
  const v5 = feita('ox-fabrica', -98, 28, marcos, ges)
  visita(ENERGIA, 'demo-s-nbk', 'ox-fabrica', 0, 'confirmado', { ...v5.campos, relatorio: 'Teste de autonomia dos nobreaks, troca de duas baterias e partida do gerador. Em ordem.' }, v5.hist)
  visita(ENERGIA, 'demo-s-nbk', 'ox-fabrica', 1, 'prevista')

  // ── Contagem anterior na sede da Nexara ──
  docs.push({ col: 'contagens', id: 'demo-ct-01', dados: {
    empresaId: empresaDe('nx-sede'), unidadeId: UN('nx-sede'), unidadeNome: _un('nx-sede').nome, porId: P.comprador, porNome: nomeDe[P.comprador], em: ts(-20, 16, 30),
    encontrados: ['AC-0001', 'AC-0002', 'AC-0003', 'NB-0001', 'NB-0002', 'IMP-0001'], faltando: ['PC-0001'], foraDoLugar: [], total: 7,
  } })

  const contadores = { chamados: numero }
  for (const e of EQ) {
    const [pre, n] = e.etiqueta.split('-')
    contadores[`equip_${pre}`] = Math.max(contadores[`equip_${pre}`] || 0, Number(n))
  }
  return { docs, contadores }
}
