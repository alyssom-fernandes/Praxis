// Peças compartilhadas pelas telas de configurações (usuários, cadastros e ajustes):
// ícones no mesmo traço, cabeçalho de tela, perfil com ponto de cor, numerais,
// estado vazio, validação inline e máscara de CNPJ.
import { db, collection, getDocs, consulta, consultaUsuarios } from './firebase.js'
import { atualizarLateral } from './app.js'
import { sessao } from './estado.js'
import { t, idioma, PERFIS_LABEL } from './constants.js'
import { esc, gerarIniciais, cnpjValido } from './utils.js'
import { estadoVazio, bordasDeRolagem } from './ui.js'

const svg = (tam, corpo, traco = 2) =>
  `<svg width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`

export const ICO = {
  mais:      (n = 14) => svg(n, '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 2.4),
  busca:     (n = 14) => svg(n, '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  editar:    (n = 15) => svg(n, '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>'),
  fechar:    (n = 16) => svg(n, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  auto:      (n = 14) => svg(n, '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
  lua:       (n = 14) => svg(n, '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'),
  sol:       (n = 14) => svg(n, '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>'),
  play:      (n = 14) => svg(n, '<polygon points="6 3 20 12 6 21 6 3"/>'),
  baixar:    (n = 14) => svg(n, '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  enviar:    (n = 14) => svg(n, '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>'),
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
  return idioma() === 'en' ? 'en-US' : 'pt-BR'
}

// Número inteiro no idioma da sessão: "1.000" ou "1,000"
export const numero = n => new Intl.NumberFormat(_locale()).format(n)


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

// Perfil: texto simples. Cor fica para etapa, urgência e ação; perfil não
// tem cor (verde já quer dizer "concluído" e azul, "em andamento")
export function perfilHtml(perfil) {
  return `<span class="cfg-perfil">${esc(PERFIS_LABEL[perfil] || perfil || '—')}</span>`
}

// Resumo enquanto os números carregam: a mesma frase, com reticências no lugar
// dos números. Antes a linha vazia virava duas quando os dados chegavam, e a
// tela pulava 25 px (medido: deslocamento de layout de até 0,67 em Fornecedores)
export function resumoCarregando(chaveDesc) {
  return `<span class="cfg-resumo-num">…</span> ${t(chaveDesc)}`
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
  bordasDeRolagem(nav)
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
    getDocs(k === 'usuarios' ? consultaUsuarios(sessao.usuario) : consulta(collection(db, _COLECOES_LATERAL[k])))
      // Usuários: a mesma conta da lista (na demo, sem a conta de login)
      .then(s => k === 'usuarios' && sessao.isDemo ? s.docs.filter(d => d.data().email !== 'demo@praxis.app').length : s.size)
      .catch(() => null)))
  const contagens = {}
  faltam.forEach((k, i) => { if (tamanhos[i] != null) contagens[k] = tamanhos[i] })
  if (Object.keys(contagens).length) atualizarLateral({ contagens })
}

// Estado vazio dentro de tabela ou grade: o componente único (js/ui.js),
// variante "solto"
export function vazio({ titulo = '', texto = '', acao = '' } = {}) {
  return estadoVazio({ titulo, texto, acao, variante: 'solto' })
}

// Linha de tabela com estado vazio (ocupa todas as colunas)
// Listas longas (fornecedores, usuários, auditoria): 30 linhas por vez, com
// "Mostrar mais" no fim; a busca e os filtros valem para a lista inteira
const POR_VEZ = 30
const _mostrando = {}
export function linhasComMais(tbody, lista, colunas, linha, redesenhar) {
  const chave = tbody.id
  const n = _mostrando[chave] || POR_VEZ
  const resto = lista.length - n
  if (!tbody._mais) {
    tbody._mais = true
    tbody.addEventListener('click', e => {
      if (!e.target.closest('[data-mostrar-mais]')) return
      e.stopPropagation()
      _mostrando[chave] = (_mostrando[chave] || POR_VEZ) + POR_VEZ
      redesenhar()
    })
  }
  return lista.slice(0, n).map(linha).join('') + (resto > 0
    ? `<tr class="cfg-linha-mais"><td colspan="${colunas}"><button type="button" class="btn-secondary cfg-mais" data-mostrar-mais>${esc(tf('cfgMostrarMais', { n: Math.min(POR_VEZ, resto), total: lista.length }))}</button></td></tr>`
    : '')
}

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

// O CNPJ é validado em utils.js (a importação por CSV também usa, sem DOM)
export { esc, cnpjValido }
