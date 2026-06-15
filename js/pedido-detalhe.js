import {
  db, storage,
  doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where,
  runTransaction, writeBatch, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
} from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { prxToast, prxConfirm, prxAlert, mostrarSpinner, esconderSpinner, btnComLoading, abrirModal, fecharModal, exigirConexao } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL, STATUS_COLOR,
  PERFIS, MOTIVOS_REPROVACAO, MOTIVOS_CANCELAMENTO,
  CONDICAO_PAGAMENTO, STORAGE_PATHS, t,
} from './constants.js'
import {
  formatCurrency, formatDate, formatTimestamp, formatarDataRelativa, gerarIniciais,
  hojeISO, dataEhPassado, dataEhProximos, normalizarTexto, parseMoeda, calcularSLA, esc,
} from './utils.js'
import { agendarDuplicar } from './pedidos.js'

// Escapa entidades HTML para evitar XSS em conteúdo renderizado via innerHTML
function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let _unsubPedido    = null
let _unsubHistorico = null
let _pedidoId    = null
let _pedido      = null
let _cotacoes    = []
let _comentarios = []
let _historico   = []
let _parcelas    = []
let _anexos      = []
let _empresas    = []
let _categorias  = []
let _usuarios    = []
let _fornecedores = []

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
  _iniciarListenerHistorico()
}

function _iniciarListener() {
  if (_unsubPedido) _unsubPedido()
  registrarLimpador(() => {
    if (_unsubPedido) { _unsubPedido(); _unsubPedido = null }
  })
  let _vistoMarcado = false
  _unsubPedido = onSnapshot(
    doc(db, 'pedidos', _pedidoId),
    async snap => {
      if (!snap.exists()) {
        _renderErroDetalhe(t('pedidoNaoEncontrado'), t('pedidoRemovidoMsg'))
        return
      }
      _pedido = { id: snap.id, ...snap.data() }
      if (!_vistoMarcado) {
        _vistoMarcado = true
        const seenKey = `vistoPor.${sessao.usuario.id}`
        updateDoc(doc(db, 'pedidos', _pedidoId), { [seenKey]: serverTimestamp() }).catch(() => {})
      }
      await _carregarSubcollections()
      _renderDetalhe()
    },
    err => {
      if (err.code === 'permission-denied') {
        _renderErroDetalhe(t('semAcesso'), t('semAcessoPedido'))
      } else {
        prxToast(t('erroCarregarPedido'), 'error')
        navegar('pedidos')
      }
    }
  )
}

function _renderErroDetalhe(titulo, msg) {
  const root = document.getElementById('detalhe-root')
  if (!root) return
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:50vh">
      <div style="text-align:center;max-width:360px">
        <div style="font-size:2.5rem;margin-bottom:0.75rem">
          <svg width="48" height="48" fill="none" stroke="var(--text3)" stroke-width="1.5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div style="font-size:1rem;font-weight:600;margin-bottom:0.4rem">${titulo}</div>
        <div style="font-size:0.875rem;color:var(--text3);margin-bottom:1.5rem">${msg}</div>
        <button class="btn-primary" onclick="window.__navegar('pedidos')">Voltar para pedidos</button>
      </div>
    </div>
  `
}

function _iniciarListenerHistorico() {
  if (_unsubHistorico) _unsubHistorico()
  _unsubHistorico = onSnapshot(
    collection(db, 'pedidos', _pedidoId, 'historico'),
    snap => {
      _historico = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
      const feed = document.getElementById('activity-feed')
      if (feed) feed.innerHTML = _renderActivityFeed()
    }
  )
  registrarLimpador(() => { if (_unsubHistorico) { _unsubHistorico(); _unsubHistorico = null } })
}

async function _carregarSubcollections() {
  const [cotSnap, comSnap, parcSnap, anexSnap] = await Promise.all([
    getDocs(collection(db, 'pedidos', _pedidoId, 'cotacoes')),
    getDocs(collection(db, 'pedidos', _pedidoId, 'comentarios')),
    getDocs(collection(db, 'pedidos', _pedidoId, 'parcelas')),
    getDocs(collection(db, 'pedidos', _pedidoId, 'anexos')),
  ])
  _cotacoes    = cotSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _comentarios = comSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
  _parcelas    = parcSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.numero - b.numero)
  _anexos      = anexSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
}

async function _carregarAuxiliares() {
  const [empSnap, catSnap, fornSnap] = await Promise.all([
    getDocs(collection(db, 'empresas')),
    getDocs(collection(db, 'categorias')),
    getDocs(collection(db, 'fornecedores')),
  ])
  _empresas    = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _categorias  = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _fornecedores = fornSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  // usuarios: regra permite list apenas para gestor+; demais perfis recebem lista vazia
  try {
    const usrSnap = await getDocs(collection(db, 'usuarios'))
    _usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    _usuarios = []
  }
}

// Opções de autocomplete de fornecedor (datalist)
function _fornecedorDatalistOptions() {
  return _fornecedores
    .map(f => f.nomeExibicao || f.nomeOriginal || f.nome)
    .filter(Boolean)
    .map(nome => `<option value="${nome.replace(/"/g, '&quot;')}"></option>`)
    .join('')
}

// Busca fornecedor por nome normalizado; cria se não existir. Incrementa usos.
async function _buscarOuCriarFornecedor(nomeDigitado) {
  const nomeNorm = normalizarTexto(nomeDigitado)
  const existente = _fornecedores.find(f => normalizarTexto(f.nomeExibicao || f.nomeOriginal || f.nome) === nomeNorm)
  if (existente) {
    await updateDoc(doc(db, 'fornecedores', existente.id), { usos: (existente.usos || 0) + 1 })
    return existente.id
  }
  // Confirma no servidor (pode ter sido criado por outro fluxo)
  const snap = await getDocs(query(collection(db, 'fornecedores'), where('nome', '==', nomeNorm)))
  if (!snap.empty) {
    const ref = snap.docs[0]
    await updateDoc(doc(db, 'fornecedores', ref.id), { usos: (ref.data().usos || 0) + 1 })
    return ref.id
  }
  const novo = await addDoc(collection(db, 'fornecedores'), {
    nome: nomeNorm, nomeOriginal: nomeDigitado, nomeExibicao: nomeDigitado,
    cnpj: '', criadoEm: serverTimestamp(), usos: 1,
  })
  _fornecedores.push({ id: novo.id, nome: nomeNorm, nomeExibicao: nomeDigitado, usos: 1 })
  return novo.id
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
        <a href="?tela=pedidos" onclick="event.preventDefault();window.__navegar('pedidos')">${t('titulo')}</a>
        <span class="breadcrumb-sep">›</span>
        <span>${p.numeroPedido || `—`}</span>
      </nav>

      <!-- Card 1: Informações -->
      <div class="card no-hover" style="padding:1.75rem">
        <div class="flex items-center justify-between" style="margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem">
          <div class="flex items-center gap-3" style="flex-wrap:wrap">
            <span class="badge badge-${color}">${label}</span>
            ${p.urgente ? `<span class="badge badge-red"><svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ${t('urgente')}</span>` : ''}
            ${(() => {
              const estados_terminais = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
              if (!estados_terminais.includes(p.status) && p.dataNecessaria) {
                const sla = calcularSLA(p.dataNecessaria)
                return sla ? `<span class="sla-badge ${sla.classe}">${sla.label}</span>` : ''
              }
              return ''
            })()}
            ${(() => {
              if (![STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status)) return ''
              if (_cotacoes.length < 2) return ''
              const indicada = _cotacoes.find(c => c.indicada)
              if (!indicada) return ''
              const maior = Math.max(..._cotacoes.map(c => c.valor))
              const savings = maior - indicada.valor
              if (savings <= 0) return ''
              return `<span class="badge badge-green" title="Economia em relação à cotação mais cara">${t('economiaLabel')}: ${formatCurrency(savings)}</span>`
            })()}
          </div>
          <div class="acoes-contextuais" id="acoes-wrap">
            ${_renderAcoes()}
          </div>
        </div>

        <h1 style="font-size:1.4rem;margin-bottom:${p.reabertoDe || p.reabertoPara ? '0.5rem' : '1.25rem'};line-height:1.3">${p.titulo}</h1>

        ${p.reabertoDe ? `
          <div class="reaberto-banner" style="margin-bottom:1rem">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
            </svg>
            ${t('reabertoDe')}
            <a class="reaberto-link" href="?tela=detalhe&id=${p.reabertoDe}" onclick="event.preventDefault();window.__navegar('detalhe',{id:'${p.reabertoDe}'})">${p.reabertaDeNum || p.reabertoDe}</a>
          </div>
        ` : ''}
        ${p.reabertoPara ? `
          <div class="reaberto-banner" style="margin-bottom:1rem">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            ${t('reabertoComo')}
            <a class="reaberto-link" href="?tela=detalhe&id=${p.reabertoPara}" onclick="event.preventDefault();window.__navegar('detalhe',{id:'${p.reabertoPara}'})">${p.reabertaParaNum || p.reabertoPara}</a>
          </div>
        ` : ''}

        <div class="detalhe-meta-grid">
          <div class="meta-item"><span class="meta-label">${t('metaEmpresa')}</span><span class="meta-value">${empresa?.nome || '—'}</span></div>
          <div class="meta-item"><span class="meta-label">${t('metaQtd')}</span><span class="meta-value">${p.quantidade} ${p.unidade}</span></div>
          <div class="meta-item"><span class="meta-label">${t('metaCategoria')}</span><span class="meta-value">${categ?.nome || '—'}</span></div>
          <div class="meta-item"><span class="meta-label">${t('metaNecessario')}</span><span class="meta-value">${formatDate(p.dataNecessaria)}</span></div>
          <div class="meta-item"><span class="meta-label">${t('metaValorEst')}</span><span class="meta-value">${p.valorEstimado ? formatCurrency(p.valorEstimado) : '—'}</span></div>
          <div class="meta-item"><span class="meta-label">${t('metaCentro')}</span><span class="meta-value">${p.centroCusto || '—'}</span></div>
          ${p.valorFinal ? `<div class="meta-item"><span class="meta-label">${t('metaValorFinal')}</span><span class="meta-value text-gold font-bold">${formatCurrency(p.valorFinal)}</span></div>` : ''}
          ${p.dataCompra  ? `<div class="meta-item"><span class="meta-label">${t('metaDataCompra')}</span><span class="meta-value">${formatDate(p.dataCompra)}</span></div>` : ''}
          ${p.dataEntrega ? `<div class="meta-item"><span class="meta-label">${t('metaDataEntrega')}</span><span class="meta-value">${formatDate(p.dataEntrega)}</span></div>` : ''}
        </div>

        ${p.descricao ? `
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1.25rem;font-size:0.875rem;color:var(--text2);line-height:1.6">
            ${_esc(p.descricao)}
          </div>
        ` : ''}

        <hr class="divider">

        <div class="detalhe-section-title">${t('pessoasEnvolvidas')}</div>
        <div class="pessoas-grid">
          ${_renderPessoa(t('solicitanteLabel'), solic, t('criouPedido'))}
          ${_renderPessoaComprador()}
          ${_renderPessoaAprovadores()}
          ${_renderPessoaFinanceiro()}
        </div>

        ${_renderSLATimeline()}
      </div>

      <!-- Card 2: Cotações -->
      <div class="card no-hover card-glow-blue" style="padding:1.5rem">
        <div class="flex items-center justify-between" style="margin-bottom:1rem">
          <div class="detalhe-section-title" style="margin:0">${t('secaoCotacoes')}</div>
          <div style="display:flex;gap:0.5rem">
            ${_cotacoes.length >= 2 ? `<button class="btn-secondary btn-sm" id="btn-comparar-cotacoes">${t('btnComparar')}</button>` : ''}
            ${_podeAnexarCotacao() ? `<button class="btn-ghost btn-sm" id="btn-add-cotacao">+ ${t('btnNovaCotacao')}</button>` : ''}
          </div>
        </div>
        <div id="cotacoes-list">
          ${_renderCotacoes()}
        </div>
      </div>

      <!-- Atividade unificada (status + comentários + cotações + comprovantes) -->
      <div class="card no-hover" style="padding:1.5rem">
        <div class="detalhe-section-title">${t('secaoAtividade')}</div>
        <div class="activity-feed" id="activity-feed">
          ${_renderActivityFeed()}
        </div>
        <div class="comment-input-wrap" style="margin-top:1.25rem;position:relative">
          <textarea id="input-comentario" placeholder="${t('placeholderComentario')}"></textarea>
          <div id="mention-dropdown" class="mention-dropdown" style="display:none"></div>
          <div class="comment-actions">
            <button class="btn-icon" title="Enviar" id="btn-enviar-comentario">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Card: Anexos (4.10) -->
      <div class="card no-hover" style="padding:1.5rem">
        <div class="flex items-center justify-between" style="margin-bottom:1rem">
          <div class="detalhe-section-title" style="margin:0">${t('secaoAnexos')}</div>
          <label class="btn-ghost btn-sm" style="cursor:pointer">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            ${t('btnAdicionarAnexo')}
            <input type="file" id="input-upload-anexo" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" multiple style="display:none">
          </label>
        </div>
        <div id="anexos-list">${_renderAnexos()}</div>
      </div>

      <!-- Parcelas (se houver) -->
      ${_parcelas.length ? `
        <div class="card no-hover" style="padding:1.5rem">
          <div class="flex items-center justify-between" style="margin-bottom:1rem">
            <div class="detalhe-section-title" style="margin:0">${t('secaoParcelas')}</div>
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
          <h2>${t('btnExecutarCompra')}</h2>
          <button class="btn-icon" data-close="modal-compra">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-grid form-grid-2">
            <div class="form-group col-span-2">
              <label for="mc-fornecedor">${t('fornecedorLabel')} *</label>
              <input type="text" id="mc-fornecedor" placeholder="${t('fornecedorLabel')}" list="fornecedores-datalist" autocomplete="off">
              <datalist id="fornecedores-datalist">${_fornecedorDatalistOptions()}</datalist>
            </div>
            <div class="form-group">
              <label for="mc-valor">${t('valorFinalLabel')} *</label>
              <input type="text" id="mc-valor" placeholder="R$ 0,00">
            </div>
            <div class="form-group">
              <label for="mc-condicao">${t('condicaoPagLabel')} *</label>
              <select id="mc-condicao">
                <option value="">${t('selecionar')}</option>
                <option value="antecipado">Antecipado</option>
                <option value="apos_recebimento">Após recebimento</option>
              </select>
            </div>
            <div class="form-group">
              <label for="mc-data">${t('dataCompraLabel')} *</label>
              <input type="date" id="mc-data" value="${hojeISO()}">
            </div>
            <div class="form-group">
              <label for="mc-parcelas">${t('numParcelasLabel')} *</label>
              <input type="number" id="mc-parcelas" value="1" min="1" max="60">
            </div>
            <div class="form-group col-span-2">
              <label for="mc-venc1">${t('vencimentoPrimeiraLabel')} *</label>
              <input type="date" id="mc-venc1">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="modal-compra">${t('btnCancelar')}</button>
          <button class="btn-primary" id="btn-confirmar-compra">${t('confirmarCompra')}</button>
        </div>
      </div>
    </div>

    <!-- Modal: Reprovar -->
    <div class="modal-overlay" id="modal-reprovar">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>${t('tituloReprovar')}</h2>
          <button class="btn-icon" data-close="modal-reprovar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom:1rem">
            <label for="reprov-motivo">${t('motivoLabel')} *</label>
            <select id="reprov-motivo">
              <option value="">${t('selecionar')}</option>
              ${MOTIVOS_REPROVACAO.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="reprov-outros-wrap" style="display:none">
            <label for="reprov-outros">${t('especifique')} *</label>
            <textarea id="reprov-outros" placeholder="${t('especifiquePlaceholder')}" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="modal-reprovar">${t('btnCancelar')}</button>
          <button class="btn-danger" id="btn-confirmar-reprovar">${t('btnReprovar')}</button>
        </div>
      </div>
    </div>

    <!-- Modal: Cancelar -->
    <div class="modal-overlay" id="modal-cancelar">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>${t('tituloCancelar')}</h2>
          <button class="btn-icon" data-close="modal-cancelar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom:1rem">
            <label for="cancel-motivo">${t('motivoLabel')} *</label>
            <select id="cancel-motivo">
              <option value="">${t('selecionar')}</option>
              ${MOTIVOS_CANCELAMENTO.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" id="cancel-outros-wrap" style="display:none">
            <label for="cancel-outros">${t('especifique')} *</label>
            <textarea id="cancel-outros" placeholder="${t('especifiquePlaceholder')}" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close="modal-cancelar">${t('btnCancelar')}</button>
          <button class="btn-danger" id="btn-confirmar-cancelar">${t('btnCancelarPedido')}</button>
        </div>
      </div>
    </div>

    <!-- Modal: Reabrir pedido -->
    <div class="modal-overlay" id="modal-reabrir">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <h2>${t('tituloReabrir')}</h2>
          <button class="btn-icon" data-close-modal title="Fechar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size:0.85rem;color:var(--text3);line-height:1.6;margin-bottom:1.25rem">
            ${t('reabrirDescricao')}
          </p>
          <div class="form-group">
            <label for="reabrir-justificativa">${t('justReaberturaLabel')} *</label>
            <textarea id="reabrir-justificativa" placeholder="${t('justReaberturaPlaceholder')}" rows="4"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" data-close-modal>${t('btnCancelar')}</button>
          <button class="btn-primary" id="btn-confirmar-reabrir">${t('btnReabrir')}</button>
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
      <div class="pessoa-role">${t('compradorLabel')}</div>
      ${usuario ? `
        <div class="pessoa-info">
          <div class="avatar avatar-sm">${iniciais}</div>
          <div>
            <div class="pessoa-name">${usuario.nome}</div>
            <div class="pessoa-status">${_cotacoes.length ? `${_cotacoes.length} ${t('secaoCotacoes').toLowerCase()}` : t('semCotacoes')}</div>
          </div>
        </div>
        ${_podeLiberar() ? `<button class="btn-secondary btn-sm" style="margin-top:0.5rem" id="btn-liberar">${t('btnLiberarPedido')}</button>` : ''}
      ` : `
        <div class="pessoa-info">
          <div class="avatar avatar-sm" style="color:var(--text3)">?</div>
          <div class="pessoa-status">${t('aguardandoComprador')}</div>
        </div>
        ${podeAssumir ? `<button class="btn-primary btn-sm" style="margin-top:0.5rem" id="btn-assumir">${t('btnAssumirPedido')}</button>` : ''}
      `}
    </div>
  `
}

function _renderPessoaAprovadores() {
  const aprovadores = _pedido.aprovadorIds?.length
    ? _pedido.aprovadorIds.map(id => _usuarios.find(u => u.id === id)).filter(Boolean)
    : _usuarios.filter(u => [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(u.perfil) &&
        (sessao.usuario.perfil === PERFIS.SUPREMO ||
          _normEmpresas(sessao.usuario.empresas).some(e => _normEmpresas(u.empresas).includes(e))))

  const aprovadoPor = _pedido.aprovadoPor
  return `
    <div class="pessoa-card">
      <div class="pessoa-role">${t('aprovadoresLabel')}</div>
      ${aprovadores.slice(0,3).map(u => `
        <div class="pessoa-info" style="margin-top:0.4rem">
          <div class="avatar avatar-sm">${gerarIniciais(u.nome)}</div>
          <div>
            <div class="pessoa-name">${u.nome}</div>
            <div class="pessoa-status ${aprovadoPor === u.id ? 'text-green' : ''}">
              ${aprovadoPor === u.id
                ? `<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="display:inline;vertical-align:middle;margin-right:2px"><polyline points="20 6 9 17 4 12"/></svg>${t('aprovadoStatus')}`
                : t('aguardandoStatus')}
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
    (sessao.usuario.perfil === PERFIS.SUPREMO ||
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

  if (p.status === STATUS.EM_APROVACAO && [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-aprovar">Aprovar</button>`)
    btns.push(`<button class="btn-danger btn-sm" id="btn-reprovar">Reprovar</button>`)
  }

  if (p.status === STATUS.APROVADO && [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) &&
      (p.compradorId === uid || [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil))) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-executar-compra">Executar compra</button>`)
  }

  if (p.status === STATUS.COMPRADO &&
      ([PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) || p.solicitanteId === uid)) {
    btns.push(`<button class="btn-primary btn-sm" id="btn-confirmar-entrega">Confirmar entrega</button>`)
  }

  if (p.status === STATUS.ENTREGUE && [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    const todasPagas = _parcelas.length === 0 || _parcelas.every(par => par.pago)
    if (todasPagas) btns.push(`<button class="btn-primary btn-sm" id="btn-confirmar-pagamento">Confirmar pagamento</button>`)
  }

  const podeEditar = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && ![STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
  )
  if (podeEditar) {
    btns.push(`<button class="btn-secondary btn-sm" id="btn-editar-pedido">Editar pedido</button>`)
  }

  const podeCanc = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && ![STATUS.ENTREGUE, STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
  )
  if (podeCanc) {
    btns.push(`<button class="btn-danger btn-sm" id="btn-cancelar">Cancelar pedido</button>`)
  }

  if (p.status === STATUS.REPROVADO && !p.reabertoPara &&
      [PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    btns.push(`<button class="btn-secondary btn-sm" id="btn-reabrir-pedido">Reabrir pedido</button>`)
  }

  if ([PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    btns.push(`<button class="btn-secondary btn-sm" id="btn-duplicar-pedido">Duplicar pedido</button>`)
  }

  if ([PERFIS.GESTOR, PERFIS.SUPREMO, PERFIS.FINANCEIRO, PERFIS.COMPRADOR].includes(perfil)) {
    btns.push(`<button class="btn-secondary btn-sm" id="btn-exportar-pdf">Exportar PDF</button>`)
  }

  return btns.join('')
}

function _renderCotacoes() {
  if (!_cotacoes.length) {
    return `
      <div class="empty-state-branded">
        <div class="empty-icon">
          <svg width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <div class="empty-title">Nenhuma cotação ainda</div>
        <div class="empty-sub">Adicione pelo menos 3 cotações para encaminhar ao aprovador.</div>
      </div>
    `
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

function _renderActivityFeed() {
  const dotMap = {
    [STATUS.SOLICITADO]:'dot-gray', [STATUS.AG_COTACAO]:'dot-blue', [STATUS.EM_APROVACAO]:'dot-gold',
    [STATUS.APROVADO]:'dot-green',  [STATUS.COMPRADO]:'dot-green', [STATUS.ENTREGUE]:'dot-green',
    [STATUS.PAGO]:'dot-green',      [STATUS.REPROVADO]:'dot-red',  [STATUS.CANCELADO]:'dot-red',
  }

  const hist = _historico.map(h  => ({ ...h,  _feedTipo: h.tipo || 'status' }))
  const comt = _comentarios.map(c => ({ ...c, _feedTipo: 'comentario' }))
  const feed = [...hist, ...comt].sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))

  if (!feed.length) return `
    <div class="empty-state-branded" style="padding:1.5rem 1rem">
      <div class="empty-icon">
        <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
      </div>
      <div class="empty-title" style="font-size:0.85rem">Nenhuma atividade ainda</div>
      <div class="empty-sub" style="font-size:0.75rem">Aqui aparecerão mudanças de status, comentários e atualizações.</div>
    </div>
  `

  return feed.map((item, i) => {
    const nome = item.autorNome || (_usuarios.find(u => u.id === item.autorId)?.nome) || 'Sistema'
    const ts   = formatarDataRelativa(item.criadoEm)
    const isLast = i === feed.length - 1

    if (item._feedTipo === 'status') {
      return `
        <div class="feed-item">
          <div class="feed-left">
            <div class="timeline-dot ${dotMap[item.status] || 'dot-gray'}"></div>
            ${isLast ? '' : '<div class="timeline-line"></div>'}
          </div>
          <div class="feed-body">
            <div class="feed-text">
              Pedido movido para <strong>${STATUS_LABEL[item.status] || _esc(item.status)}</strong>
              ${item.autorNome ? ` por ${_esc(nome)}` : ''}
              ${item.nota ? `<span class="feed-nota"> — ${_esc(item.nota)}</span>` : ''}
            </div>
            <div class="feed-time" title="${ts.title}">${ts.label}</div>
          </div>
        </div>`
    }

    if (item._feedTipo === 'comentario') {
      const texto = _esc(item.texto || '').replace(/@(\w+)/g, '<span class="mention">@$1</span>')
      return `
        <div class="feed-item feed-item-comment">
          <div class="feed-left">
            <div class="avatar avatar-xs">${gerarIniciais(nome)}</div>
            ${isLast ? '' : '<div class="timeline-line" style="margin-left:12px"></div>'}
          </div>
          <div class="feed-body">
            <div class="feed-header">
              <span class="feed-author">${_esc(nome)}</span>
              <span class="feed-time" title="${ts.title}">${ts.label}</span>
            </div>
            <div class="comment-text">${texto}</div>
          </div>
        </div>`
    }

    if (item._feedTipo === 'cotacao') {
      return `
        <div class="feed-item">
          <div class="feed-left">
            <div class="feed-icon-dot">
              <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="2"/>
              </svg>
            </div>
            ${isLast ? '' : '<div class="timeline-line"></div>'}
          </div>
          <div class="feed-body">
            <div class="feed-text">
              Cotação de <strong>${_esc(item.fornecedorNome || '—')}</strong>
              ${item.valor ? `(${formatCurrency(item.valor)})` : ''} adicionada por ${_esc(nome)}
            </div>
            <div class="feed-time" title="${ts.title}">${ts.label}</div>
          </div>
        </div>`
    }

    if (item._feedTipo === 'comprovante') {
      return `
        <div class="feed-item">
          <div class="feed-left">
            <div class="feed-icon-dot">
              <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            ${isLast ? '' : '<div class="timeline-line"></div>'}
          </div>
          <div class="feed-body">
            <div class="feed-text">
              Comprovante da parcela <strong>${_esc(item.parcelaNumero || '')}</strong> enviado por ${_esc(nome)}
            </div>
            <div class="feed-time" title="${ts.title}">${ts.label}</div>
          </div>
        </div>`
    }

    if (item._feedTipo === 'edicao') {
      return `
        <div class="feed-item">
          <div class="feed-left">
            <div class="feed-icon-dot">
              <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            ${isLast ? '' : '<div class="timeline-line"></div>'}
          </div>
          <div class="feed-body">
            <div class="feed-text">
              <strong>${_esc(item.campoLabel || item.campo || '')}</strong> alterado
              de <em>"${_esc(item.valorAnterior || '—')}"</em>
              para <em>"${_esc(item.valorNovo || '—')}"</em>
              por ${_esc(nome)}
            </div>
            <div class="feed-time" title="${ts.title}">${ts.label}</div>
          </div>
        </div>`
    }

    if (item._feedTipo === 'anexo') {
      return `
        <div class="feed-item">
          <div class="feed-left">
            <div class="feed-icon-dot">
              <svg width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </div>
            ${isLast ? '' : '<div class="timeline-line"></div>'}
          </div>
          <div class="feed-body">
            <div class="feed-text">
              Arquivo <strong>${_esc(item.nomeArquivo || '—')}</strong> anexado por ${_esc(nome)}
            </div>
            <div class="feed-time" title="${ts.title}">${ts.label}</div>
          </div>
        </div>`
    }

    return ''
  }).join('')
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
        ${_podePagarParcela() && !parc.comprovante ? `
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
    btn.addEventListener('click', () => fecharModal(btn.dataset.close))
  })

  // Assumir pedido
  document.getElementById('btn-assumir')?.addEventListener('click', _assumirPedido)

  // Liberar claim
  document.getElementById('btn-liberar')?.addEventListener('click', _liberarClaim)

  // Aprovar
  document.getElementById('btn-aprovar')?.addEventListener('click', _aprovarPedido)

  // Reprovar — abre modal
  document.getElementById('btn-reprovar')?.addEventListener('click', () => {
    abrirModal('modal-reprovar')
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
    abrirModal('modal-compra')
  })

  // Confirmar compra
  document.getElementById('btn-confirmar-compra')?.addEventListener('click', _executarCompra)

  // Confirmar entrega
  document.getElementById('btn-confirmar-entrega')?.addEventListener('click', _confirmarEntrega)

  // Confirmar pagamento total
  document.getElementById('btn-confirmar-pagamento')?.addEventListener('click', _confirmarPagamento)

  // Cancelar — abre modal
  document.getElementById('btn-cancelar')?.addEventListener('click', () => {
    abrirModal('modal-cancelar')
  })

  document.getElementById('cancel-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('cancel-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === 'Outros' ? 'block' : 'none'
  })

  document.getElementById('btn-confirmar-cancelar')?.addEventListener('click', _cancelarPedido)

  // Enviar comentário
  document.getElementById('btn-enviar-comentario')?.addEventListener('click', _enviarComentario)
  document.getElementById('input-comentario')?.addEventListener('keydown', e => {
    if (_handleMentionKeydown(e)) return
    if (e.key === 'Escape') { _fecharMentionDropdown(); return }
    if (e.key === 'Enter' && e.ctrlKey) { _fecharMentionDropdown(); _enviarComentario() }
  })
  document.getElementById('input-comentario')?.addEventListener('input', _handleMentionInput)

  // Indicar cotação
  document.querySelectorAll('[data-indicar]').forEach(btn => {
    btn.addEventListener('click', () => _indicarCotacao(btn.dataset.indicar))
  })

  // Adicionar cotação
  document.getElementById('btn-add-cotacao')?.addEventListener('click', _mostrarModalCotacao)

  // Comparar cotações
  document.getElementById('btn-comparar-cotacoes')?.addEventListener('click', _compararCotacoes)

  // Editar campos do pedido
  document.getElementById('btn-editar-pedido')?.addEventListener('click', _editarPedido)

  // Reabrir pedido reprovado
  document.getElementById('btn-reabrir-pedido')?.addEventListener('click', () => {
    document.getElementById('reabrir-justificativa').value = ''
    abrirModal('modal-reabrir')
  })
  document.getElementById('btn-confirmar-reabrir')?.addEventListener('click', _reabrirPedido)

  // Duplicar pedido
  document.getElementById('btn-duplicar-pedido')?.addEventListener('click', () => {
    agendarDuplicar(_pedido)
    navegar('pedidos')
  })

  // Exportar PDF
  document.getElementById('btn-exportar-pdf')?.addEventListener('click', _exportarPedidoPDF)

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

  // Upload de anexos gerais
  document.getElementById('input-upload-anexo')?.addEventListener('change', e => {
    Array.from(e.target.files || []).forEach(f => _uploadAnexo(f))
    e.target.value = ''
  })

  _bindAnexosEvents()
}

// ── Ações de workflow ─────────────────────────────────────────
async function _assumirPedido() {
  const ok = await prxConfirm('Assumir este pedido?', 'Você será o comprador responsável.', 'Assumir', 'Cancelar')
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().compradorId !== null) throw new Error(t('pedidoJaAssumido'))
      tx.update(ref, {
        compradorId: sessao.usuario.id,
        compradorAssumiuEm: serverTimestamp(),
        status: STATUS.AG_COTACAO,
        atualizadoEm: serverTimestamp(),
      })
    })
    await _registrarHistorico(STATUS.AG_COTACAO, 'Comprador assumiu o pedido')
    prxToast(t('pedidoAssumido'), 'success')
  } catch (err) {
    prxToast(err.message || t('erroAssumir'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _liberarClaim() {
  const ok = await prxConfirm('Liberar este pedido?', 'O comprador atual será removido e o pedido voltará para a fila.', 'Liberar', 'Cancelar', true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      compradorId: null,
      compradorAssumiuEm: null,
      status: STATUS.SOLICITADO,
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.SOLICITADO, 'Claim liberado pelo gestor')
    prxToast(t('pedidoLiberado'), 'success')
  } catch (err) {
    prxToast(t('erroLiberarPedido'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _aprovarPedido() {
  const ok = await prxConfirm('Aprovar este pedido?', '', 'Aprovar', 'Cancelar')
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().status !== STATUS.EM_APROVACAO) throw new Error(t('pedidoJaProcessado'))
      tx.update(ref, {
        status: STATUS.APROVADO,
        aprovadoPor: sessao.usuario.id,
        aprovadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      })
    })
    await _registrarHistorico(STATUS.APROVADO)
    prxToast(t('pedidoAprovado'), 'success')
  } catch (err) {
    prxToast(err.message || t('erroAprovar'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _reprovarPedido() {
  const motivo = document.getElementById('reprov-motivo')?.value
  const outros = document.getElementById('reprov-outros')?.value.trim()
  if (!motivo || (motivo === 'Outros' && !outros)) {
    prxToast(t('selecionarMotivoSimples'), 'error')
    return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().status !== STATUS.EM_APROVACAO) throw new Error(t('pedidoJaProcessado'))
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
    fecharModal('modal-reprovar')
    prxToast(t('pedidoReprovado'), 'info')
  } catch (err) {
    prxToast(err.message || t('erroReprovar'), 'error')
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
    prxToast(t('erroCamposObrigatorios'), 'error')
    return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // Busca ou cria fornecedor (autocomplete + dedupe por nome normalizado)
    const fornecedorId = await _buscarOuCriarFornecedor(fornecedor)

    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.COMPRADO,
      fornecedorId,
      fornecedorNome: fornecedor,
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
    fecharModal('modal-compra')
    prxToast(t('compraRegistrada'), 'success')
  } catch (err) {
    prxToast(t('erroRegistrarCompra'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

async function _confirmarEntrega() {
  const ok = await prxConfirm('Confirmar recebimento?', 'Certifique-se de que o produto/serviço foi recebido.', 'Confirmar', 'Cancelar')
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.ENTREGUE,
      dataEntrega: hojeISO(),
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.ENTREGUE)
    prxToast(t('entregaConfirmada'), 'success')
  } catch (err) {
    prxToast(t('erroConfirmarEntrega'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _confirmarPagamento() {
  const ok = await prxConfirm('Confirmar pagamento total?', '', 'Confirmar', 'Cancelar')
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.PAGO,
      atualizadoEm: serverTimestamp(),
    })
    await _registrarHistorico(STATUS.PAGO)
    prxToast(t('pagamentoConfirmado'), 'success')
  } catch (err) {
    prxToast(t('erroConfirmarPagamento'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _cancelarPedido() {
  const motivo = document.getElementById('cancel-motivo')?.value
  const outros = document.getElementById('cancel-outros')?.value.trim()
  if (!motivo || (motivo === 'Outros' && !outros)) {
    prxToast(t('selecionarMotivoSimples'), 'error')
    return
  }
  if (!exigirConexao()) return
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
    fecharModal('modal-cancelar')
    prxToast(t('pedidoCanceladoMsg'), 'info')
  } catch (err) {
    prxToast(t('erroCancelarPedido'), 'error')
  } finally {
    esconderSpinner()
  }
}

// ── Comparador de cotações (3.3) ─────────────────────────────
function _compararCotacoes() {
  const menorValor = Math.min(..._cotacoes.map(c => c.valor))
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'modal-comparar'
  overlay.innerHTML = `
    <div class="modal" style="max-width:860px;width:96vw">
      <div class="modal-header">
        <h2>Comparar cotações</h2>
        <button class="btn-icon" id="close-comparar">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body" style="overflow-x:auto;padding-bottom:1.5rem">
        <div class="cotacao-compare-grid" style="grid-template-columns:repeat(${_cotacoes.length},1fr)">
          ${_cotacoes.map(c => {
            const eMenor = c.valor === menorValor
            return `
              <div class="cotacao-compare-col ${c.indicada ? 'cotacao-compare-indicada' : ''}">
                <div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-bottom:0.5rem">
                  ${c.indicada ? `<span class="badge badge-gold">Indicada</span>` : ''}
                  ${eMenor ? `<span class="badge badge-green">Menor valor</span>` : ''}
                </div>
                <div class="cotacao-compare-fornecedor">${_esc(c.fornecedorNome)}</div>
                <div class="cotacao-compare-valor ${eMenor ? 'text-green' : ''}">${formatCurrency(c.valor)}</div>
                <div class="cotacao-compare-row"><span class="meta-label">Prazo entrega</span><span>${_esc(c.prazoEntrega || '—')}</span></div>
                <div class="cotacao-compare-row"><span class="meta-label">Condições</span><span>${_esc(c.condicoesComerciais || '—')}</span></div>
                ${c.arquivoUrl ? `<a href="${c.arquivoUrl}" target="_blank" class="btn-secondary btn-sm" style="margin-top:0.75rem;display:inline-block">Ver arquivo</a>` : ''}
              </div>`
          }).join('')}
        </div>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  abrirModal('modal-comparar')
  const fechar = () => { fecharModal('modal-comparar'); setTimeout(() => overlay.remove(), 250) }
  document.getElementById('close-comparar')?.addEventListener('click', fechar)
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar() })
}

// ── Editar campos do pedido + auditoria campo-a-campo (3.7) ──
const _CAMPO_LABEL = {
  titulo: 'Título', descricao: 'Descrição', valorEstimado: 'Valor estimado',
  dataNecessaria: 'Data necessária', urgente: 'Urgência', categoriaId: 'Categoria',
}

function _editarPedido() {
  const p = _pedido
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'modal-editar-pedido'
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <h2>Editar pedido</h2>
        <button class="btn-icon" id="close-editar">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label>Título *</label>
            <input type="text" id="edit-titulo" value="${_esc(p.titulo || '')}" maxlength="120">
          </div>
          <div class="form-group col-span-2">
            <label>Descrição</label>
            <textarea id="edit-descricao" rows="3" style="resize:vertical">${_esc(p.descricao || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Valor estimado</label>
            <input type="text" id="edit-valor" value="${p.valorEstimado ? p.valorEstimado.toFixed(2).replace('.', ',') : ''}">
          </div>
          <div class="form-group">
            <label>Data necessária</label>
            <input type="date" id="edit-data" value="${p.dataNecessaria || ''}">
          </div>
          <div class="form-group">
            <label>Categoria</label>
            <select id="edit-categoria">
              ${_categorias.map(c => `<option value="${c.id}" ${p.categoriaId === c.id ? 'selected' : ''}>${_esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Urgência</label>
            <div class="toggle-wrap" style="margin-top:0.4rem">
              <div class="toggle ${p.urgente ? 'on' : ''}" id="edit-urgente-toggle"></div>
              <span class="toggle-label">Urgente</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-editar">Cancelar</button>
        <button class="btn-primary" id="salvar-edicao">Salvar alterações</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  abrirModal('modal-editar-pedido')
  const fechar = () => { fecharModal('modal-editar-pedido'); setTimeout(() => overlay.remove(), 250) }
  document.getElementById('close-editar')?.addEventListener('click', fechar)
  document.getElementById('cancel-editar')?.addEventListener('click', fechar)
  document.getElementById('edit-urgente-toggle')?.addEventListener('click', e =>
    e.currentTarget.classList.toggle('on'))
  overlay.addEventListener('click', e => { if (e.target === overlay) fechar() })
  document.getElementById('salvar-edicao')?.addEventListener('click', () => _salvarEdicaoPedido(fechar))
}

async function _salvarEdicaoPedido(fechar) {
  const titulo      = document.getElementById('edit-titulo')?.value.trim()
  const descricao   = document.getElementById('edit-descricao')?.value.trim()
  const valorStr    = document.getElementById('edit-valor')?.value.trim()
  const data        = document.getElementById('edit-data')?.value
  const categoriaId = document.getElementById('edit-categoria')?.value
  const urgente     = document.getElementById('edit-urgente-toggle')?.classList.contains('on')

  if (!titulo) { prxToast('Título é obrigatório.', 'error'); return }

  const valorEstimado = valorStr ? parseMoeda(valorStr) : null
  const p = _pedido

  const novos = { titulo, descricao, valorEstimado, dataNecessaria: data, categoriaId, urgente }
  const formatar = (campo, val) => {
    if (campo === 'valorEstimado')  return val ? formatCurrency(val) : '—'
    if (campo === 'dataNecessaria') return val ? formatDate(val) : '—'
    if (campo === 'urgente')        return val ? 'Urgente' : 'Normal'
    if (campo === 'categoriaId')    return _categorias.find(c => c.id === val)?.nome || val
    return String(val ?? '—')
  }

  const alteracoes = Object.keys(novos).filter(k => {
    const antes = p[k] ?? null
    const depois = novos[k] ?? null
    return String(antes) !== String(depois)
  })

  if (!alteracoes.length) { prxToast('Nenhuma alteração detectada.', 'info'); fechar(); return }

  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), { ...novos, atualizadoEm: serverTimestamp() })
    const batch = writeBatch(db)
    for (const campo of alteracoes) {
      batch.set(doc(collection(db, 'pedidos', _pedidoId, 'historico')), {
        tipo:          'edicao',
        campo,
        campoLabel:    _CAMPO_LABEL[campo] || campo,
        valorAnterior: formatar(campo, p[campo]),
        valorNovo:     formatar(campo, novos[campo]),
        autorId:       sessao.usuario.id,
        autorNome:     sessao.usuario.nome,
        criadoEm:      serverTimestamp(),
      })
    }
    await batch.commit()
    fechar()
    prxToast(t('pedidoAtualizado'), 'success')
  } catch (err) {
    prxToast(t('erroSalvarAlteracoes'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

let _mentionIndex = -1

function _mentionAberto() {
  const dd = document.getElementById('mention-dropdown')
  return dd && dd.style.display !== 'none'
}

function _fecharMentionDropdown() {
  const dd = document.getElementById('mention-dropdown')
  if (dd) dd.style.display = 'none'
  _mentionIndex = -1
}

function _aplicarMencao(textarea, primeiroNome) {
  const pos   = textarea.selectionStart
  const antes = textarea.value.slice(0, pos)
  const novoAntes = antes.replace(/@(\w*)$/, `@${primeiroNome} `)
  textarea.value = novoAntes + textarea.value.slice(pos)
  textarea.selectionStart = textarea.selectionEnd = novoAntes.length
  _fecharMentionDropdown()
  textarea.focus()
}

function _destacarMentionItem(dd) {
  dd.querySelectorAll('.mention-item').forEach((item, i) => {
    item.classList.toggle('mention-item-active', i === _mentionIndex)
  })
}

function _handleMentionKeydown(e) {
  if (!_mentionAberto()) return false
  const dd = document.getElementById('mention-dropdown')
  const itens = dd.querySelectorAll('.mention-item')
  if (!itens.length) return false

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    _mentionIndex = (_mentionIndex + 1) % itens.length
    _destacarMentionItem(dd)
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    _mentionIndex = (_mentionIndex - 1 + itens.length) % itens.length
    _destacarMentionItem(dd)
    return true
  }
  if ((e.key === 'Enter' || e.key === 'Tab') && _mentionIndex >= 0) {
    e.preventDefault()
    _aplicarMencao(e.target, itens[_mentionIndex].dataset.nome)
    return true
  }
  return false
}

function _handleMentionInput(e) {
  const textarea = e.target
  const pos = textarea.selectionStart
  const antes = textarea.value.slice(0, pos)
  const match = antes.match(/@(\w*)$/)
  const dd = document.getElementById('mention-dropdown')
  if (!dd) return

  if (!match) { _fecharMentionDropdown(); return }

  const query = normalizarTexto(match[1])
  const empresaId = _pedido?.empresaId
  const sugestoes = _usuarios
    .filter(u => {
      if (u.id === sessao.usuario.id) return false
      if (u.ativo === false) return false
      if (!normalizarTexto(u.nome || '').includes(query)) return false
      // Apenas usuários com acesso à empresa do pedido (supremo enxerga todas)
      if (u.perfil === PERFIS.SUPREMO || !empresaId) return true
      const emp = Array.isArray(u.empresas) ? u.empresas : Object.keys(u.empresas || {})
      return emp.includes(empresaId)
    })
    .slice(0, 5)

  if (!sugestoes.length) { _fecharMentionDropdown(); return }

  _mentionIndex = 0
  dd.innerHTML = sugestoes.map(u => `
    <div class="mention-item" data-nome="${_esc(u.nome.split(' ')[0])}">
      <div class="avatar avatar-xs">${gerarIniciais(u.nome)}</div>
      <span>${_esc(u.nome)}</span>
    </div>
  `).join('')
  dd.style.display = 'block'
  _destacarMentionItem(dd)

  dd.querySelectorAll('.mention-item').forEach((item, i) => {
    item.addEventListener('mouseenter', () => {
      _mentionIndex = i
      _destacarMentionItem(dd)
    })
    item.addEventListener('mousedown', ev => {
      ev.preventDefault()
      _aplicarMencao(textarea, item.dataset.nome)
    })
  })
}

async function _enviarComentario() {
  const input = document.getElementById('input-comentario')
  const btn   = document.getElementById('btn-enviar-comentario')
  const texto = input?.value.trim()
  if (!texto) return
  if (!exigirConexao()) return
  if (btn) btn.disabled = true

  // Extrai @menções (nomes/apelidos após @)
  const mencoes = [...new Set((texto.match(/@(\w+)/g) || []).map(m => m.slice(1)))]

  // Optimistic: insere na UI imediatamente; removido no rollback se a escrita falhar
  const tempId = `temp-${Date.now()}`
  _comentarios.push({
    id:        tempId,
    texto,
    autorId:   sessao.usuario.id,
    autorNome: sessao.usuario.nome,
    mencoes,
    criadoEm:  new Date(),
  })
  const feedEl = document.getElementById('activity-feed')
  if (feedEl) feedEl.innerHTML = _renderActivityFeed()
  if (input) input.value = ''

  try {
    await addDoc(collection(db, 'pedidos', _pedidoId, 'comentarios'), {
      texto,
      autorId:   sessao.usuario.id,
      autorNome: sessao.usuario.nome,
      mencoes,
      criadoEm:  serverTimestamp(),
    })
    updateDoc(doc(db, 'pedidos', _pedidoId), { ultimoComentarioEm: serverTimestamp() }).catch(() => {})
    await _refreshComentarios()

    // Notifica usuários mencionados (best-effort; _usuarios pode ser [] para não-gestor)
    for (const m of mencoes) {
      const mNorm = normalizarTexto(m)
      const user  = _usuarios.find(u => normalizarTexto((u.nome || '').split(' ')[0]) === mNorm)
      if (user && user.id !== sessao.usuario.id) {
        addDoc(collection(db, 'notificacoes', user.id, 'items'), {
          evento:   'mencao_comentario',
          titulo:   'Você foi mencionado',
          corpo:    `${sessao.usuario.nome} mencionou você em "${_pedido.titulo}".`,
          pedidoId: _pedidoId,
          lida:     false,
          criadaEm: serverTimestamp(),
        }).catch(() => {}) // não-bloqueia se falhar
      }
    }
  } catch (err) {
    // Rollback: remove o comentário otimista e devolve o texto ao campo
    _comentarios = _comentarios.filter(c => c.id !== tempId)
    const el = document.getElementById('activity-feed')
    if (el) el.innerHTML = _renderActivityFeed()
    if (input) input.value = texto
    prxToast(t('erroEnviarComentario'), 'error')
  } finally {
    if (btn) btn.disabled = false
  }
}

async function _indicarCotacao(cotacaoId) {
  if (!exigirConexao()) return
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
    prxToast(t('cotacaoIndicada'), 'success')
  } catch (err) {
    prxToast(t('erroIndicarCotacao'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _pagarParcela(parcelaId) {
  const ok = await prxConfirm('Confirmar pagamento desta parcela?', '', 'Confirmar', 'Cancelar')
  if (!ok) return
  if (!exigirConexao()) return
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
    } else {
      await _refreshParcelas()
    }
    prxToast(t('pagamentoRegistrado'), 'success')
  } catch (err) {
    prxToast(t('erroRegistrarPagamento'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _anexarComprovante(parcelaId, file) {
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const path = STORAGE_PATHS.comprovante(_pedidoId, parcelaId) + '/' + file.name
    const ref  = storageRef(storage, path)
    await uploadBytes(ref, file)
    const url = await getDownloadURL(ref)
    await updateDoc(doc(db, 'pedidos', _pedidoId, 'parcelas', parcelaId), { comprovante: url })
    const parc = _parcelas.find(p => p.id === parcelaId)
    addDoc(collection(db, 'pedidos', _pedidoId, 'historico'), {
      tipo:          'comprovante',
      parcelaNumero: parc ? `${parc.numero}/${parc.total}` : '',
      autorId:       sessao.usuario.id,
      autorNome:     sessao.usuario.nome,
      criadoEm:      serverTimestamp(),
    }).catch(() => {})
    await _refreshParcelas()
    prxToast(t('comprovanteAnexado'), 'success')
  } catch (err) {
    prxToast(t('erroAnexarComprovante'), 'error')
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
            <input type="text" id="cot-forn" placeholder="Nome do fornecedor" list="cot-forn-datalist" autocomplete="off">
            <datalist id="cot-forn-datalist">${_fornecedorDatalistOptions()}</datalist>
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

    if (!fornNome || !valor) { prxToast(t('fornecedorValorObrig'), 'error'); return }

    const btnSalvar = document.getElementById('salvar-cotacao')
    if (btnSalvar) btnSalvar.disabled = true
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

      // Linka (ou cria) o fornecedor estruturado, evitando duplicatas
      const fornecedorId = await _buscarOuCriarFornecedor(fornNome)

      await addDoc(collection(db, 'pedidos', _pedidoId, 'cotacoes'), {
        fornecedorId,
        fornecedorNome: fornNome,
        valor, prazoEntrega: prazo, condicoesComerciais: cond,
        arquivoUrl, arquivoNome,
        indicada: false,
        criadaEm: serverTimestamp(),
        compradorId: sessao.usuario.id,
      })
      addDoc(collection(db, 'pedidos', _pedidoId, 'historico'), {
        tipo: 'cotacao',
        fornecedorNome: fornNome,
        valor,
        autorId:   sessao.usuario.id,
        autorNome: sessao.usuario.nome,
        criadoEm:  serverTimestamp(),
      }).catch(() => {})
      overlay.remove()
      await _refreshCotacoes()
      prxToast(t('cotacaoAdicionada'), 'success')
    } catch (err) {
      prxToast(t('erroSalvarCotacao'), 'error')
      if (btnSalvar) btnSalvar.disabled = false
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
         [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
}

function _podeLiberar() {
  const perfil = sessao.usuario.perfil
  return [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && _pedido.compradorId !== null
}

function _podeAnexarCotacao() {
  const p = _pedido
  const perfil = sessao.usuario.perfil
  return p.status === STATUS.AG_COTACAO &&
         ([PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) &&
         (p.compradorId === sessao.usuario.id || [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil))
}

function _podeIndicarCotacao() {
  return _podeAnexarCotacao() && _cotacoes.length > 0
}

function _podePagarParcela() {
  return [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil)
}

// ── Refresh parcial de subcoleções ────────────────────────────
async function _exportarPedidoPDF() {
  if (!exigirConexao()) return
  mostrarSpinner()
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
    const pdf = new jsPDF()
    const p   = _pedido

    const empresa   = _empresas.find(e => e.id === p.empresaId)
    const categoria = _categorias.find(c => c.id === p.categoriaId)
    const solicit   = _usuarios.find(u => u.id === p.solicitanteId)
    const comprador = _usuarios.find(u => u.id === p.compradorId)
    const numero    = p.numeroPedido || `—`

    const tsStr = ts => {
      if (!ts) return '—'
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    }

    let y = 18
    const quebraPagina = (alturaProxima = 7) => {
      if (y + alturaProxima > 285) { pdf.addPage(); y = 18 }
    }
    const linha = (texto, tamanho = 9, negrito = false) => {
      quebraPagina()
      pdf.setFontSize(tamanho)
      pdf.setFont('helvetica', negrito ? 'bold' : 'normal')
      pdf.text(String(texto), 14, y)
      y += tamanho >= 13 ? 9 : 6
    }
    const secao = titulo => {
      y += 4
      quebraPagina(12)
      linha(titulo, 12, true)
    }

    // Cabeçalho
    linha(`PRAXIS — Pedido ${numero}`, 16, true)
    linha(p.titulo || '', 12)
    y += 2

    // Metadados
    secao('Dados do pedido')
    linha(`Status: ${STATUS_LABEL[p.status] || p.status}${p.urgente ? '  •  URGENTE' : ''}`)
    linha(`Empresa: ${empresa?.nome || '—'}`)
    linha(`Categoria: ${categoria?.nome || '—'}`)
    linha(`Solicitante: ${solicit?.nome || '—'}`)
    linha(`Comprador: ${comprador?.nome || '—'}`)
    linha(`Quantidade: ${p.quantidade || '—'} ${p.unidade || ''}`)
    linha(`Necessário até: ${p.dataNecessaria ? formatDate(p.dataNecessaria) : '—'}`)
    linha(`Valor estimado: ${p.valorEstimado ? formatCurrency(p.valorEstimado) : '—'}`)
    linha(`Valor final: ${p.valorFinal ? formatCurrency(p.valorFinal) : '—'}`)
    linha(`Centro de custo: ${p.centroCusto || '—'}`)
    linha(`Criado em: ${tsStr(p.criadoEm)}`)
    if (p.descricao) linha(`Observações: ${p.descricao}`.slice(0, 180))

    // Timeline
    if (_historico.length) {
      secao('Histórico')
      _historico.forEach(h => {
        const rotulo = h.tipo === 'cotacao'     ? `Cotação registrada: ${h.fornecedorNome || ''} ${h.valor ? formatCurrency(h.valor) : ''}`
                     : h.tipo === 'comprovante' ? `Comprovante anexado (parcela ${h.parcelaNumero || ''})`
                     : h.tipo === 'edicao'      ? `${h.campoLabel || h.campo}: "${h.valorAnterior ?? '—'}" → "${h.valorNovo ?? '—'}"`
                     : STATUS_LABEL[h.status] || h.status || ''
        linha(`${tsStr(h.criadoEm)} — ${rotulo}${h.nota ? ` (${h.nota})` : ''}`)
      })
    }

    // Cotações
    if (_cotacoes.length) {
      secao('Cotações')
      _cotacoes.forEach(c => {
        linha(`${c.fornecedorNome || '—'} — ${formatCurrency(c.valor)}${c.prazoEntrega ? ` — prazo: ${c.prazoEntrega}` : ''}${c.indicada ? '  [INDICADA]' : ''}`)
      })
    }

    // Parcelas
    if (_parcelas.length) {
      secao('Parcelas')
      _parcelas.forEach(par => {
        linha(`Parcela ${par.numero}/${par.total} — ${formatCurrency(par.valor)} — venc. ${formatDate(par.vencimento)} — ${par.pago ? `paga em ${tsStr(par.pagoEm)}` : 'em aberto'}`)
      })
    }

    pdf.save(`praxis-pedido-${numero.replace('#', '')}.pdf`)
    prxToast(t('pdfExportado'), 'success')
  } catch (err) {
    console.error(err)
    prxToast(t('erroExportarPDF'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _refreshComentarios() {
  const snap = await getDocs(collection(db, 'pedidos', _pedidoId, 'comentarios'))
  _comentarios = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
  const el = document.getElementById('activity-feed')
  if (el) el.innerHTML = _renderActivityFeed()
}

async function _refreshCotacoes() {
  const snap = await getDocs(collection(db, 'pedidos', _pedidoId, 'cotacoes'))
  _cotacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  const el = document.getElementById('cotacoes-list')
  if (el) {
    el.innerHTML = _renderCotacoes()
    el.querySelectorAll('[data-indicar]').forEach(btn => {
      btn.addEventListener('click', () => _indicarCotacao(btn.dataset.indicar))
    })
  }
}

async function _refreshParcelas() {
  const snap = await getDocs(collection(db, 'pedidos', _pedidoId, 'parcelas'))
  _parcelas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.numero - b.numero)
  const el = document.getElementById('parcelas-list')
  if (el) {
    el.innerHTML = _renderParcelas()
    el.querySelectorAll('[data-pagar]').forEach(btn => {
      btn.addEventListener('click', () => _pagarParcela(btn.dataset.pagar))
    })
    el.querySelectorAll('input[data-comprov]').forEach(inp => {
      inp.addEventListener('change', e => {
        const file = e.target.files[0]
        if (file) _anexarComprovante(inp.dataset.comprov, file)
      })
    })
  }
}

// ── Utilitário ────────────────────────────────────────────────
async function _reabrirPedido() {
  if (!exigirConexao()) return
  const justificativa = document.getElementById('reabrir-justificativa')?.value.trim()
  if (!justificativa) {
    prxToast(t('informarJustificativa'), 'error')
    return
  }
  const btn = document.getElementById('btn-confirmar-reabrir')
  await btnComLoading(btn, async () => {
    const p = _pedido
    const contadorRef = doc(db, '_meta', 'contadores')
    let newId = null
    let newNum = null

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(contadorRef)
      const total = ((snap.exists() ? snap.data().totalPedidos : 0) || 0) + 1
      newNum = `PRX-${String(total).padStart(4, '0')}`
      const novoRef = doc(collection(db, 'pedidos'))
      newId = novoRef.id

      tx.set(novoRef, {
        numeroPedido:    newNum,
        titulo:          p.titulo,
        descricao:       p.descricao || '',
        empresaId:       p.empresaId,
        categoriaId:     p.categoriaId || '',
        quantidade:      p.quantidade,
        unidade:         p.unidade,
        valorEstimado:   p.valorEstimado || null,
        centroCusto:     p.centroCusto || '',
        dataNecessaria:  p.dataNecessaria,
        urgente:         p.urgente || false,
        solicitanteId:   p.solicitanteId,
        solicitanteNome: p.solicitanteNome || sessao.usuario.nome,
        status:          STATUS.SOLICITADO,
        reabertoDe:      p.id,
        reabertaDeNum:   p.numeroPedido || '—',
        justificativaReabertura: justificativa,
        criadoEm:        serverTimestamp(),
        atualizadoEm:    serverTimestamp(),
      })

      tx.update(doc(db, 'pedidos', p.id), {
        reabertoPara:    newId,
        reabertaParaNum: newNum,
        atualizadoEm:    serverTimestamp(),
      })

      tx.set(contadorRef, { totalPedidos: total }, { merge: true })
    })

    // Historico no pedido novo (fire-and-forget)
    addDoc(collection(db, 'pedidos', newId, 'historico'), {
      status:    STATUS.SOLICITADO,
      autorId:   sessao.usuario.id,
      autorNome: sessao.usuario.nome,
      nota:      `Reaberto a partir de ${p.numeroPedido || p.id} — ${justificativa}`,
      criadoEm:  serverTimestamp(),
    })

    fecharModal('modal-reabrir')
    prxToast(`${t('pedidoReabertoComo')} ${newNum}.`, 'success', 4000)
    navegar('detalhe', { id: newId })
  })
}

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

// ── Anexos gerais (4.10) ──────────────────────────────────────
function _renderAnexos() {
  if (!_anexos.length) return `
    <div class="empty-state-branded" style="padding:0.75rem 1rem">
      <div class="empty-sub">Nenhum anexo ainda. Adicione especificações, fotos de referência ou documentos de apoio.</div>
    </div>
  `
  return _anexos.map(a => {
    const ext = (a.nome || '').split('.').pop().toLowerCase()
    const isImg = ['jpg','jpeg','png','webp'].includes(ext)
    const isPDF = ext === 'pdf'
    const autor = _usuarios.find(u => u.id === a.autorId)
    const ts    = formatarDataRelativa(a.criadoEm)
    const uid   = sessao.usuario.id
    const perfil = sessao.usuario.perfil
    const podeRemover = a.autorId === uid || [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
    return `
      <div class="anexo-item">
        <div class="anexo-icon${isPDF ? ' anexo-icon-pdf' : isImg ? ' anexo-icon-img' : ''}">
          ${isImg
            ? `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
            : `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`}
        </div>
        <div class="anexo-info">
          <div class="anexo-nome">${_esc(a.nome)}</div>
          <div class="anexo-meta">${_formatarTamanho(a.tamanho)} · ${_esc(autor?.nome || a.autorNome || '—')} · <span title="${ts.title}">${ts.label}</span></div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-shrink:0;align-items:center">
          <a href="${_esc(a.url)}" target="_blank" rel="noopener" class="btn-secondary btn-sm">Baixar</a>
          ${podeRemover ? `<button class="btn-danger btn-sm" data-remover-anexo="${_esc(a.id)}" data-storage-path="${_esc(a.storagePath || '')}">Remover</button>` : ''}
        </div>
      </div>
    `
  }).join('')
}

function _formatarTamanho(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function _uploadAnexo(file) {
  const TIPOS = [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]
  if (!TIPOS.includes(file.type)) {
    prxToast(t('tipoNaoPermitido'), 'error')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    prxToast(`"${file.name}" ${t('arquivoMuitoGrande')}`, 'error')
    return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const storagePath = STORAGE_PATHS.anexo(_pedidoId) + '/' + Date.now() + '_' + file.name
    const ref = storageRef(storage, storagePath)
    await uploadBytes(ref, file)
    const url = await getDownloadURL(ref)
    await addDoc(collection(db, 'pedidos', _pedidoId, 'anexos'), {
      nome: file.name,
      tamanho: file.size,
      tipo: file.type,
      url,
      storagePath,
      autorId: sessao.usuario.id,
      autorNome: sessao.usuario.nome || '',
      criadoEm: serverTimestamp(),
    })
    addDoc(collection(db, 'pedidos', _pedidoId, 'historico'), {
      tipo: 'anexo',
      nomeArquivo: file.name,
      autorId: sessao.usuario.id,
      autorNome: sessao.usuario.nome || '',
      criadoEm: serverTimestamp(),
    }).catch(() => {})
    // Atualiza lista local
    const snap = await getDocs(collection(db, 'pedidos', _pedidoId, 'anexos'))
    _anexos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
    const el = document.getElementById('anexos-list')
    if (el) { el.innerHTML = _renderAnexos(); _bindAnexosEvents() }
    prxToast(`"${file.name}" ${t('btnAdicionarAnexo').toLowerCase()}.`, 'success')
  } catch (err) {
    prxToast(t('erroEnviarAnexo') + (err.message || 'tente novamente'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _removerAnexo(anexoId, storagePath) {
  const ok = await prxConfirm('Remover este anexo?', 'Esta ação não pode ser desfeita.', 'Remover', 'Cancelar', true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await deleteDoc(doc(db, 'pedidos', _pedidoId, 'anexos', anexoId))
    if (storagePath) deleteObject(storageRef(storage, storagePath)).catch(() => {})
    _anexos = _anexos.filter(a => a.id !== anexoId)
    const el = document.getElementById('anexos-list')
    if (el) { el.innerHTML = _renderAnexos(); _bindAnexosEvents() }
    prxToast(t('anexoRemovido'), 'success')
  } catch (err) {
    prxToast(t('erroRemoverAnexo') + (err.message || 'tente novamente'), 'error')
  } finally {
    esconderSpinner()
  }
}

function _bindAnexosEvents() {
  document.querySelectorAll('[data-remover-anexo]').forEach(btn => {
    btn.addEventListener('click', () => _removerAnexo(btn.dataset.removerAnexo, btn.dataset.storagePath))
  })
}

// ── SLA timeline (4.11) ───────────────────────────────────────
function _renderSLATimeline() {
  const transicoes = _historico
    .filter(h => h.status && (!h.tipo || h.tipo === 'status'))
    .sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))

  if (transicoes.length < 2) return ''

  const TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
  const agora = Date.now()

  const segmentos = transicoes.map((t, i) => {
    const inicio = _tsMs(t.criadoEm)
    const fim    = i < transicoes.length - 1 ? _tsMs(transicoes[i + 1].criadoEm) : agora
    return {
      status:      t.status,
      durMs:       Math.max(0, fim - inicio),
      emAndamento: i === transicoes.length - 1 && !TERMINAIS.includes(_pedido.status),
    }
  })

  const totalMs  = segmentos.reduce((s, seg) => s + seg.durMs, 0)
  if (totalMs === 0) return ''
  const maxDurMs = Math.max(...segmentos.map(s => s.durMs))

  const _slaColorMap = {
    [STATUS.SOLICITADO]:   'var(--text3)',
    [STATUS.AG_COTACAO]:   'var(--accent, #4a9eff)',
    [STATUS.EM_APROVACAO]: 'var(--gold)',
    [STATUS.APROVADO]:     'var(--green)',
    [STATUS.COMPRADO]:     'var(--green)',
    [STATUS.ENTREGUE]:     'var(--green)',
    [STATUS.PAGO]:         'var(--green)',
    [STATUS.REPROVADO]:    'var(--red)',
    [STATUS.CANCELADO]:    'var(--red)',
  }

  const barras = segmentos.map(seg => {
    const pct      = (seg.durMs / totalMs * 100).toFixed(2)
    const label    = STATUS_LABEL[seg.status] || seg.status
    const durLabel = _formatDuracao(seg.durMs)
    const cor      = _slaColorMap[seg.status] || 'var(--text3)'
    const isGarg   = seg.durMs === maxDurMs && segmentos.length > 1
    return `<div
      class="sla-seg${seg.emAndamento ? ' sla-andamento' : ''}${isGarg ? ' sla-gargalo' : ''}"
      style="width:${pct}%;background:${cor}"
      title="${label}: ${durLabel}${seg.emAndamento ? ' — em andamento' : ''}${isGarg ? ' · maior etapa' : ''}"></div>`
  }).join('')

  return `
    <div class="sla-timeline-wrap" style="margin-top:1.25rem">
      <div class="sla-timeline-header">
        <span class="sla-timeline-label">Tempo por etapa</span>
        <span class="sla-timeline-total">${_formatDuracao(totalMs)} total</span>
      </div>
      <div class="sla-timeline">${barras}</div>
      <div class="sla-legend">
        ${segmentos.map(seg => {
          const cor   = _slaColorMap[seg.status] || 'var(--text3)'
          const label = STATUS_LABEL[seg.status] || seg.status
          return `<span class="sla-legend-item" title="${label}: ${_formatDuracao(seg.durMs)}">
            <span class="sla-legend-dot" style="background:${cor}"></span>${label}
          </span>`
        }).join('')}
      </div>
    </div>
  `
}

function _formatDuracao(ms) {
  if (!ms || ms < 0) return '—'
  const minutos = Math.floor(ms / 60000)
  const horas   = Math.floor(minutos / 60)
  const dias    = Math.floor(horas / 24)
  const h       = horas % 24
  if (dias > 0) return h > 0 ? `${dias}d ${h}h` : `${dias}d`
  if (horas > 0) return `${horas}h`
  return `${minutos}min`
}
