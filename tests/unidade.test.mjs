// Testes das funções puras do app e das Functions (sem emulador).
//
//   npm run testar-unidade

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatCurrency, formatDate, gerarIniciais, normalizarTexto, parseMoeda, esc, formatCNPJ,
  formatFileSize, pluralizar, calcularSLA, maisXDiasISO, hojeISO, dataEhPassado, dataEhProximos,
  agruparPor, ordenarPor, validarEmail, validarNumeroPositivo,
  dividirEmParcelas, vencimentosMensais, arquivoIndisponivel, impedimentoDeFuncao,
  empresasDoUsuario, textoPrazo, dataAbsoluta, dataEHora, dataComRelativo, formatarDataRelativa,
  mensagemDeErro,
} from '../js/utils.js'
import {
  tomDaCor, corCategoria, TONS_CATEGORIA,
  t, STATUS_LABEL, PERFIS_LABEL, rotuloMotivo, rotuloNota, rotuloUrgencia,
} from '../js/constants.js'
import {
  MAX_LINHAS, MAX_NOME, lerCSV, decodificarArquivo, classificarFornecedores, contarSituacoes,
} from '../js/fornecedores-csv.js'
import acessoDemo from '../functions/src/demo-acesso.js'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

// O Intl separa "R$" do número com um espaço não separável
const semNbsp = s => s.replace(/\u00a0/g, ' ')

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

test('separação de funções: quem abriu ou cotou não decide; quem aprovou não compra nem paga', () => {
  const ped = { solicitanteId: 'u-sol', compradorId: 'u-ges', aprovadoPor: 'u-ges2' }
  const gestor = id => ({ id, perfil: 'gestor' })
  assert.equal(impedimentoDeFuncao(ped, gestor('u-sol'), 'decidir'), 'abriu')
  assert.equal(impedimentoDeFuncao(ped, gestor('u-ges'), 'decidir'), 'cotou')
  assert.equal(impedimentoDeFuncao(ped, gestor('u-ges2'), 'decidir'), null)
  assert.equal(impedimentoDeFuncao(ped, gestor('u-ges2'), 'comprar'), 'aprovou')
  assert.equal(impedimentoDeFuncao(ped, gestor('u-ges2'), 'pagar'), 'aprovou')
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-fin', perfil: 'financeiro' }, 'pagar'), null)
  // O comprador que cotou registra a compra; o supremo segue as mesmas travas
  assert.equal(impedimentoDeFuncao(ped, gestor('u-ges'), 'comprar'), null)
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-ges', perfil: 'supremo' }, 'decidir'), 'cotou')
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-ges2', perfil: 'supremo' }, 'pagar'), 'aprovou')
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-sup', perfil: 'supremo' }, 'decidir'), null)
  // Pedido ainda sem aprovação, comprador ou pessoa: nada a impedir
  assert.equal(impedimentoDeFuncao({ solicitanteId: 'u-sol', aprovadoPor: null }, gestor('u-x'), 'pagar'), null)
  assert.equal(impedimentoDeFuncao(ped, null, 'decidir'), null)
})

test('o Storage fora do plano vira aviso; erro de permissão, não', () => {
  // No plano gratuito do Firebase, o envio volta 402 com este código
  assert.equal(arquivoIndisponivel({ code: 'storage/quota-exceeded', status: 402 }), true)
  assert.equal(arquivoIndisponivel({ code: 'storage/unknown', status: 402 }), true)
  assert.equal(arquivoIndisponivel({ code: 'storage/unauthorized', status: 403 }), false)
  assert.equal(arquivoIndisponivel(new Error('rede')), false)
  assert.equal(arquivoIndisponivel(undefined), false)
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

// ── Parcelas da compra ─────────────────────────────────────────
test('parcelas em centavos: a soma bate com o total e a última leva a diferença', () => {
  assert.deepEqual(dividirEmParcelas(100, 3), [33.33, 33.33, 33.34])
  assert.deepEqual(dividirEmParcelas(18000, 1), [18000])
  for (const n of [1, 2, 3, 7, 12, 24, 60]) {
    for (const total of [100, 99.99, 1234.56, 0.05, 18000, 6500.01]) {
      const parcelas = dividirEmParcelas(total, n)
      assert.equal(parcelas.length, n)
      const somaCentavos = parcelas.reduce((s, v) => s + Math.round(v * 100), 0)
      assert.equal(somaCentavos, Math.round(total * 100), `${total} em ${n}`)
      parcelas.forEach(v => assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${v} tem mais de 2 casas`))
    }
  }
})

test('vencimentos mensais respeitam o fim do mês e a virada do ano', () => {
  assert.deepEqual(vencimentosMensais('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31'])
  assert.deepEqual(vencimentosMensais('2028-01-31', 2), ['2028-01-31', '2028-02-29'])
  assert.deepEqual(vencimentosMensais('2026-11-15', 3), ['2026-11-15', '2026-12-15', '2027-01-15'])
  assert.deepEqual(vencimentosMensais('2026-11-15', 1), ['2026-11-15'])
  assert.deepEqual(vencimentosMensais('', 2), [])
})

// ── Idioma da sessão ───────────────────────────────────────────
// Fora do navegador vale o português; emIngles simula a sessão em inglês
function emIngles(fn) {
  const antes = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { getItem: k => (k === 'praxis_lang' ? 'en' : null) }, configurable: true, writable: true,
  })
  try { return fn() } finally {
    if (antes) Object.defineProperty(globalThis, 'sessionStorage', antes)
    else delete globalThis.sessionStorage
  }
}

test('rótulos, prazos e notas gravadas seguem o idioma da sessão', () => {
  assert.equal(STATUS_LABEL.ag_cotacao, 'Em cotação')
  assert.equal(PERFIS_LABEL.gestor, 'Gestor')
  assert.equal(t('prazoFaltam', { n: 3 }), 'Faltam 3 dias')
  assert.equal(textoPrazo(1), 'Falta 1 dia')
  assert.equal(rotuloNota('Comprador assumiu'), 'Comprador assumiu o pedido')
  assert.equal(rotuloNota('Justificativa livre'), 'Justificativa livre')
  emIngles(() => {
    assert.equal(STATUS_LABEL.ag_cotacao, 'Quoting')
    assert.equal(PERFIS_LABEL.gestor, 'Manager')
    assert.equal(t('prazoFaltam', { n: 3 }), '3 days left')
    assert.equal(textoPrazo(-2), '2 days late')
    assert.equal(rotuloMotivo('Outros'), 'Other')
    assert.equal(rotuloMotivo('Texto escrito pela pessoa'), 'Texto escrito pela pessoa')
    assert.equal(rotuloNota('Cotação indicada'), 'Quote selected by the buyer')
    assert.equal(rotuloNota('Fornecedor: TechSupply · R$ 4.050,00'), 'Supplier: TechSupply · R$ 4.050,00')
    assert.equal(rotuloNota('Reaberto a partir de PRX-0007 — Verba liberada.'), 'Reopened from PRX-0007 — Verba liberada.')
    assert.equal(rotuloUrgencia('Urgente'), 'Urgent')
    assert.equal(t('chaveQueNaoExiste'), 'chaveQueNaoExiste')
  })
  assert.equal(STATUS_LABEL.ag_cotacao, 'Em cotação')
})

test('empresas da pessoa sempre como lista, qualquer que seja o formato gravado', () => {
  assert.deepEqual(empresasDoUsuario({ empresas: ['e1', 'e2'] }), ['e1', 'e2'])
  assert.deepEqual(empresasDoUsuario({ empresas: { e1: true } }), ['e1'])
  assert.deepEqual(empresasDoUsuario({}), [])
  assert.deepEqual(empresasDoUsuario(null), [])
})

// ── Dependências do site ───────────────────────────────────────
const _ler = caminho => readFileSync(new URL(`../${caminho}`, import.meta.url))

test('o SDK do Firebase do site é o mesmo dos testes, conferido pelo integrity', () => {
  const versao = JSON.parse(_ler('node_modules/firebase/package.json')).version
  const html = _ler('index.html').toString()
  const preloads = [...html.matchAll(/<link rel="modulepreload" href="https:\/\/www\.gstatic\.com\/firebasejs\/([^/]+)\/(firebase-[a-z]+\.js)"([^>]*)>/g)]
  assert.equal(preloads.length, 4)
  for (const [, v, arquivo, resto] of preloads) {
    assert.equal(v, versao, `${arquivo}: versão do site igual à dos testes`)
    const hash = 'sha384-' + createHash('sha384').update(_ler(`node_modules/firebase/${arquivo}`)).digest('base64')
    assert.ok(resto.includes(`integrity="${hash}"`), `${arquivo}: integrity igual ao do pacote do npm`)
  }
  // Todo import do SDK no app usa a mesma versão, e nenhum script vem do cdnjs
  for (const nome of readdirSync(new URL('../js/', import.meta.url)).filter(n => n.endsWith('.js'))) {
    const codigo = _ler(`js/${nome}`).toString()
    for (const [, v] of codigo.matchAll(/gstatic\.com\/firebasejs\/([^/]+)\//g)) assert.equal(v, versao, `js/${nome}`)
    assert.ok(!codigo.includes('cdnjs.cloudflare.com'), `js/${nome} sem cdnjs`)
  }
  const csp = JSON.parse(_ler('firebase.json')).hosting.headers
    .flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value
  assert.ok(!csp.includes('cdnjs'), 'a CSP não libera o cdnjs')
})

test('jsPDF e ExcelJS servidos pelo próprio site, com a licença junto', () => {
  const ui = _ler('js/ui.js').toString()
  for (const [, caminho] of ui.matchAll(/src: '\/(vendor\/[^']+)'/g)) {
    assert.ok(existsSync(new URL(`../${caminho}`, import.meta.url)), caminho)
    assert.ok(existsSync(new URL(`../${caminho.replace(/[^/]+$/, 'LICENSE')}`, import.meta.url)), `licença de ${caminho}`)
  }
  assert.match(ui, /vendor\/jspdf-2\.5\.1\/jspdf\.umd\.min\.js/)
  assert.match(ui, /vendor\/exceljs-4\.4\.0\/exceljs\.min\.js/)
})

test('datas: dd/mm/aaaa à vista, o relativo como complemento e a hora no title', () => {
  // "aaaa-mm-dd" é dia do calendário, sem virar o dia anterior pelo fuso
  assert.equal(dataAbsoluta('2026-01-05'), '05/01/2026')
  const ts = { toDate: () => new Date(2025, 10, 4, 9, 7) }
  assert.equal(dataAbsoluta(ts), '04/11/2025')
  assert.equal(dataEHora(ts), '04/11/2025 09:07')
  assert.equal(dataAbsoluta(null), '')
  assert.equal(dataAbsoluta('não é data'), '')

  const ha3dias = new Date(Date.now() - 3 * 864e5)
  const r = formatarDataRelativa(ha3dias)
  assert.equal(r.label, 'Há 3 dias')
  assert.equal(r.data, dataAbsoluta(ha3dias))
  assert.equal(r.title, dataEHora(ha3dias))
  assert.equal(dataComRelativo(ha3dias).texto, `${dataAbsoluta(ha3dias)} · há 3 dias`)
  assert.equal(formatarDataRelativa(new Date(Date.now() - 2 * 3600e3)).label, 'Há 2 h')

  // Depois de um ano o relativo já seria a própria data: fica só ela
  const antiga = new Date(2020, 0, 15)
  assert.equal(formatarDataRelativa(antiga).label, '15/01/2020')
  assert.equal(dataComRelativo(antiga).texto, '15/01/2020')
  assert.deepEqual(dataComRelativo(null), { texto: '—', title: '' })
})

test('erro na tela: o texto do app passa, a mensagem técnica não', () => {
  const avisar = console.warn
  console.warn = () => {}
  try {
    assert.equal(mensagemDeErro(new Error('Este pedido já foi assumido.'), 'padrão'), 'Este pedido já foi assumido.')
    const firebase = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied', name: 'FirebaseError' })
    assert.equal(mensagemDeErro(firebase, 'padrão'), 'padrão')
    assert.equal(mensagemDeErro(new TypeError("Cannot read properties of undefined (reading 'x')"), 'padrão'), 'padrão')
    assert.equal(mensagemDeErro(undefined, 'padrão'), 'padrão')
  } finally {
    console.warn = avisar
  }
})

// ── Importação de fornecedores por CSV ─────────────────────────
test('CSV: separador ";" ou ",", BOM, aspas, CRLF e linhas em branco', () => {
  const pv = lerCSV('\uFEFFNome;CNPJ\r\nAcme Ltda;11.222.333/0001-81\r\n\r\n"Beta; Cia";\r\n')
  assert.equal(pv.separador, ';')
  assert.deepEqual(pv.linhas, [
    { linha: 2, nome: 'Acme Ltda', cnpj: '11.222.333/0001-81' },
    { linha: 4, nome: 'Beta; Cia', cnpj: '' },
  ])

  const vg = lerCSV('cnpj,razão social\n11222333000181,"Gama ""G"" Ltda"\n,"Delta\nFilial"\nÉpsilon\n')
  assert.equal(vg.separador, ',')
  assert.deepEqual(vg.linhas.map(l => [l.linha, l.nome, l.cnpj]), [
    [2, 'Gama "G" Ltda', '11222333000181'],
    [3, 'Delta\nFilial', ''],
    [5, '', 'Épsilon'],
  ])

  // Só a coluna do nome: o CNPJ fica vazio
  assert.deepEqual(lerCSV('fornecedor\nZeta').linhas, [{ linha: 2, nome: 'Zeta', cnpj: '' }])
})

test('CSV: cabeçalho obrigatório, arquivo vazio, aspas abertas e teto de linhas', () => {
  assert.equal(lerCSV('').erro, 'impErroVazio')
  assert.equal(lerCSV('\uFEFF \r\n').erro, 'impErroVazio')
  assert.equal(lerCSV('Acme;11.222.333/0001-81\nBeta;').erro, 'impErroSemNome')
  assert.equal(lerCSV('nome;cnpj\r\n').erro, 'impErroSemLinhas')
  assert.equal(lerCSV('nome\n"Acme\nBeta').erro, 'impErroAspas')
  const cheio = 'nome\n' + Array.from({ length: MAX_LINHAS }, (_, i) => `F${i}`).join('\n')
  assert.equal(lerCSV(cheio).linhas.length, MAX_LINHAS)
  const demais = lerCSV(cheio + '\nUm a mais')
  assert.equal(demais.erro, 'impErroMuitasLinhas')
  assert.deepEqual(demais.vars, { max: MAX_LINHAS, n: MAX_LINHAS + 1 })
})

test('CSV: UTF-8 com ou sem BOM e o Windows-1252 do Excel antigo', () => {
  const utf8 = new TextEncoder().encode('\uFEFFnome\nGráfica')
  assert.equal(lerCSV(decodificarArquivo(utf8)).linhas[0].nome, 'Gráfica')
  const ansi = Uint8Array.from([...'nome\nGr'].map(c => c.charCodeAt(0)).concat(0xE1, ...[...'fica'].map(c => c.charCodeAt(0))))
  assert.equal(lerCSV(decodificarArquivo(ansi)).linhas[0].nome, 'Gráfica')
})

test('importação: novo, existente, CNPJ a completar, conflito e recusada com motivo', () => {
  const cadastro = [
    { id: 'a', nome: 'acme ltda', nomeExibicao: 'Acme Ltda', cnpj: '11.222.333/0001-81' },
    { id: 'b', nome: 'beta comercio', nomeExibicao: 'Beta Comércio', cnpj: '' },
    { id: 'c', nome: 'gama', nomeExibicao: 'Gama', cnpj: '44.555.666/0001-99' },
  ]
  const linhas = [
    { linha: 2, nome: 'Delta Serviços', cnpj: '' },
    { linha: 3, nome: '  ACME   LTDA ', cnpj: '' },
    { linha: 4, nome: 'acme ltda', cnpj: '11222333000181' },
    { linha: 5, nome: 'Beta Comercio', cnpj: '77.888.999/0001-00' },
    { linha: 6, nome: 'Acme Ltda.', cnpj: '44.555.666/0001-99' },
    { linha: 7, nome: 'Gama', cnpj: '12.345.678/0001-00' },
    { linha: 8, nome: '', cnpj: '12.345.678/0001-00' },
    { linha: 9, nome: 'Épsilon', cnpj: '123.456' },
    { linha: 10, nome: 'Zeta', cnpj: 'não tem' },
    { linha: 11, nome: 'delta serviços', cnpj: '' },
    { linha: 12, nome: 'Eta', cnpj: '77.888.999/0001-00' },
    { linha: 13, nome: 'x'.repeat(MAX_NOME + 1), cnpj: '' },
  ]
  const r = classificarFornecedores(linhas, cadastro)
  const sit = r.map(i => [i.linha, i.situacao, i.motivo?.chave || ''])
  assert.deepEqual(sit, [
    [2, 'novo', ''],
    [3, 'existente', 'impMotivoMesmoNome'],
    [4, 'recusada', 'impMotivoRepetida'],          // "acme ltda" já veio na linha 3
    [5, 'completar', 'impMotivoSemCnpj'],
    [6, 'existente', 'impMotivoMesmoCnpj'],        // outro nome, CNPJ da Gama
    [7, 'conflito', 'impMotivoOutroCnpj'],
    [8, 'recusada', 'impMotivoSemNome'],
    [9, 'recusada', 'impMotivoCnpj'],
    [10, 'recusada', 'impMotivoCnpj'],
    [11, 'recusada', 'impMotivoRepetida'],
    [12, 'recusada', 'impMotivoRepetida'],         // mesmo CNPJ da linha 5
    [13, 'recusada', 'impMotivoNomeLongo'],
  ])
  assert.equal(r[1].nome, 'ACME LTDA')
  assert.equal(r[1].fornecedor.id, 'a')
  assert.equal(r[3].cnpj, '77888999000100')
  assert.equal(r[3].fornecedor.id, 'b')
  assert.deepEqual(r[2].motivo.vars, { n: 3 })
  assert.deepEqual(r[5].motivo.vars, { cnpj: '44.555.666/0001-99' })
  assert.deepEqual(contarSituacoes(r), { novo: 1, completar: 1, existente: 2, conflito: 1, recusada: 7 })

  // O mesmo nome sem CNPJ no cadastro, mas o CNPJ da linha é de outro fornecedor
  const outro = classificarFornecedores([{ linha: 2, nome: 'Beta Comércio', cnpj: '44.555.666/0001-99' }], cadastro)
  assert.deepEqual([outro[0].situacao, outro[0].motivo], ['conflito', { chave: 'impMotivoCnpjDeOutro', vars: { nome: 'Gama' } }])
})

test('importação: o mesmo arquivo duas vezes não cria nada na segunda', () => {
  const lido = lerCSV(readFileSync(new URL('../docs/exemplos/fornecedores.csv', import.meta.url), 'utf8'))
  const cadastro = [{ id: 'x', nome: 'distribuidora alfa ltda', nomeExibicao: 'Distribuidora Alfa Ltda', cnpj: '11.111.111/0001-11' }]
  const primeira = classificarFornecedores(lido.linhas, cadastro)
  assert.ok(primeira.some(i => i.situacao === 'novo'))
  // Grava como o app: os novos entram no cadastro com o nome e o CNPJ da linha
  const depois = [...cadastro, ...primeira.filter(i => i.situacao === 'novo')
    .map((i, n) => ({ id: `n${n}`, nome: normalizarTexto(i.nome), nomeExibicao: i.nome, cnpj: formatCNPJ(i.cnpj) }))]
  const segunda = classificarFornecedores(lido.linhas, depois)
  assert.equal(segunda.filter(i => i.situacao === 'novo' || i.situacao === 'completar').length, 0)
  // As linhas que não entraram continuam de fora pelo mesmo motivo
  assert.deepEqual(segunda.filter(i => i.situacao === 'recusada' || i.situacao === 'conflito').map(i => i.motivo.chave),
    primeira.filter(i => i.situacao === 'recusada' || i.situacao === 'conflito').map(i => i.motivo.chave))
})
