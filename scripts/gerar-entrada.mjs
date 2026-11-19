// Escreve no index.html a tela de entrada em português, desenhada pelo próprio
// renderLogin (js/auth.js) num navegador: a primeira pintura não espera
// JavaScript nenhum, e o app só liga os eventos (mostrarEntrada). Os estilos
// ficam como data-estilo (a CSP não aceita style="", js/ui.js aplica).
//   node scripts/gerar-entrada.mjs             reescreve o trecho do index.html
//   node scripts/gerar-entrada.mjs --conferir  só confere
// Rodar depois de mudar a entrada (auth.js, os textos dela, a marca). O teste de
// celular (tests/celular.test.mjs) falha enquanto a cópia estiver velha.
/* global document */
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)))
const INICIO = '<!-- entrada:inicio (gerado por scripts/gerar-entrada.mjs) -->'
const FIM = '<!-- entrada:fim -->'

// O HTML da entrada como o renderLogin desenha agora, com a marca da cópia estática
export async function entradaDesenhada({ canal = process.env.PW_CANAL } = {}) {
  const config = await readFile(join(RAIZ, 'js', 'config.example.js'), 'utf8')
  const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' }
  const servidor = createServer(async (rq, res) => {
    const caminho = decodeURIComponent(new URL(rq.url, 'http://localhost').pathname)
    try {
      const corpo = caminho === '/js/config.js' ? config
        : await readFile((() => { const a = resolve(RAIZ, '.' + (caminho.endsWith('/') ? `${caminho}index.html` : caminho)); if (!a.startsWith(RAIZ + sep)) throw new Error('fora'); return a })())
      res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || TIPOS['.html'] }); res.end(corpo)
    } catch { res.writeHead(404); res.end() }
  })
  await new Promise(r => servidor.listen(0, '127.0.0.1', r))
  const navegador = await chromium.launch(canal ? { channel: canal } : {})
  try {
    const ctx = await navegador.newContext({ locale: 'pt-BR', serviceWorkers: 'block' })
    const p = await ctx.newPage()
    await p.goto(`http://127.0.0.1:${servidor.address().port}/`)
    const html = await p.evaluate(async () => {
      const { renderLogin } = await import('/js/auth.js')
      const app = document.getElementById('app')
      app.innerHTML = ''
      renderLogin()
      return app.innerHTML
    })
    // O friso numera os ids na ordem em que é desenhado: na cópia estática o id é fixo
    return html.trim().replace('<div class="login-page">', '<div class="login-page" data-estatica="pt">').replace(/friso-\d+/g, 'friso-entrada')
  } finally {
    await navegador.close()
    servidor.close()
  }
}

export function trechoDoIndex(html) {
  return `${INICIO}\n    ${html}\n    ${FIM}`
}
export const MARCA_ENTRADA = new RegExp(`${INICIO.replace(/[()]/g, '\\$&')}[\\s\\S]*?${FIM}`)

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const caminho = join(RAIZ, 'index.html')
  const atual = await readFile(caminho, 'utf8')
  const trecho = trechoDoIndex(await entradaDesenhada())
  const novo = MARCA_ENTRADA.test(atual)
    ? atual.replace(MARCA_ENTRADA, () => trecho)
    : atual.replace('<div id="app"></div>', () => `<div id="app">\n    ${trecho}\n  </div>`)
  if (process.argv.includes('--conferir')) {
    if (novo !== atual) { console.error('A entrada do index.html está velha: rode node scripts/gerar-entrada.mjs'); process.exit(1) }
    console.log('entrada do index.html em dia')
  } else {
    await writeFile(caminho, novo)
    console.log(novo === atual ? 'entrada do index.html já estava em dia' : 'entrada do index.html atualizada')
  }
}
