import { db, collection, query, where, getDocs } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar } from './app.js'
import { prxToast } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { STATUS, STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR } from './constants.js'
import { formatCurrency, formatDate, hojeISO, maisXDiasISO, dataEhPassado, dataEhProximos } from './utils.js'

let _pedidos    = []
let _parcelas   = [] // { id, pedidoId, ...parcelaData }
let _empresas   = []
let _filtroPer  = 'mes'
let _filtroEmp  = 'todas'
let _dataIni    = ''
let _dataFim    = ''

// ── Render ────────────────────────────────────────────────────
export async function renderRelatorios() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('relatorios')}
      <div class="main-content">
        <div class="dash-header">
          <div>
            <h1 style="font-size:1.4rem;font-weight:700;margin-bottom:0.2rem">Relatórios</h1>
            <p style="font-size:0.85rem;color:var(--text3)">Visão financeira e operacional</p>
          </div>
          <div class="dash-filters">
            <div class="filter-pills" id="period-pills">
              <button class="pill active" data-per="mes">Mês</button>
              <button class="pill" data-per="tri">Trimestre</button>
              <button class="pill" data-per="ano">Ano</button>
              <button class="pill" data-per="livre">Livre</button>
            </div>
            <div id="date-range-wrap" style="display:none;gap:0.5rem;display:none;align-items:center">
              <input type="date" id="data-ini" style="width:140px">
              <span style="color:var(--text3);font-size:0.8rem">até</span>
              <input type="date" id="data-fim" style="width:140px">
            </div>
            <select id="filtro-empresa" style="width:160px;padding:0.4rem 0.8rem">
              <option value="todas">Todas as empresas</option>
            </select>
            <div class="dash-export">
              <button class="btn-secondary btn-sm" id="btn-export-excel">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                Excel
              </button>
              <button class="btn-secondary btn-sm" id="btn-export-pdf">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                PDF
              </button>
            </div>
          </div>
        </div>
        <div id="dash-content">
          <div class="empty-state"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `
  initTopbarEvents(false)
  renderNotificacoes()
  await _carregarEmpresas()
  _setDatasDefault()
  _bindEvents()
  await _carregarDados()
  _renderDash()
}

function _bindEvents() {
  document.getElementById('period-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-per]')
    if (!btn) return
    document.querySelectorAll('#period-pills .pill').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    _filtroPer = btn.dataset.per
    const show = _filtroPer === 'livre'
    const wrap = document.getElementById('date-range-wrap')
    if (wrap) wrap.style.display = show ? 'flex' : 'none'
    if (!show) { _setDatasDefault(); _carregarDados().then(_renderDash) }
  })

  document.getElementById('data-ini')?.addEventListener('change', e => {
    _dataIni = e.target.value
    if (_dataIni && _dataFim) _carregarDados().then(_renderDash)
  })
  document.getElementById('data-fim')?.addEventListener('change', e => {
    _dataFim = e.target.value
    if (_dataIni && _dataFim) _carregarDados().then(_renderDash)
  })

  document.getElementById('filtro-empresa')?.addEventListener('change', e => {
    _filtroEmp = e.target.value
    _renderDash()
  })

  document.getElementById('btn-export-excel')?.addEventListener('click', _exportarExcel)
  document.getElementById('btn-export-pdf')?.addEventListener('click', _exportarPDF)
}

function _setDatasDefault() {
  const hoje = new Date()
  if (_filtroPer === 'mes') {
    _dataIni = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-01`
    const fim = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0)
    _dataFim = `${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}`
  } else if (_filtroPer === 'tri') {
    const mes = hoje.getMonth()
    const iniMes = Math.floor(mes/3)*3
    _dataIni = `${hoje.getFullYear()}-${String(iniMes+1).padStart(2,'0')}-01`
    const fim = new Date(hoje.getFullYear(), iniMes+3, 0)
    _dataFim = `${fim.getFullYear()}-${String(fim.getMonth()+1).padStart(2,'0')}-${String(fim.getDate()).padStart(2,'0')}`
  } else if (_filtroPer === 'ano') {
    _dataIni = `${hoje.getFullYear()}-01-01`
    _dataFim = `${hoje.getFullYear()}-12-31`
  }
}

async function _carregarEmpresas() {
  const snap = await getDocs(collection(db, 'empresas'))
  _empresas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const sel = document.getElementById('filtro-empresa')
  if (sel) {
    const disp = _empresas.filter(e => sessao.usuario.empresas?.includes(e.id) || sessao.usuario.perfil === 'supremo')
    disp.forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      sel.appendChild(opt)
    })
  }
}

async function _carregarDados() {
  const empresas = sessao.usuario.empresas || []
  if (!empresas.length) { _pedidos = []; _parcelas = []; return }

  const q = query(
    collection(db, 'pedidos'),
    where('empresaId', 'in', empresas.slice(0, 10)),
  )
  const snap = await getDocs(q)
  _pedidos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(p => {
      if (!p.criadoEm) return true
      const ts = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
      const iso = ts.toISOString().slice(0,10)
      return iso >= _dataIni && iso <= _dataFim
    })

  // Carrega parcelas de todos os pedidos
  _parcelas = []
  await Promise.all(_pedidos.map(async p => {
    const pSnap = await getDocs(collection(db, 'pedidos', p.id, 'parcelas'))
    pSnap.docs.forEach(d => _parcelas.push({ id: d.id, pedidoId: p.id, ...d.data() }))
  }))
}

// ── Render dashboard ──────────────────────────────────────────
function _renderDash() {
  const container = document.getElementById('dash-content')
  if (!container) return

  const pedFiltrados = _filtroEmp === 'todas'
    ? _pedidos
    : _pedidos.filter(p => p.empresaId === _filtroEmp)

  const parcFiltradas = _filtroEmp === 'todas'
    ? _parcelas
    : _parcelas.filter(pc => pedFiltrados.some(p => p.id === pc.pedidoId))

  const totalGasto = pedFiltrados
    .filter(p => p.status === STATUS.PAGO || p.valorFinal)
    .reduce((s, p) => s + (p.valorFinal || 0), 0)

  const totalPedidos = pedFiltrados.length

  const agAprovacao = pedFiltrados.filter(p => p.status === STATUS.EM_APROVACAO)
  const urgentes    = agAprovacao.filter(p => p.urgente).length

  const parcVencer  = parcFiltradas.filter(pc => !pc.pago && dataEhProximos(pc.vencimento, 7))
  const totalVencer = parcVencer.reduce((s, p) => s + (p.valor || 0), 0)

  // Gasto por empresa
  const gastoPorEmp = {}
  pedFiltrados.filter(p => p.valorFinal).forEach(p => {
    gastoPorEmp[p.empresaId] = (gastoPorEmp[p.empresaId] || 0) + p.valorFinal
  })
  const maxGasto = Math.max(...Object.values(gastoPorEmp), 1)

  // Status counts
  const statusCount = {}
  pedFiltrados.forEach(p => { statusCount[p.status] = (statusCount[p.status] || 0) + 1 })

  container.innerHTML = `
    <!-- Linha 1 -->
    <div class="dash-grid-1" style="margin-bottom:1rem">

      <!-- Total gasto -->
      <div class="card no-hover" style="background:linear-gradient(135deg,rgba(200,169,110,0.12),rgba(200,169,110,0.04));border-color:var(--gold-border)">
        <div class="stat-card">
          <div class="stat-label">Total gasto no período</div>
          <div class="stat-value text-gold">${formatCurrency(totalGasto)}</div>
          <div class="stat-sub">${_filtroPer === 'mes' ? 'Este mês' : _filtroPer === 'tri' ? 'Este trimestre' : _filtroPer === 'ano' ? 'Este ano' : 'Período selecionado'}</div>
        </div>
      </div>

      <!-- Total pedidos -->
      <div class="card no-hover card-glow-green">
        <div class="stat-card">
          <div class="stat-label">Total de pedidos</div>
          <div class="stat-value text-green">${totalPedidos}</div>
          <div class="stat-sub">No período</div>
        </div>
      </div>

      <!-- Ag. aprovação -->
      <div class="card no-hover card-glow-red">
        <div class="stat-card">
          <div class="stat-label">Ag. aprovação</div>
          <div class="stat-value text-red">${agAprovacao.length}</div>
          <div class="stat-sub">${urgentes ? `<span class="badge badge-red">${urgentes} urgente${urgentes>1?'s':''}</span>` : 'Sem urgentes'}</div>
        </div>
      </div>

      <!-- Parcelas a vencer -->
      <div class="card no-hover">
        <div class="stat-card">
          <div class="stat-label">Parcelas a vencer (7 dias)</div>
          <div class="stat-value text-gold">${formatCurrency(totalVencer)}</div>
          <div class="stat-sub">${parcVencer.length} parcela${parcVencer.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

    </div>

    <!-- Linha 2 -->
    <div class="dash-grid-2">

      <!-- Gráfico gasto por empresa -->
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">Gasto por empresa</div>
        ${Object.keys(gastoPorEmp).length ? `
          <div class="bar-chart">
            ${Object.entries(gastoPorEmp).sort((a,b) => b[1]-a[1]).map(([empId, gasto]) => {
              const emp = _empresas.find(e => e.id === empId)
              const pct = Math.round((gasto / maxGasto) * 100)
              return `
                <div class="bar-row">
                  <div class="bar-label">
                    <span>${emp?.nome || empId}</span>
                    <span style="font-weight:700;color:var(--gold)">${formatCurrency(gasto)}</span>
                  </div>
                  <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
                </div>
              `
            }).join('')}
          </div>
        ` : `<div class="empty-state"><p>Sem dados no período.</p></div>`}
      </div>

      <!-- Parcelas a vencer -->
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">Próximas parcelas</div>
        ${parcVencer.length ? `
          <div style="display:flex;flex-direction:column;gap:0.5rem">
            ${parcVencer.slice(0,8).map(pc => {
              const ped  = _pedidos.find(p => p.id === pc.pedidoId)
              const hoje = hojeISO()
              const badge = pc.vencimento === hoje
                ? `<span class="badge badge-red">Hoje</span>`
                : dataEhProximos(pc.vencimento, 3)
                  ? `<span class="badge badge-gold">3 dias</span>`
                  : `<span class="badge badge-neutral">${formatDate(pc.vencimento)}</span>`
              return `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem;background:var(--card2);border-radius:var(--radius-sm);border:1px solid var(--border)">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ped?.titulo || pc.pedidoId}</div>
                    <div style="font-size:0.72rem;color:var(--text3)">Parcela ${pc.numero}/${pc.total}</div>
                  </div>
                  ${badge}
                  <span style="font-size:0.875rem;font-weight:700;white-space:nowrap">${formatCurrency(pc.valor)}</span>
                </div>
              `
            }).join('')}
          </div>
        ` : `<div class="empty-state"><p>Nenhuma parcela a vencer.</p></div>`}
      </div>

      <!-- Status dos pedidos -->
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">Status dos pedidos</div>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${Object.entries(statusCount).sort((a,b)=>b[1]-a[1]).map(([status, count]) => {
            const dotClass = STATUS_DOT_COLOR[status] || 'dot-gray'
            const label    = STATUS_LABEL[status] || status
            const pct      = Math.round((count / totalPedidos) * 100)
            return `
              <div style="display:flex;align-items:center;gap:0.75rem">
                <span class="dot ${dotClass}"></span>
                <span style="flex:1;font-size:0.82rem;color:var(--text2)">${label}</span>
                <div class="bar-track" style="width:80px">
                  <div class="bar-fill" style="width:${pct}%;background:var(--${['pago','aprovado','comprado','entregue'].includes(status)?'green':status==='em_aprovacao'?'gold':['reprovado','cancelado'].includes(status)?'red':'blue'})"></div>
                </div>
                <span style="font-size:0.82rem;font-weight:700;width:20px;text-align:right">${count}</span>
              </div>
            `
          }).join('')}
        </div>
      </div>

    </div>
  `
}

// ── Exports ───────────────────────────────────────────────────
async function _exportarExcel() {
  try {
    const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs')
    const pedFilt = _filtroEmp === 'todas' ? _pedidos : _pedidos.filter(p => p.empresaId === _filtroEmp)
    const linhas = pedFilt.map(p => ({
      'Título':       p.titulo,
      'Empresa':      _empresas.find(e => e.id === p.empresaId)?.nome || p.empresaId,
      'Status':       STATUS_LABEL[p.status] || p.status,
      'Valor est.':   p.valorEstimado || '',
      'Valor final':  p.valorFinal || '',
      'Data criação': p.criadoEm?.toDate ? formatDate(p.criadoEm.toDate().toISOString().slice(0,10)) : '',
      'Urgente':      p.urgente ? 'Sim' : 'Não',
    }))
    const ws = XLSX.utils.json_to_sheet(linhas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')
    XLSX.writeFile(wb, `praxis-relatorio-${hojeISO()}.xlsx`)
  } catch (err) {
    prxToast('Erro ao exportar Excel. Verifique a conexão.', 'error')
  }
}

async function _exportarPDF() {
  try {
    const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('PRAXIS — Relatório de Pedidos', 14, 18)
    doc.setFontSize(10)
    doc.text(`Período: ${formatDate(_dataIni)} a ${formatDate(_dataFim)}`, 14, 26)

    const pedFilt = _filtroEmp === 'todas' ? _pedidos : _pedidos.filter(p => p.empresaId === _filtroEmp)
    let y = 36
    pedFilt.slice(0, 40).forEach(p => {
      doc.setFontSize(9)
      doc.text(`${p.titulo} | ${STATUS_LABEL[p.status]} | ${p.valorFinal ? formatCurrency(p.valorFinal) : '—'}`, 14, y)
      y += 7
      if (y > 280) { doc.addPage(); y = 20 }
    })

    doc.save(`praxis-relatorio-${hojeISO()}.pdf`)
  } catch (err) {
    prxToast('Erro ao exportar PDF. Verifique a conexão.', 'error')
  }
}
