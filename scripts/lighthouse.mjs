// Lighthouse (celular, a configuração padrão: 4G lento simulado e CPU 4x) na
// página de entrada, servida como no Firebase Hosting: brotli, ETag e os
// cabeçalhos do firebase.json (CSP inclusive). Só a entrada: o resto pede conta.
//   npm run lighthouse            (imprime as quatro notas e as métricas)
//   SAIDA=./_build/lighthouse     (grava também o relatório em HTML)
//   LIMITE=90                     (sai com erro se alguma das quatro notas ficar abaixo; o CI usa)
//   RODADAS=3                     (vale a rodada da mediana de desempenho; o CI usa)
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { brotliCompressSync } from 'node:zlib'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'

const RAIZ = resolve(process.env.RAIZ || fileURLToPath(new URL('..', import.meta.url)))
const CONFIG_EXEMPLO = await readFile(join(RAIZ, 'js', 'config.example.js'), 'utf8')
const fb = JSON.parse(await readFile(join(RAIZ, 'firebase.json'), 'utf8'))
const CABECALHOS = Object.fromEntries(fb.hosting.headers.find(h => h.source === '**').headers.map(h => [h.key, h.value]))
// http local: sem o upgrade-insecure-requests
CABECALHOS['Content-Security-Policy'] = CABECALHOS['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '')
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' }
const servidor = createServer(async (rq, res) => {
  const caminho = decodeURIComponent(new URL(rq.url, 'http://localhost').pathname)
  try {
    let corpo
    if (caminho === '/js/config.js') corpo = Buffer.from(CONFIG_EXEMPLO)
    else {
      const arquivo = resolve(RAIZ, '.' + (caminho.endsWith('/') ? `${caminho}index.html` : caminho))
      if (!arquivo.startsWith(RAIZ + sep)) throw new Error('fora')
      corpo = await readFile(arquivo)
    }
    const ext = extname(caminho) || '.html'
    const cab = { ...CABECALHOS, 'Content-Type': TIPOS[ext] || TIPOS['.html'], ETag: '"' + createHash('sha1').update(corpo).digest('hex') + '"' }
    cab['Cache-Control'] = /\.(css|woff2)$/.test(caminho) ? 'public, max-age=31536000' : 'no-cache'
    if (/\.(html|js|css|json|svg|xml|txt)$|\/$/.test(caminho) && /\bbr\b/.test(rq.headers['accept-encoding'] || '')) { corpo = brotliCompressSync(corpo); cab['Content-Encoding'] = 'br' }
    cab['Content-Length'] = corpo.length
    if (process.env.SEM_CAB) for (const k of Object.keys(CABECALHOS)) delete cab[k]
    res.writeHead(200, cab); res.end(corpo)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => servidor.listen(0, '127.0.0.1', r))
const url = process.env.URL || `http://127.0.0.1:${servidor.address().port}/`
const NO_CI = Boolean(process.env.GITHUB_ACTIONS)
// No GitHub, o Ubuntu 24 barra o sandbox do Chrome fora de um usuário com privilégio
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', ...(NO_CI ? ['--no-sandbox'] : [])] })
// No GitHub, a mensagem vira anotação do trabalho (a API pública mostra; o log pede login)
const anotar = (tipo, texto) => { if (NO_CI) console.log(`::${tipo} title=Lighthouse::${texto.replace(/\n/g, ' ')}`) }
try {
  // RODADAS=3: vale a rodada da mediana de desempenho (como o Lighthouse CI
  // recomenda: a máquina do CI varia de uma rodada para outra)
  const rodadas = Math.max(1, Number(process.env.RODADAS || 1))
  const resultados = []
  for (let i = 0; i < rodadas; i++) {
    // O rastreamento às vezes falha no Windows (NO_NAVSTART): tenta de novo
    let r
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      r = await lighthouse(url, { port: chrome.port, output: 'html', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] })
      if (r.lhr.runtimeError?.code !== 'NO_NAVSTART') break
    }
    if (r.lhr.runtimeError) { console.log('ERRO', r.lhr.runtimeError.code, r.lhr.runtimeError.message); anotar('warning', `rodada ${i + 1}: ${r.lhr.runtimeError.code}`) }
    resultados.push(r)
    if (rodadas > 1) console.log(`rodada ${i + 1}: desempenho ${Math.round((r.lhr.categories.performance?.score ?? 0) * 100)}`)
  }
  resultados.sort((a, b) => (a.lhr.categories.performance?.score ?? 0) - (b.lhr.categories.performance?.score ?? 0))
  const r = resultados[Math.floor((resultados.length - 1) / 2)]
  const lhr = r.lhr
  for (const id of ["first-contentful-paint", "largest-contentful-paint"]) if (lhr.audits[id]?.errorMessage) console.log(id, lhr.audits[id].errorMessage)
  const nota = c => Math.round((lhr.categories[c]?.score ?? 0) * 100)
  const m = id => lhr.audits[id]?.displayValue
  const resumo = {
    desempenho: nota('performance'), acessibilidade: nota('accessibility'), boasPraticas: nota('best-practices'), seo: nota('seo'),
    FCP: m('first-contentful-paint'), LCP: m('largest-contentful-paint'), TBT: m('total-blocking-time'), CLS: m('cumulative-layout-shift'), SI: m('speed-index'),
  }
  console.log(JSON.stringify(resumo, null, 1))
  const falhas = Object.values(lhr.audits).filter(a => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual')
  for (const a of falhas) console.log(`  · ${a.id}: ${a.title}${a.displayValue ? ' (' + a.displayValue + ')' : ''}`)
  const limite = Number(process.env.LIMITE || 0)
  const abaixo = ['performance', 'accessibility', 'best-practices', 'seo'].filter(c => nota(c) < limite)
  const texto = `${JSON.stringify(resumo)}${falhas.length ? ' | abaixo de 0,9: ' + falhas.map(a => a.id).join(', ') : ''}`
  if (limite && abaixo.length) { console.error(`Abaixo de ${limite}: ${abaixo.join(', ')}`); anotar('error', `abaixo de ${limite}: ${texto}`); process.exitCode = 1 }
  else anotar('notice', texto)
  if (process.env.SAIDA) { await mkdir(process.env.SAIDA, { recursive: true }); await writeFile(join(process.env.SAIDA, 'entrada.html'), r.report) }
} catch (e) {
  anotar('error', `falhou: ${e?.message || e}`)
  throw e
} finally {
  await chrome.kill()
  servidor.close()
}
