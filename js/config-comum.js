// Peças compartilhadas pelas telas de configurações (usuários, cadastros e ajustes):
// ícones no mesmo traço, cabeçalho de tela, perfil com ponto de cor, numerais,
// estado vazio, validação inline e máscara de CNPJ.
import { db, collection, getDocs } from './firebase.js'
import { sessao, atualizarLateral } from './app.js'
import { t, PERFIS_LABEL } from './constants.js'
import { esc, gerarIniciais } from './utils.js'

const svg = (tam, corpo, traco = 2) =>
  `<svg width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`

export const ICO = {
  mais:      (n = 14) => svg(n, '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 2.4),
  busca:     (n = 14) => svg(n, '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  editar:    (n = 15) => svg(n, '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>'),
  fechar:    (n = 16) => svg(n, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  usuarios:  (n = 20) => svg(n, '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>'),
  predio:    (n = 18) => svg(n, '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="8" y1="6" x2="8.01" y2="6"/><line x1="12" y1="6" x2="12.01" y2="6"/><line x1="16" y1="6" x2="16.01" y2="6"/><line x1="8" y1="10" x2="8.01" y2="10"/><line x1="12" y1="10" x2="12.01" y2="10"/><line x1="16" y1="10" x2="16.01" y2="10"/><line x1="8" y1="14" x2="8.01" y2="14"/><line x1="12" y1="14" x2="12.01" y2="14"/><line x1="16" y1="14" x2="16.01" y2="14"/>'),
  etiqueta:  (n = 20) => svg(n, '<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
  caminhao:  (n = 20) => svg(n, '<rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
  lua:       (n = 14) => svg(n, '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'),
  sol:       (n = 14) => svg(n, '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
  play:      (n = 14) => svg(n, '<polygon points="6 3 20 12 6 21 6 3"/>'),
  cadeado:   (n = 14) => svg(n, '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>'),
}

// t() com substituição de {chave}
export function tf(chave, vars = {}) {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), t(chave))
}

export function plural(n, sing, plur) {
  return `${n} ${n === 1 ? t(sing) : t(plur)}`
}

// Idioma das datas e valores (o mesmo de t())
function _locale() {
  try { return sessionStorage.getItem('praxis_lang') === 'en' ? 'en-US' : 'pt-BR' } catch { return 'pt-BR' }
}

// Numeral grande das inscrições: dois dígitos, como "07" no quadro de pedidos
export const doisDigitos = n => (Number.isInteger(n) && n >= 0 && n < 10 ? `0${n}` : String(n))

// Valores: "R$ 54,2 mil" (cabeçalhos) e "R$ 23.750,00" (tabelas)
export function moedaCurta(v) {
  return 'R$ ' + new Intl.NumberFormat(_locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)
}
export function moeda(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}

// Data de um acesso: "Hoje, 14:32", "Ontem, 09:10" ou "03/10/2026"
export function dataAcesso(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null)
  if (!d || isNaN(d)) return null
  const dia = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((dia(new Date()) - dia(d)) / 86400000)
  const hora = d.toLocaleTimeString(_locale(), { hour: '2-digit', minute: '2-digit' })
  const completo = d.toLocaleString(_locale(), { dateStyle: 'short', timeStyle: 'short' })
  if (diff === 0) return { rotulo: `${t('cfgHoje')}, ${hora}`, completo }
  if (diff === 1) return { rotulo: `${t('cfgOntem')}, ${hora}`, completo }
  return { rotulo: d.toLocaleDateString(_locale()), completo }
}

// Iniciais do avatar só com letras: "Ana (financeiro)" vira "AF", não "A("
export function iniciais(nome) {
  const limpo = String(nome || '').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  return gerarIniciais(limpo || nome)
}

// Perfil: texto com um ponto de cor (as cores vêm das semânticas quentes)
const COR_PERFIL = {
  supremo:     'var(--gold)',
  gestor:      'var(--amber)',
  aprovador:   'var(--green)',
  comprador:   'var(--blue)',
  financeiro:  'var(--text2)',
  solicitante: 'var(--text3)',
}
export const corPerfil = p => COR_PERFIL[p] || 'var(--text3)'
export function perfilHtml(perfil) {
  return `<span class="cfg-perfil" style="--cor:${corPerfil(perfil)}"><span class="cfg-ponto" aria-hidden="true"></span>${esc(PERFIS_LABEL[perfil] || perfil || '—')}</span>`
}

// Cabeçalho de tela: título da inscrição e uma frase curta à esquerda, ações à direita
export function cabecalho(titulo, { resumoId = '', resumo = '', acao = '' } = {}) {
  return `
    <header class="cfg-head">
      <div class="cfg-head-titulo">
        <h1 class="titulo-pagina cfg-titulo">${titulo}</h1>
        <p class="cfg-resumo"${resumoId ? ` id="${resumoId}" aria-live="polite"` : ''}>${resumo || '&nbsp;'}</p>
      </div>
      ${acao ? `<div class="cfg-head-acoes">${acao}</div>` : ''}
    </header>`
}

// Botão "Novo …" do cabeçalho: no celular o rótulo encurta para caber na linha do título
export function botaoNovo(id, rotulo, curto) {
  return `<button class="btn-primary cfg-btn-novo" id="${id}" aria-label="${esc(rotulo)}">${ICO.mais()}<span class="cfg-btn-rotulo">${rotulo}</span><span class="cfg-btn-curto" aria-hidden="true">${curto}</span></button>`
}

// No celular os cadastros ficam numa linha rolável no alto (barra lateral em
// modo configurações): rola essa linha até o item da tela aberta aparecer
export function revelarItemLateral() {
  const nav  = document.querySelector('.lateral[data-mode="config"] .lateral-nav')
  const item = nav?.querySelector('.lateral-item.active')
  if (!nav || !item || nav.scrollWidth <= nav.clientWidth) return
  const n = nav.getBoundingClientRect()
  const i = item.getBoundingClientRect()
  if (i.left < n.left || i.right > n.right) nav.scrollLeft += i.left - n.left - 16
}

// Contadores dos cadastros na barra lateral: cada tela informa os que já
// carregou; os que ainda não foram vistos nesta sessão são contados aqui, para
// a lateral não ficar com uns números preenchidos e outros em branco
const _COLECOES_LATERAL = {
  'cad-empresas': 'empresas', 'cad-categorias': 'categorias', 'cad-fornecedores': 'fornecedores', usuarios: 'usuarios',
}
export async function completarContagensLateral(conhecidas = {}) {
  const atuais = sessao.lateral?.contagens || {}
  const faltam = Object.keys(_COLECOES_LATERAL).filter(k => !(k in conhecidas) && !Number.isFinite(atuais[k]))
  if (!faltam.length) return
  const tamanhos = await Promise.all(faltam.map(k =>
    getDocs(collection(db, _COLECOES_LATERAL[k])).then(s => s.size).catch(() => null)))
  const contagens = {}
  faltam.forEach((k, i) => { if (tamanhos[i] != null) contagens[k] = tamanhos[i] })
  if (Object.keys(contagens).length) atualizarLateral({ contagens })
}

// Estado vazio: ícone discreto, título curto, uma frase e, se houver, uma ação
export function vazio({ icone = '', titulo = '', sub = '', acao = '' } = {}) {
  return `
    <div class="cfg-vazio">
      ${icone ? `<div class="cfg-vazio-icone">${icone}</div>` : ''}
      <div class="cfg-vazio-titulo">${titulo}</div>
      ${sub ? `<p class="cfg-vazio-sub">${sub}</p>` : ''}
      ${acao ? `<div class="cfg-vazio-acao">${acao}</div>` : ''}
    </div>`
}

// Linha de tabela com estado vazio (ocupa todas as colunas)
export function linhaVazia(colunas, opcoes) {
  return `<tr class="cfg-linha-vazia"><td colspan="${colunas}">${vazio(opcoes)}</td></tr>`
}

// Linhas-esqueleto enquanto carrega
export function linhasEsqueleto(colunas, linhas = 4) {
  const cel = `<td><span class="skeleton cfg-esq"></span></td>`
  return Array.from({ length: linhas }, () =>
    `<tr class="cfg-linha-esq" aria-hidden="true">${cel.repeat(colunas)}</tr>`).join('')
}

// ── Validação inline (grupo identificado por data-campo) ─────
export function marcarErro(campo, msg) {
  const grupo = document.querySelector(`[data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.add('invalido')
  let el = grupo.querySelector('.form-error')
  if (!el) {
    el = document.createElement('span')
    el.className = 'form-error'
    el.id = `${campo}-erro`
    grupo.appendChild(el)
  }
  el.textContent = msg
  const input = document.getElementById(campo)
  if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id) }
}

export function limparErro(campo) {
  const grupo = document.querySelector(`[data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.remove('invalido')
  grupo.querySelector('.form-error')?.remove()
  const input = document.getElementById(campo)
  if (input) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby') }
}

export function limparErros(raiz) {
  raiz?.querySelectorAll('[data-campo].invalido').forEach(g => limparErro(g.dataset.campo))
}

// Foca o primeiro campo com erro dentro do modal
export function focarPrimeiroErro(raiz) {
  const grupo = raiz?.querySelector('[data-campo].invalido')
  grupo?.querySelector('input:not([type=hidden]), select, textarea')?.focus()
}

// ── CNPJ ─────────────────────────────────────────────────────
export function mascararCNPJ(valor) {
  const n = String(valor || '').replace(/\D/g, '').slice(0, 14)
  let s = n.slice(0, 2)
  if (n.length > 2)  s += '.' + n.slice(2, 5)
  if (n.length > 5)  s += '.' + n.slice(5, 8)
  if (n.length > 8)  s += '/' + n.slice(8, 12)
  if (n.length > 12) s += '-' + n.slice(12)
  return s
}

export function ligarMascaraCNPJ(input) {
  input?.addEventListener('input', () => {
    const fim = input.selectionStart === input.value.length
    input.value = mascararCNPJ(input.value)
    if (fim) input.setSelectionRange(input.value.length, input.value.length)
  })
}

export function cnpjValido(valor) {
  const n = String(valor || '').replace(/\D/g, '')
  return n.length === 0 || n.length === 14
}

// Interruptor acessível (div.toggle-wrap com role="switch")
export function ligarInterruptor(wrap, aoMudar) {
  if (!wrap) return
  const alternar = () => {
    if (wrap.getAttribute('aria-disabled') === 'true') return
    const tg = wrap.querySelector('.toggle')
    const on = !tg.classList.contains('on')
    definirInterruptor(wrap, on)
    aoMudar?.(on)
  }
  wrap.addEventListener('click', alternar)
  wrap.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar() }
  })
}

export function definirInterruptor(wrap, on) {
  if (!wrap) return
  wrap.querySelector('.toggle')?.classList.toggle('on', on)
  wrap.setAttribute('aria-checked', String(on))
}

export { esc }
