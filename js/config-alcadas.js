// Administração › Alçadas: quem aprova cada pedido, conforme a empresa e o
// valor da cotação indicada (js/alcadas.js). Uma alçada por empresa, com
// faixas de valor e, em cada faixa, de 1 a 3 níveis em sequência. Empresa sem
// alçada: um aprovador ou gestor da empresa decide, como antes.
//
// O supremo vê e muda todas as empresas; o gestor, as dele. Cada gravação vai
// com o seu registro de auditoria (gravarAuditado), como as regras exigem.

import { db, collection, doc, getDoc, getDocs, serverTimestamp, consulta, consultaUsuarios } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter } from './app.js'
import { sessao } from './estado.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, abrirModal, fecharModal } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { PERFIS, PERFIS_LABEL, t } from './constants.js'
import { empresasDoUsuario, formatCurrency, parseMoeda } from './utils.js'
import { gravarAuditado } from './auditoria.js'
import { ICO, tf, cabecalho, vazio, esc, revelarItemLateral, completarContagensLateral } from './config-comum.js'
import {
  MAX_FAIXAS, MAX_NIVEIS, MAX_PESSOAS, PERFIS_QUE_APROVAM, problemasDaAlcada, limparAlcada,
} from './alcadas.js'

const MODAL_ID = 'modal-alcada'
// Perfis oferecidos no editor (o supremo entra pelo nome, quando for o caso)
const PERFIS_NO_EDITOR = [PERFIS.APROVADOR, PERFIS.GESTOR]

let _empresas = []      // empresas que a pessoa administra
let _alcadas  = {}      // empresaId → documento da alçada
let _usuarios = []      // quem pode aprovar (aprovador, gestor, supremo)
let _edicao   = null    // { empresa, faixas } em edição

export async function renderConfigAlcadas() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-alcadas', true)}
      <main class="main-content cfg-pagina alc-pagina">
        ${cabecalho(t('alcTitulo'), { resumoId: 'alc-resumo' })}
        <div class="alc-lista" id="alc-lista" aria-busy="true">
          ${'<div class="alc-empresa is-esqueleto" aria-hidden="true"><span class="skeleton cfg-esq"></span></div>'.repeat(2)}
        </div>
      </main>
      ${renderFooter()}
    </div>`
  initTopbarEvents(true)
  revelarItemLateral()
  renderNotificacoes()
  document.getElementById('alc-lista').addEventListener('click', e => {
    const id = e.target.closest('[data-alc-editar]')?.dataset.alcEditar
    if (id) _abrirEditor(id)
  })
  await _carregar()
  completarContagensLateral()
}

// ── Carregamento ──────────────────────────────────────────────
async function _carregar() {
  try {
    const [empSnap, usrSnap] = await Promise.all([
      getDocs(consulta(collection(db, 'empresas'))),
      getDocs(consultaUsuarios(sessao.usuario)).catch(() => null),
    ])
    const minhas = empresasDoUsuario(sessao.usuario)
    const supremo = sessao.usuario.perfil === PERFIS.SUPREMO
    _empresas = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.ativa !== false && (supremo || minhas.includes(e.id)))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    _usuarios = (usrSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }))
      .filter(u => PERFIS_QUE_APROVAM.includes(u.perfil) && u.ativo !== false && u.email !== 'demo@praxis.app')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    // Uma leitura por empresa: a alçada tem o ID da empresa (na demo, a de
    // uma empresa sem alçada é negada, e vale como "sem alçada")
    const docs = await Promise.all(_empresas.map(e => getDoc(doc(db, 'alcadas', e.id)).catch(() => null)))
    _alcadas = {}
    docs.forEach((s, i) => { if (s?.exists()) _alcadas[_empresas[i].id] = { id: s.id, ...s.data() } })
  } catch (err) {
    console.error(err)
    prxToast(t('erroCarregar'), 'error')
  }
  if (!document.getElementById('alc-lista')) return
  _render()
}

const _nomeDe = id => _usuarios.find(u => u.id === id)?.nome || t('alcPessoaRemovida')

// "Até R$ 10.000,00", "Acima de R$ 10.000,00" ou "Qualquer valor"
function _rotuloFaixa(faixas, i) {
  if (faixas[i].ate != null) return t('alcAte', { valor: formatCurrency(faixas[i].ate) })
  return i === 0 ? t('alcQualquerValor') : t('alcAcimaDe', { valor: formatCurrency(faixas[i - 1].ate) })
}

// Quem aprova num nível, em texto: "Aprovadores, Gestores ou Ana Lima"
function _quem(nv) {
  const partes = [...(nv.perfis || []).map(p => PERFIS_LABEL[p] || p), ...(nv.usuarios || []).map(_nomeDe)]
  return partes.join(', ')
}

// A alçada inteira em uma linha, para a auditoria: as faixas e, em cada uma,
// os níveis com o número de aprovações
export function textoAlcada(faixas) {
  if (!Array.isArray(faixas) || !faixas.length) return '—'
  return faixas.map((f, i) => `${_rotuloFaixa(faixas, i)}: ${(f.niveis || []).map(nv =>
    `${nv.nome} (${nv.minimo})`).join(' → ')}`).join('; ')
}

function _render() {
  const lista = document.getElementById('alc-lista')
  lista.removeAttribute('aria-busy')
  const com = _empresas.filter(e => _alcadas[e.id]).length
  const resumo = document.getElementById('alc-resumo')
  if (resumo) resumo.innerHTML = `<span class="cfg-resumo-num">${tf('alcResumoN', { n: com, total: _empresas.length })}</span> ${t('alcDesc')}`

  if (!_empresas.length) {
    lista.innerHTML = vazio({ titulo: t('alcSemEmpresasTitulo'), texto: t('alcSemEmpresasTexto') })
    return
  }
  lista.innerHTML = _empresas.map(e => {
    const a = _alcadas[e.id]
    return `
      <section class="alc-empresa" aria-labelledby="alc-emp-${esc(e.id)}">
        <header class="alc-cab">
          <h2 class="alc-emp-nome" id="alc-emp-${esc(e.id)}">${esc(e.nome)}</h2>
          <button type="button" class="btn-secondary btn-sm" data-alc-editar="${esc(e.id)}">${ICO.editar(13)}${a ? t('alcEditar') : t('alcDefinir')}</button>
        </header>
        ${a ? `
        <ol class="alc-faixas">
          ${a.faixas.map((f, i) => `
          <li class="alc-faixa">
            <span class="alc-faixa-valor">${esc(_rotuloFaixa(a.faixas, i))}</span>
            <ol class="alc-niveis">
              ${f.niveis.map((nv, j) => `
              <li class="alc-nivel">
                <span class="alc-nivel-n" aria-hidden="true">${j + 1}</span>
                <span class="alc-nivel-corpo">
                  <span class="alc-nivel-nome">${esc(nv.nome)}</span>
                  <span class="alc-nivel-quem">${esc(tf(nv.minimo === 1 ? 'alcAprovacoes1' : 'alcAprovacoesN', { n: nv.minimo }))} · ${esc(_quem(nv))}</span>
                </span>
              </li>`).join('')}
            </ol>
          </li>`).join('')}
        </ol>` : `<p class="alc-sem">${t('alcSemAlcada')}</p>`}
      </section>`
  }).join('')
}

// ── Editor ────────────────────────────────────────────────────
// Pessoas que podem aprovar nesta empresa
const _candidatos = empresaId => _usuarios.filter(u => u.perfil === PERFIS.SUPREMO || empresasDoUsuario(u).includes(empresaId))

// Quantas aprovações o nível pode pedir: as pessoas que ele alcança (pelos
// perfis e pelos nomes), de 1 a 10
function _maximo(nv, empresaId) {
  const ids = new Set(nv.usuarios)
  if (nv.perfis.length) _candidatos(empresaId).forEach(u => { if (nv.perfis.includes(u.perfil)) ids.add(u.id) })
  return Math.max(1, Math.min(MAX_PESSOAS, ids.size))
}

const _nivelNovo = () => ({ nome: '', perfis: [PERFIS.APROVADOR, PERFIS.GESTOR], usuarios: [], minimo: 1 })

function _abrirEditor(empresaId) {
  const empresa = _empresas.find(e => e.id === empresaId)
  if (!empresa) return
  const atual = _alcadas[empresaId]
  _edicao = {
    empresa,
    faixas: atual ? structuredClone(atual.faixas).map(f => ({ ...f, niveis: f.niveis.map(nv => ({ ...nv, perfis: [...nv.perfis], usuarios: [...nv.usuarios] })) }))
      : [{ ate: null, niveis: [{ ..._nivelNovo(), nome: t('alcNivelPadrao') }] }],
  }
  document.getElementById(MODAL_ID)?.remove()
  const overlay = document.createElement('div')
  overlay.id = MODAL_ID
  overlay.className = 'modal-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'alc-ed-titulo')
  overlay.innerHTML = `
    <div class="modal cfg-modal alc-modal">
      <div class="modal-header">
        <div class="cfg-modal-head">
          <h2 id="alc-ed-titulo">${atual ? t('alcEditarTitulo') : t('alcDefinirTitulo')}</h2>
          <p class="cfg-modal-sub">${esc(empresa.nome)}</p>
        </div>
        <button class="btn-icon" data-alc="fechar" aria-label="${t('btnCancelar')}">${ICO.fechar()}</button>
      </div>
      <div class="modal-body">
        <p class="alc-ajuda">${t('alcAjuda')}</p>
        <div class="alc-erros" id="alc-erros" role="alert" hidden></div>
        <div id="alc-ed-corpo"></div>
      </div>
      <div class="modal-footer">
        ${atual ? `<button type="button" class="btn-danger cfg-acao-esquerda" data-alc="remover">${t('alcRemover')}</button>` : ''}
        <button type="button" class="btn-secondary" data-alc="fechar">${t('btnCancelar')}</button>
        <button type="button" class="btn-primary" data-alc="salvar">${t('salvarLabel')}</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  _renderEditor()

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { _fecharEditor(); return }
    const b = e.target.closest('[data-alc]')
    if (!b) return
    const f = Number(b.dataset.f), n = Number(b.dataset.n)
    const faixas = _edicao.faixas
    switch (b.dataset.alc) {
      case 'fechar': _fecharEditor(); return
      case 'salvar': _salvar(); return
      case 'remover': _remover(); return
      case 'mais-faixa': {
        // A faixa nova entra antes da última (a última não tem teto)
        const anterior = faixas.length > 1 ? faixas[faixas.length - 2].ate : 0
        const base = faixas[faixas.length - 1]
        faixas.splice(faixas.length - 1, 0, { ate: null, niveis: structuredClone(base.niveis) })
        faixas[faixas.length - 2].ate = anterior ? anterior * 10 : 10000
        break
      }
      case 'menos-faixa': faixas.splice(f, 1); faixas[faixas.length - 1].ate = null; break
      case 'mais-nivel': faixas[f].niveis.push(_nivelNovo()); break
      case 'menos-nivel': faixas[f].niveis.splice(n, 1); break
      default: return
    }
    _renderEditor()
  })
  overlay.addEventListener('input', e => _lerCampo(e.target))
  overlay.addEventListener('change', e => _lerCampo(e.target, true))
  abrirModal(MODAL_ID)
}

function _fecharEditor() {
  const overlay = document.getElementById(MODAL_ID)
  if (!overlay) return
  fecharModal(MODAL_ID)
  setTimeout(() => overlay.remove(), 250)
}

// Um campo mudou: atualiza o rascunho; os perfis e as pessoas mudam o
// máximo de aprovações do nível
function _lerCampo(el, mudou = false) {
  const campo = el.dataset.campo
  if (!campo || !_edicao) return
  const f = Number(el.dataset.f), n = Number(el.dataset.n)
  const faixa = _edicao.faixas[f]
  const nv = faixa?.niveis[n]
  if (campo === 'ate') faixa.ate = el.value.trim() ? parseMoeda(el.value) : null
  if (campo === 'nome') nv.nome = el.value
  if (campo === 'minimo') nv.minimo = Number(el.value)
  if (mudou && (campo === 'perfil' || campo === 'pessoa')) {
    const lista = campo === 'perfil' ? nv.perfis : nv.usuarios
    const i = lista.indexOf(el.value)
    if (el.checked && i < 0) lista.push(el.value)
    if (!el.checked && i >= 0) lista.splice(i, 1)
    nv.minimo = Math.min(nv.minimo, _maximo(nv, _edicao.empresa.id))
    const sel = document.querySelector(`#${MODAL_ID} select[data-campo="minimo"][data-f="${f}"][data-n="${n}"]`)
    if (sel) sel.outerHTML = _seletorMinimo(nv, f, n)
  }
}

function _seletorMinimo(nv, f, n) {
  const max = _maximo(nv, _edicao.empresa.id)
  return `<select id="alc-min-${f}-${n}" data-campo="minimo" data-f="${f}" data-n="${n}">${Array.from({ length: max }, (_, i) =>
    `<option value="${i + 1}"${nv.minimo === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select>`
}

function _renderEditor() {
  const { faixas, empresa } = _edicao
  const pessoas = _candidatos(empresa.id)
  const valorTeto = v => (v == null ? '' : String(v).replace('.', ','))
  document.getElementById('alc-ed-corpo').innerHTML = `
    <ol class="alc-ed-faixas">
      ${faixas.map((fx, f) => {
        const ultima = f === faixas.length - 1
        return `
      <li class="alc-ed-faixa">
        <div class="alc-ed-faixa-cab">
          <span class="alc-ed-faixa-titulo">${tf('alcFaixaN', { n: f + 1 })}</span>
          ${ultima
            ? `<span class="alc-ed-faixa-valor">${esc(faixas.length === 1 ? t('alcQualquerValor') : t('alcAcimaDe', { valor: formatCurrency(faixas[f - 1].ate || 0) }))}</span>`
            : `<label class="alc-ed-teto"><span>${t('alcAteRotulo')}</span>
                 <input type="text" inputmode="decimal" class="cfg-mono" data-campo="ate" data-f="${f}" value="${esc(valorTeto(fx.ate))}" aria-label="${esc(tf('alcTetoAria', { n: f + 1 }))}"></label>`}
          ${faixas.length > 1 && !ultima ? `<button type="button" class="btn-ghost btn-sm alc-ed-tirar" data-alc="menos-faixa" data-f="${f}" aria-label="${esc(tf('alcTirarFaixa', { n: f + 1 }))}">${t('alcRemoverFaixa')}</button>` : ''}
        </div>
        <ol class="alc-ed-niveis">
          ${fx.niveis.map((nv, n) => `
          <li class="alc-ed-nivel">
            <div class="alc-ed-nivel-cab">
              <span class="alc-nivel-n" aria-hidden="true">${n + 1}</span>
              <div class="form-group alc-ed-nome">
                <label for="alc-nome-${f}-${n}">${tf('alcNivelN', { n: n + 1 })}</label>
                <input type="text" id="alc-nome-${f}-${n}" data-campo="nome" data-f="${f}" data-n="${n}" maxlength="60" value="${esc(nv.nome)}" placeholder="${t('alcNivelPh')}" autocomplete="off">
              </div>
              <div class="form-group alc-ed-min">
                <label for="alc-min-${f}-${n}">${t('alcMinimo')}</label>
                ${_seletorMinimo(nv, f, n)}
              </div>
            </div>
            <fieldset class="alc-ed-quem">
              <legend>${t('alcQuemAprova')}</legend>
              <div class="alc-ed-opcoes">
                ${PERFIS_NO_EDITOR.map(p => `
                <label class="alc-ed-opcao alc-ed-perfil"><input type="checkbox" data-campo="perfil" data-f="${f}" data-n="${n}" value="${p}"${nv.perfis.includes(p) ? ' checked' : ''}>${esc(tf('alcTodosOs', { perfil: PERFIS_LABEL[p] }))}</label>`).join('')}
                ${pessoas.map(u => `
                <label class="alc-ed-opcao"><input type="checkbox" data-campo="pessoa" data-f="${f}" data-n="${n}" value="${esc(u.id)}"${nv.usuarios.includes(u.id) ? ' checked' : ''}>${esc(u.nome)} <span class="cfg-mudo">${esc(PERFIS_LABEL[u.perfil] || '')}</span></label>`).join('')}
              </div>
            </fieldset>
            ${fx.niveis.length > 1 ? `<button type="button" class="btn-ghost btn-sm alc-ed-tirar-nivel" data-alc="menos-nivel" data-f="${f}" data-n="${n}" aria-label="${esc(tf('alcTirarNivel', { n: n + 1 }))}">${t('alcRemoverNivel')}</button>` : ''}
          </li>`).join('')}
        </ol>
        ${fx.niveis.length < MAX_NIVEIS ? `<button type="button" class="btn-ghost btn-sm alc-ed-mais" data-alc="mais-nivel" data-f="${f}">${ICO.mais(13)}${t('alcMaisNivel')}</button>` : ''}
      </li>`
      }).join('')}
    </ol>
    ${faixas.length < MAX_FAIXAS ? `<button type="button" class="btn-secondary btn-sm alc-ed-mais-faixa" data-alc="mais-faixa">${ICO.mais(13)}${t('alcMaisFaixa')}</button>` : ''}`
}

function _mostrarErros(problemas) {
  const el = document.getElementById('alc-erros')
  if (!el) return
  el.hidden = !problemas.length
  el.innerHTML = problemas.length
    ? `<ul>${problemas.map(p => `<li>${esc([
        p.faixa ? tf('alcFaixaN', { n: p.faixa }) : '', p.nivel ? tf('alcNivelN', { n: p.nivel }) : '',
      ].filter(Boolean).join(', '))}${p.faixa ? ': ' : ''}${esc(t(p.chave))}</li>`).join('')}</ul>` : ''
  if (problemas.length) el.scrollIntoView({ block: 'nearest' })
}

async function _salvar() {
  const { faixas, empresa } = _edicao
  const problemas = problemasDaAlcada(faixas)
  _mostrarErros(problemas)
  if (problemas.length) return
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
  const antes = _alcadas[empresa.id]
  mostrarSpinner()
  try {
    await gravarAuditado({
      colecao: 'alcadas', id: empresa.id, tipo: antes ? 'editar' : 'criar', antes, nome: empresa.nome,
      empresaIds: [empresa.id], sobrescrever: true,
      dados: { faixas: limparAlcada(faixas), atualizadoEm: serverTimestamp() },
    })
    _fecharEditor()
    // A lista volta do banco (com o auditoriaId novo) antes do aviso
    await _carregar()
    prxToast(t('alcSalva'), 'success')
  } catch (err) {
    console.warn('Alçada:', err?.code || err?.message)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _remover() {
  const { empresa } = _edicao
  const ok = await prxConfirm(t('alcRemoverTitulo'), tf('alcRemoverTexto', { empresa: empresa.nome }), t('alcRemover'), t('btnCancelar'), true)
  if (!ok) return
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
  mostrarSpinner()
  try {
    await gravarAuditado({ colecao: 'alcadas', id: empresa.id, tipo: 'apagar', antes: _alcadas[empresa.id], nome: empresa.nome,
      empresaIds: [empresa.id] })
    _fecharEditor()
    // A lista volta do banco (com o auditoriaId novo) antes do aviso
    await _carregar()
    prxToast(t('alcRemovida'), 'success')
  } catch (err) {
    console.warn('Alçada:', err?.code || err?.message)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}
