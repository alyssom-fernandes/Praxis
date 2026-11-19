// Ponto de entrada do app (index.html). Quem não tem sessão neste aparelho vê
// a tela de entrada na hora, sem esperar o SDK do Firebase, que continua
// chegando em paralelo (js/auth.js o carrega sob demanda). Quem tem sessão vê
// o splash até o quadro (js/app.js). Medido no celular simulado (4G lento, CPU
// 4x; scripts/medir-desempenho.mjs): antes a entrada esperava o SDK inteiro.
import { carregarIdioma } from './constants.js'

// CSS das telas do app e dos ajustes por largura e tema (index.html): baixados
// sem segurar a primeira pintura da entrada; o app espera os dois antes de
// desenhar a primeira tela da conta (js/app.js). A ordem dos <link> no
// documento, e não a da chegada, decide a cascata
const adiados = ['css-telas', 'css-themes'].map(id => document.getElementById(id)).filter(Boolean)
window.__praxisCssTelas = Promise.all(adiados.map(link => new Promise(pronto => {
  if (link.sheet) return pronto()
  link.addEventListener('load', pronto, { once: true })
  link.addEventListener('error', pronto, { once: true })
  // Sem resposta (rede caindo): não trava o app
  setTimeout(pronto, 8000)
})))
for (const link of adiados) link.media = 'all'

// Quem escolheu o inglês baixa o dicionário antes da primeira tela
await carregarIdioma()

let comSessao = false
try { comSessao = localStorage.getItem('praxis_sessao') === '1' } catch { /* sem armazenamento */ }

if (!comSessao) {
  try {
    const { mostrarEntrada } = await import('./auth.js')
    // O app pode ter chegado antes e já desenhado outra tela
    if (!document.querySelector('#app > :not(.login-page)')) {
      mostrarEntrada()
      window.__praxisPronto?.()
    }
  } catch (e) {
    console.warn('Entrada adiantada não desenhada:', e?.message || e)
  }
}

import('./app.js')
