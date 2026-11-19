// App instalável e versão fechada: o service worker, o manifest e as versões
// dos CSS. Sem emulador.
//
//   npm run testar-unidade

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listaDoSw, trechoDoSw, hashesDosEstilos } from '../scripts/gerar-sw.mjs'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ler = nome => fs.readFileSync(path.join(RAIZ, nome), 'utf8')

test('service-worker.js com a lista e a versão do código de agora (node scripts/gerar-sw.mjs)', async () => {
  const sw = ler('service-worker.js')
  const trecho = trechoDoSw(await listaDoSw())
  assert.ok(sw.replace(/\r\n/g, '\n').includes(trecho.replace(/\r\n/g, '\n')),
    'service-worker.js desatualizado: rode node scripts/gerar-sw.mjs depois de mudar js/, css/, index.html, fontes ou ícones')
})

test('todo arquivo guardado pelo service worker existe', async () => {
  const { arquivos, sdk } = await listaDoSw()
  const faltam = arquivos.filter(u => u !== '/js/config.js' && !fs.existsSync(path.join(RAIZ, u.split('?')[0])))
  assert.deepEqual(faltam, [])
  // O SDK guardado é o mesmo que o index.html pré-carrega e o js/firebase.js importa
  const fb = ler('js/firebase.js')
  for (const u of sdk) assert.ok(fb.includes(u), `js/firebase.js importa ${u}`)
  assert.equal(sdk.length, 3, 'app, auth e firestore')
})

test('todo módulo do app entra na lista (um módulo de fora quebraria o app sem internet)', async () => {
  const { arquivos } = await listaDoSw()
  const fora = fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js') && n !== 'config.example.js' && !arquivos.includes(`/js/${n}`))
  assert.deepEqual(fora, [])
})

test('os CSS têm a mesma versão (?v=) no index.html e no 404.html', () => {
  const versoes = arquivo => [...ler(arquivo).matchAll(/\/css\/[\w-]+\.css\?v=(\d+)/g)].map(m => m[1])
  const todas = new Set([...versoes('index.html'), ...versoes('404.html')])
  assert.equal(todas.size, 1, `versões diferentes: ${[...todas].join(', ')}`)
})

test('manifest: identidade, ícones, atalhos e capturas existem', () => {
  const m = JSON.parse(ler('manifest.json'))
  assert.equal(m.id, '/')
  assert.equal(m.display, 'standalone')
  assert.ok(m.start_url.startsWith('/'))
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(RAIZ, i.src)), i.src)
  assert.ok(m.icons.some(i => i.purpose === 'maskable'))
  assert.ok(m.icons.some(i => i.sizes === '512x512'))
  for (const a of m.shortcuts) {
    assert.ok(/^\/\?tela=pedidos&(novo=(pedido|compra)|filtro=pendentes)$/.test(a.url), a.url)
    for (const i of a.icons) assert.ok(fs.existsSync(path.join(RAIZ, i.src)), i.src)
  }
  // Capturas: o tamanho declarado é o do arquivo (WebP com VP8 ou VP8L)
  for (const c of m.screenshots) {
    const b = fs.readFileSync(path.join(RAIZ, c.src))
    assert.equal(b.toString('ascii', 0, 4), 'RIFF', c.src)
    const tipo = b.toString('ascii', 12, 16)
    let w, h
    if (tipo === 'VP8 ') { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff }
    else if (tipo === 'VP8L') { const v = b.readUInt32LE(21); w = (v & 0x3fff) + 1; h = ((v >> 14) & 0x3fff) + 1 }
    else if (tipo === 'VP8X') { w = b.readUIntLE(24, 3) + 1; h = b.readUIntLE(27, 3) + 1 }
    assert.equal(`${w}x${h}`, c.sizes, c.src)
  }
  assert.ok(m.screenshots.some(c => c.form_factor === 'narrow') && m.screenshots.some(c => c.form_factor === 'wide'))
})

test('o dicionário inglês só é baixado sob demanda', () => {
  const estaticos = fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js'))
    .filter(n => /^import[^(]*['"]\.\/textos-en\.js['"]/m.test(ler(`js/${n}`)))
  assert.deepEqual(estaticos, [])
})

test('CSP sem estilo embutido liberado: só os hashes dos blocos <style> das páginas', async () => {
  const fb = JSON.parse(ler('firebase.json'))
  const csp = fb.hosting.headers.find(h => h.source === '**').headers.find(h => h.key === 'Content-Security-Policy').value
  assert.ok(!csp.includes('unsafe-inline'), 'a CSP ainda libera unsafe-inline')
  for (const h of await hashesDosEstilos()) assert.ok(csp.includes(h), `falta ${h} na CSP (rode node scripts/gerar-sw.mjs)`)
  // Nenhum módulo escreve style="…" no HTML (use data-estilo, aplicado pelo CSSOM em js/ui.js)
  const comStyle = fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js') && /\sstyle="|setAttribute\('style'/.test(ler(`js/${n}`)))
  assert.deepEqual(comStyle, [])
})

test('nenhum módulo de código acima de 1.200 linhas (os dicionários são dados)', () => {
  const grandes = fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js') && !/^textos-/.test(n))
    .map(n => [n, ler(`js/${n}`).split('\n').length]).filter(([, l]) => l > 1200)
  assert.deepEqual(grandes, [])
})

test('Open Graph em português e em inglês', () => {
  const html = ler('index.html')
  assert.match(html, /og:locale" +content="pt_BR"/)
  assert.match(html, /og:locale:alternate" +content="en_US"/)
})
