import {
  db, storage,
  doc, getDoc, collection, getDocs, addDoc, updateDoc, onSnapshot,
  query, where,
  runTransaction, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL,
} from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter } from './app.js'
import { prxToast, prxConfirm, prxAlert, mostrarSpinner, esconderSpinner } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL, STATUS_COLOR,
  PERFIS, MOTIVOS_REPROVACAO, MOTIVOS_CANCELAMENTO,
  CONDICAO_PAGAMENTO, STORAGE_PATHS,
} from './constants.js'
import {
  formatCurrency, formatDate, formatTimestamp, gerarIniciais,
  hojeISO, dataEhPassado, dataEhProximos, normalizarTexto, parseMoeda,
} from './utils.js'

let _unsubPedido = null
let _pedidoId    = null
let _pedido      = null
let _cotacoes    = []
let _comentarios = []
let _historico   = []
let _parcelas    = []
let _empresas    = []
let _categorias  = []
let _usuarios    = []

// ── Render ────────────────────────────────────────────────────
export async function renderDetalhe(pedidoId) {
  if (!pedidoId) { navegar('pedidos'); return }
  _pedidoId = pedidoId

  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('pedidos')}
      <div class="main-content">
        <div id="detalhe-root"></div>
      </div>
      ${renderFooter()}
    </div>
  `
  initTopbarEvents(false)
  renderNotificacoes()

  await _carregarAuxiliares()
  _iniciarListener()
}

function _iniciarListener() {
  if (_unsubPedido) _unsubPedido()
  _unsubPedido = onSnapshot(doc(db, 'pedidos', _pedidoId), async snap => {
    if (!snap.exists()) { prxToast('Pedido não encontrado.', 'error'); navegar('pedidos'); return }
    _pedido = { id: snap.id, ...snap.data() }
    await _carregarSubcollections()
    _renderDetalhe()
  })
}

async function _carregarSubcollections() {
  const [cotSnap, comSnap, histSnap, parcSnap] = await Promise.all([
    getDocs(collection(db, 'pedidos', _pedidoId, 'cotacoes')),
    getDocs(collection(db, 'pedidos', _pedidoId, 'comentarios')),
    getDocs(collection(db, 'pedidos', _pedidoId, 'historico')),
    getDocs(collection(db, 'pedidos', _pedidoId, 'parcelas')),
  ])
  _cotacoes    = cotSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _comentarios = comSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
  _historico   = histSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
  _parcelas    = parcSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.numero - b.numero)
}

async function _carregarAuxiliares() {
  const [empSnap, catSnap, usrSnap] = await Promise.all([
    getDocs(collection(db, 'empresas')),
    getDocs(collection(db, 'categorias')),
    getDocs(collection(db, 'usuarios')),
  ])
  _empresas    = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _categorias  = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _usuarios    = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Render HTML ───────────────────────────────────────────────
function _renderDetalhe() {
  const root = document.getElementById('detalhe-root')
  if (!root) return

  const p       = _pedido
  const empresa = _empresas.find(e => e.id === p.empresaId)
  const categ   = _categorias.find(c => c.id === p.categoriaId)
  const solic   = _usuarios.find(u => u.id === p.solicitanteId)
  const comprad = p.compradorId ? _usuarios.find(u => u.id === p.compradorId) : null
  const color   = STATUS_COLOR[p.status] || 'neutral'
  const label   = STATUS_LABEL[p.status] || p.status

  root.innerHTML = `
    <div class="detalhe-layout">

      <!-- Breadcrumb -->
      <nav class="breadcrumb">
        <a href="?tela=pedidos" onclick="event.preventDefault();window.__navegar('pedidos')">Pedidos</a>
        <span class="breadcrumb-sep">›</span>
        <span>#${p.id.slice(-4).toUpperCase()}</span>
      </nav>

      <!-- Card 1: Informações -->
      <div class="card no-hover" style="padding:1.75rem">
        <div class="flex items-center justify-between" style="margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem">
          <div class="flex items-center gap-3" style="flex-wrap:wrap">
            <span class="badge badge-${color}">${label}</span>
            ${p.urgente ? `<span class="badge badge-red"><svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Urgente</span>` : ''}
          </div>
          <div class="acoes-contextuais" id="acoes-wrap">
            ${_renderAcoes()}
          </div>
        </div>

        <h1 style="font-size:1.4rem;margin-bottom:1.25rem;line-height:1.3">${p.titulo}</h1>

        <div class="detalhe-meta-grid">
          <div class="meta-item"><span class="meta-label">Empresa</span><span class="meta-value">${empresa?.nome || '—'}</span></div>
          <div class="meta-item"><span class="meta-label">Quantidade</span><span class="meta-value">${p.quantidade} ${p.unidade}</span></div>
          <div class="meta-item"><span class="meta-label">Categoria</span><span class="meta-value">${categ?.nome || '—'}</span></div>
          <div class="meta-item"><span class="meta-label">Necessário até</span><span class="meta-value">${formatDate(p.dataNecessaria)}</span></div>
          <div class="meta-item"><span class="meta-label">Valor estimado</span><span class="meta-value">${p.valorEstimado ? formatCurrency(p.valorEstimado) : '—'}</span></div>
          <div class="meta-item"><span class="meta-label">Centro de custo</span><span class="meta-value">${p.centroCusto || '—'}</span></div>
          ${p.valorFinal ? `<div class="meta-item"><span class="meta-label">Valor final</span><span class="meta-value text-gold font-bold">${formatCurrency(p.valorFinal)}</span></div>` : ''}
          ${p.dataCompra  ? `<div class="meta-item"><span class="meta-label">Data da compra</span><span class="meta-value">${formatDate(p.dataCompra)}</span></div>` : ''}
          ${p.dataEntrega ? `<div class="meta-item"><span class="meta-label">Data de entrega</span><span class="meta-value">${formatDate(p.dataEntrega)}</span></div>` : ''}
        </div>

        ${p.descricao ? `
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.25rem;font-size:0.875rem;color:var(--text2);line-height:1.6">
            ${p.descricao}
          </div>
        ` : ''}

        <hr class="divider">

        <div class="detalhe-section-title">Pessoas envolvidas</div>
        <div class="pessoas-grid">
          ${_renderPessoa('Solicitante', solic, 'Criou o pedido')}
          ${_renderPessoaComprador()}
          ${_renderPessoaAprovadores()}
          ${_renderPessoaFinanceiro()}
        </div>
      </div>

      <!-- Card 2: Cotações -->
      <div class="card no-hover card-glow-blue" style="padding:1.5rem">
        <div class="flex items-center justify-between" style="margin-bottom:1rem">
          <div class="detalhe-section-title" style="margin:0">Cotações</div>
          ${_podeAnexarCotacao() ? `<button class="btn-ghost btn-sm" id="btn-add-cotacao">+ Adicionar cotação</button>` : ''}
        </div>
        <div id="cotacoes-list">
          ${_renderCotacoes()}
        </div>
      </div>

      <!-- Cards 3 e 4: Comentários + Histórico -->
      <div class="detalhe-row">

        <!-- Comentários -->
        <div class="card no-hover" style="padding:1.5rem">
          <div class="detalhe-section-title">Comentários</div>
          <div class="comment-list" id="comment-list">
            ${_renderComentarios()}
          </div>
          <div class="comment-input-wrap" style="margin-top:1rem">
            <textarea id="input-comentario" placeholder="Escreva um comentário… Use @nome para mencionar"></textarea>
            <div class="comment-actions">
              <button class="btn-icon" title="Enviar" id="btn-enviar-comentario">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Histórico -->
        <div class="card no-hover" style="padding:1.5rem">
          <div class="detalhe-section-title">Histórico</div>
          <div class="timeline" id="historico-timeline">
            ${_renderHistorico()}
          </div>
        </div>

      </div>

      <!-- Parcelas (se houver) -->
      ${_parcelas.length ? `
        <div class="card no-hover" style="padding:1.5rem">
          <div class="flex items-center justify-between" style="margin-bottom:1rem">
            <div class="detalhe-section-title" style="margin:0">Parcelas</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem" id="parcelas-list">
            ${_renderParcelas()}
          </div>
        </div>
      ` : ''}

    </div>

    <!-- Modal: Executar Compra -->
    <div class="modal-overlay" id="modal-compra">
      <div class="modal" style="max-width:600px">
        <div class="modal-header">
          <h2>Executar compra</h2>
          <button class="btn-icon" data-close="modal-compra">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid form-grid-2">
            <div class="form-group col-span-2">
              <label for="mc-fornecedor">Fornecedor *</label>
              <input type="text" id="mc-fornecedor" placeholder="Nome do fornecedor">
            </div>
            <div class="form-group">
              <label for="mc-valor">Valor final *</label>
              <input type="text" id="mc-valor" placeholder="R$ 0,00">
            </div>
            <div class="form-group">
              <label for="mc-condicao">Condição de pagamento *</label>
              <select id="mc-condicao">
                <option value="">Selecionar…</option>
                <option value="antecipado">Antecipado</option>
                <option value="apos_recebimento">Após recebimento</option>
              </select>
            </div>
            <div class="form-group">
              <label for="mc-data">Data da compra *</label>
              <input type="date" id="mc-data" value="${hojeISO()}">
            </div>
            <div class="form-group">
              <label for="mc-parcelas">Número de parcelas *</label>
              <input type="number" id="mc-parcelas" value="1" min="1" max="60">
            </div>
            <div class="form-group col-span-2">
              <label for="mc-venc1">Vencimento da 1ª parcela *</label>
              <input type="date" id="mc-venc1">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="modal-compra">Cancelar</button>
          <button class="btn-primary" id="btn-confirmar-compra">Confirmar compra</button>
        </div>
      </div>
    </div>

    <!-- Modal: Reprovar -->
    <div class="modal-overlay" id="modal-reprovar">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>Reprovar pedido</h2>
          <button class="btn-icon" data-close="modal-reprovar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom:1rem">
            <label for="reprov-motivo">Motivo *</label>
            <select id="reprov-motivo">
              <option value="">Selecionar…</option>
              ${MOTIVOS_REPROVACAO.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="reprov-outros-wrap" style="display:none">
            <label for="reprov-outros">Especifique *</label>
            <textarea id="reprov-outros" placeholder="Descreva o motivo…" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="modal-reprovar">Cancelar</button>
          <button class="btn-danger" id="btn-confirmar-reprovar">Reprovar</button>
        </div>
      </div>
    </div>

    <!-- Modal: Cancelar -->
    <div class="modal-overlay" id="modal-cancelar">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>Cancelar pedido</h2>
          <button class="btn-icon" data-close="modal-cancelar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom:1rem">
            <label for="cancel-motivo">Motivo *</label>
            <select id="cancel-motivo">
              <option value="">Selecionar…</option>
              ${MOTIVOS_CANCELAMENTO.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="cancel-outros-wrap" style="display:none">
            <label for="cancel-outros">Especifique *</label>
            <textarea id="cancel-outros" placeholder="Descreva o motivo…" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="modal-cancelar">Cancelar</button>
          <button class="btn-danger" id="btn-confirmar-cancelar">Cancelar pedido</button>
        </div>
      </div>
    </div>
  `

  _bindDetalheEvents()
}

// ── Render de partes ──────────────────────────────────────────
function _renderPessoa(papel, usuario, statusTxt) {
  const iniciais = gerarIniciais(usuario?.nome || '?')
  return `
    <div class="pessoa-card">
      <div class="pessoa-role">${papel}</div>
      <div class="pessoa-info">
        <div class="avatar avatar-sm">${iniciais}</div>
        <div>
          <div class="pessoa-name">${usuario?.nome || '—'}</div>
          <div class="pessoa-status">${statusTxt}</div>
        </div>
      </div>
    </div>
  `
}

function _renderPessoaComprador() {
  const p = _pedido
  const usuario = p.compradorId ? _usuarios.find(u => u.id === p.compradorId) : null
  const podeAssumir = _podeAssumir()
  const iniciais = gerarIniciais(usuario?.nome || '?')

  return `
    <div class="pessoa-card">
      <div class="pessoa-role">Comprador</div>
      ${usuario ? `
        <div class="pessoa-info">
          <div class="avatar avatar-sm">${iniciais}</div>
          <div>
            <div class="pessoa-name">${usuario.nome}</div>
            <div class="pessoa-status">${_cotacoes.length ? `${_cotacoes.length} cotação(ões)` : 'Sem cotações'}</div>
          </div>
        </div>
        ${_podeLiberar() ? `<button class="btn-secondary btn-sm" style="margin-top:0.5rem" id="btn-liberar">Liberar pedido</button>` : ''}
      ` : `
        <div class="pessoa-info">
          <div class="avatar avatar-sm" style="color:var(--text3)">?</div>
          <div class="pessoa-status">Aguardando comprador</div>
        </div>
        ${podeAssumir ? `<button class="btn-primary btn-sm" style="margin-top:0.5rem" id="btn-assumir">Assumir pedido</button>` : ''}
      `}
    </div>
  `
}

function _renderPessoaAprovadores() {
  const aprovadores = _pedido.aprovadorIds?.length
    ? _pedido.aprovadorIds.map(id => _usuarios.find(u => u.id === id)).filter(Boolean)
    : _usuarios.filter(u => ['aprovador','gestor','supremo'].includes(u.perfil) &&
        (sessao.usuario.perfil === 'supremo' ||
          _normEmpresas(sessao.usuario.empresas).some(e => _normEmpresas(u.empresas).includes(e))))

  const aprovadoPor = _pedido.aprovadoPor
  return `
    <div class="pessoa-card">
      <div class="pessoa-role">Aprovadores</div>
      ${aprovadores.slice(0,3).map(u => `
        <div class="pessoa-info" style="margin-top:0.4rem">
          <div class="avatar avatar-sm">${gerarIniciais(u.nome)}</div>
          <div>
            <div class="pessoa-name">${u.nome}</div>
            <div class="pessoa-status ${aprovadoPor === u.id ? 'text-green' : ''}">
              ${aprovadoPor === u.id
                ? `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="display:inline;vertical-align:middle;margin-right:2px"><polyline points="20 6 9 17 4 12"/></svg>Aprovado`
                : 'Aguardando'}
            </div>
          </div>
        </div>
      `).join('')}
      ${!aprovadores.length ? '<div class="pessoa-status">Nenhum aprovador</div>' : ''}
    </div>
  `
}

function _renderPessoaFinanceiro() {
  const fins = _usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO &&
    (sessao.usuario.perfil === 'supremo' ||
      _normEmpresas(sessao.usuario.empresas).some(e => _normEmpresas(u.empresas).includes(e))))
  const fin = fins[0]
  const totalPago = _parcelas.filter(p => p.pago).length
  const totalParc = _parcelas.length

  return `
    <div class="pessoa-card">
      <div class="pessoa-role">Financeiro</div>
      ${fin ? `
        <div class="pessoa-info">
          <div class="avatar avatar-sm">${gerarIniciais(fin.nome)}</div>
          <div>
            <div class="pessoa-name">${fin.nome}</div>
            <div class="pessoa-status">${totalParc ? `${totalPago}/${totalParc} parcelas` : 'Sem parcelas'}</div>
          </div>
        </div>
      ` : '<div class="pessoa-status">Nenhum financeiro</div>'}
    </div>
  `
}

function _renderAcoes() {
  const p = _pedido
  const uid = sessao.usuario.id
  const perfil = sessao.usuario.perfil
  const btns = []

  if (p.status === STATUS.EM_APROVACAO && ['aprovador','gestor','supremo'].includes(perfil)) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-aprovar">Aprovar</button>`)
    btns.push(`<button class="btn-danger btn-sm" id="btn-reprovar">Reprovar</button>`)
  }

  if (p.status === STATUS.APROVADO && ['comprador','gestor','supremo'].includes(perfil) &&
      (p.compradorId === uid || ['gestor','supremo'].includes(perfil))) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-executar-compra">Executar compra</button>`)
  }

  if (p.status === STATUS.COMPRADO &&
      (['comprador','gestor','supremo'].includes(perfil) || p.solicitanteId === uid)) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-confirmar-entrega">Confirmar entrega</button>`)
  }

  if (p.status === STATUS.ENTREGUE && ['financeiro','gestor','supremo'].includes(perfil)) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-confirmar-pagamento">Confirmar pagamento</button>`)
  }

  const podeCanc = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    (['gestor','supremo'].includes(perfil) && ![STATUS.ENTREGUE, STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
  )
  if (podeCanc) {
    btns.push(`<button class="btn-danger btn-sm" id="btn-cancelar">Cancelar pedido</button>`)
  }

  return btns.join('')
}

function _renderCotacoes() {
  if (!_cotacoes.length) {
    return `<div class="empty-state"><p>Nenhuma cotação adicionada ainda.</p></div>`
  }
  return _cotacoes.map(c => `
    <div class="cotacao-item ${c.indicada ? 'indicada' : ''}" style="margin-bottom:0.5rem">
      <div class="cotacao-file-icon">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/>
        </svg>
      </div>
      <div class="cotacao-info">
        <div class="cotacao-fornecedor">${c.fornecedorNome}</div>
        <div class="cotacao-sub">${c.arquivoNome || 'Arquivo'} · ${c.prazoEntrega || ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <span class="cotacao-valor">${formatCurrency(c.valor)}</span>
        ${c.indicada ? `<span class="badge badge-gold">Indicada</span>` : ''}
        ${_podeIndicarCotacao() && !c.indicada ? `<button class="btn-ghost btn-sm" data-indicar="${c.id}">Indicar</button>` : ''}
        ${c.arquivoUrl ? `<a href="${c.arquivoUrl}" target="_blank" class="btn-secondary btn-sm">Ver arquivo</a>` : ''}
      </div>
    </div>
  `).join('')
}

function _renderComentarios() {
  if (!_comentarios.length) return `<div class="empty-state" style="padding:1rem"><p>Sem comentários ainda.</p></div>`
  return _comentarios.map(c => {
    const autor = _usuarios.find(u => u.id === c.autorId)
    const texto = (c.texto || '').replace(/@(\w+)/g, '<span class="mention">@$1</span>')
    return `
      <div class="comment-item">
        <div class="avatar avatar-sm">${gerarIniciais(c.autorNome || autor?.nome || '?')}</div>
        <div class="comment-body">
          <div class="comment-header">
            <span class="comment-author">${c.autorNome || autor?.nome || 'Usuário'}</span>
            <span class="comment-time">${formatTimestamp(c.criadoEm)}</span>
          </div>
          <div class="comment-text">${texto}</div>
        </div>
      </div>
    `
  }).join('')
}

function _renderHistorico() {
  if (!_historico.length) return `<div style="color:var(--text3);font-size:0.82rem">Nenhum evento registrado.</div>`
  const dotMap = {
    [STATUS.SOLICITADO]:'dot-gray', [STATUS.AG_COTACAO]:'dot-blue', [STATUS.EM_APROVACAO]:'dot-gold',
    [STATUS.APROVADO]:'dot-green',  [STATUS.COMPRADO]:'dot-green', [STATUS.ENTREGUE]:'dot-green',
    [STATUS.PAGO]:'dot-green',      [STATUS.REPROVADO]:'dot-red',  [STATUS.CANCELADO]:'dot-red',
  }
  return _historico.map(h => `
    <div class="timeline-item">
      <div class="timeline-left">
        <div class="timeline-dot ${dotMap[h.status] || 'dot-gray'}"></div>
        <div class="timeline-line"></div>
      </div>
      <div class="timeline-body">
        <p>
          <strong>${STATUS_LABEL[h.status] || h.status}</strong>
          ${h.autorNome ? `por ${h.autorNome}` : ''}
          ${h.nota ? `<span style="color:var(--text3)"> — ${h.nota}</span>` : ''}
        </p>
        <div class="timeline-time">${formatTimestamp(h.criadoEm)}</div>
      </div>
    </div>
  `).join('')
}

function _renderParcelas() {
  return _parcelas.map(parc => {
    let classeVenc = ''
    if (!parc.pago) {
      if (dataEhPassado(parc.vencimento)) classeVenc = 'vencida'
      else if (dataEhProximos(parc.vencimento, 3)) classeVenc = 'vencendo'
    }
    return `
      <div class="parcela-item">
        <div class="parcela-numero">${parc.numero}</div>
        <div class="parcela-info">
          <div style="font-size:0.82rem;font-weight:600">${parc.numero}/${parc.total}</div>
          <div class="parcela-venc ${classeVenc}">${formatDate(parc.vencimento)}</div>
        </div>
        <div class="parcela-valor ${parc.pago ? 'parcela-pago' : ''}">${formatCurrency(parc.valor)}</div>
        ${parc.pago
          ? `<span class="badge badge-green">Pago</span>`
          : _podePagarParcela()
            ? `<button class="btn-primary btn-sm" data-pagar="${parc.id}">Confirmar</button>`
            : `<span class="badge badge-neutral">Pendente</span>`
        }
        ${parc.comprovante ? `<a href="${parc.comprovante}" target="_blank" class="btn-secondary btn-sm">Ver comprovante</a>` : ''}
        ${!parc.pago && _podePagarParcela() ? `
          <label class="btn-secondary btn-sm" style="cursor:pointer">
            Anexar
            <input type="file" accept="image/*,.pdf" data-comprov="${parc.id}" style="display:none">
          </label>
        ` : ''}
      </div>
    `
  }).join('')
}

// ── Bind de eventos ───────────────────────────────────────────
function _bindDetalheEvents() {
  // Fecha modais
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => document.getElementById(btn.dataset.close)?.classList.remove('visible'))
  })

  // Assumir pedido
  document.getElementById('btn-assumir')?.addEventListener('click', _assumirPedido)

  // Liberar claim
  document.getElementById('btn-liberar')?.addEventListener('click', _liberarClaim)

  // Aprovar
  document.getElementById('btn-aprovar')?.addEventListener('click', _aprovarPedido)

  // Reprovar — abre modal
  document.getElementById('btn-reprovar')?.addEventListener('click', () => {
    document.getElementById('modal-reprovar')?.classList.add('visible')
  })

  // Select motivo reprovação
  document.getElementById('reprov-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('reprov-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === 'Outros' ? 'block' : 'none'
  })

  // Confirmar reprovação
  document.getElementById('btn-confirmar-reprovar')?.addEventListener('click', _reprovarPedido)

  // Executar compra — abre modal
  document.getElementById('btn-executar-compra')?.addEventListener('click', () => {
    document.getElementById('modal-compra')?.classList.add('visible')
  })

  // Confirmar compra
  document.getElementById('btn-confirmar-compra')?.addEventListener('click', _executarCompra)

  // Confirmar entrega
  document.getElementById('btn-confirmar-entrega')?.addEventListener('click', _confirmarEntrega)

  // Confirmar pagamento total
  document.getElementById('btn-confirmar-pagamento')?.addEventListener('click', _confirmarPagamento)

  // Cancelar — abre modal
  document.getElementById('btn-cancelar')?.addEventListener('click', () => {
    document.getElementById('modal-cancelar')?.classList.add('visible')
  })

  document.getElementById('cancel-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('cancel-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === 'Outros' ? 'block' : 'none'
  })

  document.getElementById('btn-confirmar-cancelar')?.addEventListener('click', _cancelarPedido)

  // Enviar comentário
  document.getElementById('btn-enviar-comentario')?.addEventListener('click', _enviarComentario)
  document.getElementById('input-comentario')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) _enviarComentario()
  })

  // Indicar cotação
  document.querySelectorAll('[data-indicar]').forEach(btn => {
    btn.addEventListener('click', () => _indicarCotacao(btn.dataset.indicar))
  })

  // Adicionar cotação
  document.getElementById('btn-add-cotacao')?.addEventListener('click', _mostrarModalCotacao)

  // Confirmar pagamento de parcela
  document.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.addEventListener('click', () => _pagarParcela(btn.dataset.pagar))
  })

  // Anexar comprovante
  document.querySelectorAll('input[data-comprov]').forEach(inp => {
    inp.addEventListener('change', e => {
      const file = e.target.files[0]
      if (file) _anexarComprovante(inp.dataset.comprov, file)
    })
  })
}

// ── Ações de workflow ─────────────────────────────────────────
async function _assumirPedido() {
  const ok = await prxConfirm('Assumir este pedido?', 'Você será o comprador responsável.', 'Assumir', 'Cancelar')
  if (!ok) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().compradorId !== null) throw new Error('Pedido já foi assumido por outro comprador.')
      tx.update(ref, {
        compradorId: sessao.usuario.id,
        compradorAssumiuEm: serverTimestamp(),
        status: STATUS.AG_COTACAO,
        atualizadoEm: serverTimestamp(),
      })
    })
    await _registrarHistorico(STATUS.AG_COTACAO, 'Comprador assumiu o pedido')
    prxToast('Pedido assumido!', 'success')
  } catch (err) {
    prxToast(err.message || 'Erro ao assumir pedido.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _liberarClaim() {
  const ok = await prxConfirm('Liberar este pedido?', 'O comprador atual será removido e o pedido voltará para a fila.', 'Liberar', 'Cancelar', true)
  if (!ok) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      compradorId: null,
      compradorAssumiuEm: null,
      status: STATUS.SOLICITADO,
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.SOLICITADO, 'Claim liberado pelo gestor')
    prxToast('Pedido liberado para a fila.', 'success')
  } catch (err) {
    prxToast('Erro ao liberar pedido.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _aprovarPedido() {
  const ok = await prxConfirm('Aprovar este pedido?', '', 'Aprovar', 'Cancelar')
  if (!ok) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().status !== STATUS.EM_APROVACAO) throw new Error('Este pedido já foi processado por outro aprovador.')
      tx.update(ref, {
        status: STATUS.APROVADO,
        aprovadoPor: sessao.usuario.id,
        aprovadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      })
    })
    await _registrarHistorico(STATUS.APROVADO)
    prxToast('Pedido aprovado!', 'success')
  } catch (err) {
    prxToast(err.message || 'Erro ao aprovar.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _reprovarPedido() {
  const motivo = document.getElementById('reprov-motivo')?.value
  const outros = document.getElementById('reprov-outros')?.value.trim()
  if (!motivo || (motivo === 'Outros' && !outros)) {
    prxToast('Selecione um motivo.', 'error')
    return
  }
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().status !== STATUS.EM_APROVACAO) throw new Error('Este pedido já foi processado por outro aprovador.')
      tx.update(ref, {
        status: STATUS.REPROVADO,
        reprovadoPor: sessao.usuario.id,
        reprovadoEm: serverTimestamp(),
        motivoReprovacao: motivo,
        motivoReprovacaoOutros: motivo === 'Outros' ? outros : null,
        atualizadoEm: serverTimestamp(),
      })
    })
    await _registrarHistorico(STATUS.REPROVADO, motivo === 'Outros' ? outros : motivo)
    document.getElementById('modal-reprovar')?.classList.remove('visible')
    prxToast('Pedido reprovado.', 'info')
  } catch (err) {
    prxToast(err.message || 'Erro ao reprovar.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _executarCompra() {
  const fornecedor = document.getElementById('mc-fornecedor')?.value.trim()
  const valorStr   = document.getElementById('mc-valor')?.value.trim()
  const condicao   = document.getElementById('mc-condicao')?.value
  const dataCompra = document.getElementById('mc-data')?.value
  const numParc    = parseInt(document.getElementById('mc-parcelas')?.value) || 1
  const venc1      = document.getElementById('mc-venc1')?.value
  const valorFinal = parseMoeda(valorStr)

  if (!fornecedor || !valorFinal || !condicao || !dataCompra || !venc1) {
    prxToast('Preencha todos os campos obrigatórios.', 'error')
    return
  }
  mostrarSpinner()
  try {
    // Busca ou cria fornecedor
    const nomeNorm = normalizarTexto(fornecedor)
    const fornSnap = await getDocs(query(collection(db, 'fornecedores'), where('nome', '==', nomeNorm)))
    let fornecedorId
    if (fornSnap.empty) {
      const novForn = await addDoc(collection(db, 'fornecedores'), {
        nome: nomeNorm, nomeOriginal: fornecedor, cnpj: '', criadoEm: serverTimestamp(), usos: 1,
      })
      fornecedorId = novForn.id
    } else {
      fornecedorId = fornSnap.docs[0].id
      await updateDoc(doc(db, 'fornecedores', fornecedorId), { usos: (fornSnap.docs[0].data().usos || 0) + 1 })
    }

    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.COMPRADO,
      fornecedorId,
      valorFinal,
      condicaoPagamento: condicao,
      dataCompra,
      atualizadoEm: serverTimestamp(),
    })

    // Cria parcelas
    const valorParcela = valorFinal / numParc
    const venc1Date = new Date(venc1 + 'T00:00:00')
    for (let i = 0; i < numParc; i++) {
      const d = new Date(venc1Date)
      d.setMonth(d.getMonth() + i)
      const vencISO = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      await addDoc(collection(db, 'pedidos', _pedidoId, 'parcelas'), {
        numero: i + 1, total: numParc,
        valor: valorParcela, vencimento: vencISO,
        pago: false, pagoEm: null, comprovante: null,
      })
    }

    await _registrarHistorico(STATUS.COMPRADO, `Fornecedor: ${fornecedor} · ${formatCurrency(valorFinal)}`)
    document.getElementById('modal-compra')?.classList.remove('visible')
    prxToast('Compra registrada!', 'success')
  } catch (err) {
    prxToast('Erro ao registrar compra.', 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

async function _confirmarEntrega() {
  const ok = await prxConfirm('Confirmar recebimento?', 'Certifique-se de que o produto/serviço foi recebido.', 'Confirmar', 'Cancelar')
  if (!ok) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.ENTREGUE,
      dataEntrega: hojeISO(),
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.ENTREGUE)
    prxToast('Entrega confirmada!', 'success')
  } catch (err) {
    prxToast('Erro ao confirmar entrega.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _confirmarPagamento() {
  const ok = await prxConfirm('Confirmar pagamento total?', '', 'Confirmar', 'Cancelar')
  if (!ok) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.PAGO,
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.PAGO)
    prxToast('Pagamento confirmado!', 'success')
  } catch (err) {
    prxToast('Erro ao confirmar pagamento.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _cancelarPedido() {
  const motivo = document.getElementById('cancel-motivo')?.value
  const outros = document.getElementById('cancel-outros')?.value.trim()
  if (!motivo || (motivo === 'Outros' && !outros)) {
    prxToast('Selecione um motivo.', 'error')
    return
  }
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.CANCELADO,
      canceladoPor: sessao.usuario.id,
      canceladoEm: serverTimestamp(),
      motivoCancelamento: motivo,
      motivoCancelamentoOutros: motivo === 'Outros' ? outros : null,
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.CANCELADO, motivo === 'Outros' ? outros : motivo)
    document.getElementById('modal-cancelar')?.classList.remove('visible')
    prxToast('Pedido cancelado.', 'info')
  } catch (err) {
    prxToast('Erro ao cancelar pedido.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _enviarComentario() {
  const input = document.getElementById('input-comentario')
  const texto = input?.value.trim()
  if (!texto) return

  // Extrai @menções
  const mencoes = [...new Set((texto.match(/@(\w+)/g) || []).map(m => m.slice(1)))]

  try {
    await addDoc(collection(db, 'pedidos', _pedidoId, 'comentarios'), {
      texto,
      autorId: sessao.usuario.id,
      autorNome: sessao.usuario.nome,
      mencoes,
      criadoEm: serverTimestamp(),
    })
    if (input) input.value = ''
  } catch (err) {
    prxToast('Erro ao enviar comentário.', 'error')
  }
}

async function _indicarCotacao(cotacaoId) {
  mostrarSpinner()
  try {
    // Remove indicação anterior
    for (const c of _cotacoes) {
      if (c.indicada) await updateDoc(doc(db, 'pedidos', _pedidoId, 'cotacoes', c.id), { indicada: false })
    }
    await updateDoc(doc(db, 'pedidos', _pedidoId, 'cotacoes', cotacaoId), { indicada: true })

    // Avança status para em_aprovacao se ainda ag_cotacao
    if (_pedido.status === STATUS.AG_COTACAO) {
      await updateDoc(doc(db, 'pedidos', _pedidoId), {
        status: STATUS.EM_APROVACAO,
        atualizadoEm: serverTimestamp(),
      })
      await _registrarHistorico(STATUS.EM_APROVACAO, 'Cotação indicada pelo comprador')
    }
    prxToast('Cotação indicada!', 'success')
  } catch (err) {
    prxToast('Erro ao indicar cotação.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _pagarParcela(parcelaId) {
  const ok = await prxConfirm('Confirmar pagamento desta parcela?', '', 'Confirmar', 'Cancelar')
  if (!ok) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId, 'parcelas', parcelaId), {
      pago: true,
      pagoEm: serverTimestamp(),
    })
    // Verifica se todas as parcelas foram pagas
    const todasPagas = _parcelas.every(p => p.id === parcelaId ? true : p.pago)
    if (todasPagas && _pedido.status === STATUS.ENTREGUE) {
      await updateDoc(doc(db, 'pedidos', _pedidoId), { status: STATUS.PAGO, atualizadoEm: serverTimestamp() })
      await _registrarHistorico(STATUS.PAGO, 'Última parcela paga')
    }
    prxToast('Pagamento registrado!', 'success')
  } catch (err) {
    prxToast('Erro ao registrar pagamento.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _anexarComprovante(parcelaId, file) {
  mostrarSpinner()
  try {
    const path = STORAGE_PATHS.comprovante(_pedidoId, parcelaId) + '/' + file.name
    const ref  = storageRef(storage, path)
    await uploadBytes(ref, file)
    const url = await getDownloadURL(ref)
    await updateDoc(doc(db, 'pedidos', _pedidoId, 'parcelas', parcelaId), { comprovante: url })
    prxToast('Comprovante anexado!', 'success')
  } catch (err) {
    prxToast('Erro ao anexar comprovante.', 'error')
  } finally {
    esconderSpinner()
  }
}

async function _mostrarModalCotacao() {
  // Modal de adição de cotação simplificado — campo fornecedor, valor, prazo, arquivo
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay visible'
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-header">
        <h2>Adicionar cotação</h2>
        <button class="btn-icon" id="close-cot-modal">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label for="cot-forn">Fornecedor *</label>
            <input type="text" id="cot-forn" placeholder="Nome do fornecedor">
          </div>
          <div class="form-group">
            <label for="cot-valor">Valor *</label>
            <input type="text" id="cot-valor" placeholder="R$ 0,00">
          </div>
          <div class="form-group">
            <label for="cot-prazo">Prazo de entrega</label>
            <input type="text" id="cot-prazo" placeholder="Ex: 5 dias úteis">
          </div>
          <div class="form-group col-span-2">
            <label for="cot-cond">Condições comerciais</label>
            <input type="text" id="cot-cond" placeholder="Frete, impostos, garantia…">
          </div>
          <div class="form-group col-span-2">
            <label for="cot-arquivo">Arquivo (PDF ou imagem)</label>
            <input type="file" id="cot-arquivo" accept=".pdf,image/*" style="padding:0.4rem">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-cot-modal">Cancelar</button>
        <button class="btn-primary" id="salvar-cotacao">Salvar cotação</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  document.getElementById('close-cot-modal')?.addEventListener('click', () => overlay.remove())
  document.getElementById('cancel-cot-modal')?.addEventListener('click', () => overlay.remove())

  document.getElementById('salvar-cotacao')?.addEventListener('click', async () => {
    const fornNome = document.getElementById('cot-forn')?.value.trim()
    const valorStr = document.getElementById('cot-valor')?.value.trim()
    const prazo    = document.getElementById('cot-prazo')?.value.trim()
    const cond     = document.getElementById('cot-cond')?.value.trim()
    const arquivoInp = document.getElementById('cot-arquivo')
    const arquivo  = arquivoInp?.files[0]
    const valor = parseMoeda(valorStr)

    if (!fornNome || !valor) { prxToast('Fornecedor e valor são obrigatórios.', 'error'); return }

    mostrarSpinner()
    try {
      let arquivoUrl = null
      let arquivoNome = null
      const cotId = doc(collection(db, 'pedidos', _pedidoId, 'cotacoes')).id

      if (arquivo) {
        const path = STORAGE_PATHS.cotacao(_pedidoId, cotId) + '/' + arquivo.name
        const ref  = storageRef(storage, path)
        await uploadBytes(ref, arquivo)
        arquivoUrl  = await getDownloadURL(ref)
        arquivoNome = arquivo.name
      }

      await addDoc(collection(db, 'pedidos', _pedidoId, 'cotacoes'), {
        fornecedorId: null,
        fornecedorNome: fornNome,
        valor, prazoEntrega: prazo, condicoesComerciais: cond,
        arquivoUrl, arquivoNome,
        indicada: false,
        criadaEm: serverTimestamp(),
        compradorId: sessao.usuario.id,
      })
      overlay.remove()
      prxToast('Cotação adicionada!', 'success')
    } catch (err) {
      prxToast('Erro ao salvar cotação.', 'error')
    } finally {
      esconderSpinner()
    }
  })
}

// ── Helpers de permissão ──────────────────────────────────────
function _podeAssumir() {
  const p = _pedido
  const perfil = sessao.usuario.perfil
  return p.status === STATUS.SOLICITADO && p.compradorId === null &&
         ['comprador','gestor','supremo'].includes(perfil)
}

function _podeLiberar() {
  const perfil = sessao.usuario.perfil
  return ['gestor','supremo'].includes(perfil) && _pedido.compradorId !== null
}

function _podeAnexarCotacao() {
  const p = _pedido
  const perfil = sessao.usuario.perfil
  return p.status === STATUS.AG_COTACAO &&
         (['comprador','gestor','supremo'].includes(perfil)) &&
         (p.compradorId === sessao.usuario.id || ['gestor','supremo'].includes(perfil))
}

function _podeIndicarCotacao() {
  return _podeAnexarCotacao() && _cotacoes.length > 0
}

function _podePagarParcela() {
  return ['financeiro','gestor','supremo'].includes(sessao.usuario.perfil)
}

// ── Utilitário ────────────────────────────────────────────────
async function _registrarHistorico(status, nota = null) {
  await addDoc(collection(db, 'pedidos', _pedidoId, 'historico'), {
    status,
    autorId: sessao.usuario.id,
    autorNome: sessao.usuario.nome,
    nota,
    criadoEm: serverTimestamp(),
  })
}

function _normEmpresas(val) {
  if (!val) return []
  return Array.isArray(val) ? val : Object.keys(val)
}

function _tsMs(ts) {
  if (!ts) return 0
  return ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime()
}
