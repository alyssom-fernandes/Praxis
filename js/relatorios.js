// Relatórios: período e empresa, cálculo dos números e o painel (gráficos,
// tempo do processo, parcelas). As exportações (Excel, PDF, impressão) ficam
// em relatorios-exportar.js; o estado, em relatorios-estado.js.
import { db, collection, where, getDocs, getDocsFromCache, consulta, lerCadastro } from './firebase.js'
import { renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { sessao } from './estado.js'
import { TEXTOS_RELATORIOS } from './textos-relatorios.js'
import { marcaPraxis, estadoVazio } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { STATUS, STATUS_LABEL, COR_DA_ETAPA, PERFIS, t, tomDaCor, idioma } from './constants.js'
import { formatCurrency, formatDate, dataAbsoluta, esc, empresasDoUsuario } from './utils.js'
import { resumoDoProcesso, formatarDuracao } from './processo.js'
import { _exportarExcel, _exportarPDF } from './relatorios-exportar.js'
import { R } from './relatorios-estado.js'

// ── Textos da tela (PT e EN): js/textos-relatorios.js ─────────
export const TXT = TEXTOS_RELATORIOS
export function _lang() { return idioma() }
export function tr(chave, vars) {
  let s = (TXT[_lang()] || TXT.pt)[chave] ?? TXT.pt[chave] ?? t(chave)
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v)
  return s
}
export function _locale() { return _lang() === 'en' ? 'en-US' : 'pt-BR' }

// ── Ícones (traço 2, mesma família) ───────────────────────────
export const ic = (d, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
export const ICONE = {
  imprimir: ic('<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>'),
  baixar: ic('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  seta: ic('<path d="m6 9 6 6 6-6"/>', 14),
  planilha: ic('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
  pdf: ic('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>'),
  grafico: ic('<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>', 14),
  tabela: ic('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M9 10v10"/>', 14),
  alerta: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>', 22),
  sobe: ic('<path d="M7 17 17 7M9 7h8v8"/>', 13),
  desce: ic('<path d="M7 7l10 10M17 9v8H9"/>', 13),
  igual: ic('<path d="M5 12h14"/>', 13),
}

// ── Estado ────────────────────────────────────────────────────
// Celular: só o gasto mensal e o dinheiro começam abertos; as outras seções
// mostram o título e o resumo e abrem com um toque. O que a pessoa abre ou fecha
// vale enquanto o app estiver aberto. No computador o botão não aparece e a
// classe não muda nada (css/themes.css)
export const _ABERTAS_NO_CELULAR = new Set(['bloco-vazio', 'bloco-mensal', 'bloco-dinheiro'])
export const _secoesAlternadas = {}

export const CONCLUIDOS = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
// As sete etapas do caminho, na ordem do quadro; reprovados e cancelados ficam à parte
export const ETAPAS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO,
  STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
export const FORA = [STATUS.REPROVADO, STATUS.CANCELADO]
export const ORDEM_STATUS = [...ETAPAS, ...FORA]

// Tons das categorias: a cor cadastrada escolhe o matiz, e o tom vem da paleta
// quente da tela (variáveis --rel-* em telas.css, uma por tema). Nada de azul
// ou vermelho saturados. A ordem é a de desempate quando dois matizes coincidem.
export const TONS = ['ocre', 'oliva', 'egeu', 'vinho', 'areia', 'mar', 'ametista', 'rosa', 'argila']
// Os mesmos tons no papel (PDF), iguais aos do tema claro
export const TONS_PAPEL = {
  ocre: [154, 106, 20], oliva: [79, 122, 58], egeu: [65, 103, 140], vinho: [142, 63, 51], areia: [140, 115, 70],
  mar: [61, 117, 108], ametista: [108, 88, 136], rosa: [154, 84, 98], argila: [125, 110, 92],
}
// Atribui um tom por categoria da lista, sem repetir tons na mesma lista
export function _tonsDaLista(ids) {
  const usados = new Set(), mapa = {}
  ids.forEach(id => {
    if (id === '__outras__') return
    let tom = tomDaCor(R.categorias.find(c => c.id === id)?.cor) || TONS[0]
    if (usados.has(tom)) tom = TONS.find(x => !usados.has(x)) || tom
    usados.add(tom); mapa[id] = tom
  })
  return mapa
}

// Aprovador NÃO acessa relatórios financeiros consolidados (spec §8.4)
export function _podeVerFinanceiro() {
  return [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.FINANCEIRO].includes(sessao.usuario?.perfil)
}

// ── Datas ─────────────────────────────────────────────────────
export const _pad = n => String(n).padStart(2, '0')
export const _iso = d => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`
export const _deIso = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1) }
export const _somaDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
export const _hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
export const _diasEntre = (a, b) => Math.round((_deIso(b) - _deIso(a)) / 86400000)
export function _menosMeses(d, k) {
  const alvo = new Date(d.getFullYear(), d.getMonth() - k, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(d.getDate(), ultimo))
  return alvo
}
export function _dataPedido(p) {
  if (!p.criadoEm) return null
  const d = p.criadoEm.toDate ? p.criadoEm.toDate() : new Date(p.criadoEm)
  return isNaN(d) ? null : d
}
export function _isoPedido(p) { const d = _dataPedido(p); return d ? _iso(d) : null }
export const _capital = s => s.charAt(0).toUpperCase() + s.slice(1)

// Intervalo atual e o período anterior equivalente (para comparação)
export function _intervalo() {
  const hoje = _hoje()
  let ini, fim = hoje, antIni, antFim, nome, vs
  const y = hoje.getFullYear(), m = hoje.getMonth()
  if (R.filtroPer === 'mes') {
    ini = new Date(y, m, 1)
    antIni = _menosMeses(ini, 1); antFim = _menosMeses(fim, 1)
    nome = _capital(ini.toLocaleDateString(_locale(), { month: 'long', year: 'numeric' })); vs = tr('vsMes')
  } else if (R.filtroPer === 'tri') {
    const q = Math.floor(m / 3)
    ini = new Date(y, q * 3, 1)
    antIni = _menosMeses(ini, 3); antFim = _menosMeses(fim, 3)
    nome = _lang() === 'en' ? `Q${q + 1} ${y}` : `${q + 1}${tr('triN')} ${y}`; vs = tr('vsTri')
  } else if (R.filtroPer === 'ano') {
    ini = new Date(y, 0, 1)
    antIni = _menosMeses(ini, 12); antFim = _menosMeses(fim, 12)
    nome = String(y); vs = tr('vsAno')
  } else if (R.filtroPer === 'livre' && R.dataIni && R.dataFim) {
    ini = _deIso(R.dataIni); fim = _deIso(R.dataFim)
    if (ini > fim) [ini, fim] = [fim, ini]
    const dias = Math.round((fim - ini) / 86400000) + 1
    antFim = _somaDias(ini, -1); antIni = _somaDias(antFim, -(dias - 1))
    nome = tr('nomeLivre'); vs = tr('vsLivre')
  } else {
    ini = _somaDias(hoje, -29)
    antFim = _somaDias(ini, -1); antIni = _somaDias(antFim, -29)
    nome = tr('nome30d'); vs = tr('vs30d')
  }
  if (antFim >= ini) antFim = _somaDias(ini, -1)
  const dm = d => `${_pad(d.getDate())}/${_pad(d.getMonth() + 1)}`
  if (R.filtroPer === 'ano') vs = tr('vsMesmo', { a: antIni.getFullYear() })
  else if (R.filtroPer !== '30d') vs = `vs. ${dm(antIni)} ${tr('a')} ${dm(antFim)}`
  return { ini: _iso(ini), fim: _iso(fim), antIni: _iso(antIni), antFim: _iso(antFim), nome, vs }
}

// ── Formatação ────────────────────────────────────────────────
export function _brl(v) { return formatCurrency(v || 0) }
export function _brlCompacto(v) {
  if (!v) return 'R$ 0'
  if (Math.abs(v) < 1000) return 'R$ ' + Math.round(v).toLocaleString(_locale())
  return 'R$ ' + new Intl.NumberFormat(_locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}
// Valor em numeral grande: "R$" e centavos menores, a parte inteira manda
export function _numMoeda(v) {
  const s = _brl(v).replace(/\s/g, ' ')
  const m = /^(-?)R\$ ?(.+?)([,.]\d{2})$/.exec(s)
  if (!m) return esc(s)
  return `<span class="rel-moeda">R$</span>${m[1]}${m[2]}<span class="rel-cent">${m[3]}</span>`
}
export function _pct(parte, total) { return total ? Math.round((parte / total) * 100) : 0 }
export const _nomeEmpresa = id => R.empresas.find(e => e.id === id)?.nome || '—'
export const _nomeCategoria = id => id ? (R.categorias.find(c => c.id === id)?.nome || tr('semCategoria')) : tr('semCategoria')
export const _plural = (n, s, p) => `${n} ${n === 1 ? s : p}`
export const _num = n => Number(n).toLocaleString(_locale(), { maximumFractionDigits: 1 })

// ── Render da página ──────────────────────────────────────────
export async function renderRelatorios() {
  const fin = _podeVerFinanceiro()
  R.carregado = false
  const app = document.getElementById('app')
  const pers = ['30d', 'mes', 'tri', 'ano', 'livre']
  const rotPer = { '30d': tr('per30d'), mes: tr('perMes'), tri: tr('perTri'), ano: tr('perAno'), livre: tr('perLivre') }
  // Quem não vê dados financeiros só imprime: um botão, sem menu de um item só
  const acao = fin ? `
    <div class="rel-menu-wrap">
      <button class="btn-secondary rel-btn-exportar" id="btn-exportar" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="rel-menu" aria-label="${tr('exportar')}">
        ${ICONE.baixar}<span class="rel-btn-rot">${tr('exportar')}</span><span class="rel-btn-seta">${ICONE.seta}</span>
      </button>
      <div class="rel-menu" id="rel-menu" role="menu" hidden>
        ${_itemMenu('data-export="pdf"', ICONE.pdf, tr('expPdf'), tr('expPdfDesc'))}
        ${_itemMenu('data-export="xlsx"', ICONE.planilha, tr('expXlsx'), tr('expXlsxDesc'))}
        <div class="rel-menu-sep" role="separator"></div>
        ${_itemMenu('data-acao="imprimir"', ICONE.imprimir, tr('imprimir'), tr('imprimirDesc'))}
      </div>
    </div>`
    : `<button class="btn-secondary rel-btn-exportar" id="btn-imprimir" type="button" aria-label="${tr('imprimir')}">${ICONE.imprimir}<span class="rel-btn-rot">${tr('imprimir')}</span></button>`
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('relatorios')}
      <main class="main-content rel-page">
        <div class="rel-print-head" aria-hidden="true">
          ${marcaPraxis('rel-print-marca')}
          <span class="rel-print-doc">${tr('relatorioCompras')}</span>
        </div>
        <header class="rel-head">
          <h1 class="titulo-pagina">${t('relatorios')}</h1>
          <p class="rel-frase" id="rel-sub">&nbsp;</p>
        </header>

        <div class="rel-barra">
          <div class="rel-seg" id="period-pills" role="group" aria-label="${tr('periodo')}">
            ${pers.map(p => `<button type="button" class="rel-seg-btn${p === R.filtroPer ? ' active' : ''}" data-per="${p}" aria-pressed="${p === R.filtroPer}">${rotPer[p]}</button>`).join('')}
          </div>
          <div class="rel-datas" id="date-range-wrap" ${R.filtroPer === 'livre' ? '' : 'hidden'}>
            <input type="date" id="data-ini" aria-label="${tr('dataIni')}">
            <span class="rel-datas-ate">${tr('a')}</span>
            <input type="date" id="data-fim" aria-label="${tr('dataFim')}">
          </div>
          <div class="rel-barra-fim">
            <select id="filtro-empresa" class="rel-empresa" aria-label="${tr('empresa')}">
              <option value="todas">${t('todasEmpresas')}</option>
            </select>
            ${acao}
          </div>
        </div>

        <div id="dash-content" aria-live="polite">${_skeleton(fin)}</div>
        <div class="rel-dica" id="rel-dica" role="tooltip" hidden></div>
      </main>
      ${renderFooter()}
    </div>
  `
  initTopbarEvents(false)
  renderNotificacoes()
  _bindEvents()
  if (R.filtroPer === 'livre') {
    const a = document.getElementById('data-ini'), b = document.getElementById('data-fim')
    if (a) a.value = R.dataIni
    if (b) b.value = R.dataFim
  }
  await _carregar()
}

export function _itemMenu(attr, icone, titulo, desc) {
  return `<button class="rel-menu-item" role="menuitem" type="button" ${attr}>
    ${icone}<span class="rel-menu-txt"><strong>${titulo}</strong><small>${desc}</small></span>
  </button>`
}

export function _skeleton(fin) {
  const n = fin ? 5 : 4
  const kpi = i => `<div class="rel-kpi${fin && i === 0 ? ' destaque' : ''}"><div class="skeleton" data-estilo="height:38px;width:${i === 0 ? 78 : 52}%"></div><div class="skeleton skeleton-text" data-estilo="width:46%;margin-top:var(--esp-150)"></div><div class="skeleton skeleton-text" data-estilo="width:64%"></div></div>`
  return `<div class="rel-dash" aria-busy="true">
    <div class="rel-kpis rel-kpis-${n}">${Array.from({ length: n }, (_, i) => kpi(i)).join('')}</div>
    <div class="rel-grade">
      <section class="rel-secao rel-larg-12">
        <div class="skeleton skeleton-title" data-estilo="width:180px"></div>
        <div class="skeleton skeleton-text" data-estilo="width:240px"></div>
        <div class="skeleton" data-estilo="height:230px;margin-top:var(--esp-200)"></div>
      </section>
    </div>
  </div>`
}

export async function _carregar() {
  const geracao = ++R.geracao
  const container = document.getElementById('dash-content')
  try {
    await _carregarDados()
    if (geracao !== R.geracao || !document.getElementById('dash-content')) return
    _preencherEmpresas()
    R.carregado = true
    _renderDash()
  } catch (err) {
    if (geracao !== R.geracao) return
    console.warn('Relatórios: falha ao carregar', err)
    if (container) container.innerHTML = `
      ${estadoVazio({ erro: true, icone: ICONE.alerta, titulo: tr('erroTit'), texto: tr('erroTxt'),
        acao: `<button class="btn-secondary btn-sm" type="button" id="rel-tentar">${tr('tentar')}</button>` })}`
    document.getElementById('rel-tentar')?.addEventListener('click', () => {
      container.innerHTML = _skeleton(_podeVerFinanceiro())
      _carregar()
    })
  }
}

export function _bindEvents() {
  document.getElementById('period-pills')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-per]')
    if (!btn || btn.dataset.per === R.filtroPer) return
    _definirPeriodo(btn.dataset.per)
  })

  const iniEl = document.getElementById('data-ini')
  const fimEl = document.getElementById('data-fim')
  const aoMudarData = () => {
    if (!iniEl.value || !fimEl.value) return
    R.dataIni = iniEl.value; R.dataFim = fimEl.value
    if (R.dataIni > R.dataFim) { [R.dataIni, R.dataFim] = [R.dataFim, R.dataIni]; iniEl.value = R.dataIni; fimEl.value = R.dataFim }
    _renderDash()
  }
  iniEl?.addEventListener('change', aoMudarData)
  fimEl?.addEventListener('change', aoMudarData)

  document.getElementById('filtro-empresa')?.addEventListener('change', e => {
    R.filtroEmp = e.target.value
    _renderDash()
  })

  document.getElementById('btn-imprimir')?.addEventListener('click', () => window.print())

  // Menu Exportar: PDF, Excel e Imprimir
  const btnExp = document.getElementById('btn-exportar')
  const menu = document.getElementById('rel-menu')
  const fechar = () => { if (menu && !menu.hidden) { menu.hidden = true; btnExp?.setAttribute('aria-expanded', 'false') } }
  btnExp?.addEventListener('click', e => {
    e.stopPropagation()
    const abrir = menu.hidden
    menu.hidden = !abrir
    btnExp.setAttribute('aria-expanded', String(abrir))
    if (abrir) menu.querySelector('.rel-menu-item')?.focus({ preventScroll: true })
  })
  menu?.addEventListener('click', e => {
    const item = e.target.closest('.rel-menu-item')
    if (!item) return
    fechar()
    if (item.dataset.acao === 'imprimir') { window.print(); return }
    if (item.dataset.export === 'xlsx') _exportarExcel()
    else if (item.dataset.export === 'pdf') _exportarPDF()
  })
  menu?.addEventListener('keydown', e => {
    const itens = [...menu.querySelectorAll('.rel-menu-item')]
    const i = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length]?.focus() }
    if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus() }
    if (e.key === 'Tab') fechar()
  })
  const aoClicarFora = e => {
    if (!e.target.closest?.('.rel-menu-wrap')) fechar()
    if (!e.target.closest?.('.rel-col')) _esconderDica()
  }
  const aoRolar = () => _esconderDica()
  window.addEventListener('scroll', aoRolar, { passive: true })
  const aoTeclar = e => { if (e.key === 'Escape' && menu && !menu.hidden) { fechar(); btnExp?.focus() } }
  document.addEventListener('click', aoClicarFora)
  document.addEventListener('keydown', aoTeclar)
  registrarLimpador(() => {
    document.removeEventListener('click', aoClicarFora)
    document.removeEventListener('keydown', aoTeclar)
    window.removeEventListener('scroll', aoRolar)
  })

  // Painel (delegação): ações dentro das seções
  document.getElementById('dash-content')?.addEventListener('click', e => {
    const recolher = e.target.closest('.rel-recolher')
    if (recolher) {
      const secao = recolher.closest('.rel-secao')
      const abrir = secao.classList.contains('recolhida')
      secao.classList.toggle('recolhida', !abrir)
      secao.classList.toggle('abrindo', abrir)
      if (abrir) setTimeout(() => secao.classList.remove('abrindo'), 260)
      recolher.setAttribute('aria-expanded', String(abrir))
      _secoesAlternadas[recolher.dataset.secao] = abrir
      return
    }
    const vista = e.target.closest('[data-vista]')
    if (vista) { R.vistaMensal = vista.dataset.vista; _renderDash(); return }
    const per = e.target.closest('[data-ir-per]')
    if (per) { _definirPeriodo(per.dataset.irPer); return }
    const ped = e.target.closest('[data-pedido]')
    if (ped) { navegar('detalhe', { id: ped.dataset.pedido }); return }
    const col = e.target.closest('.rel-col')
    if (col) _mostrarDica(col)
  })
}

export function _definirPeriodo(per) {
  R.filtroPer = per
  document.querySelectorAll('#period-pills .rel-seg-btn').forEach(b => {
    const ativo = b.dataset.per === per
    b.classList.toggle('active', ativo)
    b.setAttribute('aria-pressed', String(ativo))
  })
  const wrap = document.getElementById('date-range-wrap')
  if (per === 'livre') {
    // Começa nos últimos 30 dias, para nunca ficar vazio
    if (!R.dataIni || !R.dataFim) {
      const hoje = _hoje()
      R.dataIni = _iso(_somaDias(hoje, -29)); R.dataFim = _iso(hoje)
    }
    const a = document.getElementById('data-ini'), b = document.getElementById('data-fim')
    if (a) a.value = R.dataIni
    if (b) b.value = R.dataFim
  }
  if (wrap) wrap.hidden = per !== 'livre'
  _renderDash()
}

export async function _carregarDados() {
  const perfil = sessao.usuario.perfil
  const ids    = empresasDoUsuario(sessao.usuario)
  const fin    = _podeVerFinanceiro()

  const [empSnap, catSnap, pedSnap] = await Promise.all([
    lerCadastro('empresas', consulta(collection(db, 'empresas'))),
    lerCadastro('categorias', consulta(collection(db, 'categorias'))),
    perfil === PERFIS.SUPREMO
      ? getDocs(consulta(collection(db, 'pedidos')))
      : (ids.length ? getDocs(consulta(collection(db, 'pedidos'), where('empresaId', 'in', ids.slice(0, 30)))) : Promise.resolve(null)),
  ])
  R.empresas   = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  R.categorias = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  R.todos      = pedSnap ? pedSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []
  R.parcelas   = []
  R.cotacoes   = {}
  R.historicos = {}

  const memo = _lerMemoSub()

  // Histórico de cada pedido: o tempo do processo sai das mudanças de etapa
  // (js/processo.js). Uma leitura por pedido, como as cotações e as parcelas
  await Promise.all(R.todos.map(async p => {
    const hSnap = await _subcolecao(p, 'historico', memo).catch(() => null)
    R.historicos[p.id] = hSnap ? hSnap.docs.map(d => d.data()) : []
  }))
  if (fin) {
    // Parcelas e cotações só existem em pedidos com valor final
    const comValor = R.todos.filter(p => p.valorFinal)
    await Promise.all(comValor.map(async p => {
      const [pSnap, cSnap] = await Promise.all([
        _subcolecao(p, 'parcelas', memo).catch(() => null),
        _subcolecao(p, 'cotacoes', memo).catch(() => null),
      ])
      pSnap?.docs.forEach(d => R.parcelas.push({ id: d.id, pedidoId: p.id, ...d.data() }))
      R.cotacoes[p.id] = cSnap ? cSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []
    }))
  }
  // Só os pedidos que ainda estão na lista
  const naLista = new Set(R.todos.map(p => p.id))
  _guardarMemoSub(Object.fromEntries(Object.entries(memo).filter(([id]) => naLista.has(id))))
}

// Pedido encerrado (pago, reprovado, cancelado) não muda mais: o histórico,
// as parcelas e as cotações dele vêm da cópia local do Firestore depois da
// primeira leitura. Antes, cada abertura dos relatórios relia tudo de todos
// os pedidos. A marca de cada pedido (etapa e última gravação) e quantos
// documentos ele tinha ficam no navegador; se o pedido mudou (foi reaberto)
// ou a cópia local perdeu algum documento, a leitura vai ao servidor
const _ENCERRADOS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
const _chaveMemoSub = () => `praxis_memo_rel_${sessao.fireUser?.uid || ''}`
function _lerMemoSub() {
  try { return JSON.parse(localStorage.getItem(_chaveMemoSub()) || '{}') || {} } catch { return {} }
}
function _guardarMemoSub(memo) {
  try { localStorage.setItem(_chaveMemoSub(), JSON.stringify(memo)) } catch { /* cheio ou bloqueado */ }
}
const _marcaDoPedido = p => `${p.status}|${p.atualizadoEm?.toMillis?.() || 0}`
async function _subcolecao(p, nome, memo) {
  const ref = collection(db, 'pedidos', p.id, nome)
  if (!_ENCERRADOS.includes(p.status)) return getDocs(ref)
  const guardado = memo[p.id]?.m === _marcaDoPedido(p) ? memo[p.id][nome] : undefined
  if (guardado !== undefined) {
    try {
      const local = await getDocsFromCache(ref)
      if (local.size === guardado) return local
    } catch { /* sem cópia local: vai ao servidor */ }
  }
  const snap = await getDocs(ref)
  if (memo[p.id]?.m !== _marcaDoPedido(p)) memo[p.id] = { m: _marcaDoPedido(p) }
  memo[p.id][nome] = snap.size
  return snap
}

export function _preencherEmpresas() {
  const sel = document.getElementById('filtro-empresa')
  if (!sel || sel.options.length > 1) return
  const perfil = sessao.usuario.perfil
  const ids    = empresasDoUsuario(sessao.usuario)
  R.empresas
    .filter(e => perfil === PERFIS.SUPREMO || ids.includes(e.id))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
    .forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      sel.appendChild(opt)
    })
  sel.value = R.filtroEmp
  if (sel.value !== R.filtroEmp) { R.filtroEmp = 'todas'; sel.value = 'todas' }
}

// ── Cálculo dos dados do painel ───────────────────────────────
export function _calcular() {
  const iv = _intervalo()
  const daEmpresa = p => R.filtroEmp === 'todas' || p.empresaId === R.filtroEmp
  const base = R.todos.filter(daEmpresa)
  const noIntervalo = (p, a, b) => { const d = _isoPedido(p); return d && d >= a && d <= b }
  const ped = base.filter(p => noIntervalo(p, iv.ini, iv.fim))
    .sort((a, b) => (_dataPedido(b) || 0) - (_dataPedido(a) || 0))
  const ant = base.filter(p => noIntervalo(p, iv.antIni, iv.antFim))

  const comGasto = arr => arr.filter(p => p.valorFinal && ![STATUS.CANCELADO, STATUS.REPROVADO].includes(p.status))
  const soma = arr => arr.reduce((s, p) => s + (Number(p.valorFinal) || 0), 0)
  const gasto = soma(comGasto(ped)), gastoAnt = soma(comGasto(ant))

  const emAprov = base.filter(p => p.status === STATUS.EM_APROVACAO)
  const urgentes = emAprov.filter(p => p.urgente).length

  let economia = 0, nEconomia = 0
  comGasto(ped).forEach(p => {
    const cots = R.cotacoes[p.id] || []
    const ind = cots.find(c => c.indicada)
    if (cots.length < 2 || !ind) return
    const s = Math.max(...cots.map(c => Number(c.valor) || 0)) - (Number(ind.valor) || 0)
    if (s > 0) { economia += s; nEconomia++ }
  })

  // Parcelas em aberto (independem do período: são vencimentos)
  const idsBase = new Set(base.map(p => p.id))
  const hoje = _iso(_hoje()), em7 = _iso(_somaDias(_hoje(), 7)), em30 = _iso(_somaDias(_hoje(), 30))
  const abertas = R.parcelas.filter(pc => idsBase.has(pc.pedidoId) && !pc.pago && pc.vencimento)
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
  const vencer7 = abertas.filter(pc => pc.vencimento >= hoje && pc.vencimento <= em7)
  const vencidas = abertas.filter(pc => pc.vencimento < hoje)
  const proximas = abertas.filter(pc => pc.vencimento <= em30)

  // Etapas: quantidade e valor (final, ou estimado enquanto não há compra)
  const porStatus = {}, valorStatus = {}
  ped.forEach(p => {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1
    valorStatus[p.status] = (valorStatus[p.status] || 0) + (Number(p.valorFinal) || Number(p.valorEstimado) || 0)
  })
  const decididos = ped.filter(p => CONCLUIDOS.includes(p.status) || p.status === STATUS.REPROVADO).length
  const aprovados = ped.filter(p => CONCLUIDOS.includes(p.status)).length

  // Agrupamentos (valor para quem vê financeiro; contagem para o aprovador)
  const fin = _podeVerFinanceiro()
  const agrupar = chave => {
    const m = {}
    const fonte = fin ? comGasto(ped) : ped
    fonte.forEach(p => {
      const k = p[chave] || ''
      m[k] = m[k] || { id: k, valor: 0, qtd: 0 }
      m[k].valor += Number(p.valorFinal) || 0
      m[k].qtd++
    })
    return Object.values(m).sort((a, b) => fin ? b.valor - a.valor : b.qtd - a.qtd)
  }

  // Últimos 6 meses (independe do período, respeita a empresa)
  const meses = []
  const agora = _hoje()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    meses.push({ ano: d.getFullYear(), mes: d.getMonth(), valor: 0, qtd: 0, atual: i === 0 })
  }
  base.forEach(p => {
    const d = _dataPedido(p); if (!d) return
    const m = meses.find(x => x.ano === d.getFullYear() && x.mes === d.getMonth()); if (!m) return
    if (fin) {
      if (p.valorFinal && ![STATUS.CANCELADO, STATUS.REPROVADO].includes(p.status)) { m.valor += Number(p.valorFinal) || 0; m.qtd++ }
    } else { m.qtd++; m.valor++ }
  })

  // Tempo do processo: passagens concluídas no período, de todos os pedidos da
  // empresa (a data que conta é a do fim, não a da abertura)
  const janela = { ini: _deIso(iv.ini).getTime(), fim: _somaDias(_deIso(iv.fim), 1).getTime() - 1 }
  const processo = resumoDoProcesso(base.map(p => ({ pedido: p, historico: R.historicos[p.id] || [] })), janela)

  return {
    iv, ped, ant, gasto, gastoAnt, emAprov, urgentes, economia, nEconomia, processo,
    abertas, vencer7, vencidas, proximas, porStatus, valorStatus, decididos, aprovados,
    porCategoria: agrupar('categoriaId'), porEmpresa: agrupar('empresaId'), porFornecedor: _porFornecedor(comGasto(ped)), meses,
    compras: comGasto(ped).length,
    maiores: comGasto(ped).sort((a, b) => b.valorFinal - a.valorFinal).slice(0, 5),
    reprovados: ped.filter(p => p.status === STATUS.REPROVADO).length,
  }
}

export function _nomeFornecedor(p) {
  if (p.fornecedorNome) return p.fornecedorNome
  return (R.cotacoes[p.id] || []).find(c => c.indicada)?.fornecedorNome || ''
}
export function _porFornecedor(lista) {
  const m = {}
  lista.forEach(p => {
    const k = _nomeFornecedor(p)
    m[k] = m[k] || { id: k, valor: 0, qtd: 0 }
    m[k].valor += Number(p.valorFinal) || 0
    m[k].qtd++
  })
  return Object.values(m).sort((a, b) => b.valor - a.valor)
}

// ── Render do painel ──────────────────────────────────────────
// Ordem: indicadores → mensal → para onde vai o dinheiro → parcelas e
// maiores compras (ou a fila, para o aprovador) → régua das etapas
export function _renderDash() {
  const container = document.getElementById('dash-content')
  if (!container || !R.carregado) return
  _esconderDica()
  const fin = _podeVerFinanceiro()
  const D = _calcular()
  const sub = document.getElementById('rel-sub')
  const emp = R.filtroEmp === 'todas' ? t('todasEmpresas') : _nomeEmpresa(R.filtroEmp)
  if (sub) sub.innerHTML = `<span>${esc(D.iv.nome)}</span><span class="rel-frase-sep" aria-hidden="true">·</span><span class="num">${formatDate(D.iv.ini)} ${tr('a')} ${formatDate(D.iv.fim)}</span><span class="rel-frase-sep rel-frase-emp" aria-hidden="true">·</span><span class="rel-frase-emp">${esc(emp)}</span>`

  const kpis = fin ? _kpisFinanceiro(D) : _kpisAprovador(D)
  const nK = fin ? 5 : 4
  let grade
  if (!D.ped.length) {
    grade = `
      ${_secao({ id: 'bloco-vazio', larg: 12, titulo: tr('pedidosPeriodo'), corpo: _vazio(tr('vazioTit'),
        tr('vazioTxt', { ini: formatDate(D.iv.ini), fim: formatDate(D.iv.fim) }),
        R.filtroPer !== 'ano' ? `<button class="btn-secondary btn-sm" type="button" data-ir-per="ano">${tr('verAno')}</button>` : '') })}
      ${_blocoMensal(D)}
      ${fin ? _blocoParcelas(D, 12) : ''}
      ${_blocoProcesso(D)}`
  } else if (fin) {
    const semCompras = !D.maiores.length
    const acao = R.filtroPer !== '30d' ? `<button class="btn-secondary btn-sm" type="button" data-ir-per="30d">${tr('ver30')}</button>` : ''
    grade = `
      ${_blocoMensal(D)}
      ${semCompras
        ? _secao({ id: 'bloco-dinheiro', larg: 12, titulo: tr('tDinheiro'), corpo: _vazio(tr('semComprasTit'),
            `${D.ped.length === 1 ? tr('semComprasTxt1') : tr('semComprasTxtN', { n: D.ped.length })} ${tr('semComprasTxt')}`, acao) })
        : _blocoDinheiro(D)}
      ${_blocoParcelas(D, semCompras ? 12 : 6)}
      ${semCompras ? '' : _blocoMaiores(D)}
      ${_blocoEtapas(D)}
      ${_blocoProcesso(D)}`
  } else {
    grade = `
      ${_blocoMensal(D)}
      ${_blocoDinheiro(D)}
      ${_blocoFila(D)}
      ${_blocoEtapas(D)}
      ${_blocoProcesso(D)}`
  }
  container.innerHTML = `
    <div class="rel-dash" data-pronto="1" data-per="${R.filtroPer}">
      <div class="rel-kpis rel-kpis-${nK}">${kpis}</div>
      <div class="rel-grade">${grade}</div>
    </div>`
  _ligarDicas()
}

// Variação contra o período anterior: seta e percentual em texto pequeno, sem cor
// de "bom" ou "ruim" (gastar mais não é bom nem ruim por si). Numa contagem com
// base pequena (menos de 10), a diferença em unidades: "+17" diz mais que "+850%"
export function _delta(atual, anterior, vs, { contagem = false } = {}) {
  if (!anterior && !atual) return `<span class="rel-var">${ICONE.igual}0%</span><span>${vs}</span>`
  if (!anterior) return `<span>${tr('semBase')}</span>`
  const pct = Math.round(((atual - anterior) / anterior) * 100)
  const icone = pct > 0 ? ICONE.sobe : pct < 0 ? ICONE.desce : ICONE.igual
  const sinal = pct > 0 ? '+' : pct < 0 ? '−' : ''
  const txt = contagem && anterior < 10
    ? sinal + Math.abs(atual - anterior).toLocaleString(_locale())
    : sinal + Math.abs(pct).toLocaleString(_locale()) + '%'
  return `<span class="rel-var">${icone}${txt}</span><span>${vs}</span>`
}
export const _alerta = (txt, cor) => `<span class="rel-alerta" data-estilo="--cor:${cor}">${txt}</span>`

export function _kpi({ rotulo, valor, sub, destaque = false }) {
  return `<div class="rel-kpi${destaque ? ' destaque' : ''}">
    <div class="rel-kpi-valor">${valor}</div>
    <div class="rel-kpi-rotulo">${rotulo}</div>
    <div class="rel-kpi-sub">${sub}</div>
  </div>`
}

export function _kpisFinanceiro(D) {
  const urg = D.urgentes ? _alerta(_plural(D.urgentes, tr('urgente1'), tr('urgenteN')), 'var(--red)') : `<span>${tr('semUrgentes')}</span>`
  const totalV7 = D.vencer7.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  const venc = `<span>${_plural(D.vencer7.length, tr('parcela1'), tr('parcelaN'))}</span>${D.vencidas.length ? _alerta(_plural(D.vencidas.length, tr('vencida1'), tr('vencidaN')), 'var(--red)') : ''}`
  const econ = `<span>${D.nEconomia ? tr('economiaSubN', { n: _plural(D.nEconomia, tr('compra1'), tr('compraN')) }) : tr('economiaSub')}</span>`
  return [
    _kpi({ rotulo: tr('kGasto'), valor: _numMoeda(D.gasto), sub: _delta(D.gasto, D.gastoAnt, D.iv.vs), destaque: true }),
    _kpi({ rotulo: tr('kPedidos'), valor: D.ped.length, sub: _delta(D.ped.length, D.ant.length, D.iv.vs, { contagem: true }) }),
    _kpi({ rotulo: tr('kAprov'), valor: D.emAprov.length, sub: urg }),
    _kpi({ rotulo: tr('kEconomia'), valor: _numMoeda(D.economia), sub: econ }),
    _kpi({ rotulo: tr('kVencer'), valor: _numMoeda(totalV7), sub: venc }),
  ].join('')
}

// Sem dados financeiros: o número que pede ação é a fila de aprovação
export function _kpisAprovador(D) {
  const urg = D.urgentes ? _alerta(_plural(D.urgentes, tr('urgente1'), tr('urgenteN')), 'var(--red)') : `<span>${tr('semUrgentes')}</span>`
  const taxa = D.decididos ? `${_pct(D.aprovados, D.decididos)}% ${tr('taxaAprov')}` : tr('noPeriodo')
  return [
    _kpi({ rotulo: tr('kAprov'), valor: D.emAprov.length, sub: urg, destaque: true }),
    _kpi({ rotulo: tr('kPedidos'), valor: D.ped.length, sub: _delta(D.ped.length, D.ant.length, D.iv.vs, { contagem: true }) }),
    _kpi({ rotulo: tr('kAprovados'), valor: D.aprovados, sub: `<span>${taxa}</span>` }),
    _kpi({ rotulo: tr('kReprovados'), valor: D.reprovados, sub: `<span>${tr('reprovSub')}</span>` }),
  ].join('')
}

export function _secao({ id, larg = 12, titulo, meta = '', acoes = '', corpo, cls = '' }) {
  const aberta = id in _secoesAlternadas ? _secoesAlternadas[id] : _ABERTAS_NO_CELULAR.has(id)
  return `<section class="rel-secao rel-larg-${larg}${cls ? ' ' + cls : ''}${aberta ? '' : ' recolhida'}" id="${id}" aria-labelledby="${id}-tit">
    <header class="rel-secao-cab">
      <div class="rel-secao-tit"><h2 id="${id}-tit">${titulo}</h2>${meta ? `<p class="rel-secao-meta">${meta}</p>` : ''}</div>
      ${acoes}
      <button type="button" class="rel-recolher" data-secao="${id}" aria-expanded="${aberta}" aria-controls="${id}-corpo" aria-labelledby="${id}-tit">${ICONE.seta}</button>
    </header>
    <div class="rel-secao-corpo" id="${id}-corpo">${corpo}</div>
  </section>`
}

// Estado vazio de um bloco: o componente único (js/ui.js), variante "solto";
// .rel-vazio só o centra na altura do bloco
export function _vazio(titulo, texto, acao = '') {
  return estadoVazio({ variante: 'solto', classe: 'rel-vazio', titulo, texto, acao })
}

// Escala "bonita" para o eixo Y
export function _escala(max, n = 4, inteiro = false) {
  if (max <= 0) return { topo: n, passo: 1, n }
  const bruto = max / n
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)))
  const norm = bruto / mag
  let passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  if (inteiro) passo = Math.max(1, Math.ceil(passo))
  const k = Math.max(2, Math.ceil(max / passo - 1e-9))
  return { topo: passo * k, passo, n: k }
}

// Leitura dos 6 meses: média dos meses fechados, o maior mês e o mês corrente.
// A média começa no primeiro mês com pedidos: meses antes do início do uso
// não são "zero gasto", são falta de dado
export function _leituraMeses(D) {
  const todos = D.meses.filter(m => !m.atual)
  const inicio = todos.findIndex(m => m.qtd > 0)
  const fechados = inicio > 0 ? todos.slice(inicio) : todos
  const media = fechados.reduce((s, m) => s + m.valor, 0) / (fechados.length || 1)
  const maior = D.meses.reduce((a, m) => (m.valor > a.valor ? m : a), D.meses[0])
  const atual = D.meses.find(m => m.atual)
  return { media, maior, atual, fechados }
}

export function _blocoMensal(D) {
  const fin = _podeVerFinanceiro()
  const loc = _locale()
  const nomeMes = m => new Date(m.ano, m.mes, 1).toLocaleDateString(loc, { month: 'short' }).replace('.', '')
  const nomeMesSo = m => _capital(new Date(m.ano, m.mes, 1).toLocaleDateString(loc, { month: 'long' }))
  const nomeMesLongo = m => _capital(new Date(m.ano, m.mes, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' }))
  const fmt = v => fin ? _brl(v) : String(v)
  const fmtEixo = v => fin ? _brlCompacto(v) : String(Math.round(v))
  const max = Math.max(...D.meses.map(m => m.valor), 0)
  const titulo = fin ? tr('tMensal') : tr('tMensalQtd')
  const L = _leituraMeses(D)
  const toggle = `<div class="rel-mini-seg" role="group" aria-label="${tr('grafico')} / ${tr('tabela')}">
      <button type="button" class="${R.vistaMensal === 'grafico' ? 'active' : ''}" data-vista="grafico" aria-pressed="${R.vistaMensal === 'grafico'}" aria-label="${tr('grafico')}" data-tooltip="${tr('grafico')}">${ICONE.grafico}</button>
      <button type="button" class="${R.vistaMensal === 'tabela' ? 'active' : ''}" data-vista="tabela" aria-pressed="${R.vistaMensal === 'tabela'}" aria-label="${tr('tabela')}" data-tooltip="${tr('tabela')}">${ICONE.tabela}</button>
    </div>`

  let grafico
  if (!max) {
    grafico = _vazio(tr('vazioMensal'), '')
  } else if (R.vistaMensal === 'tabela') {
    grafico = `<div class="rel-tabela-wrap"><table class="rel-tabela">
      <thead><tr><th>${tr('mes')}</th><th class="dir">${tr('colQtd')}</th>${fin ? `<th class="dir">${tr('kGasto')}</th>` : ''}<th class="dir">${tr('variacao')}</th></tr></thead>
      <tbody>${D.meses.map((m, i) => {
        const ant = i ? D.meses[i - 1].valor : null
        const v = ant && !m.atual ? Math.round(((m.valor - ant) / ant) * 100) : null
        const vtxt = v == null ? '—' : `<span class="rel-var">${v > 0 ? ICONE.sobe : v < 0 ? ICONE.desce : ICONE.igual}${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%</span>`
        const curto = `${nomeMes(m)}/${String(m.ano).slice(2)}`
        return `<tr${m.atual ? ' class="atual"' : ''}><td><span class="rel-mes-longo">${nomeMesLongo(m)}</span><span class="rel-mes-curto">${curto}</span>${m.atual ? ` <span class="rel-parcial">${tr('parcial')}</span>` : ''}</td><td class="dir num">${m.qtd}</td>${fin ? `<td class="dir num">${_brl(m.valor)}</td>` : ''}<td class="dir">${vtxt}</td></tr>`
      }).join('')}</tbody>
      <tfoot><tr><td>${tr('total')}</td><td class="dir num">${D.meses.reduce((s, m) => s + m.qtd, 0)}</td>${fin ? `<td class="dir num">${_brl(D.meses.reduce((s, m) => s + m.valor, 0))}</td>` : ''}<td></td></tr></tfoot>
    </table></div>`
  } else {
    const esc4 = _escala(max, 4, !fin)
    const linhas = Array.from({ length: esc4.n + 1 }, (_, i) => {
      const v = esc4.passo * i
      return `<div class="rel-grade-linha${i === 0 ? ' base' : ''}" data-estilo="bottom:${(v / esc4.topo) * 100}%"><span>${fmtEixo(v)}</span></div>`
    }).join('')
    const media = L.media > 0
      ? `<div class="rel-media" data-estilo="bottom:${(L.media / esc4.topo) * 100}%" aria-hidden="true"></div>`
      : ''
    grafico = `<div class="rel-colchart" role="group" aria-label="${tr('graficoMensalAria', { t: titulo.toLowerCase() })}">
      <div class="rel-plot">
        ${linhas}
        ${media}
        <div class="rel-cols">
          ${D.meses.map((m, i) => {
            const h = (m.valor / esc4.topo) * 100
            const qtdTxt = _plural(m.qtd, tr('pedido'), tr('pedidos'))
            const rotulo = m.valor ? (fin ? _brlCompacto(m.valor) : m.valor) : (m.atual ? tr('parcial') : '')
            return `<button type="button" class="rel-col${m.atual ? ' atual' : ''}${m.valor ? '' : ' zero'}" data-i="${i}" data-estilo="--i:${i}"
                data-titulo="${esc(nomeMesLongo(m))}${m.atual ? ' · ' + tr('parcial') : ''}" data-valor="${esc(fin ? _brl(m.valor) : qtdTxt)}" data-sub="${esc(fin ? qtdTxt : '')}"
                aria-label="${esc(nomeMesLongo(m))}: ${esc(fin ? _brl(m.valor) : qtdTxt)}">
                <span class="rel-col-valor num">${rotulo}</span>
                <span class="rel-col-barra" data-estilo="height:${m.valor ? Math.max(h, 1.5) : 0}%"></span>
              </button>`
          }).join('')}
        </div>
      </div>
      <div class="rel-eixo-x">${D.meses.map(m => `<span class="${m.atual ? 'atual' : ''}">${nomeMes(m)}</span>`).join('')}</div>
    </div>`
  }

  // Leitura ao lado do gráfico
  const valor = v => fin ? _numMoeda(v) : _num(v)
  const daMedia = L.media > 0 ? `${_pct(L.atual.valor, L.media)}% ${tr('daMedia')}` : tr('parcial')
  const de = L.fechados[0], ate = L.fechados[L.fechados.length - 1]
  const leitura = max ? `<dl class="rel-leitura">
      <div class="media"><dt>${tr('mediaMensal')}</dt><dd><span class="rel-leitura-num">${valor(L.media)}</span><span class="rel-leitura-sub">${nomeMes(de)} ${tr('a')} ${nomeMes(ate)}</span></dd></div>
      <div class="maior"><dt>${tr('maiorMes')}</dt><dd><span class="rel-leitura-num">${valor(L.maior.valor)}</span><span class="rel-leitura-sub">${nomeMesSo(L.maior)}${L.maior.atual ? ` · ${tr('parcial')}` : ''}</span></dd></div>
      <div class="atual"><dt>${tr('esteMes')}</dt><dd><span class="rel-leitura-num">${valor(L.atual.valor)}</span><span class="rel-leitura-sub">${L.atual.valor ? `${daMedia} · ${tr('parcial')}` : fin ? `${tr('semGasto')} · ${tr('parcial')}` : tr('parcial')}</span></dd></div>
    </dl>` : ''
  const total = D.meses.reduce((s, m) => s + m.valor, 0)
  const meta = `${tr('seisMeses')} · <span class="num">${fmt(total)}</span>${fin ? '' : ` ${tr('pedidos')}`}`
  return _secao({ id: 'bloco-mensal', larg: 12, titulo, meta, acoes: max ? toggle : '',
    corpo: `<div class="rel-mensal${leitura ? '' : ' so-grafico'}"><div class="rel-mensal-graf">${grafico}</div>${leitura}</div>` })
}

// Categoria e empresa lado a lado, na mesma escala: a barra é a fatia do total
export function _blocoDinheiro(D) {
  const fin = _podeVerFinanceiro()
  const met = x => fin ? x.valor : x.qtd
  const total = fin ? D.gasto : D.ped.length
  const top = (itens, n) => {
    if (itens.length <= n) return itens
    const resto = itens.slice(n - 1)
    return [...itens.slice(0, n - 1), { id: '__outras__', valor: resto.reduce((s, x) => s + x.valor, 0), qtd: resto.reduce((s, x) => s + x.qtd, 0) }]
  }
  const cats = top(D.porCategoria, 6)
  const tons = _tonsDaLista(cats.map(x => x.id))
  const corCat = x => x.id === '__outras__' ? 'var(--rel-outras)' : `var(--rel-${tons[x.id]})`
  const nomeCat = x => x.id === '__outras__' ? tr('outras') : _nomeCategoria(x.id)

  const porForn = R.filtroEmp !== 'todas' && fin
  const seg = porForn ? top(D.porFornecedor, 6) : top(D.porEmpresa, 6)
  const nomeSeg = x => x.id === '__outras__' ? tr('outras') : porForn ? (x.id || tr('semFornecedor')) : _nomeEmpresa(x.id)

  const lista = (itens, nome, cor, cls) => `<ul class="rel-barras ${cls}">${itens.map(x => {
    const p = _pct(met(x), total)
    const largura = total ? (met(x) / total) * 100 : 0
    return `<li class="rel-barra-item" data-estilo="--cor:${cor(x)}">
      <div class="rel-barra-topo">
        <span class="rel-barra-cor" aria-hidden="true"></span>
        <span class="rel-barra-nome">${esc(nome(x))}${fin ? `<span class="rel-barra-qtd">${_plural(x.qtd, tr('pedido'), tr('pedidos'))}</span>` : ''}</span>
        <span class="rel-barra-valor num">${fin ? _brl(x.valor) : x.qtd}</span>
        <span class="rel-barra-pct num">${p}%</span>
      </div>
      <div class="rel-trilho" aria-hidden="true"><span data-estilo="width:${Math.max(largura, 0.6)}%"></span></div>
    </li>`
  }).join('')}</ul>`

  const coluna = (titulo, corpo) => `<div class="rel-dinheiro-col"><h3 class="rel-subtit">${titulo}</h3>${corpo}</div>`
  const vazio = `<p class="rel-vazio-linha">${tr('vazioCompras')}</p>`
  const corpo = `<div class="rel-dinheiro">
    ${coluna(tr('porCategoria'), cats.length ? lista(cats, nomeCat, corCat, 'rel-barras-cat') : vazio)}
    ${coluna(porForn ? tr('porFornecedor') : tr('porEmpresa'), seg.length ? lista(seg, nomeSeg, () => 'var(--rel-neutra)', 'rel-barras-seg') : vazio)}
  </div>`
  const meta = fin
    ? `<span class="num">${_brl(D.gasto)}</span> · ${_plural(D.compras, tr('compra1'), tr('compraN'))}`
    : `<span class="num">${_plural(D.ped.length, tr('pedido'), tr('pedidos'))}</span>`
  return _secao({ id: 'bloco-dinheiro', larg: 12, titulo: fin ? tr('tDinheiro') : tr('tDinheiroQtd'), meta, corpo })
}

export function _estadoVenc(iso) {
  const diff = _diasEntre(_iso(_hoje()), iso)
  if (diff < 0) return `<span class="rel-estado atraso" data-estilo="--cor:var(--red)">${diff === -1 ? tr('vencidaHa1') : tr('vencidaHaN', { n: -diff })}</span>`
  if (diff === 0) return `<span class="rel-estado forte" data-estilo="--cor:var(--amber)">${tr('venceHoje')}</span>`
  if (diff === 1) return `<span class="rel-estado" data-estilo="--cor:var(--amber)">${tr('venceAmanha')}</span>`
  return `<span class="rel-estado sem-ponto">${tr('emDias', { n: diff })}</span>`
}
export const _cod = p => p?.numeroPedido ? `<span class="rel-cod">${esc(p.numeroPedido)}</span>` : ''

export function _blocoParcelas(D, larg) {
  const lista = D.proximas
  const totalAberto = lista.reduce((s, p) => s + (Number(p.valor) || 0), 0)
  if (!lista.length) {
    return _secao({ id: 'bloco-parcelas', larg, titulo: tr('tParcelas'), meta: tr('proximos30'),
      corpo: _vazio(tr('vazioParcelasTit'), tr('vazioParcelasTxt')) })
  }
  const loc = _locale()
  const linhas = lista.slice(0, 6).map(pc => {
    const p = R.todos.find(x => x.id === pc.pedidoId)
    const d = _deIso(pc.vencimento)
    return `<li><button type="button" class="rel-linha" data-pedido="${esc(pc.pedidoId)}">
      <span class="rel-data" title="${dataAbsoluta(d)}"><strong>${_pad(d.getDate())}</strong><small>${d.toLocaleDateString(loc, { month: 'short' }).replace('.', '')}</small></span>
      <span class="rel-linha-txt">
        <span class="rel-linha-tit">${esc(p?.titulo || '—')}</span>
        <span class="rel-linha-sub">${_cod(p)}<span>${tr('colParcela')} ${pc.numero}/${pc.total}</span></span>
      </span>
      <span class="rel-linha-fim">
        <span class="rel-linha-valor num">${_brl(pc.valor)}</span>
        ${_estadoVenc(pc.vencimento)}
      </span>
    </button></li>`
  }).join('')
  const meta = `<span class="num">${_brl(totalAberto)}</span> · ${tr('totalParcelas', { n: lista.length })} · ${tr('proximos30').toLowerCase()}`
  return _secao({ id: 'bloco-parcelas', larg, titulo: tr('tParcelas'), meta, corpo: `<ul class="rel-linhas">${linhas}</ul>` })
}

export function _blocoMaiores(D) {
  const linhas = D.maiores.map((p, i) => `
    <li><button type="button" class="rel-linha" data-pedido="${esc(p.id)}">
      <span class="rel-rank" aria-hidden="true">${_pad(i + 1)}</span>
      <span class="rel-linha-txt">
        <span class="rel-linha-tit">${esc(p.titulo)}</span>
        <span class="rel-linha-sub">${_cod(p)}<span>${esc(_nomeEmpresa(p.empresaId))}</span><span>${esc(_nomeCategoria(p.categoriaId))}</span></span>
      </span>
      <span class="rel-linha-fim">
        <span class="rel-linha-valor num">${_brl(p.valorFinal)}</span>
        <span class="rel-estado" data-estilo="--cor:${COR_DA_ETAPA[p.status] || 'var(--text3)'}">${STATUS_LABEL[p.status] || p.status}</span>
      </span>
    </button></li>`).join('')
  return _secao({ id: 'bloco-maiores', larg: 6, titulo: tr('tMaiores'), meta: tr('compradasPeriodo'), corpo: `<ul class="rel-linhas">${linhas}</ul>` })
}

export function _blocoFila(D) {
  const fila = [...D.emAprov].sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || (_dataPedido(a) || 0) - (_dataPedido(b) || 0))
  if (!fila.length) return _secao({ id: 'bloco-fila', larg: 12, titulo: tr('tFila'), corpo: _vazio(tr('vazioFilaTit'), tr('vazioFilaTxt')) })
  const linhas = fila.slice(0, 6).map((p, i) => {
    const d = _isoPedido(p)
    const dias = d ? _diasEntre(d, _iso(_hoje())) : 0
    const ha = dias <= 0 ? tr('hojeCurto') : dias === 1 ? tr('haDia') : tr('haDias', { n: dias })
    return `<li><button type="button" class="rel-linha" data-pedido="${esc(p.id)}">
      <span class="rel-rank" aria-hidden="true">${_pad(i + 1)}</span>
      <span class="rel-linha-txt">
        <span class="rel-linha-tit">${esc(p.titulo)}</span>
        <span class="rel-linha-sub">${_cod(p)}<span>${esc(_nomeEmpresa(p.empresaId))}</span><span>${esc(_nomeCategoria(p.categoriaId))}</span></span>
      </span>
      <span class="rel-linha-fim">
        <span class="rel-quando">${_capital(ha)}</span>
        ${p.urgente ? `<span class="rel-estado forte" data-estilo="--cor:var(--red)">${t('urgente')}</span>` : ''}
      </span>
    </button></li>`
  }).join('')
  return _secao({ id: 'bloco-fila', larg: 12, titulo: tr('tFila'), meta: `<span class="num">${_plural(fila.length, tr('pedido'), tr('pedidos'))}</span> · ${tr('agoraSub').toLowerCase()}`, corpo: `<ul class="rel-linhas">${linhas}</ul>` })
}

// Tempo do processo: ciclo (da abertura à compra e ao pagamento) à esquerda,
// mediana de cada etapa à direita, com o gargalo em tinta; depois, para quem
// gere a equipe, a cotação e a compra de cada comprador
export function _blocoProcesso(D) {
  const P = D.processo
  const meta = tr('processoMeta', { ini: formatDate(D.iv.ini), fim: formatDate(D.iv.fim) })
  const temDados = P.ciclo.compra.n || P.ciclo.pagamento.n || P.etapas.some(e => e.n || e.agora)
  if (!temDados) {
    return _secao({ id: 'bloco-processo', larg: 12, titulo: tr('tProcesso'), meta,
      corpo: _vazio(tr('semProcessoTit'), tr('semProcessoTxt', { ini: formatDate(D.iv.ini), fim: formatDate(D.iv.fim) })) })
  }
  const ciclo = (rotulo, r) => `
    <div class="rel-ciclo-item">
      <span class="rel-ciclo-valor">${r.n ? formatarDuracao(r.mediana) : '—'}</span>
      <span class="rel-ciclo-rot">${rotulo}</span>
      <span class="rel-ciclo-sub">${r.n
        ? `${r.n === 1 ? tr('medianaDe1') : tr('medianaDeN', { n: r.n })}${r.n > 1 ? ` · ${tr('ate85', { p: formatarDuracao(r.p85) })}` : ''}`
        : tr('semCiclo')}</span>
    </div>`
  const maior = Math.max(0, ...P.etapas.map(e => e.mediana || 0))
  const linhas = P.etapas.map((e, i) => {
    const gargalo = e.status === P.gargalo
    const larg = maior && e.mediana ? Math.max(e.mediana / maior * 100, 2) : 0
    const partes = []
    if (e.n) partes.push(e.n === 1 ? tr('etapaPassagens1') : tr('etapaPassagensN', { n: e.n }))
    if (e.n > 1) partes.push(tr('ate85', { p: formatarDuracao(e.p85) }))
    if (e.agora) partes.push(e.agora === 1 ? tr('etapaAgora1', { d: formatarDuracao(e.maisAntigo) }) : tr('etapaAgoraN', { n: e.agora, d: formatarDuracao(e.maisAntigo) }))
    return `
      <li class="tempo-item rel-tempo${gargalo ? ' maior' : ''}${e.n ? '' : ' vazio'}">
        <span class="tempo-num" aria-hidden="true">${_pad(i + 1)}</span>
        <span class="tempo-nome">${STATUS_LABEL[e.status]}${gargalo ? `<span class="rel-gargalo" title="${tr('gargaloTitle')}">${tr('gargalo')}</span>` : ''}</span>
        <span class="tempo-dur">${e.n ? formatarDuracao(e.mediana) : '—'}</span>
        <span class="tempo-barra" aria-hidden="true"><span data-estilo="width:${larg.toFixed(1)}%"></span></span>
        <span class="rel-tempo-sub">${partes.length ? partes.join(' · ') : tr('etapaSem')}</span>
      </li>`
  }).join('')
  const corpo = `
    <div class="rel-processo">
      <div class="rel-ciclo">${ciclo(tr('cicloCompra'), P.ciclo.compra)}${ciclo(tr('cicloPago'), P.ciclo.pagamento)}</div>
      <ol class="tempo-lista rel-tempos" aria-label="${tr('temposAria')}">${linhas}</ol>
    </div>`
  const gere = [PERFIS.SUPREMO, PERFIS.GESTOR].includes(sessao.usuario?.perfil)
  return _secao({ id: 'bloco-processo', larg: 12, titulo: tr('tProcesso'), meta, corpo }) +
    (gere && P.compradores.length ? _blocoCompradores(P.compradores) : '')
}

export function _blocoCompradores(lista) {
  const med = r => r.n ? formatarDuracao(r.mediana) : '—'
  const corpo = `<div class="rel-tabela-wrap"><table class="rel-tabela">
    <thead><tr><th>${tr('colComprador')}</th><th class="dir">${tr('colCotacoes')}</th><th class="dir">${tr('colMedCotacao')}</th><th class="dir">${tr('colCompras')}</th><th class="dir">${tr('colMedCompra')}</th></tr></thead>
    <tbody>${lista.map(c => `<tr><td>${esc(c.nome)}</td><td class="dir num">${c.cotacao.n}</td><td class="dir num">${med(c.cotacao)}</td><td class="dir num">${c.compra.n}</td><td class="dir num">${med(c.compra)}</td></tr>`).join('')}</tbody>
  </table></div>`
  return _secao({ id: 'bloco-compradores', larg: 12, titulo: tr('tCompradores'), meta: tr('compradoresMeta'), corpo })
}

// Régua das sete etapas, como o cabeçalho do quadro: numeral por etapa
export function _blocoEtapas(D) {
  const fin = _podeVerFinanceiro()
  const total = D.ped.length
  const celula = (s, fora = false) => {
    const n = D.porStatus[s] || 0
    const sub = !n ? '—' : fin ? _brlCompacto(D.valorStatus[s] || 0) : `${_pct(n, total)}%`
    return `<li class="rel-etapa${fora ? ' fora' : ''}${n ? '' : ' zero'}">
      <span class="rel-etapa-num">${_pad(n)}</span>
      <span class="rel-etapa-nome">${STATUS_LABEL[s]}</span>
      <span class="rel-etapa-sub num">${sub}</span>
    </li>`
  }
  const corpo = `<ol class="rel-etapas" aria-label="${tr('etapasAria')}">
    ${ETAPAS.map(s => celula(s)).join('')}
    <li class="rel-etapas-sep" aria-hidden="true"></li>
    ${FORA.map(s => celula(s, true)).join('')}
  </ol>`
  const meta = total === 1 ? tr('etapasMeta1') : tr('etapasMetaN', { n: total })
  return _secao({ id: 'bloco-etapas', larg: 12, titulo: tr('tEtapas'), meta, corpo })
}

// ── Dica do gráfico de colunas ────────────────────────────────
export function _temHover() { try { return matchMedia('(hover: hover) and (pointer: fine)').matches } catch { return true } }
export function _ligarDicas() {
  document.querySelectorAll('#bloco-mensal .rel-col').forEach(col => {
    // Só mouse de verdade abre a dica no hover; no toque ela abre pelo clique.
    // pointermove (e não pointerenter): só movimento real do mouse abre a dica,
    // não a mudança de layout que coloca a coluna sob um cursor parado
    col.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && _temHover() && !col.classList.contains('ativa')) _mostrarDica(col) })
    col.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') _esconderDica() })
    col.addEventListener('focus', () => { if (col.matches(':focus-visible')) _mostrarDica(col) })
    col.addEventListener('blur', _esconderDica)
  })
}
export function _mostrarDica(col) {
  const dica = document.getElementById('rel-dica')
  if (!dica) return
  document.querySelectorAll('.rel-col.ativa').forEach(c => c.classList.remove('ativa'))
  col.classList.add('ativa')
  dica.innerHTML = `<span class="rel-dica-tit">${col.dataset.titulo}</span><strong class="num">${col.dataset.valor}</strong>${col.dataset.sub ? `<span class="rel-dica-sub">${col.dataset.sub}</span>` : ''}`
  dica.hidden = false
  const barra = col.querySelector('.rel-col-barra')
  const r = (barra && barra.offsetHeight > 2 ? barra : col).getBoundingClientRect()
  const w = dica.offsetWidth, h = dica.offsetHeight
  let x = r.left + r.width / 2 - w / 2
  x = Math.max(8, Math.min(x, document.documentElement.clientWidth - w - 8))
  let y = r.top - h - 10
  if (y < 64) y = r.top + 10
  dica.style.left = x + 'px'
  dica.style.top = y + 'px'
}
export function _esconderDica() {
  const dica = document.getElementById('rel-dica')
  if (dica) dica.hidden = true
  document.querySelectorAll('.rel-col.ativa').forEach(c => c.classList.remove('ativa'))
}
