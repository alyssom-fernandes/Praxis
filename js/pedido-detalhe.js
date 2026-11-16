import {
  auth, db, storage,
  doc, collection, where, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot,
  runTransaction, writeBatch, serverTimestamp, increment,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
  consulta, consultaUsuarios, marcaDemo, novoPedidoRef, contadorPedidosRef, eContaDemo,
} from './firebase.js'
import { renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { sessao } from './estado.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, btnComLoading, abrirModal, fecharModal, exigirConexao, estaOnline, carregarBiblioteca } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL,
  PERFIS, PERFIS_LABEL, MOTIVOS_REPROVACAO, MOTIVOS_CANCELAMENTO, MOTIVO_OUTROS, rotuloMotivo, rotuloNota, rotuloUrgencia,
  CONDICAO_PAGAMENTO, STORAGE_PATHS, DEMO_ENVIA_ARQUIVOS, t,
} from './constants.js'
import {
  formatCurrency, formatDate, formatarDataRelativa, dataAbsoluta, dataComRelativo, gerarIniciais,
  hojeISO, maisXDiasISO, normalizarTexto, parseMoeda, urlSegura, esc,
  dividirEmParcelas, vencimentosMensais, arquivoIndisponivel, impedimentoDeFuncao,
  empresasDoUsuario, textoPrazo, mensagemDeErro,
} from './utils.js'
import { agendarDuplicar } from './pedidos.js'
import { PAPEL, desenharSimbolo, larguraEspacada, textoEspacado } from './pdf-papel.js'

let _unsubPedido    = null
let _unsubHistorico = null
let _pedidoId    = null
let _pedido      = null
// Posição na régua da última renderização, e de onde o pedido acabou de
// avançar (null quando não avançou): a régua anima só o passo que mudou
let _posAnterior  = null
let _avancouDe    = null
let _avancouEm    = 0
let _cotacoes    = []
let _comentarios = []
let _comentEditando = null  // { id, rascunho }: o comentário aberto para edição
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
  _comentEditando = null
  _posAnterior = null
  _avancouDe = null

  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('pedidos')}
      <main class="main-content">
        <div id="detalhe-root"></div>
      </main>
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
      <button class="btn-secondary" data-navegar="pedidos">${t('dtVoltarPedidos')}</button>
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
    getDocs(consulta(collection(db, 'empresas'))),
    getDocs(consulta(collection(db, 'categorias'))),
    getDocs(consulta(collection(db, 'fornecedores'))),
  ])
  _empresas    = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _categorias  = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  _fornecedores = fornSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  // usuarios: regra permite list apenas para gestor+; demais perfis recebem lista vazia
  try {
    const usrSnap = await getDocs(consultaUsuarios(sessao.usuario))
    _usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Na demo, a conta de login não é uma pessoa: fica fora das menções e listas
      .filter(u => !(sessao.isDemo && u.email === 'demo@praxis.app'))
  } catch {
    _usuarios = []
  }
}

// Opções de autocomplete de fornecedor (datalist)
function _fornecedorDatalistOptions() {
  return _fornecedores
    .map(f => f.nomeExibicao || f.nomeOriginal || f.nome)
    .filter(Boolean)
    .map(nome => `<option value="${esc(nome)}"></option>`)
    .join('')
}

// Fornecedor da compra ou da cotação, pelo nome normalizado: o que já existe
// ganha mais um uso, e o que não existe é criado. As gravações vão no lote de
// quem chama, então o uso só conta se a compra ou a cotação for gravada.
// Devolve o ID e, se o fornecedor é novo, a entrada para a lista local (que
// quem chama acrescenta depois de gravar o lote).
async function _fornecedorNoLote(nomeDigitado, lote) {
  const nomeNorm = normalizarTexto(nomeDigitado)
  let id = _fornecedores.find(f => normalizarTexto(f.nomeExibicao || f.nomeOriginal || f.nome) === nomeNorm)?.id
  if (!id) {
    // Confirma no servidor (pode ter sido criado por outro fluxo)
    const snap = await getDocs(consulta(collection(db, 'fornecedores'), where('nome', '==', nomeNorm)))
    id = snap.docs[0]?.id
  }
  if (id) {
    // A contagem de usos soma no servidor: duas compras ao mesmo tempo não se anulam
    lote.update(doc(db, 'fornecedores', id), { usos: increment(1) })
    return { id, novo: null }
  }
  const ref = doc(collection(db, 'fornecedores'))
  lote.set(ref, {
    nome: nomeNorm, nomeOriginal: nomeDigitado, nomeExibicao: nomeDigitado,
    cnpj: '', criadoEm: serverTimestamp(), usos: 1,
    ...marcaDemo(),
  })
  return { id: ref.id, novo: { id: ref.id, nome: nomeNorm, nomeExibicao: nomeDigitado, usos: 1 } }
}

// Envia o arquivo (quando há) e grava o lote que quem chama monta, já com o
// endereço do arquivo. Se algo falhar depois do envio, o arquivo é apagado:
// não sobra arquivo no Storage sem o registro no Firestore.
async function _enviarEGravar(arquivoRef, arquivo, metadados, montarLote) {
  let enviado = false
  try {
    let url = null
    if (arquivoRef) {
      await uploadBytes(arquivoRef, arquivo, metadados)
      enviado = true
      url = await getDownloadURL(arquivoRef)
    }
    const lote = writeBatch(db)
    const resultado = await montarLote(lote, url)
    await lote.commit()
    return resultado
  } catch (err) {
    if (enviado) deleteObject(arquivoRef).catch(() => {})
    throw err
  }
}

// Na demo pública o envio de arquivos fica desligado (DEMO_ENVIA_ARQUIVOS, em
// constants.js): a tela troca os campos de arquivo por um aviso, e a cotação é
// registrada sem o arquivo
function _enviaArquivos() {
  return DEMO_ENVIA_ARQUIVOS || !eContaDemo()
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
        <span class="dt-modal-num">${esc(p.numeroPedido || '')}<span class="dt-modal-pedido">${esc(p.titulo || '')}</span></span>
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
const _dois = n => String(n).padStart(2, '0')
// Vencimento de uma parcela em palavras (dias que faltam; negativo: atraso)
const _textoVencimento = d => d < 0 ? (d === -1 ? t('parcVencida1') : t('parcVencida', { n: -d }))
  : d === 0 ? t('prazoVenceHoje') : d === 1 ? t('parcVenceEm1') : t('parcVenceEm', { n: d })
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

// Prazo do pedido em palavras, com o estado: atrasado, perto ou com folga
function _estadoPrazo() {
  const p = _pedido
  if (!p.dataNecessaria) return null
  const data = formatDate(p.dataNecessaria)
  if (_TERMINAIS.includes(p.status) || p.status === STATUS.ENTREGUE) return { data, texto: '', cls: '' }
  const d = _diasAte(p.dataNecessaria)
  return { data, texto: textoPrazo(d), cls: d <= 0 ? 'atrasado' : d <= 3 ? 'perto' : '' }
}

function _renderCaminho() {
  const p = _pedido
  const { atual, parou } = _posicaoCaminho()
  const ent = _entradas()
  const fim = parou === STATUS.REPROVADO ? (p.reprovadoEm || _quemFez(STATUS.REPROVADO)?.em)
    : parou === STATUS.CANCELADO ? (p.canceladoEm || _quemFez(STATUS.CANCELADO)?.em) : null
  const etapas = _ETAPAS.map((st, i) => {
    let cls, sub = '', leitor = '', dica = ''
    if (i < atual) { cls = 'feita'; sub = dataAbsoluta(ent[st]); leitor = t('dtEtapaConcluida') }
    else if (i === atual && parou) {
      cls = 'parou'
      sub = fim ? t(parou === STATUS.REPROVADO ? 'prazoReprovadoEm' : 'prazoCanceladoEm', { d: dataAbsoluta(fim) }) : STATUS_LABEL[parou]
    } else if (i === atual) {
      cls = p.status === STATUS.PAGO ? 'atual fim' : 'atual'
      sub = p.status === STATUS.PAGO ? t('dtEmData', { d: dataAbsoluta(ent[st]) || '—' }) : (ent[st] ? dataAbsoluta(ent[st]) : t('dtAgora'))
      if (ent[st]) { const r = formatarDataRelativa(ent[st]); dica = `${r.title} · ${r.label.charAt(0).toLowerCase()}${r.label.slice(1)}` }
      leitor = t('dtEtapaAtual')
    } else { cls = parou ? 'cortada' : 'futura' }
    if (_avancouDe != null && i > _avancouDe && i <= atual) cls += i === atual ? ' chegou' : ' passou'
    return `
      <li class="caminho-etapa ${cls}"${i === atual ? ' aria-current="step"' : ''}>
        <span class="caminho-num" aria-hidden="true">${_dois(i + 1)}</span>
        <span class="caminho-nome">${STATUS_LABEL[st]}${leitor ? `<span class="sr-only">, ${leitor}</span>` : ''}</span>
        <span class="caminho-sub"${dica ? ` title="${dica}"` : ''}>${sub || '&nbsp;'}</span>
      </li>`
  }).join('')
  return `
    <div class="caminho-wrap">
      <ol class="caminho${parou ? ' interrompido' : ''}" id="caminho" aria-label="${t('dtCaminhoAria')}">${etapas}</ol>
    </div>`
}

// ── Cabeçalho ─────────────────────────────────────────────────
function _renderCabecalho(menu) {
  const p = _pedido
  const empresa = _empresas.find(e => e.id === p.empresaId)
  const solicNome = _nomePorId(p.solicitanteId) || p.solicitanteNome || null
  const criado = p.criadoEm ? dataComRelativo(p.criadoEm) : null
  const prazo = _estadoPrazo()
  const meta = []
  if (empresa?.nome) meta.push(`<span>${esc(empresa.nome)}</span>`)
  if (solicNome || criado) {
    meta.push(`<span>${solicNome ? t('dtAbertoPor', { nome: esc(solicNome) }) : t('dtAberto')}${criado ? ` <span title="${criado.title}">${t('dtAbertoEm', { d: criado.texto })}</span>` : ''}</span>`)
  }
  if (prazo) {
    meta.push(`<span>${t('dtPrazo')} <span class="detalhe-meta-data">${prazo.data}</span>${prazo.texto
      ? `<span class="detalhe-meta-sep" aria-hidden="true">·</span><span class="detalhe-prazo ${prazo.cls}">${prazo.texto}</span>` : ''}</span>`)
  }
  const vinculo = (rotulo, id, num) => `
    <p class="reaberto-banner">${ICO.reabrir}<span>${rotulo}</span>
      <a class="reaberto-link" href="?tela=detalhe&id=${encodeURIComponent(id)}" data-navegar="detalhe" data-id="${esc(id)}">${esc(num || id)}</a>
    </p>`
  return `
    <header class="detalhe-head">
      <div class="detalhe-head-linha">
        <nav class="detalhe-trilha" aria-label="${t('dtTrilhaAria')}">
          <a href="?tela=pedidos" data-navegar="pedidos">${t('titulo')}</a>
          <span class="detalhe-trilha-sep" aria-hidden="true">/</span>
          <span class="detalhe-num" aria-current="page">${esc(p.numeroPedido || '—')}</span>
        </nav>
        ${p.urgente ? `<span class="detalhe-urgente">${t('urgente')}</span>` : ''}
        ${_renderMenuAcoes(menu)}
      </div>
      <h1 class="detalhe-titulo">${esc(p.titulo)}</h1>
      <p class="detalhe-meta">${meta.join('<span class="detalhe-meta-sep" aria-hidden="true">·</span>')}</p>
      ${p.reabertoDe ? vinculo(t('reabertoDe'), p.reabertoDe, p.reabertaDeNum) : ''}
      ${p.reabertoPara ? vinculo(t('reabertoComo'), p.reabertoPara, p.reabertaParaNum) : ''}
    </header>`
}

// ── Render HTML ───────────────────────────────────────────────
function _renderDetalhe() {
  const root = document.getElementById('detalhe-root')
  if (!root) return

  // Avançou de etapa desde a última renderização (pela pessoa ou por outra, em
  // tempo real)? Só então a régua e o bloco do próximo passo se mexem
  // Logo depois de avançar, o detalhe se redesenha de novo (o histórico chega
  // milissegundos depois): nesses 1,6 s a animação continua de onde estava
  // (atraso negativo em --desde), em vez de recomeçar ou ser cortada
  const { atual: posAgora, parou: parouAgora } = _posicaoCaminho()
  const agora = performance.now()
  if (_posAnterior != null && posAgora > _posAnterior && !parouAgora) { _avancouDe = _posAnterior; _avancouEm = agora }
  else if (_avancouDe != null && (posAgora !== _posAnterior || agora - _avancouEm > 1600)) _avancouDe = null
  _posAnterior = posAgora
  const desde = _avancouDe != null ? Math.round(agora - _avancouEm) : 0

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
    [t('metaEmpresa'), esc(empresa?.nome || '—')],
    [t('metaCategoria'), esc(categ?.nome || '—')],
    [t('metaQtd'), `<span class="dt-numeral">${esc(p.quantidade ?? '—')}</span> ${esc(p.unidade || '')}`],
    [t('metaNecessario'), p.dataNecessaria ? `<span class="dt-numeral">${formatDate(p.dataNecessaria)}</span>` : '—'],
    // Pedidos antigos ainda trazem o valor estimado; os novos não têm o campo
    ...(p.valorEstimado ? [[t('metaValorEst'), `<span class="dt-numeral">${formatCurrency(p.valorEstimado)}</span>`]] : []),
    [t('metaCentro'), `<span class="mono">${esc(p.centroCusto || '—')}</span>`],
  ]
  if (p.fornecedorNome) dados.push([t('fornecedorLabel'), esc(p.fornecedorNome)])
  if (p.valorFinal) dados.push([t('metaValorFinal'), `<span class="dt-numeral">${formatCurrency(p.valorFinal)}</span>`, 'destaque'])
  if (p.condicaoPagamento) dados.push([t('condicaoPagLabel'), esc(CONDICAO_PAGAMENTO[p.condicaoPagamento] || p.condicaoPagamento)])
  if (p.dataCompra)  dados.push([t('metaDataCompra'), `<span class="dt-numeral">${formatDate(p.dataCompra)}</span>`])
  if (p.dataEntrega) dados.push([t('metaDataEntrega'), `<span class="dt-numeral">${formatDate(p.dataEntrega)}</span>`])

  const nCot = _cotacoes.length
  const cotInd = _cotacoes.find(c => c.indicada)

  root.innerHTML = `
    <div class="detalhe-layout${_avancouDe != null ? ' avancou' : ''}"${desde ? ` style="--desde:-${desde}ms"` : ''}>
      ${_renderCabecalho(acoes.menu)}
      ${_renderCaminho()}

      <!-- Conteúdo à esquerda (descrição, cotações, parcelas, anexos, atividade);
           à direita, o trilho de contexto: próximo passo, dados, pessoas e tempo.
           No celular vira uma coluna, na ordem das classes ord-* (themes.css) -->
      <div class="detalhe-cols">
        <div class="detalhe-main">

          ${p.descricao ? `
            <section class="dt-bloco ord-descricao" aria-labelledby="sec-desc">
              <div class="dt-card-head"><h2 class="dt-secao" id="sec-desc">${t('dtDescricao')}</h2></div>
              <div class="detalhe-descricao"><p>${esc(p.descricao)}</p></div>
            </section>` : ''}

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

          <section class="dt-bloco ord-anexos" aria-labelledby="sec-anexos">
            <div class="dt-card-head">
              <h2 class="dt-secao" id="sec-anexos">${t('secaoAnexos')}${_anexos.length ? `<span class="dt-contagem">${_anexos.length}</span>` : ''}</h2>
              ${_enviaArquivos() ? `
              <label class="btn-ghost btn-sm dt-upload" tabindex="0">
                ${ICO.clipe} ${t('dtAnexar')}
                <input type="file" id="input-upload-anexo" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" multiple class="sr-only" tabindex="-1">
              </label>` : ''}
            </div>
            <div id="anexos-list">${_renderAnexos()}</div>
          </section>

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
          <div class="ord-decisao">${_renderDecisao(acoes.painel)}</div>

          <section class="dt-bloco ord-dados" aria-labelledby="sec-dados">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-dados">${t('dtDadosPedido')}</h2></div>
            <dl class="detalhe-meta-grid">
              ${dados.map(([k, v, cls]) => `<div class="meta-item ${cls || ''}"><dt class="meta-label">${k}</dt><dd class="meta-value">${v}</dd></div>`).join('')}
            </dl>
          </section>

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
          ${MOTIVOS_REPROVACAO.map(m => `<option value="${esc(m)}">${esc(rotuloMotivo(m))}</option>`).join('')}
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
          ${MOTIVOS_CANCELAMENTO.map(m => `<option value="${esc(m)}">${esc(rotuloMotivo(m))}</option>`).join('')}
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
      <div class="modal-resumo-linha"><strong>${esc(c.fornecedorNome)}</strong><span class="dt-numeral">${formatCurrency(c.valor)}</span></div>
      ${c.prazoEntrega || c.condicoesComerciais ? `<div class="modal-resumo-sub">${esc([c.prazoEntrega ? t('dtPrazoEntregaCurto', { prazo: c.prazoEntrega }) : '', c.condicoesComerciais].filter(Boolean).join(' · '))}</div>` : ''}
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
        <input type="text" id="mc-fornecedor" placeholder="${t('dtNomeFornecedor')}" list="fornecedores-datalist" autocomplete="off" value="${esc(ind?.fornecedorNome || '')}">
        <datalist id="fornecedores-datalist">${_fornecedorDatalistOptions()}</datalist>
      </div>
      <div class="form-group">
        <label for="mc-valor">${t('valorFinalLabel')} *</label>
        <input type="text" id="mc-valor" inputmode="decimal" placeholder="R$ 0,00" value="${esc(valorIni)}">
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

  if (p.status === STATUS.EM_APROVACAO && _podeDecidir()) {
    painel.push(`<button class="btn-danger" id="btn-reprovar">${ICO.x}${t('btnReprovar')}</button>`)
    painel.push(`<button class="btn-primary" id="btn-aprovar">${ICO.check}${t('btnAprovar')}</button>`)
  }

  if (p.status === STATUS.APROVADO && [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) &&
      (p.compradorId === uid || gestorMais) && !impedimentoDeFuncao(p, sessao.usuario, 'comprar')) {
    painel.push(`<button class="btn-primary" id="btn-executar-compra">${ICO.carrinho}${t('btnExecutarCompra')}</button>`)
  }

  if (p.status === STATUS.COMPRADO &&
      (([PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && (p.compradorId === uid || gestorMais)) ||
       p.solicitanteId === uid)) {
    painel.push(`<button class="btn-primary" id="btn-confirmar-entrega">${ICO.caixa}${t('btnConfirmarEntrega')}</button>`)
  }

  if (p.status === STATUS.ENTREGUE && _podePagarParcela()) {
    const proxima = _proximaParcela()
    if (proxima) painel.push(`<button class="btn-primary" id="btn-pagar-proxima" data-pagar="${esc(proxima.id)}">${ICO.moeda}${t('dtRegistrarPagamento')}</button>`)
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
  let rotulo = t('dtProximoPasso'), tom = 'neutro', titulo, texto, resp = null
  const ultimaNota = st => _textoNota([..._historico].reverse().find(h => h.status === st && (h.nota || h.notaChave)) || {})
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
        : n < 3 ? t('dtCotRegistradasDe3', { n }) : (pode ? t('dtCotTituloIndicar') : t('dtCotRegistradas', { n }))
      texto = !pode ? t('dtCotTextoOutros')
        : n === 0 ? t('dtCotTextoVazio') : n < 3 ? t('dtCotTextoPoucas') : t('dtCotTextoIndicar')
      fatos.push([t('secaoCotacoes'), `<span class="dt-numeral">${n}</span><span class="dt-de"> ${t('dtDe3')}</span>`])
      if (n) fatos.push([t('dtMenorValor'), dinheiro(Math.min(..._cotacoes.map(c => c.valor)))])
      else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: comprador() || t('dtCompradorDesignado') }
      break
    }

    case STATUS.EM_APROVACAO: {
      const podeDecidir = _podeDecidir()
      titulo = podeDecidir ? t('dtAprovTituloPode') : t('dtAprovTitulo')
      texto = ind
        ? `${esc(ind.fornecedorNome)} ${t('dtFoiIndicada')}${n > 1 ? `, ${t('dtEntre')} ${n} ${t('dtCotacoesMin')}` : ''}.`
        : t('dtAprovSemIndicada')
      texto += ` ${_avisoDeFuncao('decidir', [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO])}`
      if (ind) {
        fatos.push([t('dtPropostaIndicada'), dinheiro(ind.valor), esc(ind.fornecedorNome)])
        if (p.valorEstimado) {
          const dif = ind.valor - p.valorEstimado
          fatos.push([t('dtFrenteEstimado'), `<span class="dt-numeral">${_pct(dif / p.valorEstimado * 100)}</span>`,
            t(dif > 0 ? 'dtAcimaDe' : dif < 0 ? 'dtAbaixoDe' : 'dtIgualA', { valor: formatCurrency(p.valorEstimado) }), dif > 0 ? 'acima' : 'abaixo'])
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
      texto = `${quem ? `${t(em ? 'dtAprovadoPorEm' : 'dtAprovadoPor', { nome: esc(quem), d: em ? dataAbsoluta(em) : '' })} ` : ''}${acoes.length ? t('dtAprovadoTextoPode')
        : (_avisoDeFuncao('comprar', [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO]) || t('dtAprovadoTexto'))}`
      if (ind) fatos.push([t('dtValorAprovado'), dinheiro(ind.valor), esc(ind.fornecedorNome)])
      else if (p.valorEstimado) fatos.push([t('metaValorEst'), dinheiro(p.valorEstimado)])
      fatoPrazo()
      resp = { papel: t('compradorLabel'), nome: comprador() || t('dtCompradorDesignado') }
      break
    }

    case STATUS.COMPRADO:
      titulo = acoes.length ? t('dtCompradoTituloPode') : t('dtCompradoTitulo')
      texto = `${p.fornecedorNome ? `${t(p.dataCompra ? 'dtCompraComEm' : 'dtCompraCom', { fornecedor: esc(p.fornecedorNome), d: p.dataCompra ? formatDate(p.dataCompra) : '' })} ` : ''}${t('dtCompradoTexto')}`
      if (p.valorFinal) fatos.push([t('metaValorFinal'), dinheiro(p.valorFinal), esc(p.fornecedorNome || '')])
      fatoPrazo()
      resp = { papel: t('dtRecebimento'), nome: comprador() || _nomePorId(p.solicitanteId) || p.solicitanteNome || null }
      break

    case STATUS.ENTREGUE: {
      const pagas = _parcelas.filter(x => x.pago)
      const total = _parcelas.reduce((s, x) => s + (x.valor || 0), 0)
      const pago = pagas.reduce((s, x) => s + (x.valor || 0), 0)
      const prox = _proximaParcela()
      titulo = prox
        ? (acoes.length ? t('dtRegistrePagamentoParcela', { parcela: `${prox.numero}/${prox.total}` }) : t('dtEntregueTitulo'))
        : (acoes.length ? t('dtEntregueTituloConcluir') : t('dtEntregueTitulo'))
      texto = `${p.dataEntrega ? `${t('dtRecebidoEm', { d: formatDate(p.dataEntrega) })} ` : ''}${_parcelas.length
        ? t('dtParcelasPagas', { pagas: pagas.length, total: _parcelas.length })
        : t('dtSemParcelas')} ${_avisoDeFuncao('pagar', [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO])}`
      if (_parcelas.length) fatos.push([t('dtPago'), dinheiro(pago), t('dtDeValor', { valor: formatCurrency(total) })])
      if (prox) {
        const d = _diasAte(prox.vencimento)
        const est = d === null ? '' : _textoVencimento(d)
        fatos.push([`${t('dtParcela')} ${prox.numero}/${prox.total}`, dinheiro(prox.valor), `${formatDate(prox.vencimento)}${est ? ` · ${est}` : ''}`, d !== null && d < 0 ? 'prazo-atrasado' : ''])
      }
      resp = _respFinanceiro()
      break
    }

    case STATUS.PAGO: {
      rotulo = t('dtConcluido'); tom = 'ok'
      const ent = _entradas()
      titulo = t('dtPagoTitulo')
      texto = p.valorFinal
        ? t(p.fornecedorNome ? 'dtPagosValorA' : 'dtPagosValor', { valor: formatCurrency(p.valorFinal), fornecedor: esc(p.fornecedorNome || '') })
        : t(p.fornecedorNome ? 'dtPagoIntegralA' : 'dtPagoIntegral', { fornecedor: esc(p.fornecedorNome || '') })
      if (p.valorFinal) fatos.push([t('dtValorPago'), dinheiro(p.valorFinal), esc(p.fornecedorNome || '')])
      if (ent[STATUS.PAGO]) fatos.push([t('dtConcluidoEm'), `<span class="dt-numeral">${dataAbsoluta(ent[STATUS.PAGO])}</span>`])
      if (p.criadoEm && ent[STATUS.PAGO]) {
        const d = Math.max(1, Math.round((_tsMs(ent[STATUS.PAGO]) - _tsMs(p.criadoEm)) / 86400000))
        fatos.push([t('dtDoPedidoAoPagamento'), `<span class="dt-numeral">${d}</span><span class="dt-de"> ${t(d === 1 ? 'dtDia' : 'dtDias')}</span>`])
      }
      break
    }

    case STATUS.REPROVADO: {
      rotulo = t('dtReprovado'); tom = 'erro'
      const motivo = p.motivoReprovacao === MOTIVO_OUTROS ? p.motivoReprovacaoOutros : (rotuloMotivo(p.motivoReprovacao) || ultimaNota(STATUS.REPROVADO))
      const h = _quemFez(STATUS.REPROVADO)
      const quem = _nomePorId(p.reprovadoPor) || p.reprovadoPorNome || h?.nome
      const em = p.reprovadoEm || h?.em
      titulo = motivo ? esc(motivo) : t('dtReprovadoTitulo')
      texto = quem ? t(em ? 'dtReprovadoPorEm' : 'dtReprovadoPor', { nome: esc(quem), d: em ? dataAbsoluta(em) : '' }) : ''
      if (p.reabertoPara) texto += ` ${t('dtJaReaberto')} ${esc(p.reabertaParaNum || '')}.`
      else if ([PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) texto += ` ${t('dtDicaReabrir')}`
      break
    }

    case STATUS.CANCELADO: {
      rotulo = t('dtCancelado'); tom = 'erro'
      const motivo = p.motivoCancelamento === MOTIVO_OUTROS ? p.motivoCancelamentoOutros : (rotuloMotivo(p.motivoCancelamento) || ultimaNota(STATUS.CANCELADO))
      const h = _quemFez(STATUS.CANCELADO)
      const quem = _nomePorId(p.canceladoPor) || p.canceladoPorNome || h?.nome
      const em = p.canceladoEm || h?.em
      titulo = motivo ? esc(motivo) : t('dtCanceladoTitulo')
      texto = `${quem ? `${t(em ? 'dtCanceladoPorEm' : 'dtCanceladoPor', { nome: esc(quem), d: em ? dataAbsoluta(em) : '' })} ` : ''}${t('dtCanceladoTexto')}`
      break
    }

    default: return ''
  }

  const comVoce = acoes.length > 0
  if (comVoce) tom = 'voce'
  // Vários responsáveis (os aprovadores): as iniciais de cada um, em pilha
  const avatarResp = !resp?.nome
    ? `<span class="avatar avatar-sm avatar-vazio" aria-hidden="true">${ICO.usuario}</span>`
    : resp.pessoas?.length > 1
      ? `<span class="avatar-pilha" aria-hidden="true">${resp.pessoas.map(u => `<span class="avatar avatar-sm">${gerarIniciais(u.nome)}</span>`).join('')}</span>`
      : `<span class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(resp.pessoas?.[0]?.nome || resp.nome)}</span>`
  const respHtml = resp ? `
    <div class="decisao-fato decisao-resp">
      <dt>${t('dtResponsavel')}</dt>
      <dd>
        ${avatarResp}
        <span class="decisao-resp-txt">
          <span class="decisao-resp-nome">${resp.nome ? esc(resp.nome) : (resp.vazio || '—')}</span>
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

// Quem pode decidir este pedido: os aprovadores do pedido ou da empresa, menos
// quem o abriu ou cotou (separação de funções)
function _aprovadoresDoPedido() {
  const p = _pedido
  return (p.aprovadorIds?.length
    ? p.aprovadorIds.map(id => _usuarios.find(u => u.id === id)).filter(Boolean)
    : _usuarios.filter(u => [PERFIS.APROVADOR, PERFIS.GESTOR].includes(u.perfil) && u.ativo !== false &&
        empresasDoUsuario(u).includes(p.empresaId)))
    .filter(u => !impedimentoDeFuncao(p, u, 'decidir'))
}

// Quem pode decidir, quando não sobra ninguém na lista: a própria pessoa, se
// for aprovadora e não estiver impedida
function _souAprovadorLivre() {
  return [PERFIS.APROVADOR, PERFIS.GESTOR].includes(sessao.usuario.perfil) &&
    !impedimentoDeFuncao(_pedido, sessao.usuario, 'decidir')
}

// Quem decide a aprovação: os aprovadores do pedido ou da empresa
function _respAprovadores() {
  const lista = _aprovadoresDoPedido()
  if (!lista.length) {
    const souAprov = _souAprovadorLivre()
    return { papel: t('aprovadoresLabel'), nome: souAprov ? sessao.usuario.nome : null, vazio: t('dtAprovadoresEmpresa') }
  }
  const nomes = lista.slice(0, 2).map(u => u.nome.split(' ')[0]).join(', ') + (lista.length > 2 ? ` ${t('dtEMais', { n: lista.length - 2 })}` : '')
  return { papel: t('aprovadoresLabel'), nome: nomes, pessoas: lista.slice(0, 2) }
}

function _respFinanceiro() {
  const fins = _usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO && u.ativo !== false &&
    empresasDoUsuario(u).includes(_pedido.empresaId))
  const nome = fins[0]?.nome || (sessao.usuario.perfil === PERFIS.FINANCEIRO ? sessao.usuario.nome : null)
  return { papel: PERFIS_LABEL[PERFIS.FINANCEIRO], nome, vazio: t('dtEquipeFinanceira') }
}

// ── Pessoas ───────────────────────────────────────────────────
// Rótulos usados quando o nome real não pode ser lido pelo perfil atual (no
// idioma da sessão, por isso a lista é montada na hora)
const _nomeGenerico = nome => [t('dtAprovadoresEmpresa'), t('dtEquipeFinanceira'), t('dtCompradorDesignado'), PERFIS_LABEL[PERFIS.APROVADOR]].includes(nome)

function _linhaPessoa(papel, nome, status, extra = '', statusCls = '') {
  const real = nome && !_nomeGenerico(nome)
  return `
    <div class="pessoa-linha">
      <div class="avatar avatar-sm ${real ? '' : 'avatar-vazio'}" aria-hidden="true">${real ? gerarIniciais(nome) : _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 13)}</div>
      <div class="pessoa-corpo">
        <div class="pessoa-role">${papel}</div>
        <div class="pessoa-name">${nome ? esc(nome) : `<span class="pessoa-indef">${status || t('dtNaoDefinido')}</span>`}</div>
        ${status && nome ? `<div class="pessoa-status ${statusCls}">${status}</div>` : ''}
        ${extra}
      </div>
    </div>`
}

function _renderPessoa(papel, nome, statusTxt) {
  return nome ? _linhaPessoa(papel, nome, statusTxt) : _linhaPessoa(papel, null, t('dtNomeIndisponivel'))
}

function _renderPessoaComprador() {
  const p = _pedido
  // Sem comprador gravado: vale quem assumiu no histórico, desde que o pedido tenha passado da
  // fila (um pedido devolvido à fila volta a "Aguardando comprador")
  const passouDaFila = [STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) ||
    ([STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status) && !!_quemFez(STATUS.AG_COTACAO))
  const nome = p.compradorId ? (_nomePorId(p.compradorId) || t('dtCompradorDesignado'))
    : (passouDaFila ? (_quemFez(STATUS.AG_COTACAO)?.nome || t('dtCompradorDesignado')) : null)
  if (!nome) return _linhaPessoa(t('compradorLabel'), null, _TERMINAIS.includes(p.status) ? t('dtNaoChegouCotacao') : t('aguardandoComprador'))
  const st = _cotacoes.length
    ? (_cotacoes.length === 1 ? t('dtCotRegistrada1') : t('dtCotRegistradas', { n: _cotacoes.length }))
    : t('semCotacoes')
  return _linhaPessoa(t('compradorLabel'), nome, st)
}

function _renderPessoaAprovadores() {
  const p = _pedido
  const papel = t('aprovadoresLabel')
  const aprovou = [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) || p.aprovadoPor
  if (aprovou) {
    const h = _quemFez(STATUS.APROVADO)
    const nome = _nomePorId(p.aprovadoPor) || h?.nome || PERFIS_LABEL[PERFIS.APROVADOR]
    const em = p.aprovadoEm || h?.em
    return _linhaPessoa(PERFIS_LABEL[PERFIS.APROVADOR], nome, `${ICO.check} ${em ? t('dtAprovadoEm', { d: dataAbsoluta(em) }) : t('aprovadoStatus')}`, '', 'text-green')
  }
  if (p.status === STATUS.REPROVADO || p.reprovadoPor) {
    const h = _quemFez(STATUS.REPROVADO)
    const nome = _nomePorId(p.reprovadoPor) || h?.nome || PERFIS_LABEL[PERFIS.APROVADOR]
    const em = p.reprovadoEm || h?.em
    return _linhaPessoa(PERFIS_LABEL[PERFIS.APROVADOR], nome, em ? t('dtReprovouEm', { d: dataAbsoluta(em) }) : t('dtReprovou'), '', 'text-red')
  }
  const lista = _aprovadoresDoPedido()
  const status = p.status === STATUS.EM_APROVACAO ? t('aguardandoStatus')
    : [STATUS.SOLICITADO, STATUS.AG_COTACAO].includes(p.status) ? t('dtEntraAposCotacoes')
    : p.status === STATUS.CANCELADO ? t('dtNaoChegouAprovacao') : ''
  if (!lista.length) {
    const souAprov = _souAprovadorLivre()
    return _linhaPessoa(papel, souAprov ? sessao.usuario.nome : t('dtAprovadoresEmpresa'), status)
  }
  const nomes = lista.slice(0, 2).map(u => u.nome.split(' ')[0]).join(', ') + (lista.length > 2 ? ` ${t('dtEMais', { n: lista.length - 2 })}` : '')
  return `
    <div class="pessoa-linha">
      <div class="avatar-pilha" aria-hidden="true">
        ${lista.slice(0, 2).map(u => `<div class="avatar avatar-sm">${gerarIniciais(u.nome)}</div>`).join('')}
      </div>
      <div class="pessoa-corpo">
        <div class="pessoa-role">${papel}</div>
        <div class="pessoa-name">${esc(nomes)}</div>
        ${status ? `<div class="pessoa-status">${status}</div>` : ''}
      </div>
    </div>`
}

function _renderPessoaFinanceiro() {
  const fins = _usuarios.filter(u => u.perfil === PERFIS.FINANCEIRO && u.ativo !== false &&
    empresasDoUsuario(u).includes(_pedido.empresaId))
  const nome = fins[0]?.nome || (sessao.usuario.perfil === PERFIS.FINANCEIRO ? sessao.usuario.nome : null)
  const totalPago = _parcelas.filter(p => p.pago).length
  const totalParc = _parcelas.length
  const st = totalParc ? t('dtPagasDe', { pagas: totalPago, total: totalParc }) : t('dtSemParcelasCurto')
  return _linhaPessoa(PERFIS_LABEL[PERFIS.FINANCEIRO], nome || t('dtEquipeFinanceira'), st)
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
      c.arquivoUrl ? `<a href="${esc(urlSegura(c.arquivoUrl))}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtAbrirArquivoCotacao')}" title="${t('dtAbrirArquivo')}">${ICO.externo}</a>` : '',
      podeIndicar && !c.indicada ? `<button class="btn-ghost btn-sm" data-indicar="${esc(c.id)}" title="${t('dtIndicarTitulo')}">${t('dtIndicar')}</button>` : '',
    ].join('')
    return `
      <li class="cotacao-item${c.indicada ? ' indicada' : ''}">
        <div class="cotacao-info">
          <div class="cotacao-fornecedor">${esc(c.fornecedorNome)}${marcas ? `<span class="cotacao-marcas">${marcas}</span>` : ''}</div>
          <div class="cotacao-sub">${esc([c.prazoEntrega ? t('dtPrazoEntregaCurto', { prazo: c.prazoEntrega }) : '', c.condicoesComerciais].filter(Boolean).join(' · ') || t('dtSemCondicoes'))}</div>
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
        <div class="feed-time" title="${ts.title}">${ts.texto}</div>
      </div>
    </li>`
  const icone = d => `<span class="feed-marca">${_svg(d, 12)}</span>`

  return feed.map(item => {
    const nome = item.autorNome || _nomePorId(item.autorId)
    const ts   = dataComRelativo(item.criadoEm)
    const quem = nome ? `<strong>${esc(nome)}</strong>` : ''

    if (item._feedTipo === 'status') {
      const i = _ETAPAS.indexOf(item.status)
      const negativo = [STATUS.REPROVADO, STATUS.CANCELADO].includes(item.status)
      const marca = negativo
        ? `<span class="feed-marca feed-marca-neg">${_svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 12)}</span>`
        : `<span class="feed-marca feed-marca-num">${i >= 0 ? _dois(i + 1) : '·'}</span>`
      const st = `<span class="feed-status">${STATUS_LABEL[item.status] || esc(item.status)}</span>`
      const nota = _textoNota(item)
      const reprovou = item.status === STATUS.REPROVADO
      const frase = item.status === STATUS.SOLICITADO && !nota
        ? (quem ? t('feedAbriu', { quem }) : t('feedPedidoAberto'))
        : negativo
          ? (quem ? t(reprovou ? 'feedReprovou' : 'feedCancelou', { quem }) : t(reprovou ? 'feedPedidoReprovado' : 'feedPedidoCancelado'))
          : (quem ? t('feedMoveu', { quem, etapa: st }) : t('feedMovido', { etapa: st }))
      return evento(marca, `${frase}${nota ? `<div class="feed-nota">${esc(nota)}</div>` : ''}`, ts, negativo ? 'feed-item-neg' : 'feed-item-etapa')
    }

    if (item._feedTipo === 'comentario') {
      const texto = esc(item.texto || '').replace(/@([\wÀ-ÿ]+)/g, '<span class="mention">@$1</span>')
      const salvo = !String(item.id).startsWith('temp-')
      const meu = salvo && item.autorId === sessao.usuario.id
      const apaga = salvo && _podeApagarComentario()
      const editando = _comentEditando?.id === item.id
      const id = esc(item.id)
      const acao = (tipo, rotulo, cls = '') =>
        `<button type="button" class="coment-acao ${cls}" data-coment-acao="${tipo}" data-coment-id="${id}" aria-label="${rotulo}">${t(tipo === 'editar' ? 'comentEditar' : 'comentApagar')}</button>`
      const editado = item.editadoEm
        ? `<span class="feed-editado" title="${formatarDataRelativa(item.editadoEm).title}">${t('comentEditado')}</span>` : ''
      const corpo = editando ? `
            <div class="coment-edicao">
              <label class="sr-only" for="coment-edit-${id}">${t('comentEditarAria')}</label>
              <textarea id="coment-edit-${id}" rows="3" data-coment-rascunho="${id}">${esc(_comentEditando.rascunho)}</textarea>
              <div class="coment-edicao-acoes">
                <button type="button" class="btn-ghost btn-sm" data-coment-acao="cancelar" data-coment-id="${id}">${t('btnCancelar')}</button>
                <button type="button" class="btn-secondary btn-sm" data-coment-acao="salvar" data-coment-id="${id}">${t('salvar')}</button>
              </div>
            </div>`
        : `<div class="comentario-bolha"><div class="comment-text">${texto}</div></div>`
      return `
        <li class="feed-item feed-item-comment">
          <div class="feed-left"><div class="avatar avatar-sm ${nome ? '' : 'avatar-vazio'}" aria-hidden="true">${nome ? gerarIniciais(nome) : _svg('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>', 12)}</div></div>
          <div class="feed-body">
            <div class="feed-header">
              <span class="feed-author">${esc(nome || t('feedParticipante'))}</span>
              <span class="feed-time" title="${ts.title}">${ts.texto}</span>
              ${editado}
              ${(meu || apaga) && !editando ? `<span class="coment-acoes">
                ${meu ? acao('editar', t('comentEditarAria')) : ''}
                ${apaga ? acao('apagar', t('comentApagarAria'), 'coment-acao-perigo') : ''}
              </span>` : ''}
            </div>
            ${corpo}
          </div>
        </li>`
    }

    if (item._feedTipo === 'cotacao') {
      return evento(icone('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
        `${t('feedCotacao', { quem: quem || t('feedAlguem'), fornecedor: `<strong>${esc(item.fornecedorNome || '—')}</strong>` })}${item.valor ? ` <span class="num">(${formatCurrency(item.valor)})</span>` : ''}`, ts)
    }

    if (item._feedTipo === 'comprovante') {
      return evento(icone('<polyline points="20 6 9 17 4 12"/>'),
        t('feedComprovante', { quem: quem || t('feedAlguem'), parcela: `<strong class="num">${esc(item.parcelaNumero || '')}</strong>` }), ts)
    }

    if (item._feedTipo === 'edicao') {
      return evento(icone('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>'),
        `${t('feedAlterou', { quem: quem || t('feedAlguem'), campo: `<strong>${esc(_rotuloCampo(item))}</strong>` })}
         <div class="feed-nota"><span class="feed-antes">${esc(_valorEdicao(item, item.valorAnterior))}</span> → ${esc(_valorEdicao(item, item.valorNovo))}</div>`, ts)
    }

    if (item._feedTipo === 'anexo') {
      return evento(icone('<path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>'),
        t('feedAnexou', { quem: quem || t('feedAlguem'), arquivo: `<strong>${esc(item.nomeArquivo || '—')}</strong>` }), ts)
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
        <span class="parcelas-de">${t('dtPagosDe')} ${formatCurrency(total)} · ${t(_parcelas.length === 1 ? 'dtParcelasDe1' : 'dtParcelasDe', { pagas, total: _parcelas.length })}</span>
      </div>
      <span class="parcelas-pct">${pct}%</span>
    </div>
    <div class="parcelas-barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${t('dtPercentualPago')}"><span style="width:${pct}%"></span></div>
    <ol class="parcelas-lista" id="parcelas-list" style="--col-acoes:${_podePagarParcela() ? '112px' : (_parcelas.some(x => x.comprovante) ? '36px' : '0px')}">${_renderParcelas()}</ol>
    ${_podePagarParcela() && !_enviaArquivos() ? `<p class="form-hint">${t('dtArquivosDesligados')}</p>` : ''}`
}

function _renderParcelas() {
  const podePagar = _podePagarParcela()
  return _parcelas.map(parc => {
    let estado, cls = ''
    if (parc.pago) {
      estado = parc.pagoEm ? t('parcPagaEm', { d: dataAbsoluta(parc.pagoEm) }) : t('parcPaga')
      cls = 'paga'
    } else {
      const d = _diasAte(parc.vencimento)
      if (d === null) estado = t('parcSemVencimento')
      else {
        estado = _textoVencimento(d)
        cls = d < 0 ? 'vencida' : d <= 3 ? 'vencendo' : ''
      }
    }
    const acoes = [
      parc.comprovante ? `<a href="${esc(urlSegura(parc.comprovante))}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('dtVerComprovante')}" title="${t('dtVerComprovante')}">${ICO.doc}</a>` : '',
      podePagar && !parc.comprovante && _enviaArquivos() ? `
        <label class="btn-icon" tabindex="0" aria-label="${t('dtAnexarComprovante')}" title="${t('dtAnexarComprovante')}">
          ${ICO.clipe}
          <input type="file" accept="image/*,.pdf" data-comprov="${esc(parc.id)}" class="sr-only" tabindex="-1">
        </label>` : '',
      !parc.pago && podePagar ? `<button class="btn-ghost btn-sm" data-pagar="${esc(parc.id)}" title="${t('dtRegistrarPagamento')}">${t('dtPagar')}</button>` : '',
    ].join('')
    return `
      <li class="parcela-item ${cls}">
        <div class="parcela-numero"><b>${esc(parc.numero)}</b><span>/${esc(parc.total)}</span></div>
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
  if (!(valor > 0)) { el.textContent = ''; return }
  if (n <= 1) { el.textContent = t('mcPagamentoUnico', { valor: formatCurrency(valor) }); return }
  // Os mesmos valores que serão gravados: a última parcela leva a diferença dos centavos
  const parcelas = dividirEmParcelas(valor, n)
  const primeira = parcelas[0]
  const ultima = parcelas[parcelas.length - 1]
  el.textContent = ultima === primeira
    ? t('mcParcelasIguais', { n, valor: formatCurrency(primeira) })
    : t('mcParcelasUltima', { n, valor: formatCurrency(primeira), ultima: formatCurrency(ultima) })
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
    if (wrap) wrap.style.display = e.target.value === MOTIVO_OUTROS ? 'block' : 'none'
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
    if (wrap) wrap.style.display = e.target.value === MOTIVO_OUTROS ? 'block' : 'none'
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

  // Comentário já enviado: o autor edita; o gestor da empresa e o supremo apagam
  const feed = document.getElementById('activity-feed')
  feed?.addEventListener('click', e => {
    const b = e.target.closest('[data-coment-acao]')
    if (!b) return
    const id = b.dataset.comentId
    if (b.dataset.comentAcao === 'editar') _abrirEdicaoComentario(id)
    else if (b.dataset.comentAcao === 'apagar') _apagarComentario(id)
    else if (b.dataset.comentAcao === 'salvar') _salvarComentario(id)
    else if (b.dataset.comentAcao === 'cancelar') _fecharEdicaoComentario(id)
  })
  feed?.addEventListener('input', e => {
    if (_comentEditando && e.target.dataset.comentRascunho === _comentEditando.id) _comentEditando.rascunho = e.target.value
  })
  feed?.addEventListener('keydown', e => {
    const id = e.target.dataset?.comentRascunho
    if (!id) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _fecharEdicaoComentario(id) }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); _salvarComentario(id) }
  })

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
  const ok = await prxConfirm(t('dlgAssumirTitulo'), t('dlgAssumirTexto'), t('dlgAssumirOk'), t('btnCancelar'))
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
      _historicoJunto(tx, STATUS.AG_COTACAO, { chave: 'notaAssumiu' })
    })
    prxToast(t('pedidoAssumido'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroAssumir')), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _liberarClaim() {
  const ok = await prxConfirm(t('dlgLiberarTitulo'), t('dlgLiberarTexto'), t('dlgLiberarOk'), t('btnCancelar'), true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // Em transação: se o comprador indicou uma cotação nesse meio-tempo, o
    // pedido não volta para a fila por cima disso
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', _pedidoId)
      const snap = await tx.get(ref)
      if (snap.data().status !== STATUS.AG_COTACAO) throw new Error(t('pedidoJaProcessado'))
      tx.update(ref, {
        compradorId: null,
        compradorNome: null,
        compradorAssumiuEm: null,
        status: STATUS.SOLICITADO,
        atualizadoEm: serverTimestamp(),
      })
      _historicoJunto(tx, STATUS.SOLICITADO, { chave: 'notaLiberado' })
    })
    prxToast(t('pedidoLiberado'), 'success')
  } catch (err) {
    prxToast(t('erroLiberarPedido'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _aprovarPedido() {
  const ind = _cotacoes.find(c => c.indicada)
  const ok = await prxConfirm(t('dlgAprovarTitulo'),
    ind ? t('dlgAprovarTextoInd', { fornecedor: ind.fornecedorNome, valor: formatCurrency(ind.valor) }) : t('dlgAprovarTexto'),
    t('btnAprovar'), t('btnCancelar'))
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
      _historicoJunto(tx, STATUS.APROVADO)
    })
    prxToast(t('pedidoAprovado'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroAprovar')), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _reprovarPedido() {
  const motivo = document.getElementById('reprov-motivo')?.value
  const outros = document.getElementById('reprov-outros')?.value.trim()
  if (!motivo || (motivo === MOTIVO_OUTROS && !outros)) {
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
        motivoReprovacaoOutros: motivo === MOTIVO_OUTROS ? outros : null,
        atualizadoEm: serverTimestamp(),
      })
      _historicoJunto(tx, STATUS.REPROVADO, motivo === MOTIVO_OUTROS ? outros : motivo)
    })
    fecharModal('modal-reprovar')
    prxToast(t('pedidoReprovado'), 'info')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroReprovar')), 'error')
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
    // Fornecedor (novo ou com mais um uso), pedido, histórico e parcelas num
    // lote só: a compra nunca fica registrada pela metade
    const lote = writeBatch(db)
    const forn = await _fornecedorNoLote(fornecedor, lote)
    lote.update(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.COMPRADO,
      fornecedorId: forn.id,
      fornecedorNome: fornecedor,
      valorFinal,
      condicaoPagamento: condicao,
      dataCompra,
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.COMPRADO, { chave: 'notaCompra', dados: { fornecedor, valor: formatCurrency(valorFinal) } })
    // Parcelas em centavos (a última leva a diferença), com vencimentos que
    // respeitam o fim do mês
    const valores = dividirEmParcelas(valorFinal, numParc)
    const vencimentos = vencimentosMensais(venc1, numParc)
    valores.forEach((valor, i) => {
      lote.set(doc(collection(db, 'pedidos', _pedidoId, 'parcelas')), {
        numero: i + 1, total: numParc,
        valor, vencimento: vencimentos[i],
        pago: false, pagoEm: null, comprovante: null,
      })
    })
    await lote.commit()
    if (forn.novo) _fornecedores.push(forn.novo)

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
  const ok = await prxConfirm(t('dlgEntregaTitulo'), t('dlgEntregaTexto'), t('confirmar'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.ENTREGUE,
      dataEntrega: hojeISO(),
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.ENTREGUE)
    await lote.commit()
    prxToast(t('entregaConfirmada'), 'success')
  } catch (err) {
    prxToast(t('erroConfirmarEntrega'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _confirmarPagamento() {
  const forn = _pedido.fornecedorNome || ''
  const resumo = _pedido.valorFinal
    ? t(forn ? 'dtPagosValorA' : 'dtPagosValor', { valor: formatCurrency(_pedido.valorFinal), fornecedor: forn })
    : t(forn ? 'dlgPagamentoRegistradoA' : 'dlgPagamentoRegistrado', { fornecedor: forn })
  const ok = await prxConfirm(t('dlgPagamentoTitulo'), `${resumo} ${t('dlgPagamentoConclui')}`, t('confirmar'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.PAGO,
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.PAGO)
    await lote.commit()
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
  if (!motivo || (motivo === MOTIVO_OUTROS && !outros)) {
    prxToast(t('selecionarMotivoSimples'), 'error')
    return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', _pedidoId), {
      status: STATUS.CANCELADO,
      canceladoPor: sessao.usuario.id,
      canceladoPorNome: sessao.usuario.nome || null,
      canceladoEm: serverTimestamp(),
      motivoCancelamento: motivo,
      motivoCancelamentoOutros: motivo === MOTIVO_OUTROS ? outros : null,
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.CANCELADO, motivo === MOTIVO_OUTROS ? outros : motivo)
    await lote.commit()
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
                <div class="cotacao-compare-fornecedor">${esc(c.fornecedorNome)}</div>
                <div class="cotacao-compare-valor">${formatCurrency(c.valor)}</div>
                <div class="cotacao-compare-dif num">${eMenor ? t('cmpMenorProposta') : `+${formatCurrency(dif)} · ${_pct(dif / menorValor * 100)}`}</div>
                <div class="cotacao-compare-row"><span class="meta-label">${t('cotPrazoEntrega')}</span><span>${esc(c.prazoEntrega || '—')}</span></div>
                <div class="cotacao-compare-row"><span class="meta-label">${t('cmpCondicoes')}</span><span>${esc(c.condicoesComerciais || '—')}</span></div>
                ${c.arquivoUrl ? `<a href="${esc(urlSegura(c.arquivoUrl))}" target="_blank" rel="noopener" class="btn-ghost btn-sm cotacao-compare-arq">${ICO.externo}${t('dtAbrirArquivo')}</a>` : ''}
              </div>`
          }).join('')}
        </div>
      </div>
    </div>
  `)
}

// ── Editar campos do pedido + auditoria campo-a-campo (3.7) ──
const _CAMPO_CHAVE = {
  titulo: 'npTitulo', descricao: 'dtDescricao', valorEstimado: 'npValor',
  dataNecessaria: 'campoDataNecessaria', urgente: 'campoUrgencia', categoriaId: 'npCategoria',
}
// Nome do campo de uma edição no idioma de quem lê (o rótulo gravado fica para
// campos que o app não conhece mais)
const _rotuloCampo = h => _CAMPO_CHAVE[h.campo] ? t(_CAMPO_CHAVE[h.campo]) : (h.campoLabel || h.campo || '')
const _valorEdicao = (h, v) => h.campo === 'urgente' ? rotuloUrgencia(v) : (v || '—')

function _editarPedido() {
  const p = _pedido
  const { fechar } = _montarOverlay('modal-editar-pedido', `
    <div class="modal" style="max-width:560px" role="dialog" aria-modal="true" aria-labelledby="modal-editar-titulo">
      ${_cabModal('modal-editar-titulo', t('btnEditarPedido'), 'data-fechar')}
      <div class="modal-body">
        <p class="modal-intro">${t('editIntro')}</p>
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label for="edit-titulo">${t('npTitulo')} *</label>
            <input type="text" id="edit-titulo" value="${esc(p.titulo || '')}" maxlength="120">
          </div>
          <div class="form-group col-span-2">
            <label for="edit-descricao">${t('dtDescricao')}</label>
            <textarea id="edit-descricao" rows="3" style="resize:vertical">${esc(p.descricao || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="edit-data">${t('npData')}</label>
            <input type="date" id="edit-data" value="${esc(p.dataNecessaria || '')}">
          </div>
          <div class="form-group">
            <label for="edit-categoria">${t('npCategoria')}</label>
            <select id="edit-categoria">
              ${_categorias.map(c => `<option value="${esc(c.id)}" ${p.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <span class="form-label-falso">${t('editPrioridade')}</span>
            <div class="toggle-wrap edit-urgente-wrap">
              <span class="toggle ${p.urgente ? 'on' : ''}" id="edit-urgente-toggle" role="switch" tabindex="0" aria-checked="${p.urgente ? 'true' : 'false'}" aria-label="${t('urgente')}"></span>
              <span class="toggle-label">${t('urgente')}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button class="btn-primary" id="salvar-edicao">${t('editSalvar')}</button>
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
  const data        = document.getElementById('edit-data')?.value
  const categoriaId = document.getElementById('edit-categoria')?.value
  const urgente     = document.getElementById('edit-urgente-toggle')?.classList.contains('on')

  if (!titulo) { prxToast(t('editTituloObrigatorio'), 'error'); return }

  const p = _pedido

  const novos = { titulo, descricao, dataNecessaria: data, categoriaId, urgente }
  const formatar = (campo, val) => {
    if (campo === 'valorEstimado')  return val ? formatCurrency(val) : '—'
    if (campo === 'dataNecessaria') return val ? formatDate(val) : '—'
    if (campo === 'urgente')        return val ? t('urgente') : t('campoNormal')
    if (campo === 'categoriaId')    return _categorias.find(c => c.id === val)?.nome || val
    return String(val ?? '—')
  }

  const alteracoes = Object.keys(novos).filter(k => {
    const antes = p[k] ?? null
    const depois = novos[k] ?? null
    return String(antes) !== String(depois)
  })

  if (!alteracoes.length) { prxToast(t('editSemAlteracao'), 'info'); fechar(); return }

  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // A edição e as entradas do histórico (uma por campo) vão no mesmo lote, e
    // o pedido aponta para a primeira: as regras recusam a edição sem ela
    const lote = writeBatch(db)
    const entradas = alteracoes.map(() => doc(collection(db, 'pedidos', _pedidoId, 'historico')))
    lote.update(doc(db, 'pedidos', _pedidoId), {
      ...novos, ultimaEdicaoId: entradas[0].id, atualizadoEm: serverTimestamp(),
    })
    alteracoes.forEach((campo, i) => lote.set(entradas[i], {
      tipo:          'edicao',
      campo,
      campoLabel:    _rotuloCampo({ campo }),
      valorAnterior: formatar(campo, p[campo]),
      valorNovo:     formatar(campo, novos[campo]),
      autorId:       sessao.usuario.id,
      autorNome:     sessao.usuario.nome,
      criadoEm:      serverTimestamp(),
    }))
    await lote.commit()
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
    return empresasDoUsuario(u).includes(empresaId)
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
  dd.innerHTML = `<div class="mention-titulo">${t('mencionar')}</div>` + sugestoes.map(u => `
    <div class="mention-item" role="option" data-nome="${esc(u.nome.split(' ')[0])}">
      <div class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(u.nome)}</div>
      <span class="mention-nome">${esc(u.nome)}</span>
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
          titulo:   t('notifMencaoTitulo'),
          corpo:    t('notifMencaoCorpo', { nome: sessao.usuario.nome, titulo: _pedido.titulo }),
          pedidoId: _pedidoId,
          lida:     false,
          criadaEm: serverTimestamp(),
          autorId:  auth.currentUser?.uid || '', // as regras conferem quem avisou
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

// ── Comentário: o autor edita o próprio; o gestor e o supremo apagam ──
// As regras deixam o autor trocar só o texto (com editadoEm) e o gestor da
// empresa do pedido (o supremo, de qualquer uma) apagar. A edição não avisa de
// novo quem foi mencionado.
function _podeApagarComentario() {
  const u = sessao.usuario
  return u.perfil === PERFIS.SUPREMO || (u.perfil === PERFIS.GESTOR && empresasDoUsuario(u).includes(_pedido.empresaId))
}

function _redesenharAtividade() {
  const el = document.getElementById('activity-feed')
  if (el) el.innerHTML = _renderActivityFeed()
}

function _focarComentario(id, seletor) {
  const el = document.querySelector(`#activity-feed [data-coment-id="${CSS.escape(id)}"]${seletor}`)
  el?.focus()
  return el
}

function _abrirEdicaoComentario(id) {
  const c = _comentarios.find(x => x.id === id)
  if (!c) return
  _comentEditando = { id, rascunho: c.texto || '' }
  _redesenharAtividade()
  const ta = document.getElementById(`coment-edit-${id}`)
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length) }
}

function _fecharEdicaoComentario(id) {
  _comentEditando = null
  _redesenharAtividade()
  _focarComentario(id, '[data-coment-acao="editar"]')
}

async function _salvarComentario(id) {
  const c = _comentarios.find(x => x.id === id)
  const texto = (_comentEditando?.id === id ? _comentEditando.rascunho : '').trim()
  if (!c) return
  if (!texto) {
    prxToast(t('comentVazio'), 'error')
    document.getElementById(`coment-edit-${id}`)?.focus()
    return
  }
  if (texto === c.texto) { _fecharEdicaoComentario(id); return }
  if (!exigirConexao()) return
  const botoes = [...document.querySelectorAll(`#activity-feed .coment-edicao button`)]
  botoes.forEach(b => { b.disabled = true })
  try {
    await updateDoc(doc(db, 'pedidos', _pedidoId, 'comentarios', id), { texto, editadoEm: serverTimestamp() })
    _comentEditando = null
    await _refreshComentarios()
    _focarComentario(id, '[data-coment-acao="editar"]')
    prxToast(t('comentAtualizado'), 'success')
  } catch (err) {
    console.warn('Editar comentário:', err)
    botoes.forEach(b => { b.disabled = false })
    prxToast(t('erroEditarComentario'), 'error')
  }
}

async function _apagarComentario(id) {
  const ok = await prxConfirm(t('comentApagarTitulo'), t('acaoIrreversivel'), t('comentApagar'), t('btnCancelar'), true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await deleteDoc(doc(db, 'pedidos', _pedidoId, 'comentarios', id))
    await _refreshComentarios()
    prxToast(t('comentApagado'), 'success')
  } catch (err) {
    console.warn('Apagar comentário:', err)
    prxToast(t('erroApagarComentario'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _indicarCotacao(cotacaoId) {
  const c = _cotacoes.find(x => x.id === cotacaoId)
  if (_pedido.status === STATUS.AG_COTACAO) {
    const ok = await prxConfirm(t('dtIndicarConfirmaTitulo'),
      c ? `${c.fornecedorNome}, ${formatCurrency(c.valor)}. ${t('dtIndicarConfirmaTexto')}` : t('dtIndicarConfirmaTexto'),
      t('dtIndicarConfirmaOk'), t('btnCancelar'))
    if (!ok) return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // Troca a indicação e, se ainda em cotação, avança para aprovação: tudo
    // num lote só, com a entrada do histórico. O pedido guarda qual cotação
    // foi indicada, e as regras só o deixam seguir com ela (firestore.rules)
    const lote = writeBatch(db)
    for (const c of _cotacoes) {
      if (c.indicada && c.id !== cotacaoId) lote.update(doc(db, 'pedidos', _pedidoId, 'cotacoes', c.id), { indicada: false })
    }
    lote.update(doc(db, 'pedidos', _pedidoId, 'cotacoes', cotacaoId), { indicada: true })
    if (_pedido.status === STATUS.AG_COTACAO) {
      lote.update(doc(db, 'pedidos', _pedidoId), {
        status: STATUS.EM_APROVACAO,
        cotacaoIndicadaId: cotacaoId,
        atualizadoEm: serverTimestamp(),
      })
      _historicoJunto(lote, STATUS.EM_APROVACAO, { chave: 'notaIndicada' })
    }
    await lote.commit()
    prxToast(t('cotacaoIndicada'), 'success')
  } catch (err) {
    prxToast(t('erroIndicarCotacao'), 'error')
  } finally {
    esconderSpinner()
  }
}

async function _pagarParcela(parcelaId) {
  const par = _parcelas.find(x => x.id === parcelaId)
  const ok = await prxConfirm(t('dlgParcelaTitulo'),
    par ? t('dlgParcelaTexto', { parcela: `${par.numero}/${par.total}`, valor: formatCurrency(par.valor), d: formatDate(par.vencimento) }) : '',
    t('dlgParcelaOk'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // A última parcela paga conclui o pedido no mesmo lote, com o histórico
    const todasPagas = _parcelas.every(p => p.id === parcelaId ? true : p.pago)
    const conclui = todasPagas && _pedido.status === STATUS.ENTREGUE
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', _pedidoId, 'parcelas', parcelaId), {
      pago: true,
      pagoEm: serverTimestamp(),
    })
    if (conclui) {
      lote.update(doc(db, 'pedidos', _pedidoId), { status: STATUS.PAGO, atualizadoEm: serverTimestamp() })
      _historicoJunto(lote, STATUS.PAGO, { chave: 'notaUltimaParcela' })
    }
    await lote.commit()
    if (!conclui) await _refreshParcelas()
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
    const parc = _parcelas.find(p => p.id === parcelaId)
    const arquivoRef = storageRef(storage, STORAGE_PATHS.comprovante(_pedidoId, parcelaId) + '/' + file.name)
    // O comprovante e a entrada do histórico vão no mesmo lote, e a parcela
    // aponta para a entrada (as regras recusam o comprovante sem ela)
    await _enviarEGravar(arquivoRef, file, undefined, (lote, url) => {
      const entrada = doc(collection(db, 'pedidos', _pedidoId, 'historico'))
      lote.update(doc(db, 'pedidos', _pedidoId, 'parcelas', parcelaId), {
        comprovante: url, comprovanteEventoId: entrada.id,
      })
      lote.set(entrada, {
        tipo:          'comprovante',
        parcelaNumero: parc ? `${parc.numero}/${parc.total}` : '',
        autorId:       sessao.usuario.id,
        autorNome:     sessao.usuario.nome,
        criadoEm:      serverTimestamp(),
      })
    })
    await _refreshParcelas()
    prxToast(t('comprovanteAnexado'), 'success')
  } catch (err) {
    prxToast(arquivoIndisponivel(err) ? t('arquivosIndisponiveis') : t('erroAnexarComprovante'), 'error')
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
            <label for="cot-forn">${t('fornecedorLabel')} *</label>
            <input type="text" id="cot-forn" placeholder="${t('cotFornecedorBusca')}" list="cot-forn-datalist" autocomplete="off">
            <datalist id="cot-forn-datalist">${_fornecedorDatalistOptions()}</datalist>
          </div>
          <div class="form-group">
            <label for="cot-valor">${t('colValor')} *</label>
            <input type="text" id="cot-valor" inputmode="decimal" placeholder="R$ 0,00">
          </div>
          <div class="form-group">
            <label for="cot-prazo">${t('cotPrazoEntrega')}</label>
            <input type="text" id="cot-prazo" placeholder="${t('cotPrazoExemplo')}">
          </div>
          <div class="form-group col-span-2">
            <label for="cot-cond">${t('cotCondicoes')}</label>
            <input type="text" id="cot-cond" placeholder="${t('cotCondicoesExemplo')}">
          </div>
          ${_enviaArquivos() ? `
          <div class="form-group col-span-2">
            <span class="form-label-falso">${t('cotArquivo')}</span>
            <label class="dropzone" for="cot-arquivo">
              ${ICO.clipe}
              <span id="cot-arquivo-nome">${t('cotSelecionarArquivo')}</span>
              <input type="file" id="cot-arquivo" accept=".pdf,image/*" class="sr-only">
            </label>
          </div>` : `
          <div class="form-group col-span-2"><p class="form-hint">${t('dtCotacaoSemArquivo')}</p></div>`}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button class="btn-primary" id="salvar-cotacao">${t('cotSalvar')}</button>
      </div>
    </div>
  `)
  document.getElementById('cot-arquivo')?.addEventListener('change', e => {
    const f = e.target.files?.[0]
    const el = document.getElementById('cot-arquivo-nome')
    if (el) el.textContent = f ? f.name : t('cotSelecionarArquivo')
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
      const cotRef = doc(collection(db, 'pedidos', _pedidoId, 'cotacoes'))
      const arquivoRef = arquivo
        ? storageRef(storage, STORAGE_PATHS.cotacao(_pedidoId, cotRef.id) + '/' + arquivo.name)
        : null
      // Fornecedor, cotação e histórico num lote só; a entrada do histórico usa
      // o ID da cotação, como as regras exigem
      const forn = await _enviarEGravar(arquivoRef, arquivo, undefined, async (lote, url) => {
        const f = await _fornecedorNoLote(fornNome, lote)
        lote.set(cotRef, {
          fornecedorId: f.id,
          fornecedorNome: fornNome,
          valor, prazoEntrega: prazo, condicoesComerciais: cond,
          arquivoUrl: url, arquivoNome: arquivo ? arquivo.name : null,
          indicada: false,
          criadaEm: serverTimestamp(),
          compradorId: sessao.usuario.id,
        })
        lote.set(doc(db, 'pedidos', _pedidoId, 'historico', cotRef.id), {
          tipo: 'cotacao',
          fornecedorNome: fornNome,
          valor,
          autorId:   sessao.usuario.id,
          autorNome: sessao.usuario.nome,
          criadoEm:  serverTimestamp(),
        })
        return f
      })
      if (forn.novo) _fornecedores.push(forn.novo)
      fechar()
      await _refreshCotacoes()
      prxToast(t('cotacaoAdicionada'), 'success')
    } catch (err) {
      prxToast(arquivoIndisponivel(err) ? t('arquivosIndisponiveis') : t('erroSalvarCotacao'), 'error')
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

// Aprova ou reprova quem tem o perfil, menos quem abriu ou cotou o pedido (o
// supremo também), como nas regras do Firestore
function _podeDecidir() {
  return [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil) &&
         !impedimentoDeFuncao(_pedido, sessao.usuario, 'decidir')
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

// Registra o pagamento (parcelas, comprovante e conclusão) o financeiro ou um
// gestor, menos quem aprovou o pedido (o supremo também)
function _podePagarParcela() {
  return [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil) &&
         !impedimentoDeFuncao(_pedido, sessao.usuario, 'pagar')
}

// Por que quem teria o perfil para o passo não pode dá-lo neste pedido (a
// separação de funções), para o painel explicar em vez de só esconder a ação
function _avisoDeFuncao(acao, perfisDoPasso) {
  if (!perfisDoPasso.includes(sessao.usuario.perfil)) return ''
  const motivo = impedimentoDeFuncao(_pedido, sessao.usuario, acao)
  if (!motivo) return ''
  if (acao === 'decidir') return motivo === 'abriu' ? t('dtNaoDecideAbriu') : t('dtNaoDecideCotou')
  return acao === 'comprar' ? t('dtNaoCompraAprovou') : t('dtNaoPagaAprovou')
}

// ── Refresh parcial de subcoleções ────────────────────────────
// Gera o PDF com os dados já carregados: sem internet, funciona se o jsPDF já
// foi baixado uma vez (o service worker guarda o arquivo)
async function _exportarPedidoPDF() {
  mostrarSpinner()
  try {
    const { jsPDF } = await carregarBiblioteca('jspdf')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const p   = _pedido

    const empresa   = _empresas.find(e => e.id === p.empresaId)
    const categoria = _categorias.find(c => c.id === p.categoriaId)
    const numero    = p.numeroPedido || '—'

    pdf.setProperties({ title: `Praxis · ${numero}`, subject: p.titulo || '', author: 'Praxis', creator: 'Praxis' })

    // O papel do relatório de compras (js/pdf-papel.js): tinta, argila e terracota
    const COR = PAPEL
    const M = 16, LARG = 210 - M * 2, LIMITE = 297 - 22
    let y = 0

    const cor   = c => pdf.setTextColor(...c)
    const fonte = (tam, estilo = 'normal') => { pdf.setFont('helvetica', estilo); pdf.setFontSize(tam) }
    const tsStr = ts => {
      if (!ts) return '—'
      const d = ts.toDate ? ts.toDate() : new Date(ts)
      if (isNaN(d)) return '—'
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }
    const emitido = tsStr(new Date())
    const novaPagina = () => { pdf.addPage(); y = 30 }
    const garantir = h => { if (y + h > LIMITE) novaPagina() }
    const fio = (yy, grosso = true) => {
      pdf.setDrawColor(...(grosso ? COR.tinta : COR.linha)); pdf.setLineWidth(grosso ? 0.55 : 0.2)
      pdf.line(M, yy, M + LARG, yy)
    }

    // Seção: fio de tinta e o título em frase normal, como no relatório
    const secao = titulo => {
      garantir(22)
      y += 5
      fio(y)
      fonte(9.5, 'bold'); cor(COR.tinta)
      pdf.text(titulo, M, y + 5.5)
      y += 10.5
    }
    const rotulo = (txt, x, yy, c = COR.texto3) => { fonte(7.4, 'bold'); cor(c); pdf.text(txt, x, yy) }

    // Tabela simples com quebra de página e cabeçalho repetido
    const tabela = (colunas, linhas) => {
      const pad = 2.2, lh = 4
      const cabecalho = () => {
        pdf.setFillColor(...COR.argila)
        pdf.rect(M, y, LARG, 7, 'F')
        pdf.setDrawColor(...COR.tinta); pdf.setLineWidth(0.45)
        pdf.line(M, y + 7, M + LARG, y + 7)
        fonte(7.4, 'bold'); cor(COR.tinta)
        let x = M
        colunas.forEach(c => {
          const direita = c.alinhar === 'right'
          pdf.text(c.titulo, direita ? x + c.w - pad : x + pad, y + 4.6, { align: direita ? 'right' : 'left' })
          x += c.w
        })
        y += 7.3
      }
      garantir(16)
      cabecalho()
      linhas.forEach(l => {
        fonte(8.5, 'normal')
        const partes = l.celulas.map((txt, i) => pdf.splitTextToSize(String(txt ?? '—'), colunas[i].w - pad * 2))
        const h = Math.max(...partes.map(pt => pt.length)) * lh + pad * 2
        if (y + h > LIMITE) { novaPagina(); cabecalho() }
        if (l.destaque) { pdf.setFillColor(...COR.argilaClara); pdf.rect(M, y, LARG, h, 'F') }
        let x = M
        partes.forEach((pt, i) => {
          const c = colunas[i]
          const estilo = (c.negrito || (l.negrito && i === 0)) ? 'bold' : 'normal'
          fonte(8.5, estilo)
          cor(l.cores?.[i] || (i === 0 ? COR.tinta : COR.texto2))
          const tx = c.alinhar === 'right' ? x + c.w - pad : x + pad
          pdf.text(pt, tx, y + pad + 3.1, { align: c.alinhar === 'right' ? 'right' : 'left', lineHeightFactor: 1.35 })
          x += c.w
        })
        y += h
        pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.15)
        pdf.line(M, y, M + LARG, y)
      })
      y += 2
    }

    // ── Cabeçalho: símbolo em terracota + PRAXIS espaçado; à direita, o número
    y = 14
    desenharSimbolo(pdf, M, y, 9, COR.terracota, COR.branco)
    fonte(16, 'normal'); cor(COR.tinta)
    textoEspacado(pdf, 'PRAXIS', M + 13, y + 8.6, 1.9)
    fonte(12.5, 'bold'); cor(COR.tinta)
    textoEspacado(pdf, numero, M + LARG, y + 4, 0.55, true)
    fonte(8.5, 'normal'); cor(COR.texto3)
    pdf.text(t('pdfEmitido', { d: emitido }), M + LARG, y + 9, { align: 'right' })
    y += 13
    fio(y)
    y += 11

    fonte(15, 'bold'); cor(COR.tinta)
    const tituloLinhas = pdf.splitTextToSize(p.titulo || '', LARG)
    pdf.text(tituloLinhas, M, y, { lineHeightFactor: 1.25 })
    y += tituloLinhas.length * 6.6

    // Etapa em pílula, o selo de urgente (como no quadro) e a abertura
    const stLabel = STATUS_LABEL[p.status] || p.status
    const stCor = [STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status) ? COR.vermelho
      : [STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status) ? COR.verde
      : COR.terracotaTxt
    fonte(8, 'bold')
    const stW = pdf.getTextWidth(stLabel) + 6
    pdf.setDrawColor(...stCor); pdf.setLineWidth(0.35)
    pdf.roundedRect(M, y - 3.6, stW, 5.4, 2.7, 2.7, 'S')
    cor(stCor); pdf.text(stLabel, M + 3, y)
    let xs = M + stW + 3
    if (p.urgente) {
      fonte(7, 'bold')
      const uW = larguraEspacada(pdf, 'URGENTE', 0.25) + 4
      pdf.setFillColor(...COR.terracota)
      pdf.rect(xs, y - 3.6, uW, 5.4, 'F')
      cor(COR.branco); textoEspacado(pdf, t('urgente').toUpperCase(), xs + 2, y - 0.1, 0.25)
      xs += uW + 3
    }
    fonte(8, 'normal'); cor(COR.texto3)
    pdf.text(t('pdfAbertoEm', { d: tsStr(p.criadoEm) }), xs + 1, y)
    y += 4

    // ── Dados em grade (3 colunas)
    secao(t('dtDadosPedido'))
    const solicNome = _nomePorId(p.solicitanteId) || p.solicitanteNome || '—'
    const dados = [
      [t('colEmpresa'), empresa?.nome || '—'],
      [t('npCategoria'), categoria?.nome || '—'],
      [t('npCC'), p.centroCusto || '—'],
      [t('npQuantidade'), `${p.quantidade ?? '—'} ${p.unidade || ''}`.trim()],
      [t('npData'), p.dataNecessaria ? formatDate(p.dataNecessaria) : '—'],
      ...(p.valorEstimado ? [[t('npValor'), formatCurrency(p.valorEstimado)]] : []),
      [t('colSolicitante'), solicNome],
      [t('colComprador'), p.compradorId ? (_nomePorId(p.compradorId) || '—') : (_quemFez(STATUS.AG_COTACAO)?.nome || t('pdfNaoAtribuido'))],
      [t('pdfAprovacao'), (() => {
        const ap = _quemFez(STATUS.APROVADO), rp = _quemFez(STATUS.REPROVADO)
        if (p.aprovadoPor || ap) return `${_nomePorId(p.aprovadoPor) || ap?.nome || t('aprovadoStatus')}, ${tsStr(p.aprovadoEm || ap?.em).slice(0, 10)}`
        if (p.reprovadoPor || rp) return t('pdfReprovadoPor', { nome: _nomePorId(p.reprovadoPor) || rp?.nome || '—' })
        return p.status === STATUS.CANCELADO ? t('pdfNaoSeAplica') : t('pdfPendente')
      })()],
    ]
    if (p.fornecedorNome) dados.push([t('fornecedorLabel'), p.fornecedorNome])
    if (p.valorFinal) dados.push([t('metaValorFinal'), formatCurrency(p.valorFinal), true])
    if (p.condicaoPagamento) dados.push([t('condicaoPagLabel'), CONDICAO_PAGAMENTO[p.condicaoPagamento] || p.condicaoPagamento])
    if (p.dataCompra) dados.push([t('metaDataCompra'), formatDate(p.dataCompra)])
    if (p.dataEntrega) dados.push([t('metaDataEntrega'), formatDate(p.dataEntrega)])
    const colW = LARG / 3
    for (let i = 0; i < dados.length; i += 3) {
      garantir(11)
      dados.slice(i, i + 3).forEach(([k, v, destaque], j) => {
        const x = M + j * colW
        rotulo(k, x, y)
        fonte(9.5, destaque ? 'bold' : 'normal'); cor(destaque ? COR.terracotaTxt : COR.tinta)
        pdf.text(pdf.splitTextToSize(String(v), colW - 4)[0], x, y + 4.6)
      })
      y += 11
    }

    if (p.descricao) {
      garantir(14)
      rotulo(t('dtDescricao'), M, y)
      y += 4.4
      fonte(9.5, 'normal'); cor(COR.texto2)
      const linhasDesc = pdf.splitTextToSize(p.descricao, LARG)
      linhasDesc.forEach(l => { garantir(5); pdf.text(l, M, y); y += 4.6 })
    }

    const motivoRep = p.motivoReprovacao === MOTIVO_OUTROS ? p.motivoReprovacaoOutros : rotuloMotivo(p.motivoReprovacao)
    const motivoCan = p.motivoCancelamento === MOTIVO_OUTROS ? p.motivoCancelamentoOutros : rotuloMotivo(p.motivoCancelamento)
    if ((p.status === STATUS.REPROVADO && motivoRep) || (p.status === STATUS.CANCELADO && motivoCan)) {
      garantir(12); y += 2
      rotulo(t(p.status === STATUS.REPROVADO ? 'pdfMotivoReprovacao' : 'pdfMotivoCancelamento'), M, y, COR.vermelho)
      y += 4.4
      fonte(9.5, 'normal'); cor(COR.texto2)
      pdf.splitTextToSize(p.status === STATUS.REPROVADO ? motivoRep : motivoCan, LARG).forEach(l => { pdf.text(l, M, y); y += 4.6 })
    }

    // ── Cotações
    if (_cotacoes.length) {
      secao(`${t('secaoCotacoes')} (${_cotacoes.length})`)
      const menor = Math.min(..._cotacoes.map(c => c.valor))
      tabela([
        { titulo: t('fornecedorLabel'), w: 48 },
        { titulo: t('pdfColPrazo'), w: 24 },
        { titulo: t('cmpCondicoes'), w: 50 },
        { titulo: t('colValor'), w: 29, alinhar: 'right', negrito: true },
        { titulo: t('pdfColSituacao'), w: LARG - 151 },
      ], [..._cotacoes].sort((a, b) => a.valor - b.valor).map(c => ({
        celulas: [c.fornecedorNome || '—', c.prazoEntrega || '—', c.condicoesComerciais || '—', formatCurrency(c.valor),
          [c.indicada ? t('dtIndicada') : '', c.valor === menor && _cotacoes.length > 1 ? t('dtMenorValor') : ''].filter(Boolean).join(', ') || '—'],
        destaque: !!c.indicada,
        cores: { 4: c.indicada ? COR.terracotaTxt : COR.texto3 },
      })))
    }

    // ── Parcelas
    if (_parcelas.length) {
      const total = _parcelas.reduce((s, x) => s + (x.valor || 0), 0)
      const pago  = _parcelas.filter(x => x.pago).reduce((s, x) => s + (x.valor || 0), 0)
      secao(`${t('secaoParcelas')} (${_parcelas.length})`)
      tabela([
        { titulo: t('dtParcela'), w: 24 },
        { titulo: t('pdfColVencimento'), w: 34 },
        { titulo: t('colValor'), w: 36, alinhar: 'right', negrito: true },
        { titulo: t('pdfColSituacao'), w: 40 },
        { titulo: t('pdfColPagoEm'), w: LARG - 134 },
      ], _parcelas.map(par => {
        const vencida = !par.pago && par.vencimento && par.vencimento < hojeISO()
        return {
          celulas: [`${par.numero}/${par.total}`, formatDate(par.vencimento), formatCurrency(par.valor),
            par.pago ? t('parcPaga') : (vencida ? t('pdfVencida') : t('pdfEmAberto')), par.pago ? tsStr(par.pagoEm).slice(0, 10) : '—'],
          cores: { 3: par.pago ? COR.verde : (vencida ? COR.vermelho : COR.texto2) },
        }
      }))
      garantir(8)
      fonte(9, 'bold'); cor(COR.tinta)
      const totTxt = `${formatCurrency(pago)} ${t('dtDeValor', { valor: formatCurrency(total) })}`
      const totW = pdf.getTextWidth(totTxt)
      pdf.text(totTxt, M + LARG - 2.2, y + 3, { align: 'right' })
      fonte(8.5, 'normal'); cor(COR.texto3)
      pdf.text(t('pdfTotalPago'), M + LARG - 2.2 - totW - 3, y + 3, { align: 'right' })
      y += 6
    }

    // ── Histórico
    if (_historico.length) {
      secao(t('pdfHistorico'))
      tabela([
        { titulo: t('colData'), w: 30 },
        { titulo: t('pdfColEvento'), w: 62 },
        { titulo: t('pdfColPor'), w: 36 },
        { titulo: t('pdfColObservacao'), w: LARG - 128 },
      ], _historico.map(h => {
        const evento = h.tipo === 'cotacao'     ? `${t('pdfEvCotacao', { fornecedor: h.fornecedorNome || '—' })}${h.valor ? ' (' + formatCurrency(h.valor) + ')' : ''}`
                     : h.tipo === 'comprovante' ? t('pdfEvComprovante', { parcela: h.parcelaNumero || '' })
                     : h.tipo === 'edicao'      ? t('pdfEvEdicao', { campo: _rotuloCampo(h) })
                     : h.tipo === 'anexo'       ? t('pdfEvAnexo', { arquivo: h.nomeArquivo || '—' })
                     : t('pdfEvStatus', { etapa: STATUS_LABEL[h.status] || h.status || '—' })
        const obs = h.tipo === 'edicao'
          ? t('pdfDePara', { de: _valorEdicao(h, h.valorAnterior), para: _valorEdicao(h, h.valorNovo) })
          : (_textoNota(h) || '—')
        return { celulas: [tsStr(h.criadoEm), evento, h.autorNome || _nomePorId(h.autorId) || '—', obs] }
      }))
    }

    // ── Cabeçalho corrido (páginas 2+) e rodapé em todas, como no relatório
    const total = pdf.getNumberOfPages()
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i)
      if (i > 1) {
        desenharSimbolo(pdf, M, 13, 5, COR.terracota, COR.branco)
        fonte(9, 'normal'); cor(COR.tinta)
        textoEspacado(pdf, 'PRAXIS', M + 7.5, 17.8, 1)
        fonte(7.4, 'normal'); cor(COR.texto3)
        pdf.text(`${numero} · ${pdf.splitTextToSize(p.titulo || '', 110)[0]}`, M + LARG, 17.8, { align: 'right' })
        fio(21, false)
      }
      const yr = 297 - 10
      fio(yr - 4, false)
      fonte(7.2, 'bold')
      cor(COR.afn); textoEspacado(pdf, 'AFN', M, yr, 0.4)
      let fx = M + larguraEspacada(pdf, 'AFN', 0.4) + 1.6
      cor(COR.cinzaAfn); textoEspacado(pdf, 'SYSTEMS', fx, yr, 0.4)
      fx += larguraEspacada(pdf, 'SYSTEMS', 0.4) + 3
      fonte(7.2, 'normal'); pdf.text('|  Praxis', fx, yr)
      cor(COR.texto3)
      pdf.text(t('pdfPagina', { i, total }), M + LARG, yr, { align: 'right' })
    }

    pdf.save(`praxis-pedido-${numero.replace('#', '')}.pdf`)
    prxToast(t('pdfExportado'), 'success')
  } catch (err) {
    console.error(err)
    prxToast(estaOnline() ? t('erroExportarPDF') : t('semConexaoAcao'), 'error')
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
    const contadorRef = contadorPedidosRef()
    let newId = null
    let newNum = null

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(contadorRef)
      const total = ((snap.exists() ? snap.data().totalPedidos : 0) || 0) + 1
      newNum = `PRX-${String(total).padStart(4, '0')}`
      const novoRef = novoPedidoRef()
      newId = novoRef.id

      tx.set(novoRef, {
        ...marcaDemo(),
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
      nota:      null,
      notaChave: 'notaReaberto',
      notaDados: { numero: p.numeroPedido || p.id, justificativa },
      criadoEm:  serverTimestamp(),
    })

    fecharModal('modal-reabrir')
    prxToast(`${t('pedidoReabertoComo')} ${newNum}.`, 'success', 4000)
    navegar('detalhe', { id: newId })
  })
}

// Entrada do histórico gravada na mesma transação ou no mesmo lote da
// mudança de status: o pedido nunca muda de etapa sem deixar o registro.
// A nota é um texto (motivo, justificativa) ou { chave, dados }: a do sistema
// fica gravada pela chave do dicionário e aparece no idioma de quem lê.
function _historicoJunto(escrita, status, nota = null) {
  const doSistema = nota !== null && typeof nota === 'object'
  escrita.set(doc(collection(db, 'pedidos', _pedidoId, 'historico')), {
    status,
    autorId: sessao.usuario.id,
    autorNome: sessao.usuario.nome || null,
    nota: doSistema ? null : nota,
    ...(doSistema ? { notaChave: nota.chave, notaDados: nota.dados || null } : {}),
    criadoEm: serverTimestamp(),
  })
}

// Texto da nota de uma entrada do histórico: a do sistema pela chave; a
// gravada como texto passa por rotuloNota (js/constants.js)
function _textoNota(h) {
  if (h.notaChave) return t(h.notaChave, h.notaDados || undefined)
  return h.nota ? rotuloNota(h.nota) : ''
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
      <div class="dt-vazio-texto">${_enviaArquivos() ? t('dtAnexosVazioTexto') : t('dtArquivosDesligados')}</div>
    </div>
  `
  const uid    = sessao.usuario.id
  const perfil = sessao.usuario.perfil
  return `<ul class="anexos-lista">${_anexos.map(a => {
    const ext = (a.nome || '').includes('.') ? (a.nome || '').split('.').pop().toLowerCase() : ''
    const autor = _nomePorId(a.autorId) || a.autorNome || '—'
    const ts    = dataComRelativo(a.criadoEm)
    const podeRemover = a.autorId === uid || [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
    return `
      <li class="anexo-item">
        <span class="anexo-tipo" aria-hidden="true">${esc((ext || 'arq').slice(0, 4))}</span>
        <div class="anexo-info">
          <a class="anexo-nome" href="${esc(urlSegura(a.url))}" target="_blank" rel="noopener" title="${esc(a.nome)}">${esc(a.nome)}</a>
          <div class="anexo-meta">${_formatarTamanho(a.tamanho)} · ${esc(autor)} · <span title="${ts.title}">${ts.texto}</span></div>
        </div>
        <div class="anexo-acoes">
          <a href="${esc(urlSegura(a.url))}" target="_blank" rel="noopener" class="btn-icon" aria-label="${t('anexoBaixarAria', { nome: esc(a.nome) })}" title="${t('anexoBaixar')}">${ICO.baixar}</a>
          ${podeRemover ? `<button class="btn-icon btn-icon-perigo" data-remover-anexo="${esc(a.id)}" data-storage-path="${esc(a.storagePath || '')}" aria-label="${t('anexoRemoverAria', { nome: esc(a.nome) })}" title="${t('remover')}">${ICO.lixeira}</button>` : ''}
        </div>
      </li>
    `
  }).join('')}</ul>${_enviaArquivos() ? '' : `<p class="form-hint">${t('dtArquivosDesligados')}</p>`}`
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
    const anexoRef = doc(collection(db, 'pedidos', _pedidoId, 'anexos'))
    // As regras do Storage só deixam apagar o anexo quem o enviou (ou um gestor
    // da empresa). O anexo e a entrada do histórico, com o mesmo ID, vão no
    // mesmo lote
    await _enviarEGravar(storageRef(storage, storagePath), file,
      { customMetadata: { autorUid: auth.currentUser?.uid || '' } },
      (lote, url) => {
        lote.set(anexoRef, {
          nome: file.name,
          tamanho: file.size,
          tipo: file.type,
          url,
          storagePath,
          autorId: sessao.usuario.id,
          autorNome: sessao.usuario.nome || '',
          criadoEm: serverTimestamp(),
        })
        lote.set(doc(db, 'pedidos', _pedidoId, 'historico', anexoRef.id), {
          tipo: 'anexo',
          nomeArquivo: file.name,
          autorId: sessao.usuario.id,
          autorNome: sessao.usuario.nome || '',
          criadoEm: serverTimestamp(),
        })
      })
    // Atualiza lista local
    const snap = await getDocs(collection(db, 'pedidos', _pedidoId, 'anexos'))
    _anexos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
    _renderDetalhe()
    prxToast(`${t('anexoAdicionado')} ${file.name}`, 'success')
  } catch (err) {
    prxToast(arquivoIndisponivel(err) ? t('arquivosIndisponiveis') : t('erroEnviarAnexo') + file.name, 'error')
  } finally {
    esconderSpinner()
  }
}

async function _removerAnexo(anexoId, storagePath) {
  const ok = await prxConfirm(t('anexoRemoverTitulo'), t('acaoIrreversivel'), t('remover'), t('btnCancelar'), true)
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
    prxToast(mensagemDeErro(err, t('erroRemoverAnexo')), 'error')
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
        <span class="tempo-nome">${STATUS_LABEL[seg.status] || esc(seg.status)}${seg.emAndamento ? `<span class="tempo-agora">${t('dtAgora')}</span>` : ''}</span>
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
