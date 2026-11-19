// Ponto de entrada do app (index.html). Quem não tem sessão neste aparelho vê
// a tela de entrada na hora, sem esperar o SDK do Firebase, que continua
// chegando em paralelo (js/auth.js o carrega sob demanda). Quem tem sessão vê
// o splash até o quadro (js/app.js). Medido no celular simulado (4G lento, CPU
// 4x; scripts/medir-desempenho.mjs): antes a entrada esperava o SDK inteiro.
import { carregarIdioma } from './constants.js'

// CSS das telas do app (index.html): baixado sem segurar a primeira pintura;
// o app espera por ele antes de desenhar a primeira tela da conta (js/app.js)
const cssTelas = document.getElementById('css-telas')
window.__praxisCssTelas = new Promise(pronto => {
  if (!cssTelas) return pronto()
  const feito = () => pronto()
  if (cssTelas.sheet) feito()
  else { cssTelas.addEventListener('load', feito, { once: true }); cssTelas.addEventListener('error', feito, { once: true }) }
  // Sem resposta (rede caindo): não trava o app
  setTimeout(feito, 8000)
})
if (cssTelas) cssTelas.media = 'all'

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
