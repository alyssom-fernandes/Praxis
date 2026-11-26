// Ponta a ponta das Fases 1–3, no app de verdade, contra os emuladores (como
// tests/e2e.test.mjs): a requisição sem cotação até a retirada, a fatura do
// fornecedor, o acesso sem e-mail com a troca da senha no primeiro acesso e o
// pedido guardado sem internet.
//
//   npm run testar-e2e        (PW_CANAL=chrome usa o Chrome da máquina)

/* global document */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const RAIZ    = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PROJETO = process.env.GCLOUD_PROJECT || 'demo-praxis-e2e'
const CONFIG_EXEMPLO = await readFile(join(RAIZ, 'js', 'config.example.js'), 'utf8')
const SENHA   = CONFIG_EXEMPLO.match(/password:\s*'([^']+)'/)[1]
const MARCA   = Date.now().toString(36)

const doFunctions = createRequire(join(RAIZ, 'functions', 'package.json'))
process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:9090'
const { initializeApp } = doFunctions('firebase-admin/app')
const { getFirestore }  = doFunctions('firebase-admin/firestore')
initializeApp({ projectId: PROJETO })
const banco = getFirestore()

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
const servidor = createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  try {
    let corpo
    if (caminho === '/js/config.js') corpo = CONFIG_EXEMPLO.replaceAll('praxis-af618', PROJETO)
    else {
      const arquivo = resolve(RAIZ, '.' + (caminho.endsWith('/') ? `${caminho}index.html` : caminho))
      if (!arquivo.startsWith(RAIZ + sep)) throw new Error('fora da raiz')
      corpo = await readFile(arquivo)
    }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || TIPOS['.html'], 'Cache-Control': 'no-store' })
    res.end(corpo)
  } catch {
    res.writeHead(404)
    res.end()
  }
})

let navegador
let BASE
const erros = []

before(async () => {
  await new Promise(ok => servidor.listen(0, 'localhost', ok))
  BASE = `http://localhost:${servidor.address().port}`
  navegador = await chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {})
})
after(async () => {
  await navegador?.close()
  servidor.close()
})

async function pagina() {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('praxis_tour_visto', '1'); sessionStorage.setItem('praxis_tour_mostrado', '1') } catch { /* sem armazenamento */ }
  })
  const p = await ctx.newPage()
  p.setDefaultTimeout(30000)
  p.on('pageerror', e => erros.push(e.message))
  p.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|net::ERR|Failed to load resource|Could not reach/.test(m.text())) erros.push(m.text().slice(0, 200)) })
  return p
}
async function entrar(login, senha = SENHA) {
  const p = await pagina()
  await p.goto(`${BASE}/`)
  await p.fill('#input-email', login)
  await p.fill('#input-senha', senha)
  await p.click('#btn-entrar')
  return p
}
async function noQuadro(p) {
  await p.waitForSelector('#pedidos-view')
  await p.waitForFunction(() => !document.querySelector('#pedidos-view .skeleton'))
}
async function abrirPedido(p, id, seletor) {
  await p.goto(`${BASE}/?tela=detalhe&id=${id}`)
  await p.waitForSelector(seletor)
}
// Espera um documento chegar ao estado (as gravações saem do navegador)
async function esperar(fn, msg) {
  for (let i = 0; i < 60; i++) {
    const v = await fn()
    if (v) return v
    await new Promise(r => setTimeout(r, 500))
  }
  assert.fail(msg)
}
const status = id => banco.doc(`pedidos/${id}`).get().then(d => d.data()?.status)
async function abrirFormulario(p) {
  await p.click('#btn-novo-pedido')
  await p.waitForFunction(() => document.querySelectorAll('#np-empresa option').length > 1)
}
async function escolherEmpresa(p, nome) {
  const valor = await p.$$eval('#np-empresa option', (os, n) => os.find(o => o.textContent.includes(n))?.value, nome)
  assert.ok(valor, `a empresa ${nome} está no formulário`)
  await p.selectOption('#np-empresa', valor)
}

test('requisição: dois itens, direto para a aprovação, e quem pediu registra a retirada', async () => {
  const forn = `Auto Peças E2E ${MARCA}`
  const sol = await entrar('solicitante@praxis.app')
  await noQuadro(sol)
  await abrirFormulario(sol)
  await sol.fill('#np-item-0', 'Correia dentada')
  await sol.fill('#np-itens .itens-ed-linha:nth-child(1) .it-vu', '210,00')
  await sol.click('#np-item-mais')
  await sol.fill('#np-item-1', 'Tensor da correia')
  await sol.fill('#np-itens .itens-ed-linha:nth-child(2) .it-vu', '180,00')
  await escolherEmpresa(sol, 'Veltora')
  await sol.click('#np-req-wrap')
  await sol.fill('#np-req-fornecedor', forn)
  assert.match(await sol.inputValue('#np-req-valor'), /^R\$\s390,00$/, 'o valor da requisição segue a soma dos itens')
  await sol.click('#btn-abrir-pedido')
  const doc = await esperar(async () => (await banco.collection('pedidos').where('fornecedorNome', '==', forn).get()).docs[0], 'a requisição foi gravada')
  const req = doc.data()
  assert.equal(req.requisicao, true)
  assert.equal(req.status, 'em_aprovacao', 'a requisição pula a cotação')
  assert.deepEqual(req.itens.map(i => i.descricao), ['Correia dentada', 'Tensor da correia'])
  await sol.context().close()

  const apr = await entrar('aprovador@praxis.app')
  await noQuadro(apr)
  await abrirPedido(apr, doc.id, '#btn-aprovar')
  await apr.click('#btn-aprovar')
  await apr.click('#prx-confirm-ok')
  assert.equal(await esperar(async () => (await status(doc.id)) === 'aprovado' && 'aprovado', 'a requisição foi aprovada'), 'aprovado')
  await apr.context().close()

  const volta = await entrar('solicitante@praxis.app')
  await noQuadro(volta)
  await abrirPedido(volta, doc.id, '#btn-registrar-retirada')
  assert.ok(await volta.$('#btn-autorizacao'), 'a autorização em PDF fica à mão para mostrar ao fornecedor')
  await volta.click('#btn-registrar-retirada')
  await volta.waitForSelector('#salvar-retirada')
  await volta.fill('#rt-valor', '389,90')
  await volta.click('#salvar-retirada')
  assert.equal(await esperar(async () => (await status(doc.id)) === 'entregue' && 'entregue', 'a retirada deixa o pedido entregue'), 'entregue')
  const fim = (await banco.doc(`pedidos/${doc.id}`).get()).data()
  assert.equal(fim.valorFinal, 389.9)
  await volta.context().close()
  assert.deepEqual(erros, [])
})

test('fatura do fornecedor: o financeiro paga de uma vez as compras entregues do mesmo fornecedor', async () => {
  const forn = `Elétrica Fatura ${MARCA}`
  const orbix = (await banco.collection('empresas').get()).docs.find(e => /orbix/i.test(e.data().nome))
  assert.ok(orbix?.data().faturaMensal?.ativa, 'a empresa do seed liga a fatura mensal')
  const base = (await banco.collection('pedidos').where('status', '==', 'entregue').get()).docs[0].data()
  const ids = []
  for (const [i, valor] of [489.9, 312].entries()) {
    const ref = banco.collection('pedidos').doc()
    await ref.set({ ...base, empresaId: orbix.id, fornecedorNome: forn, titulo: `Compra ${i + 1} da fatura`, valorFinal: valor, numeroPedido: `PRX-9${i}${MARCA.slice(-2)}` })
    ids.push(ref.id)
  }
  const fin = await entrar('financeiro@praxis.app')
  await noQuadro(fin)
  await abrirPedido(fin, ids[0], '#btn-pagar-fatura')
  await fin.click('#btn-pagar-fatura')
  await fin.waitForSelector('#fat-pagar')
  assert.match(await fin.textContent('#modal-fatura .fat-total'), /2 compras · R\$\s?801,90/)
  await fin.click('#fat-pagar')
  for (const id of ids) assert.equal(await esperar(async () => (await status(id)) === 'pago' && 'pago', `o pedido ${id} ficou pago`), 'pago')
  await fin.context().close()
  assert.deepEqual(erros, [])
})

test('acesso sem e-mail: o gestor cria usuário e senha, e a pessoa troca a senha no primeiro acesso', async () => {
  const login = `teste.${MARCA}`
  const ges = await entrar('gestor@praxis.app')
  await noQuadro(ges)
  await ges.goto(`${BASE}/?tela=config-usuarios`)
  await ges.click('#btn-novo-usuario')
  await ges.fill('#usr-nome', 'Pessoa sem e-mail')
  await ges.check('#usr-sem-email')
  await ges.fill('#usr-email', login)
  await ges.selectOption('#usr-perfil', 'solicitante')
  await ges.check('.emp-check')
  await ges.click('#salvar-usuario')
  await ges.waitForSelector('#prx-alert-ok')
  const aviso = await ges.$eval('#prx-alert-ok', b => { let a = b; while (a.parentElement && !/senha inicial/.test(a.textContent)) a = a.parentElement; return a.textContent })
  const senha = aviso.match(/senha inicial (\S+?)\.\s/)?.[1]
  assert.ok(senha, 'o aviso mostra a senha inicial')
  await ges.click('#prx-alert-ok')
  await ges.context().close()

  const nova = await entrar(login, senha)
  await nova.waitForSelector('#form-senha-nova')
  await nova.fill('#sn-senha', `nova-${MARCA}-senha`)
  await nova.fill('#sn-confirma', `nova-${MARCA}-senha`)
  await nova.click('#sn-salvar')
  // O quadro já está por baixo da janela: espera a janela sair e o banco registrar
  await nova.waitForSelector('#modal-senha-nova', { state: 'detached' })
  await esperar(async () => (await banco.collection('usuarios').where('login', '==', login).get()).docs[0]?.data().trocarSenha === false,
    'a troca fica registrada')
  await nova.context().close()

  const depois = await entrar(login, `nova-${MARCA}-senha`)
  await noQuadro(depois)
  await depois.context().close()
  assert.deepEqual(erros, [])
})

test('sem internet: o pedido fica guardado no aparelho e segue quando a conexão volta', async () => {
  const titulo = `Guardado sem internet ${MARCA}`
  const sol = await entrar('solicitante@praxis.app')
  await noQuadro(sol)
  await abrirFormulario(sol)
  await sol.context().setOffline(true)
  await sol.fill('#np-item-0', titulo)
  await sol.selectOption('#np-empresa', { index: 1 })
  await sol.click('#btn-abrir-pedido')
  await sol.getByText('o pedido ficou guardado neste aparelho').first().waitFor()
  assert.equal((await banco.collection('pedidos').where('titulo', '==', titulo).get()).size, 0, 'nada foi gravado sem internet')
  await sol.context().setOffline(false)
  const doc = await esperar(async () => (await banco.collection('pedidos').where('titulo', '==', titulo).get()).docs[0], 'o pedido guardado foi enviado')
  assert.equal(doc.data().status, 'solicitado')
  await sol.context().close()
  assert.deepEqual(erros, [])
})
