// Testes das regras puras dos módulos Serviços e Equipamentos, do acesso por
// módulo e do gerador de QR (sem emulador).
//
//   npm run testar-unidade

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  papelCompras, papelServicos, papelEquip, modulosDe, telaInicial, moduloDaTela, administra, cuidaDasUnidades,
  adminDaPrestadora, ePrestador,
} from '../js/modulos.js'
import {
  ST, posicaoNaRegua, categoriaCh, acoesDoChamado, comVoce, prazoDoChamado, situacaoDoPrazo, distanciaM,
  visitasDevidas, idDaVisita, resumoDoMes, painelDaPrestadora, numeroDoChamado,
} from '../js/servicos-regras.js'
import {
  prefixoDoTipo, etiquetaDe, avaliacaoTroca, situacaoGarantia, idadeDe, precisaAtencao, conferirContagem,
} from '../js/equip-regras.js'
import { matrizQR, correcaoRS, bitsDoFormato, bitsDaVersao, codewordsDeDados } from '../js/qr.js'

// ── Acesso por módulo ──────────────────────────────────────────────
test('papel de cada módulo: compras pelo perfil, serviços e equipamentos pelos campos próprios', () => {
  const sol = { perfil: 'solicitante', servicos: 'gestor', equipamentos: 'consulta' }
  assert.equal(papelCompras(sol), 'solicitante')
  assert.equal(papelServicos(sol), 'gestor')
  assert.equal(papelEquip(sol), 'consulta')
  assert.deepEqual(modulosDe(sol), ['compras', 'servicos', 'equipamentos'])
  // Sem Compras
  const so = { perfil: 'nenhum', equipamentos: 'responsavel' }
  assert.equal(papelCompras(so), null)
  assert.deepEqual(modulosDe(so), ['equipamentos'])
  assert.equal(telaInicial(so), 'equipamentos')
  // Papel inválido não vale
  assert.equal(papelServicos({ perfil: 'gestor', servicos: 'dono' }), null)
  // Inativo não tem nada
  assert.deepEqual(modulosDe({ perfil: 'gestor', ativo: false, servicos: 'gestor' }), [])
})

test('supremo tem todos os módulos; prestador só Serviços, e só com a prestadora', () => {
  assert.deepEqual(modulosDe({ perfil: 'supremo' }), ['compras', 'servicos', 'equipamentos'])
  assert.equal(papelServicos({ perfil: 'supremo' }), 'gestor')
  const tec = { perfil: 'prestador', fornecedorId: 'f1', equipamentos: 'gestor', servicos: 'gestor' }
  assert.equal(papelServicos(tec), 'prestador')
  assert.equal(papelEquip(tec), null)
  assert.equal(papelCompras(tec), null)
  assert.deepEqual(modulosDe(tec), ['servicos'])
  assert.equal(telaInicial(tec), 'servicos')
  assert.equal(papelServicos({ perfil: 'prestador' }), null, 'prestador sem prestadora não entra')
  assert.ok(ePrestador(tec))
  assert.ok(!adminDaPrestadora(tec))
  assert.ok(adminDaPrestadora({ ...tec, prestadorAdmin: true }))
})

test('telas por módulo e quem cuida dos cadastros', () => {
  assert.equal(moduloDaTela('pedidos'), 'compras')
  assert.equal(moduloDaTela('chamado'), 'servicos')
  assert.equal(moduloDaTela('equipamento'), 'equipamentos')
  assert.equal(moduloDaTela('config-usuarios'), null)
  assert.ok(administra({ perfil: 'gestor' }))
  assert.ok(!administra({ perfil: 'nenhum', servicos: 'gestor' }))
  assert.ok(cuidaDasUnidades({ perfil: 'nenhum', servicos: 'gestor' }))
  assert.ok(cuidaDasUnidades({ perfil: 'nenhum', equipamentos: 'gestor' }))
  assert.ok(!cuidaDasUnidades({ perfil: 'solicitante', servicos: 'solicitante' }))
})

// ── Serviços ───────────────────────────────────────────────────────
const usr = (id, extra = {}) => ({ id, ...extra })

test('régua e categoria do chamado', () => {
  assert.equal(posicaoNaRegua(ST.ABERTO), 0)
  assert.equal(posicaoNaRegua(ST.PREVISTA), 0)
  assert.equal(posicaoNaRegua(ST.ATENDIMENTO), 2)
  assert.equal(posicaoNaRegua(ST.CONFIRMADO), 4)
  assert.equal(posicaoNaRegua(ST.CONTESTADO), 1)
  assert.equal(categoriaCh(ST.CONFIRMADO), 'concluido')
  assert.equal(categoriaCh(ST.NAO_REALIZADA), 'encerrado')
  assert.equal(categoriaCh(ST.AGENDADO), 'andamento')
})

test('ações: o prestador só nos chamados da prestadora dele; quem pediu confirma', () => {
  const ch = { status: ST.ABERTO, fornecedorId: 'f1', solicitanteId: 'u1', tipo: 'chamado' }
  const tec = usr('t1', { fornecedorId: 'f1' })
  assert.deepEqual(acoesDoChamado(ch, tec, 'prestador'), ['agendar'])
  assert.deepEqual(acoesDoChamado(ch, usr('t2', { fornecedorId: 'f2' }), 'prestador'), [])
  assert.deepEqual(acoesDoChamado({ ...ch, status: ST.ATENDIMENTO }, tec, 'prestador'), ['fotos', 'extra', 'concluir'])
  assert.deepEqual(acoesDoChamado({ ...ch, status: ST.CONCLUIDO }, usr('u1'), 'solicitante'), ['confirmar', 'contestar'])
  assert.deepEqual(acoesDoChamado({ ...ch, status: ST.CONCLUIDO }, usr('u9'), 'solicitante'), [])
  assert.deepEqual(acoesDoChamado({ ...ch, status: ST.CONCLUIDO }, usr('g'), 'gestor'), ['confirmar', 'contestar'])
  assert.ok(acoesDoChamado(ch, usr('u1'), 'solicitante').includes('cancelar'))
  assert.ok(!acoesDoChamado({ ...ch, tipo: 'visita' }, usr('u1'), 'solicitante').includes('cancelar'))
  assert.ok(comVoce(ch, tec, 'prestador'))
  assert.ok(!comVoce(ch, usr('u1'), 'solicitante'))
})

test('prazo de atendimento: cumprido na chegada, atrasado sem ela', () => {
  const criado = Date.parse('2026-11-27T09:00:00Z')
  const prazo = prazoDoChamado(criado, 24)
  assert.equal(prazo, Date.parse('2026-11-28T09:00:00Z'))
  assert.equal(prazoDoChamado(criado, 0), null)
  const ch = { status: ST.AGENDADO, prazoMs: prazo }
  assert.equal(situacaoDoPrazo(ch, Date.parse('2026-11-28T08:00:00Z')).atrasado, false)
  assert.equal(situacaoDoPrazo(ch, Date.parse('2026-11-28T10:00:00Z')).atrasado, true)
  const chegou = { ...ch, status: ST.ATENDIMENTO, chegadaMs: Date.parse('2026-11-28T08:30:00Z') }
  assert.deepEqual(situacaoDoPrazo(chegou, Date.parse('2026-11-30T00:00:00Z')), { atrasado: false, restaMs: 1800000, cumprido: true })
  assert.equal(situacaoDoPrazo({ ...ch, status: ST.CONFIRMADO }, Date.now()), null)
})

test('distância pelo haversine', () => {
  assert.equal(distanciaM(-23.5505, -46.6333, -23.5505, -46.6333), 0)
  const d = distanciaM(-23.5505, -46.6333, -23.5515, -46.6333)   // 0,001° de latitude ≈ 111 m
  assert.ok(d >= 110 && d <= 112, String(d))
  assert.equal(distanciaM(null, 1, 2, 3), null)
})

test('visitas periódicas: período atual e os dois anteriores, ID fixo, vencidas marcadas', () => {
  const forn = { id: 'f1' }
  const serv = { id: 's1', tipo: 'periodico', frequenciaDias: 30, inicio: '2026-09-01', unidades: ['u1', 'u2'] }
  const v = visitasDevidas(forn, serv, '2026-11-27')
  // Períodos: 01/09, 01/10, 31/10 (30 dias cada) e hoje cai no terceiro
  assert.deepEqual([...new Set(v.map(x => x.previstaPara))], ['2026-09-01', '2026-10-01', '2026-10-31'])
  assert.equal(v.length, 6)
  assert.equal(v[0].id, idDaVisita('f1', 's1', 'u1', '2026-09-01'))
  assert.deepEqual(v.map(x => x.vencida), [true, true, true, true, false, false])
  assert.deepEqual(visitasDevidas(forn, { ...serv, tipo: 'chamado' }, '2026-11-27'), [])
  assert.deepEqual(visitasDevidas(forn, serv, '2026-08-01'), [], 'antes do início, nada')
})

test('conferência do mês e painel da prestadora', () => {
  const ms = iso => Date.parse(iso)
  const chamados = [
    { tipo: 'chamado', status: ST.CONFIRMADO, confirmadoMs: ms('2026-11-10T10:00:00Z'), criadoMs: ms('2026-11-09T10:00:00Z'), prazoMs: ms('2026-11-10T10:00:00Z'), chegadaMs: ms('2026-11-09T15:00:00Z') },
    { tipo: 'visita', status: ST.CONFIRMADO, confirmadoMs: ms('2026-11-05T10:00:00Z'), previstaMs: ms('2026-11-01T00:00:00Z') },
    { tipo: 'visita', status: ST.NAO_REALIZADA, previstaPara: '2026-11-01', previstaMs: ms('2026-11-01T00:00:00Z') },
    { tipo: 'chamado', status: ST.CONTESTADO, contestadoMs: ms('2026-11-20T10:00:00Z'), criadoMs: ms('2026-11-19T10:00:00Z'), contestacoes: 1, prazoMs: ms('2026-11-20T10:00:00Z'), chegadaMs: ms('2026-11-21T10:00:00Z') },
    { tipo: 'chamado', status: ST.CONFIRMADO, confirmadoMs: ms('2026-10-30T10:00:00Z'), criadoMs: ms('2026-10-29T10:00:00Z') },
  ]
  const extras = [
    { status: 'aprovado', valor: 380, decididoMs: ms('2026-11-10T09:00:00Z'), criadoMs: ms('2026-11-10T08:00:00Z') },
    { status: 'reprovado', valor: 650, decididoMs: ms('2026-11-15T09:00:00Z'), criadoMs: ms('2026-11-15T08:00:00Z') },
  ]
  const r = resumoDoMes(chamados, extras, '2026-11')
  assert.equal(r.confirmados.length, 1)
  assert.equal(r.visitasFeitas.length, 1)
  assert.equal(r.naoRealizadas.length, 1)
  assert.equal(r.contestados.length, 1)
  assert.equal(r.totalExtras, 380)
  assert.equal(r.extrasRecusados.length, 1)
  const p = painelDaPrestadora(chamados, extras, ms('2026-11-27T00:00:00Z'))
  assert.equal(p.chamados, 3)
  assert.equal(p.comPrazo, 2)
  assert.equal(p.noPrazo, 1)
  assert.equal(p.visitas, 2)
  assert.equal(p.visitasFeitas, 1)
  assert.equal(p.contestados, 1)
  assert.equal(p.extrasAprovados, 380)
  assert.equal(p.extrasPedidos, 1030)
  assert.equal(numeroDoChamado(42), 'CH-0042')
})

// ── Equipamentos ───────────────────────────────────────────────────
test('etiqueta, garantia e idade', () => {
  assert.equal(prefixoDoTipo('ar_condicionado'), 'AC')
  assert.equal(prefixoDoTipo('qualquer'), 'EQ')
  assert.equal(etiquetaDe('AC', 123), 'AC-0123')
  assert.deepEqual(situacaoGarantia('2026-12-07', '2026-11-27'), { dias: 10, vencida: false, perto: true })
  assert.equal(situacaoGarantia('2026-11-20', '2026-11-27').vencida, true)
  assert.equal(situacaoGarantia(null), null)
  assert.deepEqual(idadeDe('2022-03-14', '2026-11-27'), { anos: 4, meses: 8, total: 56 })
  assert.deepEqual(idadeDe('2026-11-28', '2026-11-27'), { anos: 0, meses: 0, total: 0 })
})

test('aviso de troca: pela soma contra o preço de um novo ou pelas vezes no ano', () => {
  const eq = { precoNovo: 3000, status: 'uso', custos: [
    { data: '2026-11-27', valor: 380 }, { data: '2026-09-16', valor: 650 }, { data: '2026-05-02', valor: 980 }, { data: '2026-01-11', valor: 300 },
  ] }
  const a = avaliacaoTroca(eq, { pct: 60, qtdAno: 3 }, '2026-11-27')
  assert.equal(a.soma, 2310)
  assert.equal(a.pct, 77)
  assert.equal(a.noAno, 4)
  assert.ok(a.trocar && a.porValor && a.porVezes)
  assert.equal(avaliacaoTroca({ ...eq, custos: eq.custos.slice(0, 1) }, undefined, '2026-11-27').trocar, false)
  assert.equal(avaliacaoTroca({ ...eq, status: 'baixado' }, undefined, '2026-11-27').trocar, false)
  assert.equal(avaliacaoTroca({ custos: [] }).pct, null, 'sem preço de referência, sem porcentagem')
  assert.deepEqual(precisaAtencao({ ...eq, status: 'conserto', conserto: { desde: '2026-11-10' }, garantiaAte: '2026-12-01' }, undefined, '2026-11-27'), ['troca', 'parado', 'garantia'])
})

test('contagem: encontrados, faltando e fora do lugar', () => {
  const esperados = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(conferirContagem(esperados, ['a', 'c', 'x', 'z'], { x: {} }), { encontrados: ['a', 'c'], faltando: ['b'], foraDoLugar: ['x'] })
})

// ── QR ─────────────────────────────────────────────────────────────
// Correção de erros do exemplo clássico "HELLO WORLD" 1-M (alfanumérico)
test('QR: Reed-Solomon bate com o exemplo da norma', () => {
  const dados = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]
  assert.deepEqual(correcaoRS(dados, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23])
})
test('QR: códigos BCH do formato e da versão (tabelas da norma)', () => {
  assert.equal(bitsDoFormato('L', 0).toString(2).padStart(15, '0'), '111011111000100')
  assert.equal(bitsDoFormato('M', 0).toString(2).padStart(15, '0'), '101010000010010')
  assert.equal(bitsDoFormato('Q', 0).toString(2).padStart(15, '0'), '011010101011111')
  assert.equal(bitsDoFormato('H', 0).toString(2).padStart(15, '0'), '001011010001001')
  assert.equal(bitsDaVersao(7).toString(2).padStart(18, '0'), '000111110010010100')
  assert.equal(bitsDaVersao(10).toString(2).padStart(18, '0'), '001010010011010011')
})

// Leitor independente, só para o teste: refaz o mapa das áreas fixas pela
// norma, lê o formato, desfaz a máscara, lê os codewords em zigue-zague,
// separa os blocos, confere a correção de erros (síndromes zero) e decodifica
const _EXP = new Array(512), _LOG = new Array(256)
{ let x = 1; for (let i = 0; i < 255; i++) { _EXP[i] = x; _LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D } for (let i = 255; i < 512; i++) _EXP[i] = _EXP[i - 255] }
const _mul = (a, b) => (a && b ? _EXP[_LOG[a] + _LOG[b]] : 0)
const _BLOCOS = { 1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44] }
function lerQR(m) {
  const tam = m.length, v = (tam - 17) / 4
  const fixo = Array.from({ length: tam }, () => new Array(tam).fill(false))
  const marca = (y, x) => { if (y >= 0 && x >= 0 && y < tam && x < tam) fixo[y][x] = true }
  // Localizador com a borda clara (8×8) e a faixa do formato ao lado: 9×9 no
  // canto de cima à esquerda; 9 linhas × 8 colunas à direita; 8 × 9 embaixo
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) marca(y, x)
  for (let y = 0; y <= 8; y++) for (let x = tam - 8; x < tam; x++) marca(y, x)
  for (let y = tam - 8; y < tam; y++) for (let x = 0; x <= 8; x++) marca(y, x)
  for (let i = 0; i < tam; i++) { marca(6, i); marca(i, 6) }
  for (let i = 0; i < 9; i++) { marca(8, i); marca(i, 8) }
  for (let i = 0; i < 8; i++) { marca(8, tam - 1 - i); marca(tam - 1 - i, 8) }
  if (v >= 2) {
    const ult = 4 * v + 10, pos = v >= 7 ? [6, (6 + ult) / 2, ult] : [6, ult]
    for (const y of pos) for (const x of pos) {
      if ((y === 6 && x === 6) || (y === 6 && x === ult) || (y === ult && x === 6)) continue
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) marca(y + dy, x + dx)
    }
  }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { marca(i, tam - 11 + j); marca(tam - 11 + j, i) }
  // Formato (primeira cópia): bits 0–5 na coluna 8, linhas 0–5
  const pos = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]]
  let f = 0
  pos.forEach(([y, x], i) => { if (m[y][x]) f |= 1 << i })
  f ^= 0x5412
  const nivel = f >>> 13, mascara = (f >>> 10) & 7
  assert.equal(nivel, 0, 'nível M')
  const MK = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0]
  const bits = []
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5
    for (let k = 0; k < tam; k++) for (let j = 0; j < 2; j++) {
      const x = dir - j, y = ((dir + 1) & 2) === 0 ? tam - 1 - k : k
      if (!fixo[y][x]) bits.push(m[y][x] !== MK[mascara](x, y) ? 1 : 0)
    }
  }
  const cw = []
  for (let i = 0; i + 8 <= bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  const [ecc, n1, d1, n2, d2] = _BLOCOS[v], nb = n1 + n2
  const blocos = Array.from({ length: nb }, (_, i) => ({ d: [], e: [], tam: i < n1 ? d1 : d2 }))
  let k = 0
  for (let i = 0; i < Math.max(d1, d2); i++) for (const b of blocos) if (i < b.tam) b.d.push(cw[k++])
  for (let i = 0; i < ecc; i++) for (const b of blocos) b.e.push(cw[k++])
  for (const b of blocos) {
    const poly = [...b.d, ...b.e]
    for (let i = 0; i < ecc; i++) {
      let s = 0
      for (const c of poly) s = _mul(s, _EXP[i]) ^ c
      assert.equal(s, 0, `síndrome ${i} diferente de zero`)
    }
  }
  const dados = blocos.flatMap(b => b.d)
  const db = dados.flatMap(c => [...c.toString(2).padStart(8, '0')].map(Number))
  const le = (i, n) => parseInt(db.slice(i, i + n).join(''), 2)
  assert.equal(le(0, 4), 4, 'modo byte')
  const nc = v <= 9 ? 8 : 16, n = le(4, nc)
  const bytes = Array.from({ length: n }, (_, i) => le(4 + nc + i * 8, 8))
  return { texto: new TextDecoder().decode(new Uint8Array(bytes)), versao: v, mascara }
}

test('QR: o leitor independente lê o que o gerador escreveu, em várias versões e máscaras', () => {
  const casos = [
    'AC-0123',
    'https://praxis-af618.web.app/?tela=equipamento&id=3kq9ZfL0cA7xYb2PqR1s',
    'https://praxis-af618.web.app/?tela=qr&u=Kd83hfGq0sLp2xZ9aB1c&c=7f3a9c1e5b2d4f60a8',
    'Manutenção — São Paulo · ar-condicionado',
    'x'.repeat(150),
    'y'.repeat(200),
  ]
  const versoes = new Set()
  for (const texto of casos) {
    const { matriz, versao } = matrizQR(texto)
    versoes.add(versao)
    const r = lerQR(matriz)
    assert.equal(r.texto, texto)
    assert.equal(r.versao, versao)
  }
  assert.ok([...versoes].some(v => v >= 7), 'cobre a área da versão (7 ou mais)')
  for (let k = 0; k < 8; k++) assert.equal(lerQR(matrizQR('PRAXIS-AC-0123', { mascara: k }).matriz).texto, 'PRAXIS-AC-0123')
  assert.throws(() => codewordsDeDados('z'.repeat(300), 10))
  assert.throws(() => matrizQR('z'.repeat(214)))
})
