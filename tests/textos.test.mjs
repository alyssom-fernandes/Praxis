// Textos da interface: os dois idiomas têm as mesmas chaves e os mesmos
// marcadores ({n}, {nome}...), toda chave que o código pede existe, e nenhum
// módulo do app escreve texto de tela fora dos dicionários (js/constants.js e
// js/textos-relatorios.js).
//
//   npm run testar-unidade
//
// A varredura lê o código de js/*.js sem executá-lo: separa comentários,
// textos entre aspas e o HTML dos templates, e acusa o que parece texto para
// a pessoa ler. Ficam de fora as mensagens de console e de new Error(), que
// são para quem mantém o código (o erro que vai para a tela usa t(), como em
// throw new Error(t('pedidoJaAssumido'))), e os nomes e e-mails de pessoas
// (nome: e email:), que são dados.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRADUCOES } from '../js/constants.js'
import { TEXTOS_RELATORIOS } from '../js/textos-relatorios.js'

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Dicionários, configuração e dados: não são texto de tela escrito no código
const FORA_DA_VARREDURA = {
  'constants.js':          'dicionário principal e listas de valores gravados',
  'textos-relatorios.js':  'dicionário da tela de relatórios',
  'config.js':             'configuração local do Firebase',
  'config.example.js':     'modelo da configuração',
  'demo-reset.js':         'semente da demonstração: pedidos e avisos gravados no banco',
  'sistema.js':            'catálogo do sistema visual (?tela=sistema), ferramenta de quem mantém o código',
}

// O que aparece no código sem ser texto a traduzir: teclas do evento de
// teclado e dos atalhos, a marca e a assinatura, siglas e nomes de bibliotecas
// e fontes
const PERMITIDOS = new Set([
  'Escape', 'Enter', 'Tab', 'Home', 'End', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'ContextMenu', 'F10',
  'Esc', 'Ctrl', 'Ctrl K', 'OK',
  'Praxis', 'PR', 'XIS', 'AFN', 'SYSTEMS', 'by Alyssom Fernandes',
  'CNPJ', 'CSV', 'PDF', 'ExcelJS', 'Calibri', 'Helvetica',
])

// Funções que recebem uma chave do dicionário como primeiro argumento
const FUNCOES_DE_TEXTO = new Set(['t', 'tf', 'tr'])

const ACENTO = /[áàâãçéêíóôõúÁÀÂÃÇÉÊÍÓÔÕÚ]/
const PALAVRA_PT = /(^|\s)(o|a|os|as|e|de|do|da|dos|das|em|no|na|nos|nas|um|uma|para|com|por|pelo|pela|ao|aos|que|se|sem|seu|sua|este|esta|ou|mais|foi)(\s|$)/i
const ATRIBUTOS_DE_TEXTO_NOMES = new Set(['title', 'aria-label', 'aria-description', 'placeholder', 'alt', 'data-tip'])

// ── Leitura do código ─────────────────────────────────────────
// Devolve os textos entre aspas e os pedaços fixos dos templates (com a linha)
// e as chaves pedidas a t(), tf() e tr(). Pula comentários, expressões
// regulares e os argumentos de console.*() e de new Error().
function lerModulo(src) {
  const textos = [], chaves = []
  let i = 0, linha = 1
  let anterior = ''        // último sinal de código ('x' para palavra ou valor)
  let palavra = ''         // última palavra lida, se foi o último token
  let palavraAntes = ''    // a palavra antes dela (para "new Error")
  let chamada = null       // função cujo "(" acabou de abrir
  let chaveDoObjeto = ''   // em "nome: 'Ana'", a chave antes dos dois-pontos
  let parenteses = 0
  const ignorando = []     // profundidades em que um console.*( ou new Error( abriu
  const n = src.length
  const andar = () => { if (src[i] === '\n') linha++; i++ }
  const ignorar = () => ignorando.length > 0

  function guardar(tipo, valor, l) {
    if (ignorar()) return
    if (tipo === 'aspas' && anterior === '(' && FUNCOES_DE_TEXTO.has(chamada)) { chaves.push({ funcao: chamada, chave: valor, linha: l }); return }
    if (tipo === 'aspas' && anterior === ':' && ['nome', 'email'].includes(chaveDoObjeto)) return
    textos.push({ tipo, valor, linha: l })
  }

  function lerAspas(q) {
    const l = linha
    andar()
    let v = ''
    while (i < n && src[i] !== q && src[i] !== '\n') {
      if (src[i] === '\\') { v += src[i + 1]; andar(); andar(); continue }
      v += src[i]; andar()
    }
    andar()
    guardar('aspas', v, l)
    anterior = 'x'; palavra = ''
  }

  function lerTemplate() {
    andar()
    const l = linha, partes = []
    let v = ''
    while (i < n) {
      const c = src[i]
      if (c === '\\') { v += src[i + 1]; andar(); andar(); continue }
      if (c === '`') { andar(); break }
      if (c === '$' && src[i + 1] === '{') {
        partes.push(v)
        v = ''
        andar(); andar()
        anterior = '{'; palavra = ''
        lerCodigo(true)
        continue
      }
      v += c; andar()
    }
    partes.push(v)
    guardar('template', partes, l)
    anterior = 'x'; palavra = ''
  }

  function lerRegex() {
    andar()
    let classe = false
    while (i < n && src[i] !== '\n') {
      const r = src[i]
      if (r === '\\') { andar(); andar(); continue }
      if (r === '[') classe = true
      else if (r === ']') classe = false
      else if (r === '/' && !classe) { andar(); break }
      andar()
    }
    while (i < n && /[a-z]/i.test(src[i])) andar()
    anterior = 'x'; palavra = ''
  }

  function lerCodigo(dentroDeTemplate) {
    let chaves = 0
    while (i < n) {
      const c = src[i], d = src[i + 1]
      if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') andar(); continue }
      if (c === '/' && d === '*') { andar(); andar(); while (i < n && !(src[i] === '*' && src[i + 1] === '/')) andar(); andar(); andar(); continue }
      if (c === "'" || c === '"') { lerAspas(c); continue }
      if (c === '`') { lerTemplate(); continue }
      if (c === '/' && (anterior === '' || '(,=:[!&|?{};+-*%<>~^'.includes(anterior) ||
          ['return', 'typeof', 'case', 'of', 'in', 'void'].includes(palavra))) { lerRegex(); continue }
      if (/\s/.test(c)) { andar(); continue }
      if (/[A-Za-z_$]/.test(c)) {
        let w = ''
        while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { w += src[i]; andar() }
        palavraAntes = palavra
        palavra = w
        anterior = 'x'
        continue
      }
      if (dentroDeTemplate) {
        if (c === '{') chaves++
        if (c === '}') { if (chaves === 0) { andar(); return } chaves-- }
      }
      if (c === '(') {
        chamada = palavra || null
        // console.log( e afins: o "." antes do método já passou; basta ver o objeto
        const antes = src.slice(Math.max(0, i - 40), i)
        if (/\bconsole\s*\.\s*[a-z]+\s*$/.test(antes) || (palavra === 'Error' && palavraAntes === 'new')) ignorando.push(parenteses)
        parenteses++
      } else if (c === ')') {
        parenteses--
        if (ignorando.length && ignorando[ignorando.length - 1] === parenteses) ignorando.pop()
      }
      if (c === ':') chaveDoObjeto = palavra
      palavraAntes = palavra
      palavra = ''
      anterior = c
      andar()
    }
  }

  lerCodigo(false)
  return { textos, chaves }
}

// Pedaços de texto de um template. Com HTML, percorre as partes guardando o
// estado (texto, dentro de uma tag, valor de atributo): o que fica entre tags
// e os atributos de texto (title, aria-label...) são candidatos, inclusive
// os pedaços curtos entre duas expressões, como o " de " de `${a} de ${b}`.
// Sem HTML, cada parte é avaliada como um texto entre aspas.
function pedacosDoTemplate(partes) {
  if (!partes.some(p => /<\/?[a-z]/i.test(p))) return partes.map(valor => ({ valor, html: false }))
  const pedacos = []
  let estado = 'texto', texto = '', nome = '', atributo = '', aspas = '', valor = ''
  partes.forEach((parte, k) => {
    for (let i = 0; i < parte.length; i++) {
      const c = parte[i]
      if (estado === 'texto') {
        if (c === '<' && /[a-z/!]/i.test(parte[i + 1] || '')) { pedacos.push(texto); texto = ''; estado = 'tag'; nome = '' }
        else texto += c
      } else if (estado === 'tag') {
        if (c === '>') estado = 'texto'
        else if (c === '"' || c === "'") { aspas = c; atributo = nome; valor = ''; estado = 'valor' }
        else if (/[\w-]/.test(c)) nome += c
        else if (c !== '=') nome = ''
      } else if (c === aspas) {
        if (ATRIBUTOS_DE_TEXTO_NOMES.has(atributo)) pedacos.push(valor)
        estado = 'tag'; nome = ''
      } else valor += c
    }
    // Uma expressão ${...} corta o texto em pedaços; dentro de um atributo, só ocupa lugar
    if (k < partes.length - 1) {
      if (estado === 'texto') { pedacos.push(texto); texto = '' } else if (estado === 'valor') valor += ' '
    }
  })
  pedacos.push(texto)
  return pedacos.map(v => ({ valor: v, html: true }))
}

function pareceTextoDeTela(bruto, emHtml) {
  const v = bruto.replace(/&[a-z]+;|&#\d+;/g, ' ').trim()
  if (!/[A-Za-zÀ-ú]{2,}/.test(v)) return false
  if (PERMITIDOS.has(v.replace(/[\s·•—–:|,.()]+/g, ' ').trim())) return false
  if (emHtml) return true // texto entre tags ou num atributo de texto
  if (/^[.#[]/.test(v) || /^(https?:|\/|\.\/|data:|mailto:)/.test(v)) return false
  if (/^[a-z0-9_$-]+$/.test(v) || /^[a-z][a-zA-Z0-9]*$/.test(v) || /^[A-Z0-9_]+$/.test(v)) return false
  if (/^[a-z0-9 _:-]+$/.test(v) && !PALAVRA_PT.test(v)) return false // classes e valores
  if (/[{};=]|=>/.test(v) && !ACENTO.test(v)) return false
  if (ACENTO.test(v)) return true
  if (/\s/.test(v) && PALAVRA_PT.test(v)) return true
  return /^[A-ZÀ-Ú][a-zà-ú]+/.test(v)
}

const MODULOS = fs.readdirSync(path.join(RAIZ, 'js')).filter(f => f.endsWith('.js')).sort()
const lido = Object.fromEntries(MODULOS.map(f => [f, lerModulo(fs.readFileSync(path.join(RAIZ, 'js', f), 'utf8'))]))

// ── Testes ────────────────────────────────────────────────────
const marcadores = s => [...String(s).matchAll(/\{([a-zA-Z]+)\}/g)].map(m => m[1]).sort()

function conferirParidade(nome, dic) {
  const pt = Object.keys(dic.pt)
  const en = Object.keys(dic.en)
  assert.deepEqual(pt.filter(k => !en.includes(k)), [], `${nome}: faltam em inglês`)
  assert.deepEqual(en.filter(k => !pt.includes(k)), [], `${nome}: faltam em português`)
  const vazios = pt.filter(k => !String(dic.pt[k]).trim() || !String(dic.en[k]).trim())
  assert.deepEqual(vazios, [], `${nome}: textos vazios`)
  const divergentes = pt.filter(k => marcadores(dic.pt[k]).join() !== marcadores(dic.en[k]).join())
  assert.deepEqual(divergentes, [], `${nome}: marcadores diferentes entre os idiomas`)
}

test('toda chave de texto existe nos dois idiomas, com os mesmos marcadores', () => {
  conferirParidade('constants.js', TRADUCOES)
  conferirParidade('textos-relatorios.js', TEXTOS_RELATORIOS)
})

test('toda chave que o código pede a t(), tf() e tr() existe no dicionário', () => {
  const faltam = []
  for (const [arquivo, { chaves }] of Object.entries(lido)) {
    for (const { funcao, chave, linha } of chaves) {
      const existe = chave in TRADUCOES.pt || (funcao === 'tr' && chave in TEXTOS_RELATORIOS.pt)
      if (!existe) faltam.push(`${arquivo}:${linha}: ${funcao}('${chave}')`)
    }
  }
  assert.deepEqual(faltam, [], `${faltam.length} chaves sem texto:\n  ${faltam.join('\n  ')}`)
})

function textosForaDoDicionario(arquivo, textos) {
  const fora = []
  for (const { tipo, valor, linha } of textos) {
    const pedacos = tipo === 'template' ? pedacosDoTemplate(valor)
      : /<[a-z][^>]*>/i.test(valor) ? pedacosDoTemplate([valor]) : [{ valor, html: false }]
    for (const p of pedacos) {
      // Fora do HTML, um pedaço de template só com palavras e uma delas em
      // português ("de", "em"...) também é texto: `${pagas} de ${total}`
      const solto = tipo === 'template' && !p.html && /^[\sA-Za-zÀ-ú]+$/.test(p.valor) && PALAVRA_PT.test(p.valor)
      if (solto || pareceTextoDeTela(p.valor, p.html)) fora.push(`${arquivo}:${linha}: ${p.valor.trim()}`)
    }
  }
  return fora
}

test('a varredura acusa texto de tela e deixa passar o que não é', () => {
  const acusados = src => textosForaDoDicionario('exemplo.js', lerModulo(src).textos).map(s => s.replace(/^exemplo\.js:\d+: /, ''))
  // Acusa: texto entre aspas, no HTML, num atributo e entre duas expressões
  assert.deepEqual(acusados("prxToast('Salvar alterações')"), ['Salvar alterações'])
  assert.deepEqual(acusados("const b = `<button title=\"Remover\">${x}</button>`"), ['Remover'])
  assert.deepEqual(acusados("const s = `<span>${a} de ${b}</span>`"), ['de'])
  assert.deepEqual(acusados("const s = `${a} de ${b}`"), ['de'])
  assert.deepEqual(acusados("const s = `<p>Aberto por ${nome}</p>`"), ['Aberto por'])
  // Deixa passar: chave, console, erro interno, nome de pessoa, classes e teclas
  assert.deepEqual(acusados([
    "t('dtAbertoPor', { nome })",
    "console.warn('Falha ao carregar:', e)",
    "throw new Error('Convite expirado.')",
    "const p = { nome: 'Ana Souza', email: 'ana@x.com' }",
    "el.className = 'btn btn-primary'",
    "if (e.key === 'Escape') fechar()",
    "const h = `<div class=\"${cls}\" data-id=\"${id}\">${t('x')}</div>`",
  ].join('\n')), [])
})

test('nenhum módulo do app escreve texto de tela fora dos dicionários', () => {
  const fora = Object.entries(lido)
    .filter(([arquivo]) => !(arquivo in FORA_DA_VARREDURA))
    .flatMap(([arquivo, { textos }]) => textosForaDoDicionario(arquivo, textos))
  assert.deepEqual(fora, [], `${fora.length} textos fora do dicionário:\n  ${fora.join('\n  ')}`)
})
