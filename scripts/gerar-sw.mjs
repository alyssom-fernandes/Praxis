// Dados de publicação gerados do código: (1) a lista do que o service worker
// guarda na instalação (o app inteiro, para abrir
// sem internet e sem esperar a rede) e a versão, um resumo do conteúdo desses
// arquivos, reescrita no trecho marcado de service-worker.js; (2) os hashes
// dos blocos <style> do index.html e do 404.html na CSP do firebase.json
// (style-src sem 'unsafe-inline': o resto dos estilos vem dos CSS ou do CSSOM).
//   node scripts/gerar-sw.mjs          reescreve
//   node scripts/gerar-sw.mjs --conferir  só confere (sai com erro se estiver velho)
// Rodar depois de qualquer mudança em js/, css/, index.html, fontes ou ícones;
// o teste de unidade (tests/pwa.test.mjs) falha enquanto algo estiver velho.
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)))

// Fora da lista: config.js (cada máquina tem o seu, não entra no resumo, mas é
// guardado), o exemplo de config e os pacotes de terceiros grandes de vendor/
// (planilha, PDF, leitor de QR), que vêm só quando alguém usa
const FORA = new Set(['config.example.js', 'config.js'])

export async function listaDoSw() {
  const html = await readFile(join(RAIZ, 'index.html'), 'utf8')
  const css = [...html.matchAll(/href="(\/css\/[^"]+)"/g)].map(m => m[1])
  const js = (await readdir(join(RAIZ, 'js'))).filter(n => n.endsWith('.js') && !FORA.has(n)).sort().map(n => `/js/${n}`)
  const fontes = (await readdir(join(RAIZ, 'assets', 'fonts'))).filter(n => n.endsWith('.woff2')).sort().map(n => `/assets/fonts/${n}`)
  const icones = ['/assets/logo/praxis-icon.svg', '/assets/logo/praxis-favicon.ico', '/assets/logo/praxis-apple-touch.png', '/assets/logo/praxis-icon-192.png']
  const locais = ['/index.html', '/manifest.json', ...css, ...js, ...fontes, ...icones]
  const resumo = createHash('sha256')
  for (const url of locais) {
    resumo.update(url)
    resumo.update(await readFile(join(RAIZ, url.split('?')[0])))
  }
  // O SDK do Firebase (versão fixa no endereço) e o config.js entram na lista,
  // mas não no resumo
  const sdk = [...html.matchAll(/href="(https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+)"/g)].map(m => m[1])
  return { versao: resumo.digest('hex').slice(0, 12), arquivos: [...locais, '/js/config.js'], sdk }
}

export function trechoDoSw({ versao, arquivos, sdk }) {
  return `// <gerado por scripts/gerar-sw.mjs: não editar à mão>
const VERSAO = '${versao}'
const ARQUIVOS = ${JSON.stringify(arquivos, null, 2).replace(/"/g, "'")}
const SDK = ${JSON.stringify(sdk, null, 2).replace(/"/g, "'")}
// </gerado>`
}

// Hash (sha256, base64) de cada bloco <style> das páginas: a CSP aceita só estes
export async function hashesDosEstilos() {
  const hashes = []
  for (const pagina of ['index.html', '404.html']) {
    const html = await readFile(join(RAIZ, pagina), 'utf8')
    for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) hashes.push(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`)
  }
  return hashes
}
export function cspComHashes(csp, hashes) {
  return csp.replace(/style-src [^;]*;/, `style-src 'self' ${hashes.join(' ')};`)
}

const MARCA = /\/\/ <gerado por scripts\/gerar-sw\.mjs[\s\S]*?\/\/ <\/gerado>/

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const caminho = join(RAIZ, 'service-worker.js')
  const atual = await readFile(caminho, 'utf8')
  const novo = atual.replace(MARCA, trechoDoSw(await listaDoSw()))
  const caminhoFb = join(RAIZ, 'firebase.json')
  const fbAtual = await readFile(caminhoFb, 'utf8')
  const hashes = await hashesDosEstilos()
  const fbNovo = fbAtual.replace(/("key": "Content-Security-Policy",\s*"value": ")([^"]*)(")/, (_, a, csp, b) => a + cspComHashes(csp, hashes) + b)
  if (process.argv.includes('--conferir')) {
    if (novo !== atual || fbNovo !== fbAtual) { console.error('service-worker.js ou a CSP do firebase.json desatualizados: rode node scripts/gerar-sw.mjs'); process.exit(1) }
    console.log('service-worker.js e CSP em dia')
  } else {
    await writeFile(caminho, novo)
    await writeFile(caminhoFb, fbNovo)
    console.log(novo === atual ? 'service-worker.js já estava em dia' : 'service-worker.js atualizado')
    console.log(fbNovo === fbAtual ? 'CSP já estava em dia' : 'CSP atualizada')
  }
}
