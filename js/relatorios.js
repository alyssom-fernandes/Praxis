import { db, collection, query, where, getDocs } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { prxToast, skeletonDashCards } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { STATUS, STATUS_LABEL, STATUS_COLOR, STATUS_DOT_COLOR, PERFIS, t } from './constants.js'
import { formatCurrency, formatDate, hojeISO, maisXDiasISO, dataEhPassado, dataEhProximos, animarNumero, esc } from './utils.js'

let _pedidos           = []
let _pedidosTodos      = [] // sem filtro de período — usado no gráfico de 6 meses
let _parcelas          = [] // { id, pedidoId, ...parcelaData }
let _cotacoesPorPedido = {} // { pedidoId: [cotacao] } — para cálculo de savings
let _empresas          = []
let _categorias        = []
let _filtroPer  = 'mes'
let _filtroEmp  = 'todas'
let _dataIni    = ''
let _dataFim    = ''

// Aprovador NÃO acessa relatórios financeiros consolidados (spec §8.4)
function _podeVerFinanceiro() {
  return [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.FINANCEIRO].includes(sessao.usuario.perfil)
}

// ── Render ────────────────────────────────────────────────────
export async function renderRelatorios() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('relatorios')}
      <div class="main-content">
        <div class="dash-header">
          <div>
            <h1 style="font-size:1.4rem;font-weight:700;margin-bottom:0.2rem">${t('relatorios')}</h1>
            <p style="font-size:0.85rem;color:var(--text3)">${t('dashVisao')}</p>
          </div>
          <div class="dash-filters">
            <div class="filter-pills" id="period-pills">
              <button class="pill active" data-per="mes">${t('filtroPilulaMes')}</button>
              <button class="pill" data-per="tri">${t('filtroPilulaTri')}</button>
              <button class="pill" data-per="ano">${t('filtroPilulaAno')}</button>
              <button class="pill" data-per="livre">${t('filtroPilulaLivre')}</button>
            </div>
            <div id="date-range-wrap" style="display:none;gap:0.5rem;align-items:center">
              <input type="date" id="data-ini" style="width:140px">
              <span style="color:var(--text3);font-size:0.8rem">${t('filtroPilulaAte')}</span>
              <input type="date" id="data-fim" style="width:140px">
            </div>
            <select id="filtro-empresa" style="width:160px;padding:0.4rem 0.8rem">
              <option value="todas">${t('todasEmpresas')}</option>
            </select>
            ${_podeVerFinanceiro() ? `
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
            ` : ''}
          </div>
        </div>
        <div id="dash-content">
          ${skeletonDashCards(4)}
        </div>
      </div>
      ${renderFooter()}
    </div>
  `
  initTopbarEvents(false)
  renderNotificacoes()
  try {
    await _carregarEmpresas()
    _setDatasDefault()
    _bindEvents()
    await _carregarDados()
    _renderDash()
  } catch (err) {
    console.error('Erro ao carregar relatórios:', err)
    const container = document.getElementById('dash-content')
    if (container) container.innerHTML = `<div class="empty-state"><p>Erro ao carregar relatórios. Verifique a conexão e tente novamente.</p></div>`
    prxToast('Erro ao carregar relatórios.', 'error')
  }
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
    const perfil = sessao.usuario.perfil
    const raw    = sessao.usuario.empresas
    const empIds = Array.isArray(raw) ? raw : Object.keys(raw || {})
    const disp   = _empresas.filter(e => perfil === PERFIS.SUPREMO || empIds.includes(e.id))
    disp.forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      sel.appendChild(opt)
    })
  }
}

async function _carregarDados() {
  const perfil = sessao.usuario.perfil
  const raw    = sessao.usuario.empresas
  const empresas = Array.isArray(raw) ? raw : Object.keys(raw || {})

  let snap
  if (perfil === PERFIS.SUPREMO) {
    snap = await getDocs(collection(db, 'pedidos'))
  } else {
    if (!empresas.length) { _pedidos = []; _pedidosTodos = []; _parcelas = []; return }
    snap = await getDocs(query(
      collection(db, 'pedidos'),
      where('empresaId', 'in', empresas.slice(0, 10)),
    ))
  }

  const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }))

  _pedidos = todos.filter(p => {
    if (!p.criadoEm) return true
    const ts = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
    const iso = ts.toISOString().slice(0,10)
    return iso >= _dataIni && iso <= _dataFim
  })

  // Pedidos aprovados/pagos nos últimos 180 dias (para gráficos — independente do período selecionado)
  const STATUS_GRAF = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
  const limiar180   = Date.now() - 180 * 24 * 3600000
  _pedidosTodos = todos.filter(p => {
    if (!STATUS_GRAF.includes(p.status)) return false
    if (!p.criadoEm) return false
    const ts = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
    return ts.getTime() >= limiar180
  })

  // Parcelas + categorias + cotações (para savings) em paralelo
  _parcelas = []
  _cotacoesPorPedido = {}
  const pedComValor = _pedidos.filter(p => p.valorFinal)
  const [, catSnap] = await Promise.all([
    Promise.all([
      ..._pedidos.map(async p => {
        const pSnap = await getDocs(collection(db, 'pedidos', p.id, 'parcelas'))
        pSnap.docs.forEach(d => _parcelas.push({ id: d.id, pedidoId: p.id, ...d.data() }))
      }),
      ...pedComValor.map(async p => {
        const cSnap = await getDocs(collection(db, 'pedidos', p.id, 'cotacoes'))
        _cotacoesPorPedido[p.id] = cSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      }),
    ]),
    getDocs(collection(db, 'categorias'))
  ])
  _categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Render dashboard ──────────────────────────────────────────
function _renderDash() {
  const container = document.getElementById('dash-content')
  if (!container) return

  const verFinanceiro = _podeVerFinanceiro()

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

  // Total de savings (maior cotação - indicada) para pedidos com valorFinal no período
  let totalSavings = 0
  pedFiltrados.filter(p => p.valorFinal).forEach(p => {
    const cots = _cotacoesPorPedido[p.id] || []
    if (cots.length < 2) return
    const indicada = cots.find(c => c.indicada)
    if (!indicada) return
    const maior = Math.max(...cots.map(c => c.valor))
    const s = maior - indicada.valor
    if (s > 0) totalSavings += s
  })

  // Gasto por empresa
  const gastoPorEmp = {}
  pedFiltrados.filter(p => p.valorFinal).forEach(p => {
    gastoPorEmp[p.empresaId] = (gastoPorEmp[p.empresaId] || 0) + p.valorFinal
  })
  const maxGasto = Math.max(...Object.values(gastoPorEmp), 1)

  // Status counts
  const statusCount = {}
  pedFiltrados.forEach(p => { statusCount[p.status] = (statusCount[p.status] || 0) + 1 })

  // Card "Total gasto" (financeiro)
  const cardTotalGasto = `
      <div class="card no-hover card-glow-gold" style="border-color:var(--gold-border)">
        <div class="stat-card">
          <div class="stat-label">${t('dashTotalGasto')}</div>
          <div class="stat-value text-gold">${formatCurrency(totalGasto)}</div>
          <div class="stat-sub">${_filtroPer === 'mes' ? t('periodoMes') : _filtroPer === 'tri' ? t('periodoTri') : _filtroPer === 'ano' ? t('periodoAno') : t('periodoLivre')}</div>
        </div>
      </div>`

  const cardTotalPedidos = `
      <div class="card no-hover card-glow-green">
        <div class="stat-card">
          <div class="stat-label">${t('dashTotalPedidos')}</div>
          <div class="stat-value text-green">${totalPedidos}</div>
          <div class="stat-sub">${t('noPeriodo')}</div>
        </div>
      </div>`

  const cardAgAprovacao = `
      <div class="card no-hover card-glow-red">
        <div class="stat-card">
          <div class="stat-label">${t('dashAgAprovacao')}</div>
          <div class="stat-value text-red">${agAprovacao.length}</div>
          <div class="stat-sub">${urgentes ? `<span class="badge badge-red">${urgentes} ${urgentes>1?t('urgentes'):t('urgente')}</span>` : t('semUrgentes')}</div>
        </div>
      </div>`

  // Card "Parcelas a vencer" (financeiro)
  const cardParcVencer = `
      <div class="card no-hover card-glow-gold">
        <div class="stat-card">
          <div class="stat-label">${t('dashAVencer')}</div>
          <div class="stat-value text-gold">${formatCurrency(totalVencer)}</div>
          <div class="stat-sub">${parcVencer.length} ${parcVencer.length !== 1 ? t('parcelas') : t('parcela')}</div>
        </div>
      </div>`

  // Card "Total de economia" — savings acumulado das cotações (3.4)
  const cardSavings = totalSavings > 0 ? `
      <div class="card no-hover card-glow-green" style="border-color:var(--green-border)">
        <div class="stat-card">
          <div class="stat-label">${t('dashEconomia')}</div>
          <div class="stat-value text-green" id="anim-savings">${formatCurrency(totalSavings)}</div>
          <div class="stat-sub">${t('dashEconomiaVs')}</div>
        </div>
      </div>` : ''

  // Bloco "Gasto por empresa" (financeiro)
  const blocoGastoEmpresa = `
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">${t('dashGastoPorEmpresa')}</div>
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
        ` : `<div class="empty-state"><p>${t('semDados')}</p></div>`}
      </div>`

  // Bloco "Próximas parcelas" (financeiro)
  const blocoProxParcelas = `
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">${t('dashProxParcelas')}</div>
        ${parcVencer.length ? `
          <div style="display:flex;flex-direction:column;gap:0.5rem">
            ${parcVencer.slice(0,8).map(pc => {
              const ped  = _pedidos.find(p => p.id === pc.pedidoId)
              const hoje = hojeISO()
              const badge = pc.vencimento === hoje
                ? `<span class="badge badge-red">${t('dashHoje')}</span>`
                : dataEhProximos(pc.vencimento, 3)
                  ? `<span class="badge badge-gold">3 dias</span>`
                  : `<span class="badge badge-neutral">${formatDate(pc.vencimento)}</span>`
              return `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem;background:var(--card2);border-radius:var(--radius-sm);border:1px solid var(--border)">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:0.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ped?.titulo || pc.pedidoId}</div>
                    <div style="font-size:0.72rem;color:var(--text3)">${t('parcelaNum')} ${pc.numero}/${pc.total}</div>
                  </div>
                  ${badge}
                  <span style="font-size:0.875rem;font-weight:700;white-space:nowrap">${formatCurrency(pc.valor)}</span>
                </div>
              `
            }).join('')}
          </div>
        ` : `<div class="empty-state"><p>${t('nenhumaParcela')}</p></div>`}
      </div>`

  const blocoStatusPedidos = `
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">${t('dashStatus')}</div>
        <div style="display:flex;flex-direction:column;gap:0.5rem">
          ${Object.entries(statusCount).sort((a,b)=>b[1]-a[1]).map(([status, count]) => {
            const dotClass = STATUS_DOT_COLOR[status] || 'dot-gray'
            const label    = STATUS_LABEL[status] || status
            const pct      = totalPedidos ? Math.round((count / totalPedidos) * 100) : 0
            return `
              <div style="display:flex;align-items:center;gap:0.75rem">
                <span class="dot ${dotClass}"></span>
                <span style="flex:1;font-size:0.82rem;color:var(--text2)">${label}</span>
                <div class="bar-track" style="width:80px">
                  <div class="bar-fill" style="width:${pct}%;background:var(--${[STATUS.PAGO, STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE].includes(status)?'green':status===STATUS.EM_APROVACAO?'gold':[STATUS.REPROVADO, STATUS.CANCELADO].includes(status)?'red':'blue'})"></div>
                </div>
                <span style="font-size:0.82rem;font-weight:700;width:20px;text-align:right">${count}</span>
              </div>
            `
          }).join('')}
        </div>
      </div>`

  if (verFinanceiro) {
    container.innerHTML = `
      <div class="dash-grid-1" style="margin-bottom:1rem">
        ${cardTotalGasto}
        ${cardTotalPedidos}
        ${cardAgAprovacao}
        ${cardParcVencer}
      </div>
      ${cardSavings ? `<div style="margin-bottom:1rem">${cardSavings}</div>` : ''}
      <div class="dash-grid-2">
        ${blocoGastoEmpresa}
        ${blocoProxParcelas}
        ${blocoStatusPedidos}
      </div>
      <div class="dash-grid-2" style="margin-top:1rem">
        <div class="card no-hover" style="padding:1.5rem;position:relative" id="bloco-grafico-linha">
          <div class="detalhe-section-title" style="margin-bottom:1rem">${t('dashGastoMensal')}</div>
          <canvas id="grafico-linha" style="width:100%;height:180px;display:block"></canvas>
          <div id="linha-tooltip" style="display:none;position:fixed;background:var(--card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.4rem 0.75rem;font-size:0.8rem;pointer-events:none;z-index:10"></div>
        </div>
        <div class="card no-hover" style="padding:1.5rem;position:relative" id="bloco-grafico-donut">
          <div class="detalhe-section-title" style="margin-bottom:1rem">${t('dashGastoPorCategoria')}</div>
          <div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap">
            <canvas id="grafico-donut" width="180" height="180" style="flex-shrink:0"></canvas>
            <div id="donut-legenda" style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:0.4rem;font-size:0.8rem"></div>
          </div>
          <div id="donut-tooltip" style="display:none;position:fixed;background:var(--card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.4rem 0.75rem;font-size:0.8rem;pointer-events:none;z-index:10"></div>
        </div>
      </div>
    `
    // Count-up nos cards financeiros (2.1)
    const elGasto  = container.querySelector('.stat-value.text-gold')
    const elVencer = container.querySelectorAll('.stat-value.text-gold')[1]
    const elPedidos = container.querySelector('.stat-value.text-green')
    const elAgAp   = container.querySelector('.stat-value.text-red')
    const elSavings = document.getElementById('anim-savings')
    if (elGasto)   animarNumero(elGasto,   totalGasto,      900, v => formatCurrency(v))
    if (elVencer)  animarNumero(elVencer,  totalVencer,     900, v => formatCurrency(v))
    if (elPedidos) animarNumero(elPedidos, totalPedidos,    700, v => String(Math.round(v)))
    if (elAgAp)    animarNumero(elAgAp,    agAprovacao.length, 700, v => String(Math.round(v)))
    if (elSavings) animarNumero(elSavings, totalSavings,    900, v => formatCurrency(v))
    _desenharGraficoLinha()
    _desenharGraficoDonut()
  } else {
    // Aprovador: apenas dados operacionais, sem valores financeiros
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        ${cardTotalPedidos}
        ${cardAgAprovacao}
      </div>
      <div>
        ${blocoStatusPedidos}
      </div>
    `
    const elPedidos = container.querySelector('.stat-value.text-green')
    const elAgAp   = container.querySelector('.stat-value.text-red')
    if (elPedidos) animarNumero(elPedidos, totalPedidos,    700, v => String(Math.round(v)))
    if (elAgAp)    animarNumero(elAgAp,    agAprovacao.length, 700, v => String(Math.round(v)))
  }
}

// ── Gráficos canvas ───────────────────────────────────────────
function _desenharGraficoLinha() {
  requestAnimationFrame(() => {
    const canvas = document.getElementById('grafico-linha')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width  = Math.floor(rect.width) || 600
    canvas.height = 180

    const ctx = canvas.getContext('2d')
    const cs  = getComputedStyle(document.documentElement)
    const gold   = (cs.getPropertyValue('--gold')   || '#C9A84C').trim()
    const text3  = (cs.getPropertyValue('--text3')  || '#8A8278').trim()
    const border = (cs.getPropertyValue('--border') || '#3A3530').trim()

    // Últimos 6 meses
    const meses = []
    const agora = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
      meses.push({ ano: d.getFullYear(), mes: d.getMonth(), label: d.toLocaleString('pt-BR', { month: 'short' }) })
    }

    // Soma valorFinal por mês (eixo Y = R$)
    const values = meses.map(m =>
      _pedidosTodos
        .filter(p => {
          const ts = p.criadoEm?.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
          return ts.getFullYear() === m.ano && ts.getMonth() === m.mes
        })
        .reduce((s, p) => s + (p.valorFinal || 0), 0)
    )

    const W = canvas.width, H = canvas.height
    const padL = 52, padR = 16, padT = 16, padB = 32
    const maxVal = Math.max(...values, 1)
    const xStep  = (W - padL - padR) / (meses.length - 1)
    const xOf = i => padL + i * xStep
    const yOf = v => padT + (H - padT - padB) * (1 - v / maxVal)
    const fmtY = v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(Math.round(v))

    // Grid horizontal + labels eixo Y
    ctx.lineWidth = 0.5
    ctx.font = '10px system-ui,sans-serif'
    ctx.textAlign = 'right'
    for (let g = 0; g <= 4; g++) {
      const y = padT + (H - padT - padB) * g / 4
      const v = maxVal * (1 - g / 4)
      ctx.strokeStyle = border
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke()
      ctx.fillStyle = text3
      ctx.fillText(fmtY(v), padL - 4, y + 3)
    }

    // Área sob a linha
    ctx.beginPath()
    values.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)))
    ctx.lineTo(xOf(values.length - 1), H - padB)
    ctx.lineTo(xOf(0), H - padB)
    ctx.closePath()
    ctx.fillStyle = gold + '33'
    ctx.fill()

    // Linha
    ctx.beginPath()
    values.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)))
    ctx.strokeStyle = gold
    ctx.lineWidth   = 2
    ctx.stroke()

    // Pontos
    values.forEach((v, i) => {
      ctx.fillStyle = gold
      ctx.beginPath()
      ctx.arc(xOf(i), yOf(v), 4, 0, Math.PI * 2)
      ctx.fill()
    })

    // Rótulos do eixo X
    ctx.fillStyle = text3
    ctx.font = '11px system-ui,sans-serif'
    ctx.textAlign = 'center'
    meses.forEach((m, i) => ctx.fillText(m.label, xOf(i), H - 8))

    // Tooltip ao hover
    const tooltip = document.getElementById('linha-tooltip')
    canvas.addEventListener('mousemove', e => {
      if (!tooltip) return
      const r = canvas.getBoundingClientRect()
      const mouseX = e.clientX - r.left
      if (mouseX < padL || mouseX > W - padR) { tooltip.style.display = 'none'; return }
      let nearest = 0, minDist = Infinity
      meses.forEach((_, i) => {
        const d = Math.abs(xOf(i) - mouseX)
        if (d < minDist) { minDist = d; nearest = i }
      })
      tooltip.style.display = 'block'
      tooltip.style.left = (e.clientX + 12) + 'px'
      tooltip.style.top  = (e.clientY - 16) + 'px'
      tooltip.textContent = `${meses[nearest].label}: ${formatCurrency(values[nearest])}`
    })
    canvas.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none' })
  })
}

function _desenharGraficoDonut() {
  requestAnimationFrame(() => {
    const canvas = document.getElementById('grafico-donut')
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const STATUS_CONCLUIDOS = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
    const pedBase = (_filtroEmp === 'todas' ? _pedidos : _pedidos.filter(p => p.empresaId === _filtroEmp))
      .filter(p => STATUS_CONCLUIDOS.includes(p.status) && p.valorFinal)

    const gastoCat = {}
    pedBase.forEach(p => {
      const catId = p.categoriaId || '__sem_cat__'
      gastoCat[catId] = (gastoCat[catId] || 0) + p.valorFinal
    })

    const entries  = Object.entries(gastoCat).sort((a, b) => b[1] - a[1])
    const legenda  = document.getElementById('donut-legenda')

    if (!entries.length) {
      if (legenda) legenda.innerHTML = '<span style="color:var(--text3);font-size:0.82rem">Sem dados de gasto no período.</span>'
      return
    }

    const total = entries.reduce((s, [, v]) => s + v, 0)
    const CORES_FALLBACK = ['#C9A84C', '#4CAF50', '#2196F3', '#E91E63', '#FF9800', '#9C27B0', '#00BCD4', '#8BC34A']

    const cx = 90, cy = 90, r = 72, ri = 44
    let angulo = -Math.PI / 2
    const segmentos = []

    entries.forEach(([catId, valor], i) => {
      const cat   = _categorias.find(c => c.id === catId)
      const sweep = (valor / total) * Math.PI * 2
      const cor   = (cat?.cor && cat.cor !== '') ? cat.cor : CORES_FALLBACK[i % CORES_FALLBACK.length]
      ctx.beginPath()
      ctx.arc(cx, cy, r, angulo, angulo + sweep)
      ctx.arc(cx, cy, ri, angulo + sweep, angulo, true)
      ctx.closePath()
      ctx.fillStyle = cor
      ctx.fill()
      segmentos.push({ angulo, sweep, catId, valor, cor })
      angulo += sweep
    })

    // Buraco central
    ctx.beginPath()
    ctx.arc(cx, cy, ri - 2, 0, Math.PI * 2)
    ctx.fillStyle = (getComputedStyle(document.documentElement).getPropertyValue('--card') || '#1A1613').trim()
    ctx.fill()

    // Legenda
    if (legenda) {
      legenda.innerHTML = segmentos.slice(0, 8).map(seg => {
        const cat  = _categorias.find(c => c.id === seg.catId)
        const nome = seg.catId === '__sem_cat__' ? 'Sem categoria' : (cat?.nome || seg.catId)
        const pct  = Math.round((seg.valor / total) * 100)
        return `
          <div style="display:flex;align-items:center;gap:0.5rem">
            <span style="width:10px;height:10px;border-radius:50%;background:${seg.cor};flex-shrink:0"></span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text2)">${esc(nome)}</span>
            <span style="font-weight:700;white-space:nowrap;color:var(--text1)">${pct}%</span>
          </div>
        `
      }).join('')
    }

    // Tooltip ao passar o mouse — mostra nome, valor e percentual
    const tooltip = document.getElementById('donut-tooltip')
    canvas.addEventListener('mousemove', e => {
      if (!tooltip) return
      const rect = canvas.getBoundingClientRect()
      const mx   = e.clientX - rect.left - cx
      const my   = e.clientY - rect.top  - cy
      const dist = Math.sqrt(mx * mx + my * my)
      if (dist < ri || dist > r) { tooltip.style.display = 'none'; return }
      let ang = Math.atan2(my, mx)
      if (ang < -Math.PI / 2) ang += 2 * Math.PI
      const seg = segmentos.find(s => ang >= s.angulo && ang < s.angulo + s.sweep)
      if (!seg) { tooltip.style.display = 'none'; return }
      const cat  = _categorias.find(c => c.id === seg.catId)
      const nome = seg.catId === '__sem_cat__' ? 'Sem categoria' : (cat?.nome || seg.catId)
      const pct  = Math.round((seg.valor / total) * 100)
      tooltip.style.display = 'block'
      tooltip.style.left    = (e.clientX + 12) + 'px'
      tooltip.style.top     = (e.clientY - 16) + 'px'
      tooltip.textContent   = `${nome}: ${formatCurrency(seg.valor)} (${pct}%)`
    })
    canvas.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none' })
  })
}

// ── Exports ───────────────────────────────────────────────────
async function _exportarExcel() {
  if (!_podeVerFinanceiro()) { prxToast('Sem permissão para exportar dados financeiros.', 'warning'); return }
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
  if (!_podeVerFinanceiro()) { prxToast('Sem permissão para exportar dados financeiros.', 'warning'); return }
  try {
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
    }
    const { jsPDF } = window.jspdf
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
