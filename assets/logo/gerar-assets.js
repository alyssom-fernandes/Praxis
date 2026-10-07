// Gera os ícones do Praxis a partir do símbolo da marca: o Λ do GFS Didot com
// as pernas unidas por uma base da espessura das serifas (um triângulo vazado,
// como um frontão). Sem dependências: o desenho é rasterizado aqui mesmo, com
// cobertura analítica na horizontal e 16 amostras por pixel na vertical, e o
// PNG/ICO é montado com o zlib do Node.
//
// Uso: node assets/logo/gerar-assets.js
//
// Saída (nesta pasta):
//   praxis-icon.svg          favicon vetorial; acompanha o tema do sistema
//   praxis-favicon.ico       16, 32 e 48 px (terracota com o triângulo em osso)
//   praxis-icon-192.png      ícone de app (cantos arredondados)
//   praxis-icon-512.png      ícone de app (cantos arredondados)
//   praxis-maskable-512.png  ícone de app sem cantos (o sistema recorta)
//   praxis-apple-touch.png   180 px, sem cantos (o iOS arredonda)
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

// Desenho do Didot (a partir de 24 px) e versão reforçada para 16–20 px:
// haste fina e base um pouco mais grossas, para não sumirem.
const TRI  = 'M296 100H323L466 527V535H521V553H77V535Q128 535 145 495ZM289 197L185 470Q172 505 175 525Q180 535 215 535H405Z'
const TRIP = 'M286 92H334L480 520V524H530V560H70V524Q118 524 136 486ZM292 236L206 466Q196 494 199 508Q203 516 226 516H392Z'

const TERRACOTA = [181, 80, 46]   // #B5502E (acento do tema claro; lê bem nos dois fundos)
const OSSO      = [255, 244, 232] // #FFF4E8

// ── Caminho SVG (só comandos absolutos M H V L Q Z) → polígonos ──────────
function poligonos(d) {
  const tokens = d.match(/[MHVLQZ]|-?\d*\.?\d+/g)
  const polys = []
  let atual = null, x = 0, y = 0, i = 0
  const num = () => parseFloat(tokens[i++])
  while (i < tokens.length) {
    const cmd = tokens[i++]
    if (cmd === 'M') { x = num(); y = num(); atual = [[x, y]]; polys.push(atual) }
    else if (cmd === 'H') { x = num(); atual.push([x, y]) }
    else if (cmd === 'V') { y = num(); atual.push([x, y]) }
    else if (cmd === 'L') { x = num(); y = num(); atual.push([x, y]) }
    else if (cmd === 'Q') {
      const cx = num(), cy = num(), ex = num(), ey = num()
      for (let k = 1; k <= 24; k++) {
        const t = k / 24, u = 1 - t
        atual.push([u * u * x + 2 * u * t * cx + t * t * ex, u * u * y + 2 * u * t * cy + t * t * ey])
      }
      x = ex; y = ey
    } else if (cmd === 'Z') { /* fecha: a aresta final é implícita */ }
  }
  return polys
}

// Retângulo de cantos arredondados como polígono
function retanguloArredondado(w, h, r) {
  const p = []
  const canto = (cx, cy, a0) => { for (let k = 0; k <= 16; k++) { const a = a0 + (k / 16) * Math.PI / 2; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) } }
  canto(w - r, r, -Math.PI / 2); canto(w - r, h - r, 0); canto(r, h - r, Math.PI / 2); canto(r, r, Math.PI)
  return [p]
}

// Cobertura (0..1) por pixel, regra par-ímpar
function rasterizar(polys, tam, transf) {
  const SS = 16
  const cob = new Float32Array(tam * tam)
  const arestas = []
  for (const pol of polys) {
    for (let k = 0; k < pol.length; k++) {
      const a = transf(pol[k]), b = transf(pol[(k + 1) % pol.length])
      if (a[1] !== b[1]) arestas.push(a[1] < b[1] ? [a, b] : [b, a])
    }
  }
  for (let py = 0; py < tam; py++) {
    for (let s = 0; s < SS; s++) {
      const yy = py + (s + 0.5) / SS
      const xs = []
      for (const [a, b] of arestas) {
        if (yy >= a[1] && yy < b[1]) xs.push(a[0] + (yy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
      }
      xs.sort((m, n) => m - n)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.max(0, xs[k]), x1 = Math.min(tam, xs[k + 1])
        if (x1 <= x0) continue
        for (let px = Math.floor(x0); px < Math.ceil(x1) && px < tam; px++) {
          const ov = Math.min(px + 1, x1) - Math.max(px, x0)
          if (ov > 0) cob[py * tam + px] += ov / SS
        }
      }
    }
  }
  return cob
}

// Ícone: fundo terracota (com ou sem cantos) e o triângulo em osso centrado
function desenhar(tam, { cantos = true, escala = 0.62, reforcado = false } = {}) {
  const d = reforcado ? TRIP : TRI
  const polys = poligonos(d)
  // Caixa da tinta do desenho, para centrar opticamente (um pouco abaixo do meio, como um frontão)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of polys) for (const [x, y] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  const lado = Math.max(maxX - minX, maxY - minY)
  const s = (tam * escala) / lado
  const ox = (tam - (maxX - minX) * s) / 2 - minX * s
  const oy = (tam - (maxY - minY) * s) / 2 - minY * s - tam * 0.01
  const tri = rasterizar(polys, tam, ([x, y]) => [x * s + ox, y * s + oy])
  const fundo = cantos ? rasterizar(retanguloArredondado(tam, tam, tam * 0.225), tam, p => p) : null

  const rgba = Buffer.alloc(tam * tam * 4)
  for (let i = 0; i < tam * tam; i++) {
    const af = fundo ? Math.min(1, fundo[i]) : 1
    const at = Math.min(1, tri[i])
    // triângulo sobre o fundo (o fundo cobre o triângulo inteiro)
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(TERRACOTA[c] * (1 - at) + OSSO[c] * at)
    rgba[i * 4 + 3] = Math.round(255 * af)
  }
  return rgba
}

// ── PNG e ICO ─────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
function chunk(tipo, dados) {
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length)
  const t = Buffer.from(tipo, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])))
  return Buffer.concat([len, t, dados, crc])
}
function png(rgba, tam) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const linhas = Buffer.alloc((tam * 4 + 1) * tam)
  for (let y = 0; y < tam; y++) {
    linhas[y * (tam * 4 + 1)] = 0
    rgba.copy(linhas, y * (tam * 4 + 1) + 1, y * tam * 4, (y + 1) * tam * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
function ico(imagens) { // [{ tam, png }]
  const cab = Buffer.alloc(6); cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(imagens.length, 4)
  const entradas = []
  let deslocamento = 6 + 16 * imagens.length
  for (const im of imagens) {
    const e = Buffer.alloc(16)
    e[0] = im.tam >= 256 ? 0 : im.tam; e[1] = im.tam >= 256 ? 0 : im.tam
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(im.png.length, 8); e.writeUInt32LE(deslocamento, 12)
    deslocamento += im.png.length
    entradas.push(e)
  }
  return Buffer.concat([cab, ...entradas, ...imagens.map(i => i.png)])
}

// ── Saída ─────────────────────────────────────────────────────
const dir = __dirname
const gravar = (nome, dados) => { fs.writeFileSync(path.join(dir, nome), dados); console.log(`${nome} gerado (${dados.length} bytes)`) }

// Favicon vetorial: só o triângulo, na cor do texto do tema do sistema
gravar('praxis-icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 86 480 480">
  <style>path{fill:#1A1510}@media (prefers-color-scheme:dark){path{fill:#EFE5D6}}</style>
  <path fill-rule="evenodd" d="${TRIP}"/>
</svg>
`)

const icoTams = [16, 32, 48]
gravar('praxis-favicon.ico', ico(icoTams.map(t => ({ tam: t, png: png(desenhar(t, { escala: 0.7, reforcado: t <= 20 }), t) }))))
gravar('praxis-icon-192.png', png(desenhar(192), 192))
gravar('praxis-icon-512.png', png(desenhar(512), 512))
// Maskable: o sistema recorta um círculo de 80% — o desenho fica dentro dessa zona
gravar('praxis-maskable-512.png', png(desenhar(512, { cantos: false, escala: 0.5 }), 512))
gravar('praxis-apple-touch.png', png(desenhar(180, { cantos: false, escala: 0.58 }), 180))
