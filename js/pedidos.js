import { db, collection, query, where, orderBy, getDocs, onSnapshot, addDoc, serverTimestamp } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR,
  KANBAN_COLUNAS, CATEGORIAS_PADRAO, UNIDADES, t,
} from './constants.js'
import { formatCurrency, formatDate, gerarIniciais, hojeISO, debounce, normalizarTexto, parseMoeda } from './utils.js'

let _unsubPedidos = null
let _pedidos = []
let _categorias = []
let _empresas = []
let _usuarios = []
let _viewMode = 'kanban' // 'kanban' | 'lista'
const _LANE_LIMIT = 4
let _filtroAtivo = 'todos'
let _termoBusca = ''

// ── Render da tela ────────────────────────────────────────────
export async function renderPedidos() {
  const app = document.getElementById('app')

  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('pedidos')}
      <div class="main-content">
        <div class="pedidos-header">
          <div>
            <h1 class="pedidos-title">${t('titulo')}</h1>
          </div>
          <div class="pedidos-toolbar">
            <div class="filter-pills" id="filter-pills">
              <button class="pill active" data-filtro="todos">${t('todos')}</button>
              <button class="pill" data-filtro="urgentes">${t('urgentes')}</button>
              <button class="pill" data-filtro="meus">${t('meusPedidos')}</button>
              <button class="pill" data-filtro="semana">${t('estaSemana')}</button>
            </div>

            <div class="search-input-wrap" style="width:200px">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" id="busca-pedidos" placeholder="Buscar pedido…">
            </div>

            <div class="view-toggle" id="view-toggle">
              <button class="active" id="btn-kanban" title="Kanban">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              </button>
              <button id="btn-lista" title="Lista">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
            </div>

            <button class="btn-primary" id="btn-novo-pedido">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ${t('novoPedido')}
            </button>
          </div>
        </div>

        <div id="pedidos-view"></div>
      </div>
      ${renderFooter()}
    </div>

    <!-- Modal Novo Pedido -->
    <div class="modal-overlay" id="modal-novo-pedido">
      <div class="modal" style="max-width:680px">
        <div class="modal-header">
          <h2>Novo pedido</h2>
          <button class="btn-icon" data-close-modal title="Fechar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <form id="form-novo-pedido" novalidate>
            <div class="form-grid form-grid-3" style="gap:1rem">
              <div class="form-group col-span-3">
                <label for="np-titulo">Título *</label>
                <input type="text" id="np-titulo" placeholder="Ex: Caixa de luvas descartáveis" required maxlength="120">
              </div>
              <div class="form-group">
                <label for="np-empresa">Empresa *</label>
                <select id="np-empresa" required><option value="">Selecionar…</option></select>
              </div>
              <div class="form-group">
                <label for="np-quantidade">Quantidade *</label>
                <input type="number" id="np-quantidade" placeholder="1" min="1" required>
              </div>
              <div class="form-group">
                <label for="np-unidade">Unidade *</label>
                <select id="np-unidade" required><option value="">Sel…</option></select>
              </div>
              <div class="form-group">
                <label for="np-data">Necessário até *</label>
                <input type="date" id="np-data" required min="${hojeISO()}">
              </div>
              <div class="form-group">
                <label for="np-valor">Valor estimado</label>
                <input type="text" id="np-valor" placeholder="R$ 0,00">
              </div>
              <div class="form-group">
                <label for="np-cc">Centro de custo</label>
                <input type="text" id="np-cc" placeholder="Opcional" maxlength="60">
              </div>
              <div class="form-group col-span-3">
                <label>Categoria *</label>
                <div class="category-chips" id="np-categorias"></div>
              </div>
              <div class="form-group col-span-3">
                <div class="toggle-wrap" id="np-urgente-wrap" style="padding:0.5rem 0">
                  <div class="toggle" id="np-urgente-toggle"></div>
                  <span class="toggle-label" style="display:flex;align-items:center;gap:0.4rem">
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style="color:var(--red)">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    Pedido urgente
                  </span>
                </div>
              </div>
              <div class="form-group col-span-3">
                <label for="np-obs">Observações</label>
                <textarea id="np-obs" placeholder="Descreva detalhes relevantes para a compra…" rows="3"></textarea>
              </div>
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>Cancelar</button>
          <button class="btn-primary" id="btn-abrir-pedido">Abrir pedido</button>
        </div>
      </div>
    </div>
  `

  initTopbarEvents(false)
  await _carregarDadosAuxiliares()
  _preencherModalNovoPedido()
  _bindEvents()
  _iniciarListenerPedidos()
  renderNotificacoes()
}

// ── Eventos ───────────────────────────────────────────────────
function _bindEvents() {
  // Filtros
  document.getElementById('filter-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filtro]')
    if (!btn) return
    document.querySelectorAll('#filter-pills .pill').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    _filtroAtivo = btn.dataset.filtro
    _renderView()
  })

  // Busca
  document.getElementById('busca-pedidos')?.addEventListener('input',
    debounce(e => { _termoBusca = e.target.value; _renderView() }, 300)
  )

  // Toggle de view
  document.getElementById('btn-kanban')?.addEventListener('click', () => {
    _viewMode = 'kanban'
    document.getElementById('btn-kanban')?.classList.add('active')
    document.getElementById('btn-lista')?.classList.remove('active')
    _renderView()
  })
  document.getElementById('btn-lista')?.addEventListener('click', () => {
    _viewMode = 'lista'
    document.getElementById('btn-lista')?.classList.add('active')
    document.getElementById('btn-kanban')?.classList.remove('active')
    _renderView()
  })

  // Urgente toggle no modal
  document.getElementById('np-urgente-wrap')?.addEventListener('click', () => {
    document.getElementById('np-urgente-toggle')?.classList.toggle('on')
  })

  // Chips de categoria
  document.getElementById('np-categorias')?.addEventListener('click', e => {
    const chip = e.target.closest('.chip')
    if (!chip) return
    // Seleção exclusiva
    document.querySelectorAll('#np-categorias .chip').forEach(c => c.classList.remove('selected'))
    chip.classList.add('selected')
  })

  // Abrir modal
  document.getElementById('btn-novo-pedido')?.addEventListener('click', () => {
    document.getElementById('form-novo-pedido')?.reset()
    document.getElementById('np-urgente-toggle')?.classList.remove('on')
    document.querySelectorAll('#np-categorias .chip').forEach(c => c.classList.remove('selected'))
    document.getElementById('modal-novo-pedido')?.classList.add('visible')
  })

  // Fechar modal
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById('modal-novo-pedido')?.classList.remove('visible'))
  })
  document.getElementById('modal-novo-pedido')?.addEventListener('click', e => {
    if (e.target.id === 'modal-novo-pedido') document.getElementById('modal-novo-pedido').classList.remove('visible')
  })

  // Submit
  document.getElementById('btn-abrir-pedido')?.addEventListener('click', _submeterNovoPedido)
}

async function _submeterNovoPedido() {
  const titulo     = document.getElementById('np-titulo')?.value.trim()
  const empresaId  = document.getElementById('np-empresa')?.value
  const quantidade = document.getElementById('np-quantidade')?.value
  const unidade    = document.getElementById('np-unidade')?.value
  const data       = document.getElementById('np-data')?.value
  const valorStr   = document.getElementById('np-valor')?.value.trim()
  const cc         = document.getElementById('np-cc')?.value.trim()
  const obs        = document.getElementById('np-obs')?.value.trim()
  const urgente    = document.getElementById('np-urgente-toggle')?.classList.contains('on')
  const catChip    = document.querySelector('#np-categorias .chip.selected')
  const categoriaId = catChip?.dataset.id || ''

  if (!titulo || !empresaId || !quantidade || !unidade || !data || !categoriaId) {
    prxToast('Preencha todos os campos obrigatórios.', 'error')
    return
  }

  const valorEstimado = valorStr ? parseMoeda(valorStr) : null

  mostrarSpinner()
  try {
    await addDoc(collection(db, 'pedidos'), {
      titulo,
      descricao:       obs || '',
      empresaId,
      quantidade:      Number(quantidade),
      unidade,
      dataNecessaria:  data,
      valorEstimado:   valorEstimado,
      centroCusto:     cc || null,
      categoriaId,
      urgente,
      status:          STATUS.SOLICITADO,
      solicitanteId:   sessao.usuario.id,
      compradorId:     null,
      compradorAssumiuEm: null,
      aprovadorIds:    [],
      aprovadoPor:     null,
      aprovadoEm:      null,
      reprovadoPor:    null,
      reprovadoEm:     null,
      motivoReprovacao: null,
      motivoReprovacaoOutros: null,
      canceladoPor:    null,
      canceladoEm:     null,
      motivoCancelamento: null,
      motivoCancelamentoOutros: null,
      fornecedorId:    null,
      valorFinal:      null,
      condicaoPagamento: null,
      dataCompra:      null,
      dataEntrega:     null,
      criadoEm:        serverTimestamp(),
      atualizadoEm:    serverTimestamp(),
    })

    document.getElementById('modal-novo-pedido')?.classList.remove('visible')
    prxToast('Pedido aberto com sucesso!', 'success')
  } catch (err) {
    prxToast('Erro ao abrir pedido. Tente novamente.', 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

// ── Listener em tempo real ────────────────────────────────────
function _iniciarListenerPedidos() {
  if (_unsubPedidos) _unsubPedidos()

  const perfil = sessao.usuario.perfil

  let q
  if (perfil === 'supremo') {
    // Supremo enxerga todos os pedidos sem filtro por empresa
    q = query(collection(db, 'pedidos'), orderBy('criadoEm', 'desc'))
  } else {
    // Normaliza empresas independentemente de ser array ou objeto
    const raw = sessao.usuario.empresas
    const empresas = Array.isArray(raw) ? raw : Object.keys(raw || {})
    if (!empresas.length) {
      _pedidos = []
      _renderView()
      return
    }
    // Firebase limita 'in' a 30 itens — MVP com ≤10 empresas está OK
    q = query(
      collection(db, 'pedidos'),
      where('empresaId', 'in', empresas.slice(0, 10)),
      orderBy('criadoEm', 'desc')
    )
  }

  _unsubPedidos = onSnapshot(q, snap => {
    _pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    _renderView()
  }, err => {
    console.error(err)
    prxToast('Erro ao carregar pedidos.', 'error')
  })
}

// ── Filtragem ─────────────────────────────────────────────────
function _filtrarPedidos() {
  let lista = [..._pedidos]
  const uid = sessao.usuario.id
  const hoje = hojeISO()
  const [y, m, d] = hoje.split('-').map(Number)
  const inicioSemana = new Date(y, m - 1, d - new Date(y, m-1, d).getDay())

  switch (_filtroAtivo) {
    case 'urgentes': lista = lista.filter(p => p.urgente); break
    case 'meus':     lista = lista.filter(p => p.solicitanteId === uid || p.compradorId === uid); break
    case 'semana':
      lista = lista.filter(p => {
        if (!p.criadoEm) return false
        const ts = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
        return ts >= inicioSemana
      })
      break
  }

  if (_termoBusca) {
    const termo = normalizarTexto(_termoBusca)
    lista = lista.filter(p =>
      normalizarTexto(p.titulo || '').includes(termo) ||
      normalizarTexto(p.descricao || '').includes(termo)
    )
  }

  return lista
}

// ── Render view ───────────────────────────────────────────────
function _renderView() {
  const container = document.getElementById('pedidos-view')
  if (!container) return
  const lista = _filtrarPedidos()

  if (_viewMode === 'kanban') {
    container.innerHTML = _renderKanban(lista)
    container.querySelectorAll('.kcard').forEach(card => {
      card.addEventListener('click', () => navegar('detalhe', { id: card.dataset.id }))
    })
  } else {
    container.innerHTML = _renderLista(lista)
    container.querySelectorAll('tbody tr[data-id]').forEach(row => {
      row.addEventListener('click', () => navegar('detalhe', { id: row.dataset.id }))
    })
  }
}

function _renderKanban(lista) {
  const cor = {
    solicitado:'#8A8278', ag_cotacao:'#5BA3E0', em_aprovacao:'#C8A96E',
    aprovado:'#4EC08A', comprado:'#4EC08A', entregue:'#4EC08A', pago:'#4EC08A',
  }

  const colunas = KANBAN_COLUNAS.map(status => {
    const cards = lista.filter(p => p.status === status)
    return `
      <div class="kanban-col">
        <div class="kanban-col-header">
          <div class="kanban-col-title">
            <span style="width:8px;height:8px;border-radius:50%;background:${cor[status]||'#8A8278'};flex-shrink:0"></span>
            ${STATUS_LABEL[status]}
          </div>
          <span class="kanban-col-count">${cards.length}</span>
        </div>
        <div class="kanban-cards">
          ${cards.length ? cards.map(_renderKcard).join('') : `
            <div class="empty-state" style="padding:1.5rem">
              <p style="font-size:0.78rem">Nenhum pedido</p>
            </div>
          `}
        </div>
      </div>
    `
  }).join('')

  return `<div class="kanban-board">${colunas}</div>`
}

function _renderKcard(p) {
  const empresa = _empresas.find(e => e.id === p.empresaId)
  const nomeEmp = empresa?.nome || p.empresaId || '—'
  const valor   = p.valorFinal ?? p.valorEstimado
  const urgBadge = p.urgente
    ? `<span class="badge badge-red" style="font-size:0.68rem">
        <svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Urgente
       </span>`
    : ''

  return `
    <div class="kcard ${p.urgente ? 'kcard-urgente' : ''}" data-id="${p.id}">
      <div class="kcard-title">${p.titulo}</div>
      ${urgBadge}
      <div class="kcard-meta">
        <span class="kcard-empresa truncate">${nomeEmp}</span>
        ${valor ? `<span style="font-size:0.78rem;font-weight:700;color:var(--gold)">${formatCurrency(valor)}</span>` : ''}
      </div>
    </div>
  `
}

function _renderLista(lista) {
  if (!lista.length) {
    return `<div class="card no-hover" style="padding:3rem;text-align:center;color:var(--text3)">
      Nenhum pedido encontrado.
    </div>`
  }

  const linhas = lista.map(p => {
    const empresa = _empresas.find(e => e.id === p.empresaId)
    const solicit  = _usuarios.find(u => u.id === p.solicitanteId)
    const color    = STATUS_COLOR[p.status] || 'neutral'
    const label    = STATUS_LABEL[p.status] || p.status
    const urgDot   = p.urgente ? `<span class="dot dot-red" style="margin-right:0.4rem"></span>` : ''

    return `
      <tr data-id="${p.id}">
        <td>${urgDot}${p.titulo}</td>
        <td data-label="Empresa">${empresa?.nome || '—'}</td>
        <td data-label="Solicitante">${solicit?.nome || '—'}</td>
        <td data-label="Valor est.">${p.valorEstimado ? formatCurrency(p.valorEstimado) : '—'}</td>
        <td data-label="Status"><span class="badge badge-${color}">${label}</span></td>
        <td data-label="Data">${p.criadoEm ? formatDate(_tsToISO(p.criadoEm)) : '—'}</td>
      </tr>
    `
  }).join('')

  return `
    <div class="card no-hover" style="overflow:hidden">
      <div class="table-wrapper">
        <table class="table-card-mobile">
          <thead>
            <tr>
              <th>Pedido</th><th>Empresa</th><th>Solicitante</th>
              <th>Valor est.</th><th>Status</th><th>Data</th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>
  `
}

// ── Auxiliares ────────────────────────────────────────────────
async function _carregarDadosAuxiliares() {
  const [catSnap, empSnap, usrSnap] = await Promise.all([
    getDocs(collection(db, 'categorias')),
    getDocs(collection(db, 'empresas')),
    getDocs(collection(db, 'usuarios')),
  ])
  _categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _empresas   = empSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.ativa !== false)
  _usuarios   = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
}

function _preencherModalNovoPedido() {
  // Empresas — filtra pelas do usuário
  const empSel = document.getElementById('np-empresa')
  if (empSel) {
    const raw = sessao.usuario.empresas
    const empIds = Array.isArray(raw) ? raw : Object.keys(raw || {})
    const disponiveis = _empresas.filter(e =>
      sessao.usuario.perfil === 'supremo' || empIds.includes(e.id)
    )
    disponiveis.forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      empSel.appendChild(opt)
    })
  }

  // Unidades
  const unidSel = document.getElementById('np-unidade')
  if (unidSel) {
    UNIDADES.forEach(u => {
      const opt = document.createElement('option')
      opt.value = u; opt.textContent = u
      unidSel.appendChild(opt)
    })
  }

  // Categorias
  const catWrap = document.getElementById('np-categorias')
  if (catWrap) {
    const lista = _categorias.length ? _categorias : CATEGORIAS_PADRAO.map((c, i) => ({ id: String(i), ...c }))
    lista.forEach(c => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.dataset.id = c.id
      chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${c.cor};display:inline-block;margin-right:4px"></span>${c.nome}`
      catWrap.appendChild(chip)
    })
  }
}

function _tsToISO(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
