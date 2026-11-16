// Sistema visual: contraste dos tokens nos dois temas e um só estilo de foco.
//
//   npm run testar-unidade
//
// Lê css/tokens.css (o bloco :root é o tema escuro; .light, o claro), resolve
// var() e as cores com transparência sobre a superfície, e confere as razões
// de contraste do WCAG 2.2:
//   - texto (--text, --text2, --text3): 4,5:1 (1.4.3) no fundo, nos painéis e
//     nos campos;
//   - anel de foco (--foco) e borda de campo (--borda-campo): 3:1 (1.4.11).
// Depois varre os CSS: o anel de foco usa --foco (ou currentColor, quando o
// fundo é a própria cor de destaque), e nenhum foco é apagado sem outro no
// lugar.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ler  = nome => fs.readFileSync(path.join(RAIZ, 'css', nome), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// ── Tokens ────────────────────────────────────────────────────
function bloco(css, seletor) {
  const i = css.indexOf(`${seletor} {`)
  assert.ok(i >= 0, `bloco ${seletor} em tokens.css`)
  const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i))
  return Object.fromEntries([...corpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]))
}
const TOKENS = ler('tokens.css')
const ESCURO = bloco(TOKENS, ':root')
const TEMAS  = { escuro: ESCURO, claro: { ...ESCURO, ...bloco(TOKENS, '.light') } }

function valor(tema, nome, profundidade = 0) {
  assert.ok(profundidade < 10, `referência circular em ${nome}`)
  const v = tema[nome]
  assert.ok(v, `token ${nome}`)
  const ref = v.match(/^var\((--[\w-]+)\)$/)
  return ref ? valor(tema, ref[1], profundidade + 1) : v
}

function rgba(cor) {
  let m = cor.match(/^#([0-9a-f]{6})$/i)
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).concat(1)
  m = cor.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  assert.ok(m, `cor que o teste sabe ler: ${cor}`)
  return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]
}

// Cor com transparência pintada sobre a superfície
function sobre(cor, fundo) {
  const [r, g, b, a] = rgba(cor)
  const f = rgba(fundo)
  return [r, g, b].map((c, i) => c * a + f[i] * (1 - a))
}

function luminancia([r, g, b]) {
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function razao(tema, frente, fundo) {
  const f = rgba(valor(tema, fundo)).slice(0, 3)
  const l1 = luminancia(sobre(valor(tema, frente), valor(tema, fundo)))
  const l2 = luminancia(f)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const SUPERFICIES = ['--bg', '--card', '--card2', '--lateral']

function conferir(frentes, fundos, minimo) {
  const falhas = []
  for (const [nomeTema, tema] of Object.entries(TEMAS)) {
    for (const frente of frentes) {
      for (const fundo of fundos) {
        const r = razao(tema, frente, fundo)
        if (r < minimo) falhas.push(`${nomeTema}: ${frente} sobre ${fundo} = ${r.toFixed(2)}:1`)
      }
    }
  }
  assert.deepEqual(falhas, [], `abaixo de ${minimo}:1`)
}

test('texto: 4,5:1 sobre o fundo, os painéis e os campos, nos dois temas', () => {
  conferir(['--text', '--text2', '--text3'], SUPERFICIES, 4.5)
})

test('anel de foco: 3:1 sobre todas as superfícies, nos dois temas', () => {
  conferir(['--foco'], [...SUPERFICIES, '--card3'], 3)
})

test('borda de campo: 3:1 sobre o campo e o que fica em volta dele, nos dois temas', () => {
  conferir(['--borda-campo'], SUPERFICIES, 3)
})

test('o anel de foco não é a terracota', () => {
  for (const tema of Object.values(TEMAS)) {
    assert.notEqual(valor(tema, '--foco'), valor(tema, '--gold'))
    assert.notEqual(valor(tema, '--foco'), valor(tema, '--gold-fill'))
  }
})

// ── Foco nos CSS ──────────────────────────────────────────────
const CSS = fs.readdirSync(path.join(RAIZ, 'css')).filter(n => n.endsWith('.css'))
const REGRAS = CSS.flatMap(nome =>
  [...ler(nome).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ nome, seletor: m[1].trim().replace(/\s+/g, ' '), corpo: m[2] })))

test('todo anel de foco usa --foco', () => {
  const fora = REGRAS
    .filter(r => /:focus/.test(r.seletor))
    .flatMap(r => [...r.corpo.matchAll(/outline\s*:\s*([^;]+)/g)].map(m => ({ ...r, valor: m[1].trim() })))
    .filter(r => !/^(none|0)$/.test(r.valor) && !/var\(--foco\)|currentColor/.test(r.valor))
    .map(r => `${r.nome}: ${r.seletor} { outline: ${r.valor} }`)
  assert.deepEqual(fora, [])
})

// Onde o foco some de propósito, e por quê. Qualquer outro "outline: none"
// num seletor de foco é um foco apagado sem substituto
const FOCO_APAGADO_DE_PROPOSITO = {
  ':focus':                         'o anel vem de :focus-visible, logo abaixo',
  'main:focus':                     'destino do link de salto; não é controle',
  '.tour-popover:focus':            'o anel vem de .tour-popover:focus-visible',
  '.comentario-campo textarea:focus': 'o anel fica na caixa toda (.comentario-campo:focus-within)',
}

test('nenhum foco é apagado sem outro no lugar', () => {
  const apagados = REGRAS
    .filter(r => /:focus/.test(r.seletor) && /outline\s*:\s*(none|0)\s*(;|$)/.test(r.corpo))
    .flatMap(r => r.seletor.split(',').map(s => s.trim()).filter(s => /:focus/.test(s)).map(s => ({ ...r, s })))
    .filter(r => !(r.s in FOCO_APAGADO_DE_PROPOSITO))
    .map(r => `${r.nome}: ${r.s}`)
  assert.deepEqual(apagados, [])
})

// ── Escala de texto ───────────────────────────────────────────
// Texto usa os quatro degraus (--t-pequeno 12, --t-corpo 14, --t-titulo-3 16,
// --t-titulo-2 20). Literal só para display (1,3rem ou mais, clamp, em
// relativo ao pai) e o 16 px da raiz e do campo da paleta
test('tamanho de texto só pela escala, e nada abaixo de 12 px', () => {
  const fora = []
  for (const nome of CSS) {
    const css = ler(nome)
    for (const m of css.matchAll(/(?:font-size\s*:|\bfont\s*:\s*\d{3})\s*([^;}\s/]+)/g)) {
      const v = m[1].trim()
      if (/^var\(--t-/.test(v) || /^clamp\(/.test(v) || /^[\d.]+em$/.test(v) || v === '16px' || v === 'inherit') continue
      const rem = v.match(/^([\d.]+)rem$/)
      if (rem && +rem[1] >= 1.3) continue
      fora.push(`${nome}: ${v}`)
    }
  }
  assert.deepEqual(fora, [])
})

// ── Papéis de cor ─────────────────────────────────────────────
// A terracota tem quatro papéis: ação primária, item ou aba ativa, urgência e
// "com você". Número e valor são dado: ficam na cor do texto, salvo quando o
// próprio número é o item ativo ou a fila da pessoa
const NUMERO_OU_VALOR = /(-n|-num|-valor|-dur|dt-numeral|-soma)\b/
const NUMERO_COM_PAPEL = /eh-fila|\.atual|\.agora|\.bv-|\.tour-n/

test('contagens e valores não usam a terracota', () => {
  const fora = REGRAS
    .filter(r => NUMERO_OU_VALOR.test(r.seletor) && !NUMERO_COM_PAPEL.test(r.seletor) && /var\(--gold/.test(r.corpo))
    .map(r => `${r.nome}: ${r.seletor}`)
  assert.deepEqual(fora, [])
})

test('etapa tem cor por categoria; perfil não tem cor', async () => {
  const { STATUS, CATEGORIA_ETAPA, STATUS_DOT_COLOR } = await import('../js/constants.js')
  assert.deepEqual(Object.keys(CATEGORIA_ETAPA).sort(), Object.values(STATUS).sort())
  assert.deepEqual([...new Set(Object.values(CATEGORIA_ETAPA))].sort(), ['aguardando', 'andamento', 'concluido', 'encerrado'])
  assert.equal(new Set(Object.values(STATUS_DOT_COLOR)).size, 4)
  assert.equal(CATEGORIA_ETAPA.pago, 'concluido', 'só Pago é concluído')
  const js = fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js'))
    .map(n => fs.readFileSync(path.join(RAIZ, 'js', n), 'utf8')).join('\n')
  assert.doesNotMatch(js, /PERFIS_COLOR|COR_PERFIL|corPerfil/, 'nenhum mapa de cor de perfil')
  assert.doesNotMatch(js, /COR_STATUS|STATUS_COLOR\b/, 'um mapa só de cor de etapa (CATEGORIA_ETAPA)')
  assert.doesNotMatch(js, /dot-gold/, 'nenhuma etapa em terracota')
})

test('o foco não usa a terracota nem como sombra', () => {
  const terracota = REGRAS
    .filter(r => /:focus/.test(r.seletor) && /(box-shadow|outline)\s*:[^;]*var\(--gold/.test(r.corpo))
    .map(r => `${r.nome}: ${r.seletor}`)
  assert.deepEqual(terracota, [])
})
