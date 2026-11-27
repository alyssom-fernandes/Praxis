// A ficha de um equipamento (27/11/2026): o que é, onde está, a compra e a
// garantia, os consertos contra o preço de um novo (o aviso de troca), os
// chamados de Serviços ligados a ele e o registro de tudo. A etiqueta de QR
// colada no aparelho abre esta tela (?tela=equipamento&id=…).
import { db, collection, doc, getDocs, onSnapshot, query, orderBy, where } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral, navegar, rotaAnterior, registrarLimpador } from './app.js'
import { sessao } from './estado.js'
import { prxToast, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, initModal, avisoNoFormulario, exigirConexao } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t, idioma } from './constants.js'
import { esc, formatCurrency, hojeISO } from './utils.js'
import { tf } from './config-comum.js'
import { icone } from './icones.js'
import { papelEquip, papelServicos } from './modulos.js'
import { ST_EQUIP, avaliacaoTroca, situacaoGarantia, idadeDe, precisaAtencao } from './equip-regras.js'
import { numeroDoChamado } from './servicos-regras.js'
import { consultaChamados, gravarComEvento, msDe } from './modulos-dados.js'
import {
  carregarBase, modalEquipamento, ligarFormEquipamento, abrirFormEquipamento, baixarEtiquetas,
  rotuloTipo, rotuloSituacao, limitesDaEmpresa,
} from './equipamentos.js'
import { rotuloDoStatus } from './servicos.js'

const F = { id: null, e: null, base: null, historico: [], chamados: [] }
const _data = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '')
const _dt = v => { const ms = msDe(v); return ms ? new Date(ms).toLocaleString(idioma() === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }

export async function renderEquipamento(id) {
  if (!id) { navegar('equipamentos'); return }
  Object.assign(F, { id, e: null, historico: [], chamados: [] })
  const mexe = ['responsavel', 'gestor'].includes(papelEquip(sessao.usuario))
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('equipamento')}
      <main class="main-content">
        <div id="eq-root" class="sv-chamado"><div class="sv-carregando"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-text"></span></div></div>
      </main>
      ${renderFooter()}
    </div>
    ${mexe ? `${modalEquipamento()}${_modais()}` : ''}`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'equipamentos' })
  renderNotificacoes()
  F.base = await carregarBase()
  if (mexe) {
    ligarFormEquipamento(() => {})
    _ligarModais()
  }
  const ref = doc(db, 'equipamentos', id)
  const parar = [
    onSnapshot(ref, s => {
      if (!s.exists()) { _naoEncontrado(); return }
      F.e = { id: s.id, ...s.data() }
      _desenhar()
    }, () => _naoEncontrado()),
    onSnapshot(query(collection(ref, 'historico'), orderBy('criadoEm')), s => {
      F.historico = s.docs.map(d => ({ id: d.id, ...d.data() }))
      if (F.e) _desenhar()
    }, err => console.warn('historico', err.code)),
  ]
  registrarLimpador(() => parar.forEach(p => p()))
  // Os chamados de Serviços que apontam para este aparelho
  if (papelServicos(sessao.usuario)) {
    getDocs(consultaChamados(where('equipamentoId', '==', id)))
      .then(s => { F.chamados = s.docs.map(d => ({ id: d.id, ...d.data() })); if (F.e) _desenhar() })
      .catch(err => console.warn('chamados do aparelho', err.code))
  }
}

function _naoEncontrado() {
  const r = document.getElementById('eq-root')
  if (r) r.innerHTML = `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${t('eqNaoEncontrado')}</p>
    <button type="button" class="btn-secondary" data-navegar="equipamentos">${t('eqVoltar')}</button></div>`
}

function _desenhar() {
  const r = document.getElementById('eq-root')
  const e = F.e
  if (!r || !e) return
  const papel = papelEquip(sessao.usuario)
  const mexe = ['responsavel', 'gestor'].includes(papel)
  const baixado = e.status === ST_EQUIP.BAIXADO
  const lim = limitesDaEmpresa(F.base?.empresas || [], e.empresaId)
  const av = avaliacaoTroca(e, lim, hojeISO())
  const ant = rotaAnterior()
  const voltar = ant?.tela === 'equipamentos' ? 'href="?tela=equipamentos" data-voltar-historico' : 'href="?tela=equipamentos" data-navegar="equipamentos"'
  r.innerHTML = `
    <div class="detalhe-layout">
      <div class="detalhe-head-linha">
        <nav class="detalhe-trilha" aria-label="${t('dtTrilhaAria')}">
          <a class="detalhe-voltar" ${voltar}>${icone('setaEsq', 20)}<span>${t('modEquipamentos')}</span></a>
        </nav>
        <span class="detalhe-num eq-etiqueta" aria-current="page">${esc(e.etiqueta)}</span>
        ${e.status !== ST_EQUIP.USO ? `<span class="sv-estado ${e.status === ST_EQUIP.CONSERTO ? 'sv-st-espera' : e.status === ST_EQUIP.BAIXADO ? 'sv-st-fim' : 'sv-st-neutro'}">${esc(rotuloSituacao(e.status))}</span>` : ''}
      </div>
      <header class="detalhe-head">
        <h1 class="detalhe-titulo">${esc(e.descricao)}</h1>
        <p class="detalhe-meta">${[rotuloTipo(e.tipo), e.unidadeNome, e.setor].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('<span class="detalhe-meta-sep" aria-hidden="true">·</span>')}</p>
      </header>
      <div class="detalhe-cols">
        <div class="detalhe-main">
          ${_troca(e, av)}
          ${_custos(e)}
          ${_chamados()}
          ${_registro()}
        </div>
        <aside class="detalhe-aside">
          <div class="ord-decisao">${_situacao(e, av, mexe, papel, baixado)}</div>
          ${_dados(e)}
        </aside>
      </div>
    </div>`
  r.querySelectorAll('[data-pct]').forEach(el => el.style.setProperty('width', `${el.dataset.pct}%`))
  r.querySelectorAll('[data-esq]').forEach(el => el.style.setProperty('left', `${el.dataset.esq}%`))
  r.querySelectorAll('[data-acao]').forEach(b => b.addEventListener('click', () => _acao(b.dataset.acao)))
}

// O cartão de decisão: o que este aparelho pede agora, e os botões
function _situacao(e, av, mexe, papel, baixado) {
  const motivos = precisaAtencao(e, av.limites, hojeISO())
  let tom = 'neutro', rotulo = t('eqSituacao'), titulo = rotuloSituacao(e.status), texto
  if (baixado) {
    titulo = t('eqBaixado'); texto = tf('eqBaixadoTexto', { d: _data(e.baixa?.data), motivo: e.baixa?.motivo || '', nome: e.baixa?.porNome || '' })
  } else if (e.status === ST_EQUIP.CONSERTO) {
    tom = motivos.includes('parado') ? 'voce' : 'neutro'
    titulo = tf('eqEmConsertoCom', { oficina: e.conserto?.oficina || '' })
    texto = tf('eqEmConsertoTexto', { d: _data(e.conserto?.desde), motivo: e.conserto?.motivo || '' })
  } else if (av.trocar) {
    tom = 'voce'; rotulo = t('eqAviso_troca'); titulo = t('eqAvalieTroca')
    texto = av.porValor ? tf('eqTrocaPorValor', { pct: av.pct, soma: formatCurrency(av.soma), preco: formatCurrency(e.precoNovo) })
      : tf('eqTrocaPorVezes', { n: av.noAno, lim: av.limites.qtdAno })
  } else if (motivos.includes('garantia')) {
    tom = 'voce'; rotulo = t('eqAviso_garantia')
    titulo = tf('eqGarantiaVence', { n: situacaoGarantia(e.garantiaAte, hojeISO()).dias })
    texto = t('eqGarantiaVenceTexto')
  } else {
    texto = e.status === ST_EQUIP.RESERVA ? t('eqReservaTexto') : t('eqEmUsoTexto')
  }
  const b = (acao, rot, cls = 'btn-secondary') => `<button type="button" class="${cls}" data-acao="${acao}">${rot}</button>`
  const botoes = !mexe ? [] : baixado
    ? (papel === 'gestor' ? [b('reativar', t('eqReativar'))] : [])
    : e.status === ST_EQUIP.CONSERTO
      ? [b('volta', t('eqVoltouConserto'), 'btn-primary'), b('mover', t('eqMover'))]
      : [b('conserto', t('eqEnviarConserto'), av.trocar ? 'btn-secondary' : 'btn-primary'), b('mover', t('eqMover')), b('custo', t('eqRegistrarCusto')),
        ...(papel === 'gestor' ? [b('baixa', t('eqDarBaixa'), av.trocar ? 'btn-primary' : 'btn-secondary')] : [])]
  const extras = [
    papelServicos(sessao.usuario) && !['prestador'].includes(papelServicos(sessao.usuario)) && !baixado ? b('chamado', t('eqAbrirChamado')) : '',
    mexe ? b('editar', t('eqEditar')) : '',
    b('etiqueta', t('eqEtiqueta')),
  ].filter(Boolean)
  return `
    <section class="decisao tom-${tom}">
      <div class="decisao-topo"><div class="decisao-texto">
        <p class="decisao-rotulo">${esc(rotulo)}</p>
        <h2 class="decisao-titulo">${esc(titulo)}</h2>
        ${texto ? `<p class="decisao-desc">${esc(texto)}</p>` : ''}
      </div></div>
      ${botoes.length ? `<div class="decisao-acoes">${botoes.join('')}</div>` : ''}
      <div class="decisao-acoes eq-acoes-sec">${extras.join('')}</div>
    </section>`
}

// O medidor da troca: quanto os consertos já custaram contra o preço de um novo
function _troca(e, av) {
  if (!(av.soma > 0) && !e.precoNovo) return ''
  const pct = av.pct ?? 0
  const larg = Math.min(100, pct)
  return `
    <section class="dt-bloco">
      <div class="dt-card-head"><h2 class="dt-secao">${t('eqConsertosXNovo')}</h2></div>
      <div class="eq-medidor${av.trocar ? ' passou' : ''}">
        ${e.precoNovo ? `
        <div class="eq-barra" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}" aria-label="${t('eqConsertosXNovo')}">
          <span class="eq-barra-cheia" data-pct="${larg}"></span>
          <span class="eq-barra-limite" data-esq="${Math.min(av.limites.pct, 100)}" title="${tf('eqLimiteEm', { pct: av.limites.pct })}"></span>
        </div>
        <p class="eq-medidor-txt">${esc(tf('eqMedidor', { soma: formatCurrency(av.soma), preco: formatCurrency(e.precoNovo), pct }))}</p>`
    : `<p class="eq-medidor-txt">${esc(tf('eqSemPrecoNovo', { soma: formatCurrency(av.soma) }))}</p>`}
        <p class="eq-medidor-txt">${esc(tf('eqConsertosNoAno', { n: av.noAno, lim: av.limites.qtdAno }))}</p>
      </div>
    </section>`
}

function _custos(e) {
  const custos = [...(e.custos || [])].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  if (!custos.length) return ''
  return `
    <section class="dt-bloco">
      <div class="dt-card-head"><h2 class="dt-secao">${t('eqConsertos')}<span class="dt-contagem">${custos.length}</span></h2></div>
      <ul class="sv-extras">${custos.map(c => `
        <li><div><span class="sv-item-tit">${esc(c.descricao || t('eqConserto'))}</span>
          <span class="sv-item-sub">${esc([_data(c.data), c.oficina, c.chamadoNumero ? numeroDoChamado(c.chamadoNumero) : ''].filter(Boolean).join(' · '))}</span></div>
          <span class="cf-valor">${formatCurrency(Number(c.valor) || 0)}</span></li>`).join('')}</ul>
    </section>`
}

function _chamados() {
  if (!F.chamados.length) return ''
  const lista = [...F.chamados].sort((a, b) => (msDe(b.criadoEm) || 0) - (msDe(a.criadoEm) || 0))
  return `
    <section class="dt-bloco">
      <div class="dt-card-head"><h2 class="dt-secao">${t('eqChamadosLigados')}<span class="dt-contagem">${lista.length}</span></h2></div>
      <div class="grupo-lista">${lista.map(c => `
        <a class="sv-item" href="?tela=chamado&id=${encodeURIComponent(c.id)}" data-navegar="chamado" data-id="${esc(c.id)}">
          <span class="sv-item-tit">${esc(c.titulo || t('svVisita'))}</span>
          <span class="sv-item-sub">${esc([c.numero ? numeroDoChamado(c.numero) : '', c.fornecedorNome, _dt(c.criadoEm)].filter(Boolean).join(' · '))}</span>
          <span class="sv-item-dir"><span class="sv-estado">${esc(rotuloDoStatus(c))}</span></span>${icone('setaDir', 14)}
        </a>`).join('')}</div>
    </section>`
}

function _registro() {
  if (!F.historico.length) return ''
  return `
    <section class="dt-bloco">
      <div class="dt-card-head"><h2 class="dt-secao">${t('svRegistro')}</h2></div>
      <ol class="sv-registro">${[...F.historico].reverse().map(h => `
        <li><span class="sv-reg-quando">${esc(_dt(h.criadoEm))}</span>
          <span class="sv-reg-o-que"><strong>${esc(h.autorNome || '')}</strong> ${esc(t(`eqEv_${h.tipo}`))}${h.texto ? ` — ${esc(h.texto)}` : ''}</span></li>`).join('')}</ol>
    </section>`
}

function _dados(e) {
  const g = situacaoGarantia(e.garantiaAte, hojeISO())
  const idade = idadeDe(e.aquisicao?.data, hojeISO())
  const linhas = [
    [t('eqTipo'), rotuloTipo(e.tipo)],
    [t('eqMarcaModelo'), [e.marca, e.modelo].filter(Boolean).join(' ')],
    [t('eqSerie'), e.serie],
    [t('eqUnidade'), e.unidadeNome],
    [t('eqSetor'), e.setor],
    [t('eqDataCompra'), e.aquisicao?.data ? `${_data(e.aquisicao.data)}${idade ? ` · ${idade.anos ? tf('eqIdadeAnos', { a: idade.anos, m: idade.meses }) : tf('eqIdadeMeses', { m: idade.meses })}` : ''}` : ''],
    [t('eqValorPago'), e.aquisicao?.valor ? formatCurrency(e.aquisicao.valor) : ''],
    [t('eqFornecedor'), e.aquisicao?.fornecedorNome],
    [t('eqPedido'), e.aquisicao?.pedidoId ? `<a href="?tela=detalhe&id=${encodeURIComponent(e.aquisicao.pedidoId)}" data-navegar="detalhe" data-id="${esc(e.aquisicao.pedidoId)}">${esc(e.aquisicao.pedidoNum || t('eqVerPedido'))}</a>` : '', true],
    [t('eqGarantia'), g ? `${_data(e.garantiaAte)} · ${g.vencida ? t('eqGarantiaVencida') : tf('eqGarantiaDias', { n: g.dias })}` : ''],
    [t('eqPrecoNovo'), e.precoNovo ? formatCurrency(e.precoNovo) : ''],
    [t('eqNotas'), e.notas],
  ].filter(([, v]) => v)
  return `
    <section class="dt-bloco">
      <div class="dt-card-head"><h2 class="dt-secao">${t('eqDados')}</h2></div>
      <dl class="detalhe-meta-grid">${linhas.map(([k, v, html]) => `<div class="meta-item"><dt class="meta-label">${k}</dt><dd class="meta-value">${html ? v : esc(v)}</dd></div>`).join('')}</dl>
    </section>`
}

// ── Ações ──────────────────────────────────────────────────────────
function _acao(a) {
  const e = F.e
  if (a === 'editar') return abrirFormEquipamento(e)
  if (a === 'etiqueta') return baixarEtiquetas([e])
  if (a === 'chamado') return navegar('servicos', { novo: 'chamado', u: e.unidadeId, eq: e.id })
  const modal = { mover: 'm-mover', conserto: 'm-conserto', volta: 'm-volta', custo: 'm-custo', baixa: 'm-baixa', reativar: 'm-reativar' }[a]
  if (!modal) return
  const el = document.getElementById(modal)
  el.querySelectorAll('input, textarea').forEach(i => { i.value = i.type === 'date' ? hojeISO() : '' })
  if (a === 'mover' || a === 'reativar') {
    const sel = el.querySelector('select.eqm-unidade')
    const unidades = (F.base?.unidades || []).filter(u => u.ativa !== false && (papelEquip(sessao.usuario) === 'gestor' || u.empresaId === e.empresaId))
    sel.innerHTML = unidades.map(u => `<option value="${esc(u.id)}"${u.id === e.unidadeId ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')
    const setor = el.querySelector('.eqm-setor')
    if (setor) setor.value = e.setor || ''
  }
  abrirModal(modal)
}

function _modais() {
  const m = (id, titulo, corpo, botao, perigo = false) => `
    <div class="modal-overlay" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="modal np-modal sv-modal cfg-modal-sm">
        <div class="modal-header"><h2 id="${id}-t">${titulo}</h2><button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button></div>
        <div class="modal-body">${corpo}</div>
        <div class="modal-footer"><button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="${perigo ? 'btn-danger' : 'btn-primary'}" data-salvar="${id}">${botao}</button></div>
      </div>
    </div>`
  const g = (id, rot, html) => `<div class="form-group" data-campo="${id}"><label for="${id}">${rot}</label>${html}</div>`
  // Os campos em lista agrupada (np-linhas), como nas outras janelas; a dica embaixo
  const L = (...campos) => `<div class="np-linhas">${campos.join('')}</div>`
  const dica = txt => `<p class="np-dica">${txt}</p>`
  const opc = rot => `${rot} <span class="np-opcional">${t('opcional')}</span>`
  return [
    m('m-mover', t('eqMover'), L(g('mv-un', t('eqUnidade'), '<select id="mv-un" class="eqm-unidade"></select>'),
      g('mv-setor', t('eqSetor'), '<input type="text" id="mv-setor" class="eqm-setor" maxlength="60">'),
      g('mv-motivo', opc(t('eqMotivo')), '<input type="text" id="mv-motivo" maxlength="120">')), t('eqMover')),
    m('m-conserto', t('eqEnviarConserto'), L(g('cs-oficina', t('eqOficina'), `<input type="text" id="cs-oficina" maxlength="80" placeholder="${t('eqOficinaExemplo')}">`),
      g('cs-motivo', t('eqDefeito'), '<input type="text" id="cs-motivo" maxlength="120">'),
      g('cs-data', t('eqSaiuEm'), '<input type="date" id="cs-data">')) + dica(t('eqConsertoDica')), t('eqEnviarConserto')),
    m('m-volta', t('eqVoltouConserto'), L(g('vt-desc', t('eqOQueFoiFeito'), '<input type="text" id="vt-desc" maxlength="120">'),
      g('vt-valor', t('eqValorConserto'), '<input type="number" id="vt-valor" min="0" step="0.01" inputmode="decimal">'),
      g('vt-data', t('eqVoltouEm'), '<input type="date" id="vt-data">')) + dica(t('eqValorZeroDica')), t('eqRegistrarVolta')),
    m('m-custo', t('eqRegistrarCusto'), L(g('ct-desc', t('eqOQueFoiFeito'), '<input type="text" id="ct-desc" maxlength="120">'),
      g('ct-oficina', t('eqQuemFez'), '<input type="text" id="ct-oficina" maxlength="80">'),
      g('ct-valor', t('eqValorConserto'), '<input type="number" id="ct-valor" min="0.01" step="0.01" inputmode="decimal">'),
      g('ct-data', t('eqData'), '<input type="date" id="ct-data">')) + dica(t('eqCustoDica')), t('salvarLabel')),
    m('m-baixa', t('eqDarBaixa'), L(g('bx-motivo', t('eqMotivo'), `<input type="text" id="bx-motivo" maxlength="120" placeholder="${t('eqBaixaExemplo')}">`),
      g('bx-data', t('eqData'), '<input type="date" id="bx-data">')) + dica(t('eqBaixaDica')), t('eqDarBaixa'), true),
    m('m-reativar', t('eqReativar'), L(g('rt-un', t('eqUnidade'), '<select id="rt-un" class="eqm-unidade"></select>')) + dica(t('eqReativarDica')), t('eqReativar')),
  ].join('')
}

function _ligarModais() {
  ['m-mover', 'm-conserto', 'm-volta', 'm-custo', 'm-baixa', 'm-reativar'].forEach(id => {
    initModal(id)
    document.querySelector(`[data-salvar="${id}"]`).addEventListener('click', () => _salvarModal(id))
  })
}

async function _salvarModal(id) {
  const e = F.e
  const modal = document.getElementById(id)
  const v = x => document.getElementById(x).value.trim()
  const num = x => { const s = document.getElementById(x).value; return s === '' ? null : Math.round(Number(s) * 100) / 100 }
  const unidade = uid => (F.base?.unidades || []).find(u => u.id === uid)
  let dados, evento
  if (id === 'm-mover' || id === 'm-reativar') {
    const un = unidade(v(id === 'm-mover' ? 'mv-un' : 'rt-un'))
    if (!un) { avisoNoFormulario(modal, t('eqEscolhaUnidade')); return }
    dados = { unidadeId: un.id, unidadeNome: un.nome, empresaId: un.empresaId, ...(id === 'm-mover' ? { setor: v('mv-setor') } : { status: ST_EQUIP.USO, baixa: null }) }
    evento = id === 'm-mover'
      ? { tipo: 'movido', texto: [`${e.unidadeNome || ''}${e.setor ? ` (${e.setor})` : ''} → ${un.nome}${v('mv-setor') ? ` (${v('mv-setor')})` : ''}`, v('mv-motivo')].filter(Boolean).join(' · ') }
      : { tipo: 'reativado', texto: un.nome }
  } else if (id === 'm-conserto') {
    if (!v('cs-oficina') || !v('cs-motivo')) { avisoNoFormulario(modal, t('eqDigaOficina')); return }
    dados = { status: ST_EQUIP.CONSERTO, conserto: { oficina: v('cs-oficina'), motivo: v('cs-motivo'), desde: v('cs-data') || hojeISO() } }
    evento = { tipo: 'conserto_saida', texto: `${v('cs-oficina')} · ${v('cs-motivo')}` }
  } else if (id === 'm-volta') {
    const valor = num('vt-valor')
    if (valor == null || valor < 0) { avisoNoFormulario(modal, t('eqDigaValor')); return }
    const linha = { data: v('vt-data') || hojeISO(), valor, descricao: v('vt-desc') || e.conserto?.motivo || '', oficina: e.conserto?.oficina || '' }
    dados = { status: ST_EQUIP.USO, conserto: null, ...(valor > 0 ? { custos: [...(e.custos || []), linha] } : {}) }
    evento = { tipo: 'conserto_volta', texto: [e.conserto?.oficina, valor > 0 ? formatCurrency(valor) : t('eqSemCusto')].filter(Boolean).join(' · ') }
  } else if (id === 'm-custo') {
    const valor = num('ct-valor')
    if (!v('ct-desc') || !(valor > 0)) { avisoNoFormulario(modal, t('eqDigaCusto')); return }
    dados = { custos: [...(e.custos || []), { data: v('ct-data') || hojeISO(), valor, descricao: v('ct-desc'), oficina: v('ct-oficina') }] }
    evento = { tipo: 'custo', texto: `${v('ct-desc')} · ${formatCurrency(valor)}` }
  } else if (id === 'm-baixa') {
    if (!v('bx-motivo')) { avisoNoFormulario(modal, t('eqDigaMotivo')); return }
    dados = { status: ST_EQUIP.BAIXADO, conserto: null, baixa: { motivo: v('bx-motivo'), data: v('bx-data') || hojeISO(), porNome: sessao.usuario.nome || '' } }
    evento = { tipo: 'baixa', texto: v('bx-motivo') }
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await gravarComEvento(doc(db, 'equipamentos', e.id), dados, evento)
    fecharModal(id)
    prxToast(t(`eqOk_${evento.tipo}`), 'success')
  } catch (err) {
    console.error(err)
    prxToast(err?.code === 'permission-denied' ? t('eqSemPermissao') : t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}
