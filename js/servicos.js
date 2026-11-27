// Serviços (27/11/2026): os chamados aos prestadores com contrato e as visitas
// periódicas. A lista em grupos (com você, em andamento, visitas, concluídos),
// a busca, o novo chamado e a criação das visitas devidas pela frequência de
// cada serviço contratado (js/servicos-regras.js, visitasDevidas).
import {
  db, collection, doc, getDoc, getDocs, onSnapshot, Timestamp, consulta, eContaDemo,
} from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral, registrarLimpador, navegar } from './app.js'
import { sessao } from './estado.js'
import { prxToast, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, initModal, exigirConexao, avisoNoFormulario } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t, idioma } from './constants.js'
import { esc, normalizarTexto, arquivoIndisponivel, hojeISO } from './utils.js'
import { tf } from './config-comum.js'
import { icone } from './icones.js'
import { papelServicos, ePrestador } from './modulos.js'
import {
  ST, EM_ANDAMENTO_CH, categoriaCh, comVoce, situacaoDoPrazo, visitasDevidas, prazoDoChamado, numeroDoChamado,
} from './servicos-regras.js'
import {
  consultaChamados, consultaUnidades, consultaEquipamentos, gravarComEvento, proximoNumeroChamado, novoId, fimDoDiaMs, msDe,
} from './modulos-dados.js'
import { prepararFoto, enviarFotoDoChamado } from './fotos-chamado.js'

const S = { chamados: [], unidades: [], prestadoras: [], equipamentos: [], aba: 'andamento', busca: '', fotoNova: null }

// ── Rótulos e situação de cada chamado ─────────────────────────────
export function rotuloDoStatus(ch) {
  if (ch.status === ST.AGENDADO && ch.agendadoPara) return tf('svAgendadoPara', { quando: _quando(msDe(ch.agendadoPara)) })
  return t(`svSt_${ch.status}`)
}
export function corDoStatus(ch) { return `sv-st-${categoriaCh(ch.status)}` }
// "hoje às 14:00", "amanhã às 9:30" ou a data e a hora
export function quandoDoAgendamento(v) { return _quando(msDe(v)) }
function _quando(ms) {
  if (!ms) return ''
  const d = new Date(ms), hoje = new Date()
  const hora = d.toLocaleTimeString(idioma() === 'en' ? 'en-US' : 'pt-BR', { hour: '2-digit', minute: '2-digit' })
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1)
  if (d.toDateString() === hoje.toDateString()) return tf('svHojeAs', { hora })
  if (d.toDateString() === amanha.toDateString()) return tf('svAmanhaAs', { hora })
  return tf('svDiaAs', { dia: d.toLocaleDateString(idioma() === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit' }), hora })
}
export function textoDoPrazo(ch, agora = Date.now()) {
  const s = situacaoDoPrazo({ ...ch, prazoMs: msDe(ch.prazoEm), chegadaMs: msDe(ch.chegada?.em) }, agora)
  if (!s) return null
  const horas = Math.round(Math.abs(s.restaMs) / 3600000)
  const tempo = horas >= 48 ? tf('svDias', { n: Math.round(horas / 24) }) : tf('svHoras', { n: Math.max(1, horas) })
  if (s.cumprido) return { texto: s.atrasado ? tf('svChegouAtrasado', { tempo }) : t('svChegouNoPrazo'), atrasado: s.atrasado }
  return { texto: s.atrasado ? tf('svAtrasado', { tempo }) : tf('svFaltam', { tempo }), atrasado: s.atrasado }
}

// ── Tela ───────────────────────────────────────────────────────────
export async function renderServicos() {
  const u = sessao.usuario
  const papel = papelServicos(u)
  const prest = papel === 'prestador'
  const podeAbrir = ['solicitante', 'financeiro', 'gestor'].includes(papel)
  S.busca = ''
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('servicos')}
      <main class="main-content sv-tela">
        <header class="pedidos-head sv-head">
          <div class="pedidos-head-top">
            <div class="pedidos-head-titulo">
              <h1 class="titulo-pagina">${prest ? t('svChamadosDaPrestadora') : t('modServicos')}</h1>
              <p class="pedidos-resumo" id="sv-resumo" aria-live="polite">&nbsp;</p>
            </div>
            ${podeAbrir ? `<div class="pedidos-head-acoes"><button class="btn-primary" id="sv-novo">${icone('novo', 16)}${t('svNovoChamado')}</button></div>` : ''}
          </div>
          <div class="pedidos-controles sv-controles">
            <div class="search-input-wrap pedidos-busca">
              ${icone('busca', 15)}
              <input type="search" id="sv-busca" placeholder="${t('svBuscar')}" aria-label="${t('svBuscar')}" autocomplete="off" enterkeyhint="search">
            </div>
            <div class="pedidos-rapidos" role="group" aria-label="${t('svAbas')}">
              ${['andamento', 'visitas', 'concluidos'].map(a => `<button type="button" class="rapido" data-aba="${a}" aria-pressed="${a === S.aba}"><span class="rapido-rotulo">${t(`svAba_${a}`)}</span><span class="rapido-n" data-n-aba="${a}"></span></button>`).join('')}
            </div>
          </div>
        </header>
        <div id="sv-lista" class="sv-lista" aria-busy="true">${_esqueleto()}</div>
      </main>
      ${renderFooter()}
    </div>
    ${podeAbrir ? _modalNovo() : ''}`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'servicos' })
  renderNotificacoes()
  _ligar(podeAbrir)
  await _carregarCadastros(prest)
  _escutar()
  // ?novo=chamado: o "+" da barra de baixo e os atalhos
  const params = new URLSearchParams(location.search)
  if (params.get('novo') === 'chamado' && podeAbrir) {
    const url = new URL(location); ['novo', 'u', 'eq'].forEach(k => url.searchParams.delete(k)); history.replaceState(history.state, '', url)
    abrirNovoChamado({ unidadeId: params.get('u') || '', equipamentoId: params.get('eq') || '' })
  }
}

function _esqueleto() {
  return `<div class="grupo-lista">${'<div class="sv-item is-esqueleto"><span class="skeleton skeleton-text"></span><span class="skeleton skeleton-text"></span></div>'.repeat(4)}</div>`
}

async function _carregarCadastros(prest) {
  try {
    const u = sessao.usuario
    if (prest) {
      const f = await getDoc(doc(db, 'fornecedores', u.fornecedorId))
      S.prestadoras = f.exists() ? [{ id: f.id, ...f.data() }] : []
      // A prestadora lê as unidades das empresas que atende, uma a uma não: a
      // lista vem dos chamados (unidadeNome); a placa confere o código
      S.unidades = []
    } else {
      const [uSnap, fSnap] = await Promise.all([getDocs(consultaUnidades()), getDocs(consulta(collection(db, 'fornecedores')))])
      S.unidades = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativa !== false)
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      S.prestadoras = fSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.nomeExibicao || a.nome || '').localeCompare(b.nomeExibicao || b.nome || '', 'pt-BR'))
      // Quem usa Serviços também lê os aparelhos (para ligar o chamado a um)
      {
        const eSnap = await getDocs(consultaEquipamentos()).catch(() => ({ docs: [] }))
        S.equipamentos = eSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== 'baixado')
      }
    }
  } catch (e) {
    console.error(e)
    prxToast(t('erroCarregar'), 'error')
  }
}

function _escutar() {
  const parar = onSnapshot(consultaChamados(), snap => {
    S.chamados = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    _desenhar()
    _garantirVisitas()
  }, err => {
    console.error(err)
    const el = document.getElementById('sv-lista')
    if (el) el.innerHTML = `<p class="vazio-txt">${t('erroCarregar')}</p>`
  })
  registrarLimpador(parar)
}

// ── A lista ────────────────────────────────────────────────────────
function _casa(ch) {
  if (!S.busca) return true
  const alvo = normalizarTexto([ch.titulo, ch.descricao, ch.unidadeNome, ch.fornecedorNome, ch.equipamentoRotulo,
    ch.numero ? numeroDoChamado(ch.numero) : '', ch.solicitanteNome, ch.tecnicoNome].filter(Boolean).join(' '))
  return normalizarTexto(S.busca).split(/\s+/).every(p => alvo.includes(p))
}

function _desenhar() {
  const el = document.getElementById('sv-lista')
  if (!el) return
  el.removeAttribute('aria-busy')
  const u = sessao.usuario, papel = papelServicos(u)
  const lista = S.chamados.filter(_casa)
  const andamento = lista.filter(c => EM_ANDAMENTO_CH.includes(c.status) && !(c.tipo === 'visita' && c.status === ST.PREVISTA))
  const meus = andamento.filter(c => comVoce(c, u, papel))
  const outros = andamento.filter(c => !meus.includes(c))
  const atrasados = andamento.filter(c => textoDoPrazo(c)?.atrasado && !c.chegada)
  const visitasPrev = lista.filter(c => c.tipo === 'visita' && c.status === ST.PREVISTA).sort((a, b) => (a.previstaPara || '').localeCompare(b.previstaPara || ''))
  const naoRealizadas = lista.filter(c => c.status === ST.NAO_REALIZADA).sort((a, b) => (b.previstaPara || '').localeCompare(a.previstaPara || ''))
  const concluidos = lista.filter(c => [ST.CONFIRMADO, ST.CANCELADO].includes(c.status))
    .sort((a, b) => (msDe(b.atualizadoEm) || 0) - (msDe(a.atualizadoEm) || 0))
  // Resumo e contagens
  const resumo = document.getElementById('sv-resumo')
  if (resumo) {
    const partes = [tf(andamento.length === 1 ? 'svResumoAndamento1' : 'svResumoAndamento', { n: andamento.length })]
    if (meus.length) partes.push(tf('svResumoComVoce', { n: meus.length }))
    if (atrasados.length) partes.push(tf(atrasados.length === 1 ? 'svResumoAtrasado1' : 'svResumoAtrasado', { n: atrasados.length }))
    resumo.textContent = partes.join(', ') + '.'
  }
  const nAba = { andamento: andamento.length, visitas: visitasPrev.length + naoRealizadas.length, concluidos: concluidos.length }
  document.querySelectorAll('[data-n-aba]').forEach(s => { s.textContent = nAba[s.dataset.nAba] || '' })
  atualizarLateral({ contagens: { servicos: meus.length } })

  const grupo = (titulo, itens, { vazio = '', extra = '' } = {}) => itens.length
    ? `<section class="sv-grupo"><h2 class="sv-grupo-cab"><span>${titulo}</span>${extra}</h2><div class="grupo-lista">${itens.map(_linha).join('')}</div></section>`
    : (vazio ? `<section class="sv-grupo"><h2 class="sv-grupo-cab"><span>${titulo}</span></h2><p class="sv-vazio">${vazio}</p></section>` : '')
  let html
  if (S.aba === 'andamento') {
    html = grupo(t('svComVoce'), meus) + grupo(meus.length ? t('svOutrosEmAndamento') : t('svEmAndamento'), outros)
    if (!meus.length && !outros.length) html = _vazio(papel)
  } else if (S.aba === 'visitas') {
    html = grupo(t('svVisitasPrevistas'), visitasPrev) + grupo(t('svNaoRealizadas'), naoRealizadas)
    if (!html) html = `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${t('svSemVisitas')}</p><p>${t('svSemVisitasTexto')}</p></div>`
  } else {
    html = grupo(t('svConcluidos'), concluidos.slice(0, 80), { vazio: t('svSemConcluidos') })
  }
  el.innerHTML = html
}

function _vazio(papel) {
  if (S.busca) return `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${t('svNadaNaBusca')}</p></div>`
  return `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${t('svNadaEmAndamento')}</p>
    <p>${papel === 'prestador' ? t('svNadaPrestador') : t('svNadaTexto')}</p>
    ${['solicitante', 'financeiro', 'gestor'].includes(papel) ? `<button type="button" class="btn-primary" data-acao-vazio="novo">${icone('novo', 16)}${t('svNovoChamado')}</button>` : ''}</div>`
}

function _linha(ch) {
  const prazo = ch.chegada ? null : textoDoPrazo(ch)
  const titulo = ch.tipo === 'visita' ? (ch.titulo || t('svVisita')) : ch.titulo
  const sub = [ch.numero ? numeroDoChamado(ch.numero) : (ch.previstaPara ? tf('svPrevistaPara', { data: ch.previstaPara.split('-').reverse().join('/') }) : ''),
    ePrestador(sessao.usuario) ? ch.unidadeNome : ch.fornecedorNome, ePrestador(sessao.usuario) ? '' : ch.unidadeNome].filter(Boolean)
  return `
    <a class="sv-item" href="?tela=chamado&id=${encodeURIComponent(ch.id)}" data-navegar="chamado" data-id="${esc(ch.id)}">
      <span class="sv-item-tit">${ch.urgente ? `<span class="sv-urgente">${t('urgente')}</span>` : ''}${esc(titulo)}</span>
      <span class="sv-item-sub">${esc(sub.join(' · '))}</span>
      <span class="sv-item-dir">
        <span class="sv-estado ${corDoStatus(ch)}">${esc(rotuloDoStatus(ch))}</span>
        ${prazo ? `<span class="sv-prazo${prazo.atrasado ? ' atrasado' : ''}">${esc(prazo.texto)}</span>` : ''}
      </span>
      ${icone('setaDir', 14)}
    </a>`
}

function _ligar(podeAbrir) {
  document.getElementById('sv-busca')?.addEventListener('input', e => { S.busca = e.target.value; _desenhar() })
  document.querySelectorAll('[data-aba]').forEach(b => b.addEventListener('click', () => {
    S.aba = b.dataset.aba
    document.querySelectorAll('[data-aba]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    _desenhar()
  }))
  document.getElementById('sv-lista')?.addEventListener('click', e => { if (e.target.closest('[data-acao-vazio="novo"]')) abrirNovoChamado() })
  if (!podeAbrir) return
  document.getElementById('sv-novo')?.addEventListener('click', abrirNovoChamado)
  initModal('modal-novo-chamado')
  document.getElementById('nc-unidade').addEventListener('change', _atualizarEquipamentos)
  document.getElementById('nc-prestadora').addEventListener('change', () => document.getElementById('nc-prestadora').closest('.form-group').classList.remove('invalido'))
  document.getElementById('nc-foto').addEventListener('change', _fotoEscolhida)
  document.getElementById('nc-criar').addEventListener('click', _criar)
  const urg = document.getElementById('nc-urgente-wrap')
  const alternar = () => { const on = urg.getAttribute('aria-checked') !== 'true'; urg.setAttribute('aria-checked', String(on)); urg.classList.toggle('on', on); urg.querySelector('.toggle').classList.toggle('on', on) }
  urg.addEventListener('click', alternar)
  urg.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar() } })
}

// ── Novo chamado ───────────────────────────────────────────────────
function _modalNovo() {
  return `
    <div class="modal-overlay" id="modal-novo-chamado" role="dialog" aria-modal="true" aria-labelledby="nc-h2">
      <div class="modal np-modal sv-modal">
        <div class="modal-header">
          <div class="np-head"><h2 id="nc-h2">${t('svNovoChamado')}</h2></div>
          <button class="btn-icon" data-close-modal title="${t('fechar')}" aria-label="${t('fechar')}">${icone('x', 16)}</button>
        </div>
        <div class="modal-body">
          <form id="form-novo-chamado" novalidate class="np-grid sv-form">
            <div class="np-onde">
              <span class="np-secao" id="nc-quem-rot">${t('svQuemEOnde')}</span>
              <div class="np-linhas" role="group" aria-labelledby="nc-quem-rot">
                <div class="form-group" data-campo="nc-prestadora">
                  <label for="nc-prestadora">${t('svPrestadora')} <span class="np-req" aria-hidden="true">*</span></label>
                  <select id="nc-prestadora"></select>
                </div>
                <div class="form-group" data-campo="nc-unidade">
                  <label for="nc-unidade">${t('svUnidade')} <span class="np-req" aria-hidden="true">*</span></label>
                  <select id="nc-unidade"></select>
                </div>
                <div class="form-group" data-campo="nc-equip" id="nc-equip-grupo" hidden>
                  <label for="nc-equip">${t('svEquipamento')} <span class="np-opcional">${t('opcional')}</span></label>
                  <select id="nc-equip"></select>
                </div>
              </div>
            </div>
            <div class="np-onde">
              <span class="np-secao">${t('svOQueAconteceu')}</span>
              <div class="form-group" data-campo="nc-titulo">
                <label for="nc-titulo" class="sr-only">${t('svResumoProblema')}</label>
                <input type="text" id="nc-titulo" maxlength="120" autocomplete="off" placeholder="${t('svResumoExemplo')}">
              </div>
              <div class="form-group" data-campo="nc-desc">
                <label for="nc-desc" class="sr-only">${t('svDetalhes')}</label>
                <textarea id="nc-desc" rows="3" maxlength="4000" placeholder="${t('svDetalhesExemplo')}"></textarea>
              </div>
            </div>
            <div class="form-group sv-foto-campo">
              <label class="btn-secondary sv-btn-foto" for="nc-foto">${icone('camera', 16)}<span id="nc-foto-rot">${t('svAnexarFoto')}</span></label>
              <input type="file" id="nc-foto" accept="image/*" capture="environment" class="sr-only">
              <img id="nc-foto-ver" class="sv-foto-ver" alt="${t('svFotoDoProblema')}" hidden>
            </div>
            <div class="toggle-wrap np-urgente" id="nc-urgente-wrap" role="switch" aria-checked="false" tabindex="0" aria-labelledby="nc-urg-rot" aria-describedby="nc-urg-desc">
              <div class="np-urgente-txt"><span class="toggle-label" id="nc-urg-rot">${t('svUrgente')}</span><span class="np-urgente-desc" id="nc-urg-desc">${t('svUrgenteDesc')}</span></div>
              <div class="toggle"></div>
            </div>
            <p class="np-dica" id="nc-prazo-dica" hidden></p>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="nc-criar">${t('svAbrirChamado')}</button>
        </div>
      </div>
    </div>`
}

export function abrirNovoChamado({ unidadeId = '', equipamentoId = '' } = {}) {
  if (!document.getElementById('modal-novo-chamado')) return
  const forms = document.getElementById('form-novo-chamado')
  forms.reset()
  forms.querySelectorAll('.invalido').forEach(g => g.classList.remove('invalido'))
  S.fotoNova = null
  document.getElementById('nc-foto-ver').hidden = true
  document.getElementById('nc-foto-rot').textContent = t('svAnexarFoto')
  const urg = document.getElementById('nc-urgente-wrap')
  urg.setAttribute('aria-checked', 'false'); urg.classList.remove('on'); urg.querySelector('.toggle').classList.remove('on')
  // As prestadoras com serviço contratado vêm primeiro
  const comContrato = S.prestadoras.filter(f => (f.servicosContratados || []).length)
  const outras = S.prestadoras.filter(f => !(f.servicosContratados || []).length)
  const op = f => `<option value="${esc(f.id)}">${esc(f.nomeExibicao || f.nome)}</option>`
  document.getElementById('nc-prestadora').innerHTML = `<option value="">${t('selecionar')}</option>` +
    (comContrato.length ? `<optgroup label="${esc(t('svComContrato'))}">${comContrato.map(op).join('')}</optgroup>` : '') +
    (outras.length ? `<optgroup label="${esc(t('svOutrasPrestadoras'))}">${outras.map(op).join('')}</optgroup>` : '')
  const un = document.getElementById('nc-unidade')
  un.innerHTML = (S.unidades.length === 1 ? '' : `<option value="">${t('selecionar')}</option>`) +
    S.unidades.map(x => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')
  if (!S.unidades.length) un.innerHTML = `<option value="">${t('svSemUnidades')}</option>`
  if (unidadeId && S.unidades.some(x => x.id === unidadeId)) un.value = unidadeId
  _atualizarEquipamentos()
  if (equipamentoId) document.getElementById('nc-equip').value = equipamentoId
  abrirModal('modal-novo-chamado')
}

function _atualizarEquipamentos() {
  const un = document.getElementById('nc-unidade').value
  const eqs = S.equipamentos.filter(e => e.unidadeId === un)
  const grupo = document.getElementById('nc-equip-grupo')
  grupo.hidden = !eqs.length
  document.getElementById('nc-equip').innerHTML = `<option value="">${t('svNenhumEquipamento')}</option>` +
    eqs.sort((a, b) => (a.etiqueta || '').localeCompare(b.etiqueta || '')).map(e => `<option value="${esc(e.id)}">${esc(e.etiqueta)} · ${esc(e.descricao)}</option>`).join('')
}

async function _fotoEscolhida(e) {
  const arquivo = e.target.files?.[0]
  if (!arquivo) return
  S.fotoNova = arquivo
  const ver = document.getElementById('nc-foto-ver')
  ver.src = URL.createObjectURL(arquivo)
  ver.hidden = false
  document.getElementById('nc-foto-rot').textContent = t('svTrocarFoto')
}

// O serviço contratado do tipo chamado dessa prestadora, nessa unidade: dá o prazo
function _servicoDoChamado(forn, unidadeId) {
  return (forn?.servicosContratados || []).find(s => s.tipo === 'chamado' && (!(s.unidades || []).length || s.unidades.includes(unidadeId))) || null
}

async function _criar() {
  const modal = document.getElementById('modal-novo-chamado')
  const fornId = document.getElementById('nc-prestadora').value
  const unidadeId = document.getElementById('nc-unidade').value
  const titulo = document.getElementById('nc-titulo').value.trim()
  const descricao = document.getElementById('nc-desc').value.trim()
  const equipId = document.getElementById('nc-equip').value
  const urgente = document.getElementById('nc-urgente-wrap').getAttribute('aria-checked') === 'true'
  modal.querySelectorAll('.invalido').forEach(g => g.classList.remove('invalido'))
  const faltas = []
  if (!fornId) faltas.push(['nc-prestadora', t('svEscolhaPrestadora')])
  if (!unidadeId) faltas.push(['nc-unidade', t('svEscolhaUnidade')])
  if (!titulo) faltas.push(['nc-titulo', t('svDigaOProblema')])
  if (faltas.length) {
    for (const [campo] of faltas) modal.querySelector(`[data-campo="${campo}"]`)?.classList.add('invalido')
    avisoNoFormulario(modal, faltas[0][1])
    document.getElementById(faltas[0][0]).focus()
    return
  }
  if (!exigirConexao()) return
  const forn = S.prestadoras.find(f => f.id === fornId)
  const unidade = S.unidades.find(x => x.id === unidadeId)
  const eq = S.equipamentos.find(e => e.id === equipId)
  const serv = _servicoDoChamado(forn, unidadeId)
  const u = sessao.usuario
  mostrarSpinner()
  try {
    const numero = await proximoNumeroChamado()
    const id = novoId('chamados')
    const prazo = prazoDoChamado(Date.now(), serv?.prazoHoras || 0)
    const dados = {
      numero, tipo: 'chamado', status: ST.ABERTO,
      empresaId: unidade.empresaId, unidadeId, unidadeNome: unidade.nome,
      fornecedorId: fornId, fornecedorNome: forn.nomeExibicao || forn.nome || '',
      ...(serv ? { servicoId: serv.id } : {}),
      titulo, descricao, urgente,
      ...(eq ? { equipamentoId: eq.id, equipamentoRotulo: `${eq.etiqueta} · ${eq.descricao}` } : {}),
      solicitanteId: u.id, solicitanteNome: u.nome || '',
      ...(prazo ? { prazoEm: Timestamp.fromMillis(prazo) } : {}),
    }
    await gravarComEvento(doc(db, 'chamados', id), dados, { tipo: 'aberto' }, { criar: true })
    // A foto da abertura vai depois do chamado existir (as regras conferem)
    if (S.fotoNova) {
      try {
        const blob = await prepararFoto(S.fotoNova, [
          `${new Date().toLocaleString('pt-BR')} · ${unidade.nome}`,
          `${numeroDoChamado(numero)} · ${t('svFotoAbertura')} · ${u.nome || ''}`,
        ])
        await enviarFotoDoChamado({ id }, 'abertura', blob)
      } catch (e) {
        console.error(e)
        prxToast(e.code === 'praxis/demo-sem-arquivos' ? t('svFotoDemo') : arquivoIndisponivel(e) ? t('arquivosIndisponiveis') : t('svFotoNaoEnviada'), 'warning')
      }
    }
    fecharModal('modal-novo-chamado')
    prxToast(tf('svChamadoAberto', { numero: numeroDoChamado(numero), prestadora: forn.nomeExibicao || forn.nome }), 'success')
    navegar('chamado', { id })
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

// ── Visitas periódicas ─────────────────────────────────────────────
// Quem abre a lista garante as visitas devidas (no máximo 12 por vez): as do
// período que ainda não existem nascem previstas (ou não realizadas, se o
// período já passou), e as previstas cuja janela passou viram não realizadas
let _garantindo = false
async function _garantirVisitas() {
  if (_garantindo || !navigator.onLine) return
  _garantindo = true
  try {
    const hoje = hojeISO()
    const existentes = new Map(S.chamados.map(c => [c.id, c]))
    const minhasUnidades = new Set(S.unidades.map(x => x.id))
    const prest = ePrestador(sessao.usuario)
    let feitas = 0
    for (const forn of S.prestadoras) {
      for (const serv of forn.servicosContratados || []) {
        for (const v of visitasDevidas(forn, serv, hoje)) {
          if (feitas >= 12) return
          if (!prest && !minhasUnidades.has(v.unidadeId)) continue
          // Na demo, o ID leva o prefixo da área da demonstração (firestore.rules)
          const id = eContaDemo() ? `demo-${v.id}` : v.id
          const ja = existentes.get(id)
          const janelaAte = Timestamp.fromMillis(fimDoDiaMs(new Date(v.janelaAteMs).toISOString().slice(0, 10)))
          if (!ja) {
            if (prest) continue   // a unidade (empresa) vem da gente da empresa
            const unidade = S.unidades.find(x => x.id === v.unidadeId)
            if (!unidade) continue
            const vencida = janelaAte.toMillis() < Date.now()
            await gravarComEvento(doc(db, 'chamados', id), {
              tipo: 'visita', status: vencida ? ST.NAO_REALIZADA : ST.PREVISTA,
              empresaId: unidade.empresaId, unidadeId: unidade.id, unidadeNome: unidade.nome,
              fornecedorId: forn.id, fornecedorNome: forn.nomeExibicao || forn.nome || '', servicoId: serv.id,
              titulo: serv.nome || t('svVisita'), previstaPara: v.previstaPara, janelaAte,
            }, { tipo: vencida ? 'nao_realizada' : 'prevista' }, { criar: true }).catch(e => console.warn('visita', id, e.code || e.message))
            feitas++
          } else if ([ST.PREVISTA, ST.AGENDADO].includes(ja.status) && ja.tipo === 'visita' && msDe(ja.janelaAte) < Date.now() && !ja.chegada) {
            await gravarComEvento(doc(db, 'chamados', id), { status: ST.NAO_REALIZADA }, { tipo: 'nao_realizada' })
              .catch(e => console.warn('visita vencida', id, e.code || e.message))
            feitas++
          }
        }
      }
    }
  } finally {
    _garantindo = false
  }
}
