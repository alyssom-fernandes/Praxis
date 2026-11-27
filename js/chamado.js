// O chamado (Serviços, 27/11/2026): a régua das cinco etapas, o próximo passo
// com a ação de quem está com ele, os horários (com a prova de presença), as
// fotos, o relatório, o serviço extra, a conversa e o registro. Espelho das
// regras do Firestore (/chamados) em js/servicos-regras.js.
import {
  db, doc, collection, getDoc, onSnapshot, query, orderBy, setDoc, updateDoc, serverTimestamp, Timestamp, auth,
  marcaDemo,
} from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral, registrarLimpador, navegar, rotaAnterior } from './app.js'
import { sessao } from './estado.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, initModal, exigirConexao, avisoNoFormulario } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t, idioma } from './constants.js'
import { esc, formatCurrency, parseMoeda, arquivoIndisponivel, gerarIniciais } from './utils.js'
import { tf } from './config-comum.js'
import { icone } from './icones.js'
import { papelServicos, papelEquip } from './modulos.js'
import { ST, PASSOS_CH, posicaoNaRegua, acoesDoChamado, numeroDoChamado } from './servicos-regras.js'
import { gravarComEvento, msDe } from './modulos-dados.js'
import { prepararFoto, enviarFotoDoChamado, urlDaFoto } from './fotos-chamado.js'
import { textoDoPrazo, quandoDoAgendamento } from './servicos.js'
import { registrarPresenca, lerQrNoApp, rascunhoDaConclusao, guardarConclusao, temLeitorQr } from './presenca.js'

const C = { id: null, ch: null, fotos: [], extras: [], comentarios: [], historico: [], unidade: null }
const MOTIVOS_CONTESTACAO = ['svMotivoContinua', 'svMotivoNaoVeio', 'svMotivoIncompleto', 'svMotivoOutro']

export async function renderChamado(id) {
  if (!id) { navegar('servicos'); return }
  Object.assign(C, { id, ch: null, fotos: [], extras: [], comentarios: [], historico: [], unidade: null })
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('chamado')}
      <main class="main-content">
        <div id="chamado-root" class="sv-chamado"><div class="sv-carregando"><span class="skeleton skeleton-title"></span><span class="skeleton skeleton-text"></span></div></div>
      </main>
      ${renderFooter()}
    </div>
    ${_modais()}`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'servicos' })
  renderNotificacoes()
  _ligarModais()
  const ref = doc(db, 'chamados', id)
  const parar = [
    onSnapshot(ref, s => {
      if (!s.exists()) { _naoEncontrado(); return }
      C.ch = { id: s.id, ...s.data() }
      _carregarUnidade()
      _desenhar()
    }, () => _naoEncontrado()),
    ...['fotos', 'extras', 'comentarios', 'historico'].map(sub => onSnapshot(query(collection(ref, sub), orderBy('criadoEm')), s => {
      C[sub] = s.docs.map(d => ({ id: d.id, ...d.data() }))
      if (C.ch) _desenhar()
    }, err => console.warn(sub, err.code))),
  ]
  registrarLimpador(() => parar.forEach(p => p()))
}

async function _carregarUnidade() {
  if (C.unidade || !C.ch?.unidadeId) return
  try {
    const s = await getDoc(doc(db, 'unidades', C.ch.unidadeId))
    if (s.exists()) C.unidade = { id: s.id, ...s.data() }
  } catch { /* sem a unidade, sem a distância */ }
}

function _naoEncontrado() {
  const r = document.getElementById('chamado-root')
  if (r) r.innerHTML = `<div class="sv-vazio-bloco"><p class="sv-vazio-tit">${t('svChamadoNaoEncontrado')}</p>
    <button type="button" class="btn-secondary" data-navegar="servicos">${t('svVoltarServicos')}</button></div>`
}

// ── Desenho ────────────────────────────────────────────────────────
const _dt = v => { const ms = msDe(v); return ms ? new Date(ms).toLocaleString(idioma() === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '' }
const _hora = v => { const ms = msDe(v); return ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '' }

function _desenhar() {
  const r = document.getElementById('chamado-root')
  const ch = C.ch
  if (!r || !ch) return
  const u = sessao.usuario, papel = papelServicos(u)
  const acoes = acoesDoChamado(ch, u, papel)
  const ant = rotaAnterior()
  const voltarAttrs = ant?.tela === 'servicos' || ant?.tela === 'qr' ? 'href="?tela=servicos" data-voltar-historico' : 'href="?tela=servicos" data-navegar="servicos"'
  const rotulo = ch.tipo === 'visita' ? t('svVisitaPeriodica') : numeroDoChamado(ch.numero || 0)
  r.innerHTML = `
    <div class="detalhe-layout">
      <div class="detalhe-head-linha">
        <nav class="detalhe-trilha" aria-label="${t('dtTrilhaAria')}">
          <a class="detalhe-voltar" ${voltarAttrs}>${icone('setaEsq', 20)}<span>${papel === 'prestador' ? t('svChamados') : t('modServicos')}</span></a>
        </nav>
        <span class="detalhe-num" aria-current="page">${esc(rotulo)}</span>
        ${ch.urgente ? `<span class="detalhe-urgente">${t('urgente')}</span>` : ''}
        ${acoes.includes('cancelar') ? `<div class="menu-acoes-wrap"><button class="btn-secondary btn-mais" id="ch-cancelar" aria-label="${t('svCancelarChamado')}" title="${t('svCancelarChamado')}">${icone('x', 16)}</button></div>` : ''}
      </div>
      <header class="detalhe-head">
        <h1 class="detalhe-titulo">${esc(ch.titulo || t('svVisita'))}</h1>
        <p class="detalhe-meta">${[ch.fornecedorNome, ch.unidadeNome, ch.tipo === 'visita'
          ? tf('svPrevistaPara', { data: (ch.previstaPara || '').split('-').reverse().join('/') })
          : tf('svAbertoPorEm', { nome: ch.solicitanteNome || '', d: _dt(ch.criadoEm) })].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('<span class="detalhe-meta-sep" aria-hidden="true">·</span>')}</p>
      </header>
      ${_regua(ch)}
      <div class="detalhe-cols">
        <div class="detalhe-main">
          ${ch.descricao ? `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svOQueAconteceu')}</h2></div><div class="detalhe-descricao"><p>${esc(ch.descricao)}</p></div></section>` : ''}
          ${_fotos()}
          ${ch.relatorio ? `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svRelatorio')}</h2></div><div class="detalhe-descricao"><p>${esc(ch.relatorio)}</p>${(ch.pecas || []).length ? `<p class="sv-pecas"><strong>${t('svPecas')}:</strong> ${esc(ch.pecas.join(', '))}</p>` : ''}</div></section>` : ''}
          ${_extras(papel)}
          ${_conversa()}
          ${_registro()}
        </div>
        <aside class="detalhe-aside">
          <div class="ord-decisao">${_proximoPasso(ch, acoes, papel)}</div>
          ${_dados(ch)}
        </aside>
      </div>
    </div>`
  _ligarTela()
  _carregarFotos()
}

function _regua(ch) {
  const pos = posicaoNaRegua(ch.status)
  const parou = [ST.CANCELADO, ST.NAO_REALIZADA].includes(ch.status)
  const datas = { aberto: ch.criadoEm, agendado: ch.agendadoPara, atendimento: ch.chegada?.em, concluido: ch.saida?.em, confirmado: ch.confirmadoEm }
  const fim = ch.status === ST.CONFIRMADO
  const itens = PASSOS_CH.map((p, i) => {
    let cls = i < pos || fim ? 'feita' : i === pos ? (parou ? 'parou' : 'atual') : (parou ? 'cortada' : 'futura')
    if (fim && i === pos) cls = 'atual fim'
    const nome = i === 0 && ch.tipo === 'visita' ? t('svSt_prevista') : t(`svPasso_${p}`)
    const sub = i === pos && parou ? t(`svSt_${ch.status}`) : (datas[p] && (i <= pos) ? _dt(datas[p]).split(',')[0] : '')
    return `<li class="regua-etapa ${cls}"${i === pos ? ' aria-current="step"' : ''}>
      <span class="regua-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <span class="regua-nome">${nome}</span>
      <span class="regua-sub">${sub || '&nbsp;'}</span></li>`
  }).join('')
  return `<div class="caminho-wrap"><ol class="regua caminho regua-5${parou ? ' interrompido' : ''}" aria-label="${t('svEtapasAria')}" tabindex="0">${itens}</ol></div>`
}

// O próximo passo: o texto de quem está com ele e as ações (no celular, a
// barra de baixo, como no pedido)
function _proximoPasso(ch, acoes, papel) {
  const prazo = textoDoPrazo(ch)
  const B = (id, cls, txt) => `<button class="${cls}" id="${id}">${txt}</button>`
  let rot = t('svProximoPasso'), tit = '', txt = '', tom = 'neutro'
  const botoes = []
  const comigo = acoes.some(a => ['agendar', 'chegar', 'concluir', 'confirmar'].includes(a))
  switch (ch.status) {
    case ST.ABERTO: case ST.PREVISTA: case ST.CONTESTADO:
      if (papel === 'prestador') {
        tit = ch.status === ST.CONTESTADO ? t('svVolteEResolva') : t('svAgendeOAtendimento')
        txt = ch.status === ST.CONTESTADO ? tf('svContestadoPor', { motivo: ch.contestacao?.motivo || '' }) : (prazo ? prazo.texto : t('svSemPrazo'))
        botoes.push(B('ch-chegar', 'btn-secondary', t('svJaEstouNoLocal')), B('ch-agendar', 'btn-primary', t('svAgendar')))
      } else {
        tit = ch.status === ST.CONTESTADO ? t('svVoltouParaPrestadora') : tf('svAguardandoPrestadora', { nome: ch.fornecedorNome })
        txt = ch.status === ST.CONTESTADO ? tf('svContestadoPor', { motivo: ch.contestacao?.motivo || '' }) : (prazo ? prazo.texto : t('svSemPrazoTexto'))
        if (ch.tipo !== 'visita') botoes.push(`<a class="btn-secondary" id="ch-whats" href="${esc(_linkWhats(ch))}" target="_blank" rel="noopener">${t('btnAvisarWhatsApp')}</a>`)
      }
      break
    case ST.AGENDADO:
      tit = papel === 'prestador' ? tf('svAgendadoTit', { quando: quandoDoAgendamento(ch.agendadoPara) }) : tf('svPrestadoraVem', { nome: ch.fornecedorNome, quando: quandoDoAgendamento(ch.agendadoPara) })
      txt = papel === 'prestador' ? t('svAoChegarLeiaQr') : tf('svTecnico', { nome: ch.tecnicoNome || '—' })
      if (papel === 'prestador') botoes.push(B('ch-agendar', 'btn-secondary', t('svReagendar')), B('ch-chegar', 'btn-primary', t('svCheguei')))
      break
    case ST.ATENDIMENTO:
      tit = papel === 'prestador' ? t('svRegistreOQueFez') : tf('svTecnicoNoLocal', { hora: _hora(ch.chegada?.em) })
      txt = papel === 'prestador' ? t('svRegistreOQueFezTexto') : _textoPresenca(ch.chegada)
      if (acoes.includes('fotos')) botoes.push(B('ch-fotos', 'btn-secondary', `${icone('camera', 16)}${t('svFotos')}`))
      if (acoes.includes('extra')) botoes.push(B('ch-extra', 'btn-secondary', t('svPedirExtra')))
      if (acoes.includes('concluir')) botoes.push(B('ch-concluir', 'btn-primary', t('svConcluir')))
      // O extra pedido espera o gestor: o passo agora é dele
      if (papel === 'gestor' && C.extras.some(e => e.status === 'aguardando')) {
        const pend = C.extras.filter(e => e.status === 'aguardando')
        tit = pend.length === 1 ? t('svExtraParaDecidir1') : tf('svExtraParaDecidir', { n: pend.length })
        txt = pend.length === 1 ? `${pend[0].descricao} · ${formatCurrency(Number(pend[0].valor) || 0)}` : t('svExtraParaDecidirTexto')
        tom = 'voce'
        // Com um só, a decisão fica no próprio passo (a lista dos extras segue embaixo)
        if (pend.length === 1) botoes.push(`<button class="btn-danger" data-extra-reprovar="${esc(pend[0].id)}">${t('btnReprovar')}</button>`,
          `<button class="btn-primary" data-extra-aprovar="${esc(pend[0].id)}">${t('btnAprovar')}</button>`)
      }
      break
    case ST.CONCLUIDO: {
      const pend = C.extras.filter(e => e.status === 'aguardando').length
      tit = acoes.includes('confirmar') ? t('svVeioEResolveu') : t('svAguardandoConfirmacao')
      txt = tf('svChegouSaiu', { chegada: _hora(ch.chegada?.em), saida: _hora(ch.saida?.em) }) + (pend ? ` ${t('svExtraEsperando')}` : '')
      if (acoes.includes('confirmar')) botoes.push(B('ch-contestar', 'btn-danger', t('svContestar')), B('ch-confirmar', 'btn-primary', t('svConfirmar')))
      break
    }
    case ST.CONFIRMADO:
      rot = t('svSt_confirmado'); tom = 'ok'
      tit = tf('svConfirmadoPor', { nome: ch.confirmadoPorNome || '', d: _dt(ch.confirmadoEm) })
      txt = t('svConfirmadoTexto')
      break
    case ST.NAO_REALIZADA:
      rot = t('svSt_nao_realizada'); tom = 'erro'
      tit = t('svNaoRealizadaTit')
      txt = t('svNaoRealizadaTexto')
      break
    case ST.CANCELADO:
      rot = t('svSt_cancelado'); tom = 'erro'
      tit = ch.cancelamento?.motivo || t('svCancelado')
      txt = tf('svCanceladoPor', { nome: ch.cancelamento?.porNome || '' })
      break
  }
  if (comigo) tom = 'voce'
  return `
    <section class="decisao tom-${tom}" aria-labelledby="ch-passo-tit">
      <div class="decisao-topo">
        <div class="decisao-texto">
          <p class="decisao-rotulo">${rot}${comigo ? `<span class="decisao-voce">${t('dtComVoce')}</span>` : ''}</p>
          <h2 class="decisao-titulo" id="ch-passo-tit">${esc(tit)}</h2>
          ${txt ? `<p class="decisao-desc">${esc(txt)}</p>` : ''}
        </div>
        ${botoes.length ? `<div class="decisao-acoes" role="group" aria-label="${t('dtAcoesDoPasso')}">${botoes.join('')}</div>` : ''}
      </div>
      ${_fatos(ch)}
    </section>`
}

function _textoPresenca(m) {
  if (!m) return ''
  if (m.via === 'manual') return t('svPresencaManual')
  return m.distanciaM != null ? tf('svPresencaQrDist', { m: m.distanciaM }) : t('svPresencaQr')
}

function _fatos(ch) {
  const f = []
  const prazo = textoDoPrazo(ch)
  if (ch.prazoEm) f.push([t('svPrazoContrato'), _dt(ch.prazoEm), prazo ? prazo.texto : '', prazo?.atrasado ? 'prazo-atrasado' : ''])
  if (ch.agendadoPara) f.push([t('svAgendado'), _dt(ch.agendadoPara), ch.tecnicoNome || ''])
  if (ch.chegada) f.push([t('svChegada'), _hora(ch.chegada.em), _textoPresenca(ch.chegada)])
  if (ch.saida) {
    const min = Math.round((msDe(ch.saida.em) - msDe(ch.chegada?.em)) / 60000)
    f.push([t('svSaida'), _hora(ch.saida.em), min > 0 ? tf('svNoLocal', { tempo: min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min` }) : ''])
  }
  const aprovados = C.extras.filter(e => e.status === 'aprovado').reduce((s, e) => s + (Number(e.valor) || 0), 0)
  if (aprovados) f.push([t('svExtrasAprovados'), formatCurrency(aprovados), ''])
  if (!f.length) return ''
  return `<dl class="decisao-fatos">${f.map(([k, v, sub, cls]) => `
    <div class="decisao-fato ${cls || ''}"><dt>${k}</dt><dd><span class="decisao-valor">${esc(v)}</span>${sub ? `<span class="decisao-sub">${esc(sub)}</span>` : ''}</dd></div>`).join('')}</dl>`
}

function _dados(ch) {
  const linhas = [
    [t('svPrestadora'), ch.fornecedorNome],
    [t('svUnidade'), ch.unidadeNome],
    ch.equipamentoRotulo ? [t('svEquipamento'), papelEquip(sessao.usuario) && ch.equipamentoId
      ? `<a href="?tela=equipamento&id=${encodeURIComponent(ch.equipamentoId)}" data-navegar="equipamento" data-id="${esc(ch.equipamentoId)}">${esc(ch.equipamentoRotulo)}</a>` : esc(ch.equipamentoRotulo), true] : null,
    ch.tipo !== 'visita' ? [t('svQuemPediu'), ch.solicitanteNome] : null,
    ch.tecnicoNome ? [t('svTecnicoRot'), ch.tecnicoNome] : null,
  ].filter(Boolean)
  return `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svDados')}</h2></div>
    <dl class="detalhe-meta-grid">${linhas.map(([k, v, html]) => `<div class="meta-item"><dt class="meta-label">${k}</dt><dd class="meta-value">${html ? v : esc(v || '—')}</dd></div>`).join('')}</dl></section>`
}

function _fotos() {
  const grupos = [['abertura', t('svFotoAbertura')], ['antes', t('svFotosAntes')], ['depois', t('svFotosDepois')]]
  const tem = C.fotos.length
  if (!tem && ![ST.ATENDIMENTO, ST.CONCLUIDO, ST.CONFIRMADO].includes(C.ch.status)) return ''
  return `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svFotos')}${tem ? `<span class="dt-contagem">${tem}</span>` : ''}</h2></div>
    ${tem ? grupos.map(([tipo, rot]) => {
      const fs = C.fotos.filter(f => f.tipo === tipo)
      return fs.length ? `<div class="sv-fotos-grupo"><span class="sv-fotos-rot">${rot}</span><div class="sv-fotos">${fs.map(f => `
        <a class="sv-foto" data-foto="${esc(f.storagePath)}" target="_blank" rel="noopener" href="#"><img alt="${esc(tf('svFotoDe', { tipo: rot, nome: f.autorNome || '' }))}" data-caminho="${esc(f.storagePath)}"></a>`).join('')}</div></div>` : ''
    }).join('') : `<p class="sv-vazio">${t('svSemFotos')}</p>`}</section>`
}
async function _carregarFotos() {
  for (const img of document.querySelectorAll('img[data-caminho]:not([src])')) {
    try {
      const url = await urlDaFoto(img.dataset.caminho)
      img.src = url
      img.closest('a').href = url
    } catch (e) { img.closest('a')?.classList.add('sem-arquivo'); img.alt = t('arquivosIndisponiveis') }
  }
}

function _extras(papel) {
  if (!C.extras.length) return ''
  // Com um só extra esperando, a decisão fica no próximo passo (no alto)
  const decide = papel === 'gestor' && !(C.ch.status === ST.ATENDIMENTO && C.extras.filter(e => e.status === 'aguardando').length === 1)
  return `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svExtras')}<span class="dt-contagem">${C.extras.length}</span></h2></div>
    <ul class="sv-extras">${C.extras.map(e => `
      <li class="sv-extra">
        <div class="sv-extra-txt"><span class="sv-extra-tit">${esc(e.descricao)}</span>
          <span class="sv-extra-sub">${e.status === 'aguardando' ? tf('svExtraPedidoPor', { nome: e.criadoPorNome || '' })
            : e.status === 'aprovado' ? tf('svExtraAprovadoPor', { nome: e.decididoPorNome || '' }) : tf('svExtraReprovadoPor', { nome: e.decididoPorNome || '', motivo: e.motivo || '' })}</span></div>
        <span class="sv-extra-valor">${formatCurrency(e.valor)}</span>
        <span class="sv-estado ${e.status === 'aprovado' ? 'sv-st-concluido' : e.status === 'reprovado' ? 'sv-st-encerrado' : 'sv-st-aguardando'}">${t(`svExtra_${e.status}`)}</span>
        ${decide && e.status === 'aguardando' ? `<div class="sv-extra-acoes"><button class="btn-danger btn-sm" data-extra-reprovar="${esc(e.id)}">${t('btnReprovar')}</button><button class="btn-primary btn-sm" data-extra-aprovar="${esc(e.id)}">${t('btnAprovar')}</button></div>` : ''}
      </li>`).join('')}</ul></section>`
}

function _conversa() {
  return `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svConversa')}${C.comentarios.length ? `<span class="dt-contagem">${C.comentarios.length}</span>` : ''}</h2></div>
    <ol class="sv-conversa">${C.comentarios.map(c => `
      <li class="sv-msg${c.autorId === auth.currentUser?.uid ? ' minha' : ''}">
        <span class="avatar avatar-sm" aria-hidden="true">${esc(gerarIniciais(c.autorNome || '?'))}</span>
        <div class="sv-msg-corpo"><span class="sv-msg-cab"><strong>${esc(c.autorNome || '')}</strong> · ${_dt(c.criadoEm)}</span><p>${esc(c.texto)}</p></div>
      </li>`).join('')}</ol>
    <form class="sv-composer" id="ch-composer">
      <label for="ch-msg" class="sr-only">${t('svMensagem')}</label>
      <textarea id="ch-msg" rows="2" maxlength="2000" placeholder="${t('svMensagemDica')}"></textarea>
      <button class="btn-secondary btn-sm" type="submit">${t('svEnviar')}</button>
    </form></section>`
}

function _registro() {
  if (!C.historico.length) return ''
  return `<section class="dt-bloco"><div class="dt-card-head"><h2 class="dt-secao">${t('svRegistro')}</h2></div>
    <ol class="sv-registro">${[...C.historico].reverse().map(h => `
      <li><span class="sv-reg-txt"><strong>${esc(h.autorNome || '')}</strong> ${esc(t(`svEv_${h.tipo}`) || h.tipo)}${h.texto ? `: ${esc(h.texto)}` : ''}</span>
        <span class="sv-reg-quando">${_dt(h.criadoEm)}</span></li>`).join('')}</ol></section>`
}

function _linkWhats(ch) {
  const msg = tf('svWhatsMensagem', { num: numeroDoChamado(ch.numero || 0), titulo: ch.titulo || '', unidade: ch.unidadeNome || '',
    url: `${location.origin}/?tela=chamado&id=${encodeURIComponent(ch.id)}` })
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

// ── Ações ──────────────────────────────────────────────────────────
function _ligarTela() {
  const on = (id, fn) => document.getElementById(id)?.addEventListener('click', fn)
  on('ch-agendar', () => _abrirAgendar())
  on('ch-chegar', () => _abrirChegada())
  on('ch-fotos', () => _abrirFotos())
  on('ch-extra', () => _abrirExtra())
  on('ch-concluir', () => _abrirConcluir())
  on('ch-confirmar', () => _confirmar())
  on('ch-contestar', () => _abrirContestar())
  on('ch-cancelar', () => _abrirCancelar())
  document.getElementById('ch-composer')?.addEventListener('submit', _enviarMensagem)
  document.querySelectorAll('[data-extra-aprovar]').forEach(b => b.addEventListener('click', () => _decidirExtra(b.dataset.extraAprovar, 'aprovado')))
  document.querySelectorAll('[data-extra-reprovar]').forEach(b => b.addEventListener('click', () => _decidirExtra(b.dataset.extraReprovar, 'reprovado')))
}

async function _passo(dados, evento, okMsg) {
  if (!exigirConexao()) return false
  mostrarSpinner()
  try {
    await gravarComEvento(doc(db, 'chamados', C.id), dados, evento)
    if (okMsg) prxToast(okMsg, 'success')
    return true
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
    return false
  } finally {
    esconderSpinner()
  }
}

function _modais() {
  const m = (id, titulo, corpo, botao) => `
    <div class="modal-overlay" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="modal np-modal sv-modal">
        <div class="modal-header"><h2 id="${id}-t">${titulo}</h2><button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button></div>
        <div class="modal-body">${corpo}</div>
        <div class="modal-footer"><button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>${botao}</div>
      </div>
    </div>`
  return [
    m('m-agendar', t('svAgendarTit'), `
      <div class="np-linhas">
        <div class="form-group" data-campo="ag-data"><label for="ag-data">${t('svDia')}</label><input type="date" id="ag-data"></div>
        <div class="form-group" data-campo="ag-hora"><label for="ag-hora">${t('svHora')}</label><input type="time" id="ag-hora" value="14:00"></div>
      </div><p class="np-dica">${t('svAgendarDica')}</p>`, `<button class="btn-primary" id="ag-ok">${t('svAgendar')}</button>`),
    m('m-chegada', t('svChegadaTit'), `<div id="chg-corpo"></div>`, `<button class="btn-primary" id="chg-ler">${icone('qr', 16)}${t('svLerQr')}</button>`),
    m('m-fotos', t('svFotosTit'), `
      <div class="view-toggle sv-seg" role="group" aria-label="${t('svFotosQuando')}">
        <button type="button" data-ft="antes" class="active" aria-pressed="true">${t('svAntes')}</button>
        <button type="button" data-ft="depois" aria-pressed="false">${t('svDepois')}</button>
      </div>
      <label class="btn-primary sv-btn-foto" for="ft-arquivo">${icone('camera', 16)}${t('svTirarFoto')}</label>
      <input type="file" id="ft-arquivo" accept="image/*" capture="environment" class="sr-only" multiple>
      <p class="np-dica">${t('svFotosDica')}</p><p class="np-dica" id="ft-status" aria-live="polite"></p>`, ''),
    m('m-extra', t('svExtraTit'), `
      <div class="np-linhas">
        <div class="form-group" data-campo="ex-desc"><label for="ex-desc">${t('svServico')}</label><input type="text" id="ex-desc" maxlength="200" placeholder="${t('svExtraExemplo')}"></div>
        <div class="form-group" data-campo="ex-valor"><label for="ex-valor">${t('svValor')}</label><input type="text" id="ex-valor" inputmode="decimal" placeholder="R$ 0,00"></div>
      </div><p class="np-dica">${t('svExtraDica')}</p>`, `<button class="btn-primary" id="ex-ok">${t('svEnviarAprovacao')}</button>`),
    m('m-concluir', t('svConcluirTit'), `
      <div class="form-group" data-campo="cc-rel"><label for="cc-rel">${t('svOQueFoiFeito')}</label>
        <textarea id="cc-rel" rows="4" maxlength="4000" placeholder="${t('svRelatorioExemplo')}"></textarea></div>
      <div class="form-group" data-campo="cc-pecas"><label for="cc-pecas">${t('svPecasTrocadas')} <span class="np-opcional">${t('opcional')}</span></label>
        <input type="text" id="cc-pecas" maxlength="300" placeholder="${t('svPecasExemplo')}"></div>
      <p class="np-dica" id="cc-fotos"></p>`, `<button class="btn-secondary" id="cc-manual">${t('svSemAPlaca')}</button><button class="btn-primary" id="cc-qr">${icone('qr', 16)}${t('svLerQrSaida')}</button>`),
    m('m-contestar', t('svContestarTit'), `
      <div class="category-chips sv-motivos" role="radiogroup" aria-label="${t('svMotivo')}">${MOTIVOS_CONTESTACAO.map((k, i) => `<button type="button" class="chip${i === 0 ? ' selected' : ''}" role="radio" aria-checked="${i === 0}" data-motivo="${k}">${t(k)}</button>`).join('')}</div>
      <div class="form-group" data-campo="ct-texto"><label for="ct-texto">${t('svExpliquePrestadora')} <span class="np-opcional">${t('opcional')}</span></label>
        <textarea id="ct-texto" rows="3" maxlength="1000"></textarea></div>`, `<button class="btn-danger" id="ct-ok">${t('svContestar')}</button>`),
    m('m-cancelar', t('svCancelarChamado'), `
      <div class="form-group" data-campo="cn-motivo"><label for="cn-motivo">${t('svMotivoCancelar')}</label>
        <input type="text" id="cn-motivo" maxlength="200" placeholder="${t('svMotivoCancelarEx')}"></div>`, `<button class="btn-danger" id="cn-ok">${t('svCancelarChamado')}</button>`),
  ].join('')
}

function _ligarModais() {
  for (const id of ['m-agendar', 'm-chegada', 'm-fotos', 'm-extra', 'm-concluir', 'm-contestar', 'm-cancelar']) initModal(id)
  document.getElementById('ag-ok').addEventListener('click', _agendar)
  document.getElementById('chg-ler').addEventListener('click', () => _lerQr('chegada'))
  document.getElementById('ft-arquivo').addEventListener('change', _enviarFotos)
  document.querySelectorAll('[data-ft]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-ft]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)) })
  }))
  document.getElementById('ex-ok').addEventListener('click', _enviarExtra)
  document.getElementById('cc-qr').addEventListener('click', () => _concluir('qr'))
  document.getElementById('cc-manual').addEventListener('click', () => _concluir('manual'))
  document.querySelectorAll('[data-motivo]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-motivo]').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute('aria-checked', String(x === b)) })
  }))
  document.getElementById('ct-ok').addEventListener('click', _contestar)
  document.getElementById('cn-ok').addEventListener('click', _cancelar)
}

// Agendar: o dia e a hora; quem agenda é o técnico que vai
function _abrirAgendar() {
  const d = new Date(Date.now() + 3600000)
  document.getElementById('ag-data').value = d.toISOString().slice(0, 10)
  abrirModal('m-agendar')
}
async function _agendar() {
  const data = document.getElementById('ag-data').value, hora = document.getElementById('ag-hora').value || '08:00'
  if (!data) { avisoNoFormulario(document.getElementById('m-agendar'), t('svEscolhaODia')); return }
  const quando = new Date(`${data}T${hora}:00`)
  const ok = await _passo({ status: ST.AGENDADO, agendadoPara: Timestamp.fromDate(quando), tecnicoId: sessao.usuario.id, tecnicoNome: sessao.usuario.nome || '' },
    { tipo: 'agendado', texto: quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }, t('svAgendadoOk'))
  if (ok) fecharModal('m-agendar')
}

// Chegada: pelo QR da placa (a câmera do celular abre o Praxis e registra,
// js/qr-tela.js; onde o navegador lê QR, aqui mesmo) ou, sem a placa, à mão
function _abrirChegada() {
  const qrNoApp = temLeitorQr()
  document.getElementById('chg-corpo').innerHTML = `
    <ol class="sv-passos-chegada">
      <li>${qrNoApp ? t('svChegadaPasso1App') : t('svChegadaPasso1')}</li>
      <li>${t('svChegadaPasso2')}</li>
    </ol>
    <p class="np-dica">${t('svChegadaSemPlaca')} <button type="button" class="btn-link" id="chg-manual">${t('svRegistrarAMao')}</button></p>`
  document.getElementById('chg-ler').hidden = !qrNoApp
  document.getElementById('chg-manual').addEventListener('click', async () => {
    const ok = await prxConfirm(t('svAMaoTit'), t('svAMaoMsg'), t('svRegistrarAMao'), t('btnCancelar'))
    if (!ok) return
    fecharModal('m-chegada')
    await registrarPresenca(C.ch, 'chegada', { via: 'manual', unidade: C.unidade })
  })
  abrirModal('m-chegada')
}

async function _lerQr(momento) {
  const lido = await lerQrNoApp()
  if (!lido) return
  const url = new URL(lido, location.origin)
  if (url.searchParams.get('u') !== C.ch.unidadeId) { prxToast(t('svQrDeOutraUnidade'), 'error'); return }
  fecharModal(momento === 'chegada' ? 'm-chegada' : 'm-concluir')
  await registrarPresenca(C.ch, momento, { via: 'qr', codigo: url.searchParams.get('c'), unidade: C.unidade })
}

// Fotos: antes ou depois, pela câmera
function _abrirFotos(tipo) {
  if (tipo) document.querySelectorAll('[data-ft]').forEach(x => { x.classList.toggle('active', x.dataset.ft === tipo); x.setAttribute('aria-pressed', String(x.dataset.ft === tipo)) })
  document.getElementById('ft-status').textContent = ''
  abrirModal('m-fotos')
}
async function _enviarFotos(e) {
  const arquivos = [...(e.target.files || [])]
  e.target.value = ''
  if (!arquivos.length || !exigirConexao()) return
  const tipo = document.querySelector('[data-ft].active')?.dataset.ft || 'antes'
  const status = document.getElementById('ft-status')
  let enviadas = 0
  for (const a of arquivos) {
    status.textContent = tf('svEnviandoFoto', { n: enviadas + 1, total: arquivos.length })
    try {
      const blob = await prepararFoto(a, [
        `${new Date().toLocaleString('pt-BR')} · ${C.ch.unidadeNome}`,
        `${C.ch.numero ? numeroDoChamado(C.ch.numero) : t('svVisita')} · ${t(tipo === 'antes' ? 'svAntes' : 'svDepois')} · ${sessao.usuario.nome || ''}`,
      ])
      await enviarFotoDoChamado(C.ch, tipo, blob)
      enviadas++
    } catch (err) {
      console.error(err)
      status.textContent = ''
      prxToast(err.code === 'praxis/demo-sem-arquivos' ? t('svFotoDemo') : arquivoIndisponivel(err) ? t('arquivosIndisponiveis') : t('svFotoNaoEnviada'), 'warning')
      return
    }
  }
  status.textContent = tf(enviadas === 1 ? 'svFotoEnviada1' : 'svFotosEnviadas', { n: enviadas })
  prxToast(tf(enviadas === 1 ? 'svFotoEnviada1' : 'svFotosEnviadas', { n: enviadas }), 'success')
}

// Extra: o que é e o valor; vai para a aprovação do gestor de Serviços
function _abrirExtra() {
  document.getElementById('ex-desc').value = ''
  document.getElementById('ex-valor').value = ''
  abrirModal('m-extra')
}
async function _enviarExtra() {
  const descricao = document.getElementById('ex-desc').value.trim()
  const valor = parseMoeda(document.getElementById('ex-valor').value)
  if (!descricao || !(valor > 0)) { avisoNoFormulario(document.getElementById('m-extra'), t('svExtraPreencha')); return }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await setDoc(doc(collection(db, 'chamados', C.id, 'extras')), {
      descricao, valor, status: 'aguardando', criadoPor: auth.currentUser.uid, criadoPorNome: sessao.usuario.nome || '',
      criadoEm: serverTimestamp(), ...marcaDemo(),
    })
    fecharModal('m-extra')
    prxToast(t('svExtraEnviado'), 'success')
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}
async function _decidirExtra(id, status) {
  let motivo = ''
  if (status === 'reprovado') {
    const ok = await prxConfirm(t('svReprovarExtraTit'), t('svReprovarExtraMsg'), t('btnReprovar'), t('btnCancelar'), true)
    if (!ok) return
    motivo = t('svExtraReprovadoMotivo')
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'chamados', C.id, 'extras', id), {
      status, decididoPor: auth.currentUser.uid, decididoPorNome: sessao.usuario.nome || '', decididoEm: serverTimestamp(),
      ...(motivo ? { motivo } : {}),
    })
    prxToast(t(status === 'aprovado' ? 'svExtraAprovadoOk' : 'svExtraReprovadoOk'), 'success')
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

// Concluir: o relatório e as peças; depois, o QR de saída (ou à mão)
function _abrirConcluir() {
  const r = rascunhoDaConclusao(C.id)
  document.getElementById('cc-rel').value = r?.relatorio || ''
  document.getElementById('cc-pecas').value = (r?.pecas || []).join(', ')
  const depois = C.fotos.filter(f => f.tipo === 'depois').length
  document.getElementById('cc-fotos').innerHTML = depois ? tf('svFotosDepoisTem', { n: depois })
    : `${t('svSemFotoDepois')} <button type="button" class="btn-link" id="cc-tirar">${t('svTirarAgora')}</button>`
  document.getElementById('cc-tirar')?.addEventListener('click', () => { fecharModal('m-concluir'); _abrirFotos('depois') })
  const qrNoApp = temLeitorQr()
  document.getElementById('cc-qr').textContent = qrNoApp ? t('svLerQrSaida') : t('svGuardarEIrParaPlaca')
  abrirModal('m-concluir')
}
async function _concluir(via) {
  const relatorio = document.getElementById('cc-rel').value.trim()
  const pecas = document.getElementById('cc-pecas').value.split(/[,;]/).map(x => x.trim()).filter(Boolean).slice(0, 30)
  if (!relatorio) { avisoNoFormulario(document.getElementById('m-concluir'), t('svEscrevaOQueFez')); return }
  guardarConclusao(C.id, { relatorio, pecas })
  if (via === 'manual') {
    const ok = await prxConfirm(t('svAMaoSaidaTit'), t('svAMaoSaidaMsg'), t('svConcluir'), t('btnCancelar'))
    if (!ok) return
    fecharModal('m-concluir')
    await registrarPresenca(C.ch, 'saida', { via: 'manual', unidade: C.unidade })
    return
  }
  if (temLeitorQr()) { await _lerQr('saida'); return }
  // Sem leitor no navegador: o relatório fica guardado; a câmera do celular,
  // na placa, abre o Praxis e conclui (js/qr-tela.js)
  fecharModal('m-concluir')
  prxToast(t('svRelatorioGuardado'), 'info', 8000)
}

// Confirmar: fecha o chamado. Com o aparelho ligado, o custo (os extras
// aprovados) entra no histórico dele no mesmo lote
async function _confirmar() {
  const ok = await prxConfirm(t('svConfirmarTit'), t('svConfirmarMsg'), t('svConfirmar'), t('btnCancelar'))
  if (!ok || !exigirConexao()) return
  const ch = C.ch
  const aprovados = Math.round(C.extras.filter(e => e.status === 'aprovado').reduce((s, e) => s + (Number(e.valor) || 0), 0) * 100) / 100
  mostrarSpinner()
  try {
    let eqAntes = null
    if (ch.equipamentoId) {
      try { const s = await getDoc(doc(db, 'equipamentos', ch.equipamentoId)); if (s.exists()) eqAntes = s.data() } catch { /* sem o aparelho */ }
    }
    await gravarComEvento(doc(db, 'chamados', C.id), {
      status: ST.CONFIRMADO, confirmadoPor: auth.currentUser.uid, confirmadoPorNome: sessao.usuario.nome || '',
      confirmadoEm: serverTimestamp(), extrasAprovados: aprovados,
    }, { tipo: 'confirmado' }, {
      extra: eqAntes ? (lote, agora) => {
        const eqRef = doc(db, 'equipamentos', ch.equipamentoId)
        const ev = doc(collection(eqRef, 'historico'))
        lote.update(eqRef, {
          custos: [...(eqAntes.custos || []), { data: new Date().toISOString().slice(0, 10), valor: aprovados, chamadoId: C.id }],
          atualizadoEm: agora, ultimoEventoId: ev.id,
        })
        lote.set(ev, { autorId: auth.currentUser.uid, autorNome: sessao.usuario.nome || '', criadoEm: agora, tipo: 'chamado',
          texto: `${numeroDoChamado(ch.numero || 0)} · ${ch.fornecedorNome}${aprovados ? ` · ${formatCurrency(aprovados)}` : ''}`, ...marcaDemo() })
      } : null,
    })
    prxToast(t('svConfirmadoOk'), 'success')
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

function _abrirContestar() {
  document.getElementById('ct-texto').value = ''
  abrirModal('m-contestar')
}
async function _contestar() {
  const chave = document.querySelector('[data-motivo].selected')?.dataset.motivo || MOTIVOS_CONTESTACAO[0]
  const texto = document.getElementById('ct-texto').value.trim()
  const ok = await _passo({
    status: ST.CONTESTADO, contestacao: { motivo: t(chave), texto }, contestacoes: (C.ch.contestacoes || 0) + 1, contestadoEm: serverTimestamp(),
  }, { tipo: 'contestado', texto: t(chave) }, t('svContestadoOk'))
  if (ok) fecharModal('m-contestar')
}

function _abrirCancelar() {
  document.getElementById('cn-motivo').value = ''
  abrirModal('m-cancelar')
}
async function _cancelar() {
  const motivo = document.getElementById('cn-motivo').value.trim()
  if (!motivo) { avisoNoFormulario(document.getElementById('m-cancelar'), t('svDigaOMotivo')); return }
  const ok = await _passo({ status: ST.CANCELADO, cancelamento: { motivo, porNome: sessao.usuario.nome || '' } }, { tipo: 'cancelado', texto: motivo }, t('svCanceladoOk'))
  if (ok) fecharModal('m-cancelar')
}

async function _enviarMensagem(e) {
  e.preventDefault()
  const campo = document.getElementById('ch-msg')
  const texto = campo.value.trim()
  if (!texto) return
  try {
    await setDoc(doc(collection(db, 'chamados', C.id, 'comentarios')), {
      texto, autorId: auth.currentUser.uid, autorNome: sessao.usuario.nome || '', criadoEm: serverTimestamp(), ...marcaDemo(),
    })
    campo.value = ''
  } catch (err) {
    console.error(err)
    prxToast(t('erroSalvar'), 'error')
  }
}

