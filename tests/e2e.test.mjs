// Ponta a ponta mínimo: o caminho feliz de um pedido no app de verdade, num
// navegador, contra os emuladores do Firebase. A solicitante abre o pedido, a
// compradora assume, registra uma cotação e a indica, e o aprovador aprova.
//
//   npm run testar-e2e
//
// O teste sobe um servidor estático próprio em localhost (lá o app se liga
// sozinho aos emuladores, ver js/firebase.js) e entrega ao app a configuração
// de exemplo (js/config.example.js), apontada para o projeto de teste dos
// emuladores. As contas são as do seed (scripts/seed-emulator.js).

// As funções passadas a waitForFunction rodam no navegador
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
// Todas as contas do seed usam a mesma senha de teste da conta demo
const SENHA   = CONFIG_EXEMPLO.match(/password:\s*'([^']+)'/)[1]
const TITULO  = `Teste de ponta a ponta ${new Date().toISOString().slice(0, 19)}`

// firebase-admin vem das dependências das Functions, como no seed
const doFunctions = createRequire(join(RAIZ, 'functions', 'package.json'))
process.env.FIRESTORE_EMULATOR_HOST ||= 'localhost:9090'
const { initializeApp } = doFunctions('firebase-admin/app')
const { getFirestore }  = doFunctions('firebase-admin/firestore')
initializeApp({ projectId: PROJETO })
const banco = getFirestore()

// ── Servidor estático ─────────────────────────────────────────
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
    if (caminho === '/js/config.js') {
      // Nunca a configuração real: a de exemplo, no projeto dos emuladores
      corpo = CONFIG_EXEMPLO.replaceAll('praxis-af618', PROJETO)
    } else {
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
  navegador = await chromium.launch()
})
after(async () => {
  await navegador?.close()
  servidor.close()
})

// Cada pessoa num navegador limpo, sem o tour de boas-vindas e sem o service worker
async function entrar(email) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    try { localStorage.setItem('praxis_tour_visto', '1'); sessionStorage.setItem('praxis_tour_mostrado', '1') } catch { /* sem armazenamento */ }
  })
  const pagina = await ctx.newPage()
  pagina.setDefaultTimeout(30000)
  pagina.on('pageerror', e => erros.push(`${email}: ${e.message}`))
  pagina.on('console', m => { if (m.type() === 'error') erros.push(`${email}: ${m.text().slice(0, 200)}`) })
  await pagina.goto(`${BASE}/`)
  await pagina.fill('#input-email', email)
  await pagina.fill('#input-senha', SENHA)
  await pagina.click('#btn-entrar')
  await pagina.waitForSelector('#pedidos-view')
  return pagina
}

async function abrirPedido(pagina, id) {
  await pagina.goto(`${BASE}/?tela=detalhe&id=${id}`)
  await pagina.waitForSelector('.detalhe-acoes, #btn-assumir, #btn-aprovar, #btn-add-cotacao', { state: 'attached' })
}

async function confirmar(pagina) {
  await pagina.click('#prx-confirm-ok')
}

// Espera o pedido chegar à etapa no banco (as gravações saem do navegador)
async function etapa(id, esperada) {
  let atual
  for (let i = 0; i < 60; i++) {
    atual = (await banco.doc(`pedidos/${id}`).get()).data()?.status
    if (atual === esperada) return atual
    await new Promise(r => setTimeout(r, 500))
  }
  return atual
}

const daqui = dias => new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10)

test('caminho feliz: do pedido aberto à aprovação, cada etapa com o seu perfil', async () => {
  // 1. A solicitante abre o pedido
  const sol = await entrar('solicitante@praxis.app')
  // O formulário usa as empresas e categorias do banco: espera o quadro
  // terminar de carregar antes de abrir
  await sol.waitForFunction(() => !document.querySelector('#pedidos-view .skeleton'))
  await sol.click('#btn-novo-pedido')
  await sol.waitForFunction(() => document.querySelectorAll('#np-empresa option').length > 1 &&
    document.querySelectorAll('#np-categorias .chip').length > 0)
  await sol.fill('#np-titulo', TITULO)
  await sol.selectOption('#np-empresa', { index: 1 })
  await sol.fill('#np-quantidade', '2')
  await sol.selectOption('#np-unidade', { index: 1 })
  await sol.fill('#np-data', daqui(20))
  await sol.fill('#np-valor', '450,00')
  await sol.click('#np-categorias .chip')
  await sol.click('#btn-abrir-pedido')
  await sol.getByText('Pedido aberto.').first().waitFor()

  let id
  for (let i = 0; i < 60 && !id; i++) {
    const s = await banco.collection('pedidos').where('titulo', '==', TITULO).get()
    id = s.docs[0]?.id
    if (!id) await new Promise(r => setTimeout(r, 500))
  }
  assert.ok(id, 'o pedido foi gravado')
  const aberto = (await banco.doc(`pedidos/${id}`).get()).data()
  assert.equal(aberto.status, 'solicitado')
  assert.match(aberto.numeroPedido, /^PRX-\d{4}$/)
  assert.equal(aberto.urgente, false)
  await sol.context().close()

  // 2. A compradora assume, registra uma cotação e a indica
  const com = await entrar('comprador@praxis.app')
  await abrirPedido(com, id)
  await com.click('#btn-assumir')
  await confirmar(com)
  assert.equal(await etapa(id, 'ag_cotacao'), 'ag_cotacao')

  await com.waitForSelector('#btn-add-cotacao')
  await com.click('#btn-add-cotacao')
  await com.fill('#cot-forn', 'Papelaria Ponta a Ponta')
  await com.fill('#cot-valor', '430,00')
  await com.fill('#cot-prazo', '5 dias')
  await com.click('#salvar-cotacao')
  await com.waitForSelector('[data-indicar]')
  await com.click('[data-indicar]')
  await confirmar(com)
  assert.equal(await etapa(id, 'em_aprovacao'), 'em_aprovacao')
  const emAprovacao = (await banco.doc(`pedidos/${id}`).get()).data()
  assert.ok(emAprovacao.cotacaoIndicadaId, 'o pedido aponta a cotação indicada')
  await com.context().close()

  // 3. O aprovador aprova
  const apr = await entrar('aprovador@praxis.app')
  await abrirPedido(apr, id)
  await apr.click('#btn-aprovar')
  await confirmar(apr)
  assert.equal(await etapa(id, 'aprovado'), 'aprovado')
  const aprovado = (await banco.doc(`pedidos/${id}`).get()).data()
  assert.ok(aprovado.aprovadoPor && aprovado.aprovadoPor !== aprovado.solicitanteId && aprovado.aprovadoPor !== aprovado.compradorId,
    'quem aprovou não abriu nem cotou o pedido')

  // A tela mostra a etapa nova, e nenhum erro escapou no navegador
  await apr.waitForFunction(() => /Aprovado/.test(document.body.innerText))
  await apr.context().close()

  // A abertura não entra no histórico (a linha do tempo usa criadoEm); cada
  // passo depois dela, sim
  const etapas = (await banco.collection(`pedidos/${id}/historico`).get()).docs.map(d => d.data().status).filter(Boolean)
  for (const st of ['ag_cotacao', 'em_aprovacao', 'aprovado']) {
    assert.ok(etapas.includes(st), `o histórico registra a etapa ${st}`)
  }
  assert.deepEqual(erros, [])
})
