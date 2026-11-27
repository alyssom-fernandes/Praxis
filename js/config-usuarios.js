import {
  db, collection, getDocs, query, where, serverTimestamp, Timestamp,
  consulta, consultaUsuarios, criarContaDeLogin,
} from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter, atualizarLateral } from './app.js'
import { sessao } from './estado.js'
import { prxToast, prxConfirm, prxAlert, mostrarSpinner, esconderSpinner, abrirModal, fecharModal } from './ui.js'
import { normalizarLogin, loginValido, emailDoLogin, senhaInicial, eAcessoSemEmail, loginDoEmail } from './acesso.js'
import { renderNotificacoes } from './notificacoes.js'
import { PERFIS, PERFIS_LABEL, t } from './constants.js'
import { debounce, validarEmail, normalizarTexto, formatCNPJ, empresasDoUsuario, dataAbsoluta } from './utils.js'
import { gravarAuditado } from './auditoria.js'
import { PERFIL_NENHUM, PERFIL_PRESTADOR, PAPEIS_SERVICOS, PAPEIS_EQUIP, papelServicos, papelEquip } from './modulos.js'
import {
  ICO, tf, plural, cabecalho, resumoCarregando, botaoNovo, linhaVazia, linhasEsqueleto, esc,
  perfilHtml, dataAcesso, iniciais,
  marcarErro, limparErro, limparErros, focarPrimeiroErro, ligarInterruptor, definirInterruptor,
  revelarItemLateral, completarContagensLateral, linhasComMais,
} from './config-comum.js'

let _usuarios     = []
let _convites     = []
let _empresas     = []
let _prestadoras  = []
let _filtroStatus = 'todos'
let _termoBusca   = ''
// O que o modal está fazendo: 'novo' (convidar), 'editar' (usuário) ou 'convite'
let _modo         = 'novo'
let _conviteAtual = null

const COLUNAS = 5
// Pessoas novas entram por convite: o perfil nasce no primeiro acesso, com o
// UID da conta de login (js/auth.js). O convite vale por este prazo.
const PRAZO_CONVITE_DIAS = 30
const _souSupremo = () => sessao.usuario?.perfil === PERFIS.SUPREMO
const _meuId      = () => sessao.usuario?.id || sessao.fireUser?.uid
const _ativo      = u => u.ativo !== false
const _emailNorm  = e => String(e || '').trim().toLowerCase()
const _vencido    = c => !c.expiraEm?.toMillis || c.expiraEm.toMillis() <= Date.now()

export async function renderConfigUsuarios() {
  _filtroStatus = 'todos'
  _termoBusca   = ''
  const filtro = (s, rotulo, on = false) => `
    <button type="button" class="cfg-filtro ${on ? 'active' : ''}" data-s="${s}" aria-pressed="${on}">
      ${rotulo}<span class="cfg-filtro-n" id="usr-n-${s}"></span>
    </button>`

  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-usuarios', true)}
      <main class="main-content cfg-pagina">
        ${cabecalho(t('configUsuarios'), {
          resumoId: 'usr-resumo', resumo: resumoCarregando('cfgUsuariosDesc'),
          acao: botaoNovo('btn-novo-usuario', t('btnNovoUsuario'), t('cfgNovoCurto')),
        })}

        <div class="cfg-toolbar">
          <div class="cfg-filtros" id="usr-filtros" role="group" aria-label="${t('cfgFiltrarStatus')}">
            ${filtro('todos', t('todos'), true)}
            ${filtro('ativos', t('cfgAtivos'))}
            ${filtro('inativos', t('cfgInativos'))}
            ${filtro('convites', t('cfgConvites'))}
          </div>
          <div class="search-input-wrap cfg-busca">
            ${ICO.busca()}
            <input type="search" id="busca-usuario" placeholder="${t('cfgBuscarUsuario')}" aria-label="${t('cfgBuscarUsuario')}" autocomplete="off">
          </div>
        </div>

        <div class="cfg-livro">
          <table class="cfg-tabela usr-tabela" id="tabela-usuarios">
            <thead>
              <tr>
                <th class="c-usuario">${t('cfgColUsuario')}</th>
                <th class="c-perfil">${t('cfgColPerfil')}</th>
                <th class="c-empresas">${t('cfgColEmpresas')}</th>
                <th class="c-acesso">${t('cfgColUltimoAcesso')}</th>
                <th class="c-acoes"><span class="sr-only">${t('cfgColAcoes')}</span></th>
              </tr>
            </thead>
            <tbody id="tbody-usuarios">${linhasEsqueleto(COLUNAS, 5)}</tbody>
          </table>
        </div>
      </main>
      ${renderFooter()}
    </div>

    <!-- Modal Usuário -->
    <div class="modal-overlay" id="modal-usuario" role="dialog" aria-modal="true" aria-labelledby="modal-usuario-titulo">
      <div class="modal cfg-modal">
        <div class="modal-header">
          <div class="cfg-modal-head">
            <h2 id="modal-usuario-titulo">${t('novoUsuarioTitulo')}</h2>
            <p class="cfg-modal-sub" id="modal-usuario-sub" hidden></p>
          </div>
          <button class="btn-icon" id="close-modal-usuario" aria-label="${t('btnCancelar')}">${ICO.fechar()}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="usr-id">
          <div class="cfg-aviso" id="usr-aviso-supremo" hidden>${ICO.cadeado()}<span>${t('cfgSomenteSupremo')}</span></div>
          <div class="form-grid form-grid-2 cfg-form">
            <div class="form-group col-span-2" data-campo="usr-nome">
              <label for="usr-nome">${t('cfgNome')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <input type="text" id="usr-nome" placeholder="${t('cfgNomeCompleto')}" maxlength="80" autocomplete="off">
            </div>
            <div class="form-group col-span-2" data-campo="usr-email">
              <label class="emp-opcao-check usr-sem-email" id="usr-sem-email-linha" hidden>
                <input type="checkbox" id="usr-sem-email"> <span>${t('cfgSemEmail')}</span>
              </label>
              <label for="usr-email" id="usr-email-rotulo">${t('cfgEmail')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <input type="email" id="usr-email" placeholder="${t('cfgEmailPlaceholder')}" autocomplete="off">
              <span class="form-hint" id="usr-email-dica" hidden></span>
            </div>
            <div class="form-group" data-campo="usr-perfil">
              <label for="usr-perfil">${t('modCompras')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <select id="usr-perfil"></select>
            </div>
            <div class="form-group" data-campo="usr-ativo" id="usr-ativo-grupo">
              <span class="cfg-rotulo-campo" id="usr-ativo-rotulo">${t('cfgAcesso')}</span>
              <div class="toggle-wrap cfg-interruptor" id="usr-ativo-wrap" role="switch" tabindex="0" aria-checked="true" aria-labelledby="usr-ativo-rotulo usr-ativo-label">
                <div class="toggle on"></div>
                <span class="toggle-label" id="usr-ativo-label">${t('cfgAtivo')}</span>
              </div>
            </div>
            <p class="cfg-perfil-desc col-span-2" id="usr-perfil-desc" hidden></p>
            <div class="form-group" data-campo="usr-servicos" id="usr-servicos-grupo">
              <label for="usr-servicos">${t('modServicos')}</label>
              <select id="usr-servicos">
                <option value="">${t('papelNenhum')}</option>
                ${PAPEIS_SERVICOS.map(p => `<option value="${p}">${t(`papel_servicos_${p}`)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" data-campo="usr-equip" id="usr-equip-grupo">
              <label for="usr-equip">${t('modEquipamentos')}</label>
              <select id="usr-equip">
                <option value="">${t('papelNenhum')}</option>
                ${PAPEIS_EQUIP.map(p => `<option value="${p}">${t(`papel_equipamentos_${p}`)}</option>`).join('')}
              </select>
            </div>
            <p class="cfg-perfil-desc col-span-2" id="usr-modulos-desc">${t('cfgModulosDica')}</p>
            <div class="form-group col-span-2" data-campo="usr-prestadora" id="usr-prestadora-grupo" hidden>
              <label for="usr-prestadora">${t('svPrestadora')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <select id="usr-prestadora"></select>
              <label class="emp-opcao-check usr-prestador-admin">
                <input type="checkbox" id="usr-prestador-admin"> <span>${t('cfgContaDaPrestadora')}</span>
              </label>
              <span class="form-hint">${t('cfgContaDaPrestadoraDica')}</span>
            </div>
            <div class="form-group col-span-2" data-campo="usr-empresas">
              <div class="cfg-rotulo-linha">
                <span class="cfg-rotulo-campo" id="usr-empresas-rotulo">${t('cfgColEmpresas')} <span class="cfg-req" aria-hidden="true">*</span></span>
                <button type="button" class="cfg-link" id="usr-empresas-todas">${t('cfgSelecionarTodas')}</button>
              </div>
              <div class="cfg-checklist" id="usr-empresas-checks" role="group" aria-labelledby="usr-empresas-rotulo"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-danger cfg-acao-esquerda" id="cancelar-convite" hidden>${t('cfgCancelarConvite')}</button>
          <button class="btn-secondary" id="cancel-modal-usuario">${t('btnCancelar')}</button>
          <button class="btn-primary" id="salvar-usuario">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>
  `

  initTopbarEvents(true)
  atualizarLateral({ ativo: 'usuarios' })
  revelarItemLateral()
  renderNotificacoes()
  _bindEvents()
  await _carregar()
}

// Convites pendentes que a pessoa pode ver: o supremo vê todos; o gestor, os
// das empresas dele (as regras exigem esse filtro). A demo não tem convites.
async function _carregarConvites() {
  if (sessao.isDemo) return []
  const ref = collection(db, 'convites')
  const empresas = empresasDoUsuario(sessao.usuario || {})
  if (!_souSupremo() && !empresas.length) return []
  const consultaConvites = _souSupremo()
    ? ref
    : query(ref, where('empresas', 'array-contains-any', empresas.slice(0, 30)))
  try {
    const snap = await getDocs(consultaConvites)
    return snap.docs.map(d => ({ id: `convite:${d.id}`, convite: true, ...d.data() }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  } catch (err) {
    // Sem permissão (regras antigas publicadas, por exemplo): a lista de usuários segue sem eles
    console.warn('Convites não carregados:', err.message)
    return []
  }
}

async function _carregar() {
  try {
    const [usrSnap, empSnap, convites, fornSnap] = await Promise.all([
      getDocs(consultaUsuarios(sessao.usuario)),
      getDocs(consulta(collection(db, 'empresas'))),
      _carregarConvites(),
      getDocs(consulta(collection(db, 'fornecedores'))).catch(() => ({ docs: [] })),
    ])
    _prestadoras = fornSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nomeExibicao || a.nome || '').localeCompare(b.nomeExibicao || b.nome || '', 'pt-BR'))
    _convites = convites
    _usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Na demo, a conta de login não aparece: quem está na tela são as pessoas da demonstração
      .filter(u => !(sessao.isDemo && u.email === 'demo@praxis.app'))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    _empresas = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  } catch (err) {
    console.error(err)
    _usuarios = []
    _convites = []
    _empresas = []
    prxToast(t('erroCarregar'), 'error')
  }
  // A tela pode ter sido trocada enquanto os dados chegavam
  if (!document.getElementById('tbody-usuarios')) return
  const contagens = { usuarios: _usuarios.length, 'cad-empresas': _empresas.length }
  atualizarLateral({ ativo: 'usuarios', contagens })
  completarContagensLateral(contagens)
  _renderTabela()
  _preencherCheckboxesEmpresas()
}

function _filtrados() {
  let lista = [..._usuarios, ..._convites]
  if (_filtroStatus === 'ativos')   lista = _usuarios.filter(_ativo)
  if (_filtroStatus === 'inativos') lista = _usuarios.filter(u => !_ativo(u))
  if (_filtroStatus === 'convites') lista = _convites
  if (_termoBusca) {
    const q = normalizarTexto(_termoBusca)
    lista = lista.filter(u => normalizarTexto(u.nome || '').includes(q) || normalizarTexto(u.email || '').includes(q))
  }
  return lista
}

function _atualizarContagens() {
  const ativos   = _usuarios.filter(_ativo).length
  const inativos = _usuarios.length - ativos
  const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n }
  set('usr-n-todos', _usuarios.length + _convites.length)
  set('usr-n-ativos', ativos)
  set('usr-n-inativos', inativos)
  set('usr-n-convites', _convites.length)
  // O filtro de convites só aparece quando há algum
  const chipConvites = document.querySelector('#usr-filtros [data-s="convites"]')
  if (chipConvites) chipConvites.hidden = !_convites.length

  // "7 usuários, todos ativos, 1 convite pendente. O perfil define o que cada um pode fazer."
  const resumo = document.getElementById('usr-resumo')
  if (resumo) {
    let numeros = plural(_usuarios.length, 'cfgUsuarioSing', 'cfgUsuarioPlur')
    if (inativos) numeros += `, ${plural(inativos, 'cfgInativoSing', 'cfgInativoPlur')}`
    else if (_usuarios.length > 1) numeros += `, ${t('cfgTodosAtivos')}`
    if (_convites.length) numeros += `, ${plural(_convites.length, 'cfgConviteSing', 'cfgConvitePlur')}`
    resumo.innerHTML = `<span class="cfg-resumo-num">${numeros}.</span> ${t('cfgUsuariosDesc')}`
  }
}

// Empresas do usuário em texto: "Todas as empresas", "Nexara Tecnologia" ou "Nexara Tecnologia +1"
function _celEmpresas(u) {
  const ids = empresasDoUsuario(u)
  if (!ids.length) return `<span class="cfg-mudo">${t('cfgNenhuma')}</span>`
  const todas = _empresas.map(e => e.id)
  if (todas.length > 1 && todas.every(id => ids.includes(id))) {
    return `<span class="usr-emp">${t('cfgTodasEmpresasTxt')}</span>`
  }
  const nomes = ids.map(id => _empresas.find(e => e.id === id)?.nome).filter(Boolean)
  if (!nomes.length) return `<span class="cfg-mudo">${t('cfgNenhuma')}</span>`
  const resto = nomes.length - 1
  return `<span class="usr-emp" title="${esc(nomes.join(', '))}"><span class="usr-emp-nome">${esc(nomes[0])}</span>${resto > 0 ? `<span class="cfg-mudo usr-emp-mais">+${resto}</span>` : ''}</span>`
}

// Último acesso: a data, "Agora" para a sessão atual, ou "Nunca"
function _celAcesso(u, eu) {
  if (u.id === eu) return `<span class="usr-acesso-agora">${t('cfgAgora')}</span>`
  const d = u.ultimoAcesso ? dataAcesso(u.ultimoAcesso) : null
  if (d) return `<span title="${esc(d.completo)}">${esc(d.rotulo)}</span>`
  return `<span class="cfg-mudo" title="${t('cfgSemAcessoDica')}">${t('cfgNunca')}</span>`
}

function _renderTabela() {
  const tbody = document.getElementById('tbody-usuarios')
  if (!tbody) return
  // O último convite foi cancelado com o filtro de convites ligado
  if (_filtroStatus === 'convites' && !_convites.length) { _definirFiltro('todos'); return }
  _atualizarContagens()
  const lista = _filtrados()

  if (!lista.length) {
    if (_termoBusca) {
      tbody.innerHTML = linhaVazia(COLUNAS, {
        titulo: t('cfgSemResultadoTitulo'),
        texto: esc(tf('cfgSemResultadoBusca', { q: _termoBusca.trim() })),
        acao: `<button class="btn-secondary btn-sm" data-acao-vazio="limpar">${t('cfgLimparBusca')}</button>`,
      })
    } else if (_filtroStatus === 'inativos') {
      tbody.innerHTML = linhaVazia(COLUNAS, {
        titulo: t('cfgSemInativosTitulo'), texto: t('cfgSemInativosSub'),
        acao: `<button class="btn-secondary btn-sm" data-acao-vazio="todos">${t('cfgVerTodos')}</button>`,
      })
    } else {
      tbody.innerHTML = linhaVazia(COLUNAS, {
        titulo: t('cfgSemUsuariosTitulo'), texto: t('cfgSemUsuariosSub'),
        acao: `<button class="btn-secondary btn-sm" data-acao-vazio="novo">${ICO.mais(13)}${t('btnNovoUsuario')}</button>`,
      })
    }
    return
  }

  const eu = _meuId()
  tbody.innerHTML = linhasComMais(tbody, lista, COLUNAS, u => _linha(u, eu), _renderTabela)
}

// Uma linha da tabela: usuário ou convite pendente (que mostra o prazo no
// lugar do último acesso)
function _linha(u, eu) {
  const convite = !!u.convite
  const vencido = convite && _vencido(u)
  const ativo   = convite || _ativo(u)
  const nome    = esc(u.nome || u.email || '—')
  let marca = ''
  if (convite) marca = `<span class="cfg-marca${vencido ? ' cfg-marca-inativo' : ''}">${t(vencido ? 'cfgConviteExpirado' : 'cfgConvitePendente')}</span>`
  else if (u.id === eu) marca = `<span class="cfg-marca">${t('cfgVoce')}</span>`
  else if (!ativo) marca = `<span class="cfg-marca cfg-marca-inativo">${t('cfgInativo')}</span>`
  const acesso = !convite
    ? _celAcesso(u, eu)
    : vencido
      ? `<span class="cfg-mudo">${esc(tf('cfgConviteExpirouEm', { data: dataAbsoluta(u.expiraEm) }))}</span>`
      : `<span>${esc(tf('cfgConviteAte', { data: dataAbsoluta(u.expiraEm) }))}</span>`
  return `
      <tr data-uid="${esc(u.id)}" tabindex="0" class="${ativo && !vencido ? '' : 'cfg-linha-inativa'}">
        <td class="c-usuario">
          <div class="usr-cel">
            <span class="avatar avatar-md usr-avatar" aria-hidden="true">${esc(iniciais(u.nome || u.email))}</span>
            <div class="usr-id">
              <div class="usr-nome"><span class="usr-nome-txt">${nome}</span>${marca}</div>
              <div class="usr-email">${esc(eAcessoSemEmail(u.email) ? tf('cfgLoginMostrar', { login: loginDoEmail(u.email) }) : (u.email || ''))}</div>
            </div>
          </div>
        </td>
        <td class="c-perfil">${perfilHtml(u.perfil)}${_modulosHtml(u)}</td>
        <td class="c-empresas" data-rotulo="${t('cfgColEmpresas')}">${_celEmpresas(u)}</td>
        <td class="c-acesso" data-rotulo="${convite ? '' : t('cfgColUltimoAcesso')}">${acesso}</td>
        <td class="c-acoes">
          <button class="btn-icon cfg-btn-editar btn-editar-usr" data-uid="${esc(u.id)}" aria-label="${esc(tf('cfgEditarX', { nome: u.nome || '' }))}" data-tooltip="${t('editarLabel')}">${ICO.editar()}</button>
        </td>
      </tr>`
}

// Os papéis em Serviços e Equipamentos, embaixo do perfil (o do prestador
// mostra a prestadora)
function _modulosHtml(u) {
  if (u.perfil === PERFIL_PRESTADOR) {
    const f = _prestadoras.find(x => x.id === u.fornecedorId)
    return `<span class="usr-modulos">${esc(f?.nomeExibicao || f?.nome || '')}${u.prestadorAdmin ? ` · ${t('cfgContaDaPrestadoraCurto')}` : ''}</span>`
  }
  const partes = []
  if (u.servicos) partes.push(`${t('modServicos')}: ${t(`papel_servicos_${u.servicos}`)}`)
  if (u.equipamentos) partes.push(`${t('modEquipamentos')}: ${t(`papel_equipamentos_${u.equipamentos}`)}`)
  return partes.length ? `<span class="usr-modulos">${esc(partes.join(' · '))}</span>` : ''
}

function _acharLinha(id) {
  return _usuarios.find(x => x.id === id) || _convites.find(x => x.id === id)
}

function _abrirLinha(id) {
  const u = _acharLinha(id)
  if (!u) return
  if (u.convite) _abrirModalConvite(u)
  else _abrirModalEdicao(u)
}

function _preencherCheckboxesEmpresas() {
  const wrap = document.getElementById('usr-empresas-checks')
  if (!wrap) return
  wrap.innerHTML = _empresas.map(e => `
    <label class="cfg-check">
      <input type="checkbox" class="emp-check" value="${esc(e.id)}">
      <span class="cfg-check-nome">${esc(e.nome)}</span>
      ${e.ativa === false ? `<span class="cfg-check-estado">${t('cfgInativa')}</span>` : ''}
      <span class="cfg-check-meta">${esc(formatCNPJ(e.cnpj) || '')}</span>
    </label>
  `).join('')
}

function _opcoesPerfil(perfilAtual = '') {
  const sel = document.getElementById('usr-perfil')
  if (!sel) return
  // Gestor não promove ninguém a Supremo; o Supremo existente continua listado para leitura
  const perfis = Object.values(PERFIS).filter(p => _souSupremo() || p !== PERFIS.SUPREMO || p === perfilAtual)
  sel.innerHTML = `<option value="">${t('selecionar')}</option>` +
    perfis.map(p => `<option value="${p}">${PERFIS_LABEL[p]}</option>`).join('') +
    `<option value="${PERFIL_NENHUM}">${PERFIS_LABEL[PERFIL_NENHUM]}</option>` +
    `<option value="${PERFIL_PRESTADOR}">${PERFIS_LABEL[PERFIL_PRESTADOR]}</option>`
  sel.value = perfilAtual
  const forn = document.getElementById('usr-prestadora')
  if (forn) forn.innerHTML = `<option value="">${t('selecionar')}</option>` +
    _prestadoras.map(f => `<option value="${esc(f.id)}">${esc(f.nomeExibicao || f.nome || f.id)}</option>`).join('')
  _descreverPerfil()
}

// Descrição do perfil escolhido
function _descreverPerfil() {
  const p   = document.getElementById('usr-perfil')?.value
  const el  = document.getElementById('usr-perfil-desc')
  if (!el) return
  el.hidden = !p
  el.textContent = p ? t(`perfilDesc_${p}`) : ''
  // O prestador (de fora) só tem Serviços, na prestadora dele
  const prest = p === PERFIL_PRESTADOR
  for (const id of ['usr-servicos-grupo', 'usr-equip-grupo', 'usr-modulos-desc']) document.getElementById(id).hidden = prest
  document.getElementById('usr-prestadora-grupo').hidden = !prest
}
function _preencherModulos(u = {}) {
  document.getElementById('usr-servicos').value = u.perfil === PERFIL_PRESTADOR ? '' : (papelServicos({ ...u, perfil: u.perfil === 'supremo' ? 'gestor' : u.perfil }) || '')
  document.getElementById('usr-equip').value = u.perfil === PERFIL_PRESTADOR ? '' : (papelEquip({ ...u, perfil: u.perfil === 'supremo' ? 'gestor' : u.perfil }) || '')
  document.getElementById('usr-prestadora').value = u.fornecedorId || ''
  document.getElementById('usr-prestador-admin').checked = u.prestadorAdmin === true
}
// Os campos dos módulos para gravar (js/modulos.js; firestore.rules: usuarioValido)
function _camposDosModulos(perfil) {
  const prest = perfil === PERFIL_PRESTADOR
  return {
    servicos: prest ? null : (document.getElementById('usr-servicos').value || null),
    equipamentos: prest ? null : (document.getElementById('usr-equip').value || null),
    fornecedorId: prest ? (document.getElementById('usr-prestadora').value || null) : null,
    prestadorAdmin: prest && document.getElementById('usr-prestador-admin').checked,
  }
}

function _atualizarBotaoTodas() {
  const checks = [...document.querySelectorAll('.emp-check')]
  const todas  = checks.length && checks.every(c => c.checked)
  const btn    = document.getElementById('usr-empresas-todas')
  if (btn) btn.textContent = todas ? t('cfgLimparSelecao') : t('cfgSelecionarTodas')
}

function _travarFormulario(travar) {
  const modal = document.getElementById('modal-usuario')
  modal.querySelectorAll('#usr-nome, #usr-perfil, #usr-servicos, #usr-equip, #usr-prestadora, #usr-prestador-admin, .emp-check').forEach(el => { el.disabled = travar })
  const wrap = document.getElementById('usr-ativo-wrap')
  wrap.setAttribute('aria-disabled', String(travar))
  wrap.tabIndex = travar ? -1 : 0
  document.getElementById('usr-empresas-todas').hidden = travar
  document.getElementById('salvar-usuario').hidden = travar
  // Sem nada para salvar, o outro botão só fecha
  document.getElementById('cancel-modal-usuario').textContent = travar ? t('fechar') : t('btnCancelar')
  document.getElementById('usr-aviso-supremo').hidden = !travar
}

function _definirAtivo(on) {
  definirInterruptor(document.getElementById('usr-ativo-wrap'), on)
  const lbl = document.getElementById('usr-ativo-label')
  if (lbl) lbl.textContent = on ? t('cfgAtivo') : t('cfgInativo')
}

// Ajustes do modal que mudam com o modo: título, dica do e-mail, interruptor
// de acesso (só para quem já é usuário), botão de cancelar convite e rótulo
// do botão principal
function _prepararModal(modo, { titulo, sub = '', dica = '' }) {
  _modo = modo
  limparErros(document.getElementById('modal-usuario'))
  document.getElementById('modal-usuario-titulo').textContent = titulo
  const elSub = document.getElementById('modal-usuario-sub')
  elSub.textContent = sub
  elSub.hidden = !sub
  const elDica = document.getElementById('usr-email-dica')
  elDica.textContent = dica
  elDica.hidden = !dica
  document.getElementById('usr-ativo-grupo').hidden = modo !== 'editar'
  document.getElementById('cancelar-convite').hidden = modo !== 'convite'
  document.getElementById('salvar-usuario').textContent = modo === 'novo' ? t('cfgCriarConvite') : t('salvarLabel')
  // A3: a opção de acesso sem e-mail só ao criar alguém
  document.getElementById('usr-sem-email-linha').hidden = modo !== 'novo'
  _semEmail(false)
}

// Sem e-mail: o campo vira o login (joao.oficina) e a senha inicial é gerada
function _semEmail(on) {
  const caixa = document.getElementById('usr-sem-email')
  if (caixa) caixa.checked = on
  const campo = document.getElementById('usr-email')
  const rotulo = document.getElementById('usr-email-rotulo')
  if (!campo || !rotulo) return
  campo.type = on ? 'text' : 'email'
  campo.placeholder = on ? t('cfgLoginPlaceholder') : t('cfgEmailPlaceholder')
  campo.autocapitalize = on ? 'none' : ''
  rotulo.firstChild.textContent = `${on ? t('cfgLogin') : t('cfgEmail')} `
  const dica = document.getElementById('usr-email-dica')
  if (_modo === 'novo' && dica) { dica.textContent = on ? t('cfgLoginDica') : t('cfgConviteDica'); dica.hidden = false }
  if (_modo === 'novo') document.getElementById('salvar-usuario').textContent = on ? t('cfgCriarAcesso') : t('cfgCriarConvite')
  limparErro('usr-email')
}

function _abrirModalNovo() {
  _conviteAtual = null
  _prepararModal('novo', { titulo: t('novoUsuarioTitulo'), dica: t('cfgConviteDica') })
  document.getElementById('usr-id').value = ''
  document.getElementById('usr-nome').value = ''
  const email = document.getElementById('usr-email')
  email.value = ''
  email.disabled = false
  _opcoesPerfil('')
  _preencherModulos({})
  _definirAtivo(true)
  // Com uma empresa só, ela já vem marcada
  document.querySelectorAll('.emp-check').forEach(c => { c.checked = _empresas.length === 1 })
  _travarFormulario(false)
  _atualizarBotaoTodas()
  abrirModal('modal-usuario')
}

function _abrirModalEdicao(u) {
  _conviteAtual = null
  _prepararModal('editar', { titulo: t('editarUsuarioTitulo'), sub: u.nome || '', dica: t('cfgEmailFixo') })
  document.getElementById('usr-id').value = u.id
  document.getElementById('usr-nome').value = u.nome || ''
  const email = document.getElementById('usr-email')
  email.value = eAcessoSemEmail(u.email) ? loginDoEmail(u.email) : (u.email || '')
  email.disabled = true
  _opcoesPerfil(u.perfil || '')
  _preencherModulos(u)
  _definirAtivo(_ativo(u))
  const ids = empresasDoUsuario(u)
  document.querySelectorAll('.emp-check').forEach(c => { c.checked = ids.includes(c.value) })
  _travarFormulario(u.perfil === PERFIS.SUPREMO && !_souSupremo())
  _atualizarBotaoTodas()
  abrirModal('modal-usuario')
}

// Convite pendente: dá para ajustar nome, perfil e empresas (o prazo recomeça)
// ou cancelar
function _abrirModalConvite(c) {
  _conviteAtual = c
  _prepararModal('convite', { titulo: t('cfgConviteTitulo'), sub: c.email || '', dica: t('cfgConviteDica') })
  document.getElementById('usr-id').value = ''
  document.getElementById('usr-nome').value = c.nome || ''
  const email = document.getElementById('usr-email')
  email.value = c.email || ''
  email.disabled = true
  _opcoesPerfil(c.perfil || '')
  _preencherModulos(c)
  _definirAtivo(true)
  const ids = empresasDoUsuario(c)
  document.querySelectorAll('.emp-check').forEach(ch => { ch.checked = ids.includes(ch.value) })
  _travarFormulario(false)
  _atualizarBotaoTodas()
  abrirModal('modal-usuario')
}

async function _cancelarConvite() {
  const c = _conviteAtual
  if (!c) return
  const ok = await prxConfirm(t('cfgCancelarConviteTitulo'), tf('cfgCancelarConviteMsg', { email: c.email }),
    t('cfgCancelarConvite'), t('cfgManterConvite'), true)
  if (!ok) return
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
  mostrarSpinner()
  try {
    await gravarAuditado({ colecao: 'convites', id: _emailNorm(c.email), tipo: 'apagar', antes: c, nome: c.email,
      empresaIds: c.empresas || [] })
    prxToast(t('conviteCancelado'), 'success')
    fecharModal('modal-usuario')
    await _carregar()
  } catch (err) {
    prxToast(t('erroSalvar'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

function _bindEvents() {
  document.getElementById('btn-novo-usuario')?.addEventListener('click', _abrirModalNovo)
  document.getElementById('close-modal-usuario')?.addEventListener('click', () => fecharModal('modal-usuario'))
  document.getElementById('cancel-modal-usuario')?.addEventListener('click', () => fecharModal('modal-usuario'))

  ligarInterruptor(document.getElementById('usr-ativo-wrap'), on => {
    const lbl = document.getElementById('usr-ativo-label')
    if (lbl) lbl.textContent = on ? t('cfgAtivo') : t('cfgInativo')
    limparErro('usr-ativo')
  })

  document.getElementById('usr-filtros')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-s]')
    if (!btn) return
    _definirFiltro(btn.dataset.s)
  })

  const busca = document.getElementById('busca-usuario')
  busca?.addEventListener('input', debounce(e => { _termoBusca = e.target.value; _renderTabela() }, 200))

  const tbody = document.getElementById('tbody-usuarios')
  // Linha inteira abre a edição (clique ou Enter); estados vazios têm as próprias ações
  tbody?.addEventListener('click', e => {
    const acao = e.target.closest('[data-acao-vazio]')?.dataset.acaoVazio
    if (acao === 'limpar') { busca.value = ''; _termoBusca = ''; _renderTabela(); busca.focus(); return }
    if (acao === 'todos')  { _definirFiltro('todos'); return }
    if (acao === 'novo')   { _abrirModalNovo(); return }
    const tr = e.target.closest('tr[data-uid]')
    if (tr) _abrirLinha(tr.dataset.uid)
  })
  tbody?.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'TR') return
    _abrirLinha(e.target.dataset.uid)
  })
  document.getElementById('cancelar-convite')?.addEventListener('click', _cancelarConvite)

  document.getElementById('usr-perfil')?.addEventListener('change', () => { _descreverPerfil(); limparErro('usr-perfil'); limparErro('usr-prestadora') })
  document.getElementById('usr-prestadora')?.addEventListener('change', () => limparErro('usr-prestadora'))
  document.getElementById('usr-nome')?.addEventListener('input', () => limparErro('usr-nome'))
  document.getElementById('usr-email')?.addEventListener('input', () => limparErro('usr-email'))
  document.getElementById('usr-empresas-checks')?.addEventListener('change', () => { limparErro('usr-empresas'); _atualizarBotaoTodas() })
  document.getElementById('usr-empresas-todas')?.addEventListener('click', () => {
    const checks = [...document.querySelectorAll('.emp-check')]
    const marcar = !checks.every(c => c.checked)
    checks.forEach(c => { c.checked = marcar })
    limparErro('usr-empresas')
    _atualizarBotaoTodas()
  })

  document.getElementById('salvar-usuario')?.addEventListener('click', _salvarUsuario)
  document.getElementById('usr-sem-email')?.addEventListener('change', e => _semEmail(e.target.checked))
  document.getElementById('modal-usuario')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('#usr-nome, #usr-email')) { e.preventDefault(); _salvarUsuario() }
  })
}

function _definirFiltro(s) {
  _filtroStatus = s
  document.querySelectorAll('#usr-filtros [data-s]').forEach(p => {
    const on = p.dataset.s === s
    p.classList.toggle('active', on)
    p.setAttribute('aria-pressed', String(on))
  })
  _renderTabela()
}

async function _salvarUsuario() {
  const modal    = document.getElementById('modal-usuario')
  const id       = document.getElementById('usr-id').value
  const nome     = document.getElementById('usr-nome').value.trim()
  const email    = document.getElementById('usr-email').value.trim()
  const perfil   = document.getElementById('usr-perfil').value
  const ativo    = document.getElementById('usr-ativo-wrap').getAttribute('aria-checked') === 'true'
  const empresas = [...document.querySelectorAll('.emp-check:checked')].map(c => c.value)

  const semEmail  = _modo === 'novo' && !!document.getElementById('usr-sem-email')?.checked
  const login     = semEmail ? normalizarLogin(email) : ''
  const emailNorm = semEmail ? emailDoLogin(login) : _emailNorm(email)
  const editando  = _modo === 'editar'

  limparErros(modal)
  if (!nome)                        marcarErro('usr-nome', t('nomeObrigatorio'))
  if (!email)                       marcarErro('usr-email', t(semEmail ? 'cfgLoginObrigatorio' : 'emailObrigatorio'))
  else if (semEmail && !loginValido(login)) marcarErro('usr-email', t('cfgLoginInvalido'))
  else if (!semEmail && _modo === 'novo' && !validarEmail(email)) marcarErro('usr-email', t('emailInvalido'))
  else if (_modo === 'novo' && _usuarios.some(u => _emailNorm(u.email) === emailNorm)) marcarErro('usr-email', t('cfgEmailJaUsado'))
  if (!perfil)                      marcarErro('usr-perfil', t('perfilObrigatorio'))
  const modulos = _camposDosModulos(perfil)
  if (perfil === PERFIL_PRESTADOR && !modulos.fornecedorId) marcarErro('usr-prestadora', t('cfgPrestadoraObrigatoria'))
  if (perfil === PERFIL_NENHUM && !modulos.servicos && !modulos.equipamentos) marcarErro('usr-perfil', t('cfgSemModulo'))
  if (!empresas.length)             marcarErro('usr-empresas', t('empresaObrigatoria'))
  if (editando && id === _meuId() && !ativo) marcarErro('usr-ativo', t('cfgNaoDesativarVoce'))
  if (modal.querySelector('[data-campo].invalido')) { focarPrimeiroErro(modal); return }

  // Confirmação ao desativar usuário existente
  if (editando && !ativo) {
    const original = _usuarios.find(u => u.id === id)
    if (original && _ativo(original)) {
      const ok = await prxConfirm(t('cfgDesativarTitulo'), tf('cfgDesativarMsg', { nome }), t('cfgDesativar'), t('btnCancelar'), true)
      if (!ok) return
    }
  }

  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }

  mostrarSpinner()
  try {
    if (editando) {
      const original = _usuarios.find(u => u.id === id)
      await gravarAuditado({ colecao: 'usuarios', id, tipo: 'editar', antes: original, nome,
        dados: { nome, perfil, ativo, empresas, ...modulos, atualizadoEm: serverTimestamp() },
        empresaIds: [...empresasDoUsuario(original || {}), ...empresas] })
      prxToast(t('usuarioAtualizado'), 'success')
    } else if (semEmail) {
      // A3: a conta de login (numa instância à parte, sem derrubar a sessão de
      // quem cria) e o perfil, com a senha inicial a trocar no primeiro acesso
      const senha = senhaInicial()
      const uid = await criarContaDeLogin(emailNorm, senha)
      await gravarAuditado({ colecao: 'usuarios', id: uid, tipo: 'criar', nome, empresaIds: empresas,
        dados: {
          nome, email: emailNorm, login, perfil, empresas, ...modulos, ativo: true, trocarSenha: true,
          criadoPor: _meuId(), criadoEm: serverTimestamp(), ultimoAcesso: null,
        } })
      esconderSpinner()
      fecharModal('modal-usuario')
      await prxAlert(t('cfgAcessoCriadoTitulo'), tf('cfgAcessoCriadoMsg', { nome, login, senha }))
      await _carregar()
      return
    } else {
      // Pessoa nova entra por convite, guardado pelo e-mail; o perfil nasce no
      // primeiro acesso, com o UID da conta de login (js/auth.js)
      const anterior = _convites.find(c => _emailNorm(c.email) === emailNorm)
      const jaConvidado = !!anterior
      await gravarAuditado({ colecao: 'convites', id: emailNorm, tipo: jaConvidado ? 'editar' : 'criar', sobrescrever: true,
        antes: anterior || null, nome: emailNorm, empresaIds: [...(anterior?.empresas || []), ...empresas],
        dados: {
          email: emailNorm, nome, perfil, empresas, ...modulos, ativo: true,
          criadoPor: _meuId(), criadoPorNome: sessao.usuario?.nome || '',
          criadoEm: serverTimestamp(),
          expiraEm: Timestamp.fromDate(new Date(Date.now() + PRAZO_CONVITE_DIAS * 864e5)),
        } })
      prxToast(jaConvidado ? t('conviteAtualizado') : tf('conviteCriado', { email: emailNorm }), 'info', 8000)
    }
    fecharModal('modal-usuario')
    await _carregar()
  } catch (err) {
    // O login já existe na conta de login (outra pessoa usa o mesmo)
    if (err?.code === 'auth/email-already-in-use') marcarErro('usr-email', t('cfgLoginEmUso'))
    else prxToast(t('erroSalvar'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}
