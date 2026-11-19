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

test('texto: 4,5:1 sobre o fundo, os painéis e os campos, no hover e nos dois temas', () => {
  conferir(['--text', '--text2', '--text3'], [...SUPERFICIES, '--card3'], 4.5) // --card3: o cartão sob o mouse
})

test('selo Urgente: o texto do contorno com 4,5:1 nas superfícies, nos dois temas', () => {
  conferir(['--urgente-texto'], [...SUPERFICIES, '--card3'], 4.5)
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

// ── Espaço ────────────────────────────────────────────────────
// Padding, margin e gap só pelos degraus --esp-* (base 8). Fora da escala,
// só 0, 1 px (compensa uma borda), unidades relativas (%, em, vh, vw), a área
// segura do celular (env) e as alturas fixas que o espaço desconta. Cada
// outro literal precisa de motivo aqui
const PROP_ESPACO = /(?<![\w-])((?:padding|margin|gap|row-gap|column-gap|scroll-padding)(?:-[a-z-]+)?)\s*:\s*([^;{}]+)/g
const VAR_DE_ESPACO = /^--(esp-\d+|barra-inferior-h|acoes-fixas-h|faixa-demo-h)$/
const ESPACO_FORA_DA_ESCALA = {
  '.rel-plot':        'recuo igual à largura dos rótulos do eixo Y do gráfico',
  '.rel-eixo-x':      'alinha o eixo X com o gráfico (.rel-plot)',
  '.login-shell':     'entrada: respiro fluido (clamp) entre o celular e a tela grande',
  '.entrada-miolo':   'entrada: respiro fluido (clamp)',
  '.entrada-titulo':  'entrada: respiro fluido (clamp)',
  '.entrada-etapas':  'entrada: régua fluida (clamp)',
}

function espacoForaDaEscala(valor) {
  const falhas = []
  for (const m of valor.matchAll(/var\((--[\w-]+)/g)) if (!VAR_DE_ESPACO.test(m[1])) falhas.push(`var(${m[1]})`)
  const resto = valor.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, '').replace(/env\([^()]*\)/g, '')
  for (const m of resto.matchAll(/(?<![\w.])-?(\d*\.?\d+)(px|rem)\b/g)) if (m[0].replace('-', '') !== '1px') falhas.push(m[0])
  return falhas
}

test('espaço só pela escala --esp-* (base 8)', () => {
  const fora = []
  const usadas = new Set()
  for (const r of REGRAS) {
    for (const m of r.corpo.matchAll(PROP_ESPACO)) {
      const falhas = espacoForaDaEscala(m[2])
      if (!falhas.length) continue
      const seletores = r.seletor.split(',').map(s => s.trim())
      if (seletores.every(s => s in ESPACO_FORA_DA_ESCALA)) { seletores.forEach(s => usadas.add(s)); continue }
      fora.push(`${r.nome}: ${r.seletor} { ${m[1]}: ${m[2].trim()} }`)
    }
  }
  // Exceção que não serve mais sai da lista
  for (const s of Object.keys(ESPACO_FORA_DA_ESCALA)) if (!usadas.has(s)) fora.push(`exceção sem uso: ${s}`)
  // Estilos escritos no JS (style="…")
  for (const n of fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js'))) {
    const js = fs.readFileSync(path.join(RAIZ, 'js', n), 'utf8')
    for (const s of js.matchAll(/style="([^"]*)"/g)) {
      for (const m of s[1].matchAll(PROP_ESPACO)) if (espacoForaDaEscala(m[2]).length) fora.push(`${n}: style="${s[1]}"`)
    }
  }
  assert.deepEqual(fora, [])
})

test('a escala de espaço tem os 13 degraus da base 8', () => {
  const degraus = Object.entries(ESCURO).filter(([k]) => /^--esp-\d+$/.test(k)).map(([, v]) => parseInt(v, 10))
  assert.deepEqual(degraus, [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80])
})

// ── Componentes únicos ────────────────────────────────────────
// Um estado vazio (.vazio, estadoVazio em js/ui.js) e uma régua de etapas
// (.regua: entrada, detalhe e quadro no celular). Os desenhos antigos não
// voltam
test('um estado vazio e uma régua de etapas', () => {
  const ANTIGOS = /\b(empty-state(-branded)?|empty-(icon|title|sub)|pedidos-vazio[\w-]*|cfg-vazio[\w-]*|dt-vazio[\w-]*|rel-vazio-(ic|tit|txt)|rel-erro|notif-empty[\w-]*|cmd-empty[\w-]*|caminho-(etapa|num|nome|sub)|entrada-medalhao|entrada-etapa-nome)\b/
  const achados = []
  for (const nome of CSS) for (const m of ler(nome).matchAll(new RegExp(ANTIGOS, 'g'))) achados.push(`${nome}: ${m[0]}`)
  for (const n of fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js'))) {
    for (const m of fs.readFileSync(path.join(RAIZ, 'js', n), 'utf8').matchAll(new RegExp(ANTIGOS, 'g'))) achados.push(`${n}: ${m[0]}`)
  }
  assert.deepEqual(achados, [])
  const js = n => fs.readFileSync(path.join(RAIZ, 'js', n), 'utf8')
  // A entrada, o detalhe e o quadro (cada tela pode estar dividida em módulos)
  const tela = nomes => nomes.map(js).join('\n')
  for (const [nome, partes] of [['entrada', ['auth.js']], ['detalhe', ['pedido-detalhe.js', 'detalhe-painel.js', 'detalhe-acoes.js', 'detalhe-dados.js']], ['quadro', ['pedidos.js', 'pedidos-fluxo.js', 'pedidos-quadro.js']]]) {
    assert.match(tela(partes), /regua-etapa/, `${nome} usa a régua comum`)
    assert.match(tela(partes), /STATUS_LABEL\[/, `${nome} nomeia a etapa por STATUS_LABEL`)
  }
})

// ── Camadas ───────────────────────────────────────────────────
// Nove camadas (css/tokens.css), de baixo para cima. z-index global só por
// elas, ou um degrau acima ou abaixo de uma delas (calc(var(--z-…) ± n), até
// 9) para quem convive na mesma camada; literal só para o empilhamento local
// de um componente (até 20)
const NOVE_CAMADAS = ['fixo', 'barra', 'popover', 'folha', 'cortina', 'modal', 'tour', 'aviso', 'dica']

test('as nove camadas, em ordem', () => {
  const camadas = Object.entries(ESCURO).filter(([k]) => k.startsWith('--z-'))
  assert.deepEqual(camadas.map(([k]) => k.slice(4)), NOVE_CAMADAS)
  const valores = camadas.map(([, v]) => +v)
  assert.deepEqual(valores, [...valores].sort((a, b) => a - b), 'de baixo para cima')
  // Os degraus "+ n" de uma camada não alcançam a seguinte
  valores.slice(1).forEach((v, i) => assert.ok(v - valores[i] > 9, `${camadas[i][0]} e ${camadas[i + 1][0]}`))
})

test('z-index global só pelas nove camadas', () => {
  const camada = `var\\(--z-(?:${NOVE_CAMADAS.join('|')})\\)`
  const permitido = new RegExp(`^(?:${camada}|calc\\(${camada} [+-] [1-9]\\))$`)
  const fora = []
  for (const nome of CSS) {
    for (const m of ler(nome).matchAll(/z-index\s*:\s*([^;}]+)/g)) {
      const v = m[1].trim()
      if (permitido.test(v)) continue
      if (/^-?\d+$/.test(v) && Math.abs(+v) <= 20) continue
      fora.push(`${nome}: ${v}`)
    }
  }
  const js = fs.readdirSync(path.join(RAIZ, 'js')).filter(n => n.endsWith('.js'))
    .flatMap(n => [...fs.readFileSync(path.join(RAIZ, 'js', n), 'utf8').matchAll(/zIndex\s*[:=]\s*['"]?(\d{2,})/g)].map(m => `${n}: ${m[1]}`))
  assert.deepEqual([...fora, ...js], [])
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
