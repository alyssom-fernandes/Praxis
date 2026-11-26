// Editor dos itens do pedido: as linhas (descrição, quantidade, unidade e o
// valor unitário opcional), as sugestões pelo histórico e, quando há valor,
// o desconto e o total. Usado no "Pedir uma compra", na edição do pedido e na
// compra já feita. As contas ficam em js/itens.js.
import { t, UNIDADES } from './constants.js'
import { esc, parseMoeda, formatCurrency, formatDate } from './utils.js'
import {
  MAX_ITENS, MAX_DESC_ITEM, item, itensPreenchidos, subtotalDosItens, desconto, valorDoDesconto,
  totalComDesconto, sugerirItens, itemDoHistorico,
} from './itens.js'

const _svg = d => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ICO_MAIS = _svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>')
const ICO_TIRAR = _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')

const _valorParaCampo = v => (v == null ? '' : String(v.toFixed(2)).replace('.', ','))

// Monta o editor em `raiz`. Opções:
//  prefixo: prefixo dos IDs (np, ed, lc), para os erros do formulário
//  comValor: mostra o valor unitário e o desconto (não na compra já feita,
//    em que o valor pago é o da nota)
//  historico: Map de historicoDeItens (as sugestões)
//  aoEscolherDoHistorico(h): a categoria sugerida pelo item
//  aoMudar(): a cada mudança (o título automático acompanha)
export function montarEditorItens(raiz, { prefixo = 'np', comValor = true, historico = new Map(), aoEscolherDoHistorico, aoMudar } = {}) {
  let linhas = [item()]
  let tipoDesconto = 'valor'
  const lista = `${prefixo}-itens-sugestoes`

  raiz.classList.add('itens-ed')
  raiz.innerHTML = `
    <div class="itens-ed-cab" aria-hidden="true">
      <span>${t('itemDescricao')}</span><span>${t('npQuantidade')}</span><span>${t('npUnidade')}</span>
      ${comValor ? `<span>${t('itemValorUnit')}</span>` : ''}<span></span>
    </div>
    <div class="itens-ed-linhas" id="${prefixo}-itens"></div>
    <datalist id="${lista}"></datalist>
    <button type="button" class="btn-ghost btn-sm itens-ed-mais" id="${prefixo}-item-mais">${ICO_MAIS}<span>${t('itemAdicionar')}</span></button>
    ${comValor ? `
    <div class="itens-ed-total" id="${prefixo}-itens-total" hidden>
      <div class="itens-ed-desc">
        <label for="${prefixo}-desconto">${t('itemDesconto')} <span class="np-opcional">${t('opcional')}</span></label>
        <div class="itens-ed-desc-campos">
          <input type="text" id="${prefixo}-desconto" inputmode="decimal" autocomplete="off" placeholder="0">
          <div class="itens-ed-tipo" role="group" aria-label="${t('itemDescontoTipo')}">
            <button type="button" data-tipo="valor" aria-pressed="true">R$</button>
            <button type="button" data-tipo="pct" aria-pressed="false">%</button>
          </div>
        </div>
      </div>
      <p class="itens-ed-soma" aria-live="polite"></p>
    </div>` : ''}`

  const caixa = raiz.querySelector('.itens-ed-linhas')
  const dl = raiz.querySelector('datalist')

  const ler = () => [...caixa.querySelectorAll('.itens-ed-linha')].map(l => ({
    descricao: l.querySelector('.it-desc').value,
    quantidade: l.querySelector('.it-qtd').value,
    unidade: l.querySelector('.it-un').value,
    valorUnitario: comValor ? (parseMoeda(l.querySelector('.it-vu').value) || null) : null,
  }))

  const linhaHtml = (i, n) => `
    <div class="itens-ed-linha form-group" data-campo="${prefixo}-item-${n}">
      <div class="itens-ed-campos">
        <input type="text" class="it-desc" id="${prefixo}-item-${n}" value="${esc(i.descricao)}" maxlength="${MAX_DESC_ITEM}"
          autocomplete="off" list="${lista}" placeholder="${esc(n === 0 ? t('itemPlaceholder') : t('itemPlaceholderOutro'))}"
          aria-label="${esc(t('itemDescricaoN', { n: n + 1 }))}">
        <input type="number" class="it-qtd" value="${esc(i.quantidade)}" min="0.01" step="any" inputmode="decimal"
          aria-label="${esc(t('itemQuantidadeN', { n: n + 1 }))}">
        <select class="it-un" aria-label="${esc(t('itemUnidadeN', { n: n + 1 }))}">
          ${[...new Set([...UNIDADES, i.unidade])].map(u => `<option value="${esc(u)}"${u === i.unidade ? ' selected' : ''}>${esc(u)}</option>`).join('')}
        </select>
        ${comValor ? `<input type="text" class="it-vu" value="${esc(_valorParaCampo(i.valorUnitario))}" inputmode="decimal" autocomplete="off"
          placeholder="${esc(t('itemValorUnitCurto'))}" aria-label="${esc(t('itemValorUnitN', { n: n + 1 }))}">` : ''}
        <button type="button" class="btn-icon it-tirar" aria-label="${esc(t('itemTirarN', { n: n + 1 }))}" ${linhas.length < 2 ? 'hidden' : ''}>${ICO_TIRAR}</button>
      </div>
      <p class="it-dica" hidden></p>
    </div>`

  function desenhar(focar) {
    caixa.innerHTML = linhas.map(linhaHtml).join('')
    raiz.querySelector('.itens-ed-cab').hidden = linhas.length < 2 && window.matchMedia?.('(max-width: 600px)').matches
    raiz.querySelector(`#${prefixo}-item-mais`).hidden = linhas.length >= MAX_ITENS
    if (focar != null) caixa.querySelectorAll('.it-desc')[focar]?.focus()
    somar()
  }

  function somar() {
    if (!comValor) return
    const itens = ler()
    const sub = subtotalDosItens(itens)
    const bloco = raiz.querySelector('.itens-ed-total')
    bloco.hidden = sub == null
    if (sub == null) return
    const d = desconto(tipoDesconto, parseMoeda(raiz.querySelector(`#${prefixo}-desconto`).value))
    const vd = valorDoDesconto(sub, d)
    raiz.querySelector('.itens-ed-soma').innerHTML = vd
      ? `${t('itemSubtotal')} ${formatCurrency(sub)} · ${t('itemDesconto')} −${formatCurrency(vd)} · <strong>${t('itemTotal')} ${formatCurrency(totalComDesconto(sub, d))}</strong>`
      : `<strong>${t('itemTotal')} ${formatCurrency(sub)}</strong>`
  }

  function sugerir(input) {
    const ops = sugerirItens(historico, input.value, 8)
    dl.innerHTML = ops.map(h => `<option value="${esc(h.descricao)}"></option>`).join('')
  }

  function dica(linha, h) {
    const p = linha.querySelector('.it-dica')
    if (!h || (h.preco == null && !h.fornecedorNome)) { p.hidden = true; p.textContent = ''; return }
    const partes = []
    if (h.preco != null) partes.push(t('itemUltimoPreco', { valor: formatCurrency(h.preco), un: h.unidade }))
    if (h.fornecedorNome) partes.push(h.fornecedorNome)
    if (h.data) partes.push(formatDate(h.data))
    p.textContent = partes.join(' · ')
    p.hidden = false
  }

  // Item já comprado antes: a unidade, o último preço (se o campo está vazio)
  // e a categoria vêm do histórico
  function preencherDoHistorico(linha) {
    const h = itemDoHistorico(historico, linha.querySelector('.it-desc').value)
    dica(linha, h)
    if (!h) return
    const un = linha.querySelector('.it-un')
    if ([...un.options].some(o => o.value === h.unidade)) un.value = h.unidade
    const vu = linha.querySelector('.it-vu')
    if (vu && !vu.value && h.preco != null) vu.value = _valorParaCampo(h.preco)
    aoEscolherDoHistorico?.(h)
  }

  caixa.addEventListener('input', e => {
    if (e.target.classList.contains('it-desc')) sugerir(e.target)
    linhas = ler()
    somar(); aoMudar?.()
  })
  caixa.addEventListener('change', e => {
    if (e.target.classList.contains('it-desc')) { preencherDoHistorico(e.target.closest('.itens-ed-linha')); somar(); aoMudar?.() }
  })
  caixa.addEventListener('click', e => {
    const b = e.target.closest('.it-tirar')
    if (!b) return
    const n = [...caixa.querySelectorAll('.it-tirar')].indexOf(b)
    linhas = ler(); linhas.splice(n, 1)
    desenhar(Math.max(0, n - 1)); aoMudar?.()
  })
  // Enter na descrição do último item abre o próximo
  caixa.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.classList.contains('it-desc')) return
    e.preventDefault()
    const todas = [...caixa.querySelectorAll('.it-desc')]
    const n = todas.indexOf(e.target)
    if (n < todas.length - 1) todas[n + 1].focus()
    else if (e.target.value.trim() && linhas.length < MAX_ITENS) { linhas = [...ler(), item()]; desenhar(linhas.length - 1) }
  })
  raiz.querySelector(`#${prefixo}-item-mais`).addEventListener('click', () => {
    linhas = [...ler(), item()]
    desenhar(linhas.length - 1); aoMudar?.()
  })
  if (comValor) {
    raiz.querySelector(`#${prefixo}-desconto`).addEventListener('input', somar)
    raiz.querySelectorAll('.itens-ed-tipo button').forEach(b => b.addEventListener('click', () => {
      tipoDesconto = b.dataset.tipo
      raiz.querySelectorAll('.itens-ed-tipo button').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
      somar()
    }))
  }
  desenhar()

  return {
    // Os itens como estão nos campos (sem os vazios só no ler: a validação
    // aponta a linha certa)
    itens: () => ler(),
    preenchidos: () => itensPreenchidos(ler()),
    desconto: () => (comValor ? desconto(tipoDesconto, parseMoeda(raiz.querySelector(`#${prefixo}-desconto`).value)) : null),
    definir(itens, d = null) {
      linhas = (itens && itens.length ? itens : [item()]).map(item)
      tipoDesconto = d?.tipo || 'valor'
      if (comValor) {
        raiz.querySelector(`#${prefixo}-desconto`).value = d ? _valorParaCampo(d.valor) : ''
        raiz.querySelectorAll('.itens-ed-tipo button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.tipo === tipoDesconto)))
      }
      desenhar()
    },
    usarHistorico(h) { historico = h || new Map() },
    focar() { caixa.querySelector('.it-desc')?.focus() },
  }
}
