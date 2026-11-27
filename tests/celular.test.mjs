// Celular no CI: as telas principais de cada perfil a 360 e 390 px, com toque,
// contra os emuladores. Em cada tela: nenhuma rolagem lateral, nenhum toque
// abaixo de 44 px, nenhum controle sem nome acessível, nenhum campo com texto
// abaixo de 16 px (o iPhone dá zoom), nenhum texto abaixo do contraste AA e
// nenhum erro de console. Também confere o app aberto sem internet: o service
// worker guarda a versão inteira e a cópia local do Firestore mostra o quadro.
//
//   npm run testar-e2e   (roda junto com o ponta a ponta)
//
// O servidor atende em praxis.localhost: é local (o app liga aos emuladores) e o
// service worker registra (em "localhost" o app não registra, para não atrapalhar
// quem desenvolve). As contas são as do seed (scripts/seed-emulator.js).

/* global document, getComputedStyle, caches, window, PointerEvent */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

// axe-core (WCAG 2.2 A e AA), injetado em cada tela
const AXE = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

const RAIZ    = resolve(fileURLToPath(new URL('..', import.meta.url)))
const PROJETO = process.env.GCLOUD_PROJECT || 'demo-praxis-e2e'
const CONFIG_EXEMPLO = await readFile(join(RAIZ, 'js', 'config.example.js'), 'utf8')
const SENHA   = CONFIG_EXEMPLO.match(/password:\s*'([^']+)'/)[1]

// A mesma CSP da produção (firebase.json), com os emuladores liberados e sem
// o upgrade-insecure-requests (o teste é em http): um estilo ou script
// bloqueado aparece como erro de console e derruba o teste
const FIREBASE_JSON = JSON.parse(await readFile(join(RAIZ, 'firebase.json'), 'utf8'))
const CSP = FIREBASE_JSON.hosting.headers.find(h => h.source === '**').headers.find(h => h.key === 'Content-Security-Policy').value
  .replace('connect-src ', 'connect-src http://localhost:9099 http://localhost:9090 http://localhost:9199 ')
  .replace(/;\s*upgrade-insecure-requests/, '')

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
const servidor = createServer(async (req, res) => {
  const caminho = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  try {
    let corpo
    if (caminho === '/js/config.js') corpo = CONFIG_EXEMPLO.replaceAll('praxis-af618', PROJETO)
    // O axe entra pelo próprio servidor: a CSP só aceita script do site
    else if (caminho === '/__axe.js') corpo = AXE
    else {
      const arquivo = resolve(RAIZ, '.' + (caminho.endsWith('/') ? `${caminho}index.html` : caminho))
      if (!arquivo.startsWith(RAIZ + sep)) throw new Error('fora da raiz')
      corpo = await readFile(arquivo)
    }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || TIPOS['.html'], 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP })
    res.end(corpo)
  } catch {
    res.writeHead(404)
    res.end()
  }
})

let navegador, BASE
const espera = ms => new Promise(ok => setTimeout(ok, ms))

before(async () => {
  await new Promise(ok => servidor.listen(0, '127.0.0.1', ok))
  BASE = `http://praxis.localhost:${servidor.address().port}`
  navegador = await chromium.launch(process.env.PW_CANAL ? { channel: process.env.PW_CANAL } : {})
})
after(async () => {
  await navegador?.close()
  servidor.close()
})

async function contexto(largura, { sw = false } = {}) {
  const ctx = await navegador.newContext({
    viewport: { width: largura, height: largura === 360 ? 740 : 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'pt-BR', serviceWorkers: sw ? 'allow' : 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  await ctx.addInitScript(() => { try { localStorage.setItem('praxis_tour_visto', '1'); sessionStorage.setItem('praxis_tour_mostrado', '1') } catch { /* sem armazenamento */ } })
  const p = await ctx.newPage()
  p.erros = []
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|net::ERR/.test(m.text())) p.erros.push(m.text()) })
  // Violação da CSP (estilo, script, conexão): conta como erro
  p.on('console', m => { if (/Content Security Policy/i.test(m.text()) && m.type() !== 'error') p.erros.push(m.text()) })
  p.on('pageerror', e => p.erros.push(String(e)))
  return p
}
async function entrar(p, email) {
  await p.goto(`${BASE}/`)
  await p.fill('#input-email', email)
  await p.fill('#input-senha', SENHA)
  await p.tap('#btn-entrar')
  await p.waitForSelector('.main-layout', { timeout: 30000 })
  await espera(900)
}

// Medição no navegador (a mesma régua da avaliação completa)
function medir() {
  const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight
  const vis = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !el.closest('[hidden], [aria-hidden="true"], [inert]') }
  const naTela = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= H && r.right <= W }
  const desc = el => { const r = el.getBoundingClientRect(); const nome = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 32); return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList[0] ? '.' + el.classList[0] : ''} "${nome}" ${Math.round(r.width)}x${Math.round(r.height)}` }
  const extra = el => { const ps = getComputedStyle(el, '::after'); if (ps.content === 'none' || ps.position !== 'absolute' || getComputedStyle(el).position === 'static') return 0; const t = parseFloat(ps.top), b = parseFloat(ps.bottom); return Number.isFinite(t) && Number.isFinite(b) ? Math.max(0, -t - b) : 0 }
  const inter = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=radio], [role=checkbox], [role=switch], [role=option], summary')].filter(vis)
  const alvos = inter.filter(el => !el.closest('.sr-only') && el.type !== 'checkbox' && el.type !== 'radio' && !el.classList.contains('link-salto') && !el.classList.contains('campo-data-nativo'))
  const abaixo44 = alvos.filter(el => el.getBoundingClientRect().height + extra(el) < 44 || el.getBoundingClientRect().width < 24)
  const nomeAcessivel = el => {
    if (el.getAttribute('aria-label')?.trim()) return true
    const lb = el.getAttribute('aria-labelledby'); if (lb && lb.split(' ').some(id => document.getElementById(id)?.textContent.trim())) return true
    if (el.labels?.length && [...el.labels].some(l => l.textContent.trim())) return true
    if (el.title?.trim() || el.getAttribute('placeholder')?.trim()) return true
    return !!(el.textContent || el.value || '').trim() || !!el.querySelector('img[alt]:not([alt=""])')
  }
  const semNome = inter.filter(el => !el.closest('.sr-only') && !nomeAcessivel(el))
  const campos = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')].filter(vis).filter(el => parseFloat(getComputedStyle(el).fontSize) < 16)
  const folhas = [...document.querySelectorAll('body *')].filter(el => el.childElementCount === 0 && el.textContent.trim() && vis(el))
  const rgb = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 } }
  const lum = c => { const f = x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const fundo = el => {
    const camadas = []
    for (let a = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null
      const c = rgb(cs.backgroundColor)
      if (c && c.a > 0) { camadas.push(c); if (c.a >= 0.99) break }
    }
    let base = { r: 255, g: 255, b: 255 }
    for (const c of camadas.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }
    return base
  }
  const contraste = []
  for (const el of folhas) {
    if (!naTela(el) || el.closest('[disabled], [aria-disabled="true"], .sr-only')) continue
    const cs = getComputedStyle(el), c = rgb(cs.color), bg = fundo(el)
    if (!c || !bg || parseFloat(cs.opacity) < 1) continue
    const cor = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) }
    const L1 = lum(cor), L2 = lum(bg), razao = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const tam = parseFloat(cs.fontSize), grande = tam >= 24 || (tam >= 18.66 && parseInt(cs.fontWeight) >= 700)
    if (razao < (grande ? 3 : 4.5)) contraste.push(`${desc(el)} ${Math.round(razao * 100) / 100}:1`)
  }
  return {
    rolagemLateral: document.documentElement.scrollWidth > W,
    abaixo44: abaixo44.map(desc), semNome: semNome.map(desc), camposPequenos: campos.map(desc), contraste,
  }
}

async function conferir(p, nome, problemas) {
  await espera(450)
  const m = await p.evaluate(medir)
  const largura = p.viewportSize().width
  const achados = [
    m.rolagemLateral && 'rolagem lateral',
    m.abaixo44.length && `toques < 44 px: ${m.abaixo44.join(' · ')}`,
    m.semNome.length && `sem nome acessível: ${m.semNome.join(' · ')}`,
    m.camposPequenos.length && `campos < 16 px: ${m.camposPequenos.join(' · ')}`,
    m.contraste.length && `contraste abaixo de AA: ${m.contraste.slice(0, 4).join(' · ')}`,
  ].filter(Boolean)
  for (const a of achados) problemas.push(`${largura} ${nome}: ${a}`)
  // axe-core: o padrão de mercado de auditoria automática
  if (!(await p.evaluate(() => !!globalThis.axe))) await p.addScriptTag({ url: '/__axe.js' })
  const violacoes = await p.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] })
    return r.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)
  })
  for (const v of violacoes) problemas.push(`${largura} ${nome}: axe ${v}`)
}
async function janela(p, nome, abrir, problemas) {
  await abrir()
  await espera(650)
  await conferir(p, nome, problemas)
  await p.goBack().catch(() => null)
  await espera(500)
}

for (const largura of [390, 360]) {
  test(`celular ${largura} px: telas principais de cada perfil`, { timeout: 240000 }, async () => {
    const problemas = []
    const erros = []

    // Entrada
    let p = await contexto(largura)
    await p.goto(`${BASE}/`); await p.waitForSelector('#input-email'); await espera(600)
    await conferir(p, 'entrada', problemas)
    await p.tap('#link-forgot'); await p.waitForSelector('#view-forgot.active'); await conferir(p, 'esqueci a senha', problemas)
    erros.push(...p.erros); await p.context().close()

    // Solicitante
    p = await contexto(largura)
    await entrar(p, 'solicitante@praxis.app')
    await conferir(p, 'quadro', problemas)
    await p.tap('#btn-lista'); await espera(700); await conferir(p, 'lista', problemas)
    await p.tap('#btn-kanban'); await espera(400)
    await janela(p, 'filtros', () => p.tap('#btn-filtros'), problemas)
    await p.tap('#bottom-nav [data-bnav="fila"]'); await espera(900); await conferir(p, 'minha fila', problemas)
    await p.tap('#bottom-nav [data-bnav="pedidos"]'); await espera(600)
    await janela(p, 'novo pedido', async () => {
      await p.tap('#bnav-novo'); await p.waitForSelector('.dialog-opcao-rica'); await espera(250)
      await (await p.$$('.dialog-opcao-rica'))[0].tap(); await p.waitForSelector('#modal-novo-pedido.visible')
    }, problemas)
    await janela(p, 'compra já feita', async () => {
      await p.tap('#bnav-novo'); await p.waitForSelector('.dialog-opcao-rica'); await espera(250)
      await (await p.$$('.dialog-opcao-rica'))[1].tap(); await p.waitForSelector('#modal-lancamento.visible')
    }, problemas)
    await janela(p, 'conta', () => p.tap('#bnav-conta'), problemas)
    await janela(p, 'avisos', () => p.tap('#btn-notif'), problemas)
    await janela(p, 'busca', () => p.tap('#bnav-buscar'), problemas)
    erros.push(...p.erros); await p.context().close()

    // Compradora: detalhe em cotação e a janela da cotação
    p = await contexto(largura)
    await entrar(p, 'comprador@praxis.app')
    await p.tap('#bottom-nav [data-bnav="fila"]'); await espera(900)
    const card = await p.$('.kcard')
    if (card) {
      await card.tap(); await p.waitForSelector('.detalhe-titulo'); await espera(900)
      await conferir(p, 'detalhe (compradora)', problemas)
      if (await p.$('#btn-add-cotacao')) await janela(p, 'cotação', async () => { await p.tap('#btn-add-cotacao'); await p.waitForSelector('#modal-cotacao.visible') }, problemas)
    }
    erros.push(...p.erros); await p.context().close()

    // Financeiro: relatórios
    p = await contexto(largura)
    await entrar(p, 'financeiro@praxis.app')
    await p.goto(`${BASE}/?tela=relatorios`); await p.waitForSelector('.rel-dash[data-pronto="1"]', { timeout: 30000 }); await espera(800)
    await conferir(p, 'relatórios', problemas)
    erros.push(...p.erros); await p.context().close()

    // Gestora: administração
    p = await contexto(largura)
    await entrar(p, 'gestor@praxis.app')
    for (const tela of ['config-cadastros&aba=empresas', 'config-usuarios', 'config-alcadas', 'config-geral']) {
      await p.goto(`${BASE}/?tela=${tela}`); await p.waitForSelector('.main-layout'); await espera(1100)
      await conferir(p, tela, problemas)
    }
    erros.push(...p.erros); await p.context().close()

    assert.deepEqual(problemas, [], problemas.join('\n'))
    assert.deepEqual(erros, [], `erros de console:\n${erros.join('\n')}`)
  })
}

// Estilo novo (27/11): o título grande passa para a faixa ao rolar, o pedido
// aberto pela fila volta com "‹ Minha fila" e a folha fecha arrastando o alto
test('celular: título que encolhe, "‹ Minha fila" e a folha que fecha arrastando', { timeout: 120000 }, async () => {
  const p = await contexto(390)
  await entrar(p, 'comprador@praxis.app')
  await p.goto(`${BASE}/?tela=pedidos&filtro=pendentes`); await p.waitForSelector('.kcard', { timeout: 20000 })
  await p.evaluate(() => window.scrollTo(0, 500)); await espera(400)
  assert.ok(await p.evaluate(() => document.documentElement.classList.contains('titulo-fora')), 'o título não passou para a faixa')
  assert.equal((await p.textContent('.lateral-titulo')).trim(), 'Minha fila')
  await p.evaluate(() => window.scrollTo(0, 0)); await espera(400)
  await (await p.$$('.kcard'))[0].tap(); await p.waitForSelector('.detalhe-voltar'); await espera(600)
  assert.equal((await p.textContent('.detalhe-voltar')).trim(), 'Minha fila')
  assert.equal(await p.evaluate(() => window.scrollY), 0, 'o pedido não abriu no topo')
  // A barra do "‹" fica presa no alto ao rolar o pedido
  await p.evaluate(() => window.scrollTo(0, 300)); await espera(300)
  assert.ok(Math.abs(await p.evaluate(() => document.querySelector('.detalhe-head-linha').getBoundingClientRect().top)) < 2, 'a barra do pedido não ficou presa no alto')
  await p.tap('.detalhe-voltar'); await p.waitForSelector('#pedidos-view'); await espera(500)
  assert.ok(p.url().includes('filtro=pendentes'), `não voltou para a fila: ${p.url()}`)

  await p.tap('#bnav-novo'); await p.waitForSelector('.dialog-opcao-rica'); await espera(300)
  await (await p.$$('.dialog-opcao-rica'))[0].tap(); await p.waitForSelector('#modal-novo-pedido.visible'); await espera(500)
  const arrastar = dist => p.evaluate(async d => {
    const cab = document.querySelector('#modal-novo-pedido .modal-header')
    const r = cab.getBoundingClientRect(), x = r.left + 60, y = r.top + 12
    const ev = (tipo, yy) => cab.dispatchEvent(new PointerEvent(tipo, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: yy, bubbles: true }))
    ev('pointerdown', y)
    for (let k = 1; k <= 10; k++) { ev('pointermove', y + d * k / 10); await new Promise(ok => setTimeout(ok, 40)) }
    ev('pointerup', y + d)
  }, dist)
  await arrastar(60); await espera(500)
  assert.ok(await p.$('#modal-novo-pedido.visible'), 'o arrasto curto fechou a folha')
  await arrastar(260); await espera(700)
  assert.equal(await p.$('#modal-novo-pedido.visible'), null, 'o arrasto longo não fechou a folha')
  assert.deepEqual(p.erros, [])
  await p.context().close()
})

test('sem internet: o app abre com o quadro da última visita', { timeout: 120000 }, async () => {
  const p = await contexto(390, { sw: true })
  await entrar(p, 'comprador@praxis.app')
  await p.waitForSelector('.kcard', { timeout: 20000 })
  // O service worker guarda a versão inteira antes de assumir
  await p.evaluate(() => navigator.serviceWorker.ready)
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 })
  const guardados = await p.evaluate(async () => (await Promise.all((await caches.keys()).map(async n => (await (await caches.open(n)).keys()).length))).reduce((a, b) => a + b, 0))
  assert.ok(guardados > 40, `o service worker guardou só ${guardados} arquivos`)
  await espera(1500)
  const ctx = p.context()
  await ctx.setOffline(true)
  const q = await ctx.newPage()
  await q.goto(`${BASE}/`)
  await q.waitForSelector('.kcard', { timeout: 20000 })
  assert.ok(await q.locator('.kcard').count() > 0, 'quadro vazio sem internet')
  await ctx.setOffline(false)
  await ctx.close()
})

test('a entrada escrita no index.html é a mesma que o app desenha (npm run gerar-entrada)', { timeout: 120000 }, async () => {
  const { entradaDesenhada, trechoDoIndex } = await import('../scripts/gerar-entrada.mjs')
  const index = await readFile(join(RAIZ, 'index.html'), 'utf8')
  assert.ok(index.replace(/\r\n/g, '\n').includes(trechoDoIndex(await entradaDesenhada()).replace(/\r\n/g, '\n')),
    'a entrada do index.html está velha: rode npm run gerar-entrada')
})
