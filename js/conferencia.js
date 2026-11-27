// Serviços › Conferência do mês (27/11/2026). Antes de pagar a fatura de uma
// prestadora, o financeiro vê o que o Praxis registrou no mês: as visitas
// feitas e as que não aconteceram, os chamados confirmados, os contestados e
// os extras aprovados (com quem aprovou). A fatura deve bater com isso; o que
// não está aqui não foi combinado pelo sistema. Exporta em CSV.
import { db, collection, getDocs, query, orderBy, consulta } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral } from './app.js'
import { prxToast } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t, idioma } from './constants.js'
import { esc, formatCurrency, dataEHora, baixarCSV } from './utils.js'
import { tf, cabecalho, resumoCarregando, revelarItemLateral } from './config-comum.js'
import { icone } from './icones.js'
import { ST, resumoDoMes, numeroDoChamado } from './servicos-regras.js'
import { consultaChamados, msDe } from './modulos-dados.js'

const K = { prestadoras: [], chamados: [], extras: new Map(), forn: '', mes: '', r: null }

const _mesISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
function _meses(n = 13) {
  const d = new Date(); d.setDate(1)
  return Array.from({ length: n }, (_, i) => { const x = new Date(d); x.setMonth(d.getMonth() - i); return _mesISO(x) })
}
const _nomeDoMes = mes => {
  const [a, m] = mes.split('-').map(Number)
  const s = new Date(a, m - 1, 1).toLocaleDateString(idioma() === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const _limitesDoMes = mes => {
  const [a, m] = mes.split('-').map(Number)
  return { ini: new Date(a, m - 1, 1).getTime(), fim: new Date(a, m, 1).getTime() }
}

export async function renderConferencia() {
  // O mês de partida: até o dia 10, o anterior (a fatura chega no começo do mês)
  const hoje = new Date()
  if (!K.mes) K.mes = hoje.getDate() <= 10 ? _meses(2)[1] : _mesISO(hoje)
  const p = new URLSearchParams(location.search)
  if (p.get('f')) K.forn = p.get('f')
  if (/^\d{4}-\d{2}$/.test(p.get('m') || '')) K.mes = p.get('m')
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('conferencia')}
      <main class="main-content cfg-pagina cf-pagina">
        ${cabecalho(t('svConferencia'), { resumoId: 'cf-resumo', resumo: resumoCarregando('cfDesc'),
          acao: `<button type="button" class="btn-secondary" id="cf-csv" disabled>${icone('baixar', 16)}${t('exportarCSV')}</button>` })}
        <div class="cf-filtros">
          <div class="form-group"><label for="cf-forn">${t('svPrestadora')}</label><select id="cf-forn"></select></div>
          <div class="form-group"><label for="cf-mes">${t('cfMes')}</label>
            <select id="cf-mes">${_meses().map(m => `<option value="${m}"${m === K.mes ? ' selected' : ''}>${esc(_nomeDoMes(m))}</option>`).join('')}</select></div>
        </div>
        <div id="cf-corpo" aria-busy="true" aria-live="polite"><div class="cf-numeros">${'<div class="cf-numero is-esqueleto"><span class="skeleton skeleton-text"></span></div>'.repeat(4)}</div></div>
      </main>
      ${renderFooter()}
    </div>`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'conferencia' })
  revelarItemLateral()
  renderNotificacoes()
  document.getElementById('cf-forn').addEventListener('change', e => { K.forn = e.target.value; _calcular() })
  document.getElementById('cf-mes').addEventListener('change', e => { K.mes = e.target.value; _calcular() })
  document.getElementById('cf-csv').addEventListener('click', _exportar)
  await _carregar()
}

async function _carregar() {
  try {
    const [fSnap, cSnap] = await Promise.all([getDocs(consulta(collection(db, 'fornecedores'))), getDocs(consultaChamados())])
    K.chamados = cSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    const comChamados = new Set(K.chamados.map(c => c.fornecedorId))
    K.prestadoras = fSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(f => (f.servicosContratados || []).length || comChamados.has(f.id))
      .sort((a, b) => (a.nomeExibicao || a.nome || '').localeCompare(b.nomeExibicao || b.nome || '', 'pt-BR'))
  } catch (e) {
    console.error(e)
    prxToast(t('erroCarregar'), 'error')
  }
  const sel = document.getElementById('cf-forn')
  if (!sel) return
  if (!K.prestadoras.some(f => f.id === K.forn)) K.forn = K.prestadoras[0]?.id || ''
  sel.innerHTML = K.prestadoras.map(f => `<option value="${esc(f.id)}"${f.id === K.forn ? ' selected' : ''}>${esc(f.nomeExibicao || f.nome || '')}</option>`).join('')
  sel.disabled = !K.prestadoras.length
  await _calcular()
}

// Os extras ficam dentro de cada chamado: lê só os dos chamados que podem ter
// tido decisão no mês (abertos até o fim dele e não fechados antes do começo)
async function _extrasDoMes(chamados, mes) {
  const { ini, fim } = _limitesDoMes(mes)
  const alvo = chamados.filter(c => {
    const criado = msDe(c.criadoEm) || 0
    const fechado = msDe(c.confirmadoEm) || msDe(c.canceladoEm) || null
    return criado < fim && (!fechado || fechado >= ini)
  })
  const falta = alvo.filter(c => !K.extras.has(c.id))
  await Promise.all(falta.map(async c => {
    try {
      const s = await getDocs(query(collection(db, 'chamados', c.id, 'extras'), orderBy('criadoEm')))
      K.extras.set(c.id, s.docs.map(d => ({ id: d.id, chamadoId: c.id, ...d.data() })))
    } catch (e) { console.warn(e); K.extras.set(c.id, []) }
  }))
  return alvo.flatMap(c => K.extras.get(c.id) || [])
}

async function _calcular() {
  const corpo = document.getElementById('cf-corpo')
  if (!corpo) return
  const f = K.prestadoras.find(x => x.id === K.forn)
  if (!f) {
    corpo.removeAttribute('aria-busy')
    corpo.innerHTML = `<p class="sv-vazio">${t('cfSemPrestadoras')}</p>`
    document.getElementById('cf-resumo').textContent = t('cfDesc')
    return
  }
  corpo.setAttribute('aria-busy', 'true')
  const mes = K.mes
  const chs = K.chamados.filter(c => c.fornecedorId === f.id).map(c => ({
    ...c, confirmadoMs: msDe(c.confirmadoEm), contestadoMs: msDe(c.contestadoEm),
  }))
  const extras = (await _extrasDoMes(chs, mes)).map(e => ({ ...e, decididoMs: msDe(e.decididoEm), criadoMs: msDe(e.criadoEm) }))
  if (K.forn !== f.id || K.mes !== mes) return // trocou no meio da leitura
  const r = resumoDoMes(chs, extras, mes)
  // Visitas previstas no mês que ainda não fecharam (a conferir antes de pagar)
  r.visitasEmAberto = chs.filter(c => c.tipo === 'visita' && (c.previstaPara || '').slice(0, 7) === mes
    && ![ST.CONFIRMADO, ST.NAO_REALIZADA, ST.CANCELADO].includes(c.status))
  // Contestados que seguem contestados hoje, de qualquer mês
  r.contestadosAbertos = chs.filter(c => c.status === ST.CONTESTADO)
  r.extrasAguardando = extras.filter(e => e.status === 'aguardando')
  K.r = r
  _desenhar(f, r)
}

function _desenhar(f, r) {
  const corpo = document.getElementById('cf-corpo')
  corpo.removeAttribute('aria-busy')
  const nome = f.nomeExibicao || f.nome || ''
  const visitasDoMes = r.visitasFeitas.length + r.naoRealizadas.length + r.visitasEmAberto.length
  document.getElementById('cf-resumo').textContent = tf('cfResumo', { prestadora: nome, mes: _nomeDoMes(K.mes) })
  document.getElementById('cf-csv').disabled = !(r.visitasFeitas.length + r.confirmados.length + r.naoRealizadas.length + r.extrasAprovados.length + r.extrasRecusados.length)
  const chNome = id => {
    const c = K.chamados.find(x => x.id === id)
    return c ? `${c.numero ? numeroDoChamado(c.numero) : t('svVisita')} · ${c.titulo || ''}` : ''
  }
  const linhaCh = c => `
    <a class="sv-item" href="?tela=chamado&id=${encodeURIComponent(c.id)}" data-navegar="chamado" data-id="${esc(c.id)}">
      <span class="sv-item-tit">${esc(c.titulo || t('svVisita'))}</span>
      <span class="sv-item-sub">${esc([c.numero ? numeroDoChamado(c.numero) : '', c.unidadeNome || '',
        c.confirmadoEm ? tf('cfConfirmadoEm', { d: dataEHora(c.confirmadoEm), nome: c.confirmadoPorNome || '' }) : (c.previstaPara || '').split('-').reverse().join('/')].filter(Boolean).join(' · '))}</span>
      ${icone('setaDir', 14)}
    </a>`
  const linhaEx = e => `
    <a class="sv-item" href="?tela=chamado&id=${encodeURIComponent(e.chamadoId)}" data-navegar="chamado" data-id="${esc(e.chamadoId)}">
      <span class="sv-item-tit">${esc(e.descricao || '')}</span>
      <span class="sv-item-sub">${esc([chNome(e.chamadoId), e.status === 'aprovado' ? tf('svExtraAprovadoPor', { nome: e.decididoPorNome || '' })
        : e.status === 'reprovado' ? tf('svExtraReprovadoPor', { nome: e.decididoPorNome || '', motivo: e.motivo || '' }) : t('svExtraAguardando')].filter(Boolean).join(' · '))}</span>
      <span class="sv-item-dir cf-valor">${formatCurrency(Number(e.valor) || 0)}</span>
    </a>`
  const bloco = (titulo, itens, linha, { tom = '', vazio = '' } = {}) => (itens.length || vazio) ? `
    <section class="cf-bloco${tom ? ` cf-${tom}` : ''}">
      <h2 class="sv-grupo-cab"><span>${titulo}</span><span>${itens.length}</span></h2>
      ${itens.length ? `<div class="grupo-lista">${itens.map(linha).join('')}</div>` : `<p class="sv-vazio">${vazio}</p>`}
    </section>` : ''
  const alertas = [
    r.naoRealizadas.length ? tf(r.naoRealizadas.length === 1 ? 'cfAlertaNaoRealizadaUm' : 'cfAlertaNaoRealizadas', { n: r.naoRealizadas.length }) : '',
    r.contestadosAbertos.length ? tf(r.contestadosAbertos.length === 1 ? 'cfAlertaContestadoUm' : 'cfAlertaContestados', { n: r.contestadosAbertos.length }) : '',
    r.visitasEmAberto.length ? tf(r.visitasEmAberto.length === 1 ? 'cfAlertaEmAbertoUm' : 'cfAlertaEmAberto', { n: r.visitasEmAberto.length }) : '',
    r.extrasAguardando.length ? tf(r.extrasAguardando.length === 1 ? 'cfAlertaExtraUm' : 'cfAlertaExtras', { n: r.extrasAguardando.length }) : '',
  ].filter(Boolean)
  corpo.innerHTML = `
    <dl class="cf-numeros">
      <div class="cf-numero"><dt>${t('cfVisitasFeitas')}</dt><dd>${visitasDoMes ? tf('prDe', { a: r.visitasFeitas.length, b: visitasDoMes }) : '—'}</dd></div>
      <div class="cf-numero"><dt>${t('cfChamadosConfirmados')}</dt><dd>${r.confirmados.length}</dd></div>
      <div class="cf-numero${r.naoRealizadas.length ? ' ruim' : ''}"><dt>${t('cfNaoRealizadas')}</dt><dd>${r.naoRealizadas.length}</dd></div>
      <div class="cf-numero cf-destaque"><dt>${t('cfExtrasAprovados')}</dt><dd>${formatCurrency(r.totalExtras)}</dd></div>
    </dl>
    <section class="decisao ${alertas.length ? 'tom-voce' : 'tom-neutro'} cf-leitura">
      <div class="decisao-topo"><div class="decisao-texto">
        <p class="decisao-rotulo">${t('cfComoConferir')}</p>
        <p class="decisao-desc">${esc(r.totalExtras ? tf('cfFaturaComExtras', { valor: formatCurrency(r.totalExtras) }) : t('cfFaturaSemExtras'))}</p>
        ${alertas.length ? `<ul class="cf-alertas">${alertas.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
      </div></div>
    </section>
    ${bloco(t('cfNaoRealizadas'), r.naoRealizadas, linhaCh, { tom: 'ruim' })}
    ${bloco(t('cfContestadosAbertos'), r.contestadosAbertos, linhaCh, { tom: 'ruim' })}
    ${bloco(t('cfVisitasFeitas'), r.visitasFeitas, linhaCh, { vazio: visitasDoMes ? t('cfNenhumaVisita') : '' })}
    ${bloco(t('cfVisitasEmAberto'), r.visitasEmAberto, linhaCh)}
    ${bloco(t('cfChamadosConfirmados'), r.confirmados, linhaCh)}
    ${bloco(t('cfExtrasAprovados'), r.extrasAprovados, linhaEx, { vazio: t('cfNenhumExtra') })}
    ${bloco(t('cfExtrasRecusados'), r.extrasRecusados, linhaEx)}
    ${bloco(t('cfExtrasAguardando'), r.extrasAguardando, linhaEx)}`
}

function _exportar() {
  const r = K.r
  const f = K.prestadoras.find(x => x.id === K.forn)
  if (!r || !f) return
  const linhaCh = (situacao, c) => [situacao, c.numero ? numeroDoChamado(c.numero) : t('svVisita'), c.titulo || '', c.unidadeNome || '',
    (c.previstaPara || '').split('-').reverse().join('/'), c.confirmadoEm ? dataEHora(c.confirmadoEm) : '', c.confirmadoPorNome || '', '', '']
  const linhaEx = (situacao, e) => {
    const c = K.chamados.find(x => x.id === e.chamadoId) || {}
    return [situacao, c.numero ? numeroDoChamado(c.numero) : t('svVisita'), c.titulo || '', c.unidadeNome || '', '',
      e.decididoEm ? dataEHora(e.decididoEm) : '', e.decididoPorNome || '', e.descricao || '', String(Number(e.valor) || 0).replace('.', ',')]
  }
  const linhas = [
    ...r.visitasFeitas.map(c => linhaCh(t('cfVisitasFeitas'), c)),
    ...r.confirmados.map(c => linhaCh(t('cfChamadosConfirmados'), c)),
    ...r.naoRealizadas.map(c => linhaCh(t('cfNaoRealizadas'), c)),
    ...r.contestadosAbertos.map(c => linhaCh(t('cfContestadosAbertos'), c)),
    ...r.extrasAprovados.map(e => linhaEx(t('cfExtrasAprovados'), e)),
    ...r.extrasRecusados.map(e => linhaEx(t('cfExtrasRecusados'), e)),
  ]
  const slug = (f.nomeExibicao || f.nome || 'prestadora').normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  baixarCSV(`praxis-conferencia-${slug}-${K.mes}.csv`,
    [t('cfColSituacao'), t('cfColChamado'), t('cfColTitulo'), t('cfColUnidade'), t('cfColPrevista'), t('cfColQuando'), t('cfColQuem'), t('cfColExtra'), t('cfColValor')],
    linhas)
  prxToast(t('cfExportado'), 'success')
}
