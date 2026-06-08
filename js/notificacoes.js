import { db, collection, query, where, onSnapshot, updateDoc, doc, getDocs, writeBatch } from './firebase.js'
import { sessao } from './app.js'
import { EVENTOS, EVENTOS_ICON_CLASS } from './constants.js'
import { formatTimestamp } from './utils.js'

let _unsubNotif = null

const ICONES_SVG = {
  [EVENTOS.PEDIDO_URGENTE]:    '<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  [EVENTOS.AG_COTACAO]:        '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/></svg>',
  [EVENTOS.PEDIDO_APROVADO]:   '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  [EVENTOS.PEDIDO_REPROVADO]:  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  [EVENTOS.PARCELA_VENCENDO]:  '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  [EVENTOS.PARCELA_VENCIDA]:   '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
}

const ICONE_DEFAULT = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'

export function renderNotificacoes() {
  if (!sessao.usuario) return
  if (_unsubNotif) _unsubNotif()

  const uid = sessao.usuario.id
  const q   = query(
    collection(db, 'notificacoes', uid, 'items'),
    where('lida', '==', false)
  )

  _unsubNotif = onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => _tsMs(b.criadoEm) - _tsMs(a.criadoEm))

    _atualizarBadge(items.length)
    _renderDropdown(items)
  })
}

function _atualizarBadge(count) {
  const badge = document.getElementById('notif-count')
  if (!badge) return
  badge.textContent = count > 9 ? '9+' : String(count)
  badge.style.display = count > 0 ? 'flex' : 'none'
}

function _renderDropdown(items) {
  const dropdown = document.getElementById('notif-dropdown')
  if (!dropdown) return

  dropdown.innerHTML = `
    <div class="notif-header">
      <h3>Notificações</h3>
      ${items.length ? `<button id="btn-marcar-todas">Marcar todas como lidas</button>` : ''}
    </div>
    <div class="notif-list" id="notif-list">
      ${items.length ? items.slice(0,15).map(_renderItem).join('') : `
        <div class="notif-empty">
          <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="opacity:0.3;margin-bottom:0.5rem">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          <span>Nenhuma notificação</span>
        </div>
      `}
    </div>
    <div class="notif-footer">
      <a href="#" onclick="event.preventDefault()">Ver todas as notificações</a>
    </div>
  `

  // Marcar todas como lidas
  document.getElementById('btn-marcar-todas')?.addEventListener('click', async () => {
    const uid = sessao.usuario.id
    const snap = await getDocs(query(collection(db, 'notificacoes', uid, 'items'), where('lida', '==', false)))
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.update(d.ref, { lida: true }))
    await batch.commit()
  })

  // Marcar individual ao clicar
  document.querySelectorAll('.notif-item[data-id]').forEach(item => {
    item.addEventListener('click', async () => {
      const uid = sessao.usuario.id
      const id  = item.dataset.id
      const pedidoId = item.dataset.pedido
      await updateDoc(doc(db, 'notificacoes', uid, 'items', id), { lida: true })
      if (pedidoId) {
        const { navegar } = await import('./app.js')
        navegar('detalhe', { id: pedidoId })
        dropdown.classList.remove('open')
      }
    })
  })
}

function _renderItem(n) {
  const iconClass = EVENTOS_ICON_CLASS[n.evento] || 'notif-icon-gold'
  const icone     = ICONES_SVG[n.evento] || ICONE_DEFAULT
  return `
    <div class="notif-item unread" data-id="${n.id}" ${n.pedidoId ? `data-pedido="${n.pedidoId}"` : ''}>
      <div class="notif-icon ${iconClass}">${icone}</div>
      <div class="notif-body">
        <p>${n.titulo || n.corpo || 'Nova notificação'}</p>
        <div class="notif-time">${formatTimestamp(n.criadoEm)}</div>
      </div>
    </div>
  `
}

function _tsMs(ts) {
  if (!ts) return 0
  return ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime()
}
