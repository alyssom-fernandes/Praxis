const CACHE = 'praxis-v4'

// Hosts de API que nunca devem ser interceptados
const API_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'cloudfunctions.net',
  'firebase.googleapis.com',
  'firebaseapp.com',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.add('/index.html'))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') return

  // API Firestore / Auth / Functions → sem interceptação (network-only)
  if (API_HOSTS.some(h => url.hostname.includes(h))) return

  // Requisições de navegação → tenta rede, usa index.html em cache como fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          if (resp && resp.status === 200) {
            const cloned = resp.clone()
            caches.open(CACHE).then(c => c.put(request, cloned))
          }
          return resp
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // Assets da mesma origem (JS, CSS, imagens, fontes) → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fromNetwork = fetch(request).then(resp => {
          if (resp && resp.status === 200) {
            const cloned = resp.clone()
            caches.open(CACHE).then(c => c.put(request, cloned))
          }
          return resp
        })
        return cached || fromNetwork
      })
    )
    return
  }

  // CDN externas (Firebase SDK, Google Fonts) → network-first, cache como fallback
  event.respondWith(
    fetch(request)
      .then(resp => {
        if (resp && resp.status === 200) {
          const cloned = resp.clone()
          caches.open(CACHE).then(c => c.put(request, cloned))
        }
        return resp
      })
      .catch(() => caches.match(request))
  )
})
