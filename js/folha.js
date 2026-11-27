// Folha do celular (estilo novo, 27/11/2026): arrastar o alto da janela para
// baixo fecha, como as folhas do iOS; solta antes do ponto, ela volta. Só no
// toque e em telas de celular e tablet (no computador a janela fica parada).
// Fecha pelo próprio botão de fechar da janela: algumas se removem da página
// ao fechar, e a que não tem o botão (a senha nova obrigatória) não sai.

const _FOLHA_MQ = '(max-width: 1023px), (max-width: 1279px) and (pointer: coarse)'

export function ligarArrastoDaFolha(overlay) {
  if (overlay._arrasto) return
  const cab = overlay.querySelector('.modal > .modal-header')
  const folha = cab?.parentElement
  const x = cab?.querySelector('.btn-icon')
  if (!x) return
  overlay._arrasto = true
  let y0 = null, dy = 0, t0 = 0
  const soltar = () => {
    if (y0 == null) return
    const v = dy / Math.max(1, performance.now() - t0)
    y0 = null
    folha.classList.remove('arrastando')
    if (dy > 120 || (dy > 30 && v > 0.6)) {
      folha.style.setProperty('transform', 'translateY(100%)')
      setTimeout(() => {
        overlay._fecharImediato = true   // fecharModal (js/ui.js) fecha sem a animação de descer
        x.click()
        overlay._fecharImediato = false
        folha.style.removeProperty('transform')
      }, 200)
    } else folha.style.removeProperty('transform')
  }
  cab.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || !window.matchMedia?.(_FOLHA_MQ).matches) return
    if (e.target.closest('button, a, input, select, textarea, label')) return
    y0 = e.clientY; dy = 0; t0 = performance.now()
    try { cab.setPointerCapture(e.pointerId) } catch { /* ponteiro que já saiu */ }
    folha.classList.add('arrastando')
  })
  cab.addEventListener('pointermove', e => {
    if (y0 == null) return
    dy = Math.max(0, e.clientY - y0)
    folha.style.setProperty('transform', `translateY(${dy}px)`)
  })
  cab.addEventListener('pointerup', soltar)
  cab.addEventListener('pointercancel', soltar)
}
