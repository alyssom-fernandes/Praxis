// Gera praxis-icon-512.png e praxis-favicon.ico a partir do desenho do ícone
// (delta dourado sobre fundo escuro com cantos arredondados).
// Sem dependências — PNG montado manualmente com zlib do Node.
// Uso: node gerar-assets.js
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

const GOLD = [200, 169, 110] // #C8A96E
const BG   = [6, 6, 6]       // #060606

// CRC32 (tabela padrão PNG)
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

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

// Rasteriza o ícone em RGBA com supersampling 3x3
function render(size) {
  const SS = 3
  const big = size * SS
  // Geometria proporcional ao viewBox 512
  const s = big / 512
  const radius = 96 * s
  const apex = [256 * s, 120 * s]
  const bl   = [140 * s, 372 * s]
  const br   = [372 * s, 372 * s]

  function inRoundedRect(x, y) {
    const r = radius
    const w = big, h = big
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    const cx = x < r ? r : x > w - r ? w - r : x
    const cy = y < r ? r : y > h - r ? h - r : y
    if ((x < r || x > w - r) && (y < r || y > h - r)) {
      const dx = x - cx, dy = y - cy
      return dx * dx + dy * dy <= r * r
    }
    return true
  }

  function edge(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  }
  function inTriangle(x, y) {
    const d1 = edge(apex[0], apex[1], br[0], br[1], x, y)
    const d2 = edge(br[0], br[1], bl[0], bl[1], x, y)
    const d3 = edge(bl[0], bl[1], apex[0], apex[1], x, y)
    const neg = d1 < 0 || d2 < 0 || d3 < 0
    const pos = d1 > 0 || d2 > 0 || d3 > 0
    return !(neg && pos)
  }

  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0, gSum = 0, bSum = 0, aSum = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x * SS + sx + 0.5
          const fy = y * SS + sy + 0.5
          if (!inRoundedRect(fx, fy)) continue
          const c = inTriangle(fx, fy) ? GOLD : BG
          rSum += c[0]; gSum += c[1]; bSum += c[2]; aSum += 255
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      // Cor pré-multiplicada média desfeita para straight alpha
      const a = aSum / n
      px[i]     = a ? Math.round(rSum / (aSum / 255)) : 0
      px[i + 1] = a ? Math.round(gSum / (aSum / 255)) : 0
      px[i + 2] = a ? Math.round(bSum / (aSum / 255)) : 0
      px[i + 3] = Math.round(a)
    }
  }
  return px
}

function toPNG(size) {
  const px = render(size)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  // Scanlines com filtro 0
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ICO com PNG embutido (formato aceito desde o Vista)
function toICO(pngBuf, size) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // count
  const entry = Buffer.alloc(16)
  entry[0] = size >= 256 ? 0 : size // width
  entry[1] = size >= 256 ? 0 : size // height
  entry[2] = 0  // colors
  entry[3] = 0  // reserved
  entry.writeUInt16LE(1, 4)  // planes
  entry.writeUInt16LE(32, 6) // bpp
  entry.writeUInt32LE(pngBuf.length, 8)
  entry.writeUInt32LE(22, 12) // offset (6 + 16)
  return Buffer.concat([header, entry, pngBuf])
}

const dir = __dirname
fs.writeFileSync(path.join(dir, 'praxis-icon-512.png'), toPNG(512))
console.log('praxis-icon-512.png gerado')
fs.writeFileSync(path.join(dir, 'praxis-favicon.ico'), toICO(toPNG(48), 48))
console.log('praxis-favicon.ico gerado')
