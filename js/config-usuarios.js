import { db, collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { PERFIS, PERFIS_LABEL, PERFIS_COLOR } from './constants.js'
import { formatTimestamp, gerarIniciais, debounce } from './utils.js'

let _usuarios   = []
let _empresas   = []
let _filtroStatus = 'todos'
let _termoBusca   = ''

export async function renderConfigUsuarios() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-usuarios', true)}
      <div class="main-content">
        <div class="config-layout">
          <nav class="config-nav">
            <button class="config-nav-item active" data-nav="config-usuarios" onclick="window.__navegar('config-usuarios')">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              Usuários
            </button>
            <button class="config-nav-item" data-nav="config-geral" onclick="window.__navegar('config-geral')">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Geral
            </button>
          </nav>

          <div>
            <div class="config-section-header">
              <h2>Usuários</h2>
              <button class="btn-primary btn-sm" id="btn-novo-usuario">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Novo usuário
              </button>
            </div>

            <div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
              <div class="filter-pills" id="status-pills">
                <button class="pill active" data-s="todos">Todos</button>
                <button class="pill" data-s="ativos">Ativos</button>
                <button class="pill" data-s="inativos">Inativos</button>
              </div>
              <div class="search-input-wrap" style="width:200px;margin-left:auto">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="busca-usuario" placeholder="Buscar por nome…">
              </div>
            </div>

            <div class="card no-hover" style="overflow:hidden">
              <div class="table-wrapper">
                <table class="table-card-mobile" id="tabela-usuarios">
                  <thead>
                    <tr>
                      <th>Usuário</th><th>Perfil</th><th>Empresas</th>
                      <th>Último acesso</th><th>Status</th><th style="width:80px"></th>
                    </tr>
                  </thead>
                  <tbody id="tbody-usuarios">
                    <tr><td colspan="6" style="text-align:center;color:var(--text3);padding:2rem">Carregando…</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Usuário -->
    <div class="modal-overlay" id="modal-usuario">
      <div class="modal" style="max-width:540px">
        <div class="modal-header">
          <h2 id="modal-usuario-titulo">Novo usuário</h2>
          <button class="btn-icon" id="close-modal-usuario">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="usr-id">
          <div class="form-grid form-grid-2">
            <div class="form-group col-span-2">
              <label for="usr-nome">Nome *</label>
              <input type="text" id="usr-nome" placeholder="Nome completo" maxlength="80">
            </div>
            <div class="form-group col-span-2">
              <label for="usr-email">E-mail *</label>
              <input type="email" id="usr-email" placeholder="email@empresa.com">
            </div>
            <div class="form-group">
              <label for="usr-perfil">Perfil *</label>
              <select id="usr-perfil">
                <option value="">Selecionar…</option>
                ${Object.values(PERFIS).map(p => `<option value="${p}">${PERFIS_LABEL[p]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Status</label>
              <div class="toggle-wrap" id="usr-ativo-wrap" style="margin-top:0.4rem">
                <div class="toggle on" id="usr-ativo-toggle"></div>
                <span class="toggle-label">Ativo</span>
              </div>
            </div>
            <div class="form-group col-span-2">
              <label>Empresas vinculadas *</label>
              <div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.25rem" id="usr-empresas-checks"></div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-modal-usuario">Cancelar</button>
          <button class="btn-primary" id="salvar-usuario">Salvar</button>
        </div>
      </div>
    </div>
  `

  initTopbarEvents(true)
  renderNotificacoes()
  await _carregar()
  _bindEvents()
}

async function _carregar() {
  const [usrSnap, empSnap] = await Promise.all([
    getDocs(collection(db, 'usuarios')),
    getDocs(collection(db, 'empresas')),
  ])
  _usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _empresas = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _renderTabela()
  _preencherCheckboxesEmpresas()
}

function _filtrados() {
  let lista = [..._usuarios]
  if (_filtroStatus === 'ativos')   lista = lista.filter(u => u.ativo !== false)
  if (_filtroStatus === 'inativos') lista = lista.filter(u => u.ativo === false)
  if (_termoBusca) {
    const { normalizarTexto } = window.__praxisUtils || { normalizarTexto: s => s.toLowerCase() }
    const t = _termoBusca.toLowerCase()
    lista = lista.filter(u => (u.nome||'').toLowerCase().includes(t) || (u.email||'').toLowerCase().includes(t))
  }
  return lista
}

function _renderTabela() {
  const tbody = document.getElementById('tbody-usuarios')
  if (!tbody) return
  const lista = _filtrados()

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:2rem">Nenhum usuário encontrado.</td></tr>`
    return
  }

  tbody.innerHTML = lista.map(u => {
    const badgePerfil = `<span class="badge badge-${PERFIS_COLOR[u.perfil]||'neutral'}">${PERFIS_LABEL[u.perfil]||u.perfil}</span>`
    const _rawEmp = u.empresas || []
    const empIds  = Array.isArray(_rawEmp) ? _rawEmp : Object.keys(_rawEmp)
    const empTags = empIds.slice(0,3).map(eid => {
      const e = _empresas.find(x => x.id === eid)
      return `<span class="badge badge-neutral" style="font-size:0.68rem">${e?.nome || eid}</span>`
    }).join(' ')
    const dot = u.ativo !== false ? '<span class="dot dot-green"></span>' : '<span class="dot dot-gray"></span>'
    return `
      <tr data-uid="${u.id}">
        <td data-label="Usuário">
          <div style="display:flex;align-items:center;gap:0.625rem">
            <div class="avatar avatar-sm">${gerarIniciais(u.nome)}</div>
            <div>
              <div style="font-weight:600;font-size:0.875rem">${u.nome}</div>
              <div style="font-size:0.75rem;color:var(--text3)">${u.email}</div>
            </div>
          </div>
        </td>
        <td data-label="Perfil">${badgePerfil}</td>
        <td data-label="Empresas"><div style="display:flex;gap:0.25rem;flex-wrap:wrap">${empTags}</div></td>
        <td data-label="Último acesso">${formatTimestamp(u.ultimoAcesso) || '—'}</td>
        <td data-label="Status"><div style="display:flex;align-items:center;gap:0.4rem">${dot} ${u.ativo !== false ? 'Ativo' : 'Inativo'}</div></td>
        <td>
          <div style="display:flex;gap:0.25rem">
            <button class="btn-icon btn-editar-usr" data-uid="${u.id}" title="Editar">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `
  }).join('')

  // Bind edição
  document.querySelectorAll('.btn-editar-usr').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const u = _usuarios.find(x => x.id === btn.dataset.uid)
      if (u) _abrirModalEdicao(u)
    })
  })
}

function _preencherCheckboxesEmpresas() {
  const wrap = document.getElementById('usr-empresas-checks')
  if (!wrap) return
  wrap.innerHTML = _empresas.map(e => `
    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;font-weight:400;text-transform:none;cursor:pointer">
      <input type="checkbox" class="emp-check" value="${e.id}" style="width:16px;height:16px">
      ${e.nome}
    </label>
  `).join('')
}

function _abrirModalNovo() {
  document.getElementById('modal-usuario-titulo').textContent = 'Novo usuário'
  document.getElementById('usr-id').value = ''
  document.getElementById('usr-nome').value = ''
  document.getElementById('usr-email').value = ''
  document.getElementById('usr-email').disabled = false
  document.getElementById('usr-perfil').value = ''
  document.getElementById('usr-ativo-toggle').classList.add('on')
  document.querySelectorAll('.emp-check').forEach(c => c.checked = false)
  document.getElementById('modal-usuario').classList.add('visible')
}

function _abrirModalEdicao(u) {
  document.getElementById('modal-usuario-titulo').textContent = 'Editar usuário'
  document.getElementById('usr-id').value = u.id
  document.getElementById('usr-nome').value = u.nome || ''
  document.getElementById('usr-email').value = u.email || ''
  document.getElementById('usr-email').disabled = true
  document.getElementById('usr-perfil').value = u.perfil || ''
  const ativo = u.ativo !== false
  document.getElementById('usr-ativo-toggle').classList.toggle('on', ativo)
  document.querySelectorAll('.emp-check').forEach(c => {
    c.checked = (u.empresas || []).includes(c.value)
  })
  document.getElementById('modal-usuario').classList.add('visible')
}

function _bindEvents() {
  document.getElementById('btn-novo-usuario')?.addEventListener('click', _abrirModalNovo)

  document.getElementById('close-modal-usuario')?.addEventListener('click', () =>
    document.getElementById('modal-usuario').classList.remove('visible'))
  document.getElementById('cancel-modal-usuario')?.addEventListener('click', () =>
    document.getElementById('modal-usuario').classList.remove('visible'))

  document.getElementById('usr-ativo-wrap')?.addEventListener('click', () =>
    document.getElementById('usr-ativo-toggle')?.classList.toggle('on'))

  document.getElementById('status-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-s]')
    if (!btn) return
    document.querySelectorAll('#status-pills .pill').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    _filtroStatus = btn.dataset.s
    _renderTabela()
  })

  document.getElementById('busca-usuario')?.addEventListener('input',
    debounce(e => { _termoBusca = e.target.value; _renderTabela() }, 250))

  document.getElementById('salvar-usuario')?.addEventListener('click', _salvarUsuario)
}

async function _salvarUsuario() {
  const id      = document.getElementById('usr-id').value
  const nome    = document.getElementById('usr-nome').value.trim()
  const email   = document.getElementById('usr-email').value.trim()
  const perfil  = document.getElementById('usr-perfil').value
  const ativo   = document.getElementById('usr-ativo-toggle').classList.contains('on')
  const empresas = [...document.querySelectorAll('.emp-check:checked')].map(c => c.value)

  if (!nome || !email || !perfil || !empresas.length) {
    prxToast('Preencha todos os campos obrigatórios.', 'error'); return
  }

  // Validação demo
  if (sessao.isDemo) { prxToast('Não é possível alterar usuários no modo demo.', 'warning'); return }

  mostrarSpinner()
  try {
    if (id) {
      await updateDoc(doc(db, 'usuarios', id), { nome, perfil, ativo, empresas, atualizadoEm: serverTimestamp() })
      prxToast('Usuário atualizado!', 'success')
    } else {
      await addDoc(collection(db, 'usuarios'), { nome, email, perfil, ativo, empresas, criadoEm: serverTimestamp(), ultimoAcesso: null })
      prxToast('Usuário criado! Configure a senha no Firebase Authentication.', 'info', 5000)
    }
    document.getElementById('modal-usuario').classList.remove('visible')
    await _carregar()
  } catch (err) {
    prxToast('Erro ao salvar usuário.', 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}
