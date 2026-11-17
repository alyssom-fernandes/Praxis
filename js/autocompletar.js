// Busca própria num campo de texto (o fornecedor da cotação, da compra e da
// compra já feita). A lista nativa (datalist) aparece de um jeito no iPhone e
// de outro no Android; esta é igual nos dois e anda pelo teclado: setas,
// Enter escolhe, Esc fecha. As opções são { nome, usos }: com o campo vazio,
// vêm as mais usadas; digitando, as que começam pelo texto vêm primeiro.
import { esc, normalizarTexto } from './utils.js'

let _seq = 0

export function autocompletar(input, opcoes, { limite = 8, aoEscolher } = {}) {
  if (!input || input._autocompletar) return
  const lista = document.createElement('ul')
  const id = `autocompletar-${++_seq}`
  lista.id = id
  lista.className = 'autocompletar-lista'
  lista.setAttribute('role', 'listbox')
  lista.hidden = true
  // O campo e a lista numa âncora própria: a lista abre logo abaixo do campo
  // (no grupo do formulário, que é flex, ela cairia sobre o rótulo)
  const ancora = document.createElement('div')
  ancora.className = 'autocompletar-ancora'
  input.replaceWith(ancora)
  ancora.append(input, lista)
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-expanded', 'false')
  input.setAttribute('aria-controls', id)
  input.removeAttribute('list')
  input._autocompletar = true

  let itens = []
  let ativo = -1
  const fonte = () => (typeof opcoes === 'function' ? opcoes() : opcoes) || []

  const fechar = () => {
    lista.hidden = true
    ativo = -1
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
  }
  const marcar = i => {
    ativo = i
    lista.querySelectorAll('li').forEach((li, k) => li.setAttribute('aria-selected', String(k === i)))
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', `${id}-${i}`)
      lista.children[i]?.scrollIntoView({ block: 'nearest' })
    } else input.removeAttribute('aria-activedescendant')
  }
  const abrir = () => {
    const termo = normalizarTexto(input.value.trim())
    const todas = fonte().filter(o => o?.nome)
    if (termo) {
      const comeca = [], contem = []
      for (const o of todas) {
        const n = normalizarTexto(o.nome)
        if (n === termo) continue
        if (n.startsWith(termo)) comeca.push(o)
        else if (n.includes(termo)) contem.push(o)
      }
      itens = [...comeca, ...contem].slice(0, limite)
    } else {
      itens = [...todas].sort((a, b) => (b.usos || 0) - (a.usos || 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR')).slice(0, limite)
    }
    if (!itens.length) { fechar(); return }
    lista.innerHTML = itens.map((o, i) => `<li id="${id}-${i}" role="option" aria-selected="false">${esc(o.nome)}</li>`).join('')
    lista.hidden = false
    input.setAttribute('aria-expanded', 'true')
    marcar(-1)
  }
  const escolher = i => {
    const o = itens[i]
    if (!o) return
    input.value = o.nome
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    fechar()
    aoEscolher?.(o)
  }

  input.addEventListener('focus', abrir)
  input.addEventListener('input', e => { if (e.isTrusted) abrir() })
  input.addEventListener('blur', () => setTimeout(fechar, 150))
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (lista.hidden) abrir()
      else marcar(Math.min(ativo + 1, itens.length - 1))
    } else if (e.key === 'ArrowUp' && !lista.hidden) {
      e.preventDefault()
      marcar(Math.max(ativo - 1, 0))
    } else if (e.key === 'Enter' && !lista.hidden && ativo >= 0) {
      e.preventDefault()
      escolher(ativo)
    } else if (e.key === 'Escape' && !lista.hidden) {
      e.preventDefault()
      e.stopPropagation()
      fechar()
    }
  })
  // mousedown (e não click): escolhe antes do campo perder o foco
  lista.addEventListener('mousedown', e => {
    const li = e.target.closest('li')
    if (!li) return
    e.preventDefault()
    escolher([...lista.children].indexOf(li))
  })
}
