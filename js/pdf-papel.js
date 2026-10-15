// ── Papel dos PDFs (relatório e pedido) ───────────────────────
// A paleta do tema claro e da impressão, o símbolo do Praxis desenhado como
// vetor e o texto espaçado letra a letra. As fontes padrão do jsPDF não têm o
// GFS Didot; o símbolo vai como vetor e o nome em Helvetica.

export const PAPEL = {
  tinta: [26, 21, 16], texto2: [87, 73, 58], texto3: [116, 100, 79],
  terracota: [181, 80, 46], terracotaTxt: [164, 70, 42], apagada: [222, 200, 182],
  argila: [239, 230, 215], argilaClara: [250, 245, 237], linha: [226, 213, 193], linhaForte: [205, 187, 160],
  neutra: [150, 135, 117], branco: [255, 255, 255], afn: [107, 31, 42], cinzaAfn: [80, 80, 80],
  verde: [69, 107, 50], vermelho: [179, 38, 30],
}

// Símbolo do Praxis (o triângulo vazado) desenhado com as primitivas do jsPDF.
// O desenho é o _TRI de js/ui.js: o Λ do GFS Didot fechado na base.
const _TRI_PDF = 'M296 100H323L466 527V535H521V553H77V535Q128 535 145 495ZM289 197L185 470Q172 505 175 525Q180 535 215 535H405Z'
function _subcaminhos(d) {
  const tk = d.match(/[MHVLQZ]|-?\d*\.?\d+/g) || []
  const subs = []
  let i = 0, cmd = '', cx = 0, cy = 0, atual = null
  const num = () => Number(tk[i++])
  while (i < tk.length) {
    if (/[MHVLQZ]/.test(tk[i])) cmd = tk[i++]
    if (cmd === 'M') { cx = num(); cy = num(); atual = { ini: [cx, cy], segs: [] }; subs.push(atual); cmd = 'L' }
    else if (cmd === 'H') { const x = num(); atual.segs.push({ t: 'L', p: [x, cy] }); cx = x }
    else if (cmd === 'V') { const y = num(); atual.segs.push({ t: 'L', p: [cx, y] }); cy = y }
    else if (cmd === 'L') { const x = num(), y = num(); atual.segs.push({ t: 'L', p: [x, y] }); cx = x; cy = y }
    else if (cmd === 'Q') { const qx = num(), qy = num(), x = num(), y = num(); atual.segs.push({ t: 'Q', c: [qx, qy], p: [x, y] }); cx = x; cy = y }
    else if (cmd === 'Z') { if (atual) { cx = atual.ini[0]; cy = atual.ini[1] } cmd = '' }
    else i++
  }
  return subs
}
export function desenharSimbolo(doc, x, y, altura, cor, fundo) {
  const s = altura / 453                      // altura do glifo no viewBox da marca
  const X = v => x + (v - 67.16) * s, Y = v => y + (v - 100) * s
  _subcaminhos(_TRI_PDF).forEach((sp, k) => {
    // Primeiro o contorno cheio; depois o vazado, na cor do papel
    doc.setFillColor(...(k === 0 ? cor : fundo))
    let [px, py] = [X(sp.ini[0]), Y(sp.ini[1])]
    const linhas = sp.segs.map(sg => {
      const [nx, ny] = [X(sg.p[0]), Y(sg.p[1])]
      let r
      if (sg.t === 'L') r = [nx - px, ny - py]
      else {
        // Quadrática → cúbica
        const [qx, qy] = [X(sg.c[0]), Y(sg.c[1])]
        const c1 = [px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py)]
        const c2 = [nx + (2 / 3) * (qx - nx), ny + (2 / 3) * (qy - ny)]
        r = [c1[0] - px, c1[1] - py, c2[0] - px, c2[1] - py, nx - px, ny - py]
      }
      px = nx; py = ny
      return r
    })
    doc.lines(linhas, X(sp.ini[0]), Y(sp.ini[1]), [1, 1], 'F', true)
  })
}

// Texto espaçado letra a letra (o charSpace do jsPDF desalinha o texto à direita)
export const larguraEspacada = (doc, s, cs) =>
  [...s].reduce((w, ch) => w + doc.getTextWidth(ch), 0) + cs * Math.max(0, [...s].length - 1)
export function textoEspacado(doc, s, x, y, cs, aDireita = false) {
  let cx = aDireita ? x - larguraEspacada(doc, s, cs) : x
  for (const ch of s) { doc.text(ch, cx, y); cx += doc.getTextWidth(ch) + cs }
}
