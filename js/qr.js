// Gerador de QR Code (ISO/IEC 18004), sem biblioteca: as placas das unidades e
// as etiquetas dos equipamentos levam um endereço do próprio Praxis, que a
// câmera do celular abre. Modo byte (UTF-8), correção de erros nível M (até 15%
// do símbolo danificado), versões 1 a 10 (até 213 bytes). Sem Firebase nem DOM;
// conferido em tests/unidade.test.mjs com os valores da norma e um leitor
// independente.

// ── Tabelas (nível M) ───────────────────────────────────────────
// Por versão: [correção por bloco, blocos do grupo 1, dados por bloco 1,
// blocos do grupo 2, dados por bloco 2]
const _BLOCOS_M = [null,
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
]
const _ALINHAMENTO = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]
const _NIVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 }

const _dadosDaVersao = v => { const b = _BLOCOS_M[v]; return b[1] * b[2] + b[3] * b[4] }

// ── Reed-Solomon em GF(256), polinômio 0x11D ───────────────────────
function _mult(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xFF
}
export function divisorRS(grau) {
  const r = new Array(grau).fill(0)
  r[grau - 1] = 1
  let raiz = 1
  for (let i = 0; i < grau; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = _mult(r[j], raiz)
      if (j + 1 < r.length) r[j] ^= r[j + 1]
    }
    raiz = _mult(raiz, 0x02)
  }
  return r
}
export function correcaoRS(dados, grau) {
  const div = divisorRS(grau)
  const r = new Array(grau).fill(0)
  for (const b of dados) {
    const fator = b ^ r.shift()
    r.push(0)
    for (let i = 0; i < div.length; i++) r[i] ^= _mult(div[i], fator)
  }
  return r
}

// ── Códigos BCH do formato e da versão ─────────────────────────────
export function bitsDoFormato(nivel, mascara) {
  const dado = (_NIVEL_BITS[nivel] << 3) | mascara
  let rem = dado
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  return ((dado << 10) | rem) ^ 0x5412
}
export function bitsDaVersao(versao) {
  let rem = versao
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25)
  return (versao << 12) | rem
}

// ── Os dados: modo byte, contagem, bytes, fim e preenchimento ───────
function _utf8(texto) { return Array.from(new TextEncoder().encode(String(texto))) }

function _escolherVersao(n) {
  for (let v = 1; v <= 10; v++) {
    const bitsContagem = v <= 9 ? 8 : 16
    if (4 + bitsContagem + 8 * n <= _dadosDaVersao(v) * 8) return v
  }
  throw new Error('texto longo demais para o QR (máximo de 213 bytes)')
}

export function codewordsDeDados(texto, versao) {
  const bytes = _utf8(texto)
  const capacidade = _dadosDaVersao(versao) * 8
  const bits = []
  const por = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  por(0b0100, 4)
  por(bytes.length, versao <= 9 ? 8 : 16)
  for (const b of bytes) por(b, 8)
  if (bits.length > capacidade) throw new Error('texto longo demais para esta versão do QR')
  por(0, Math.min(4, capacidade - bits.length))
  while (bits.length % 8) bits.push(0)
  const cw = []
  for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2))
  for (let pad = 0xEC; cw.length < capacidade / 8; pad ^= 0xEC ^ 0x11) cw.push(pad)
  return cw
}

// Divide em blocos, calcula a correção de cada um e intercala
export function codewordsFinais(dados, versao) {
  const [ecc, n1, d1, n2, d2] = _BLOCOS_M[versao]
  const blocos = []
  let k = 0
  for (let i = 0; i < n1 + n2; i++) {
    const tam = i < n1 ? d1 : d2
    const d = dados.slice(k, k + tam); k += tam
    blocos.push({ d, e: correcaoRS(d, ecc) })
  }
  const saida = []
  const maior = Math.max(d1, d2)
  for (let i = 0; i < maior; i++) for (const b of blocos) if (i < b.d.length) saida.push(b.d[i])
  for (let i = 0; i < ecc; i++) for (const b of blocos) saida.push(b.e[i])
  return saida
}

// ── A matriz ───────────────────────────────────────────────────────
function _matrizBase(versao) {
  const tam = versao * 4 + 17
  const m = Array.from({ length: tam }, () => new Array(tam).fill(false))
  const fixo = Array.from({ length: tam }, () => new Array(tam).fill(false))
  const pinta = (x, y, escuro) => { m[y][x] = escuro; fixo[y][x] = true }
  // Linhas de tempo
  for (let i = 0; i < tam; i++) { pinta(6, i, i % 2 === 0); pinta(i, 6, i % 2 === 0) }
  // Os três localizadores, com a borda clara
  const localizador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy
      if (x < 0 || y < 0 || x >= tam || y >= tam) continue
      const d = Math.max(Math.abs(dx), Math.abs(dy))
      pinta(x, y, d !== 2 && d !== 4)
    }
  }
  localizador(3, 3); localizador(tam - 4, 3); localizador(3, tam - 4)
  // Alinhamento (menos onde cruza os localizadores)
  const pos = _ALINHAMENTO[versao], n = pos.length
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      pinta(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }
  // Áreas do formato (preenchidas depois) e o módulo escuro fixo
  for (let i = 0; i < 9; i++) { fixo[8][i] = true; fixo[i][8] = true }
  for (let i = 0; i < 8; i++) { fixo[8][tam - 1 - i] = true; fixo[tam - 1 - i][8] = true }
  pinta(8, tam - 8, true)
  // Versão (7 em diante)
  if (versao >= 7) {
    const bits = bitsDaVersao(versao)
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1
      const a = tam - 11 + (i % 3), b = Math.floor(i / 3)
      pinta(a, b, bit); pinta(b, a, bit)
    }
  }
  return { m, fixo, tam }
}

function _desenharFormato(m, tam, nivel, mascara) {
  const bits = bitsDoFormato(nivel, mascara)
  const bit = i => ((bits >>> i) & 1) === 1
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i)
  m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8)
  for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i)
  for (let i = 0; i < 8; i++) m[8][tam - 1 - i] = bit(i)
  for (let i = 8; i < 15; i++) m[tam - 15 + i][8] = bit(i)
  m[tam - 8][8] = true
}

function _desenharDados(m, fixo, tam, cw) {
  let i = 0
  for (let dir = tam - 1; dir >= 1; dir -= 2) {
    if (dir === 6) dir = 5
    for (let vert = 0; vert < tam; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = dir - j
        const subindo = ((dir + 1) & 2) === 0
        const y = subindo ? tam - 1 - vert : vert
        if (!fixo[y][x] && i < cw.length * 8) {
          m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1
          i++
        }
      }
    }
  }
}

export const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
]

function _aplicarMascara(m, fixo, tam, k) {
  for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!fixo[y][x] && MASCARAS[k](x, y)) m[y][x] = !m[y][x]
}

// Penalidade da norma (regras 1 a 4): a máscara de menor penalidade vence
function _penalidade(m, tam) {
  let p = 0
  const linhas = [...m, ...m[0].map((_, x) => m.map(l => l[x]))]
  for (const l of linhas) {
    let corrida = 1
    for (let i = 1; i <= tam; i++) {
      if (i < tam && l[i] === l[i - 1]) corrida++
      else { if (corrida >= 5) p += 3 + corrida - 5; corrida = 1 }
    }
    const s = l.map(b => (b ? '1' : '0')).join('')
    for (const padrao of ['10111010000', '00001011101']) {
      let k = s.indexOf(padrao)
      while (k !== -1) { p += 40; k = s.indexOf(padrao, k + 1) }
    }
  }
  for (let y = 0; y < tam - 1; y++) for (let x = 0; x < tam - 1; x++) {
    const c = m[y][x]
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3
  }
  let escuros = 0
  for (const l of m) for (const b of l) if (b) escuros++
  const total = tam * tam
  p += Math.ceil(Math.abs(escuros * 20 - total * 10) / total - 1) * 10
  return p
}

// A matriz do QR (linhas de cima para baixo; true = escuro), sem a margem
export function matrizQR(texto, { mascara = null } = {}) {
  const versao = _escolherVersao(_utf8(texto).length)
  const cw = codewordsFinais(codewordsDeDados(texto, versao), versao)
  let melhor = null
  for (let k = 0; k < 8; k++) {
    if (mascara != null && k !== mascara) continue
    const { m, fixo, tam } = _matrizBase(versao)
    _desenharDados(m, fixo, tam, cw)
    _aplicarMascara(m, fixo, tam, k)
    _desenharFormato(m, tam, 'M', k)
    const p = _penalidade(m, tam)
    if (!melhor || p < melhor.p) melhor = { p, m, versao, mascara: k }
  }
  return { matriz: melhor.m, versao: melhor.versao, mascara: melhor.mascara }
}

// O QR em SVG, com a margem clara de 4 módulos da norma (para a tela)
export function svgQR(texto, { tamanho = 160, rotulo = '' } = {}) {
  const { matriz } = matrizQR(texto)
  const n = matriz.length, total = n + 8
  let d = ''
  matriz.forEach((linha, y) => linha.forEach((escuro, x) => { if (escuro) d += `M${x + 4} ${y + 4}h1v1h-1z` }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${tamanho}" height="${tamanho}" shape-rendering="crispEdges" role="img"${rotulo ? ` aria-label="${rotulo.replace(/"/g, '&quot;')}"` : ' aria-hidden="true"'}><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}
