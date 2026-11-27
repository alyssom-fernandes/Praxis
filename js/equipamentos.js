// Equipamentos (27/11/2026): o inventário dos aparelhos de cada unidade, com
// a etiqueta de QR (AC-0123), onde está, os consertos e o aviso de troca. Esta
// é a lista: busca, filtros por unidade e tipo, o que pede atenção, o resumo
// por tipo e unidade, o cadastro e as etiquetas em PDF. A ficha de cada
// aparelho fica em js/equipamento.js; a contagem, em js/contagem.js.
import { db, collection, doc, getDocs, consulta, eContaDemo } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral, navegar } from './app.js'
import { sessao } from './estado.js'
import { prxToast, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, initModal, avisoNoFormulario, carregarBiblioteca, exigirConexao } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t } from './constants.js'
import { esc, formatCurrency, hojeISO } from './utils.js'
import { tf } from './config-comum.js'
import { icone } from './icones.js'
import { papelEquip, administra } from './modulos.js'
import { TIPOS_EQUIP, ST_EQUIP, prefixoDoTipo, etiquetaDe, precisaAtencao, TROCA_PADRAO } from './equip-regras.js'
import { consultaEquipamentos, consultaUnidades, proximoNumeroEtiqueta, gravarComEvento, novoId } from './modulos-dados.js'
import { matrizQR } from './qr.js'
import { gravarAuditado } from './auditoria.js'

const E = { lista: [], unidades: [], empresas: [], aba: 'todos', busca: '', unidade: '', tipo: '', editando: null, sugestao: null }

export const rotuloTipo = tipo => t(`eqTipo_${tipo}`)
export const rotuloSituacao = st => t(`eqSt_${st}`)
export const enderecoDoQrDoEquip = e => `${location.origin}/?tela=equipamento&id=${encodeURIComponent(e.id)}`
export const limitesDaEmpresa = (empresas, empresaId) => ({ ...TROCA_PADRAO, ...(empresas.find(x => x.id === empresaId)?.equipTroca || {}) })
const _motivos = e => precisaAtencao(e, limitesDaEmpresa(E.empresas, e.empresaId), hojeISO())

export async function renderEquipamentos() {
  const u = sessao.usuario
  const papel = papelEquip(u)
  const mexe = ['responsavel', 'gestor'].includes(papel)
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('equipamentos')}
      <main class="main-content sv-tela eq-tela">
        <header class="pedidos-head sv-head">
          <div class="pedidos-head-top">
            <div class="pedidos-head-titulo">
              <h1 class="titulo-pagina">${t('modEquipamentos')}</h1>
              <p class="pedidos-resumo" id="eq-resumo" aria-live="polite">&nbsp;</p>
            </div>
            <div class="pedidos-head-acoes">
              <button class="btn-secondary" id="eq-etiquetas" disabled>${icone('qr', 16)}<span class="so-largo">${t('eqEtiquetas')}</span></button>
              ${administra(u) ? `<button class="btn-secondary" id="eq-limites">${t('eqLimites')}</button>` : ''}
              ${mexe ? `<button class="btn-primary" id="eq-novo">${icone('novo', 16)}${t('eqNovo')}</button>` : ''}
            </div>
          </div>
          <div class="pedidos-controles sv-controles">
            <div class="search-input-wrap pedidos-busca">
              ${icone('busca', 15)}
              <input type="search" id="eq-busca" placeholder="${t('eqBuscar')}" aria-label="${t('eqBuscar')}" autocomplete="off" enterkeyhint="search">
            </div>
            <div class="eq-filtros">
              <select id="eq-f-unidade" aria-label="${t('eqFiltroUnidade')}"><option value="">${t('eqTodasUnidades')}</option></select>
              <select id="eq-f-tipo" aria-label="${t('eqFiltroTipo')}"><option value="">${t('eqTodosTipos')}</option>
                ${TIPOS_EQUIP.map(x => `<option value="${x.id}">${esc(rotuloTipo(x.id))}</option>`).join('')}</select>
            </div>
            <div class="pedidos-rapidos" role="group" aria-label="${t('svAbas')}">
              ${['todos', 'atencao', 'conserto', 'resumo', 'baixados'].map(a => `<button type="button" class="rapido" data-aba="${a}" aria-pressed="${a === E.aba}"><span class="rapido-rotulo">${t(`eqAba_${a}`)}</span><span class="rapido-n" data-n-aba="${a}"></span></button>`).join('')}
            </div>
          </div>
        </header>
        <div id="eq-lista" class="sv-lista" aria-busy="true"><div class="grupo-lista">${'<div class="sv-item is-esqueleto"><span class="skeleton skeleton-text"></span><span class="skeleton skeleton-text"></span></div>'.repeat(5)}</div></div>
      </main>
      ${renderFooter()}
    </div>
    ${mexe ? modalEquipamento() : ''}
    ${administra(u) ? _modalLimites() : ''}`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'equipamentos' })
  renderNotificacoes()
  _ligar(mexe)
  await carregarBase()
  _desenhar()
  const p = new URLSearchParams(location.search)
  if (p.get('novo') === 'equipamento' && mexe) {
    const url = new URL(location); ['novo', 'desc', 'valor', 'forn', 'pedido', 'num', 'empresa', 'data'].forEach(k => url.searchParams.delete(k))
    history.replaceState(history.state, '', url)
    abrirFormEquipamento(null, {
      descricao: p.get('desc') || '', empresaId: p.get('empresa') || '',
      aquisicao: { data: p.get('data') || hojeISO(), valor: Number(p.get('valor')) || null, fornecedorNome: p.get('forn') || '', pedidoId: p.get('pedido') || '', pedidoNum: p.get('num') || '' },
    })
  }
}

// Unidades, empresas (os limites de troca) e os aparelhos
export async function carregarBase() {
  try {
    const [eq, un, em] = await Promise.all([getDocs(consultaEquipamentos()), getDocs(consultaUnidades()), getDocs(consulta(collection(db, 'empresas')))])
    E.lista = eq.docs.map(d => ({ id: d.id, ...d.data() }))
    E.unidades = un.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    E.empresas = em.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error(e)
    prxToast(t('erroCarregar'), 'error')
  }
  return E
}

function _ligar(mexe) {
  const busca = document.getElementById('eq-busca')
  let tm
  busca.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { E.busca = busca.value.trim().toLowerCase(); _desenhar() }, 120) })
  document.getElementById('eq-f-unidade').addEventListener('change', e => { E.unidade = e.target.value; _desenhar() })
  document.getElementById('eq-f-tipo').addEventListener('change', e => { E.tipo = e.target.value; _desenhar() })
  document.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
    E.aba = b.dataset.aba
    document.querySelectorAll('[data-aba]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    _desenhar()
  }))
  document.getElementById('eq-etiquetas').addEventListener('click', () => baixarEtiquetas(_filtrados().filter(e => e.status !== ST_EQUIP.BAIXADO)))
  document.getElementById('eq-limites')?.addEventListener('click', _abrirLimites)
  if (mexe) {
    document.getElementById('eq-novo').addEventListener('click', () => abrirFormEquipamento(null))
    ligarFormEquipamento(async id => { await carregarBase(); _desenhar(); if (id) navegar('equipamento', { id }) })
  }
  if (document.getElementById('modal-limites')) {
    initModal('modal-limites')
    document.getElementById('lim-salvar').addEventListener('click', _salvarLimites)
    document.getElementById('lim-empresa').addEventListener('change', _preencherLimites)
  }
}

function _filtrados() {
  const q = E.busca
  return E.lista.filter(e =>
    (!E.unidade || e.unidadeId === E.unidade) && (!E.tipo || e.tipo === E.tipo) &&
    (!q || [e.etiqueta, e.descricao, e.marca, e.modelo, e.serie, e.setor, e.unidadeNome].some(v => (v || '').toLowerCase().includes(q))))
}

function _desenhar() {
  const alvo = document.getElementById('eq-lista')
  if (!alvo) return
  alvo.removeAttribute('aria-busy')
  // O filtro de unidade mostra só as que têm aparelhos (ou todas, se nenhuma tem)
  const sel = document.getElementById('eq-f-unidade')
  if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', E.unidades.map(u => `<option value="${esc(u.id)}">${esc(u.nome)}</option>`).join(''))
  const base = _filtrados()
  const ativos = base.filter(e => e.status !== ST_EQUIP.BAIXADO)
  const abas = {
    todos: ativos,
    atencao: ativos.filter(e => _motivos(e).length),
    conserto: ativos.filter(e => e.status === ST_EQUIP.CONSERTO),
    resumo: ativos,
    baixados: base.filter(e => e.status === ST_EQUIP.BAIXADO),
  }
  Object.entries(abas).forEach(([a, l]) => { const n = document.querySelector(`[data-n-aba="${a}"]`); if (n) n.textContent = a === 'resumo' ? '' : l.length || '' })
  const todosAtivos = E.lista.filter(e => e.status !== ST_EQUIP.BAIXADO)
  const atencao = todosAtivos.filter(e => _motivos(e).length).length
  document.getElementById('eq-resumo').textContent = !E.lista.length ? t('eqResumoVazio')
    : atencao ? tf('eqResumoAtencao', { n: todosAtivos.length, a: atencao }) : tf('eqResumo', { n: todosAtivos.length })
  document.getElementById('eq-etiquetas').disabled = !ativos.length
  if (E.aba === 'resumo') { alvo.innerHTML = _resumo(ativos); return }
  const lista = abas[E.aba]
  if (!lista.length) {
    alvo.innerHTML = `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${!E.lista.length ? t('eqVazioTitulo') : t('eqNadaAqui')}</p>
      <p>${!E.lista.length ? t('eqVazioTexto') : E.aba === 'atencao' ? t('eqNadaAtencao') : t('eqNadaFiltro')}</p></div>`
    return
  }
  // Agrupados por unidade, na ordem do nome
  const grupos = new Map()
  for (const e of [...lista].sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || ''))) {
    const k = e.unidadeNome || '—'
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(e)
  }
  alvo.innerHTML = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([nome, itens]) => `
    <section class="sv-grupo">
      <h2 class="sv-grupo-cab"><span>${esc(nome)}</span><span>${itens.length}</span></h2>
      <div class="grupo-lista">${itens.map(linhaDoEquipamento).join('')}</div>
    </section>`).join('')
}

export function linhaDoEquipamento(e) {
  const mot = _motivos(e)
  const sub = [rotuloTipo(e.tipo), [e.marca, e.modelo].filter(Boolean).join(' '), e.setor].filter(Boolean).join(' · ')
  const selo = e.status === ST_EQUIP.CONSERTO ? `<span class="sv-estado sv-st-espera">${t('eqSt_conserto')}</span>`
    : e.status === ST_EQUIP.RESERVA ? `<span class="sv-estado sv-st-neutro">${t('eqSt_reserva')}</span>`
      : e.status === ST_EQUIP.BAIXADO ? `<span class="sv-estado sv-st-fim">${t('eqSt_baixado')}</span>` : ''
  return `
    <a class="sv-item eq-item${mot.length ? ' com-aviso' : ''}" href="?tela=equipamento&id=${encodeURIComponent(e.id)}" data-navegar="equipamento" data-id="${esc(e.id)}">
      <span class="eq-etiqueta">${esc(e.etiqueta)}</span>
      <span class="sv-item-tit">${esc(e.descricao)}</span>
      <span class="sv-item-sub">${esc(sub)}</span>
      <span class="sv-item-dir">${mot.map(m => `<span class="sv-estado sv-st-alerta">${t(`eqAviso_${m}`)}</span>`).join('')}${selo}</span>
      ${icone('setaDir', 14)}
    </a>`
}

// Quantos de cada tipo em cada unidade (os ativos: em uso, em conserto, reserva)
function _resumo(lista) {
  if (!lista.length) return `<p class="sv-vazio">${t('eqNadaFiltro')}</p>`
  const tipos = TIPOS_EQUIP.map(x => x.id).filter(id => lista.some(e => e.tipo === id))
  const unidades = [...new Set(lista.map(e => e.unidadeNome || '—'))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const n = (un, tp) => lista.filter(e => (e.unidadeNome || '—') === un && (!tp || e.tipo === tp)).length
  const totTipo = tp => lista.filter(e => e.tipo === tp).length
  const valor = Math.round(lista.reduce((s, e) => s + (Number(e.aquisicao?.valor) || 0), 0) * 100) / 100
  return `
    <dl class="cf-numeros eq-numeros">
      <div class="cf-numero"><dt>${t('eqEmUso')}</dt><dd>${lista.filter(e => e.status === ST_EQUIP.USO).length}</dd></div>
      <div class="cf-numero"><dt>${t('eqSt_conserto')}</dt><dd>${lista.filter(e => e.status === ST_EQUIP.CONSERTO).length}</dd></div>
      <div class="cf-numero"><dt>${t('eqSt_reserva')}</dt><dd>${lista.filter(e => e.status === ST_EQUIP.RESERVA).length}</dd></div>
      <div class="cf-numero"><dt>${t('eqValorPago')}</dt><dd>${valor ? formatCurrency(valor) : '—'}</dd></div>
    </dl>
    <div class="cfg-livro eq-matriz-moldura" tabindex="0" role="region" aria-label="${t('eqAba_resumo')}">
      <table class="cfg-tabela eq-matriz">
        <thead><tr><th scope="col">${t('eqUnidade')}</th>${tipos.map(tp => `<th scope="col" class="num">${esc(rotuloTipo(tp))}</th>`).join('')}<th scope="col" class="num">${t('eqTotal')}</th></tr></thead>
        <tbody>${unidades.map(un => `<tr><th scope="row">${esc(un)}</th>${tipos.map(tp => `<td class="num">${n(un, tp) || '<span class="eq-zero">·</span>'}</td>`).join('')}<td class="num"><strong>${n(un)}</strong></td></tr>`).join('')}</tbody>
        <tfoot><tr><th scope="row">${t('eqTotal')}</th>${tipos.map(tp => `<td class="num">${totTipo(tp)}</td>`).join('')}<td class="num"><strong>${lista.length}</strong></td></tr></tfoot>
      </table>
    </div>`
}

// ── Cadastro e edição (também usado pela ficha) ────────────────────
export function modalEquipamento() {
  const campo = (id, rot, html, extra = '') => `<div class="form-group${extra}" data-campo="${id}"><label for="${id}">${rot}</label>${html}</div>`
  return `
    <div class="modal-overlay" id="modal-equip" role="dialog" aria-modal="true" aria-labelledby="eqf-t">
      <div class="modal np-modal sv-modal">
        <div class="modal-header"><div><h2 id="eqf-t">${t('eqNovo')}</h2><p class="np-sub" id="eqf-sub"></p></div>
          <button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button></div>
        <div class="modal-body">
          <div class="np-linhas">
            ${campo('eqf-tipo', t('eqTipo'), `<select id="eqf-tipo">${TIPOS_EQUIP.map(x => `<option value="${x.id}">${esc(rotuloTipo(x.id))}</option>`).join('')}</select>`)}
            ${campo('eqf-desc', t('eqDescricao'), `<input type="text" id="eqf-desc" maxlength="120" placeholder="${t('eqDescricaoExemplo')}">`)}
            ${campo('eqf-marca', t('eqMarca'), '<input type="text" id="eqf-marca" maxlength="60">')}
            ${campo('eqf-modelo', t('eqModelo'), '<input type="text" id="eqf-modelo" maxlength="60">')}
            ${campo('eqf-serie', t('eqSerie'), '<input type="text" id="eqf-serie" maxlength="60" autocapitalize="characters">')}
            ${campo('eqf-unidade', t('eqUnidade'), '<select id="eqf-unidade"></select>')}
            ${campo('eqf-setor', t('eqSetor'), `<input type="text" id="eqf-setor" maxlength="60" placeholder="${t('eqSetorExemplo')}">`)}
            ${campo('eqf-status', t('eqSituacao'), `<select id="eqf-status"><option value="uso">${t('eqSt_uso')}</option><option value="reserva">${t('eqSt_reserva')}</option></select>`, ' eqf-so-novo')}
          </div>
          <span class="np-secao">${t('eqCompra')}</span>
          <div class="np-linhas">
            ${campo('eqf-data', t('eqDataCompra'), '<input type="date" id="eqf-data">')}
            ${campo('eqf-valor', t('eqValorPago'), '<input type="number" id="eqf-valor" min="0" step="0.01" inputmode="decimal">')}
            ${campo('eqf-forn', t('eqFornecedor'), '<input type="text" id="eqf-forn" maxlength="80">')}
            ${campo('eqf-garantia', t('eqGarantiaAte'), '<input type="date" id="eqf-garantia">')}
            ${campo('eqf-preco', t('eqPrecoNovo'), '<input type="number" id="eqf-preco" min="0" step="0.01" inputmode="decimal">')}
          </div>
          <p class="np-dica">${t('eqDicaPrecoNovo')}</p>
          ${campo('eqf-notas', t('eqNotas'), '<textarea id="eqf-notas" rows="2" maxlength="500"></textarea>')}
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="eqf-salvar">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>`
}

let _aoSalvar = null
export function ligarFormEquipamento(aoSalvar) {
  _aoSalvar = aoSalvar
  initModal('modal-equip')
  document.getElementById('eqf-salvar').addEventListener('click', _salvar)
}

export function abrirFormEquipamento(equip, sugestao = {}) {
  const e = equip || sugestao
  E.editando = equip
  E.sugestao = equip ? null : (sugestao.aquisicao || null)
  const souGestor = papelEquip(sessao.usuario) === 'gestor'
  document.getElementById('eqf-t').textContent = equip ? t('eqEditar') : t('eqNovo')
  document.getElementById('eqf-sub').textContent = equip ? `${equip.etiqueta} · ${equip.descricao}` : (e.aquisicao?.pedidoNum ? tf('eqDoPedido', { n: e.aquisicao.pedidoNum }) : t('eqNovoSub'))
  const val = (id, v) => { document.getElementById(id).value = v ?? '' }
  val('eqf-tipo', e.tipo || 'ar_condicionado')
  document.getElementById('eqf-tipo').disabled = !!equip // o tipo dá o prefixo da etiqueta
  val('eqf-desc', e.descricao); val('eqf-marca', e.marca); val('eqf-modelo', e.modelo); val('eqf-serie', e.serie)
  val('eqf-setor', e.setor); val('eqf-status', e.status === ST_EQUIP.RESERVA ? 'reserva' : 'uso')
  val('eqf-data', e.aquisicao?.data); val('eqf-valor', e.aquisicao?.valor); val('eqf-forn', e.aquisicao?.fornecedorNome)
  val('eqf-garantia', e.garantiaAte); val('eqf-preco', e.precoNovo); val('eqf-notas', e.notas)
  // O responsável não muda o preço de referência (as regras também conferem)
  document.getElementById('eqf-preco').disabled = !!equip && !souGestor
  document.querySelectorAll('.eqf-so-novo').forEach(g => { g.hidden = !!equip })
  // Na edição, o lugar muda por "Mover" (fica no histórico); aqui só no cadastro
  const un = document.getElementById('eqf-unidade')
  const lista = E.unidades.filter(u => u.ativa !== false && (!e.empresaId || u.empresaId === e.empresaId || !!equip))
  un.innerHTML = (lista.length ? lista : E.unidades).map(u => `<option value="${esc(u.id)}"${u.id === e.unidadeId ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')
  un.closest('.form-group').hidden = !!equip
  abrirModal('modal-equip')
}

function _lerForm() {
  const v = id => document.getElementById(id).value.trim()
  const num = id => { const x = document.getElementById(id).value; return x === '' ? null : Math.round(Number(x) * 100) / 100 }
  return {
    tipo: v('eqf-tipo'), descricao: v('eqf-desc'), marca: v('eqf-marca'), modelo: v('eqf-modelo'), serie: v('eqf-serie'),
    unidadeId: v('eqf-unidade'), setor: v('eqf-setor'), status: v('eqf-status'),
    aquisicao: { data: v('eqf-data') || null, valor: num('eqf-valor'), fornecedorNome: v('eqf-forn') },
    garantiaAte: v('eqf-garantia') || null, precoNovo: num('eqf-preco'), notas: v('eqf-notas'),
  }
}

async function _salvar() {
  const modal = document.getElementById('modal-equip')
  const f = _lerForm()
  if (!f.descricao) { avisoNoFormulario(modal, t('eqDigaDescricao')); return }
  if (!exigirConexao()) return
  const antes = E.editando
  mostrarSpinner()
  try {
    let id
    if (antes) {
      id = antes.id
      const dados = { descricao: f.descricao, marca: f.marca, modelo: f.modelo, serie: f.serie, setor: f.setor,
        aquisicao: { ...(antes.aquisicao || {}), ...f.aquisicao }, garantiaAte: f.garantiaAte, notas: f.notas,
        ...(papelEquip(sessao.usuario) === 'gestor' ? { precoNovo: f.precoNovo } : {}) }
      await gravarComEvento(doc(db, 'equipamentos', id), dados, { tipo: 'editado', texto: '' })
    } else {
      const un = E.unidades.find(u => u.id === f.unidadeId)
      if (!un) { avisoNoFormulario(modal, t('eqEscolhaUnidade')); return }
      const sug = E.sugestao || {}
      id = await _criar({ ...f, empresaId: un.empresaId, unidadeNome: un.nome,
        aquisicao: { ...f.aquisicao, ...(sug.pedidoId ? { pedidoId: sug.pedidoId, pedidoNum: sug.pedidoNum } : {}) } })
    }
    fecharModal('modal-equip')
    prxToast(antes ? t('eqSalvo') : t('eqCadastrado'), 'success')
    await _aoSalvar?.(antes ? null : id)
  } catch (e) {
    console.error(e)
    prxToast(e?.code === 'permission-denied' ? t('eqSemPermissao') : t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

// A etiqueta sai do contador do prefixo, no mesmo lote. Se outra pessoa
// cadastrou ao mesmo tempo, o número já foi usado: tenta de novo uma vez
async function _criar(d, tentativa = 1) {
  const prefixo = prefixoDoTipo(d.tipo)
  const { n, ref: contador, campo } = await proximoNumeroEtiqueta(prefixo)
  const ref = doc(db, 'equipamentos', novoId('equipamentos'))
  const etiqueta = etiquetaDe(prefixo, n)
  const dados = { etiqueta, ...d, custos: [] }
  if (!dados.precoNovo && dados.precoNovo !== 0) delete dados.precoNovo
  if (!dados.garantiaAte) delete dados.garantiaAte
  try {
    await gravarComEvento(ref, dados, { tipo: 'cadastro', texto: etiqueta }, { criar: true,
      extra: lote => (eContaDemo() ? lote.set(contador, { [campo]: n }, { merge: true }) : lote.set(contador, { total: n })) })
    return ref.id
  } catch (e) {
    if (tentativa < 2 && e?.code === 'permission-denied') return _criar(d, tentativa + 1)
    throw e
  }
}

// ── Etiquetas em PDF ───────────────────────────────────────────────
// Folha A4 com 3 × 8 etiquetas de 63,5 × 33,9 mm (o padrão das folhas
// adesivas Pimaco A4 com 24 por folha). Cada uma: o QR (abre a ficha), a
// etiqueta grande, a descrição e a unidade
export async function baixarEtiquetas(lista) {
  if (!lista.length) return
  mostrarSpinner(t('eqGerandoEtiquetas'))
  try {
    const { jsPDF } = await carregarBiblioteca('jspdf')
    const pdf = new jsPDF({ format: 'a4', unit: 'mm' })
    const L = 63.5, A = 33.9, mx = 7.2, my = 12.9, gx = 2.5, porFolha = 24
    lista.forEach((e, i) => {
      if (i && i % porFolha === 0) pdf.addPage()
      const k = i % porFolha, col = k % 3, lin = Math.floor(k / 3)
      const x = mx + col * (L + gx), y = my + lin * A
      const { matriz } = matrizQR(enderecoDoQrDoEquip(e))
      const lado = A - 6, m = lado / matriz.length
      pdf.setFillColor(0, 0, 0)
      matriz.forEach((linha, yy) => linha.forEach((escuro, xx) => { if (escuro) pdf.rect(x + 3 + xx * m, y + 3 + yy * m, m + 0.01, m + 0.01, 'F') }))
      const tx = x + lado + 6, larg = L - lado - 9
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13)
      pdf.text(e.etiqueta, tx, y + 10)
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5)
      pdf.text(pdf.splitTextToSize(e.descricao || '', larg).slice(0, 2), tx, y + 15)
      pdf.setFontSize(6.5)
      pdf.text(pdf.splitTextToSize(e.unidadeNome || '', larg).slice(0, 1), tx, y + 24)
      pdf.text('PRAXIS', tx, y + 29)
    })
    pdf.save(`${t('eqArquivoEtiquetas')}-${hojeISO()}.pdf`)
  } catch (e) {
    console.error(e)
    prxToast(t('erroExportarPDF'), 'error')
  } finally {
    esconderSpinner()
  }
}

// ── Limites de troca por empresa (quem administra) ─────────────────
function _modalLimites() {
  return `
    <div class="modal-overlay" id="modal-limites" role="dialog" aria-modal="true" aria-labelledby="lim-t">
      <div class="modal np-modal sv-modal cfg-modal-sm">
        <div class="modal-header"><h2 id="lim-t">${t('eqLimites')}</h2>
          <button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button></div>
        <div class="modal-body">
          <p class="np-dica">${t('eqLimitesDesc')}</p>
          <div class="form-group"><label for="lim-empresa">${t('cfgEmpresa')}</label><select id="lim-empresa"></select></div>
          <div class="np-linhas">
            <div class="form-group"><label for="lim-pct">${t('eqLimitePct')}</label><input type="number" id="lim-pct" min="10" max="200" inputmode="numeric"></div>
            <div class="form-group"><label for="lim-qtd">${t('eqLimiteQtd')}</label><input type="number" id="lim-qtd" min="1" max="24" inputmode="numeric"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="lim-salvar">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>`
}
function _abrirLimites() {
  const sel = document.getElementById('lim-empresa')
  sel.innerHTML = E.empresas.filter(x => x.ativa !== false).map(x => `<option value="${esc(x.id)}">${esc(x.nomeExibicao || x.nome || '')}</option>`).join('')
  _preencherLimites()
  abrirModal('modal-limites')
}
function _preencherLimites() {
  const lim = limitesDaEmpresa(E.empresas, document.getElementById('lim-empresa').value)
  document.getElementById('lim-pct').value = lim.pct
  document.getElementById('lim-qtd').value = lim.qtdAno
}
async function _salvarLimites() {
  const emp = E.empresas.find(x => x.id === document.getElementById('lim-empresa').value)
  const pct = Math.round(Number(document.getElementById('lim-pct').value))
  const qtdAno = Math.round(Number(document.getElementById('lim-qtd').value))
  if (!emp || !(pct >= 10 && pct <= 200) || !(qtdAno >= 1 && qtdAno <= 24)) {
    avisoNoFormulario(document.getElementById('modal-limites'), t('eqLimitesInvalidos'))
    return
  }
  mostrarSpinner()
  try {
    await gravarAuditado({ colecao: 'empresas', id: emp.id, tipo: 'editar', antes: emp, nome: emp.nomeExibicao || emp.nome || '',
      empresaIds: [emp.id], dados: { equipTroca: { pct, qtdAno } } })
    emp.equipTroca = { pct, qtdAno }
    fecharModal('modal-limites')
    prxToast(t('eqLimitesSalvos'), 'success')
    _desenhar()
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}
