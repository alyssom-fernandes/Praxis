// Testes das funções puras do app e das Functions (sem emulador).
//
//   npm run testar-unidade

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCurrency, formatDate, gerarIniciais, normalizarTexto, parseMoeda, esc, formatCNPJ,
  formatFileSize, pluralizar, calcularSLA, maisXDiasISO, hojeISO, dataEhPassado, dataEhProximos,
  agruparPor, ordenarPor, validarEmail, validarNumeroPositivo,
} from '../js/utils.js'
import { TRADUCOES, tomDaCor, corCategoria, TONS_CATEGORIA } from '../js/constants.js'
import acessoDemo from '../functions/src/demo-acesso.js'

// O Intl separa "R$" do número com um espaço não separável
const semNbsp = s => s.replace(/ /g, ' ')

// ── Formatação ─────────────────────────────────────────────────
test('moeda em reais, com traço quando não há valor', () => {
  assert.equal(semNbsp(formatCurrency(1234.5)), 'R$ 1.234,50')
  assert.equal(semNbsp(formatCurrency(0)), 'R$ 0,00')
  assert.equal(formatCurrency(null), '—')
  assert.equal(formatCurrency('abc'), '—')
})

test('parseMoeda lê o que a pessoa digita', () => {
  assert.equal(parseMoeda('R$ 1.234,56'), 1234.56)
  assert.equal(parseMoeda('10'), 10)
  assert.equal(parseMoeda(''), 0)
  assert.equal(parseMoeda('abc'), 0)
})

test('data aaaa-mm-dd vira dd/mm/aaaa; qualquer outra coisa volta escapada', () => {
  assert.equal(formatDate('2026-10-19'), '19/10/2026')
  assert.equal(formatDate(''), '—')
  assert.equal(formatDate('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;')
})

test('esc escapa os cinco caracteres do HTML e aceita vazio', () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  assert.equal(esc(null), '')
  assert.equal(esc(undefined), '')
  assert.equal(esc(42), '42')
})

test('iniciais só com letras e números', () => {
  assert.equal(gerarIniciais('ana maria souza'), 'AS')
  assert.equal(gerarIniciais('Beatriz'), 'B')
  assert.equal(gerarIniciais('<script>'), 'S')
  assert.equal(gerarIniciais(''), '?')
  assert.equal(gerarIniciais(null), '?')
})

test('normalizarTexto ignora acento, caixa e espaços nas pontas', () => {
  assert.equal(normalizarTexto('  Manutenção '), 'manutencao')
  assert.equal(normalizarTexto('ÁGUA'), normalizarTexto('agua'))
})

test('CNPJ, tamanho de arquivo e plural', () => {
  assert.equal(formatCNPJ('11222333000181'), '11.222.333/0001-81')
  assert.equal(formatCNPJ('123'), '123')
  assert.equal(formatFileSize(512), '512 B')
  assert.equal(formatFileSize(2048), '2.0 KB')
  assert.equal(formatFileSize(3 * 1048576), '3.0 MB')
  assert.equal(pluralizar(1, 'pedido', 'pedidos'), '1 pedido')
  assert.equal(pluralizar(2, 'pedido', 'pedidos'), '2 pedidos')
})

// ── Datas e prazos ─────────────────────────────────────────────
test('prazo (SLA) a partir da data necessária', () => {
  assert.equal(calcularSLA(null), null)
  assert.equal(calcularSLA(hojeISO()).label, 'Vence hoje')
  assert.equal(calcularSLA(maisXDiasISO(2)).classe, 'sla-warn')
  assert.equal(calcularSLA(maisXDiasISO(10)).classe, 'sla-ok')
  const atrasado = calcularSLA(maisXDiasISO(-3))
  assert.equal(atrasado.classe, 'sla-danger')
  assert.match(atrasado.label, /^Atrasado 3 dias$/)
})

test('passado e próximos dias', () => {
  assert.equal(dataEhPassado(maisXDiasISO(-1)), true)
  assert.equal(dataEhPassado(hojeISO()), false)
  assert.equal(dataEhProximos(maisXDiasISO(2), 3), true)
  assert.equal(dataEhProximos(maisXDiasISO(5), 3), false)
})

// ── Listas e validação ─────────────────────────────────────────
test('agrupar e ordenar sem mudar a lista original', () => {
  const lista = [{ s: 'b', n: 2 }, { s: 'a', n: 1 }, { s: 'b', n: 3 }]
  assert.deepEqual(Object.keys(agruparPor(lista, 's')).sort(), ['a', 'b'])
  assert.equal(agruparPor(lista, 's').b.length, 2)
  assert.deepEqual(ordenarPor(lista, 'n').map(x => x.n), [1, 2, 3])
  assert.deepEqual(ordenarPor(lista, 'n', true).map(x => x.n), [3, 2, 1])
  assert.deepEqual(lista.map(x => x.n), [2, 1, 3])
})

test('validação de e-mail e de valor', () => {
  assert.equal(validarEmail('pessoa@exemplo.com'), true)
  assert.equal(validarEmail('sem-arroba'), false)
  assert.equal(validarNumeroPositivo('R$ 10,00'), true)
  assert.equal(validarNumeroPositivo(0), false)
})

// ── Cores das categorias ───────────────────────────────────────
test('cada cor vira o tom mais próximo da paleta', () => {
  assert.equal(tomDaCor(TONS_CATEGORIA.ocre), 'ocre')
  assert.equal(tomDaCor('#777777'), 'argila')
  assert.equal(tomDaCor('#ff0000'), 'vinho')
  assert.equal(tomDaCor('não é cor'), null)
  assert.equal(corCategoria('não é cor'), TONS_CATEGORIA.argila)
})

// ── Textos em português e inglês ───────────────────────────────
test('toda chave de texto existe nos dois idiomas', () => {
  const pt = Object.keys(TRADUCOES.pt)
  const en = Object.keys(TRADUCOES.en)
  assert.deepEqual(pt.filter(k => !en.includes(k)), [], 'faltam em inglês')
  assert.deepEqual(en.filter(k => !pt.includes(k)), [], 'faltam em português')
})

// ── Renovação da demo pelo servidor (functions/src/demo-acesso.js) ──
test('só a conta demo e o supremo pedem a renovação da demo', () => {
  const { podeRenovarDemo } = acessoDemo
  assert.equal(podeRenovarDemo({ email: 'demo@praxis.app' }), true)
  assert.equal(podeRenovarDemo({ perfil: 'supremo' }), true)
  assert.equal(podeRenovarDemo({ perfil: 'gestor', email: 'gestor@exemplo.com' }), false)
  assert.equal(podeRenovarDemo({}), false)
  assert.equal(podeRenovarDemo(null), false)
})

test('a demo renova no máximo uma vez por dia e uma de cada vez', () => {
  const { situacaoRenovacao, hojeSP } = acessoDemo
  const agora = new Date('2026-10-19T15:00:00Z')
  assert.equal(hojeSP(agora), '2026-10-19')
  // 23h30 em Brasília ainda é dia 19, embora em UTC já seja dia 20
  assert.equal(hojeSP(new Date('2026-10-20T02:30:00Z')), '2026-10-19')
  assert.equal(situacaoRenovacao({ dia: '2026-10-19' }, agora), 'em-dia')
  assert.equal(situacaoRenovacao({ dia: '2026-10-18', travadoAte: agora.getTime() + 1000 }, agora), 'ocupado')
  assert.equal(situacaoRenovacao({ dia: '2026-10-18', travadoAte: agora.getTime() - 1000 }, agora), 'livre')
  assert.equal(situacaoRenovacao(undefined, agora), 'livre')
})
