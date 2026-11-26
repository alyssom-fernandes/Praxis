// Detalhe do pedido: a tela, as escutas do Firestore, o caminho, o cabeçalho
// e o HTML das seções. As outras partes: detalhe-painel.js (decisão, pessoas,
// cotações, atividade, parcelas, eventos), detalhe-acoes.js (ações de cada
// etapa, comparador, edição, menções, comentários) e detalhe-dados.js
// (permissões, releituras, anexos, tempo por etapa); o estado em detalhe-estado.js.
import {
  db, auth, armazenamento, doc, collection, where, getDocs, setDoc, onSnapshot, writeBatch,
  serverTimestamp, increment, consulta, consultaUsuarios, marcaDemo, eContaDemo, lerCadastro,
} from './firebase.js'
import { renderTopbar, initTopbarEvents, navegar, renderFooter, registrarLimpador } from './app.js'
import { sessao, chaveLido } from './estado.js'
import { prxToast, avisoNoFormulario, prxConfirm, mostrarSpinner, esconderSpinner, exigirConexao, bordasDeRolagem } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import {
  STATUS, STATUS_LABEL, PERFIS, MOTIVOS_REPROVACAO, MOTIVOS_CANCELAMENTO, rotuloMotivo,
  CONDICAO_PAGAMENTO, DEMO_ENVIA_ARQUIVOS, t,
} from './constants.js'
import {
  formatCurrency, formatDate, formatarDataRelativa, dataAbsoluta, dataComRelativo, gerarIniciais,
  hojeISO, maisXDiasISO, normalizarTexto, urlSegura, esc, impedimentoDeFuncao, textoPrazo,
  mensagemDeErro,
} from './utils.js'
import { ETAPAS_CAMINHO, TERMINAIS, transicoes, entradas } from './processo.js'
import { podeRevisarAutorizacao, revisaoDaAutorizacao } from './lancamento.js'
import { conferirNota, formatarNota } from './nota.js'
import { prepararCampoNota } from './ler-nota.js'
import { itensDoPedido, subtotalDosItens, valorDoDesconto, totalComDesconto, placaParaExibir, linkWhatsApp } from './itens.js'
import {
  _renderDecisao, _renderPessoa, _renderPessoaComprador, _renderPessoaAprovadores,
  _renderPessoaFinanceiro, _renderCotacoes, _renderActivityFeed, _renderParcelasBloco,
  _bindDetalheEvents,
} from './detalhe-painel.js'
import { _montarOverlay } from './detalhe-acoes.js'
import {
  _podeAssumir, _podeDecidir, _podeLiberar, _podeAnexarCotacao, _podePagarParcela, _tsMs,
  _renderAnexos, _renderSLATimeline,
} from './detalhe-dados.js'
import { D } from './detalhe-estado.js'

// Posição na régua da última renderização, e de onde o pedido acabou de
// avançar (null quando não avançou): a régua anima só o passo que mudou
export const _versoesAbertas = new Set() // comentários com as versões anteriores à mostra
// Celular: Dados do pedido, Pessoas, Tempo por etapa, Anexos sem nada e as
// Cotações depois da aprovação começam recolhidos; a atividade mostra as
// três últimas entradas; o que a pessoa abre ou fecha vale até sair do pedido. No
// computador o botão não aparece e a classe não muda nada (css/themes.css)
export const _secaoAberta = (chave, padrao) => (chave in D.secoesAlternadas ? D.secoesAlternadas[chave] : padrao)
export const _botaoRecolher = (chave, idTitulo, idCorpo, aberta) =>
  `<button type="button" class="dt-recolher" data-secao="${chave}" aria-expanded="${aberta}" aria-controls="${idCorpo}" aria-labelledby="${idTitulo}">${ICO.abaixo}</button>`

// Nota interna: a conversa da equipe de compras, que o perfil solicitante não
// lê (firestore.rules, notasInternas). Fica numa subcoleção própria porque as
// regras não filtram documento a documento numa consulta
export const _COL_INTERNA = 'notasInternas'
export function _ehEquipe() { return sessao.usuario.perfil !== PERFIS.SOLICITANTE }

export async function _lerComentarios() {
  const [com, notas] = await Promise.all([
    getDocs(collection(db, 'pedidos', D.pedidoId, 'comentarios')),
    _ehEquipe() ? getDocs(collection(db, 'pedidos', D.pedidoId, _COL_INTERNA)) : Promise.resolve({ docs: [] }),
  ])
  return [
    ...com.docs.map(d => ({ id: d.id, _col: 'comentarios', ...d.data() })),
    ...notas.docs.map(d => ({ id: d.id, _col: _COL_INTERNA, interno: true, ...d.data() })),
  ].sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
}

// ── Render ────────────────────────────────────────────────────
export async function renderDetalhe(pedidoId) {
  if (!pedidoId) { navegar('pedidos'); return }
  D.pedidoId = pedidoId
  D.comentEditando = null
  D.secoesAlternadas = {}
  D.posAnterior = null
  D.avancouDe = null

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

export function _iniciarListener() {
  if (D.unsubPedido) D.unsubPedido()
  registrarLimpador(() => {
    if (D.unsubPedido) { D.unsubPedido(); D.unsubPedido = null }
  })
  let _vistoMarcado = false
  let _assinatura = null
  D.unsubPedido = onSnapshot(
    doc(db, 'pedidos', D.pedidoId),
    async snap => {
      if (!snap.exists()) {
        _renderErroDetalhe(t('pedidoNaoEncontrado'), t('pedidoRemovidoMsg'))
        return
      }
      // Campos que não mudam nada na tela (leitura, carimbos) não disparam nova renderização —
      // evita fechar um modal aberto quando o "visto por" é gravado
      const { vistoPor, atualizadoEm, ultimoComentarioEm, ...relevante } = snap.data()
      const assinatura = JSON.stringify(relevante, (k, v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v))
      D.pedido = { id: snap.id, ...snap.data() }
      if (assinatura === _assinatura) return
      _assinatura = assinatura
      if (!_vistoMarcado) {
        _vistoMarcado = true
        // No documento da pessoa, não no pedido: gravar no pedido fazia todo
        // quadro aberto reler o pedido a cada abertura
        const uid = auth.currentUser?.uid
        if (uid) setDoc(doc(db, 'lidos', uid), { pedidos: { [chaveLido(D.pedidoId)]: serverTimestamp() } }, { merge: true }).catch(() => {})
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

export function _renderErroDetalhe(titulo, msg) {
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

export function _iniciarListenerHistorico() {
  if (D.unsubHistorico) D.unsubHistorico()
  D.unsubHistorico = onSnapshot(
    collection(db, 'pedidos', D.pedidoId, 'historico'),
    snap => {
      D.historico = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
      // O histórico alimenta a atividade, os nomes (pessoas, próximo passo) e o tempo por etapa
      if (D.pedido && D.pedido.id === D.pedidoId && document.querySelector('#detalhe-root .detalhe-layout')) _renderDetalhe()
    },
    // Sem acesso ao pedido (ou pedido inexistente): o listener principal já
    // mostra o estado de erro; aqui só encerra, sem erro solto no console
    () => {
      if (D.unsubHistorico) { D.unsubHistorico(); D.unsubHistorico = null }
    }
  )
  registrarLimpador(() => { if (D.unsubHistorico) { D.unsubHistorico(); D.unsubHistorico = null } })
}

export async function _carregarSubcollections() {
  const [cotSnap, comentarios, parcSnap, anexSnap] = await Promise.all([
    getDocs(collection(db, 'pedidos', D.pedidoId, 'cotacoes')),
    _lerComentarios(),
    getDocs(collection(db, 'pedidos', D.pedidoId, 'parcelas')),
    getDocs(collection(db, 'pedidos', D.pedidoId, 'anexos')),
  ])
  D.cotacoes    = cotSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  D.comentarios = comentarios
  D.parcelas    = parcSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.numero - b.numero)
  D.anexos      = anexSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
}

export async function _carregarAuxiliares() {
  const [empSnap, catSnap, fornSnap] = await Promise.all([
    lerCadastro('empresas', consulta(collection(db, 'empresas'))),
    lerCadastro('categorias', consulta(collection(db, 'categorias'))),
    lerCadastro('fornecedores', consulta(collection(db, 'fornecedores'))),
  ])
  D.empresas    = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  D.categorias  = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  D.fornecedores = fornSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  // usuarios: regra permite list apenas para gestor+; demais perfis recebem lista vazia
  try {
    const usrSnap = await lerCadastro('usuarios', consultaUsuarios(sessao.usuario))
    D.usuarios = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Na demo, a conta de login não é uma pessoa: fica fora das menções e listas
      .filter(u => !(sessao.isDemo && u.email === 'demo@praxis.app'))
  } catch {
    D.usuarios = []
  }
}

// Fornecedores para a busca dos campos (js/autocompletar.js): os mais usados primeiro
export function _opcoesFornecedor() {
  return D.fornecedores
    .map(f => ({ nome: f.nomeExibicao || f.nomeOriginal || f.nome, usos: f.usos || 0 }))
    .filter(o => o.nome)
}

// Fornecedor da compra ou da cotação, pelo nome normalizado: o que já existe
// ganha mais um uso, e o que não existe é criado. As gravações vão no lote de
// quem chama, então o uso só conta se a compra ou a cotação for gravada.
// Devolve o ID e, se o fornecedor é novo, a entrada para a lista local (que
// quem chama acrescenta depois de gravar o lote).
export async function _fornecedorNoLote(nomeDigitado, lote) {
  const nomeNorm = normalizarTexto(nomeDigitado)
  let id = D.fornecedores.find(f => normalizarTexto(f.nomeExibicao || f.nomeOriginal || f.nome) === nomeNorm)?.id
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
// não sobra arquivo no Storage sem o registro no Firestore. `caminho` é o
// endereço no Storage (null quando não há arquivo); o SDK do Storage só
// carrega aqui, no primeiro envio
export async function _enviarEGravar(caminho, arquivo, metadados, montarLote) {
  let enviado = false
  let S = null, arquivoRef = null
  try {
    let url = null
    if (caminho) {
      S = await armazenamento()
      arquivoRef = S.ref(caminho)
      await S.uploadBytes(arquivoRef, arquivo, metadados)
      enviado = true
      url = await S.getDownloadURL(arquivoRef)
    }
    const lote = writeBatch(db)
    const resultado = await montarLote(lote, url)
    await lote.commit()
    return resultado
  } catch (err) {
    if (enviado) S.deleteObject(arquivoRef).catch(() => {})
    throw err
  }
}

// Na demo pública o envio de arquivos fica desligado (DEMO_ENVIA_ARQUIVOS, em
// constants.js): a tela troca os campos de arquivo por um aviso, e a cotação é
// registrada sem o arquivo
export function _enviaArquivos() {
  return DEMO_ENVIA_ARQUIVOS || !eContaDemo()
}

// ── Ícones (traço 2, mesma família) ───────────────────────────
export const _svg = (d, t = 15) => `<svg width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`
export const ICO = {
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
  abaixo:    _svg('<polyline points="6 9 12 15 18 9"/>', 18),
  // Balão de conversa com o fone: a ideia do WhatsApp, sem a marca
  whatsapp:  _svg('<path d="M3 21l1.65-4.95A9 9 0 1112 21a8.96 8.96 0 01-4.05-.96z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 01-1.8-1.8l.8-1-1-2z"/>', 16),
}

export const _TERMINAIS = TERMINAIS

// Nome de um usuário: lista de usuários (gestor+), sessão, ou autoria registrada no histórico/comentários
export function _nomePorId(id) {
  if (!id) return null
  if (id === sessao.usuario.id) return sessao.usuario.nome
  const u = D.usuarios.find(x => x.id === id)
  if (u?.nome) return u.nome
  // Nomes gravados no próprio pedido (perfis sem acesso à lista de usuários)
  const p = D.pedido || {}
  const gravado = { [p.solicitanteId]: p.solicitanteNome, [p.compradorId]: p.compradorNome,
    [p.aprovadoPor]: p.aprovadoPorNome, [p.reprovadoPor]: p.reprovadoPorNome, [p.canceladoPor]: p.canceladoPorNome }[id]
  if (gravado) return gravado
  const reg = [...D.historico, ...D.comentarios].find(x => x.autorId === id && x.autorNome)
  return reg?.autorNome || null
}

// Última transição registrada para um status: quem fez e quando
export function _quemFez(status) {
  const h = [...D.historico].reverse().find(x => x.status === status && (!x.tipo || x.tipo === 'status'))
  if (!h) return null
  return { id: h.autorId || null, nome: h.autorNome || _nomePorId(h.autorId), em: h.criadoEm }
}

export function _diasAte(iso) {
  if (!iso) return null
  return Math.round((new Date(iso + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 86400000)
}

// Cabeçalho dos modais do detalhe: número do pedido em numerais sobre o título
export function _cabModal(idTitulo, titulo, atributoFechar) {
  const p = D.pedido || {}
  return `
    <div class="modal-header dt-modal-cab">
      <div class="dt-modal-tit">
        <span class="dt-modal-num">${esc(p.numeroPedido || '')}<span class="dt-modal-pedido">${esc(p.titulo || '')}</span></span>
        <h2 id="${idTitulo}">${titulo}</h2>
      </div>
      <button class="btn-icon" ${atributoFechar} aria-label="${t('dtFechar')}">${ICO.fechar}</button>
    </div>`
}

export function _modalShell(id, titulo, corpo, rodape, largura = 520) {
  return `
    <div class="modal-overlay dt-modal" id="${id}">
      <div class="modal" data-estilo="max-width:${largura}px" role="dialog" aria-modal="true" aria-labelledby="${id}-titulo">
        ${_cabModal(`${id}-titulo`, titulo, `data-close="${id}"`)}
        <div class="modal-body">${corpo}</div>
        <div class="modal-footer">${rodape}</div>
      </div>
    </div>`
}

// ── Caminho do pedido ─────────────────────────────────────────
// As sete etapas, com os mesmos nomes e numerais do quadro de pedidos
export const _ETAPAS = ETAPAS_CAMINHO
export const _dois = n => String(n).padStart(2, '0')
// Vencimento de uma parcela em palavras (dias que faltam; negativo: atraso)
export const _textoVencimento = d => d < 0 ? (d === -1 ? t('parcVencida1') : t('parcVencida', { n: -d }))
  : d === 0 ? t('prazoVenceHoje') : d === 1 ? t('parcVenceEm1') : t('parcVenceEm', { n: d })
export const _pct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}%`

// Mudanças de status do histórico e a entrada em cada etapa (js/processo.js)
export const _transicoes = () => transicoes(D.historico)
export const _entradas = () => entradas(D.pedido, D.historico)

// Etapa atual; em pedido reprovado ou cancelado, a etapa em que ele parou
export function _posicaoCaminho() {
  const p = D.pedido
  const i = _ETAPAS.indexOf(p.status)
  if (i >= 0) return { atual: i, parou: null }
  if (p.status === STATUS.REPROVADO) return { atual: _ETAPAS.indexOf(STATUS.EM_APROVACAO), parou: STATUS.REPROVADO }
  const ultima = [..._transicoes()].reverse().find(h => _ETAPAS.includes(h.status))
  return { atual: ultima ? _ETAPAS.indexOf(ultima.status) : 0, parou: STATUS.CANCELADO }
}

// Prazo do pedido em palavras, com o estado: atrasado, perto ou com folga
export function _estadoPrazo() {
  const p = D.pedido
  if (!p.dataNecessaria) return null
  const data = formatDate(p.dataNecessaria)
  if (_TERMINAIS.includes(p.status) || p.status === STATUS.ENTREGUE) return { data, texto: '', cls: '' }
  const d = _diasAte(p.dataNecessaria)
  return { data, texto: textoPrazo(d), cls: d <= 0 ? 'atrasado' : d <= 3 ? 'perto' : '' }
}

export function _renderCaminho() {
  const p = D.pedido
  const { atual, parou } = _posicaoCaminho()
  const ent0 = _entradas()
  // Compra já feita: as etapas não passam pelo histórico; as datas vêm da própria compra
  const ent = p.lancamento ? { ...ent0, [STATUS.COMPRADO]: ent0[STATUS.COMPRADO] || p.dataCompra, [STATUS.ENTREGUE]: ent0[STATUS.ENTREGUE] || p.dataEntrega, [STATUS.PAGO]: ent0[STATUS.PAGO] || (p.lancamento.pago ? p.dataCompra : null) } : ent0
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
    if (D.avancouDe != null && i > D.avancouDe && i <= atual) cls += i === atual ? ' chegou' : ' passou'
    return `
      <li class="regua-etapa ${cls}"${i === atual ? ' aria-current="step"' : ''}>
        <span class="regua-n" aria-hidden="true">${_dois(i + 1)}</span>
        <span class="regua-nome">${STATUS_LABEL[st]}${leitor ? `<span class="sr-only">, ${leitor}</span>` : ''}</span>
        <span class="regua-sub"${dica ? ` title="${dica}"` : ''}>${sub || '&nbsp;'}</span>
      </li>`
  }).join('')
  return `
    <div class="caminho-wrap">
      <ol class="regua caminho${parou ? ' interrompido' : ''}" id="caminho" aria-label="${t('dtCaminhoAria')}" tabindex="0">${etapas}</ol>
    </div>`
}

// ── Cabeçalho ─────────────────────────────────────────────────
export function _renderCabecalho(menu) {
  const p = D.pedido
  const empresa = D.empresas.find(e => e.id === p.empresaId)
  const solicNome = _nomePorId(p.solicitanteId) || p.solicitanteNome || null
  const criado = p.criadoEm ? dataComRelativo(p.criadoEm) : null
  const prazo = _estadoPrazo()
  const meta = []
  if (empresa?.nome) meta.push(`<span>${esc(empresa.nome)}</span>`)
  if (solicNome || criado) {
    meta.push(`<span class="detalhe-meta-aberto">${solicNome ? t('dtAbertoPor', { nome: esc(solicNome) }) : t('dtAberto')}${criado ? ` <span title="${criado.title}">${t('dtAbertoEm', { d: criado.texto })}</span>` : ''}</span>`)
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
        ${p.requisicao ? `<span class="selo-lanc selo-req" title="${esc(t('reqTitulo'))}">${t('reqTag')}</span>` : ''}
        ${_renderMenuAcoes(menu)}
      </div>
      <h1 class="detalhe-titulo">${esc(p.titulo)}</h1>
      <p class="detalhe-meta">${meta.join('<span class="detalhe-meta-sep" aria-hidden="true">·</span>')}</p>
      ${p.reabertoDe ? vinculo(t('reabertoDe'), p.reabertoDe, p.reabertaDeNum) : ''}
      ${p.reabertoPara ? vinculo(t('reabertoComo'), p.reabertoPara, p.reabertaParaNum) : ''}
    </header>`
}

// ── Render HTML ───────────────────────────────────────────────
export function _renderDetalhe() {
  const root = document.getElementById('detalhe-root')
  if (!root) return

  // Avançou de etapa desde a última renderização (pela pessoa ou por outra, em
  // tempo real)? Só então a régua e o bloco do próximo passo se mexem
  // Logo depois de avançar, o detalhe se redesenha de novo (o histórico chega
  // milissegundos depois): nesses 1,6 s a animação continua de onde estava
  // (atraso negativo em --desde), em vez de recomeçar ou ser cortada
  const { atual: posAgora, parou: parouAgora } = _posicaoCaminho()
  const agora = performance.now()
  if (D.posAnterior != null && posAgora > D.posAnterior && !parouAgora) { D.avancouDe = D.posAnterior; D.avancouEm = agora }
  else if (D.avancouDe != null && (posAgora !== D.posAnterior || agora - D.avancouEm > 1600)) D.avancouDe = null
  D.posAnterior = posAgora
  const desde = D.avancouDe != null ? Math.round(agora - D.avancouEm) : 0

  const p       = D.pedido
  const empresa = D.empresas.find(e => e.id === p.empresaId)
  const categ   = D.categorias.find(c => c.id === p.categoriaId)
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
    // Com vários itens, a quantidade vai na lista de itens
    ...(itensDoPedido(p).length < 2 ? [[t('metaQtd'), `<span class="dt-numeral">${esc(p.quantidade ?? '—')}</span> ${esc(p.unidade || '')}`]] : []),
    ...(p.veiculo?.placa ? [[t('metaVeiculo'), `<span class="mono">${esc(placaParaExibir(p.veiculo.placa))}</span>${p.veiculo.km ? ` · ${esc(p.veiculo.km.toLocaleString('pt-BR'))} ${t('kmSufixo')}` : ''}`]] : []),
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
  if (p.notaFiscal)  dados.push([t('dtNotaFiscal'), `<span class="mono dt-nota">${esc(formatarNota(p.notaFiscal))}</span>`])
  if (p.linkCompra && urlSegura(p.linkCompra)) dados.push([t('dtLinkCompra'), `<a href="${esc(urlSegura(p.linkCompra))}" target="_blank" rel="noopener">${t('dtVerAnuncio')}</a>`])

  // Na compra já feita, as linhas vazias (categoria, necessário até, centro de
  // custo) não se aplicam
  const vazio = v => ['—', '<span class="mono">—</span>'].includes(String(v).trim())
  const dadosVisiveis = p.lancamento ? dados.filter(([, v]) => !vazio(v)) : dados

  const nCot = D.cotacoes.length
  const nCotValor = D.cotacoes.filter(c => !c.semProduto).length
  const dadosAbertos = _secaoAberta('dados', false)
  const cotAbertas = _secaoAberta('cotacoes', [STATUS.AG_COTACAO, STATUS.EM_APROVACAO].includes(p.status))
  const pessoasAbertas = _secaoAberta('pessoas', false)
  const nFeed = D.historico.length + D.comentarios.length + (p.lancamento ? 1 : 0)
  const feedTodo = _secaoAberta('atividade', false) || nFeed <= 3
  const anexosAbertos = _secaoAberta('anexos', D.anexos.length > 0)
  const cotInd = D.cotacoes.find(c => c.indicada)

  root.innerHTML = `
    <div class="detalhe-layout${D.avancouDe != null ? ' avancou' : ''}"${desde ? ` data-estilo="--desde:-${desde}ms"` : ''}>
      ${_renderCabecalho(acoes.menu)}
      ${_renderCaminho()}

      <!-- Conteúdo à esquerda (descrição, cotações, parcelas, anexos, atividade);
           à direita, o trilho de contexto: próximo passo, dados, pessoas e tempo.
           No celular vira uma coluna, na ordem das classes ord-* (themes.css) -->
      <div class="detalhe-cols">
        <div class="detalhe-main">

          ${p.lancamento ? _renderLancamento() : ''}

          ${_renderItens(p)}

          ${p.descricao ? `
            <section class="dt-bloco ord-descricao" aria-labelledby="sec-desc">
              <div class="dt-card-head"><h2 class="dt-secao" id="sec-desc">${t('dtDescricao')}</h2></div>
              <div class="detalhe-descricao"><p>${esc(p.descricao)}</p></div>
            </section>` : ''}

          ${p.lancamento ? '' : `<section class="dt-bloco ord-cotacoes recolhivel${cotAbertas ? '' : ' recolhida'}" aria-labelledby="sec-cot">
            <div class="dt-card-head">
              <h2 class="dt-secao" id="sec-cot">${t('secaoCotacoes')}${nCot ? `<span class="dt-contagem">${nCot}</span>` : ''}</h2>
              ${nCotValor >= 2 ? `
                <div class="dt-card-acoes">
                  <span class="dt-legenda">${cotInd ? t('dtComparadasIndicada') : t('dtComparadasMenor')}</span>
                  <button class="btn-ghost btn-sm" id="btn-comparar-cotacoes" title="${t('dtLadoALadoTitulo')}">${ICO.comparar}${t('dtLadoALado')}</button>
                </div>` : ''}
              ${_botaoRecolher('cotacoes', 'sec-cot', 'cotacoes-list', cotAbertas)}
            </div>
            <div id="cotacoes-list" class="cotacoes-list">${_renderCotacoes()}</div>
          </section>`}

          ${D.parcelas.length ? `
            <section class="dt-bloco ord-parcelas" aria-labelledby="sec-parc">
              <div class="dt-card-head">
                <h2 class="dt-secao" id="sec-parc">${t('secaoParcelas')}<span class="dt-contagem">${D.parcelas.length}</span></h2>
              </div>
              <div id="parcelas-wrap">${_renderParcelasBloco()}</div>
            </section>
          ` : ''}

          <section class="dt-bloco ord-anexos recolhivel${anexosAbertos ? '' : ' recolhida'}" aria-labelledby="sec-anexos">
            <div class="dt-card-head">
              <h2 class="dt-secao" id="sec-anexos">${t('secaoAnexos')}${D.anexos.length ? `<span class="dt-contagem">${D.anexos.length}</span>` : ''}</h2>
              ${_enviaArquivos() ? `
              <label class="btn-ghost btn-sm dt-upload" tabindex="0">
                ${ICO.clipe} ${t('dtAnexar')}
                <input type="file" id="input-upload-anexo" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx" multiple class="sr-only" tabindex="-1">
              </label>` : ''}
              ${_botaoRecolher('anexos', 'sec-anexos', 'anexos-list', anexosAbertos)}
            </div>
            <div id="anexos-list">${_renderAnexos()}</div>
          </section>

          <section class="dt-bloco ord-atividade" aria-labelledby="sec-ativ">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-ativ">${t('secaoAtividade')}</h2></div>
            <div class="comentario-composer">
              <div class="avatar avatar-sm" aria-hidden="true">${gerarIniciais(sessao.usuario.nome || '?')}</div>
              <div class="comentario-campo${_ehEquipe() && D.notaInterna ? ' interno' : ''}">
                <label for="input-comentario" class="sr-only">${t('dtComentario')}</label>
                <textarea id="input-comentario" rows="2" placeholder="${t('dtComentarioPlaceholder')}"></textarea>
                <div id="mention-dropdown" class="mention-dropdown" role="listbox" data-estilo="display:none"></div>
                <div class="comentario-rodape">
                  ${_ehEquipe() ? `<label class="comentario-interno" title="${t('notaInternaDica')}"><input type="checkbox" id="coment-interno"${D.notaInterna ? ' checked' : ''}> ${t('notaInternaOpcao')}</label>` : ''}
                  <span class="comentario-dica"><kbd>@</kbd> ${t('dtMenciona')} <span class="so-desktop">· <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ${t('dtEnvia')}</span></span>
                  <button class="btn-secondary btn-sm" id="btn-enviar-comentario">${ICO.enviar}${t('dtComentar')}</button>
                </div>
              </div>
            </div>
            <ol class="activity-feed${feedTodo ? '' : ' curta'}" id="activity-feed">${_renderActivityFeed()}</ol>
            ${feedTodo ? '' : `<button type="button" class="btn-ghost btn-sm dt-feed-mais" id="btn-feed-mais" aria-controls="activity-feed">${t('dtAtividadeTudo', { n: nFeed })}</button>`}
          </section>
        </div>

        <aside class="detalhe-aside">
          <div class="ord-decisao">${_renderDecisao(acoes.painel)}</div>

          <section class="dt-bloco ord-dados recolhivel${dadosAbertos ? '' : ' recolhida'}" aria-labelledby="sec-dados">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-dados">${t('dtDadosPedido')}</h2>${_botaoRecolher('dados', 'sec-dados', 'corpo-dados', dadosAbertos)}</div>
            <dl class="detalhe-meta-grid" id="corpo-dados">
              ${dadosVisiveis.map(([k, v, cls]) => `<div class="meta-item ${cls || ''}"><dt class="meta-label">${k}</dt><dd class="meta-value">${v}</dd></div>`).join('')}
            </dl>
          </section>

          ${p.lancamento ? '' : `<section class="dt-bloco ord-pessoas recolhivel${pessoasAbertas ? '' : ' recolhida'}" aria-labelledby="sec-pessoas">
            <div class="dt-card-head"><h2 class="dt-secao" id="sec-pessoas">${t('pessoasEnvolvidas')}</h2>${_botaoRecolher('pessoas', 'sec-pessoas', 'corpo-pessoas', pessoasAbertas)}</div>
            <div class="pessoas-lista" id="corpo-pessoas">
              ${_renderPessoa(t('solicitanteLabel'), solicNome, t('criouPedido'))}
              ${_renderPessoaComprador()}
              ${_renderPessoaAprovadores()}
              ${_renderPessoaFinanceiro()}
            </div>
          </section>`}

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
      <div class="form-group" id="reprov-outros-wrap" data-estilo="display:none;margin-top:var(--esp-200)">
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
      <div class="form-group" id="cancel-outros-wrap" data-estilo="display:none;margin-top:var(--esp-200)">
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
export function _centralizarCaminho() {
  const ol = document.getElementById('caminho')
  const atual = ol?.querySelector('[aria-current="step"]')
  if (!ol || !atual || ol.scrollWidth <= ol.clientWidth) return
  const alvo = atual.previousElementSibling || atual
  ol.scrollLeft = Math.max(0, alvo.offsetLeft - ol.offsetLeft - 16)
  bordasDeRolagem(ol)
}

// Bloco de uma cotação dentro de um modal (fornecedor, valor, condições)
export function _resumoCotacao(c, rotulo) {
  return `
    <div class="modal-resumo">
      <span class="meta-label">${rotulo}</span>
      <div class="modal-resumo-linha"><strong>${esc(c.fornecedorNome)}</strong><span class="dt-numeral">${formatCurrency(c.valor)}</span></div>
      ${c.prazoEntrega || c.condicoesComerciais ? `<div class="modal-resumo-sub">${esc([c.prazoEntrega ? t('dtPrazoEntregaCurto', { prazo: c.prazoEntrega }) : '', c.condicoesComerciais].filter(Boolean).join(' · '))}</div>` : ''}
    </div>`
}

export function _corpoModalCompra() {
  const ind = D.cotacoes.find(c => c.indicada)
  const valorIni = ind?.valor ? formatCurrency(ind.valor) : ''
  return `
    ${ind ? _resumoCotacao(ind, t('dtCotacaoIndicada')) : ''}
    <div class="form-grid form-grid-2">
      <div class="form-group col-span-2">
        <label for="mc-fornecedor">${t('fornecedorLabel')} *</label>
        <input type="text" id="mc-fornecedor" placeholder="${t('dtNomeFornecedor')}" autocomplete="off" value="${esc(ind?.fornecedorNome || '')}">
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
      <div class="form-group col-span-2">
        <label for="mc-nota">${t('lancNota')} <span class="np-opcional">${t('opcional')}</span></label>
        <input type="text" id="mc-nota" inputmode="numeric" maxlength="60" placeholder="${t('lancNotaPlaceholder')}" autocomplete="off">
      </div>
      <!-- S5: a compra de balcão fecha de uma vez; pago só para quem é do financeiro -->
      <div class="form-group col-span-2 mc-de-uma-vez">
        <label class="emp-opcao-check"><input type="checkbox" id="mc-chegou"> <span>${t('compraJaChegou')}</span></label>
        ${[PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil)
          ? `<label class="emp-opcao-check"><input type="checkbox" id="mc-pago" disabled> <span>${t('compraJaPaga')}</span></label>` : ''}
      </div>
    </div>`
}

// ── Itens (js/itens.js) ───────────────────────────────────────
// A lista aparece com dois itens ou mais, ou quando há valor por item; o
// pedido de um item só, sem valor, continua com a quantidade nos dados
export function _renderItens(p) {
  const itens = itensDoPedido(p)
  const sub = subtotalDosItens(itens)
  if (itens.length < 2 && sub == null) return ''
  const vd = valorDoDesconto(sub, p.desconto)
  const linhas = itens.map(i => `
    <tr>
      <td class="dt-it-desc">${esc(i.descricao)}</td>
      <td class="dt-it-qtd"><span class="dt-numeral">${esc(i.quantidade.toLocaleString('pt-BR'))}</span> ${esc(i.unidade)}</td>
      ${sub != null ? `<td class="dt-it-valor">${i.valorUnitario != null ? formatCurrency(i.quantidade * i.valorUnitario) : '—'}</td>` : ''}
    </tr>`).join('')
  return `
    <section class="dt-bloco ord-itens" aria-labelledby="sec-itens">
      <div class="dt-card-head"><h2 class="dt-secao" id="sec-itens">${t('dtItens')} <span class="dt-secao-n">${itens.length}</span></h2></div>
      <table class="dt-itens">
        <thead class="sr-only"><tr><th>${t('itemDescricao')}</th><th>${t('npQuantidade')}</th>${sub != null ? `<th>${t('itemTotal')}</th>` : ''}</tr></thead>
        <tbody>${linhas}</tbody>
        ${sub != null ? `<tfoot>
          ${vd ? `<tr><td colspan="2">${t('itemSubtotal')}</td><td class="dt-it-valor">${formatCurrency(sub)}</td></tr>
          <tr><td colspan="2">${t('itemDesconto')}${p.desconto?.tipo === 'pct' ? ` (${esc(String(p.desconto.valor).replace('.', ','))}%)` : ''}</td><td class="dt-it-valor">−${formatCurrency(vd)}</td></tr>` : ''}
          <tr class="dt-it-total"><td colspan="2">${t('itemTotalEstimado')}</td><td class="dt-it-valor">${formatCurrency(totalComDesconto(sub, p.desconto))}</td></tr>
        </tfoot>` : ''}
      </table>
    </section>`
}

// ── Compra já feita (js/lancamento.js) ────────────────────────
// Quem pediu, quem autorizou (com a situação da autorização), quem comprou e
// por quê; para a pessoa apontada ou um gestor, confirmar ou não reconhecer
export function _renderLancamento() {
  const l = D.pedido.lancamento
  const aut = l.autorizacao || 'confirmada'
  const estado = aut === 'confirmada' ? t('lancAutConfirmada', { nome: l.autorizacaoPorNome || '' })
    : aut === 'negada' ? t('lancAutNegada', { nome: l.autorizacaoPorNome || '' }) : t('lancAutPendente')
  const linha = (rotulo, valor) => `<div class="lanc-linha"><dt>${rotulo}</dt><dd>${esc(valor || '—')}</dd></div>`
  const revisa = podeRevisarAutorizacao(D.pedido, sessao.usuario)
  return `
    <section class="dt-bloco ord-lancamento lanc-bloco lanc-${esc(aut)}" aria-labelledby="sec-lanc">
      <div class="dt-card-head">
        <h2 class="dt-secao" id="sec-lanc">${t('lancTitulo')}</h2>
        <span class="selo-lanc selo-lanc-${esc(aut)}">${esc(estado)}</span>
      </div>
      <dl class="lanc-dados">
        ${linha(t('lancPedidoPor'), l.pedidoPor?.nome)}
        ${linha(t('lancAutorizadoPor'), l.autorizadoPor?.nome)}
        ${linha(t('lancCompradoPor'), l.compradoPor?.nome)}
        ${linha(t('lancMotivo'), t(`lancMotivo_${l.motivo}`))}
      </dl>
      <p class="lanc-quem">${esc(t('lancResumo', { quem: l.lancadoPorNome || '', data: dataAbsoluta(D.pedido.criadoEm) }))}</p>
      ${revisa ? `
      <div class="lanc-revisao">
        <p>${esc(t('lancRevisarTexto', { quem: l.lancadoPorNome || '', autorizador: l.autorizadoPor?.nome || '' }))}</p>
        <div class="lanc-revisao-acoes">
          <button type="button" class="btn-secondary" id="btn-lanc-negar">${t('lancNegar')}</button>
          <button type="button" class="btn-primary" id="btn-lanc-confirmar">${ICO.check}${t('lancConfirmar')}</button>
        </div>
      </div>` : ''}
    </section>`
}

export async function _revisarAutorizacao(resultado) {
  if (resultado === 'negada') {
    const ok = await prxConfirm(t('lancNegarTitulo'), t('lancNegarTexto'), t('lancNegar'), t('btnCancelar'), true)
    if (!ok) return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // A revisão e a entrada do histórico no mesmo lote (as regras exigem)
    const lote = writeBatch(db)
    const entrada = doc(collection(db, 'pedidos', D.pedidoId, 'historico'))
    lote.update(doc(db, 'pedidos', D.pedidoId), revisaoDaAutorizacao(D.pedido, sessao.usuario, resultado, serverTimestamp(), entrada.id))
    lote.set(entrada, {
      tipo: 'autorizacao', resultado,
      autorId: sessao.usuario.id, autorNome: sessao.usuario.nome || '',
      criadoEm: serverTimestamp(),
    })
    await lote.commit()
    prxToast(t(resultado === 'negada' ? 'lancNegada' : 'lancConfirmada'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('lancErroRevisar')), 'error')
  } finally {
    esconderSpinner()
  }
}

// A nota fiscal que chega depois da compra
export function _podeInformarNota() {
  const p = D.pedido
  const u = sessao.usuario
  if (![STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO].includes(p.status)) return false
  const gestorMais = [PERFIS.GESTOR, PERFIS.SUPREMO].includes(u.perfil)
  return (u.perfil === PERFIS.COMPRADOR && p.compradorId === u.id) || gestorMais ||
    p.solicitanteId === u.id || u.perfil === PERFIS.FINANCEIRO
}

export function _informarNota() {
  const { overlay, fechar } = _montarOverlay('modal-nota', `
    <div class="modal" data-estilo="max-width:440px" role="dialog" aria-modal="true" aria-labelledby="modal-nota-titulo">
      ${_cabModal('modal-nota-titulo', t('dtNotaTitulo'), 'data-fechar')}
      <div class="modal-body">
        <div class="form-group">
          <label for="nota-numero">${t('lancNota')}</label>
          <input type="text" id="nota-numero" inputmode="numeric" maxlength="60" placeholder="${t('lancNotaPlaceholder')}" value="${esc(D.pedido.notaFiscal || '')}" autocomplete="off">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button class="btn-primary" id="salvar-nota">${t('salvar')}</button>
      </div>
    </div>`)
  prepararCampoNota(overlay.querySelector('#nota-numero'))
  overlay.querySelector('#salvar-nota')?.addEventListener('click', async () => {
    const nota = overlay.querySelector('#nota-numero')?.value.trim()
    if (!nota) { avisoNoFormulario(overlay, t('erroCamposObrigatorios')); return }
    const r = conferirNota(nota)
    if (r === 'digito' || r === 'tamanho') { prxToast(t(r === 'digito' ? 'notaDigitoErrado' : 'notaTamanhoErrado'), 'warning'); return }
    if (!exigirConexao()) return
    mostrarSpinner()
    try {
      const lote = writeBatch(db)
      const entrada = doc(collection(db, 'pedidos', D.pedidoId, 'historico'))
      lote.update(doc(db, 'pedidos', D.pedidoId), { notaFiscal: nota, ultimaEdicaoId: entrada.id, atualizadoEm: serverTimestamp() })
      lote.set(entrada, {
        tipo: 'edicao', campos: ['notaFiscal'],
        autorId: sessao.usuario.id, autorNome: sessao.usuario.nome || '',
        criadoEm: serverTimestamp(),
      })
      await lote.commit()
      fechar()
      prxToast(t('notaInformada'), 'success')
    } catch (err) {
      prxToast(mensagemDeErro(err, t('erroInformarNota')), 'error')
    } finally {
      esconderSpinner()
    }
  })
}

// ── Ações ─────────────────────────────────────────────────────
// painel: a ação que faz o pedido andar, dentro do "Próximo passo" (secundária antes, principal por último)
// menu: o resto, no "…" do cabeçalho
export function _acoesDoPedido() {
  const p = D.pedido
  const uid = sessao.usuario.id
  const perfil = sessao.usuario.perfil
  const gestorMais = [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
  const painel = []
  const menu = []

  if (_podeAssumir()) painel.push(`<button class="btn-primary" id="btn-assumir">${ICO.usuario}${t('btnAssumirPedido')}</button>`)

  if (_podeAnexarCotacao()) {
    const cls = D.cotacoes.length >= 3 ? 'btn-secondary' : 'btn-primary'
    painel.push(`<button class="${cls}" id="btn-add-cotacao">${ICO.mais2}${t('dtRegistrarCotacao')}</button>`)
  }

  if (p.status === STATUS.EM_APROVACAO && _podeDecidir()) {
    painel.push(`<button class="btn-danger" id="btn-reprovar">${ICO.x}${t('btnReprovar')}</button>`)
    painel.push(`<button class="btn-primary" id="btn-aprovar">${ICO.check}${t('btnAprovar')}</button>`)
  }

  if (p.status === STATUS.APROVADO && !p.requisicao && [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) &&
      (p.compradorId === uid || gestorMais) && !impedimentoDeFuncao(p, sessao.usuario, 'comprar')) {
    painel.push(`<button class="btn-primary" id="btn-executar-compra">${ICO.carrinho}${t('btnExecutarCompra')}</button>`)
  }
  // Requisição aprovada: quem foi buscar registra a retirada (R4)
  if (p.status === STATUS.APROVADO && p.requisicao && (p.solicitanteId === uid || gestorMais ||
      (perfil === PERFIS.COMPRADOR && p.compradorId === uid))) {
    painel.push(`<button class="btn-primary" id="btn-registrar-retirada">${ICO.caixa}${t('btnRegistrarRetirada')}</button>`)
  }
  // A autorização para mostrar ao fornecedor (R5)
  if (p.status === STATUS.APROVADO) {
    painel.push(`<button class="btn-secondary" id="btn-autorizacao">${ICO.doc}${t('btnAutorizacao')}</button>`)
  }

  if (p.status === STATUS.COMPRADO &&
      (([PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && (p.compradorId === uid || gestorMais)) ||
       p.solicitanteId === uid)) {
    painel.push(`<button class="btn-primary" id="btn-confirmar-entrega">${ICO.caixa}${t('btnConfirmarEntrega')}</button>`)
  }

  // R6: a fatura do fornecedor (a empresa liga a opção)
  if (p.status === STATUS.ENTREGUE && _podePagarParcela() && p.fornecedorNome &&
      D.empresas.find(e => e.id === p.empresaId)?.faturaMensal?.ativa === true) {
    painel.push(`<button class="btn-secondary" id="btn-pagar-fatura">${ICO.moeda}${t('fatBotao')}</button>`)
  }
  if (p.status === STATUS.ENTREGUE && _podePagarParcela()) {
    const proxima = _proximaParcela()
    if (proxima) painel.push(`<button class="btn-primary" id="btn-pagar-proxima" data-pagar="${esc(proxima.id)}">${ICO.moeda}${t('dtRegistrarPagamento')}</button>`)
    else painel.push(`<button class="btn-primary" id="btn-confirmar-pagamento">${ICO.check}${t('btnConfirmarPagamento')}</button>`)
  }

  // O pedido espera alguém e quem olha não tem o que fazer nele: avisar pelo
  // WhatsApp, com a mensagem e o link prontos (a pessoa escolhe o contato)
  const wa = linkWhatsApp(p, `${location.origin}/?tela=detalhe&id=${encodeURIComponent(D.pedidoId)}`, t)
  if (wa && !painel.length) {
    painel.push(`<a class="btn-secondary btn-whatsapp" id="btn-whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">${ICO.whatsapp}${t('btnAvisarWhatsApp')}</a>`)
  }

  const podeCopiar = [PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
  // Compra que se repete: "Comprar de novo" à vista nos pedidos concluídos
  if (podeCopiar && [STATUS.ENTREGUE, STATUS.PAGO].includes(p.status)) {
    painel.push(`<button class="btn-secondary" id="btn-comprar-de-novo">${ICO.duplicar}${t('btnComprarDeNovo')}</button>`)
  }

  const podeEditar = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    (gestorMais && !_TERMINAIS.includes(p.status))
  )
  if (podeEditar) menu.push({ id: 'btn-editar-pedido', icone: ICO.editar, label: t('btnEditarPedido') })
  if (podeCopiar && ![STATUS.ENTREGUE, STATUS.PAGO].includes(p.status)) {
    menu.push({ id: 'btn-duplicar-pedido', icone: ICO.duplicar, label: t('dtDuplicarPedido') })
  }
  if (p.status === STATUS.REPROVADO && !p.reabertoPara && [PERFIS.SOLICITANTE, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    menu.push({ id: 'btn-reabrir-pedido', icone: ICO.reabrir, label: t('btnReabrir') })
  }
  if ([PERFIS.GESTOR, PERFIS.SUPREMO, PERFIS.FINANCEIRO, PERFIS.COMPRADOR].includes(perfil)) {
    menu.push({ id: 'btn-exportar-pdf', icone: ICO.pdf, label: t('btnExportarPDF') })
  }
  if (_podeLiberar()) menu.push({ id: 'btn-liberar', icone: ICO.liberar, label: t('btnLiberarPedido') })
  if (_podeInformarNota()) menu.push({ id: 'btn-informar-nota', icone: ICO.editar, label: t('dtInformarNota') })

  const podeCanc = (
    (p.solicitanteId === uid && p.status === STATUS.SOLICITADO) ||
    (gestorMais && ![STATUS.ENTREGUE, STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
  )
  if (podeCanc) menu.push({ id: 'btn-cancelar', icone: ICO.cancelar, label: t('btnCancelarPedido'), perigo: true })

  return { painel, menu }
}

export function _renderMenuAcoes(menu) {
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
export function _proximaParcela() {
  return D.parcelas.filter(x => !x.pago).sort((a, b) => String(a.vencimento || '').localeCompare(String(b.vencimento || '')) || a.numero - b.numero)[0] || null
}
