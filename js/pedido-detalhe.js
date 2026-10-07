import {
  db, storage,
  doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot,
  query, where,
  runTransaction, writeBatch, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
} from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, btnComLoading, abrirModal, fecharModal, exigirConexao } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL,
  PERFIS, PERFIS_LABEL, MOTIVOS_REPROVACAO, MOTIVOS_CANCELAMENTO,
  CONDICAO_PAGAMENTO, STORAGE_PATHS, t,
} from './constants.js'
import {
  formatCurrency, formatDate, formatarDataRelativa, gerarIniciais,
  hojeISO, maisXDiasISO, normalizarTexto, parseMoeda,
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
  let _assinatura = null
  _unsubPedido = onSnapshot(
    doc(db, 'pedidos', _pedidoId),
    async snap => {
      if (!snap.exists()) {
        _renderErroDetalhe(t('pedidoNaoEncontrado'), t('pedidoRemovidoMsg'))
        return
      }
      // Campos que não mudam nada na tela (leitura, carimbos) não disparam nova renderização —
      // evita fechar um modal aberto quando o "visto por" é gravado
      const { vistoPor, atualizadoEm, ultimoComentarioEm, ...relevante } = snap.data()
      const assinatura = JSON.stringify(relevante, (k, v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v))
      _pedido = { id: snap.id, ...snap.data() }
      if (assinatura === _assinatura) return
      _assinatura = assinatura
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
    <div class="detalhe-erro" role="alert">
      <h1 class="detalhe-erro-titulo">${titulo}</h1>
      <p class="detalhe-erro-texto">${msg}</p>
      <button class="btn-secondary" onclick="window.__navegar('pedidos')">Voltar para pedidos</button>
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
      // O histórico alimenta a atividade, os nomes (pessoas, próximo passo) e o tempo por etapa
      if (_pedido && _pedido.id === _pedidoId && document.querySelector('#detalhe-root .detalhe-layout')) _renderDetalhe()
    },
    // Sem acesso ao pedido (ou pedido inexistente): o listener principal já
    // mostra o estado de erro; aqui só encerra, sem erro solto no console
    () => {
      if (_unsubHistorico) { _unsubHistorico(); _unsubHistorico = null }
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

// ── Ícones (traço 2, mesma família) ───────────────────────────
const _svg = (d, t = 15) => `<svg width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`
const ICO = {
  mais:      _svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', 16),
  fechar:    _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 16),
  editar:    _svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>'),
  duplicar:  _svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>'),
  pdf:       _svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  cancelar:  _svg('<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'),
  liberar:   _svg('<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/>'),
  reabrir:   _svg('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 10.49-4.5"/>'),
  check:     _svg('<polyline points="20 6 9 17 4 12"/>'),
  x:         _svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  relogio:   _svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 16),
  usuario:   _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 16),
  doc:       _svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>', 16),
  docMais:   _svg('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/>', 18),
  carrinho:  _svg('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>', 16),
  caixa:     _svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>', 16),
  moeda:     _svg('<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>', 16),
  escudo:    _svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', 16),
  alerta:    _svg('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 16),
  clipe:     _svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>', 14),
  imagem:    _svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', 16),
  baixar:    _svg('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 14),
  lixeira:   _svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>', 14),
  enviar:    _svg('<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>', 14),
  externo:   _svg('<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>', 14),
  raio:      _svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 11),
  comparar:  _svg('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', 14),
  mais2:     _svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 14),
  conversa:  _svg('<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>', 18),
}

const _TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]

// Nome de um usuário: lista de usuários (gestor+), sessão, ou autoria registrada no histórico/comentários
function _nomePorId(id) {
  if (!id) return null
  if (id === sessao.usuario.id) return sessao.usuario.nome
  const u = _usuarios.find(x => x.id === id)
  if (u?.nome) return u.nome
  // Nomes gravados no próprio pedido (perfis sem acesso à lista de usuários)
  const p = _pedido || {}
  const gravado = { [p.solicitanteId]: p.solicitanteNome, [p.compradorId]: p.compradorNome,
    [p.aprovadoPor]: p.aprovadoPorNome, [p.reprovadoPor]: p.reprovadoPorNome, [p.canceladoPor]: p.canceladoPorNome }[id]
  if (gravado) return gravado
  const reg = [..._historico, ..._comentarios].find(x => x.autorId === id && x.autorNome)
  return reg?.autorNome || null
}

// Última transição registrada para um status: quem fez e quando
function _quemFez(status) {
  const h = [..._historico].reverse().find(x => x.status === status && (!x.tipo || x.tipo === 'status'))
  if (!h) return null
  return { id: h.autorId || null, nome: h.autorNome || _nomePorId(h.autorId), em: h.criadoEm }
}

// Data de um campo Timestamp/ISO para dd/mm/aaaa
function _dataCurta(v) {
  if (!v) return ''
  if (typeof v === 'string') return formatDate(v.slice(0, 10))
  const d = v.toDate ? v.toDate() : new Date(v)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('pt-BR')
}

function _diasAte(iso) {
  if (!iso) return null
  return Math.round((new Date(iso + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 86400000)
}

// Cabeçalho dos modais do detalhe: número do pedido em numerais sobre o título
function _cabModal(idTitulo, titulo, atributoFechar) {
  const p = _pedido || {}
  return `
    <div class="modal-header dt-modal-cab">
      <div class="dt-modal-tit">
        <span class="dt-modal-num">${_esc(p.numeroPedido || '')}<span class="dt-modal-pedido">${_esc(p.titulo || '')}</span></span>
        <h2 id="${idTitulo}">${titulo}</h2>
      </div>
      <button class="btn-icon" ${atributoFechar} aria-label="${t('dtFechar')}">${ICO.fechar}</button>
    </div>`
}

function _modalShell(id, titulo, corpo, rodape, largura = 520) {
  return `
    <div class="modal-overlay dt-modal" id="${id}">
      <div class="modal" style="max-width:${largura}px" role="dialog" aria-modal="true" aria-labelledby="${id}-titulo">
        ${_cabModal(`${id}-titulo`, titulo, `data-close="${id}"`)}
        <div class="modal-body">${corpo}</div>
        <div class="modal-footer">${rodape}</div>
      </div>
    </div>`
}

// ── Caminho do pedido ─────────────────────────────────────────
// As sete etapas, com os mesmos nomes e numerais do quadro de pedidos
const _ETAPAS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
const _NOME_ETAPA = {
  [STATUS.SOLICITADO]: 'Solicitado', [STATUS.AG_COTACAO]: 'Em cotação', [STATUS.EM_APROVACAO]: 'Em aprovação',
  [STATUS.APROVADO]: 'Aprovado', [STATUS.COMPRADO]: 'Comprado', [STATUS.ENTREGUE]: 'Entregue', [STATUS.PAGO]: 'Pago',
  [STATUS.REPROVADO]: 'Reprovado', [STATUS.CANCELADO]: 'Cancelado',
}
const _dois = n => String(n).padStart(2, '0')
const _dias = n => `${n} dia${n === 1 ? '' : 's'}`
const _pct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}%`

// Mudanças de status registradas no histórico, da mais antiga para a mais nova
function _transicoes() {
  return _historico
    .filter(h => h.status && (!h.tipo || h.tipo === 'status'))
    .sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
}

// Quando o pedido entrou em cada etapa (vale a última entrada: um pedido liberado volta a Solicitado)
function _entradas() {
  const m = {}
  _transicoes().forEach(h => { m[h.status] = h.criadoEm })
  if (!m[STATUS.SOLICITADO] && _pedido.criadoEm) m[STATUS.SOLICITADO] = _pedido.criadoEm
  return m
}

// Etapa atual; em pedido reprovado ou cancelado, a etapa em que ele parou
function _posicaoCaminho() {
  const p = _pedido
  const i = _ETAPAS.indexOf(p.status)
  if (i >= 0) return { atual: i, parou: null }
  if (p.status === STATUS.REPROVADO) return { atual: _ETAPAS.indexOf(STATUS.EM_APROVACAO), parou: STATUS.REPROVADO }
  const ultima = [..._transicoes()].reverse().find(h => _ETAPAS.includes(h.status))
  return { atual: ultima ? _ETAPAS.indexOf(ultima.status) : 0, parou: STATUS.CANCELADO }
}

// dd/mm, com o ano quando não for o corrente
function _diaMes(v) {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v.slice(0, 10) + 'T00:00:00') : (v.toDate ? v.toDate() : new Date(v))
  if (isNaN(d)) return ''
  const dm = `${_dois(d.getDate())}/${_dois(d.getMonth() + 1)}`
  return d.getFullYear() === new Date().getFullYear() ? dm : `${dm}/${String(d.getFullYear()).slice(2)}`
}

// Prazo do pedido em palavras, com o estado: atrasado, perto ou com folga
function _estadoPrazo() {
  const p = _pedido
  if (!p.dataNecessaria) return null
  const data = formatDate(p.dataNecessaria)
  if (_TERMINAIS.includes(p.status) || p.status === STATUS.ENTREGUE) return { data, texto: '', cls: '' }
  const d = _diasAte(p.dataNecessaria)
  if (d < 0) return { data, texto: `Atrasado ${_dias(-d)}`, cls: 'atrasado' }
  if (d === 0) return { data, texto: 'Vence hoje', cls: 'atrasado' }
  return { data, texto: `${d === 1 ? 'Falta' : 'Faltam'} ${_dias(d)}`, cls: d <= 3 ? 'perto' : '' }
}

function _renderCaminho() {
  const p = _pedido
  const { atual, parou } = _posicaoCaminho()
  const ent = _entradas()
  const fim = parou === STATUS.REPROVADO ? (p.reprovadoEm || _quemFez(STATUS.REPROVADO)?.em)
    : parou === STATUS.CANCELADO ? (p.canceladoEm || _quemFez(STATUS.CANCELADO)?.em) : null
  const etapas = _ETAPAS.map((st, i) => {
    let cls, sub = '', leitor = ''
    if (i < atual) { cls = 'feita'; sub = _diaMes(ent[st]); leitor = 'concluída' }
    else if (i === atual && parou) {
      cls = 'parou'
      sub = `${parou === STATUS.REPROVADO ? 'Reprovado' : 'Cancelado'}${fim ? ` em ${_diaMes(fim)}` : ''}`
    } else if (i === atual) {
      cls = p.status === STATUS.PAGO ? 'atual fim' : 'atual'
      sub = p.status === STATUS.PAGO ? `Em ${_diaMes(ent[st]) || '—'}` : (ent[st] ? formatarDataRelativa(ent[st]).label : 'Agora')
      leitor = 'etapa atual'
    } else { cls = parou ? 'cortada' : 'futura' }
    return `
      <li class="caminho-etapa ${cls}"${i === atual ? ' aria-current="step"' : ''}>
        <span class="caminho-num" aria-hidden="true">${_dois(i + 1)}</span>
        <span class="caminho-nome">${_NOME_ETAPA[st]}${leitor ? `<span class="sr-only">, ${leitor}</span>` : ''}</span>
        <span class="caminho-sub">${sub || '&nbsp;'}</span>
      </li>`
  }).join('')
  return `
    <div class="caminho-wrap">
      <ol class="caminho${parou ? ' interrompido' : ''}" id="caminho" aria-label="Caminho do pedido">${etapas}</ol>
    </div>`
}

// ── Cabeçalho ─────────────────────────────────────────────────
function _renderCabecalho(menu) {
  const p = _pedido
  const empresa = _empresas.find(e => e.id === p.empresaId)
  const solicNome = _nomePorId(p.solicitanteId) || p.solicitanteNome || null
  const criado = p.criadoEm ? formatarDataRelativa(p.criadoEm) : null
  const prazo = _estadoPrazo()
  const meta = []
  if (empresa?.nome) meta.push(`<span>${_esc(empresa.nome)}</span>`)
  if (solicNome || criado) {
    meta.push(`<span>${solicNome ? `Aberto por ${_esc(solicNome)}` : 'Aberto'}${criado ? ` <span title="${criado.title}">${criado.label.toLowerCase()}</span>` : ''}</span>`)
  }
  if (prazo) {
    meta.push(`<span>${t('dtPrazo')} <span class="detalhe-meta-data">${prazo.data}</span>${prazo.texto
      ? `<span class="detalhe-meta-sep" aria-hidden="true">·</span><span class="detalhe-prazo ${prazo.cls}">${prazo.texto}</span>` : ''}</span>`)
  }
  const vinculo = (rotulo, id, num) => `
    <p class="reaberto-banner">${ICO.reabrir}<span>${rotulo}</span>
      <a class="reaberto-link" href="?tela=detalhe&id=${_esc(id)}" onclick="event.preventDefault();window.__navegar('detalhe',{id:'${_esc(id)}'})">${_esc(num || id)}</a>
    </p>`
  return `
    <header class="detalhe-head">
      <div class="detalhe-head-linha">
        <nav class="detalhe-trilha" aria-label="Navegação">
          <a href="?tela=pedidos" onclick="event.preventDefault();window.__navegar('pedidos')">${t('titulo')}</a>
          <span class="detalhe-trilha-sep" aria-hidden="true">/</span>
          <span class="detalhe-num" aria-current="page">${_esc(p.numeroPedido || '—')}</span>
        </nav>
        ${p.urgente ? `<span class="detalhe-urgente">${t('urgente')}</span>` : ''}
        ${_renderMenuAcoes(menu)}
      </div>
      <h1 class="detalhe-titulo">${_esc(p.titulo)}</h1>
      <p class="detalhe-meta">${meta.join('<span class="detalhe-meta-sep" aria-hidden="true">·</span>')}</p>
      ${p.reabertoDe ? vinculo(t('reabertoDe'), p.reabertoDe, p.reabertaDeNum) : ''}
      ${p.reabertoPara ? vinculo(t('reabertoComo'), p.reabertoPara, p.reabertaParaNum) : ''}
    </header>`
}

// ── Render HTML ───────────────────────────────────────────────
function _renderDetalhe() {
  const root = document.getElementById('detalhe-root')
  if (!root) return

  const p       = _pedido
  const empresa = _empresas.find(e => e.id === p.empresaId)
  const categ   = _categorias.find(c => c.id === p.categoriaId)
  const solicNome = _nomePorId(p.solicitanteId) || p.solicitanteNome || null
  const acoes   = _acoesDoPedido()
  // Preserva o rascunho de comentário e um modal aberto entre re-renderizações (snapshot em tempo real)
  const rascunho = document.getElementById('input-comentario')?.value || ''
  const modalAberto = root.querySelector('.modal-overlay.visible:not(.closing)')
  const estadoModal = modalAberto ? {
    id: modalAberto.id,
    campos: [...modalAberto.querySelectorAll('input:not([type=file]), select, textarea')].map(el => [el.id, el.value]),
  } : null

  const dados = [
    [t('metaEmpresa'), _esc(empresa?.nome || '—')],
    [t('metaCategoria'), _esc(categ?.nome || '—')],
    [t('metaQtd'), `<span class="dt-numeral">${_esc(p.quantidade ?? '—')}</span> ${_esc(p.unidade || '')}`],
    [t('metaNecessario'), p.dataNecessaria ? `<span class="dt-numeral">${formatDate(p.dataNecessaria)}</span>` : '—'],
    [t('metaValorEst'), p.valorEstimado ? `<span class="dt-numeral">${formatCurrency(p.valorEstimado)}</span>` : '—'],
    [t('metaCentro'), `<span class="mono">${_esc(p.centroCusto || '—')}</span>`],
  ]
  if (p.fornecedorNome) dados.push([t('fornecedorLabel'), _esc(p.fornecedorNome)])
  if (p.valorFinal) dados.push([t('metaValorFinal'), `<span class="dt-numeral">${formatCurrency(p.valorFinal)}</span>`, 'destaque'])
  if (p.condicaoPagamento) dados.push([t('condicaoPagLabel'), _esc(CONDICAO_PAGAMENTO[p.condicaoPagamento] || p.condicaoPagamento)])
  if (p.dataCompra)  dados.push([t('metaDataCompra'), `<span class="dt-numeral">${formatDate(p.dataCompra)}</span>`])
  if (p.dataEntrega) dados.push([t('metaDataEntrega'), `<span class="dt-numeral">${formatDate(p.dataEntrega)}</span>`])

  const nCot = _cotacoes.length
  const cotInd = _cotacoes.find(c => c.indicada)

  root.innerHTML = `
    <div class="detalhe-layout">
      ${_renderCabecalho(acoes.menu)}
      ${_renderCaminho()}
      ${_renderDecisao(acoes.painel)}

      <div class="detalhe-cols">
        <div class="detalhe-main">

          <section class="dt-bloco ord-dados" aria-labelledby="sec-dados">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-dados">${t('dtDadosPedido')}</h2></div>
            <dl class="detalhe-meta-grid">
              ${dados.map(([k, v, cls]) => `<div class="meta-item ${cls || ''}"><dt class="meta-label">${k}</dt><dd class="meta-value">${v}</dd></div>`).join('')}
            </dl>
            ${p.descricao ? `
              <div class="detalhe-descricao">
                <div class="meta-label">${t('dtDescricao')}</div>
                <p>${_esc(p.descricao)}</p>
              </div>` : ''}
          </section>

          <section class="dt-bloco ord-cotacoes" aria-labelledby="sec-cot">
            <div class="dt-card-head">
              <h2 class="dt-secao" id="sec-cot">${t('secaoCotacoes')}${nCot ? `<span class="dt-contagem">${nCot}</span>` : ''}</h2>
              ${nCot >= 2 ? `
                <div class="dt-card-acoes">
                  <span class="dt-legenda">${cotInd ? t('dtComparadasIndicada') : t('dtComparadasMenor')}</span>
                  <button class="btn-ghost btn-sm" id="btn-comparar-cotacoes" title="${t('dtLadoALadoTitulo')}">${ICO.comparar}${t('dtLadoALado')}</button>
                </div>` : ''}
            </div>
            <div id="cotacoes-list" class="cotacoes-list">${_renderCotacoes()}</div>
          </section>

          ${_parcelas.length ? `
            <section class="dt-bloco ord-parcelas" aria-labelledby="sec-parc">
              <div class="dt-card-head">
                <h2 class="dt-secao" id="sec-parc">${t('secaoParcelas')}<span class="dt-contagem">${_parcelas.length}</span></h2>
              </div>
              <div id="parcelas-wrap">${_renderParcelasBloco()}</div>
            </section>
          ` : ''}

          <section class="dt-bloco ord-atividade" aria-labelledby="sec-ativ">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-ativ">${t('secaoAtividade')}</h2></div>
            <div class="comentario-composer">
              <div class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(sessao.usuario.nome || '?')}</div>
              <div class="comentario-campo">
                <label for="input-comentario" class="sr-only">${t('dtComentario')}</label>
                <textarea id="input-comentario" rows="2" placeholder="${t('dtComentarioPlaceholder')}"></textarea>
                <div id="mention-dropdown" class="mention-dropdown" role="listbox" style="display:none"></div>
                <div class="comentario-rodape">
                  <span class="comentario-dica"><kbd>@</kbd> ${t('dtMenciona')} <span class="so-desktop">· <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ${t('dtEnvia')}</span></span>
                  <button class="btn-secondary btn-sm" id="btn-enviar-comentario">${ICO.enviar}${t('dtComentar')}</button>
                </div>
              </div>
            </div>
            <ol class="activity-feed" id="activity-feed">${_renderActivityFeed()}</ol>
          </section>
        </div>

        <aside class="detalhe-aside">
          <section class="dt-bloco ord-pessoas" aria-labelledby="sec-pessoas">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-pessoas">${t('pessoasEnvolvidas')}</h2></div>
            <div class="pessoas-lista">
              ${_renderPessoa(t('solicitanteLabel'), solicNome, t('criouPedido'))}
              ${_renderPessoaComprador()}
              ${_renderPessoaAprovadores()}
              ${_renderPessoaFinanceiro()}
            </div>
          </section>

          ${_renderSLATimeline()}

          <section class="dt-bloco ord-anexos" aria-labelledby="sec-anexos">
            <div class="dt-card-head">
              <h2 class="dt-secao" id="sec-anexos">${t('secaoAnexos')}${_anexos.length ? `<span class="dt-contagem">${_anexos.length}</span>` : ''}</h2>
              <label class="btn-ghost btn-sm dt-upload" tabindex="0">
                ${ICO.clipe} ${t('dtAnexar')}
                <input type="file" id="input-upload-anexo" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" multiple class="sr-only" tabindex="-1">
              </label>
            </div>
            <div id="anexos-list">${_renderAnexos()}</div>
          </section>
        </aside>
      </div>
    </div>

    ${_modalShell('modal-compra', t('btnExecutarCompra'), _corpoModalCompra(), `
      <button class="btn-secondary" data-close="modal-compra">${t('btnCancelar')}</button>
      <button class="btn-primary" id="btn-confirmar-compra">${t('confirmarCompra')}</button>`, 600)}

    ${_modalShell('modal-reprovar', t('tituloReprovar'), `
      <p class="modal-intro">${t('dtReprovarIntro')}</p>
      ${cotInd ? _resumoCotacao(cotInd, t('dtPropostaIndicada')) : ''}
      <div class="form-group">
        <label for="reprov-motivo">${t('motivoLabel')} *</label>
        <select id="reprov-motivo">
          <option value="">${t('selecionar')}</option>
          ${MOTIVOS_REPROVACAO.map(m => `<option value="${_esc(m)}">${_esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="reprov-outros-wrap" style="display:none;margin-top:1rem">
        <label for="reprov-outros">${t('especifique')} *</label>
        <textarea id="reprov-outros" placeholder="${t('especifiquePlaceholder')}" rows="3"></textarea>
      </div>`, `
      <button class="btn-secondary" data-close="modal-reprovar">${t('btnCancelar')}</button>
      <button class="btn-danger" id="btn-confirmar-reprovar">${t('btnReprovar')}</button>`, 480)}

    ${_modalShell('modal-cancelar', t('tituloCancelar'), `
      <p class="modal-intro">${t('dtCancelarIntro')}</p>
      <div class="form-group">
        <label for="cancel-motivo">${t('motivoLabel')} *</label>
        <select id="cancel-motivo">
          <option value="">${t('selecionar')}</option>
          ${MOTIVOS_CANCELAMENTO.map(m => `<option value="${_esc(m)}">${_esc(m)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="cancel-outros-wrap" style="display:none;margin-top:1rem">
        <label for="cancel-outros">${t('especifique')} *</label>
        <textarea id="cancel-outros" placeholder="${t('especifiquePlaceholder')}" rows="3"></textarea>
      </div>`, `
      <button class="btn-secondary" data-close="modal-cancelar">${t('dtVoltar')}</button>
      <button class="btn-danger" id="btn-confirmar-cancelar">${t('btnCancelarPedido')}</button>`, 480)}

    ${_modalShell('modal-reabrir', t('tituloReabrir'), `
      <p class="modal-intro">${t('reabrirDescricao')}</p>
      <div class="form-group">
        <label for="reabrir-justificativa">${t('justReaberturaLabel')} *</label>
        <textarea id="reabrir-justificativa" placeholder="${t('justReaberturaPlaceholder')}" rows="4"></textarea>
      </div>`, `
      <button class="btn-secondary" data-close="modal-reabrir">${t('btnCancelar')}</button>
      <button class="btn-primary" id="btn-confirmar-reabrir">${t('btnReabrir')}</button>`, 480)}
  `

  if (rascunho) { const ta = document.getElementById('input-comentario'); if (ta) ta.value = rascunho }
  _bindDetalheEvents()
  _centralizarCaminho()
  if (estadoModal && document.getElementById(estadoModal.id)) {
    estadoModal.campos.forEach(([id, v]) => { const el = id && document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')) } })
    document.getElementById(estadoModal.id).classList.add('visible')
  }
}

// No celular a régua rola: a etapa atual entra na vista, com a anterior ao lado
function _centralizarCaminho() {
  const ol = document.getElementById('caminho')
  const atual = ol?.querySelector('[aria-current="step"]')
  if (!ol || !atual || ol.scrollWidth <= ol.clientWidth) return
  const alvo = atual.previousElementSibling || atual
  ol.scrollLeft = Math.max(0, alvo.offsetLeft - ol.offsetLeft - 16)
}

// Bloco de uma cotação dentro de um modal (fornecedor, valor, condições)
function _resumoCotacao(c, rotulo) {
  return `
    <div class="modal-resumo">
      <span class="meta-label">${rotulo}</span>
      <div class="modal-resumo-linha"><strong>${_esc(c.fornecedorNome)}</strong><span class="dt-numeral">${formatCurrency(c.valor)}</span></div>
      ${c.prazoEntrega || c.condicoesComerciais ? `<div class="modal-resumo-sub">${_esc([c.prazoEntrega ? `Prazo ${c.prazoEntrega}` : '', c.condicoesComerciais].filter(Boolean).join(' · '))}</div>` : ''}
    </div>`
}

function _corpoModalCompra() {
  const ind = _cotacoes.find(c => c.indicada)
  const valorIni = ind?.valor ? formatCurrency(ind.valor) : ''
  return `
    ${ind ? _resumoCotacao(ind, t('dtCotacaoIndicada')) : ''}
    <div class="form-grid form-grid-2">
      <div class="form-group col-span-2">
        <label for="mc-fornecedor">${t('fornecedorLabel')} *</label>
        <input type="text" id="mc-fornecedor" placeholder="${t('dtNomeFornecedor')}" list="fornecedores-datalist" autocomplete="off" value="${_esc(ind?.fornecedorNome || '')}">
        <datalist id="fornecedores-datalist">${_fornecedorDatalistOptions()}</datalist>
      </div>
      <div class="form-group">
        <label for="mc-valor">${t('valorFinalLabel')} *</label>
        <input type="text" id="mc-valor" inputmode="decimal" placeholder="R$ 0,00" value="${_esc(valorIni)}">
      </div>
      <div class="form-group">
        <label for="mc-condicao">${t('condicaoPagLabel')} *</label>
        <select id="mc-condicao">
          <option value="">${t('selecionar')}</option>
          ${Object.entries(CONDICAO_PAGAMENTO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label for="mc-data">${t('dataCompraLabel')} *</label>
        <input type="date" id="mc-data" value="${hojeISO()}">
      </div>
      <div class="form-group">
        <label for="mc-parcelas">${t('numParcelasLabel')} *</label>
        <input type="number" id="mc-parcelas" value="1" min="1" max="60" inputmode="numeric">
      </div>
      <div class="form-group col-span-2">
        <label for="mc-venc1">${t('vencimentoPrimeiraLabel')} *</label>
        <input type="date" id="mc-venc1" value="${maisXDiasISO(30)}">
        <div class="form-hint" id="mc-resumo-parcelas"></div>
      </div>
    </div>`
}

// ── Ações ─────────────────────────────────────────────────────
// painel: a ação que faz o pedido andar, dentro do "Próximo passo" (secundária antes, principal por último)
// menu: o resto, no "…" do cabeçalho
function _acoesDoPedido() {
  const p = _pedido
  const uid = sessao.usuario.id
  const perfil = sessao.usuario.perfil
  const gestorMais = [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
  const painel = []
  const menu = []

  if (_podeAssumir()) painel.push(`<button class="btn-primary" id="btn-assumir">${ICO.usuario}${t('btnAssumirPedido')}</button>`)

  if (_podeAnexarCotacao()) {
    const cls = _cotacoes.length >= 3 ? 'btn-secondary' : 'btn-primary'
    painel.push(`<button class="${cls}" id="btn-add-cotacao">${ICO.mais2}${t('dtRegistrarCotacao')}</button>`)
  }

  if (p.status === STATUS.EM_APROVACAO && [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    painel.push(`<button class="btn-danger" id="btn-reprovar">${ICO.x}${t('btnReprovar')}</button>`)
    painel.push(`<button class="btn-primary" id="btn-aprovar">${ICO.check}${t('btnAprovar')}</button>`)
  }

  if (p.status === STATUS.APROVADO && [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) &&
      (p.compradorId === uid || gestorMais)) {
    painel.push(`<button class="btn-primary" id="btn-executar-compra">${ICO.carrinho}${t('btnExecutarCompra')}</button>`)
  }

  if (p.status === STATUS.COMPRADO &&
      ([PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) || p.solicitanteId === uid)) {
    painel.push(`<button class="btn-primary" id="btn-confirmar-entrega">${ICO.caixa}${t('btnConfirmarEntrega')}</button>`)
  }

  if (p.status === STATUS.ENTREGUE && [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    const proxima = _proximaParcela()
    if (proxima) painel.push(`<button class="btn-primary" id="btn-pagar-proxima" data-pagar="${_esc(proxima.id)}">${ICO.moeda}${t('dtRegistrarPagamento')}</button>`)
    else painel.push(`<button class="btn-primary" id="btn-confirmar-pagamento">${ICO.check}${t('btnConfirmarPagamento')}</button>`)
  }

  const podeEditar = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    (gestorMais && !_TERMINAIS.includes(p.status))
  )
  if (podeEditar) menu.push({ id: 'btn-editar-pedido', icone: ICO.editar, label: t('btnEditarPedido') })
  if ([PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    menu.push({ id: 'btn-duplicar-pedido', icone: ICO.duplicar, label: t('dtDuplicarPedido') })
  }
  if (p.status === STATUS.REPROVADO && !p.reabertoPara && [PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    menu.push({ id: 'btn-reabrir-pedido', icone: ICO.reabrir, label: t('btnReabrir') })
  }
  if ([PERFIS.GESTOR, PERFIS.SUPREMO, PERFIS.FINANCEIRO, PERFIS.COMPRADOR].includes(perfil)) {
    menu.push({ id: 'btn-exportar-pdf', icone: ICO.pdf, label: t('btnExportarPDF') })
  }
  if (_podeLiberar()) menu.push({ id: 'btn-liberar', icone: ICO.liberar, label: t('btnLiberarPedido') })

  const podeCanc = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    (gestorMais && ![STATUS.ENTREGUE, STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
  )
  if (podeCanc) menu.push({ id: 'btn-cancelar', icone: ICO.cancelar, label: t('btnCancelarPedido'), perigo: true })

  return { painel, menu }
}

function _renderMenuAcoes(menu) {
  if (!menu.length) return ''
  return `
    <div class="menu-acoes-wrap">
      <button class="btn-secondary btn-mais" id="btn-mais-acoes" aria-haspopup="menu" aria-expanded="false" aria-controls="menu-mais-acoes" aria-label="${t('dtMaisAcoes')}" title="${t('dtMaisAcoes')}">${ICO.mais}</button>
      <div class="menu-acoes" id="menu-mais-acoes" role="menu" hidden>
        ${menu.map((m, i) => `
          ${m.perigo && i > 0 ? '<div class="menu-acoes-sep" role="separator"></div>' : ''}
          <button class="menu-acoes-item ${m.perigo ? 'perigo' : ''}" role="menuitem" id="${m.id}">${m.icone}<span>${m.label}</span></button>
        `).join('')}
      </div>
    </div>`
}

// Parcela em aberto com o vencimento mais próximo
function _proximaParcela() {
  return _parcelas.filter(x => !x.pago).sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')) || a.numero - b.numero)[0] || null
}

// ── Painel de decisão: o que falta, quem responde e a ação ────
function _renderDecisao(acoes) {
  const p = _pedido
  const perfil = sessao.usuario.perfil
  const ind = _cotacoes.find(c => c.indicada)
  const n = _cotacoes.length
  const fatos = []     // [rótulo, valor, detalhe, classe]
  let rotulo = t('dtProximoPasso'), tom = 'neutro', titulo = '', texto = '', resp = null
  const ultimaNota = st => [..._historico].reverse().find(h => h.status === st && h.nota)?.nota
  const dinheiro = v => `<span class="dt-numeral">${formatCurrency(v)}</span>`
  const prazo = _estadoPrazo()
  const fatoPrazo = () => prazo && fatos.push([t('dtPrazo'), `<span class="dt-numeral">${prazo.data}</span>`, prazo.texto, prazo.cls ? `prazo-${prazo.cls}` : ''])
  const comprador = () => p.compradorId ? (_nomePorId(p.compradorId) || p.compradorNome || null) : (_quemFez(STATUS.AG_COTACAO)?.nome || null)

  switch (p.status) {
    case STATUS.SOLICITADO:
      titulo = _podeAssumir() ? t('dtSolicTituloPode') : t('dtSolicTitulo')
      texto = _podeAssumir() ? t('dtSolicTextoPode') : t('dtSolicTexto')
      if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: null, vazio: t('dtSemResponsavel') }
      break

    case STATUS.AG_COTACAO: {
      const pode = _podeAnexarCotacao()
      titulo = n === 0 ? (pode ? t('dtCotTituloVazio') : t('dtCotTituloAndamento'))
        : n < 3 ? `${n} de 3 cotações registradas` : (pode ? t('dtCotTituloIndicar') : `${n} cotações registradas`)
      texto = !pode ? t('dtCotTextoOutros')
        : n === 0 ? t('dtCotTextoVazio') : n < 3 ? t('dtCotTextoPoucas') : t('dtCotTextoIndicar')
      fatos.push([t('secaoCotacoes'), `<span class="dt-numeral">${n}</span><span class="dt-de"> de 3</span>`])
      if (n) fatos.push([t('dtMenorValor'), dinheiro(Math.min(..._cotacoes.map(c => c.valor)))])
      else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: comprador() || t('dtCompradorDesignado') }
      break
    }

    case STATUS.EM_APROVACAO: {
      const podeDecidir = [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
      titulo = podeDecidir ? t('dtAprovTituloPode') : t('dtAprovTitulo')
      texto = ind
        ? `${_esc(ind.fornecedorNome)} ${t('dtFoiIndicada')}${n > 1 ? `, ${t('dtEntre')} ${n} ${t('dtCotacoesMin')}` : ''}.`
        : t('dtAprovSemIndicada')
      if (ind) {
        fatos.push([t('dtPropostaIndicada'), dinheiro(ind.valor), _esc(ind.fornecedorNome)])
        if (p.valorEstimado) {
          const dif = ind.valor - p.valorEstimado
          fatos.push([t('dtFrenteEstimado'), `<span class="dt-numeral">${_pct(dif / p.valorEstimado * 100)}</span>`,
            `${dif > 0 ? 'acima de' : dif < 0 ? 'abaixo de' : 'igual a'} ${formatCurrency(p.valorEstimado)}`, dif > 0 ? 'acima' : 'abaixo'])
        }
        if (n > 1) {
          const maior = Math.max(..._cotacoes.map(c => c.valor))
          if (maior > ind.valor) fatos.push([t('economiaLabel'), dinheiro(maior - ind.valor), t('dtFrenteMaisCara')])
        }
      } else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      resp = _respAprovadores()
      break
    }

    case STATUS.APROVADO: {
      const h = _quemFez(STATUS.APROVADO)
      const quem = _nomePorId(p.aprovadoPor) || p.aprovadoPorNome || h?.nome
      const em = p.aprovadoEm || h?.em
      titulo = acoes.length ? t('dtAprovadoTituloPode') : t('dtAprovadoTitulo')
      texto = `${quem ? `Aprovado por ${_esc(quem)}${em ? ` em ${_dataCurta(em)}` : ''}. ` : ''}${acoes.length ? t('dtAprovadoTextoPode') : t('dtAprovadoTexto')}`
      if (ind) fatos.push([t('dtValorAprovado'), dinheiro(ind.valor), _esc(ind.fornecedorNome)])
      else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: comprador() || t('dtCompradorDesignado') }
      break
    }

    case STATUS.COMPRADO:
      titulo = acoes.length ? t('dtCompradoTituloPode') : t('dtCompradoTitulo')
      texto = `${p.fornecedorNome ? `Compra feita com ${_esc(p.fornecedorNome)}${p.dataCompra ? ` em ${formatDate(p.dataCompra)}` : ''}. ` : ''}${t('dtCompradoTexto')}`
      if (p.valorFinal) fatos.push([t('metaValorFinal'), dinheiro(p.valorFinal), _esc(p.fornecedorNome || '')])
      fatoPrazo()
      resp = { papel: t('dtRecebimento'), nome: comprador() || _nomePorId(p.solicitanteId) || p.solicitanteNome || null }
      break

    case STATUS.ENTREGUE: {
      const pagas = _parcelas.filter(x => x.pago)
      const total = _parcelas.reduce((s, x) => s + (x.valor || 0), 0)
      const pago = pagas.reduce((s, x) => s + (x.valor || 0), 0)
      const prox = _proximaParcela()
      titulo = prox
        ? (acoes.length ? `Registre o pagamento da parcela ${prox.numero}/${prox.total}` : t('dtEntregueTitulo'))
        : (acoes.length ? t('dtEntregueTituloConcluir') : t('dtEntregueTitulo'))
      texto = `${p.dataEntrega ? `Recebido em ${formatDate(p.dataEntrega)}. ` : ''}${_parcelas.length
        ? `${pagas.length} de ${_parcelas.length} parcela${_parcelas.length > 1 ? 's' : ''} paga${pagas.length === 1 ? '' : 's'}.`
        : t('dtSemParcelas')}`
      if (_parcelas.length) fatos.push([t('dtPago'), dinheiro(pago), `de ${formatCurrency(total)}`])
      if (prox) {
        const d = _diasAte(prox.vencimento)
        const est = d === null ? '' : d < 0 ? `Vencida há ${_dias(-d)}` : d === 0 ? 'Vence hoje' : `Vence em ${_dias(d)}`
        fatos.push([`${t('dtParcela')} ${prox.numero}/${prox.total}`, dinheiro(prox.valor), `${formatDate(prox.vencimento)}${est ? ` · ${est}` : ''}`, d !== null && d < 0 ? 'prazo-atrasado' : ''])
      }
      resp = _respFinanceiro()
      break
    }

    case STATUS.PAGO: {
      rotulo = t('dtConcluido'); tom = 'ok'
      const ent = _entradas()
      titulo = t('dtPagoTitulo')
      texto = `${p.valorFinal ? `${formatCurrency(p.valorFinal)} pagos` : 'Pago integralmente'}${p.fornecedorNome ? ` a ${_esc(p.fornecedorNome)}` : ''}.`
      if (p.valorFinal) fatos.push([t('dtValorPago'), dinheiro(p.valorFinal), _esc(p.fornecedorNome || '')])
      if (ent[STATUS.PAGO]) fatos.push([t('dtConcluidoEm'), `<span class="dt-numeral">${_dataCurta(ent[STATUS.PAGO])}</span>`])
      if (p.criadoEm && ent[STATUS.PAGO]) {
        const d = Math.max(1, Math.round((_tsMs(ent[STATUS.PAGO]) - _tsMs(p.criadoEm)) / 86400000))
        fatos.push([t('dtDoPedidoAoPagamento'), `<span class="dt-numeral">${d}</span><span class="dt-de"> ${d === 1 ? 'dia' : 'dias'}</span>`])
      }
      break
    }

    case STATUS.REPROVADO: {
      rotulo = t('dtReprovado'); tom = 'erro'
      const motivo = p.motivoReprovacao === 'Outros' ? p.motivoReprovacaoOutros : (p.motivoReprovacao || ultimaNota(STATUS.REPROVADO))
      const h = _quemFez(STATUS.REPROVADO)
      const quem = _nomePorId(p.reprovadoPor) || p.reprovadoPorNome || h?.nome
      const em = p.reprovadoEm || h?.em
      titulo = motivo ? _esc(motivo) : t('dtReprovadoTitulo')
      texto = `${quem ? `Reprovado por ${_esc(quem)}${em ? ` em ${_dataCurta(em)}` : ''}.` : ''}`
      if (p.reabertoPara) texto += ` ${t('dtJaReaberto')} ${_esc(p.reabertaParaNum || '')}.`
      else if ([PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) texto += ` ${t('dtDicaReabrir')}`
      break
    }

    case STATUS.CANCELADO: {
      rotulo = t('dtCancelado'); tom = 'erro'
      const motivo = p.motivoCancelamento === 'Outros' ? p.motivoCancelamentoOutros : (p.motivoCancelamento || ultimaNota(STATUS.CANCELADO))
      const h = _quemFez(STATUS.CANCELADO)
      const quem = _nomePorId(p.canceladoPor) || p.canceladoPorNome || h?.nome
      const em = p.canceladoEm || h?.em
      titulo = motivo ? _esc(motivo) : t('dtCanceladoTitulo')
      texto = `${quem ? `Cancelado por ${_esc(quem)}${em ? ` em ${_dataCurta(em)}` : ''}. ` : ''}${t('dtCanceladoTexto')}`
      break
    }

    default: return ''
  }

  const comVoce = acoes.length > 0
  if (comVoce) tom = 'voce'
  const respHtml = resp ? `
    <div class="decisao-fato decisao-resp">
      <dt>${t('dtResponsavel')}</dt>
      <dd>
        ${resp.nome ? `<span class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(resp.nome)}</span>` : `<span class="avatar avatar-sm avatar-vazio" aria-hidden="true">${ICO.usuario}</span>`}
        <span class="decisao-resp-txt">
          <span class="decisao-resp-nome">${resp.nome ? _esc(resp.nome) : (resp.vazio || '—')}</span>
          <span class="decisao-resp-papel">${resp.papel}</span>
        </span>
      </dd>
    </div>` : ''

  return `
    <section class="decisao tom-${tom}" aria-labelledby="decisao-titulo">
      <div class="decisao-topo">
        <div class="decisao-texto">
          <p class="decisao-rotulo">${rotulo}${comVoce ? `<span class="decisao-voce">${t('dtComVoce')}</span>` : ''}</p>
          <h2 class="decisao-titulo" id="decisao-titulo">${titulo}</h2>
          ${texto.trim() ? `<p class="decisao-desc">${texto.trim()}</p>` : ''}
        </div>
        ${acoes.length ? `<div class="decisao-acoes" role="group" aria-label="${t('dtAcoesDoPasso')}">${acoes.join('')}</div>` : ''}
      </div>
      ${fatos.length || resp ? `
        <dl class="decisao-fatos">
          ${fatos.map(([k, v, sub, cls]) => `
            <div class="decisao-fato ${cls || ''}">
              <dt>${k}</dt>
              <dd><span class="decisao-valor">${v}</span>${sub ? `<span class="decisao-sub">${sub}</span>` : ''}</dd>
            </div>`).join('')}
          ${respHtml}
        </dl>` : ''}
    </section>`
}

// Quem decide a aprovação: os aprovadores do pedido ou da empresa
function _respAprovadores() {
  const p = _pedido
  const lista = (p.aprovadorIds?.length
    ? p.aprovadorIds.map(id => _usuarios.find(u => u.id === id)).filter(Boolean)
    : _usuarios.filter(u => [PERFIS.APROVADOR, PERFIS.GESTOR].includes(u.perfil) && u.ativo !== false &&
        _normEmpresas(u.empresas).includes(p.empresaId)))
  if (!lista.length) {
    const souAprov = [PERFIS.APROVADOR, PERFIS.GESTOR].includes(sessao.usuario.perfil)
    return { papel: t('aprovadoresLabel'), nome: souAprov ? sessao.usuario.nome : null, vazio: t('dtAprovadoresEmpresa') }
  }
  const nomes = lista.slice(0, 2).map(u => u.nome.split(' ')[0]).join(', ') + (lista.length > 2 ? ` e mais ${lista.length - 2}` : '')
  return { papel: t('aprovadoresLabel'), nome: nomes }
}

function _respFinanceiro() {
  const fins = _usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO && u.ativo !== false &&
    _normEmpresas(u.empresas).includes(_pedido.empresaId))
  const nome = fins[0]?.nome || (sessao.usuario.perfil === PERFIS.FINANCEIRO ? sessao.usuario.nome : null)
  return { papel: 'Financeiro', nome, vazio: t('dtEquipeFinanceira') }
}

// ── Pessoas ───────────────────────────────────────────────────
// Rótulos usados quando o nome real não pode ser lido pelo perfil atual
const _NOMES_GENERICOS = new Set(['Aprovadores da empresa', 'Equipe financeira', 'Comprador designado', 'Aprovador'])

function _linhaPessoa(papel, nome, status, extra = '', statusCls = '') {
  const real = nome && !_NOMES_GENERICOS.has(nome)
  return `
    <div class="pessoa-linha">
      <div class="avatar avatar-sm ${real ? '' : 'avatar-vazio'}" aria-hidden="true">${real ? gerarIniciais(nome) : _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 13)}</div>
      <div class="pessoa-corpo">
        <div class="pessoa-role">${papel}</div>
        <div class="pessoa-name">${nome ? _esc(nome) : `<span class="pessoa-indef">${status || 'Não definido'}</span>`}</div>
        ${status && nome ? `<div class="pessoa-status ${statusCls}">${status}</div>` : ''}
        ${extra}
      </div>
    </div>`
}

function _renderPessoa(papel, nome, statusTxt) {
  return nome ? _linhaPessoa(papel, nome, statusTxt) : _linhaPessoa(papel, null, 'Nome não disponível')
}

function _renderPessoaComprador() {
  const p = _pedido
  // Sem comprador gravado: vale quem assumiu no histórico, desde que o pedido tenha passado da
  // fila (um pedido devolvido à fila volta a "Aguardando comprador")
  const passouDaFila = [STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) ||
    ([STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status) && !!_quemFez(STATUS.AG_COTACAO))
  const nome = p.compradorId ? (_nomePorId(p.compradorId) || 'Comprador designado')
    : (passouDaFila ? (_quemFez(STATUS.AG_COTACAO)?.nome || 'Comprador designado') : null)
  if (!nome) return _linhaPessoa(t('compradorLabel'), null, _TERMINAIS.includes(p.status) ? 'Não chegou à cotação' : t('aguardandoComprador'))
  const st = _cotacoes.length
    ? `${_cotacoes.length} cotaç${_cotacoes.length === 1 ? 'ão registrada' : 'ões registradas'}`
    : t('semCotacoes')
  return _linhaPessoa(t('compradorLabel'), nome, st)
}

function _renderPessoaAprovadores() {
  const p = _pedido
  const papel = t('aprovadoresLabel')
  const aprovou = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) || p.aprovadoPor
  if (aprovou) {
    const h = _quemFez(STATUS.APROVADO)
    const nome = _nomePorId(p.aprovadoPor) || h?.nome || 'Aprovador'
    const em = p.aprovadoEm || h?.em
    return _linhaPessoa('Aprovador', nome, `${ICO.check} ${t('aprovadoStatus')}${em ? ` em ${_dataCurta(em)}` : ''}`, '', 'text-green')
  }
  if (p.status === STATUS.REPROVADO || p.reprovadoPor) {
    const h = _quemFez(STATUS.REPROVADO)
    const nome = _nomePorId(p.reprovadoPor) || h?.nome || 'Aprovador'
    const em = p.reprovadoEm || h?.em
    return _linhaPessoa('Aprovador', nome, `Reprovou${em ? ` em ${_dataCurta(em)}` : ''}`, '', 'text-red')
  }
  const lista = (_pedido.aprovadorIds?.length
    ? _pedido.aprovadorIds.map(id => _usuarios.find(u => u.id === id)).filter(Boolean)
    : _usuarios.filter(u => [PERFIS.APROVADOR, PERFIS.GESTOR].includes(u.perfil) && u.ativo !== false &&
        _normEmpresas(u.empresas).includes(p.empresaId)))
  const status = p.status === STATUS.EM_APROVACAO ? t('aguardandoStatus')
    : [STATUS.SOLICITADO, STATUS.AG_COTACAO].includes(p.status) ? 'Entra após as cotações'
    : p.status === STATUS.CANCELADO ? 'Não chegou à aprovação' : ''
  if (!lista.length) {
    const souAprov = [PERFIS.APROVADOR, PERFIS.GESTOR].includes(sessao.usuario.perfil)
    return _linhaPessoa(papel, souAprov ? sessao.usuario.nome : 'Aprovadores da empresa', status)
  }
  const nomes = lista.slice(0, 2).map(u => u.nome.split(' ')[0]).join(', ') + (lista.length > 2 ? ` e mais ${lista.length - 2}` : '')
  return `
    <div class="pessoa-linha">
      <div class="avatar-pilha" aria-hidden="true">
        ${lista.slice(0, 2).map(u => `<div class="avatar avatar-sm">${gerarIniciais(u.nome)}</div>`).join('')}
      </div>
      <div class="pessoa-corpo">
        <div class="pessoa-role">${papel}</div>
        <div class="pessoa-name">${_esc(nomes)}</div>
        ${status ? `<div class="pessoa-status">${status}</div>` : ''}
      </div>
    </div>`
}

function _renderPessoaFinanceiro() {
  const fins = _usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO && u.ativo !== false &&
    _normEmpresas(u.empresas).includes(_pedido.empresaId))
  const nome = fins[0]?.nome || (sessao.usuario.perfil === PERFIS.FINANCEIRO ? sessao.usuario.nome : null)
  const totalPago = _parcelas.filter(p => p.pago).length
  const totalParc = _parcelas.length
  const st = totalParc ? `${totalPago} de ${totalParc} parcela${totalParc > 1 ? 's' : ''} paga${totalPago === 1 ? '' : 's'}` : 'Sem parcelas'
  return _linhaPessoa('Financeiro', nome || 'Equipe financeira', st)
}

// ── Cotações ──────────────────────────────────────────────────
// A lista já é a comparação: em ordem de valor, com a indicada e a de menor valor
// marcadas, a diferença de cada proposta para a indicada (ou para a menor, antes
// da indicação) e um fio proporcional ao valor.
function _renderCotacoes() {
  if (!_cotacoes.length) {
    const pode = _podeAnexarCotacao()
    const sub = pode
      ? t('dtCotVazioPode')
      : _pedido.status === STATUS.SOLICITADO
        ? t('dtCotVazioSolic')
        : t('dtCotVazioOutros')
    return `
      <div class="dt-vazio">
        <div class="dt-vazio-titulo">${t('dtCotVazioTitulo')}</div>
        <div class="dt-vazio-texto">${sub}</div>
      </div>`
  }
  const valores = _cotacoes.map(c => c.valor || 0)
  const menor = Math.min(...valores)
  const maior = Math.max(...valores)
  const ind = _cotacoes.find(c => c.indicada)
  const ref = ind || _cotacoes.find(c => (c.valor || 0) === menor)
  const podeIndicar = _podeIndicarCotacao()
  const varias = _cotacoes.length > 1
  const ordenadas = [..._cotacoes].sort((a, b) => (a.valor - b.valor) || (b.indicada - a.indicada))

  const linhas = ordenadas.map(c => {
    const eRef = c === ref
    const dif = (c.valor || 0) - (ref.valor || 0)
    let difHtml = ''
    if (varias && !eRef) {
      const pct = ref.valor ? dif / ref.valor * 100 : 0
      const maisBarata = ind && dif < 0
      difHtml = `<span class="cotacao-dif${maisBarata ? ' mais-barata' : ''}"${maisBarata ? ` title="${t('dtMaisBarataQueIndicada')}"` : ''}>${dif > 0 ? '+' : dif < 0 ? '−' : ''}${formatCurrency(Math.abs(dif))}<span class="cotacao-dif-pct">${_pct(pct)}</span></span>`
    } else if (varias && eRef) {
      difHtml = `<span class="cotacao-dif cotacao-dif-base">${t('dtBaseComparacao')}</span>`
    }
    const marcas = [
      c.indicada ? `<span class="cot-marca cot-indicada">${t('dtIndicada')}</span>` : '',
      varias && (c.valor || 0) === menor ? `<span class="cot-marca cot-menor">${t('dtMenorValor')}</span>` : '',
    ].join('')
    const largura = maior ? Math.max((c.valor || 0) / maior * 100, 3) : 0
    const acoes = [
      c.arquivoUrl ? `<a href="${_esc(c.arquivoUrl)}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtAbrirArquivoCotacao')}" title="${t('dtAbrirArquivo')}">${ICO.externo}</a>` : '',
      podeIndicar && !c.indicada ? `<button class="btn-ghost btn-sm" data-indicar="${_esc(c.id)}" title="${t('dtIndicarTitulo')}">${t('dtIndicar')}</button>` : '',
    ].join('')
    return `
      <li class="cotacao-item${c.indicada ? ' indicada' : ''}">
        <div class="cotacao-info">
          <div class="cotacao-fornecedor">${_esc(c.fornecedorNome)}${marcas ? `<span class="cotacao-marcas">${marcas}</span>` : ''}</div>
          <div class="cotacao-sub">${_esc([c.prazoEntrega ? `Prazo ${c.prazoEntrega}` : '', c.condicoesComerciais].filter(Boolean).join(' · ') || t('dtSemCondicoes'))}</div>
        </div>
        <div class="cotacao-lado">
          <span class="cotacao-valor">${formatCurrency(c.valor)}</span>
          ${difHtml}
        </div>
        ${acoes ? `<div class="cotacao-acoes">${acoes}</div>` : ''}
        ${varias ? `<span class="cotacao-fio" aria-hidden="true"><span style="width:${largura.toFixed(1)}%"></span></span>` : ''}
      </li>`
  }).join('')

  const economia = ind && varias && maior > ind.valor
    ? `<p class="cotacoes-economia">${t('dtEconomiaFrase1')} <span class="dt-numeral">${formatCurrency(maior - ind.valor)}</span> ${t('dtEconomiaFrase2')}</p>`
    : ''
  return `<ol class="cotacoes-lista">${linhas}</ol>${economia}`
}

// ── Atividade ─────────────────────────────────────────────────
// Mais recente primeiro (o campo de comentário fica no topo). Mudanças de etapa
// levam o numeral da etapa, como na régua do caminho.
function _renderActivityFeed() {
  const hist = _historico.map(h  => ({ ...h,  _feedTipo: h.tipo || 'status' }))
  const comt = _comentarios.map(c => ({ ...c, _feedTipo: 'comentario' }))
  const feed = [...hist, ...comt].sort((a, b) => _tsMs(b.criadoEm) - _tsMs(a.criadoEm))

  if (!feed.length) return `
    <li class="dt-vazio dt-vazio-compacto">
      <div class="dt-vazio-titulo">${t('dtAtividadeVazia')}</div>
      <div class="dt-vazio-texto">${t('dtAtividadeVaziaTexto')}</div>
    </li>`

  const evento = (marca, html, ts, cls = '') => `
    <li class="feed-item ${cls}">
      <div class="feed-left">${marca}</div>
      <div class="feed-body">
        <div class="feed-text">${html}</div>
        <div class="feed-time" title="${ts.title}">${ts.label}</div>
      </div>
    </li>`
  const icone = d => `<span class="feed-marca">${_svg(d, 12)}</span>`

  return feed.map(item => {
    const nome = item.autorNome || _nomePorId(item.autorId)
    const ts   = formatarDataRelativa(item.criadoEm)
    const quem = nome ? `<strong>${_esc(nome)}</strong>` : ''

    if (item._feedTipo === 'status') {
      const i = _ETAPAS.indexOf(item.status)
      const negativo = [STATUS.REPROVADO, STATUS.CANCELADO].includes(item.status)
      const marca = negativo
        ? `<span class="feed-marca feed-marca-neg">${_svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 12)}</span>`
        : `<span class="feed-marca feed-marca-num">${i >= 0 ? _dois(i + 1) : '·'}</span>`
      const st = `<span class="feed-status">${_NOME_ETAPA[item.status] || _esc(item.status)}</span>`
      const frase = item.status === STATUS.SOLICITADO && !item.nota
        ? (quem ? `${quem} abriu o pedido` : 'Pedido aberto')
        : negativo
          ? (quem ? `${quem} ${item.status === STATUS.REPROVADO ? 'reprovou' : 'cancelou'} o pedido` : (item.status === STATUS.REPROVADO ? 'Pedido reprovado' : 'Pedido cancelado'))
          : (quem ? `${quem} moveu para ${st}` : `Movido para ${st}`)
      return evento(marca, `${frase}${item.nota ? `<div class="feed-nota">${_esc(item.nota)}</div>` : ''}`, ts, negativo ? 'feed-item-neg' : 'feed-item-etapa')
    }

    if (item._feedTipo === 'comentario') {
      const texto = _esc(item.texto || '').replace(/@([\wÀ-ÿ]+)/g, '<span class="mention">@$1</span>')
      return `
        <li class="feed-item feed-item-comment">
          <div class="feed-left"><div class="avatar avatar-sm ${nome ? '' : 'avatar-vazio'}" aria-hidden="true">${nome ? gerarIniciais(nome) : _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 12)}</div></div>
          <div class="feed-body">
            <div class="feed-header">
              <span class="feed-author">${_esc(nome || 'Participante')}</span>
              <span class="feed-time" title="${ts.title}">${ts.label}</span>
            </div>
            <div class="comentario-bolha"><div class="comment-text">${texto}</div></div>
          </div>
        </li>`
    }

    if (item._feedTipo === 'cotacao') {
      return evento(icone('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
        `${quem || 'Alguém'} registrou a cotação de <strong>${_esc(item.fornecedorNome || '—')}</strong>${item.valor ? ` <span class="num">(${formatCurrency(item.valor)})</span>` : ''}`, ts)
    }

    if (item._feedTipo === 'comprovante') {
      return evento(icone('<polyline points="20 6 9 17 4 12"/>'),
        `${quem || 'Alguém'} anexou o comprovante da parcela <strong class="num">${_esc(item.parcelaNumero || '')}</strong>`, ts)
    }

    if (item._feedTipo === 'edicao') {
      return evento(icone('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>'),
        `${quem || 'Alguém'} alterou <strong>${_esc(item.campoLabel || item.campo || '')}</strong>
         <div class="feed-nota"><span class="feed-antes">${_esc(item.valorAnterior || '—')}</span> → ${_esc(item.valorNovo || '—')}</div>`, ts)
    }

    if (item._feedTipo === 'anexo') {
      return evento(icone('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>'),
        `${quem || 'Alguém'} anexou <strong>${_esc(item.nomeArquivo || '—')}</strong>`, ts)
    }

    return ''
  }).join('')
}

// ── Parcelas ──────────────────────────────────────────────────
function _renderParcelasBloco() {
  const total = _parcelas.reduce((s, x) => s + (x.valor || 0), 0)
  const pago  = _parcelas.filter(x => x.pago).reduce((s, x) => s + (x.valor || 0), 0)
  const pct   = total ? Math.round(pago / total * 100) : 0
  const pagas = _parcelas.filter(x => x.pago).length
  return `
    <div class="parcelas-resumo">
      <div class="parcelas-resumo-txt">
        <span class="parcelas-pago">${formatCurrency(pago)}</span>
        <span class="parcelas-de">${t('dtPagosDe')} ${formatCurrency(total)} · ${pagas} de ${_parcelas.length} ${_parcelas.length === 1 ? 'parcela' : 'parcelas'}</span>
      </div>
      <span class="parcelas-pct">${pct}%</span>
    </div>
    <div class="parcelas-barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('dtPercentualPago')}"><span style="width:${pct}%"></span></div>
    <ol class="parcelas-lista" id="parcelas-list" style="--col-acoes:${_podePagarParcela() ? '112px' : (_parcelas.some(x => x.comprovante) ? '36px' : '0px')}">${_renderParcelas()}</ol>`
}

function _renderParcelas() {
  const podePagar = _podePagarParcela()
  return _parcelas.map(parc => {
    let estado = '', cls = ''
    if (parc.pago) {
      estado = parc.pagoEm ? `Paga em ${_dataCurta(parc.pagoEm)}` : 'Paga'
      cls = 'paga'
    } else {
      const d = _diasAte(parc.vencimento)
      if (d === null) estado = 'Sem vencimento'
      else if (d < 0) { estado = `Vencida há ${_dias(-d)}`; cls = 'vencida' }
      else if (d === 0) { estado = 'Vence hoje'; cls = 'vencendo' }
      else if (d <= 3) { estado = `Vence em ${_dias(d)}`; cls = 'vencendo' }
      else estado = `Vence em ${_dias(d)}`
    }
    const acoes = [
      parc.comprovante ? `<a href="${_esc(parc.comprovante)}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtVerComprovante')}" title="${t('dtVerComprovante')}">${ICO.doc}</a>` : '',
      podePagar && !parc.comprovante ? `
        <label class="btn-icon" tabindex="0" aria-label="${t('dtAnexarComprovante')}" title="${t('dtAnexarComprovante')}">
          ${ICO.clipe}
          <input type="file" accept="image/*,.pdf" data-comprov="${_esc(parc.id)}" class="sr-only" tabindex="-1">
        </label>` : '',
      !parc.pago && podePagar ? `<button class="btn-ghost btn-sm" data-pagar="${_esc(parc.id)}" title="${t('dtRegistrarPagamento')}">${t('dtPagar')}</button>` : '',
    ].join('')
    return `
      <li class="parcela-item ${cls}">
        <div class="parcela-numero"><b>${parc.numero}</b><span>/${parc.total}</span></div>
        <div class="parcela-info">
          <div class="parcela-data">${formatDate(parc.vencimento)}</div>
          <div class="parcela-venc ${cls}">${estado}</div>
        </div>
        <div class="parcela-valor${parc.pago ? ' parcela-pago' : ''}">${formatCurrency(parc.valor)}</div>
        <div class="parcela-acoes">${acoes}</div>
      </li>`
  }).join('')
}

// ── Bind de eventos ───────────────────────────────────────────
let _fecharMenuDoc = null
let _menuLimpadorReg = false

function _bindMenuAcoes() {
  const btn  = document.getElementById('btn-mais-acoes')
  const menu = document.getElementById('menu-mais-acoes')
  if (_fecharMenuDoc) { document.removeEventListener('click', _fecharMenuDoc); document.removeEventListener('keydown', _fecharMenuDoc) }
  if (!btn || !menu) return
  const fechar = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false') }
  btn.addEventListener('click', e => {
    e.stopPropagation()
    const abrir = menu.hidden
    menu.hidden = !abrir
    btn.setAttribute('aria-expanded', String(abrir))
    if (abrir) [...menu.querySelectorAll('.menu-acoes-item')].find(i => i.offsetParent !== null)?.focus()
  })
  menu.addEventListener('click', e => { if (e.target.closest('.menu-acoes-item')) fechar() })
  menu.addEventListener('keydown', e => {
    const itens = [...menu.querySelectorAll('.menu-acoes-item')].filter(i => i.offsetParent !== null)
    const idx = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(idx + 1) % itens.length]?.focus() }
    if (e.key === 'ArrowUp')   { e.preventDefault(); itens[(idx - 1 + itens.length) % itens.length]?.focus() }
  })
  _fecharMenuDoc = e => {
    if (e.type === 'keydown' && e.key !== 'Escape') return
    if (e.type === 'click' && e.target.closest?.('.menu-acoes-wrap')) return
    if (!menu.hidden) { fechar(); if (e.type === 'keydown') btn.focus() }
  }
  document.addEventListener('click', _fecharMenuDoc)
  document.addEventListener('keydown', _fecharMenuDoc)
  if (!_menuLimpadorReg) {
    _menuLimpadorReg = true
    registrarLimpador(() => {
      _menuLimpadorReg = false
      if (_fecharMenuDoc) { document.removeEventListener('click', _fecharMenuDoc); document.removeEventListener('keydown', _fecharMenuDoc); _fecharMenuDoc = null }
    })
  }
}

function _bindParcelasEvents(raiz = document) {
  raiz.querySelectorAll('[data-pagar]').forEach(btn => {
    btn.addEventListener('click', () => _pagarParcela(btn.dataset.pagar))
  })
  raiz.querySelectorAll('input[data-comprov]').forEach(inp => {
    inp.addEventListener('change', e => {
      const file = e.target.files[0]
      if (file) _anexarComprovante(inp.dataset.comprov, file)
    })
  })
}

function _atualizarResumoParcelasCompra() {
  const el = document.getElementById('mc-resumo-parcelas')
  if (!el) return
  const valor = parseMoeda(document.getElementById('mc-valor')?.value || '')
  const n = parseInt(document.getElementById('mc-parcelas')?.value) || 1
  el.textContent = valor > 0 ? (n > 1 ? `${n} parcelas mensais de ${formatCurrency(valor / n)}` : `Pagamento único de ${formatCurrency(valor)}`) : ''
}

function _bindDetalheEvents() {
  // Fecha modais: botões, clique fora e Esc
  document.querySelectorAll('#detalhe-root [data-close]').forEach(btn => {
    btn.addEventListener('click', () => fecharModal(btn.dataset.close))
  })
  document.querySelectorAll('#detalhe-root .modal-overlay').forEach(ov => {
    ov.addEventListener('mousedown', e => { if (e.target === ov) fecharModal(ov.id) })
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(ov.id) })
  })

  _bindMenuAcoes()

  document.getElementById('btn-assumir')?.addEventListener('click', _assumirPedido)
  document.getElementById('btn-liberar')?.addEventListener('click', _liberarClaim)
  document.getElementById('btn-aprovar')?.addEventListener('click', _aprovarPedido)
  document.getElementById('btn-reprovar')?.addEventListener('click', () => abrirModal('modal-reprovar'))

  document.getElementById('reprov-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('reprov-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === 'Outros' ? 'block' : 'none'
  })
  document.getElementById('btn-confirmar-reprovar')?.addEventListener('click', _reprovarPedido)

  document.getElementById('btn-executar-compra')?.addEventListener('click', () => {
    abrirModal('modal-compra')
    _atualizarResumoParcelasCompra()
  })
  ;['mc-valor', 'mc-parcelas'].forEach(id => document.getElementById(id)?.addEventListener('input', _atualizarResumoParcelasCompra))
  document.getElementById('btn-confirmar-compra')?.addEventListener('click', _executarCompra)

  document.getElementById('btn-confirmar-entrega')?.addEventListener('click', _confirmarEntrega)
  document.getElementById('btn-confirmar-pagamento')?.addEventListener('click', _confirmarPagamento)

  document.getElementById('btn-cancelar')?.addEventListener('click', () => abrirModal('modal-cancelar'))
  document.getElementById('cancel-motivo')?.addEventListener('change', e => {
    const wrap = document.getElementById('cancel-outros-wrap')
    if (wrap) wrap.style.display = e.target.value === 'Outros' ? 'block' : 'none'
  })
  document.getElementById('btn-confirmar-cancelar')?.addEventListener('click', _cancelarPedido)

  // Comentário
  document.getElementById('btn-enviar-comentario')?.addEventListener('click', _enviarComentario)
  document.getElementById('input-comentario')?.addEventListener('keydown', e => {
    if (_handleMentionKeydown(e)) return
    if (e.key === 'Escape') { _fecharMentionDropdown(); return }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { _fecharMentionDropdown(); _enviarComentario() }
  })
  document.getElementById('input-comentario')?.addEventListener('input', _handleMentionInput)
  document.getElementById('input-comentario')?.addEventListener('blur', () => setTimeout(_fecharMentionDropdown, 150))

  document.querySelectorAll('[data-indicar]').forEach(btn => {
    btn.addEventListener('click', () => _indicarCotacao(btn.dataset.indicar))
  })
  document.getElementById('btn-add-cotacao')?.addEventListener('click', _mostrarModalCotacao)
  document.getElementById('btn-comparar-cotacoes')?.addEventListener('click', _compararCotacoes)
  document.getElementById('btn-editar-pedido')?.addEventListener('click', _editarPedido)

  document.getElementById('btn-reabrir-pedido')?.addEventListener('click', () => {
    document.getElementById('reabrir-justificativa').value = ''
    abrirModal('modal-reabrir')
  })
  document.getElementById('btn-confirmar-reabrir')?.addEventListener('click', _reabrirPedido)

  document.getElementById('btn-duplicar-pedido')?.addEventListener('click', () => {
    agendarDuplicar(_pedido)
    navegar('pedidos')
  })
  document.getElementById('btn-exportar-pdf')?.addEventListener('click', _exportarPedidoPDF)

  _bindParcelasEvents()

  // Labels usados como botão de upload respondem a Enter/Espaço
  document.querySelectorAll('#detalhe-root label[tabindex="0"]').forEach(l => {
    l.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input[type=file]')?.click() }
    })
  })

  document.getElementById('input-upload-anexo')?.addEventListener('change', e => {
    Array.from(e.target.files || []).forEach(f => _uploadAnexo(f))
    e.target.value = ''
  })

  _bindAnexosEvents()
}

// ── Ações de workflow ─────────────────────────────────────────
async function _assumirPedido() {
  const ok = await prxConfirm('Assumir este pedido?', 'Você passa a ser o comprador responsável e o pedido segue para cotação.', 'Assumir', 'Cancelar')
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().compradorId) throw new Error(t('pedidoJaAssumido'))
      tx.update(ref, {
        compradorId: sessao.usuario.id,
        compradorNome: sessao.usuario.nome || null,
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
  const ok = await prxConfirm('Liberar este pedido?', 'O comprador atual deixa de ser responsável e o pedido volta para a fila.', 'Liberar', 'Cancelar', true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId), {
      compradorId: null,
      compradorNome: null,
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
  const ind = _cotacoes.find(c => c.indicada)
  const ok = await prxConfirm('Aprovar este pedido?',
    ind ? `Proposta indicada: ${_esc(ind.fornecedorNome)}, ${formatCurrency(ind.valor)}. Em seguida o comprador registra a compra.` : 'Em seguida o comprador registra a compra.',
    'Aprovar', 'Cancelar')
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
        aprovadoPorNome: sessao.usuario.nome || null,
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
        reprovadoPorNome: sessao.usuario.nome || null,
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
  const ok = await prxConfirm('Confirmar recebimento?', 'Confira se o produto ou serviço foi entregue conforme o pedido. O financeiro passa a acompanhar o pagamento.', 'Confirmar', 'Cancelar')
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
  const ok = await prxConfirm('Confirmar pagamento total?',
    `${_pedido.valorFinal ? formatCurrency(_pedido.valorFinal) + ' pagos' : 'Pagamento registrado'}${_pedido.fornecedorNome ? ' a ' + _esc(_pedido.fornecedorNome) : ''}. O pedido será concluído.`,
    'Confirmar', 'Cancelar')
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
      canceladoPorNome: sessao.usuario.nome || null,
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
// Overlay criado sob demanda (fora do #detalhe-root): fecha por botão, clique fora e Esc
function _montarOverlay(id, html) {
  document.getElementById(id)?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay dt-modal'
  overlay.id = id
  overlay.innerHTML = html
  document.body.appendChild(overlay)
  abrirModal(id)
  const fechar = () => { fecharModal(id); setTimeout(() => overlay.remove(), 250) }
  overlay.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar))
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) fechar() })
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') fechar() })
  registrarLimpador(() => overlay.remove())
  return { overlay, fechar }
}

function _compararCotacoes() {
  const menorValor = Math.min(..._cotacoes.map(c => c.valor))
  const lista = [..._cotacoes].sort((a, b) => a.valor - b.valor)
  _montarOverlay('modal-comparar', `
    <div class="modal modal-comparar" role="dialog" aria-modal="true" aria-labelledby="modal-comparar-titulo">
      ${_cabModal('modal-comparar-titulo', t('dtLadoALadoTitulo'), 'data-fechar')}
      <div class="modal-body">
        <div class="cotacao-compare-grid" style="--colunas:${Math.min(lista.length, 4)}">
          ${lista.map(c => {
            const eMenor = c.valor === menorValor
            const dif = c.valor - menorValor
            return `
              <div class="cotacao-compare-col ${c.indicada ? 'cotacao-compare-indicada' : ''}">
                <div class="cotacao-compare-badges">
                  ${c.indicada ? `<span class="cot-marca cot-indicada">${t('dtIndicada')}</span>` : ''}
                  ${eMenor ? `<span class="cot-marca cot-menor">${t('dtMenorValor')}</span>` : ''}
                </div>
                <div class="cotacao-compare-fornecedor">${_esc(c.fornecedorNome)}</div>
                <div class="cotacao-compare-valor">${formatCurrency(c.valor)}</div>
                <div class="cotacao-compare-dif num">${eMenor ? 'Menor proposta' : `+${formatCurrency(dif)} · ${_pct(dif / menorValor * 100)}`}</div>
                <div class="cotacao-compare-row"><span class="meta-label">Prazo de entrega</span><span>${_esc(c.prazoEntrega || '—')}</span></div>
                <div class="cotacao-compare-row"><span class="meta-label">Condições</span><span>${_esc(c.condicoesComerciais || '—')}</span></div>
                ${c.arquivoUrl ? `<a href="${_esc(c.arquivoUrl)}" target="_blank" rel="noopener" class="btn-ghost btn-sm cotacao-compare-arq">${ICO.externo}${t('dtAbrirArquivo')}</a>` : ''}
              </div>`
          }).join('')}
        </div>
      </div>
    </div>
  `)
}

// ── Editar campos do pedido + auditoria campo-a-campo (3.7) ──
const _CAMPO_LABEL = {
  titulo: 'Título', descricao: 'Descrição', valorEstimado: 'Valor estimado',
  dataNecessaria: 'Data necessária', urgente: 'Urgência', categoriaId: 'Categoria',
}

function _editarPedido() {
  const p = _pedido
  const { fechar } = _montarOverlay('modal-editar-pedido', `
    <div class="modal" style="max-width:560px" role="dialog" aria-modal="true" aria-labelledby="modal-editar-titulo">
      ${_cabModal('modal-editar-titulo', t('btnEditarPedido'), 'data-fechar')}
      <div class="modal-body">
        <p class="modal-intro">Cada alteração fica registrada na atividade do pedido, com o valor anterior.</p>
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label for="edit-titulo">Título *</label>
            <input type="text" id="edit-titulo" value="${_esc(p.titulo || '')}" maxlength="120">
          </div>
          <div class="form-group col-span-2">
            <label for="edit-descricao">Descrição</label>
            <textarea id="edit-descricao" rows="3" style="resize:vertical">${_esc(p.descricao || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="edit-valor">Valor estimado</label>
            <input type="text" id="edit-valor" inputmode="decimal" placeholder="R$ 0,00" value="${p.valorEstimado ? formatCurrency(p.valorEstimado) : ''}">
          </div>
          <div class="form-group">
            <label for="edit-data">Necessário até</label>
            <input type="date" id="edit-data" value="${_esc(p.dataNecessaria || '')}">
          </div>
          <div class="form-group">
            <label for="edit-categoria">Categoria</label>
            <select id="edit-categoria">
              ${_categorias.map(c => `<option value="${_esc(c.id)}" ${p.categoriaId === c.id ? 'selected' : ''}>${_esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <span class="form-label-falso">Prioridade</span>
            <div class="toggle-wrap edit-urgente-wrap">
              <span class="toggle ${p.urgente ? 'on' : ''}" id="edit-urgente-toggle" role="switch" tabindex="0" aria-checked="${p.urgente ? 'true' : 'false'}" aria-label="Urgente"></span>
              <span class="toggle-label">Urgente</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>Cancelar</button>
        <button class="btn-primary" id="salvar-edicao">Salvar alterações</button>
      </div>
    </div>
  `)
  const tg = document.getElementById('edit-urgente-toggle')
  const alternar = () => { tg.classList.toggle('on'); tg.setAttribute('aria-checked', String(tg.classList.contains('on'))) }
  tg?.closest('.toggle-wrap')?.addEventListener('click', alternar)
  tg?.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar() } })
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
  const novoAntes = antes.replace(/@([\wÀ-ÿ]*)$/, `@${primeiroNome} `)
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
  const match = antes.match(/@([\wÀ-ÿ]*)$/)
  const dd = document.getElementById('mention-dropdown')
  if (!dd) return

  if (!match) { _fecharMentionDropdown(); return }

  const query = normalizarTexto(match[1])
  const empresaId = _pedido?.empresaId
  // Gestores leem a lista de usuários; os demais perfis mencionam quem já participou do pedido
  let base = _usuarios.filter(u => {
    if (u.ativo === false) return false
    if (u.perfil === PERFIS.SUPREMO || !empresaId) return true
    const emp = Array.isArray(u.empresas) ? u.empresas : Object.keys(u.empresas || {})
    return emp.includes(empresaId)
  })
  if (!base.length) {
    const vistos = new Map()
    ;[..._historico, ..._comentarios].forEach(x => { if (x.autorId && x.autorNome && !vistos.has(x.autorId)) vistos.set(x.autorId, { id: x.autorId, nome: x.autorNome }) })
    base = [...vistos.values()]
  }
  const sugestoes = base
    .filter(u => u.id !== sessao.usuario.id && normalizarTexto(u.nome || '').includes(query))
    .slice(0, 6)

  if (!sugestoes.length) { _fecharMentionDropdown(); return }

  _mentionIndex = 0
  dd.innerHTML = `<div class="mention-titulo">Mencionar</div>` + sugestoes.map(u => `
    <div class="mention-item" role="option" data-nome="${_esc(u.nome.split(' ')[0])}">
      <div class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(u.nome)}</div>
      <span class="mention-nome">${_esc(u.nome)}</span>
      ${u.perfil ? `<span class="mention-perfil">${PERFIS_LABEL[u.perfil] || ''}</span>` : ''}
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
  const mencoes = [...new Set((texto.match(/@([\wÀ-ÿ]+)/g) || []).map(m => m.slice(1)))]

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
  const c = _cotacoes.find(x => x.id === cotacaoId)
  if (_pedido.status === STATUS.AG_COTACAO) {
    const ok = await prxConfirm(t('dtIndicarConfirmaTitulo'),
      c ? `${_esc(c.fornecedorNome)}, ${formatCurrency(c.valor)}. ${t('dtIndicarConfirmaTexto')}` : t('dtIndicarConfirmaTexto'),
      t('dtIndicarConfirmaOk'), t('btnCancelar'))
    if (!ok) return
  }
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
  const par = _parcelas.find(x => x.id === parcelaId)
  const ok = await prxConfirm('Registrar pagamento?',
    par ? `Parcela ${par.numero}/${par.total} de ${formatCurrency(par.valor)}, com vencimento em ${formatDate(par.vencimento)}.` : '',
    'Registrar', 'Cancelar')
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
  const { fechar } = _montarOverlay('modal-cotacao', `
    <div class="modal" style="max-width:520px" role="dialog" aria-modal="true" aria-labelledby="modal-cotacao-titulo">
      ${_cabModal('modal-cotacao-titulo', t('dtRegistrarCotacao'), 'data-fechar')}
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label for="cot-forn">Fornecedor *</label>
            <input type="text" id="cot-forn" placeholder="Comece a digitar para buscar" list="cot-forn-datalist" autocomplete="off">
            <datalist id="cot-forn-datalist">${_fornecedorDatalistOptions()}</datalist>
          </div>
          <div class="form-group">
            <label for="cot-valor">Valor *</label>
            <input type="text" id="cot-valor" inputmode="decimal" placeholder="R$ 0,00">
          </div>
          <div class="form-group">
            <label for="cot-prazo">Prazo de entrega</label>
            <input type="text" id="cot-prazo" placeholder="Ex.: 5 dias úteis">
          </div>
          <div class="form-group col-span-2">
            <label for="cot-cond">Condições comerciais</label>
            <input type="text" id="cot-cond" placeholder="Frete, impostos, garantia">
          </div>
          <div class="form-group col-span-2">
            <span class="form-label-falso">Arquivo da proposta</span>
            <label class="dropzone" for="cot-arquivo">
              ${ICO.clipe}
              <span id="cot-arquivo-nome">Selecionar PDF ou imagem</span>
              <input type="file" id="cot-arquivo" accept=".pdf,image/*" class="sr-only">
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>Cancelar</button>
        <button class="btn-primary" id="salvar-cotacao">Salvar cotação</button>
      </div>
    </div>
  `)
  document.getElementById('cot-arquivo')?.addEventListener('change', e => {
    const f = e.target.files?.[0]
    const el = document.getElementById('cot-arquivo-nome')
    if (el) el.textContent = f ? f.name : 'Selecionar PDF ou imagem'
  })

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
      fechar()
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
  return p.status === STATUS.SOLICITADO && !p.compradorId &&
         [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
}

function _podeLiberar() {
  const perfil = sessao.usuario.perfil
  // Só faz sentido devolver à fila enquanto o comprador reúne cotações
  return [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && !!_pedido.compradorId &&
         _pedido.status === STATUS.AG_COTACAO
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
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const p   = _pedido

    const empresa   = _empresas.find(e => e.id === p.empresaId)
    const categoria = _categorias.find(c => c.id === p.categoriaId)
    const numero    = p.numeroPedido || '—'

    // Paleta do documento (impressão: fundo branco, acento dourado escuro da marca)
    const COR = {
      texto: [18, 18, 20], texto2: [62, 62, 69], texto3: [106, 106, 115],
      linha: [226, 226, 230], fundo: [244, 244, 246], ouro: [140, 106, 46], ouroFundo: [248, 243, 233],
      ouroMarca: [200, 169, 110], afn: [107, 31, 42], verde: [31, 138, 87], vermelho: [201, 58, 46],
    }
    const M = 16, LARG = 210 - M * 2, LIMITE = 297 - 22
    let y = 0

    const cor   = c => pdf.setTextColor(...c)
    const fonte = (tam, estilo = 'normal', familia = 'helvetica') => { pdf.setFont(familia, estilo); pdf.setFontSize(tam) }
    const tsStr = ts => {
      if (!ts) return '—'
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      if (isNaN(d)) return '—'
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    const novaPagina = () => { pdf.addPage(); y = 28 }
    const garantir = h => { if (y + h > LIMITE) novaPagina() }

    // Marca PR▲XIS desenhada (o triângulo não existe nas fontes padrão do PDF)
    const marca = (x, yb, tam) => {
      fonte(tam, 'bold', 'courier'); cor(COR.texto)
      pdf.text('PR', x, yb)
      const w = pdf.getTextWidth('PR')
      const cw = pdf.getTextWidth('A')
      const h = tam * 0.25
      pdf.setFillColor(...COR.ouroMarca)
      pdf.triangle(x + w + cw * 0.06, yb, x + w + cw * 0.94, yb, x + w + cw / 2, yb - h, 'F')
      pdf.text('XIS', x + w + cw, yb)
    }

    const textoDireita = (txt, xDir, yy, esp = 0) => {
      const w = pdf.getTextWidth(txt) + esp * Math.max(txt.length - 1, 0)
      pdf.text(txt, xDir - w, yy, esp ? { charSpace: esp } : undefined)
    }
    const secao = titulo => {
      garantir(16)
      y += 7
      fonte(7.5, 'bold'); cor(COR.texto3)
      pdf.text(titulo.toUpperCase(), M, y, { charSpace: 0.6 })
      const w = pdf.getTextWidth(titulo.toUpperCase()) + titulo.length * 0.6
      pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.2)
      pdf.line(M + w + 3, y - 1.2, M + LARG, y - 1.2)
      y += 5
    }

    // Tabela simples com quebra de página e cabeçalho repetido
    const tabela = (colunas, linhas) => {
      const pad = 2.2, lh = 4
      const cabecalho = () => {
        pdf.setFillColor(...COR.fundo)
        pdf.rect(M, y, LARG, 7, 'F')
        fonte(7, 'bold'); cor(COR.texto3)
        let x = M
        colunas.forEach(c => {
          if (c.alinhar === 'right') textoDireita(c.titulo.toUpperCase(), x + c.w - pad, y + 4.6, 0.3)
          else pdf.text(c.titulo.toUpperCase(), x + pad, y + 4.6, { charSpace: 0.3 })
          x += c.w
        })
        y += 7
      }
      garantir(16)
      cabecalho()
      linhas.forEach(l => {
        fonte(8.5, 'normal')
        const partes = l.celulas.map((txt, i) => pdf.splitTextToSize(String(txt ?? '—'), colunas[i].w - pad * 2))
        const h = Math.max(...partes.map(pt => pt.length)) * lh + pad * 2
        if (y + h > LIMITE) { novaPagina(); cabecalho() }
        if (l.destaque) { pdf.setFillColor(...COR.ouroFundo); pdf.rect(M, y, LARG, h, 'F') }
        let x = M
        partes.forEach((pt, i) => {
          const c = colunas[i]
          const estilo = (c.negrito || (l.negrito && i === 0)) ? 'bold' : 'normal'
          fonte(8.5, estilo)
          cor(l.cores?.[i] || (i === 0 ? COR.texto : COR.texto2))
          const tx = c.alinhar === 'right' ? x + c.w - pad : x + pad
          pdf.text(pt, tx, y + pad + 3.1, { align: c.alinhar === 'right' ? 'right' : 'left', lineHeightFactor: 1.35 })
          x += c.w
        })
        y += h
        pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.2)
        pdf.line(M, y, M + LARG, y)
      })
      y += 2
    }

    // ── Cabeçalho do documento
    y = 20
    marca(M, y, 15)
    fonte(7, 'bold'); cor(COR.texto3)
    textoDireita('PEDIDO DE COMPRA', M + LARG, y - 5.5, 0.5)
    fonte(13, 'bold', 'courier'); cor(COR.texto)
    pdf.text(numero, M + LARG, y, { align: 'right' })
    y += 5
    pdf.setDrawColor(...COR.ouroMarca); pdf.setLineWidth(0.6)
    pdf.line(M, y, M + LARG, y)
    y += 10

    fonte(15, 'bold'); cor(COR.texto)
    const tituloLinhas = pdf.splitTextToSize(p.titulo || '', LARG)
    pdf.text(tituloLinhas, M, y, { lineHeightFactor: 1.25 })
    y += tituloLinhas.length * 6.6

    // Status em pílula + metadados de emissão
    const stLabel = STATUS_LABEL[p.status] || p.status
    const stCor = [STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status) ? COR.vermelho
      : [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) ? COR.verde
      : COR.ouro
    fonte(8, 'bold')
    const stW = pdf.getTextWidth(stLabel) + 6
    pdf.setDrawColor(...stCor); pdf.setLineWidth(0.35)
    pdf.roundedRect(M, y - 3.6, stW, 5.4, 2.7, 2.7, 'S')
    cor(stCor); pdf.text(stLabel, M + 3, y)
    let xs = M + stW + 3
    if (p.urgente) {
      const uW = pdf.getTextWidth('Urgente') + 6
      pdf.setDrawColor(...COR.vermelho)
      pdf.roundedRect(xs, y - 3.6, uW, 5.4, 2.7, 2.7, 'S')
      cor(COR.vermelho); pdf.text('Urgente', xs + 3, y)
      xs += uW + 3
    }
    fonte(8, 'normal'); cor(COR.texto3)
    pdf.text(`Aberto em ${tsStr(p.criadoEm)}  ·  Emitido em ${tsStr(new Date())}`, xs + 1, y)
    y += 4

    // ── Dados em grade (3 colunas)
    secao('Dados do pedido')
    const solicNome = _nomePorId(p.solicitanteId) || p.solicitanteNome || '—'
    const dados = [
      ['Empresa', empresa?.nome || '—'],
      ['Categoria', categoria?.nome || '—'],
      ['Centro de custo', p.centroCusto || '—'],
      ['Quantidade', `${p.quantidade ?? '—'} ${p.unidade || ''}`.trim()],
      ['Necessário até', p.dataNecessaria ? formatDate(p.dataNecessaria) : '—'],
      ['Valor estimado', p.valorEstimado ? formatCurrency(p.valorEstimado) : '—'],
      ['Solicitante', solicNome],
      ['Comprador', p.compradorId ? (_nomePorId(p.compradorId) || '—') : (_quemFez(STATUS.AG_COTACAO)?.nome || 'Não atribuído')],
      ['Aprovação', (() => {
        const ap = _quemFez(STATUS.APROVADO), rp = _quemFez(STATUS.REPROVADO)
        if (p.aprovadoPor || ap) return `${_nomePorId(p.aprovadoPor) || ap?.nome || 'Aprovado'}, ${tsStr(p.aprovadoEm || ap?.em).slice(0, 10)}`
        if (p.reprovadoPor || rp) return `Reprovado por ${_nomePorId(p.reprovadoPor) || rp?.nome || '—'}`
        return p.status === STATUS.CANCELADO ? 'Não se aplica' : 'Pendente'
      })()],
    ]
    if (p.fornecedorNome) dados.push(['Fornecedor', p.fornecedorNome])
    if (p.valorFinal) dados.push(['Valor final', formatCurrency(p.valorFinal)])
    if (p.condicaoPagamento) dados.push(['Condição de pagamento', CONDICAO_PAGAMENTO[p.condicaoPagamento] || p.condicaoPagamento])
    if (p.dataCompra) dados.push(['Data da compra', formatDate(p.dataCompra)])
    if (p.dataEntrega) dados.push(['Data da entrega', formatDate(p.dataEntrega)])
    const colW = LARG / 3
    for (let i = 0; i < dados.length; i += 3) {
      garantir(11)
      dados.slice(i, i + 3).forEach(([k, v], j) => {
        const x = M + j * colW
        fonte(6.8, 'bold'); cor(COR.texto3)
        pdf.text(k.toUpperCase(), x, y, { charSpace: 0.3 })
        const destaque = k === 'Valor final'
        fonte(9.5, destaque ? 'bold' : 'normal'); cor(destaque ? COR.ouro : COR.texto)
        pdf.text(pdf.splitTextToSize(String(v), colW - 4)[0], x, y + 4.6)
      })
      y += 11
    }

    if (p.descricao) {
      garantir(14)
      fonte(6.8, 'bold'); cor(COR.texto3)
      pdf.text('DESCRIÇÃO', M, y, { charSpace: 0.3 })
      y += 4.4
      fonte(9.5, 'normal'); cor(COR.texto2)
      const linhasDesc = pdf.splitTextToSize(p.descricao, LARG)
      linhasDesc.forEach(l => { garantir(5); pdf.text(l, M, y); y += 4.6 })
    }

    const motivoRep = p.motivoReprovacao === 'Outros' ? p.motivoReprovacaoOutros : p.motivoReprovacao
    const motivoCan = p.motivoCancelamento === 'Outros' ? p.motivoCancelamentoOutros : p.motivoCancelamento
    if ((p.status === STATUS.REPROVADO && motivoRep) || (p.status === STATUS.CANCELADO && motivoCan)) {
      garantir(12); y += 2
      fonte(6.8, 'bold'); cor(COR.vermelho)
      pdf.text(p.status === STATUS.REPROVADO ? 'MOTIVO DA REPROVAÇÃO' : 'MOTIVO DO CANCELAMENTO', M, y, { charSpace: 0.3 })
      y += 4.4
      fonte(9.5, 'normal'); cor(COR.texto2)
      pdf.splitTextToSize(p.status === STATUS.REPROVADO ? motivoRep : motivoCan, LARG).forEach(l => { pdf.text(l, M, y); y += 4.6 })
    }

    // ── Cotações
    if (_cotacoes.length) {
      secao(`Cotações (${_cotacoes.length})`)
      const menor = Math.min(..._cotacoes.map(c => c.valor))
      tabela([
        { titulo: 'Fornecedor', w: 48 },
        { titulo: 'Prazo', w: 24 },
        { titulo: 'Condições', w: 50 },
        { titulo: 'Valor', w: 29, alinhar: 'right', negrito: true },
        { titulo: 'Situação', w: LARG - 151 },
      ], [..._cotacoes].sort((a, b) => a.valor - b.valor).map(c => ({
        celulas: [c.fornecedorNome || '—', c.prazoEntrega || '—', c.condicoesComerciais || '—', formatCurrency(c.valor),
          [c.indicada ? 'Indicada' : '', c.valor === menor && _cotacoes.length > 1 ? 'Menor valor' : ''].filter(Boolean).join(', ') || '—'],
        destaque: !!c.indicada,
        cores: { 4: c.indicada ? COR.ouro : COR.texto3 },
      })))
    }

    // ── Parcelas
    if (_parcelas.length) {
      const total = _parcelas.reduce((s, x) => s + (x.valor || 0), 0)
      const pago  = _parcelas.filter(x => x.pago).reduce((s, x) => s + (x.valor || 0), 0)
      secao(`Parcelas (${_parcelas.length})`)
      tabela([
        { titulo: 'Parcela', w: 24 },
        { titulo: 'Vencimento', w: 34 },
        { titulo: 'Valor', w: 36, alinhar: 'right', negrito: true },
        { titulo: 'Situação', w: 40 },
        { titulo: 'Pago em', w: LARG - 134 },
      ], _parcelas.map(par => {
        const vencida = !par.pago && par.vencimento && par.vencimento < hojeISO()
        return {
          celulas: [`${par.numero}/${par.total}`, formatDate(par.vencimento), formatCurrency(par.valor),
            par.pago ? 'Paga' : (vencida ? 'Vencida' : 'Em aberto'), par.pago ? tsStr(par.pagoEm).slice(0, 10) : '—'],
          cores: { 3: par.pago ? COR.verde : (vencida ? COR.vermelho : COR.texto2) },
        }
      }))
      garantir(8)
      fonte(9, 'bold'); cor(COR.texto)
      const totTxt = `${formatCurrency(pago)} de ${formatCurrency(total)}`
      const totW = pdf.getTextWidth(totTxt)
      pdf.text(totTxt, M + LARG - 2.2, y + 3, { align: 'right' })
      fonte(8.5, 'normal'); cor(COR.texto3)
      pdf.text('Total pago', M + LARG - 2.2 - totW - 3, y + 3, { align: 'right' })
      y += 6
    }

    // ── Histórico
    if (_historico.length) {
      secao('Histórico')
      tabela([
        { titulo: 'Data', w: 30 },
        { titulo: 'Evento', w: 62 },
        { titulo: 'Por', w: 36 },
        { titulo: 'Observação', w: LARG - 128 },
      ], _historico.map(h => {
        const evento = h.tipo === 'cotacao'     ? `Cotação: ${h.fornecedorNome || '—'}${h.valor ? ' (' + formatCurrency(h.valor) + ')' : ''}`
                     : h.tipo === 'comprovante' ? `Comprovante da parcela ${h.parcelaNumero || ''}`
                     : h.tipo === 'edicao'      ? `${h.campoLabel || h.campo} alterado`
                     : h.tipo === 'anexo'       ? `Anexo: ${h.nomeArquivo || '—'}`
                     : `Status: ${STATUS_LABEL[h.status] || h.status || '—'}`
        const obs = h.tipo === 'edicao' ? `De "${h.valorAnterior ?? '—'}" para "${h.valorNovo ?? '—'}"` : (h.nota || '—')
        return { celulas: [tsStr(h.criadoEm), evento, h.autorNome || _nomePorId(h.autorId) || '—', obs] }
      }))
    }

    // ── Rodapé com numeração em todas as páginas
    const total = pdf.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i)
      if (i > 1) {
        // Cabeçalho corrido nas páginas seguintes
        marca(M, 15, 10)
        fonte(9, 'bold', 'courier'); cor(COR.texto2)
        pdf.text(numero, M + LARG, 15, { align: 'right' })
        pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.2)
        pdf.line(M, 18.5, M + LARG, 18.5)
      }
      const yr = 297 - 11
      pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.2)
      pdf.line(M, yr - 4.5, M + LARG, yr - 4.5)
      fonte(7.5, 'bold'); cor(COR.afn)
      pdf.text('AFN', M, yr, { charSpace: 0.4 })
      const wAfn = pdf.getTextWidth('AFN') + 1.2 + 1.6
      fonte(7.5, 'normal'); cor(COR.texto3)
      pdf.text('SYSTEMS', M + wAfn, yr, { charSpace: 0.4 })
      const wSys = pdf.getTextWidth('SYSTEMS') + 2.8
      cor(COR.linha.map(v => v - 60))
      pdf.text('|', M + wAfn + wSys + 1.5, yr)
      cor(COR.texto3)
      pdf.text('Praxis', M + wAfn + wSys + 4.5, yr)
      pdf.text(`${numero}  ·  Página ${i} de ${total}`, M + LARG, yr, { align: 'right' })
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
  _renderDetalhe()
}

async function _refreshParcelas() {
  const snap = await getDocs(collection(db, 'pedidos', _pedidoId, 'parcelas'))
  _parcelas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.numero - b.numero)
  _renderDetalhe()
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
    <div class="dt-vazio dt-vazio-compacto">
      <div class="dt-vazio-titulo">${t('dtAnexosVazio')}</div>
      <div class="dt-vazio-texto">${t('dtAnexosVazioTexto')}</div>
    </div>
  `
  const uid    = sessao.usuario.id
  const perfil = sessao.usuario.perfil
  return `<ul class="anexos-lista">${_anexos.map(a => {
    const ext = (a.nome || '').includes('.') ? (a.nome || '').split('.').pop().toLowerCase() : ''
    const autor = _nomePorId(a.autorId) || a.autorNome || '—'
    const ts    = formatarDataRelativa(a.criadoEm)
    const podeRemover = a.autorId === uid || [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
    return `
      <li class="anexo-item">
        <span class="anexo-tipo" aria-hidden="true">${_esc((ext || 'arq').slice(0, 4))}</span>
        <div class="anexo-info">
          <a class="anexo-nome" href="${_esc(a.url)}" target="_blank" rel="noopener" title="${_esc(a.nome)}">${_esc(a.nome)}</a>
          <div class="anexo-meta">${_formatarTamanho(a.tamanho)} · ${_esc(autor)} · <span title="${ts.title}">${ts.label.toLowerCase()}</span></div>
        </div>
        <div class="anexo-acoes">
          <a href="${_esc(a.url)}" target="_blank" rel="noopener" class="btn-icon" aria-label="Baixar ${_esc(a.nome)}" title="Baixar">${ICO.baixar}</a>
          ${podeRemover ? `<button class="btn-icon btn-icon-perigo" data-remover-anexo="${_esc(a.id)}" data-storage-path="${_esc(a.storagePath || '')}" aria-label="Remover ${_esc(a.nome)}" title="Remover">${ICO.lixeira}</button>` : ''}
        </div>
      </li>
    `
  }).join('')}</ul>`
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
    _renderDetalhe()
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
    _renderDetalhe()
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
  const transicoes = _transicoes()
  if (transicoes.length < 2) return ''

  const terminal = _TERMINAIS.includes(_pedido.status)
  const agora = Date.now()

  // Em pedido encerrado, a última transição marca o fim — não conta tempo depois dela
  const base = terminal ? transicoes.slice(0, -1) : transicoes
  const segmentos = base.map((h, i) => {
    const inicio = _tsMs(h.criadoEm)
    const fim    = i < transicoes.length - 1 ? _tsMs(transicoes[i + 1].criadoEm) : agora
    return {
      status:      h.status,
      durMs:       Math.max(0, fim - inicio),
      emAndamento: !terminal && i === base.length - 1,
    }
  })
  if (!segmentos.length) return ''

  const totalMs  = segmentos.reduce((s, seg) => s + seg.durMs, 0)
  if (totalMs === 0) return ''
  const maior = segmentos.reduce((m, s) => (s.durMs > m.durMs ? s : m), segmentos[0])

  const linhas = segmentos.map(seg => {
    const i = _ETAPAS.indexOf(seg.status)
    const larg = maior.durMs ? Math.max(seg.durMs / maior.durMs * 100, 2) : 0
    const cls = [seg.emAndamento ? 'agora' : '', seg === maior && segmentos.length > 1 ? 'maior' : ''].filter(Boolean).join(' ')
    return `
      <li class="tempo-item ${cls}">
        <span class="tempo-num" aria-hidden="true">${i >= 0 ? _dois(i + 1) : '·'}</span>
        <span class="tempo-nome">${_NOME_ETAPA[seg.status] || _esc(seg.status)}${seg.emAndamento ? `<span class="tempo-agora">${t('dtAgora')}</span>` : ''}</span>
        <span class="tempo-dur">${_formatDuracao(seg.durMs)}</span>
        <span class="tempo-barra" aria-hidden="true"><span style="width:${larg.toFixed(1)}%"></span></span>
      </li>`
  }).join('')

  return `
    <section class="dt-bloco ord-sla" aria-labelledby="sec-sla">
      <div class="dt-card-head">
        <h2 class="dt-secao" id="sec-sla">${t('dtTempoPorEtapa')}</h2>
        <span class="tempo-total" title="${terminal ? '' : t('dtAteAgora')}"><span class="dt-numeral">${_formatDuracao(totalMs)}</span></span>
      </div>
      <ol class="tempo-lista">${linhas}</ol>
    </section>
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
