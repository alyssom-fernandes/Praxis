// Serviços › Prestadoras (27/11/2026). O gestor de Serviços vê o painel de
// cada prestadora (últimos 90 dias) e configura os serviços contratados dela:
// o tipo (visita periódica ou chamado), a frequência, o prazo de atendimento e
// as unidades atendidas. A conta da prestadora (prestadorAdmin) vê a própria
// ficha e cuida dos técnicos dela, com o acesso sem e-mail.
import {
  db, collection, doc, getDoc, getDocs, where, serverTimestamp, consulta, criarContaDeLogin,
} from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral } from './app.js'
import { sessao } from './estado.js'
import { prxToast, prxAlert, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, initModal, avisoNoFormulario } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t } from './constants.js'
import { esc, formatCurrency, empresasDoUsuario } from './utils.js'
import { tf, cabecalho, resumoCarregando, revelarItemLateral } from './config-comum.js'
import { icone } from './icones.js'
import { papelServicos, adminDaPrestadora, administra, PERFIL_PRESTADOR } from './modulos.js'
import { painelDaPrestadora } from './servicos-regras.js'
import { consultaChamados, consultaUnidades, msDe } from './modulos-dados.js'
import { gravarAuditado } from './auditoria.js'
import { normalizarLogin, loginValido, emailDoLogin, senhaInicial, loginDoEmail } from './acesso.js'

const P = { prestadoras: [], unidades: [], chamados: [], tecnicos: [], aberta: null, editando: null }

export async function renderPrestadoras() {
  const u = sessao.usuario
  const souPrestadora = adminDaPrestadora(u)
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('prestadora')}
      <main class="main-content cfg-pagina pr-pagina">
        ${cabecalho(souPrestadora ? t('svTecnicos') : t('svPrestadoras'), { resumoId: 'pr-resumo', resumo: resumoCarregando(souPrestadora ? 'prTecnicosDesc' : 'prDesc'),
          acao: souPrestadora ? `<button class="btn-primary" id="pr-novo-tec">${icone('novo', 16)}${t('prNovoTecnico')}</button>` : '' })}
        <div id="pr-corpo" aria-busy="true"><div class="grupo-lista">${'<div class="sv-item is-esqueleto"><span class="skeleton skeleton-text"></span></div>'.repeat(3)}</div></div>
      </main>
      ${renderFooter()}
    </div>
    ${_modalServico()}
    ${_modalTecnico()}`
  initTopbarEvents(false)
  atualizarLateral({ ativo: 'prestadoras' })
  revelarItemLateral()
  renderNotificacoes()
  initModal('modal-servico')
  initModal('modal-tecnico')
  document.getElementById('sv-salvar').addEventListener('click', _salvarServico)
  document.getElementById('sv-tipo').addEventListener('change', _tipoMudou)
  document.getElementById('tec-salvar').addEventListener('click', _criarTecnico)
  document.getElementById('pr-novo-tec')?.addEventListener('click', _abrirTecnico)
  if (souPrestadora) await _carregarPrestadora()
  else await _carregarGestor()
}

// ── Gestor de Serviços ─────────────────────────────────────────────
async function _carregarGestor() {
  try {
    const [fSnap, uSnap, cSnap] = await Promise.all([
      getDocs(consulta(collection(db, 'fornecedores'))), getDocs(consultaUnidades()), getDocs(consultaChamados()),
    ])
    P.prestadoras = fSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    P.unidades = uSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.ativa !== false)
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    P.chamados = cSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error(e)
    prxToast(t('erroCarregar'), 'error')
  }
  _desenharGestor()
}

function _painel(fornId) {
  const ch = P.chamados.filter(c => c.fornecedorId === fornId).map(c => ({
    ...c, criadoMs: msDe(c.criadoEm), previstaMs: c.previstaPara ? Date.parse(`${c.previstaPara}T12:00:00Z`) : null,
    prazoMs: msDe(c.prazoEm), chegadaMs: msDe(c.chegada?.em),
  }))
  const p = painelDaPrestadora(ch, [], Date.now())
  p.extrasAprovados = Math.round(ch.filter(c => (msDe(c.confirmadoEm) || 0) > Date.now() - 90 * 864e5)
    .reduce((s, c) => s + (Number(c.extrasAprovados) || 0), 0) * 100) / 100
  return p
}

function _desenharGestor() {
  const corpo = document.getElementById('pr-corpo')
  if (!corpo) return
  corpo.removeAttribute('aria-busy')
  const nome = f => f.nomeExibicao || f.nome || ''
  const comContrato = P.prestadoras.filter(f => (f.servicosContratados || []).length).sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))
  const outras = P.prestadoras.filter(f => !(f.servicosContratados || []).length).sort((a, b) => nome(a).localeCompare(nome(b), 'pt-BR'))
  document.getElementById('pr-resumo').textContent = tf('prResumo', { n: comContrato.length })
  const cartao = f => {
    const p = _painel(f.id)
    const aberta = P.aberta === f.id
    return `
      <section class="pr-cartao${aberta ? ' aberta' : ''}" data-forn="${esc(f.id)}">
        <button type="button" class="pr-cab" aria-expanded="${aberta}" data-abrir="${esc(f.id)}">
          <span class="pr-nome">${esc(nome(f))}</span>
          <span class="pr-sub">${(f.servicosContratados || []).length ? esc((f.servicosContratados || []).map(s => s.nome).join(' · ')) : t('prSemServico')}</span>
          ${icone('setaDir', 14)}
        </button>
        ${(f.servicosContratados || []).length || p.chamados ? `
        <dl class="pr-painel" aria-label="${t('prPainel90')}">
          <div><dt>${t('prChamados')}</dt><dd>${p.chamados}</dd></div>
          <div><dt>${t('prNoPrazo')}</dt><dd class="${p.comPrazo && p.noPrazo < p.comPrazo ? 'ruim' : ''}">${p.comPrazo ? tf('prDe', { a: p.noPrazo, b: p.comPrazo }) : '—'}</dd></div>
          <div><dt>${t('prVisitas')}</dt><dd class="${p.visitas && p.visitasFeitas < p.visitas ? 'ruim' : ''}">${p.visitas ? tf('prDe', { a: p.visitasFeitas, b: p.visitas }) : '—'}</dd></div>
          <div><dt>${t('prContestados')}</dt><dd class="${p.contestados ? 'ruim' : ''}">${p.contestados}</dd></div>
          <div><dt>${t('prExtras')}</dt><dd>${formatCurrency(p.extrasAprovados)}</dd></div>
        </dl>` : ''}
        ${aberta ? _ficha(f) : ''}
      </section>`
  }
  corpo.innerHTML = `
    ${comContrato.length ? `<h2 class="sv-grupo-cab"><span>${t('svComContrato')}</span><span>${t('prPainel90')}</span></h2>${comContrato.map(cartao).join('')}` : ''}
    <h2 class="sv-grupo-cab"><span>${comContrato.length ? t('svOutrasPrestadoras') : t('svPrestadoras')}</span></h2>
    ${outras.length ? outras.map(cartao).join('') : `<p class="sv-vazio">${t('prSemOutras')}</p>`}
    <p class="np-dica">${t('prDicaFornecedor')}</p>`
  corpo.querySelectorAll('[data-abrir]').forEach(b => b.addEventListener('click', () => {
    P.aberta = P.aberta === b.dataset.abrir ? null : b.dataset.abrir
    _desenharGestor()
  }))
  corpo.querySelectorAll('[data-novo-servico]').forEach(b => b.addEventListener('click', () => _abrirServico(b.dataset.novoServico, null)))
  corpo.querySelectorAll('[data-servico]').forEach(b => b.addEventListener('click', () => _abrirServico(b.dataset.fornecedor, b.dataset.servico)))
}

function _ficha(f) {
  const servs = f.servicosContratados || []
  const unid = ids => (ids || []).map(id => P.unidades.find(u => u.id === id)?.nome).filter(Boolean).join(', ') || t('prTodasUnidades')
  return `
    <div class="pr-ficha">
      <h3 class="sv-grupo-cab"><span>${t('prServicosContratados')}</span></h3>
      ${servs.length ? `<div class="grupo-lista">${servs.map(s => `
        <button type="button" class="sv-item" data-fornecedor="${esc(f.id)}" data-servico="${esc(s.id)}">
          <span class="sv-item-tit">${esc(s.nome)}</span>
          <span class="sv-item-sub">${esc(s.tipo === 'periodico' ? tf('prCadaDias', { n: s.frequenciaDias, desde: (s.inicio || '').split('-').reverse().join('/') }) : (s.prazoHoras ? tf('prAtenderEm', { n: s.prazoHoras }) : t('prSemPrazo')))} · ${esc(unid(s.unidades))}</span>
          ${icone('editar', 14)}
        </button>`).join('')}</div>` : `<p class="sv-vazio">${t('prNenhumServico')}</p>`}
      <button type="button" class="btn-secondary" data-novo-servico="${esc(f.id)}">${icone('novo', 16)}${t('prNovoServico')}</button>
      ${administra(sessao.usuario) ? `<p class="np-dica">${t('prDicaAcessosAdmin')}</p>` : `<p class="np-dica">${t('prDicaAcessos')}</p>`}
    </div>`
}

// ── Serviço contratado (frequência, prazo, unidades) ───────────────
function _modalServico() {
  return `
    <div class="modal-overlay" id="modal-servico" role="dialog" aria-modal="true" aria-labelledby="sv-t">
      <div class="modal np-modal sv-modal">
        <div class="modal-header"><div><h2 id="sv-t">${t('prNovoServico')}</h2><p class="np-sub" id="sv-forn"></p></div>
          <button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button></div>
        <div class="modal-body">
          <div class="np-linhas">
            <div class="form-group" data-campo="sv-nome"><label for="sv-nome">${t('prNomeServico')}</label><input type="text" id="sv-nome" maxlength="80" placeholder="${t('prNomeExemplo')}"></div>
            <div class="form-group" data-campo="sv-tipo"><label for="sv-tipo">${t('prTipo')}</label>
              <select id="sv-tipo"><option value="periodico">${t('prTipoPeriodico')}</option><option value="chamado">${t('prTipoChamado')}</option></select></div>
            <div class="form-group" data-campo="sv-freq" id="sv-freq-g"><label for="sv-freq">${t('prFrequencia')}</label><input type="number" id="sv-freq" min="1" max="730" inputmode="numeric" value="30"></div>
            <div class="form-group" data-campo="sv-inicio" id="sv-inicio-g"><label for="sv-inicio">${t('prPrimeiraVisita')}</label><input type="date" id="sv-inicio"></div>
            <div class="form-group" data-campo="sv-prazo" id="sv-prazo-g" hidden><label for="sv-prazo">${t('prPrazoHoras')}</label><input type="number" id="sv-prazo" min="0" max="720" inputmode="numeric" value="24"></div>
          </div>
          <div class="form-group" data-campo="sv-unidades">
            <span class="np-secao" id="sv-un-rot">${t('prUnidadesAtendidas')}</span>
            <div class="cfg-checklist" id="sv-unidades" role="group" aria-labelledby="sv-un-rot"></div>
          </div>
          <p class="np-dica" id="sv-dica"></p>
        </div>
        <div class="modal-footer">
          <button class="btn-danger cfg-acao-esquerda" id="sv-remover" hidden>${t('prRemover')}</button>
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="sv-salvar">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>`
}

function _tipoMudou() {
  const per = document.getElementById('sv-tipo').value === 'periodico'
  document.getElementById('sv-freq-g').hidden = !per
  document.getElementById('sv-inicio-g').hidden = !per
  document.getElementById('sv-prazo-g').hidden = per
  document.getElementById('sv-dica').textContent = per ? t('prDicaPeriodico') : t('prDicaChamado')
}

function _abrirServico(fornId, servId) {
  const f = P.prestadoras.find(x => x.id === fornId)
  const s = (f?.servicosContratados || []).find(x => x.id === servId) || null
  P.editando = { fornId, servId }
  document.getElementById('sv-t').textContent = s ? t('prEditarServico') : t('prNovoServico')
  document.getElementById('sv-forn').textContent = f?.nomeExibicao || f?.nome || ''
  document.getElementById('sv-nome').value = s?.nome || ''
  document.getElementById('sv-tipo').value = s?.tipo || 'periodico'
  document.getElementById('sv-freq').value = s?.frequenciaDias || 30
  document.getElementById('sv-inicio').value = s?.inicio || new Date().toISOString().slice(0, 10)
  document.getElementById('sv-prazo').value = s?.prazoHoras ?? 24
  document.getElementById('sv-unidades').innerHTML = P.unidades.map(u => `
    <label class="cfg-check"><input type="checkbox" class="sv-un" value="${esc(u.id)}"${(s?.unidades || []).includes(u.id) ? ' checked' : ''}><span class="cfg-check-nome">${esc(u.nome)}</span></label>`).join('') ||
    `<p class="sv-vazio">${t('svSemUnidades')}</p>`
  const rem = document.getElementById('sv-remover')
  rem.hidden = !s
  rem.onclick = () => _salvarServico(true)
  _tipoMudou()
  abrirModal('modal-servico')
}

async function _salvarServico(remover = false) {
  const { fornId, servId } = P.editando || {}
  const f = P.prestadoras.find(x => x.id === fornId)
  if (!f) return
  const modal = document.getElementById('modal-servico')
  const tipo = document.getElementById('sv-tipo').value
  const novo = {
    id: servId || `s${Date.now().toString(36)}`,
    nome: document.getElementById('sv-nome').value.trim(),
    tipo,
    unidades: [...document.querySelectorAll('.sv-un:checked')].map(c => c.value),
    ...(tipo === 'periodico'
      ? { frequenciaDias: Math.round(Number(document.getElementById('sv-freq').value) || 0), inicio: document.getElementById('sv-inicio').value, prazoHoras: 0 }
      : { prazoHoras: Math.max(0, Math.round(Number(document.getElementById('sv-prazo').value) || 0)) }),
  }
  if (remover !== true) {
    if (!novo.nome) { avisoNoFormulario(modal, t('prDigaONome')); return }
    if (tipo === 'periodico' && (!(novo.frequenciaDias > 0) || !novo.inicio)) { avisoNoFormulario(modal, t('prDigaFrequencia')); return }
    if (tipo === 'periodico' && !novo.unidades.length) { avisoNoFormulario(modal, t('prEscolhaUnidades')); return }
  }
  const antes = f.servicosContratados || []
  const lista = remover === true ? antes.filter(x => x.id !== servId)
    : servId ? antes.map(x => (x.id === servId ? novo : x)) : [...antes, novo]
  mostrarSpinner()
  try {
    await gravarAuditado({ colecao: 'fornecedores', id: f.id, tipo: 'editar', antes: f, nome: f.nomeExibicao || f.nome || '',
      dados: { servicosContratados: lista, atualizadoEm: serverTimestamp() } })
    f.servicosContratados = lista
    fecharModal('modal-servico')
    prxToast(remover === true ? t('prServicoRemovido') : t('prServicoSalvo'), 'success')
    _desenharGestor()
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

// ── A conta da prestadora: os técnicos ─────────────────────────────
async function _carregarPrestadora() {
  const u = sessao.usuario
  try {
    const [f, tSnap] = await Promise.all([
      getDoc(doc(db, 'fornecedores', u.fornecedorId)),
      // consulta(): na demo, junta o filtro da área da demonstração
      getDocs(consulta(collection(db, 'usuarios'), where('fornecedorId', '==', u.fornecedorId))),
    ])
    P.prestadoras = f.exists() ? [{ id: f.id, ...f.data() }] : []
    P.tecnicos = tSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  } catch (e) {
    console.error(e)
    prxToast(t('erroCarregar'), 'error')
  }
  _desenharPrestadora()
}

function _desenharPrestadora() {
  const corpo = document.getElementById('pr-corpo')
  if (!corpo) return
  corpo.removeAttribute('aria-busy')
  const f = P.prestadoras[0]
  document.getElementById('pr-resumo').textContent = tf('prTecnicosResumo', { prestadora: f?.nomeExibicao || f?.nome || '', n: P.tecnicos.length })
  corpo.innerHTML = `
    <div class="grupo-lista">${P.tecnicos.map(x => `
      <div class="sv-item pr-tecnico${x.ativo === false ? ' inativo' : ''}">
        <span class="sv-item-tit">${esc(x.nome)}${x.id === sessao.usuario.id ? ` <span class="cfg-marca">${t('cfgVoce')}</span>` : ''}</span>
        <span class="sv-item-sub">${esc(x.prestadorAdmin ? t('cfgContaDaPrestadoraCurto') : tf('cfgLoginMostrar', { login: loginDoEmail(x.email) || x.email || '' }))}</span>
        <span class="sv-item-dir">${x.id !== sessao.usuario.id && !x.prestadorAdmin
          ? `<button type="button" class="btn-secondary btn-sm" data-ativo="${esc(x.id)}">${x.ativo === false ? t('prReativar') : t('prDesativar')}</button>`
          : ''}</span>
      </div>`).join('')}</div>
    <p class="np-dica">${t('prDicaTecnicos')}</p>`
  corpo.querySelectorAll('[data-ativo]').forEach(b => b.addEventListener('click', () => _alternarTecnico(b.dataset.ativo)))
}

function _modalTecnico() {
  return `
    <div class="modal-overlay" id="modal-tecnico" role="dialog" aria-modal="true" aria-labelledby="tec-t">
      <div class="modal np-modal sv-modal cfg-modal-sm">
        <div class="modal-header"><h2 id="tec-t">${t('prNovoTecnico')}</h2>
          <button class="btn-icon" data-close-modal aria-label="${t('fechar')}">${icone('x', 16)}</button></div>
        <div class="modal-body">
          <div class="np-linhas">
            <div class="form-group" data-campo="tec-nome"><label for="tec-nome">${t('cfgNome')}</label><input type="text" id="tec-nome" maxlength="80" autocomplete="off"></div>
            <div class="form-group" data-campo="tec-login"><label for="tec-login">${t('cfgLogin')}</label><input type="text" id="tec-login" maxlength="32" autocapitalize="none" autocomplete="off" placeholder="${t('prLoginExemplo')}"></div>
          </div>
          <p class="np-dica">${t('cfgLoginDica')}</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="tec-salvar">${t('cfgCriarAcesso')}</button>
        </div>
      </div>
    </div>`
}
function _abrirTecnico() {
  document.getElementById('tec-nome').value = ''
  document.getElementById('tec-login').value = ''
  abrirModal('modal-tecnico')
}
async function _criarTecnico() {
  const modal = document.getElementById('modal-tecnico')
  const nome = document.getElementById('tec-nome').value.trim()
  const login = normalizarLogin(document.getElementById('tec-login').value)
  if (!nome) { avisoNoFormulario(modal, t('nomeObrigatorio')); return }
  if (!loginValido(login)) { avisoNoFormulario(modal, t('cfgLoginInvalido')); return }
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
  const u = sessao.usuario
  mostrarSpinner()
  try {
    const senha = senhaInicial()
    const email = emailDoLogin(login)
    const uid = await criarContaDeLogin(email, senha)
    const empresas = empresasDoUsuario(u)
    await gravarAuditado({ colecao: 'usuarios', id: uid, tipo: 'criar', nome, empresaIds: empresas,
      dados: { nome, email, login, perfil: PERFIL_PRESTADOR, fornecedorId: u.fornecedorId, prestadorAdmin: false, empresas,
        ativo: true, trocarSenha: true, criadoPor: u.id, criadoEm: serverTimestamp(), ultimoAcesso: null } })
    esconderSpinner()
    fecharModal('modal-tecnico')
    await prxAlert(t('cfgAcessoCriadoTitulo'), tf('cfgAcessoCriadoMsg', { nome, login, senha }))
    await _carregarPrestadora()
  } catch (e) {
    console.error(e)
    prxToast(e?.code === 'auth/email-already-in-use' ? t('cfgLoginEmUso') : t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}
async function _alternarTecnico(id) {
  const x = P.tecnicos.find(y => y.id === id)
  if (!x) return
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
  mostrarSpinner()
  try {
    await gravarAuditado({ colecao: 'usuarios', id, tipo: 'editar', antes: x, nome: x.nome, empresaIds: x.empresas || [],
      dados: { ativo: x.ativo === false, atualizadoEm: serverTimestamp() } })
    await _carregarPrestadora()
  } catch (e) {
    console.error(e)
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

export { papelServicos }
