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
import {
  faixaDoValor, retratoAprovacao, situacaoAprovacao, aplicarVoto, votouNoPedido, estaNoNivel, problemasDaAlcada, limparAlcada,
} from '../js/alcadas.js'
import {
  segmentosDoPedido, marcosDoPedido, formatarDuracao, percentil, resumoDoProcesso,
} from '../js/processo.js'
import { montarExportacao, paraJSON, nomeDoArquivo, COLECOES, SUBCOLECOES_PEDIDO, FORMATO } from '../js/exportacao.js'
import {
  statusDoLancamento, errosDoLancamento, montarLancamento, podeRevisarAutorizacao, revisaoDaAutorizacao,
} from '../js/lancamento.js'
import { digitoDaChave, conferirNota, formatarNota, chaveDoQr } from '../js/nota.js'
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
  // O comprador que cotou registra a compra; o supremo fica livre das travas
  assert.equal(impedimentoDeFuncao(ped, gestor('u-ges'), 'comprar'), null)
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-sol', perfil: 'supremo' }, 'decidir'), null)
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-ges', perfil: 'supremo' }, 'decidir'), null)
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-ges2', perfil: 'supremo' }, 'comprar'), null)
  assert.equal(impedimentoDeFuncao(ped, { id: 'u-ges2', perfil: 'supremo' }, 'pagar'), null)
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

// ── Alçadas de aprovação ───────────────────────────────────────
const NV1 = { nome: 'Aprovação', perfis: ['aprovador', 'gestor'], usuarios: [], minimo: 1 }
const NV2 = { nome: 'Diretoria', perfis: [], usuarios: ['u-dir1', 'u-dir2'], minimo: 2 }
const ALCADA = { faixas: [{ ate: 1000, niveis: [NV1] }, { ate: 50000, niveis: [NV1, NV2] }, { ate: null, niveis: [NV2] }] }

test('alçada: o valor cai na faixa certa, com o teto incluído', () => {
  assert.equal(faixaDoValor(ALCADA.faixas, 0), 0)
  assert.equal(faixaDoValor(ALCADA.faixas, 1000), 0)
  assert.equal(faixaDoValor(ALCADA.faixas, 1000.01), 1)
  assert.equal(faixaDoValor(ALCADA.faixas, 50000), 1)
  assert.equal(faixaDoValor(ALCADA.faixas, 1e9), 2)
  assert.equal(retratoAprovacao(null, 10), null)
  assert.deepEqual(retratoAprovacao(ALCADA, 5000), {
    aprovacao: { faixa: 1, valor: 5000, niveis: [NV1, NV2], nivelAtual: 0, votos: {} },
    aprovadorIds: [],
  })
  assert.deepEqual(retratoAprovacao(ALCADA, 90000).aprovadorIds, ['u-dir1', 'u-dir2'])
})

test('alçada: vota quem está no nível, uma vez; o nível completo avança e o último aprova', () => {
  const aprovador = { id: 'u-apr', perfil: 'aprovador' }
  const dir1 = { id: 'u-dir1', perfil: 'gestor' }
  const dir2 = { id: 'u-dir2', perfil: 'gestor' }
  let p = { solicitanteId: 'u-sol', compradorId: 'u-com', ...retratoAprovacao(ALCADA, 5000) }
  // Quem abriu ou cotou não decide; o comprador não está em nenhum nível
  assert.equal(impedimentoDeFuncao(p, { id: 'u-sol', perfil: 'gestor' }, 'decidir'), 'abriu')
  assert.equal(impedimentoDeFuncao(p, { id: 'u-com', perfil: 'comprador' }, 'decidir'), 'cotou')
  assert.equal(impedimentoDeFuncao(p, { id: 'u-fin', perfil: 'financeiro' }, 'decidir'), 'foraDoNivel')
  assert.equal(impedimentoDeFuncao(p, aprovador, 'decidir'), null)
  assert.deepEqual(situacaoAprovacao(p), { numero: 1, total: 2, nome: 'Aprovação', minimo: 1, votos: [], faltam: 1, nivel: NV1 })

  let v = aplicarVoto(p, 'u-apr')
  assert.equal(v.resultado, 'avancou')
  assert.deepEqual(v.campos.aprovadorIds, ['u-dir1', 'u-dir2'])
  p = { ...p, ...v.campos }
  assert.equal(p.aprovacao.nivelAtual, 1)
  // Quem votou não vota de novo, nem em outro nível, e não compra nem paga
  assert.equal(impedimentoDeFuncao(p, aprovador, 'decidir'), 'votou')
  assert.equal(impedimentoDeFuncao(p, aprovador, 'comprar'), 'aprovou')
  assert.equal(impedimentoDeFuncao(p, aprovador, 'pagar'), 'aprovou')
  // No nível 2 só as pessoas da diretoria, pelo nome
  assert.equal(impedimentoDeFuncao(p, { id: 'u-ges', perfil: 'gestor' }, 'decidir'), 'foraDoNivel')
  assert.equal(impedimentoDeFuncao(p, dir1, 'decidir'), null)

  v = aplicarVoto(p, 'u-dir1')
  assert.equal(v.resultado, 'voto')
  p = { ...p, ...v.campos }
  assert.equal(situacaoAprovacao(p).faltam, 1)
  v = aplicarVoto(p, 'u-dir2')
  assert.equal(v.resultado, 'aprovado')
  assert.deepEqual(v.campos.aprovacao.votos, { 0: ['u-apr'], 1: ['u-dir1', 'u-dir2'] })
  assert.ok(votouNoPedido({ ...p, ...v.campos }, 'u-dir2'))
  assert.equal(impedimentoDeFuncao({ ...p, ...v.campos }, dir2, 'comprar'), 'aprovou')
  // Sem alçada, tudo como antes
  assert.equal(impedimentoDeFuncao({ solicitanteId: 'x' }, aprovador, 'decidir'), null)
})

test('alçada: o supremo está em todo nível e aprova de uma vez', () => {
  const sup = { id: 'u-sup', perfil: 'supremo' }
  // Mesmo tendo cotado o pedido e fora das pessoas do nível 2
  let p = { solicitanteId: 'u-sol', compradorId: 'u-sup', ...retratoAprovacao(ALCADA, 5000) }
  assert.equal(estaNoNivel(NV2, sup), true)
  assert.equal(impedimentoDeFuncao(p, sup, 'decidir'), null)
  const v = aplicarVoto(p, 'u-sup', { supremo: true })
  assert.equal(v.resultado, 'aprovado')
  assert.deepEqual(v.campos.aprovacao.votos, { 0: ['u-sup'] })
  assert.equal(v.campos.aprovacao.nivelAtual, 0)
  assert.deepEqual(v.campos.aprovadorIds, [])
  // Já votou e aprovou: ainda compra e paga
  p = { ...p, ...v.campos, aprovadoPor: 'u-sup' }
  assert.equal(impedimentoDeFuncao(p, sup, 'comprar'), null)
  assert.equal(impedimentoDeFuncao(p, sup, 'pagar'), null)
})

// ── Tempo do processo (js/processo.js) ────────────────────────
const DIA = 86400000, HORA = 3600000, T0 = Date.UTC(2026, 10, 1, 12)
const em = ms => new Date(T0 + ms)
const passos = (...pares) => pares.map(([status, ms]) => ({ status, tipo: 'status', criadoEm: em(ms) }))
// A: pago, sem voltas; B: em aprovação agora; C: liberado de volta a Solicitado e reprovado
const PED_A = { pedido: { status: 'pago', criadoEm: em(0), compradorId: 'c1', compradorNome: 'Diana' },
  historico: [...passos(['solicitado', 0], ['ag_cotacao', DIA], ['em_aprovacao', 3 * DIA], ['aprovado', 4 * DIA],
    ['comprado', 4 * DIA + 12 * HORA], ['entregue', 6 * DIA], ['pago', 7 * DIA]),
  { tipo: 'comentario', criadoEm: em(2 * DIA) }] }
const PED_B = { pedido: { status: 'em_aprovacao', criadoEm: em(2 * DIA), compradorId: 'c1', compradorNome: 'Diana' },
  historico: passos(['solicitado', 2 * DIA], ['ag_cotacao', 2 * DIA + 6 * HORA], ['em_aprovacao', 5 * DIA + 6 * HORA]) }
const PED_C = { pedido: { status: 'reprovado', criadoEm: em(0), compradorId: 'c2', compradorNome: 'Beatriz' },
  historico: passos(['solicitado', 0], ['ag_cotacao', DIA], ['solicitado', 2 * DIA], ['ag_cotacao', 3 * DIA],
    ['em_aprovacao', 4 * DIA], ['reprovado', 5 * DIA]) }
const AGORA = T0 + 8 * DIA

test('processo: passagens por etapa, marcos e duração em texto', () => {
  const a = segmentosDoPedido(PED_A.pedido, PED_A.historico, AGORA)
  // Pago encerra: a última transição só marca o fim; o comentário não conta
  assert.deepEqual(a.map(s => [s.status, s.durMs, s.emAndamento]), [
    ['solicitado', DIA, false], ['ag_cotacao', 2 * DIA, false], ['em_aprovacao', DIA, false],
    ['aprovado', 12 * HORA, false], ['comprado', DIA + 12 * HORA, false], ['entregue', DIA, false]])
  const b = segmentosDoPedido(PED_B.pedido, PED_B.historico, AGORA)
  assert.deepEqual(b.at(-1), { status: 'em_aprovacao', inicio: T0 + 5 * DIA + 6 * HORA, fim: AGORA, durMs: 2 * DIA + 18 * HORA, emAndamento: true })
  assert.deepEqual(segmentosDoPedido({ status: 'solicitado' }, passos(['solicitado', 0]), AGORA), [])
  assert.deepEqual(marcosDoPedido(PED_A.pedido, PED_A.historico), { aberto: T0, comprado: T0 + 4 * DIA + 12 * HORA, pago: T0 + 7 * DIA })
  assert.deepEqual(marcosDoPedido(PED_B.pedido, PED_B.historico), { aberto: T0 + 2 * DIA, comprado: 0, pago: 0 })
  assert.equal(formatarDuracao(4 * DIA + 12 * HORA), '4d 12h')
  assert.equal(formatarDuracao(2 * DIA), '2d')
  assert.equal(formatarDuracao(5 * HORA), '5h')
  assert.equal(formatarDuracao(90000), '1min')
  assert.equal(formatarDuracao(0), '—')
  assert.equal(percentil([4, 1, 3, 2], 0.5), 2.5)
  assert.ok(Math.abs(percentil([1, 2, 3, 4], 0.85) - 3.55) < 1e-9)
  assert.equal(percentil([], 0.5), null)
})

test('processo: ciclo, mediana por etapa, gargalo e compradores na janela', () => {
  const r = resumoDoProcesso([PED_A, PED_B, PED_C], { ini: T0, fim: T0 + 10 * DIA }, AGORA)
  assert.deepEqual(r.ciclo.compra, { n: 1, mediana: 4 * DIA + 12 * HORA, p85: 4 * DIA + 12 * HORA })
  assert.deepEqual(r.ciclo.pagamento, { n: 1, mediana: 7 * DIA, p85: 7 * DIA })
  const e = Object.fromEntries(r.etapas.map(x => [x.status, x]))
  assert.deepEqual(r.etapas.map(x => x.status), ['solicitado', 'ag_cotacao', 'em_aprovacao', 'aprovado', 'comprado', 'entregue'])
  // C passou duas vezes por Solicitado e por Ag. cotação: conta a soma (2 dias em cada)
  assert.equal(e.solicitado.n, 3); assert.equal(e.solicitado.mediana, DIA)
  assert.equal(e.ag_cotacao.n, 3); assert.equal(e.ag_cotacao.mediana, 2 * DIA)
  // B ainda está em aprovação: fica fora da mediana e entra em "agora"
  assert.equal(e.em_aprovacao.n, 2); assert.equal(e.em_aprovacao.agora, 1)
  assert.equal(e.em_aprovacao.maisAntigo, 2 * DIA + 18 * HORA)
  assert.equal(e.aprovado.n, 1)
  assert.equal(r.gargalo, 'ag_cotacao')
  assert.deepEqual(r.compradores.map(c => [c.nome, c.cotacao.n, c.cotacao.mediana, c.compra.n]), [
    ['Diana', 2, 2.5 * DIA, 1], ['Beatriz', 1, 2 * DIA, 0]])
  // A data que conta é a do fim: comprado antes da janela fica de fora, pago dentro entra
  const tarde = resumoDoProcesso([PED_A], { ini: T0 + 5 * DIA, fim: T0 + 10 * DIA }, AGORA)
  assert.equal(tarde.ciclo.compra.n, 0)
  assert.equal(tarde.ciclo.pagamento.n, 1)
  assert.equal(tarde.gargalo, null)
  assert.deepEqual(tarde.etapas.filter(x => x.n).map(x => x.status), ['comprado', 'entregue'])
})

test('cópia dos dados: datas em ISO, ordem estável, subcoleções no pedido e contagens', () => {
  // Um Timestamp do Firestore tem toDate(); uma referência, path e firestore
  const ts = iso => ({ toDate: () => new Date(iso) })
  assert.deepEqual(paraJSON({ a: ts('2026-11-17T12:00:00Z'), b: [new Date('2026-01-02T00:00:00Z'), 3, 'x'], c: null, d: undefined, r: { path: 'empresas/e1', firestore: {} } }),
    { a: '2026-11-17T12:00:00.000Z', b: ['2026-01-02T00:00:00.000Z', 3, 'x'], c: null, d: null, r: 'empresas/e1' })
  const pacote = montarExportacao({
    geradoEm: new Date('2026-11-17T15:00:00Z'),
    geradoPor: { id: 'u1', nome: 'Beatriz', perfil: 'gestor' },
    empresaIds: ['e2', 'e1'],
    colecoes: { empresas: [{ id: 'e2', nome: 'B' }, { id: 'e1', nome: 'A', criadoEm: ts('2026-01-01T00:00:00Z') }], usuarios: [{ id: 'u1' }] },
    pedidos: [{ id: 'p1', titulo: 'Cadeiras', criadoEm: ts('2026-11-01T10:00:00Z'),
      historico: [{ id: 'h2', status: 'ag_cotacao' }, { id: 'h1', status: 'solicitado' }], parcelas: [{ id: 'x', valor: 10 }] }],
    faltas: ['convites'],
  })
  assert.equal(pacote.formato, FORMATO)
  assert.equal(pacote.geradoEm, '2026-11-17T15:00:00.000Z')
  assert.deepEqual(pacote.empresaIds, ['e1', 'e2'])
  assert.deepEqual(pacote.empresas.map(e => e.id), ['e1', 'e2'])
  assert.equal(pacote.empresas[0].criadoEm, '2026-01-01T00:00:00.000Z')
  // Toda coleção e toda subcoleção aparecem, mesmo vazias
  for (const c of COLECOES) assert.ok(Array.isArray(pacote[c]), c)
  const p = pacote.pedidos[0]
  for (const s of SUBCOLECOES_PEDIDO) assert.ok(Array.isArray(p[s]), s)
  assert.deepEqual(p.historico.map(h => h.id), ['h1', 'h2'])
  assert.equal(p.criadoEm, '2026-11-01T10:00:00.000Z')
  assert.equal(pacote.contagens.empresas, 2)
  assert.equal(pacote.contagens.pedidos, 1)
  assert.equal(pacote.contagens.historico, 2)
  assert.equal(pacote.contagens.parcelas, 1)
  assert.equal(pacote.contagens.convites, 0)
  assert.deepEqual(pacote.faltas, ['convites'])
  // O arquivo volta igual pelo JSON
  assert.deepEqual(JSON.parse(JSON.stringify(pacote)), pacote)
  assert.equal(nomeDoArquivo(new Date(2026, 10, 7)), 'praxis-dados-2026-11-07.json')
})

test('compra já feita: etapa, validação, pedido e parcelas como as regras esperam', () => {
  assert.equal(statusDoLancamento({ recebido: true, pago: true }), 'pago')
  assert.equal(statusDoLancamento({ recebido: true, pago: false }), 'entregue')
  assert.equal(statusDoLancamento({ recebido: false, pago: true }), 'comprado')
  const v = {
    titulo: 'Lâmpadas', empresaId: 'e1', fornecedorNome: 'Casa do Construtor', valorFinal: 100, dataCompra: '2026-11-15',
    pedidoPor: { id: 'u1', nome: 'Ana' }, autorizadoPor: { id: null, nome: 'Gerente' }, compradoPor: { id: null, nome: 'José' },
    motivo: 'urgente', recebido: true, pago: false, vencimento: '2026-12-31', parcelas: 3,
  }
  assert.deepEqual(errosDoLancamento(v, '2026-11-17'), [])
  const campos = e => errosDoLancamento(e, '2026-11-17').map(x => x[0])
  assert.deepEqual(campos({ ...v, dataCompra: '2026-11-18' }), ['lc-data'])
  assert.deepEqual(campos({ ...v, motivo: 'outro' }), ['lc-detalhes'])
  assert.deepEqual(campos({ ...v, valorFinal: 0, compradoPor: { nome: ' ' } }), ['lc-valor', 'lc-comprado-por'])
  assert.deepEqual(campos({ ...v, parcelas: 0, link: 'mercadolivre.com' }), ['lc-parcelas', 'lc-link'])
  // A nota: número livre passa; chave com o dígito ou o tamanho errado, não
  assert.deepEqual(campos({ ...v, notaFiscal: 'NF 1234' }), [])
  assert.deepEqual(campos({ ...v, notaFiscal: '52060433009911002506550120000007800267301615' }), [])
  assert.deepEqual(errosDoLancamento({ ...v, notaFiscal: '52060433009911002506550120000007800267301614' }, '2026-11-17'), [['lc-nota', 'notaDigitoErrado']])
  assert.deepEqual(errosDoLancamento({ ...v, notaFiscal: '520604330099110025065501200000078002673016' }, '2026-11-17'), [['lc-nota', 'notaTamanhoErrado']])
  // Quem não é gestor: autorização pendente, parcelas mensais em centavos
  const quem = { id: 'u9', nome: 'Serviços', perfil: 'solicitante' }
  const { pedido, parcelas } = montarLancamento(v, quem, 'TS')
  assert.equal(pedido.status, 'entregue')
  assert.equal(pedido.solicitanteId, 'u9')
  assert.equal(pedido.compradorId, null)
  assert.equal(pedido.condicaoPagamento, 'apos_recebimento')
  assert.equal(pedido.dataEntrega, '2026-11-15')
  assert.equal(pedido.lancamento.autorizacao, 'pendente')
  assert.equal(pedido.lancamento.autorizacaoEm, null)
  assert.deepEqual(parcelas.map(p => [p.valor, p.vencimento, p.pago]),
    [[33.33, '2026-12-31', false], [33.33, '2027-01-31', false], [33.34, '2027-02-28', false]])
  // O gestor que autorizou a própria compra: confirmada; já pago: uma parcela paga
  const gestor = { id: 'u2', nome: 'Gestora', perfil: 'gestor' }
  const g = montarLancamento({ ...v, autorizadoPor: { id: 'u2', nome: 'Gestora' }, pago: true }, gestor, 'TS')
  assert.equal(g.pedido.status, 'pago')
  assert.equal(g.pedido.lancamento.autorizacao, 'confirmada')
  assert.equal(g.pedido.lancamento.autorizacaoEm, 'TS')
  assert.deepEqual(g.parcelas, [{ numero: 1, total: 1, valor: 100, vencimento: '2026-11-15', pago: true, pagoEm: 'TS', comprovante: null }])
})

// Exemplo de chave do Manual de Orientação do Contribuinte da NF-e (cálculo do
// dígito verificador): soma 644, resto 6, dígito 11 − 6 = 5
const CHAVE_MOC = '52060433009911002506550120000007800267301615'

test('nota fiscal: dígito da chave, o que foi digitado, blocos e o QR Code da NFC-e', () => {
  assert.equal(digitoDaChave(CHAVE_MOC.slice(0, 43)), 5)
  // Resto 0 ou 1 dá dígito 0
  assert.equal(digitoDaChave('0'.repeat(43)), 0)
  assert.equal(digitoDaChave(`${'0'.repeat(42)}6`), 0)
  assert.equal(digitoDaChave(`${'0'.repeat(42)}5`), 1)
  // O que foi digitado: vazio, número (até 20 dígitos ou com letras), chave
  // válida (espaços, pontos e traços não contam), dígito ou tamanho errado
  assert.equal(conferirNota(''), 'vazia')
  assert.equal(conferirNota('   '), 'vazia')
  assert.equal(conferirNota(null), 'vazia')
  assert.equal(conferirNota('1234'), 'numero')
  assert.equal(conferirNota('NF 001.234'), 'numero')
  assert.equal(conferirNota('1'.repeat(20)), 'numero')
  assert.equal(conferirNota(CHAVE_MOC), 'chave')
  assert.equal(conferirNota(formatarNota(CHAVE_MOC)), 'chave')
  assert.equal(conferirNota(` ${CHAVE_MOC.slice(0, 22)}-${CHAVE_MOC.slice(22)} `), 'chave')
  assert.equal(conferirNota(`${CHAVE_MOC.slice(0, 43)}4`), 'digito')
  // Dois dígitos vizinhos trocados ("01" → "10" nas posições 23 e 24)
  assert.equal(conferirNota(`${CHAVE_MOC.slice(0, 22)}${CHAVE_MOC[23]}${CHAVE_MOC[22]}${CHAVE_MOC.slice(24)}`), 'digito')
  assert.equal(conferirNota(CHAVE_MOC.slice(0, 43)), 'tamanho')
  assert.equal(conferirNota(`${CHAVE_MOC}0`), 'tamanho')
  assert.equal(conferirNota('1'.repeat(21)), 'tamanho')
  // Em blocos de 4, como no DANFE; o que não é chave fica como veio
  assert.equal(formatarNota(CHAVE_MOC), '5206 0433 0099 1100 2506 5501 2000 0007 8002 6730 1615')
  assert.equal(formatarNota('NF 12'), 'NF 12')
  // QR Code da NFC-e: a chave no parâmetro "p" (chave|versão|ambiente|...),
  // em "chNFe", ou solta no texto; com o dígito errado, nada
  assert.equal(chaveDoQr(`https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE_MOC}|2|1|1|8F3A0C21B9`), CHAVE_MOC)
  assert.equal(chaveDoQr(`http://nfce.sefaz.exemplo.gov.br/consulta?chNFe=${CHAVE_MOC}&nVersao=100`), CHAVE_MOC)
  assert.equal(chaveDoQr(`NFC-e ${CHAVE_MOC} emitida`), CHAVE_MOC)
  assert.equal(chaveDoQr(`https://x.gov.br/qrcode?p=${CHAVE_MOC.slice(0, 43)}4|2|1|1|AB`), null)
  assert.equal(chaveDoQr('https://exemplo.com.br/'), null)
  assert.equal(chaveDoQr(''), null)
})

test('compra já feita: quem revisa a autorização e o que muda', () => {
  const p = { empresaId: 'e1', lancamento: { lancadoPor: 'u9', autorizadoPor: { id: 'u3', nome: 'Apr' }, autorizacao: 'pendente' } }
  assert.equal(podeRevisarAutorizacao(p, { id: 'u9', perfil: 'gestor', empresas: ['e1'] }), false)  // quem lançou
  assert.equal(podeRevisarAutorizacao(p, { id: 'u3', perfil: 'aprovador', empresas: ['e1'] }), true) // apontado
  assert.equal(podeRevisarAutorizacao(p, { id: 'u4', perfil: 'gestor', empresas: ['e1'] }), true)    // gestor da empresa
  assert.equal(podeRevisarAutorizacao(p, { id: 'u5', perfil: 'gestor', empresas: ['e2'] }), false)   // de outra
  assert.equal(podeRevisarAutorizacao(p, { id: 'u6', perfil: 'comprador', empresas: ['e1'] }), false)
  assert.equal(podeRevisarAutorizacao({ ...p, lancamento: { ...p.lancamento, autorizacao: 'confirmada' } }, { id: 'u4', perfil: 'gestor', empresas: ['e1'] }), false)
  const r = revisaoDaAutorizacao(p, { id: 'u4', nome: 'Gestor' }, 'negada', 'TS', 'ev1')
  assert.deepEqual(r.lancamento, { ...p.lancamento, autorizacao: 'negada', autorizacaoEm: 'TS', autorizacaoPor: 'u4', autorizacaoPorNome: 'Gestor' })
  assert.equal(r.autorizacaoEventoId, 'ev1')
  // E o lançamento fica fora do tempo do processo
  const lancado = { pedido: { status: 'pago', criadoEm: em(0), lancamento: {} }, historico: passos(['pago', DIA]) }
  assert.equal(resumoDoProcesso([lancado], { ini: T0, fim: T0 + 10 * DIA }, AGORA).ciclo.pagamento.n, 0)
})

test('alçada: o editor confere faixas e níveis antes de gravar', () => {
  assert.deepEqual(problemasDaAlcada(ALCADA.faixas), [])
  assert.deepEqual(problemasDaAlcada([]), [{ chave: 'alcErroSemFaixa' }])
  const chaves = f => problemasDaAlcada(f).map(p => `${p.chave}@${p.faixa || ''}.${p.nivel || ''}`)
  assert.deepEqual(chaves([{ ate: 5000, niveis: [NV1] }, { ate: 1000, niveis: [NV1] }, { ate: null, niveis: [NV1] }]), ['alcErroOrdem@2.'])
  assert.deepEqual(chaves([{ ate: null, niveis: [] }]), ['alcErroNiveis@1.'])
  assert.deepEqual(chaves([{ ate: null, niveis: [{ ...NV1, nome: ' ', perfis: [] }] }]), ['alcErroNomeNivel@1.1', 'alcErroQuem@1.1', 'alcErroMinimo@1.1'])
  assert.deepEqual(chaves([{ ate: null, niveis: [{ ...NV2, minimo: 3 }] }]), ['alcErroMinimo@1.1'])
  assert.deepEqual(chaves([{ ate: 0, niveis: [NV1] }, { ate: null, niveis: [NV1] }]), ['alcErroTeto@1.'])
  // No formato gravado: a última faixa sem teto, perfis em ordem e nomes aparados
  assert.deepEqual(limparAlcada([{ ate: '1000', niveis: [{ nome: ' Dir ', perfis: ['gestor', 'aprovador'], usuarios: ['a', 'a'], minimo: '1' }] }]),
    [{ ate: null, niveis: [{ nome: 'Dir', perfis: ['aprovador', 'gestor'], usuarios: ['a'], minimo: 1 }] }])
})
