// Desempenho medido de verdade, no celular simulado (390 × 844, toque), com o
// perfil "4G lento" do Lighthouse (150 ms de ida e volta, 1,6 Mbit/s de descida,
// 750 kbit/s de subida) e a CPU 4 vezes mais lenta. Contra os emuladores.
//
// O servidor local imita o Firebase Hosting: compressão brotli, ETag com 304 e o
// mesmo Cache-Control do firebase.json. Ele atende em praxis.localhost, para o
// service worker registrar (o app não registra em "localhost"). A cópia servida
// de js/firebase.js ganha só duas coisas: liga aos emuladores também em
// *.localhost e conta os documentos que o servidor entrega ao app (snapshots que
// não vêm da cópia local), que é a aproximação das leituras cobradas.
//
// Cenários (cada rodada num perfil novo do navegador):
//   1. Primeira visita: até o formulário de entrada; FCP, LCP, bytes, pedidos.
//   2. Entrar (comprador): do toque em "Entrar" até o primeiro cartão do quadro.
//   3. Volta ao app já com a sessão: abrir de novo até o primeiro cartão;
//      pedidos à rede e documentos lidos.
//   4. Sem internet: abrir o app de novo, desligado, até o primeiro cartão.
// Rodar com os emuladores (o firebase-admin vem das Functions, como no seed):
//   npx firebase emulators:exec --only auth,firestore,storage --project demo-praxis-e2e "node scripts/seed-emulator.js && node scripts/medir-desempenho.mjs"
//   SAIDA=./_build/desempenho  RODADAS=3  DIAG=1 (linha do tempo da volta ao app)
/* global document, window, MutationObserver */
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { brotliCompressSync, constants as zc } from 'node:zlib'
import { extname, join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'

const RAIZ = resolve('.')
const SAIDA = resolve(process.env.SAIDA || './_build/desempenho')
const RODADAS = Number(process.env.RODADAS || 3)
const PROJETO = process.env.GCLOUD_PROJECT || 'demo-praxis-e2e'
const { chromium } = createRequire(join(RAIZ, 'package.json'))('playwright')
const CONFIG_EXEMPLO = await readFile(join(RAIZ, 'js', 'config.example.js'), 'utf8')
const SENHA = CONFIG_EXEMPLO.match(/password:\s*'([^']+)'/)[1]

const CONTADOR = `
const __l = globalThis.__leituras ||= { docs: 0, consultas: 0 }
const __docsDe = s => s && typeof s.docChanges === 'function' ? s.docChanges().length : (s && typeof s.exists === 'function' ? 1 : 0)
const __getDocs = async (...a) => { const s = await getDocs(...a); if (!s.metadata.fromCache) { __l.docs += s.size; __l.consultas++ } return s }
const __getDoc = async (...a) => { const s = await getDoc(...a); if (!s.metadata.fromCache) { __l.docs += 1; __l.consultas++ } return s }
const __onSnapshot = (ref, ...resto) => {
  (globalThis.__marcas ||= []).push(['sub', Math.round(performance.now())])
  const i = resto.findIndex(x => typeof x === 'function')
  if (i >= 0) { const f = resto[i]; resto[i] = s => { (globalThis.__marcas ||= []).push(['snap', Math.round(performance.now()), s.metadata.fromCache, s.size ?? 1]); if (!s.metadata.fromCache) { __l.docs += __docsDe(s); __l.consultas++ } return f(s) } }
  return onSnapshot(ref, ...resto)
}
`
function servirFirebase(texto) {
  let t = texto.replace("(location.hostname === 'localhost' || location.hostname === '127.0.0.1')",
    "(location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.localhost'))")
  if (process.env.DIAG) t = t.replace('const local = await getDocsFromCache(consultaOuRef)', "(globalThis.__marcas ||= []).push(['cacheIni', Math.round(performance.now())]); const local = await getDocsFromCache(consultaOuRef); globalThis.__marcas.push(['cacheFim', Math.round(performance.now()), local.size])")
  const i = t.lastIndexOf('export {')
  let exp = t.slice(i)
  // getDocFromServer não conta: antes do código novo o perfil vinha por ele direto do gstatic
  exp = exp.replace(/\bgetDoc,/, '__getDoc as getDoc,').replace(/\bgetDocs,/, '__getDocs as getDocs,').replace('onSnapshot,', '__onSnapshot as onSnapshot,')
  return t.slice(0, i) + CONTADOR + exp
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }
const COMPRIMIR = new Set(['.html', '.js', '.css', '.json', '.svg'])
const cacheCorpo = new Map()
const servidor = createServer(async (rq, res) => {
  const caminho = decodeURIComponent(new URL(rq.url, 'http://localhost').pathname)
  try {
    const ext = extname(caminho) || '.html'
    let corpo
    if (caminho === '/js/config.js') corpo = Buffer.from(CONFIG_EXEMPLO.replaceAll('praxis-af618', PROJETO))
    else {
      const arquivo = resolve(RAIZ, '.' + (caminho.endsWith('/') ? `${caminho}index.html` : caminho))
      if (!arquivo.startsWith(RAIZ + sep)) throw new Error('fora')
      corpo = await readFile(arquivo)
      if (caminho === '/js/firebase.js') corpo = Buffer.from(servirFirebase(corpo.toString('utf8')))
    }
    const etag = '"' + createHash('sha1').update(corpo).digest('hex') + '"'
    const cab = { 'Content-Type': TIPOS[ext] || TIPOS['.html'], ETag: etag, Vary: 'Accept-Encoding' }
    // Mesmo Cache-Control do firebase.json
    cab['Cache-Control'] = /\.(css|woff2)$/.test(caminho) ? 'public, max-age=31536000' : (/\.(js|mjs|html)$/.test(caminho) || caminho === '/' ? 'no-cache' : 'public, max-age=3600')
    if (caminho === '/service-worker.js') cab['Cache-Control'] = 'no-cache'
    if (rq.headers['if-none-match'] === etag) { res.writeHead(304, cab); res.end(); return }
    if (COMPRIMIR.has(ext) && /\bbr\b/.test(rq.headers['accept-encoding'] || '')) {
      const chave = caminho + etag
      if (!cacheCorpo.has(chave)) cacheCorpo.set(chave, brotliCompressSync(corpo, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } }))
      corpo = cacheCorpo.get(chave)
      cab['Content-Encoding'] = 'br'
    }
    cab['Content-Length'] = corpo.length
    res.writeHead(200, cab)
    res.end(corpo)
  } catch { res.writeHead(404); res.end() }
})
const espera = ms => new Promise(r => setTimeout(r, ms))
await mkdir(SAIDA, { recursive: true })
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://praxis.localhost:${servidor.address().port}`
const navegador = await chromium.launch({ channel: 'chrome' })

const REDE = { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }
async function pagina(ctx) {
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', REDE)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const reg = { pedidos: 0, rede: 0, bytes: 0, porTipo: {}, linha: [] }
  const t0 = Date.now()
  cdp.on('Network.requestWillBeSent', e => { reg.linha.push({ t: Date.now() - t0, url: e.request.url.split("?")[0].slice(0, 110) }) })
  cdp.on('Network.responseReceived', e => {
    reg.pedidos++
    const r = e.response
    if (!r.fromServiceWorker && !r.fromDiskCache && !r.fromPrefetchCache) reg.rede++
  })
  cdp.on('Network.loadingFinished', e => { reg.bytes += e.encodedDataLength })
  p.reg = reg
  return p
}
async function marcas(p) {
  return p.evaluate(() => new Promise(ok => {
    const r = {}
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    r.fcp = fcp ? Math.round(fcp.startTime) : null
    try {
      new PerformanceObserver(l => { const e = l.getEntries(); r.lcp = Math.round(e[e.length - 1].startTime) }).observe({ type: 'largest-contentful-paint', buffered: true })
    } catch {}
    setTimeout(() => ok(r), 50)
  }))
}
const leituras = p => p.evaluate(() => ({ ...(window.__leituras || { docs: 0, consultas: 0 }) }))

const resultados = []
for (let i = 0; i < RODADAS; i++) {
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR',
    serviceWorkers: 'allow',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  })
  await ctx.addInitScript(() => { try { localStorage.setItem('praxis_tour_visto', '1'); sessionStorage.setItem('praxis_tour_mostrado', '1') } catch {}
    const m = (globalThis.__marcas ||= []); const vistos = new Set()
    new MutationObserver(() => { for (const sel of ['.main-layout', '.kanban-cards', '.kcard', '#input-email']) if (!vistos.has(sel) && document.querySelector(sel)) { vistos.add(sel); m.push([sel, Math.round(performance.now())]) } }).observe(document, { childList: true, subtree: true })
  })
  const r = { rodada: i + 1 }

  // 1. Primeira visita
  let p = await pagina(ctx)
  let t0 = Date.now()
  await p.goto(`${BASE}/`, { waitUntil: 'commit' })
  await p.waitForSelector('#input-email', { state: 'visible', timeout: 120000 })
  // A entrada vem escrita no HTML: o campo existe antes de ser pintado. Vale a
  // maior pintura (LCP), lida depois do load
  await p.waitForLoadState('load').catch(() => {})
  Object.assign(r, await marcas(p))
  r.primeiraEntradaMs = r.lcp ?? (Date.now() - t0)
  await p.waitForLoadState('networkidle').catch(() => {})
  r.primeiraPedidos = p.reg.pedidos; r.primeiraBytes = p.reg.bytes

  // 2. Entrar até o primeiro cartão
  await p.fill('#input-email', 'comprador@praxis.app')
  await p.fill('#input-senha', SENHA)
  const nLinha = p.reg.linha.length
  t0 = Date.now()
  await p.tap('#btn-entrar')
  await p.waitForSelector('.kcard', { state: 'visible', timeout: 120000 })
  r.entrarAteQuadroMs = Date.now() - t0
  if (process.env.DIAG) { const base = p.reg.linha[nLinha]?.t || 0; r.linhaEntrar = p.reg.linha.slice(nLinha).map(l => ({ t: l.t - base, url: l.url })) }
  await espera(2500)
  const l1 = await leituras(p)
  r.docsAoEntrar = l1.docs; r.consultasAoEntrar = l1.consultas
  r.cartoes = await p.locator('.kcard').count()
  // Deixa o service worker instalar e guardar o que precisa
  await p.evaluate(() => navigator.serviceWorker?.ready.then(() => true)).catch(() => {})
  await espera(4000)
  await p.close()

  // 3. Volta ao app, com a sessão guardada
  p = await pagina(ctx)
  t0 = Date.now()
  await p.goto(`${BASE}/`, { waitUntil: 'commit' })
  await p.waitForSelector('.kcard', { state: 'visible', timeout: 120000 })
  r.voltaAteQuadroMs = Date.now() - t0
  const m2 = await marcas(p)
  r.voltaFcp = m2.fcp
  await espera(2500)
  const l2 = await leituras(p)
  r.voltaDocs = l2.docs; r.voltaPedidos = p.reg.pedidos; r.voltaRede = p.reg.rede; r.voltaBytes = p.reg.bytes
  r.swControla = await p.evaluate(() => !!navigator.serviceWorker?.controller)
  if (process.env.DIAG) { r.linhaVolta = p.reg.linha; r.marcasVolta = await p.evaluate(() => globalThis.__marcas) }
  await p.close()

  // 4. Sem internet
  await ctx.setOffline(true)
  p = await ctx.newPage()
  t0 = Date.now()
  try {
    await p.goto(`${BASE}/`, { waitUntil: 'commit', timeout: 20000 })
    await p.waitForSelector('.kcard', { state: 'visible', timeout: 20000 })
    r.offlineAteQuadroMs = Date.now() - t0
    r.offline = 'abre'
  } catch (e) {
    r.offline = 'não abre: ' + String(e.message || e).split('\n')[0].slice(0, 120)
    await p.screenshot({ path: join(SAIDA, `offline-${i + 1}.png`) }).catch(() => {})
  }
  await ctx.setOffline(false)
  await p.close()
  await ctx.close()
  console.log(JSON.stringify(r))
  resultados.push(r)
}

const mediana = k => { const v = resultados.map(r => r[k]).filter(x => typeof x === 'number').sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
const chaves = ['primeiraEntradaMs', 'fcp', 'lcp', 'primeiraPedidos', 'primeiraBytes', 'entrarAteQuadroMs', 'docsAoEntrar', 'consultasAoEntrar', 'cartoes', 'voltaAteQuadroMs', 'voltaFcp', 'voltaDocs', 'voltaPedidos', 'voltaRede', 'voltaBytes', 'offlineAteQuadroMs']
const resumo = Object.fromEntries(chaves.map(k => [k, mediana(k)]))
resumo.offline = resultados.map(r => r.offline)
resumo.swControla = resultados.map(r => r.swControla)
console.log('MEDIANAS', JSON.stringify(resumo, null, 1))
await writeFile(join(SAIDA, 'desempenho.json'), JSON.stringify({ rede: '4G lento (150 ms, 1,6 Mbit/s), CPU 4x', resultados, resumo }, null, 1))
await navegador.close()
servidor.close()
