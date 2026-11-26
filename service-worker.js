// Service worker do Praxis: o app inteiro fica guardado no aparelho, numa
// versão fechada. Abrir o app não espera a rede (nem para os módulos, nem para
// o SDK do Firebase) e funciona sem internet; os dados vêm da cópia local do
// Firestore (js/firebase.js).
//
// Uma publicação nova muda a VERSAO (scripts/gerar-sw.mjs): o navegador baixa
// este arquivo de novo, a versão nova é guardada inteira ao lado da antiga e só
// assume quando a pessoa toca em "Atualizar" (js/app.js) ou fecha o app. Assim
// uma página nunca mistura módulos de duas versões.

// <gerado por scripts/gerar-sw.mjs: não editar à mão>
const VERSAO = '1a8a4602cc1d'
const ARQUIVOS = [
  '/index.html',
  '/manifest.json',
  '/css/fontes.css?v=43',
  '/css/tokens.css?v=43',
  '/css/base.css?v=43',
  '/css/components.css?v=43',
  '/css/views.css?v=43',
  '/css/telas.css?v=43',
  '/css/themes.css?v=43',
  '/js/acesso.js',
  '/js/alcadas.js',
  '/js/app.js',
  '/js/auditoria.js',
  '/js/auth.js',
  '/js/autocompletar.js',
  '/js/campo-data.js',
  '/js/config-alcadas.js',
  '/js/config-auditoria.js',
  '/js/config-cadastros.js',
  '/js/config-comum.js',
  '/js/config-geral.js',
  '/js/config-usuarios.js',
  '/js/constants.js',
  '/js/demo-pessoas.js',
  '/js/demo-reset.js',
  '/js/detalhe-acoes.js',
  '/js/detalhe-dados.js',
  '/js/detalhe-estado.js',
  '/js/detalhe-painel.js',
  '/js/detalhe-requisicao.js',
  '/js/entrada.js',
  '/js/estado.js',
  '/js/exportacao.js',
  '/js/exportar-dados.js',
  '/js/fatura.js',
  '/js/firebase.js',
  '/js/fornecedores-csv.js',
  '/js/importar-fornecedores.js',
  '/js/inicio.js',
  '/js/itens-editor.js',
  '/js/itens.js',
  '/js/lancamento.js',
  '/js/lancar-compra.js',
  '/js/ler-nota.js',
  '/js/nota.js',
  '/js/notificacoes.js',
  '/js/novo-pedido.js',
  '/js/pdf-papel.js',
  '/js/pedido-detalhe.js',
  '/js/pedidos-estado.js',
  '/js/pedidos-fluxo.js',
  '/js/pedidos-quadro.js',
  '/js/pedidos.js',
  '/js/processo.js',
  '/js/relatorios-estado.js',
  '/js/relatorios-exportar.js',
  '/js/relatorios.js',
  '/js/requisicao.js',
  '/js/senha-nova.js',
  '/js/sistema.js',
  '/js/textos-en.js',
  '/js/textos-pt.js',
  '/js/textos-relatorios.js',
  '/js/tour.js',
  '/js/ui.js',
  '/js/utils.js',
  '/assets/fonts/gfs-didot-400-greek.woff2',
  '/assets/fonts/gfs-didot-400-latin.woff2',
  '/assets/fonts/gfs-neohellenic-400-greek.woff2',
  '/assets/fonts/gfs-neohellenic-400-latin.woff2',
  '/assets/fonts/gfs-neohellenic-700-greek.woff2',
  '/assets/fonts/gfs-neohellenic-700-latin.woff2',
  '/assets/fonts/hanken-grotesk-latin-ext.woff2',
  '/assets/fonts/hanken-grotesk-latin.woff2',
  '/assets/fonts/jetbrains-mono-latin-ext.woff2',
  '/assets/fonts/jetbrains-mono-latin.woff2',
  '/assets/logo/praxis-icon.svg',
  '/assets/logo/praxis-favicon.ico',
  '/assets/logo/praxis-apple-touch.png',
  '/assets/logo/praxis-icon-192.png',
  '/js/config.js'
]
const SDK = [
  'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js'
]
// </gerado>

const CACHE_APP = `praxis-app-${VERSAO}`
// O SDK tem a versão no endereço: muda pouco e não precisa voltar a cada publicação
const CACHE_SDK = `praxis-sdk-${(SDK[0] || '').match(/firebasejs\/([\d.]+)/)?.[1] || '0'}`
// O que não está na lista (planilha, PDF, leitor de QR, dados da demo, imagens):
// rede primeiro, cópia para quando faltar internet
const CACHE_EXTRA = 'praxis-extra'
const ANTIGOS = ['praxis-v5', 'praxis-v4', 'praxis-v3']

// Hosts de API que nunca passam por aqui
const API_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebasestorage.googleapis.com',
  'cloudfunctions.net',
  'firebase.googleapis.com',
  'firebaseapp.com',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const app = await caches.open(CACHE_APP)
    // cache: 'no-cache' revalida com o servidor: a lista nova não pega
    // um arquivo velho do cache HTTP do navegador
    await app.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'no-cache' })))
    const sdk = await caches.open(CACHE_SDK)
    const faltam = []
    for (const u of SDK) if (!(await sdk.match(u))) faltam.push(u)
    if (faltam.length) await sdk.addAll(faltam.map(u => new Request(u, { mode: 'cors', credentials: 'omit' })))
    // Vindo do service worker antigo (rede primeiro, sem versão), a página
    // aberta já roda os arquivos novos: assume na hora
    const veioDoAntigo = (await Promise.all(ANTIGOS.map(n => caches.has(n)))).some(Boolean)
    if (veioDoAntigo) await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const manter = new Set([CACHE_APP, CACHE_SDK, CACHE_EXTRA])
    const nomes = await caches.keys()
    await Promise.all(nomes.filter(n => !manter.has(n)).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

// A página pede para a versão nova assumir (botão "Atualizar")
self.addEventListener('message', (event) => {
  if (event.data === 'praxis:atualizar') self.skipWaiting()
})

async function daVersao(chave) {
  const app = await caches.open(CACHE_APP)
  return app.match(chave)
}

async function redePrimeiro(request) {
  try {
    const resp = await fetch(request)
    if (resp && resp.status === 200) {
      const copia = resp.clone()
      caches.open(CACHE_EXTRA).then(c => c.put(request, copia))
    }
    return resp
  } catch (erro) {
    const guardado = await caches.match(request)
    if (guardado) return guardado
    throw erro
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (API_HOSTS.some(h => url.hostname.includes(h))) return

  // Abrir o app: a página da versão guardada (com ?tela=… também)
  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin && (url.pathname === '/' || url.pathname === '/index.html')) {
      event.respondWith(daVersao('/index.html').then(r => r || redePrimeiro(request)))
    } else {
      event.respondWith(fetch(request).catch(() => daVersao('/index.html')))
    }
    return
  }

  // Arquivos da versão: sempre os guardados juntos (nunca misturar versões)
  if (url.origin === self.location.origin) {
    event.respondWith(daVersao(url.pathname + url.search).then(r => r || redePrimeiro(request)))
    return
  }

  // SDK do Firebase: endereço com versão, guardado de vez
  if (SDK.includes(request.url)) {
    event.respondWith(caches.open(CACHE_SDK).then(c => c.match(request.url)).then(r => r || fetch(request)))
    return
  }

  // Outros (SDK do Storage, fontes de fora): rede primeiro
  event.respondWith(redePrimeiro(request))
})
