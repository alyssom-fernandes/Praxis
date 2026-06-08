import {
  db, collection, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { CATEGORIAS_PADRAO } from './constants.js'
import { formatCNPJ, debounce } from './utils.js'

let _empresas     = []
let _categorias   = []
let _fornecedores = []
let _abaAtiva     = 'empresas'

export async function renderConfigGeral() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-geral', true)}
      <div class="main-content">
        <div class="config-layout">

          <!-- Nav lateral -->
          <nav class="config-nav">
            <button class="config-nav-item" onclick="window.__navegar('config-usuarios')">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Usuários
            </button>
            <button class="config-nav-item active" onclick="window.__navegar('config-geral')">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Geral
            </button>
          </nav>

          <!-- Conteúdo -->
          <div>
            <!-- Abas internas -->
            <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--line);padding-bottom:0.75rem">
              <button class="pill active" data-aba="empresas" id="aba-empresas">Empresas</button>
              <button class="pill" data-aba="categorias" id="aba-categorias">Categorias</button>
              <button class="pill" data-aba="fornecedores" id="aba-fornecedores">Fornecedores</button>
            </div>

            <!-- Painel Empresas -->
            <div id="painel-empresas">
              <div class="config-section-header">
                <h2>Empresas</h2>
                <button class="btn-primary btn-sm" id="btn-nova-empresa">
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Nova empresa
                </button>
              </div>
              <div class="empresas-grid" id="grid-empresas">
                <div style="color:var(--text3);font-size:0.875rem">Carregando…</div>
              </div>
            </div>

            <!-- Painel Categorias -->
            <div id="painel-categorias" style="display:none">
              <div class="config-section-header">
                <h2>Categorias</h2>
                <button class="btn-primary btn-sm" id="btn-nova-categoria">
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Nova categoria
                </button>
              </div>
              <div class="card no-hover" style="overflow:hidden">
                <div class="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th style="width:36px"></th>
                        <th>Nome</th>
                        <th>Tipo</th>
                        <th style="width:60px"></th>
                      </tr>
                    </thead>
                    <tbody id="tbody-categorias">
                      <tr><td colspan="4" style="text-align:center;color:var(--text3);padding:2rem">Carregando…</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Painel Fornecedores -->
            <div id="painel-fornecedores" style="display:none">
              <div class="config-section-header">
                <h2>Fornecedores</h2>
              </div>
              <div class="search-input-wrap" style="max-width:300px;margin-bottom:1rem">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input type="text" id="busca-forn" placeholder="Buscar fornecedor…">
              </div>
              <div class="card no-hover" style="overflow:hidden">
                <div class="table-wrapper">
                  <table>
                    <thead>
                      <tr><th>Nome</th><th>CNPJ</th><th>Usos</th><th style="width:60px"></th></tr>
                    </thead>
                    <tbody id="tbody-fornecedores">
                      <tr><td colspan="4" style="text-align:center;color:var(--text3);padding:2rem">Carregando…</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- Modal Empresa -->
    <div class="modal-overlay" id="modal-empresa">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2 id="modal-empresa-titulo">Nova empresa</h2>
          <button class="btn-icon" id="close-modal-empresa">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="emp-id">
          <div class="form-grid form-grid-1">
            <div class="form-group">
              <label for="emp-nome">Nome *</label>
              <input type="text" id="emp-nome" placeholder="Razão social ou nome fantasia" maxlength="100">
            </div>
            <div class="form-group">
              <label for="emp-cnpj">CNPJ</label>
              <input type="text" id="emp-cnpj" placeholder="00.000.000/0000-00" maxlength="18">
            </div>
            <div class="form-group">
              <label>Status</label>
              <div class="toggle-wrap" id="emp-ativa-wrap" style="margin-top:0.4rem">
                <div class="toggle on" id="emp-ativa-toggle"></div>
                <span class="toggle-label">Ativa</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-modal-empresa">Cancelar</button>
          <button class="btn-primary" id="salvar-empresa">Salvar</button>
        </div>
      </div>
    </div>

    <!-- Modal Categoria -->
    <div class="modal-overlay" id="modal-categoria">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2 id="modal-cat-titulo">Nova categoria</h2>
          <button class="btn-icon" id="close-modal-cat">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="cat-id">
          <div class="form-group" style="margin-bottom:1rem">
            <label for="cat-nome">Nome *</label>
            <input type="text" id="cat-nome" placeholder="Nome da categoria" maxlength="60">
          </div>
          <div class="form-group">
            <label for="cat-cor">Cor *</label>
            <div style="display:flex;align-items:center;gap:0.75rem">
              <input type="color" id="cat-cor" value="#C8A96E" style="width:44px;height:36px;padding:2px;border-radius:var(--radius-input);cursor:pointer">
              <span id="cat-cor-preview" style="font-size:0.85rem;color:var(--text3)">Selecione uma cor</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-modal-cat">Cancelar</button>
          <button class="btn-primary" id="salvar-categoria">Salvar</button>
        </div>
      </div>
    </div>
  `

  initTopbarEvents(true)
  renderNotificacoes()
  await _carregar()
  _bindEvents()
}

// ── Carregamento ──────────────────────────────────────────────
async function _carregar() {
  const [empSnap, catSnap, fornSnap] = await Promise.all([
    getDocs(collection(db, 'empresas')),
    getDocs(collection(db, 'categorias')),
    getDocs(collection(db, 'fornecedores')),
  ])
  _empresas     = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _categorias   = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _fornecedores = fornSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.usos||0) - (a.usos||0))

  // Seed categorias padrão se vazio
  if (!_categorias.length) await _seedCategorias()

  _renderEmpresas()
  _renderCategorias()
  _renderFornecedores()
}

async function _seedCategorias() {
  for (const cat of CATEGORIAS_PADRAO) {
    const ref = await addDoc(collection(db, 'categorias'), {
      nome: cat.nome, cor: cat.cor, tipo: 'padrao', criadaEm: serverTimestamp(),
    })
    _categorias.push({ id: ref.id, ...cat, tipo: 'padrao' })
  }
}

// ── Render Empresas ───────────────────────────────────────────
function _renderEmpresas() {
  const grid = document.getElementById('grid-empresas')
  if (!grid) return

  if (!_empresas.length) {
    grid.innerHTML = `<div class="empty-state"><p>Nenhuma empresa cadastrada.</p></div>`
    return
  }

  grid.innerHTML = _empresas.map(e => `
    <div class="card" style="cursor:pointer" data-emp-id="${e.id}">
      <div class="empresa-card-inner">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="empresa-icon">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <span class="badge ${e.ativa !== false ? 'badge-green' : 'badge-neutral'}">
            ${e.ativa !== false ? 'Ativa' : 'Inativa'}
          </span>
        </div>
        <div>
          <div class="empresa-nome">${e.nome}</div>
          <div class="empresa-cnpj">${formatCNPJ(e.cnpj) || 'CNPJ não informado'}</div>
        </div>
        <div class="empresa-counters">
          <button class="btn-secondary btn-sm" data-editar-emp="${e.id}" style="margin-top:0.25rem">Editar</button>
        </div>
      </div>
    </div>
  `).join('')

  document.querySelectorAll('[data-editar-emp]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const emp = _empresas.find(x => x.id === btn.dataset.editarEmp)
      if (emp) _abrirModalEmpresa(emp)
    })
  })
}

// ── Render Categorias ─────────────────────────────────────────
function _renderCategorias() {
  const tbody = document.getElementById('tbody-categorias')
  if (!tbody) return

  tbody.innerHTML = _categorias.map(c => `
    <tr>
      <td><span style="width:12px;height:12px;border-radius:50%;background:${c.cor};display:inline-block"></span></td>
      <td>${c.nome}</td>
      <td><span class="badge ${c.tipo === 'padrao' ? 'badge-neutral' : 'badge-blue'}">${c.tipo === 'padrao' ? 'Padrão' : 'Personalizada'}</span></td>
      <td>
        <button class="btn-icon btn-editar-cat" data-cat-id="${c.id}" title="Editar">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('')

  document.querySelectorAll('.btn-editar-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = _categorias.find(c => c.id === btn.dataset.catId)
      if (cat) _abrirModalCategoria(cat)
    })
  })
}

// ── Render Fornecedores ───────────────────────────────────────
function _renderFornecedores(filtro = '') {
  const tbody = document.getElementById('tbody-fornecedores')
  if (!tbody) return

  const lista = filtro
    ? _fornecedores.filter(f => (f.nomeOriginal||f.nome||'').toLowerCase().includes(filtro.toLowerCase()))
    : _fornecedores

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:2rem">Nenhum fornecedor cadastrado.</td></tr>`
    return
  }

  tbody.innerHTML = lista.map(f => `
    <tr>
      <td>${f.nomeOriginal || f.nome}</td>
      <td>${formatCNPJ(f.cnpj) || '—'}</td>
      <td>${f.usos || 0} pedido${f.usos !== 1 ? 's' : ''}</td>
      <td>
        <button class="btn-icon btn-editar-forn" data-forn-id="${f.id}" title="Editar">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('')

  document.querySelectorAll('.btn-editar-forn').forEach(btn => {
    btn.addEventListener('click', () => {
      const forn = _fornecedores.find(f => f.id === btn.dataset.fornId)
      if (forn) _editarFornecedor(forn)
    })
  })
}

// ── Modais Empresa ────────────────────────────────────────────
function _abrirModalEmpresa(emp = null) {
  document.getElementById('modal-empresa-titulo').textContent = emp ? 'Editar empresa' : 'Nova empresa'
  document.getElementById('emp-id').value   = emp?.id || ''
  document.getElementById('emp-nome').value = emp?.nome || ''
  document.getElementById('emp-cnpj').value = emp?.cnpj || ''
  document.getElementById('emp-ativa-toggle').classList.toggle('on', emp ? emp.ativa !== false : true)
  document.getElementById('modal-empresa').classList.add('visible')
}

// ── Modais Categoria ──────────────────────────────────────────
function _abrirModalCategoria(cat = null) {
  document.getElementById('modal-cat-titulo').textContent = cat ? 'Editar categoria' : 'Nova categoria'
  document.getElementById('cat-id').value   = cat?.id || ''
  document.getElementById('cat-nome').value = cat?.nome || ''
  document.getElementById('cat-cor').value  = cat?.cor || '#C8A96E'
  document.getElementById('cat-cor-preview').textContent = cat?.nome || ''
  document.getElementById('modal-categoria').classList.add('visible')
}

// ── Editar Fornecedor ─────────────────────────────────────────
async function _editarFornecedor(forn) {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay visible'
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px">
      <div class="modal-header">
        <h2>Editar fornecedor</h2>
        <button class="btn-icon" id="close-forn-modal">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-group" style="margin-bottom:1rem">
          <label for="forn-nome">Nome</label>
          <input type="text" id="forn-nome" value="${forn.nomeOriginal || forn.nome || ''}">
        </div>
        <div class="form-group">
          <label for="forn-cnpj">CNPJ</label>
          <input type="text" id="forn-cnpj" value="${forn.cnpj || ''}" placeholder="00.000.000/0000-00">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-forn-modal">Cancelar</button>
        <button class="btn-primary" id="salvar-forn-modal">Salvar</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('close-forn-modal')?.addEventListener('click', () => overlay.remove())
  document.getElementById('cancel-forn-modal')?.addEventListener('click', () => overlay.remove())
  document.getElementById('salvar-forn-modal')?.addEventListener('click', async () => {
    const nome = document.getElementById('forn-nome').value.trim()
    const cnpj = document.getElementById('forn-cnpj').value.trim()
    if (!nome) { prxToast('Nome obrigatório.', 'error'); return }
    mostrarSpinner()
    try {
      const { normalizarTexto } = await import('./utils.js')
      await updateDoc(doc(db, 'fornecedores', forn.id), {
        nome: normalizarTexto(nome), nomeOriginal: nome, cnpj,
      })
      overlay.remove()
      await _carregar()
      prxToast('Fornecedor atualizado!', 'success')
    } catch {
      prxToast('Erro ao salvar.', 'error')
    } finally {
      esconderSpinner()
    }
  })
}

// ── Bind de eventos ───────────────────────────────────────────
function _bindEvents() {
  // Abas
  document.querySelectorAll('[data-aba]').forEach(btn => {
    btn.addEventListener('click', () => {
      _abaAtiva = btn.dataset.aba
      document.querySelectorAll('[data-aba]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById('painel-empresas').style.display   = _abaAtiva === 'empresas'     ? 'block' : 'none'
      document.getElementById('painel-categorias').style.display  = _abaAtiva === 'categorias'   ? 'block' : 'none'
      document.getElementById('painel-fornecedores').style.display = _abaAtiva === 'fornecedores' ? 'block' : 'none'
    })
  })

  // Empresa
  document.getElementById('btn-nova-empresa')?.addEventListener('click', () => _abrirModalEmpresa())
  document.getElementById('close-modal-empresa')?.addEventListener('click', () => document.getElementById('modal-empresa').classList.remove('visible'))
  document.getElementById('cancel-modal-empresa')?.addEventListener('click', () => document.getElementById('modal-empresa').classList.remove('visible'))
  document.getElementById('emp-ativa-wrap')?.addEventListener('click', () => document.getElementById('emp-ativa-toggle')?.classList.toggle('on'))
  document.getElementById('salvar-empresa')?.addEventListener('click', _salvarEmpresa)

  // Categoria
  document.getElementById('btn-nova-categoria')?.addEventListener('click', () => _abrirModalCategoria())
  document.getElementById('close-modal-cat')?.addEventListener('click', () => document.getElementById('modal-categoria').classList.remove('visible'))
  document.getElementById('cancel-modal-cat')?.addEventListener('click', () => document.getElementById('modal-categoria').classList.remove('visible'))
  document.getElementById('cat-cor')?.addEventListener('input', e => {
    document.getElementById('cat-cor-preview').textContent = e.target.value
    document.getElementById('cat-cor-preview').style.color = e.target.value
  })
  document.getElementById('salvar-categoria')?.addEventListener('click', _salvarCategoria)

  // Busca fornecedores
  document.getElementById('busca-forn')?.addEventListener('input',
    debounce(e => _renderFornecedores(e.target.value), 250))
}

// ── Salvar Empresa ────────────────────────────────────────────
async function _salvarEmpresa() {
  const id    = document.getElementById('emp-id').value
  const nome  = document.getElementById('emp-nome').value.trim()
  const cnpj  = document.getElementById('emp-cnpj').value.trim()
  const ativa = document.getElementById('emp-ativa-toggle').classList.contains('on')

  if (!nome) { prxToast('Nome obrigatório.', 'error'); return }
  if (sessao.isDemo) { prxToast('Não é possível alterar no modo demo.', 'warning'); return }

  mostrarSpinner()
  try {
    if (id) {
      await updateDoc(doc(db, 'empresas', id), { nome, cnpj, ativa })
      prxToast('Empresa atualizada!', 'success')
    } else {
      await addDoc(collection(db, 'empresas'), { nome, cnpj, ativa: true, criadaEm: serverTimestamp() })
      prxToast('Empresa criada!', 'success')
    }
    document.getElementById('modal-empresa').classList.remove('visible')
    await _carregar()
  } catch {
    prxToast('Erro ao salvar empresa.', 'error')
  } finally {
    esconderSpinner()
  }
}

// ── Salvar Categoria ──────────────────────────────────────────
async function _salvarCategoria() {
  const id   = document.getElementById('cat-id').value
  const nome = document.getElementById('cat-nome').value.trim()
  const cor  = document.getElementById('cat-cor').value

  if (!nome) { prxToast('Nome obrigatório.', 'error'); return }
  if (sessao.isDemo) { prxToast('Não é possível alterar no modo demo.', 'warning'); return }

  mostrarSpinner()
  try {
    if (id) {
      const cat = _categorias.find(c => c.id === id)
      await updateDoc(doc(db, 'categorias', id), { nome, cor })
      prxToast('Categoria atualizada!', 'success')
    } else {
      await addDoc(collection(db, 'categorias'), {
        nome, cor, tipo: 'personalizada', criadaEm: serverTimestamp(),
      })
      prxToast('Categoria criada!', 'success')
    }
    document.getElementById('modal-categoria').classList.remove('visible')
    await _carregar()
  } catch {
    prxToast('Erro ao salvar categoria.', 'error')
  } finally {
    esconderSpinner()
  }
}
