// Os ícones do Praxis, desenhados para a marca e não tirados de uma biblioteca.
// A gramática é a da pedra cortada do Λ: grade de 24, traço reto (ponta e
// junção em ângulo, css/base.css), nenhum canto arredondado — os cantos são
// chanfrados a 45° — e octógonos no lugar de círculos. Onde cabe um pico, ele
// é o Λ; os relatórios são colunas com capitel, as empresas um frontão.
// Uso: icone('busca', 22) devolve o <svg>; ICONES guarda só o desenho.

// Retângulo com os quatro cantos chanfrados
function ret(x1, y1, x2, y2, c = 2) {
  return `M${x1 + c} ${y1}H${x2 - c}L${x2} ${y1 + c}V${y2 - c}L${x2 - c} ${y2}H${x1 + c}L${x1} ${y2 - c}V${y1 + c}Z`
}
// Octógono regular, de lados retos, no lugar do círculo
function oct(cx, cy, r) {
  const a = Math.round(r * 0.4142 * 100) / 100
  return `M${cx - a} ${cy - r}H${cx + a}L${cx + r} ${cy - a}V${cy + a}L${cx + a} ${cy + r}H${cx - a}L${cx - r} ${cy + a}V${cy - a}Z`
}
const p = (...ds) => ds.map(d => `<path d="${d}"/>`).join('')

export const ICONES = {
  // ── Navegação ──
  pedidos:      p(ret(3, 3, 10, 10, 1.5), ret(14, 3, 21, 10, 1.5), ret(3, 14, 10, 21, 1.5), ret(14, 14, 21, 21, 1.5)),
  fila:         p('M3 6H15M3 12H15M3 18H10', 'M14 17.5L16.5 20L21.5 14'),
  novo:         p('M12 4V20M4 12H20'),
  busca:        p(oct(10.5, 10.5, 6.5), 'M15.5 15.5L21 21'),
  sino:         p('M12 3L17 7V13.5L20 17H4L7 13.5V7Z', 'M10 20.5H14'),
  conta:        p(oct(12, 7.5, 4), 'M4 21L8 15H16L20 21'),
  relatorios:   p('M2 21H22', 'M5 21V13M3.5 13H6.5', 'M12 21V8.5M10.5 8.5H13.5', 'M19 21V4M17.5 4H20.5'),
  empresas:     p('M3 9L12 3.5L21 9Z', 'M6 12V18M10 12V18M14 12V18M18 12V18', 'M4 18H20M3 21H21'),
  categorias:   p('M3 3H12L21 12L12 21L3 12Z', 'M7 6.5H9V8.5H7Z'),
  fornecedores: p(ret(3, 8, 21, 21, 1.5), 'M3 8L6 3.5H18L21 8', 'M9 12H15'),
  usuarios:     p(oct(9, 8, 3.5), 'M2 20L5.5 14H12.5L16 20', 'M15 4.5H17.5L19.5 6.5V9.5L17.5 11.5H15', 'M16.5 14H18.5L22 20'),
  alcadas:      p('M3 20H8V15H13V10H18V5H21', 'M3 20V21H21V5'),
  auditoria:    p(ret(5, 3, 19, 21, 1.5), 'M9 8H15M9 12H15M9 16H12'),
  ajustes:      p('M4 6H20M4 12H20M4 18H20', 'M8 4H11V8H8Z', 'M14 10H17V14H14Z', 'M6 16H9V20H6Z'),
  sair:         p('M10 4H4V20H10', 'M14 8L18 12L14 16', 'M18 12H9'),
  recolher:     p(ret(3, 4, 21, 20, 1.5), 'M9 4V20', 'M15.5 9L12.5 12L15.5 15'),
  expandir:     p(ret(3, 4, 21, 20, 1.5), 'M9 4V20', 'M13 9L16 12L13 15'),
  // ── Ações ──
  check:        p('M4 12.5L9.5 18L20 6'),
  x:            p('M6 6L18 18M18 6L6 18'),
  carrinho:     p('M2 4H5L7.5 15H18.5L21 7H6', 'M8 19H10V21H8Z', 'M17 19H19V21H17Z'),
  caixa:        p('M12 3L20 7.5V16.5L12 21L4 16.5V7.5Z', 'M4 7.5L12 12L20 7.5', 'M12 12V21'),
  moeda:        p(oct(12, 12, 9), 'M15 9H10.5L9 10.5L10.5 12H13.5L15 13.5L13.5 15H9', 'M12 6.5V9M12 15V17.5'),
  doc:          p('M6 3H14L19 8V21H6Z', 'M14 3V8H19', 'M9 13H16M9 17H14'),
  duplicar:     p(ret(9, 9, 21, 21, 1.5), 'M5 15H3V3H15V5'),
  editar:       p('M4 20L5 15.5L16 4.5L19.5 8L8.5 19Z', 'M14 6.5L17.5 10', 'M13 20H20'),
  lixeira:      p('M4 6H20', 'M9 6V3H15V6', 'M6 6L7 21H17L18 6', 'M10 10V17M14 10V17'),
  relogio:      p(oct(12, 12, 9), 'M12 7V12L15.5 14'),
  baixar:       p('M12 3V15', 'M7 10L12 15L17 10', 'M4 17V21H20V17'),
  externo:      p('M14 3H21V10', 'M21 3L11 13', 'M18 14V21H3V6H10'),
  conversa:     p('M4 4H20V16H10L5 20V16H4Z', 'M8 9H16M8 12H13'),
  menu:         p('M5 11H7V13H5Z', 'M11 11H13V13H11Z', 'M17 11H19V13H17Z'),
  alerta:       p(oct(12, 12, 9), 'M12 7.5V13', 'M11.25 15.75H12.75V17.25H11.25Z'),
  filtros:      p('M3 6H21M6 12H18M10 18H14'),
  lista:        p('M8 6H21M8 12H21M8 18H21', 'M3 5H5V7H3Z', 'M3 11H5V13H3Z', 'M3 17H5V19H3Z'),
  colunas:      p(ret(3, 4, 8, 20, 1), ret(10, 4, 15, 15, 1), ret(17, 4, 22, 11, 1)),
  setaEsq:      p('M15 18L9 12L15 6'),
  setaDir:      p('M9 18L15 12L9 6'),
}

export function icone(nome, tam = 16) {
  return `<svg class="ico ico-${nome}" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONES[nome] || ''}</svg>`
}
