/* global window, document */
// Página de apresentação (apresentacao.html): o tema segue o do sistema, ao
// vivo, como o app sem escolha salva. Os tokens do tema claro valem com a
// classe .light no <html> (css/tokens.css).
const claro = window.matchMedia('(prefers-color-scheme: light)')
const aplicar = () => document.documentElement.classList.toggle('light', claro.matches)
aplicar()
claro.addEventListener('change', aplicar)
