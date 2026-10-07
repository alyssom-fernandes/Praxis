import { db, collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc, getDocs, writeBatch } from './firebase.js'
import { sessao, registrarLimpador } from './app.js'
import { prxToast } from './ui.js'
import { EVENTOS, t } from './constants.js'
import { formatTimestamp } from './utils.js'

// Painel de notificações da topbar: as mais recentes (lidas e não lidas),
// com contador das não lidas no sino. As Cloud Functions gravam o campo
// "criadaEm"; versões antigas usavam "criadoEm" — os dois são aceitos.

const MAX_ITENS = 30
let _unsubNotif = null
let _itens = []

const _svg = (corpo, extra = '') => `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"${extra}>${corpo}</svg>`
const ICO = {
  raio:    _svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'),
  doc:     _svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
  check:   _svg('<polyline points="20 6 9 17 4 12"/>'),
  x:       _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  relogio: _svg('<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>'),
  balao:   _svg('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'),
  pessoa:  _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  caixa:   _svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
  info:    _svg('<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>'),
}

const ICONE_POR_EVENTO = {
  [EVENTOS.PEDIDO_URGENTE]:   ICO.raio,
  [EVENTOS.AG_COTACAO]:       ICO.doc,
  [EVENTOS.PEDIDO_APROVADO]:  ICO.check,
  [EVENTOS.PEDIDO_REPROVADO]: ICO.x,
  [EVENTOS.PARCELA_VENCENDO]: ICO.relogio,
  [EVENTOS.PARCELA_VENCIDA]:  ICO.relogio,
  comprador_assumiu:          ICO.pessoa,
  cotacoes_prontas:           ICO.doc,
  pedido_cancelado:           ICO.x,
  pedido_comprado:            ICO.caixa,
  pedido_entregue:            ICO.caixa,
  pedido_entregue_solic:      ICO.caixa,
  mencao_comentario:          ICO.balao,
  pedido_parado:              ICO.relogio,
}

function _esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function _quando(n) { return n.criadaEm || n.criadoEm || null }

export function renderNotificacoes() {
  if (!sessao.usuario) return
  if (_unsubNotif) _unsubNotif()

  const uid = sessao.usuario.id
  const q   = query(
    collection(db, 'notificacoes', uid, 'items'),
    orderBy('criadaEm', 'desc'),
    limit(MAX_ITENS),
  )

  // Enquanto a primeira leitura não chega, o painel já tem cabeçalho e estado vazio
  _renderDropdown(_itens)

  _unsubNotif = onSnapshot(q, snap => {
    _itens = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => _tsMs(_quando(b)) - _tsMs(_quando(a)))
    _atualizar()
  }, err => {
    console.warn('Notificações indisponíveis:', err?.code || err?.message)
  })

  registrarLimpador(() => {
    if (_unsubNotif) { _unsubNotif(); _unsubNotif = null }
    _atualizarBadge(0)
  })
}

function _atualizar() {
  _atualizarBadge(_itens.filter(n => !n.lida).length)
  _renderDropdown(_itens)
}

function _atualizarBadge(count) {
  const badge = document.getElementById('notif-count')
  const btn   = document.getElementById('btn-notif')
  if (btn) {
    const base = t('tooltipNotificacoes')
    btn.setAttribute('aria-label', count > 0 ? `${base}: ${count} ${count === 1 ? t('notifNovaUma') : t('notifNovasVarias')}` : base)
  }
  if (!badge) return
  badge.textContent = count > 9 ? '9+' : String(count)
  badge.style.display = count > 0 ? 'flex' : 'none'
}

function _renderDropdown(items) {
  const dropdown = document.getElementById('notif-dropdown')
  if (!dropdown) return
  const naoLidas = items.filter(n => !n.lida).length

  // Cabeçalho da inscrição: rótulo espaçado e, quando há, o numeral das novas
  dropdown.innerHTML = `
    <div class="notif-header">
      <div class="notif-header-titulo">
        <h3 id="notif-titulo">${t('tooltipNotificacoes')}</h3>
        ${naoLidas ? `<span class="notif-header-conta"><b class="numeral">${String(naoLidas).padStart(2, '0')}</b> ${naoLidas === 1 ? t('notifNovaUma') : t('notifNovasVarias')}</span>` : ''}
      </div>
      ${naoLidas ? `<button type="button" class="notif-marcar" id="btn-marcar-todas">${t('notifMarcarTodas')}</button>` : ''}
    </div>
    <div class="notif-list" id="notif-list">
      ${items.length ? items.slice(0, MAX_ITENS).map(_renderItem).join('') : `
        <div class="notif-empty">
          <span class="notif-empty-n numeral" aria-hidden="true">00</span>
          <strong>${t('notifVazioTitulo')}</strong>
          <span>${t('notifVazioTexto')}</span>
        </div>
      `}
    </div>
  `
  dropdown.setAttribute('aria-labelledby', 'notif-titulo')

  // Marcar todas como lidas — otimista: atualiza a lista já, restaura se falhar
  document.getElementById('btn-marcar-todas')?.addEventListener('click', async (e) => {
    e.stopPropagation()
    const uid = sessao.usuario.id
    const antes = _itens
    _itens = _itens.map(n => ({ ...n, lida: true }))
    _atualizar()
    try {
      const snap = await getDocs(query(collection(db, 'notificacoes', uid, 'items'), where('lida', '==', false)))
      const batch = writeBatch(db)
      snap.docs.forEach(d => batch.update(d.ref, { lida: true }))
      await batch.commit()
    } catch {
      _itens = antes
      _atualizar()
      prxToast(t('erroMarcarLidas'), 'error')
    }
  })

  // Clique numa notificação: marca como lida e abre o pedido
  dropdown.querySelectorAll('.notif-item[data-id]').forEach(item => {
    item.addEventListener('click', async () => {
      const uid = sessao.usuario.id
      const id  = item.dataset.id
      const pedidoId = item.dataset.pedido
      const alvo = _itens.find(n => n.id === id)

      if (alvo && !alvo.lida) {
        const antes = _itens
        _itens = _itens.map(n => n.id === id ? { ...n, lida: true } : n)
        _atualizar()
        updateDoc(doc(db, 'notificacoes', uid, 'items', id), { lida: true }).catch(() => {
          _itens = antes
          _atualizar()
          prxToast(t('erroMarcarLida'), 'error')
        })
      }

      if (pedidoId) {
        dropdown.classList.remove('open')
        document.getElementById('btn-notif')?.setAttribute('aria-expanded', 'false')
        const { navegar } = await import('./app.js')
        navegar('detalhe', { id: pedidoId })
      }
    })
  })
}

function _renderItem(n) {
  const icone     = ICONE_POR_EVENTO[n.evento] || ICO.info
  const titulo    = n.titulo || t('novaNotificacao')
  const corpo     = n.titulo && n.corpo ? n.corpo : ''
  const quando    = formatTimestamp(_quando(n))
  return `
    <button type="button" class="notif-item ${n.lida ? 'lida' : 'unread'}" data-id="${_esc(n.id)}" ${n.pedidoId ? `data-pedido="${_esc(n.pedidoId)}"` : ''}>
      <span class="notif-icon" aria-hidden="true">${icone}</span>
      <span class="notif-body">
        <span class="notif-titulo">${_esc(titulo)}</span>
        ${corpo ? `<span class="notif-corpo">${_esc(corpo)}</span>` : ''}
        ${quando ? `<span class="notif-time">${_esc(quando)}</span>` : ''}
      </span>
      ${n.lida ? '' : `<span class="notif-ponto" aria-hidden="true"></span><span class="sr-only">${t('notifNaoLida')}</span>`}
    </button>
  `
}

function _tsMs(ts) {
  if (!ts) return 0
  return ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime()
}
