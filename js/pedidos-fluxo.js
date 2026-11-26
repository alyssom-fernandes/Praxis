// Tela de pedidos: validação do novo pedido, escuta do Firestore, filtragem,
// cabeçalho, rolagem do quadro, régua do celular e arrastar e soltar
// (ver js/pedidos.js).
import {
  db, collection, where, orderBy, limit, onSnapshot, doc, runTransaction, serverTimestamp, writeBatch,
  consulta, marcaDemo, novoPedidoRef, contadorPedidosRef,
} from './firebase.js'
import { navegar, registrarLimpador, atualizarLateral } from './app.js'
import { sessao } from './estado.js'
import {
  prxToast, avisoNoFormulario, prxEscolha, estadoVazio, mostrarSpinner, esconderSpinner, fecharModal, abrirModal, exigirConexao,
} from './ui.js'
import { STATUS, STATUS_LABEL, PERFIS, KANBAN_COLUNAS, t } from './constants.js'
import { formatCurrency, hojeISO, debounce, normalizarTexto, impedimentoDeFuncao, empresasDoUsuario } from './utils.js'
import { podeRevisarAutorizacao } from './lancamento.js'
import {
  _PAGE_SIZE, _fimDoArrasto, _mudouEm, _renderMostrandoMudancas, _TERMINAIS, _guardarQuadro, ICO,
  _sincronizarControles, _mudouFiltro, _atualizarResultadoPainel,
} from './pedidos.js'
import {
  _renderKanban, _usaMeusPedidos, _tituloTela, _renderMeusPedidos, _tsMs, _nomeEmpresa, _bindEmptyActions, _renderLista, _tsToISO, _atualizarBulkBar, _preencherModalDuplicar,
} from './pedidos-quadro.js'
import { Q } from './pedidos-estado.js'
import { editorNovoPedido, resetarItensNovoPedido, prepararItensNovoPedido, _resumoAutomatico } from './novo-pedido.js'
import { errosDosItens, erroDaPlaca, resumoDosItens, subtotalDosItens, totalComDesconto, veiculo } from './itens.js'

// ── Validação inline ──────────────────────────────────────────
export function _marcarErroCampo(campo, msg) {
  const grupo = document.querySelector(`[data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.add('invalido')
  let el = grupo.querySelector('.form-error')
  if (!el) {
    el = document.createElement('span')
    el.className = 'form-error'
    el.id = `${campo}-erro`
    grupo.appendChild(el)
  }
  el.textContent = msg
  const input = document.getElementById(campo)
  if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id) }
}

export function _limparErroCampo(campo) {
  const grupo = document.querySelector(`[data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.remove('invalido')
  grupo.querySelector('.form-error')?.remove()
  const input = document.getElementById(campo)
  if (input) { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby') }
}

export function _resetarModalNovoPedido() {
  document.getElementById('form-novo-pedido')?.reset()
  const tg = document.getElementById('np-urgente-toggle')
  tg?.classList.remove('on')
  const wrap = document.getElementById('np-urgente-wrap')
  wrap?.setAttribute('aria-checked', 'false')
  wrap?.classList.remove('on')
  document.querySelectorAll('#np-categorias .chip').forEach(c => {
    c.classList.remove('selected'); c.setAttribute('aria-checked', 'false')
  })
  document.querySelectorAll('#form-novo-pedido [data-campo]').forEach(g => _limparErroCampo(g.dataset.campo))
  const h2 = document.getElementById('np-h2')
  if (h2) h2.textContent = t('novoPedido')
  const sub = document.getElementById('np-sub')
  if (sub) { sub.hidden = true; sub.textContent = '' }
  const btn = document.getElementById('btn-abrir-pedido')
  if (btn) btn.textContent = t('btnAbrirPedido')
  _marcarPrazo(null)
  const mais = document.getElementById('np-mais')
  if (mais) mais.open = false
  // Com uma única empresa disponível, ela já vem escolhida; com várias, a
  // última usada por esta pessoa
  const emp = document.getElementById('np-empresa')
  if (emp && emp.options.length === 2) emp.selectedIndex = 1
  else if (emp) {
    const ultima = _ultimaEmpresa()
    if (ultima && [...emp.options].some(o => o.value === ultima)) emp.value = ultima
  }
  // Itens, resumo, veículo e centro de custo da empresa já escolhida; as
  // sugestões vêm dos pedidos que o quadro tem agora
  prepararItensNovoPedido()
  resetarItensNovoPedido()
}

// Última empresa em que a pessoa abriu pedido (só neste navegador)
export const _chaveUltimaEmpresa = () => `praxis_ultima_empresa_${sessao.usuario?.id || ''}`
export function _ultimaEmpresa() { try { return localStorage.getItem(_chaveUltimaEmpresa()) } catch { return null } }
export function _guardarUltimaEmpresa(id) { try { localStorage.setItem(_chaveUltimaEmpresa(), id) } catch { /* sem armazenamento */ } }

// Botões de prazo: Hoje, Amanhã, Em 7 dias e Sem pressa preenchem o campo de
// data (que continua aceitando outra data); o botão aceso acompanha o campo
export function _marcarPrazo(dias) {
  document.querySelectorAll('#np-prazos .chip').forEach(c => {
    const on = dias != null && c.dataset.prazo === String(dias)
    c.classList.toggle('selected', on)
    c.setAttribute('aria-pressed', String(on))
  })
}

export function _validarNovoPedido(v) {
  const erros = errosDosItens(v.itens).map(([campo, chave]) => [campo, t(chave)])
  if (!v.empresaId) erros.push(['np-empresa', t('campoObrigatorio')])
  const placa = erroDaPlaca(v.placa)
  if (placa) erros.push(['np-placa', t(placa)])
  // O prazo é opcional ("Sem pressa"); se vier, não pode estar no passado
  if (v.data && v.data < hojeISO()) erros.push(['np-data', t('dataNoPassado')])
  return erros
}

export async function _submeterNovoPedido() {
  const ed         = editorNovoPedido()
  _resumoAutomatico()
  const itensCampos = ed?.itens() || []
  const itens      = ed?.preenchidos() || []
  const desconto   = itens.length ? ed.desconto() : null
  const titulo     = document.getElementById('np-titulo')?.value.trim() || resumoDosItens(itens, t)
  const empresaId  = document.getElementById('np-empresa')?.value
  const placaTxt   = document.getElementById('np-placa')?.value || ''
  const veic       = veiculo(placaTxt, document.getElementById('np-km')?.value)
  const data       = document.getElementById('np-data')?.value
  const cc         = document.getElementById('np-cc')?.value || ''
  const obs        = document.getElementById('np-obs')?.value.trim()
  const urgente    = document.getElementById('np-urgente-toggle')?.classList.contains('on')
  const catChip    = document.querySelector('#np-categorias .chip.selected')
  const categoriaId = catChip?.dataset.id || ''
  const subtotal   = subtotalDosItens(itens)

  document.querySelectorAll('#form-novo-pedido [data-campo]').forEach(g => _limparErroCampo(g.dataset.campo))
  const erros = _validarNovoPedido({ itens: itensCampos, empresaId, placa: placaTxt, data, categoriaId })
  if (erros.length) {
    erros.forEach(([campo, msg]) => _marcarErroCampo(campo, msg))
    const primeiro = document.getElementById(erros[0][0])
    const visivel = primeiro?.classList.contains('campo-data-nativo') ? primeiro.nextElementSibling : primeiro
    if (visivel && visivel.focus) visivel.focus({ preventScroll: true })
    document.querySelector(`[data-campo="${erros[0][0]}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    avisoNoFormulario('#modal-novo-pedido', t('erroCamposObrigatorios'))
    return
  }

  if (!exigirConexao()) return
  const btnAbrir = document.getElementById('btn-abrir-pedido')
  if (btnAbrir) btnAbrir.disabled = true
  mostrarSpinner()
  try {
    const contadorRef  = contadorPedidosRef()
    const pedidoRef    = novoPedidoRef()
    await runTransaction(db, async (tx) => {
      const snap  = await tx.get(contadorRef)
      const total = ((snap.exists() ? snap.data().totalPedidos : 0) || 0) + 1
      const numeroPedido = `PRX-${String(total).padStart(4, '0')}`
      tx.set(pedidoRef, {
        ...marcaDemo(),
        titulo,
        descricao:       obs || '',
        empresaId,
        // Os itens (Fase 1). Quantidade e unidade do primeiro ficam também
        // nos campos de antes, que as telas e a exportação antigas leem
        itens,
        quantidade:      itens[0].quantidade,
        unidade:         itens[0].unidade,
        desconto:        subtotal != null ? desconto : null,
        veiculo:         veic,
        dataNecessaria:  data || null,
        // O valor estimado saiu do formulário (16/11/2026); volta só quando
        // os itens têm valor unitário: a soma, menos o desconto
        valorEstimado:   subtotal != null ? totalComDesconto(subtotal, desconto) : null,
        centroCusto:     cc || null,
        categoriaId,
        urgente,
        status:          STATUS.SOLICITADO,
        solicitanteId:   sessao.usuario.id,
        solicitanteNome: sessao.usuario.nome || null,
        compradorId:     null,
        compradorAssumiuEm: null,
        aprovadorIds:    [],
        aprovadoPor:     null,
        aprovadoEm:      null,
        reprovadoPor:    null,
        reprovadoEm:     null,
        motivoReprovacao: null,
        motivoReprovacaoOutros: null,
        canceladoPor:    null,
        canceladoEm:     null,
        motivoCancelamento: null,
        motivoCancelamentoOutros: null,
        cotacaoIndicadaId: null,
        fornecedorId:    null,
        valorFinal:      null,
        condicaoPagamento: null,
        dataCompra:      null,
        dataEntrega:     null,
        numeroPedido,
        criadoEm:        serverTimestamp(),
        atualizadoEm:    serverTimestamp(),
      })
      tx.set(contadorRef, { totalPedidos: total }, { merge: true })
    })

    _guardarUltimaEmpresa(empresaId)
    fecharModal('modal-novo-pedido')
    prxToast(t('pedidoAberto'), 'success', { acoes: [{ rotulo: t('verPedido'), fn: () => navegar('detalhe', { id: pedidoRef.id }) }] })
  } catch (err) {
    prxToast(t('erroAbrirPedido'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btnAbrir) btnAbrir.disabled = false
  }
}

// ── Listener em tempo real ────────────────────────────────────
// Enquanto empresas e categorias carregam (renderPedidos), os pedidos que
// chegam esperam por elas
export function _iniciarListenerPedidos() {
  if (Q.unsubPedidos) Q.unsubPedidos()
  Q.recebeuPedidos = false
  Q.etapaAntes = null
  Q.mudaramAgora = new Set()
  _mudouEm.clear()

  const perfil = sessao.usuario.perfil
  const ref = collection(db, 'pedidos')

  // Quem vê o quê: o supremo, tudo; o solicitante, os pedidos que abriu; os
  // demais, os das empresas que têm
  let porPerfil = []
  if (perfil === PERFIS.SOLICITANTE) {
    porPerfil = [where('solicitanteId', '==', sessao.usuario.id)]
  } else if (perfil !== PERFIS.SUPREMO) {
    const empresas = empresasDoUsuario(sessao.usuario)
    if (!empresas.length) {
      Q.pedidos = []
      ;(Q.esperaAuxiliares || Promise.resolve()).then(() => _renderView())
      return
    }
    // O Firestore aceita até 30 valores num 'in'; acima disso, avisa em vez de
    // cortar em silêncio
    if (empresas.length > 30) console.warn(`Praxis: ${empresas.length} empresas; a lista mostra os pedidos das 30 primeiras.`)
    porPerfil = [where('empresaId', 'in', empresas.slice(0, 30))]
  }
  const nEmpresas = perfil === PERFIS.SUPREMO || perfil === PERFIS.SOLICITANTE ? 1 : Math.min(empresasDoUsuario(sessao.usuario).length, 30)

  // O quadro escuta os pedidos em andamento e só os encerrados mais recentes
  // (pago, reprovado, cancelado): antes ele escutava todos, e cada pedido
  // antigo custava uma leitura a cada abertura. "Ver os encerrados antigos"
  // (Q.verTodos) volta à escuta de tudo nesta visita. O Firestore aceita até
  // 30 combinações de 'in' numa consulta: com muitas empresas, escuta tudo
  const ordem = orderBy('criadoEm', 'desc')
  const emAndamento = Object.values(STATUS).filter(s => !_TERMINAIS.includes(s))
  const divide = !Q.verTodos && nEmpresas * emAndamento.length <= 30
  const consultas = divide
    ? [
        consulta(ref, ...porPerfil, where('status', 'in', emAndamento), ordem),
        consulta(ref, ...porPerfil, where('status', 'in', _TERMINAIS), ordem, limit(_LIMITE_ENCERRADOS)),
      ]
    : [consulta(ref, ...porPerfil, ordem)]

  const aplicar = docs => {
    Q.recebeuPedidos = true
    Q.pedidos = docs.map(d => ({ id: d.id, ...d.data() }))
    _guardarQuadro()
    const antes = Q.etapaAntes
    Q.etapaAntes = new Map(Q.pedidos.map(p => [p.id, p.status]))
    if (antes) {
      const mudaram = Q.pedidos.filter(p => antes.get(p.id) !== p.status)
      // Mudança em massa (a renovação da demo, um cancelamento em lote) não
      // anima: dezenas de cartões deslizando e piscando não mostram nada
      if (mudaram.length <= 3) mudaram.forEach(p => { Q.mudaramAgora.add(p.id); _mudouEm.set(p.id, performance.now()) })
    }
    // Seleção só guarda pedidos que ainda existem
    const ids = new Set(Q.pedidos.map(p => p.id))
    ;[...Q.selecionados].forEach(id => { if (!ids.has(id)) Q.selecionados.delete(id) })
    if (Q.arrastoAtivo) { Q.renderPendente = true; return }
    _renderMostrandoMudancas()
  }

  // As duas escutas viram uma lista só, do mais novo para o mais antigo. Um
  // pedido que acabou de ser pago pode aparecer nas duas por um instante: fica
  // a versão mais nova
  const partes = consultas.map(() => null)
  const juntar = () => {
    if (partes.some(p => p === null)) return null
    Q.encerradosNoLimite = divide && partes[1].length >= _LIMITE_ENCERRADOS
    const porId = new Map()
    for (const d of partes.flat()) {
      const atual = porId.get(d.id)
      if (!atual || _tsMs(d.data().atualizadoEm) >= _tsMs(atual.data().atualizadoEm)) porId.set(d.id, d)
    }
    return [...porId.values()].sort((a, b) => _tsMs(b.data().criadoEm) - _tsMs(a.data().criadoEm))
  }
  const erro = err => {
    // O erro fica na própria área, com o que fazer (um aviso a mais repetiria)
    console.error(err)
    const container = document.getElementById('pedidos-view')
    if (container) {
      container.innerHTML = estadoVazio({
        erro: true, icone: ICO.alerta(22), nivel: 'h2',
        titulo: t('erroCarregarPedidos'),
        texto: t('verificarConexao'),
        acao: `<button class="btn-secondary btn-sm" id="btn-empty-recarregar">${t('recarregar')}</button>`,
      })
      container.querySelector('#btn-empty-recarregar')?.addEventListener('click', () => window.location.reload())
    }
  }
  const escutas = consultas.map((q, i) => onSnapshot(q, snap => {
    partes[i] = snap.docs
    const docs = juntar()
    if (!docs) return
    // Chegou antes de empresas e categorias (renderPedidos): espera por elas
    if (Q.esperaAuxiliares) Q.esperaAuxiliares.then(() => aplicar(docs))
    else aplicar(docs)
  }, erro))
  // Os pedidos que a pessoa já abriu (o selo de comentário novo)
  const uid = sessao.fireUser?.uid
  if (uid) {
    escutas.push(onSnapshot(doc(db, 'lidos', uid), snap => {
      Q.lidos = snap.data()?.pedidos || {}
      if (Q.recebeuPedidos && !Q.arrastoAtivo) _renderView()
    }, () => {}))
  }
  Q.unsubPedidos = () => escutas.forEach(parar => parar())

  registrarLimpador(() => {
    if (Q.unsubPedidos) { Q.unsubPedidos(); Q.unsubPedidos = null }
  })
}

// Encerrados que o quadro escuta (os mais recentes); os demais vêm com "Ver
// os encerrados antigos"
export const _LIMITE_ENCERRADOS = 100
export function _verEncerradosAntigos() {
  Q.verTodos = true
  _iniciarListenerPedidos()
}

// ── Filtragem ─────────────────────────────────────────────────
export function _tsDate(ts) {
  if (!ts) return null
  return ts.toDate ? ts.toDate() : new Date(ts)
}

// Aplica só o filtro rápido — usado também para contar cada um e a "Minha fila"
export function _aplicarPill(lista, filtro) {
  const uid = sessao.usuario.id
  switch (filtro) {
    case 'urgentes':   return lista.filter(p => p.urgente)
    case 'meus':       return lista.filter(p => p.solicitanteId === uid || p.compradorId === uid)
    case 'encerrados': return lista.filter(p => [STATUS.REPROVADO, STATUS.CANCELADO].includes(p.status))
    case 'semana': {
      const hoje = hojeISO()
      const [y, m, d] = hoje.split('-').map(Number)
      const inicioSemana = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay())
      return lista.filter(p => {
        const ts = _tsDate(p.criadoEm)
        return ts ? ts >= inicioSemana : false
      })
    }
    case 'pendentes': {
      const base = _filaDoPerfil(lista, uid)
      const revisar = lista.filter(p => !base.includes(p) && podeRevisarAutorizacao(p, sessao.usuario))
      return [...base, ...revisar]
    }
    default: return lista
  }
}

// O que espera a pessoa, pelo perfil (a "Minha fila" soma as autorizações de
// compra já feita que ela confirma)
export function _filaDoPerfil(lista, uid) {
  const perfil = sessao.usuario.perfil
  const agora  = Date.now()
  const h48    = 48 * 3600000
  if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    return lista.filter(p => {
      if (_TERMINAIS.includes(p.status)) return false
      if (p.urgente) return true
      // Com alçada, o que espera o voto desta pessoa no nível atual
      if (p.status === STATUS.EM_APROVACAO && p.aprovacao && !impedimentoDeFuncao(p, sessao.usuario, 'decidir')) return true
      const ts = _tsDate(p.atualizadoEm)
      return ts && (agora - ts.getTime()) > h48
    })
  }
  // Na fila, só o que a pessoa pode decidir ou pagar (separação de funções)
  if (perfil === PERFIS.APROVADOR) {
    return lista.filter(p => p.status === STATUS.EM_APROVACAO && !impedimentoDeFuncao(p, sessao.usuario, 'decidir'))
  }
  if (perfil === PERFIS.COMPRADOR) {
    return lista.filter(p =>
      (p.status === STATUS.SOLICITADO && !p.compradorId) ||
      (p.status === STATUS.AG_COTACAO && p.compradorId === uid)
    )
  }
  if (perfil === PERFIS.FINANCEIRO) {
    return lista.filter(p => p.status === STATUS.ENTREGUE && !impedimentoDeFuncao(p, sessao.usuario, 'pagar'))
  }
  // solicitante: seus pedidos não encerrados
  return lista.filter(p => p.solicitanteId === uid && !_TERMINAIS.includes(p.status))
}

export function _valorPedido(p) {
  return p.valorFinal ?? p.valorEstimado ?? null
}

// Filtros do painel e busca (tudo menos o filtro rápido)
export function _aplicarExtras(origem) {
  let lista = [...origem]
  if (Q.filtroCategoria) lista = lista.filter(p => p.categoriaId === Q.filtroCategoria)
  if (Q.filtroEmpresa)   lista = lista.filter(p => p.empresaId   === Q.filtroEmpresa)
  if (Q.filtroComprador) lista = lista.filter(p => p.compradorId === Q.filtroComprador)

  if (Q.filtroDataIni || Q.filtroDataFim) {
    lista = lista.filter(p => {
      const ts = _tsDate(p.criadoEm)
      if (!ts) return true
      const iso = _tsToISO(ts)
      if (Q.filtroDataIni && iso < Q.filtroDataIni) return false
      if (Q.filtroDataFim && iso > Q.filtroDataFim) return false
      return true
    })
  }

  if (Q.termoBusca.trim()) {
    const termo = normalizarTexto(Q.termoBusca.trim())
    lista = lista.filter(p =>
      normalizarTexto(p.titulo || '').includes(termo) ||
      normalizarTexto(p.descricao || '').includes(termo) ||
      normalizarTexto(p.numeroPedido || '').includes(termo) ||
      normalizarTexto(_nomeEmpresa(p.empresaId)).includes(termo)
    )
  }
  return lista
}

export function _ordenarLista(lista) {
  if (Q.viewMode !== 'lista') return lista
  const dir = Q.ordemDesc ? -1 : 1
  return lista.sort((a, b) => {
    let va, vb
    switch (Q.ordemCampo) {
      case 'titulo':
        va = normalizarTexto(a.titulo || ''); vb = normalizarTexto(b.titulo || ''); break
      case 'valorEstimado':
        va = _valorPedido(a) || 0; vb = _valorPedido(b) || 0; break
      case 'status':
        va = _ordemStatus(a.status); vb = _ordemStatus(b.status); break
      case 'prazo':
        // Encerrados e sem prazo vão para o fim
        va = (!_TERMINAIS.includes(a.status) && a.dataNecessaria) || '9999'
        vb = (!_TERMINAIS.includes(b.status) && b.dataNecessaria) || '9999'
        break
      default:
        va = _tsMs(a.criadoEm); vb = _tsMs(b.criadoEm)
    }
    if (va < vb) return -dir
    if (va > vb) return dir
    return 0
  })
}

export function _filtrarPedidos() {
  return _ordenarLista(_aplicarPill(_aplicarExtras(Q.pedidos), Q.filtroAtivo))
}

// Ordena status pela etapa do fluxo, não pelo nome
export function _ordemStatus(status) {
  const ordem = [...KANBAN_COLUNAS, STATUS.REPROVADO, STATUS.CANCELADO]
  const i = ordem.indexOf(status)
  return i === -1 ? 99 : i
}

// Etapa que concentra a fila do usuário (numeral em terracota no quadro)
export function _statusDaFila() {
  const fila = _aplicarPill(Q.pedidos, 'pendentes')
  if (!fila.length) return null
  const cont = {}
  fila.forEach(p => { cont[p.status] = (cont[p.status] || 0) + 1 })
  let melhor = null
  KANBAN_COLUNAS.forEach(st => { if ((cont[st] || 0) > (cont[melhor] || 0)) melhor = st })
  return melhor
}

// ── Cabeçalho: título, resumo e contadores ────────────────────
export const _moedaCompacta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })

export function _atualizarContadores(base) {
  // Lateral: totais sem os filtros da tela
  const fila = _aplicarPill(Q.pedidos, 'pendentes').length
  atualizarLateral({ contagens: { pedidos: Q.pedidos.length, fila } })
  // Fileira: quanto cada filtro rápido mostraria com a busca e o painel atuais
  document.querySelectorAll('#filter-pills [data-n-filtro]').forEach(el => {
    el.textContent = String(_aplicarPill(base, el.dataset.nFiltro).length)
  })
}

export function _descricaoFila() {
  const perfil = sessao.usuario.perfil
  if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) return t('filaDescGestor')
  if (perfil === PERFIS.APROVADOR) return t('filaDescAprovador')
  if (perfil === PERFIS.COMPRADOR) return t('filaDescComprador')
  if (perfil === PERFIS.FINANCEIRO) return t('filaDescFinanceiro')
  return t('filaDescSolicitante')
}

export function _atualizarTitulo() {
  const h1 = document.getElementById('pedidos-titulo')
  const titulo = _tituloTela()
  if (h1 && h1.textContent !== titulo) h1.textContent = titulo
}

export function _atualizarResumo(lista) {
  const el = document.getElementById('pedidos-resumo')
  if (!el) return
  const n = lista.length
  const abertos = lista.filter(p => !_TERMINAIS.includes(p.status))
  const urgentes = abertos.filter(p => p.urgente).length
  const valorAberto = abertos.reduce((s, p) => s + (Number(_valorPedido(p)) || 0), 0)
  const partes = [n === 0 ? t('resumoNenhum') : `${n} ${n === 1 ? t('pedidoSing') : t('pedidosPlural')}`]
  if (urgentes) partes.push(`${urgentes} ${urgentes === 1 ? t('urgenteSing') : t('urgentesPlural')}`)
  if (valorAberto > 0) partes.push(`<span title="${formatCurrency(valorAberto)}">${_moedaCompacta.format(valorAberto)}</span> ${t('emAberto')}`)
  let extra = ''
  if (Q.filtroAtivo === 'pendentes') extra = _descricaoFila()
  else if (Q.filtroAtivo === 'encerrados') extra = t('resumoEncerrados')
  // Procurando um pedido antigo (encerrados, busca ou datas) com só os
  // encerrados recentes na escuta: o aviso e o botão que traz os demais
  const procurandoAntigo = Q.filtroAtivo === 'encerrados' || Q.termoBusca || Q.filtroDataIni || Q.filtroDataFim
  if (Q.encerradosNoLimite && !Q.verTodos && procurandoAntigo) {
    extra = `${t('encerradosRecentes').replace('{n}', _LIMITE_ENCERRADOS)} <button type="button" class="cfg-link" id="btn-encerrados-antigos">${t('verEncerradosAntigos')}</button>`
  }
  el.innerHTML = `${partes.join(', ')}.${extra ? ` <span class="resumo-extra">${extra}</span>` : ''}`
  el.querySelector('#btn-encerrados-antigos')?.addEventListener('click', _verEncerradosAntigos)
}

// ── Render view ───────────────────────────────────────────────
export function _renderView() {
  const container = document.getElementById('pedidos-view')
  if (!container) return
  const base = _aplicarExtras(Q.pedidos)
  const lista = _ordenarLista(_aplicarPill(base, Q.filtroAtivo))
  _atualizarTitulo()
  _atualizarResumo(lista)
  _atualizarContadores(base)
  _atualizarResultadoPainel(lista.length)

  if (Q.viewMode === 'kanban') {
    Q.selecionados.clear()
    _atualizarBulkBar()
    const scrollAnterior = container.querySelector('.kanban-board')?.scrollLeft || 0
    // A solicitante vê os pedidos dela como lista com o caminho
    container.innerHTML = _usaMeusPedidos() ? _renderMeusPedidos(lista) : _renderKanban(lista)
    container.querySelectorAll('.kcard').forEach(card => {
      card.addEventListener('click', () => navegar('detalhe', { id: card.dataset.id }))
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); navegar('detalhe', { id: card.dataset.id }) }
        // Tecla de menu (ou Shift+F10): "Mover para…", também com os atalhos desligados
        else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); _moverPorTeclado(card.dataset.id) }
      })
    })
    // "Comprar de novo" (Meus pedidos): o formulário já preenchido com o pedido
    container.querySelectorAll('[data-de-novo]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = Q.pedidos.find(x => x.id === btn.dataset.deNovo)
        if (!p) return
        _resetarModalNovoPedido()
        _preencherModalDuplicar(p, { deNovo: true })
        abrirModal('modal-novo-pedido')
      })
    })
    container.querySelectorAll('[data-ver-mais]').forEach(btn => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.verMais
        if (Q.colunasExpandidas.has(st)) Q.colunasExpandidas.delete(st)
        else Q.colunasExpandidas.add(st)
        Q.etapaMovel = st
        _renderView()
      })
    })
    _bindEmptyActions(container)
    _bindRegua(container)
    _bindDragDrop(container)
    _bindBoardScroll(container, scrollAnterior)
    return
  }

  const totalFiltrada = lista.length
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrada / _PAGE_SIZE))
  if (Q.paginaAtual >= totalPaginas) Q.paginaAtual = Math.max(0, totalPaginas - 1)
  const inicio = Q.paginaAtual * _PAGE_SIZE
  const listaPaginada = lista.slice(inicio, inicio + _PAGE_SIZE)

  container.innerHTML = _renderLista(listaPaginada, totalFiltrada, totalPaginas, inicio)
  _bindEmptyActions(container)

  container.querySelectorAll('tbody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => navegar('detalhe', { id: row.dataset.id }))
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target === row) { e.preventDefault(); navegar('detalhe', { id: row.dataset.id }) }
      else if (e.target === row && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); _moverPorTeclado(row.dataset.id) }
    })
  })
  container.querySelectorAll('th.sortable[data-campo]').forEach(th => {
    const ordenar = () => {
      const campo = th.dataset.campo
      if (Q.ordemCampo === campo) { Q.ordemDesc = !Q.ordemDesc } else { Q.ordemCampo = campo; Q.ordemDesc = !['titulo', 'prazo', 'status'].includes(campo) }
      _sincronizarControles()
      _mudouFiltro()
    }
    th.addEventListener('click', ordenar)
    th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar() } })
  })

  // Seleção múltipla
  const sincronizarCabecalho = () => {
    const todos = [...container.querySelectorAll('.bulk-cb')]
    const cbAll = container.querySelector('#cb-select-all')
    if (!cbAll) return
    const marcados = todos.filter(c => c.checked).length
    cbAll.checked = todos.length > 0 && marcados === todos.length
    cbAll.indeterminate = marcados > 0 && marcados < todos.length
  }
  container.querySelectorAll('td.bulk-cb-cell').forEach(td => {
    td.addEventListener('click', e => {
      e.stopPropagation()
      // Clique na célula (fora do checkbox) também marca — alvo de toque maior
      if (e.target.tagName !== 'INPUT') {
        const cb = td.querySelector('.bulk-cb')
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')) }
      }
    })
  })
  container.querySelectorAll('.bulk-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) Q.selecionados.add(cb.dataset.id)
      else Q.selecionados.delete(cb.dataset.id)
      cb.closest('tr')?.classList.toggle('selecionada', cb.checked)
      _atualizarBulkBar()
      sincronizarCabecalho()
    })
  })
  const cbAll = container.querySelector('#cb-select-all')
  cbAll?.addEventListener('change', () => {
    container.querySelectorAll('.bulk-cb').forEach(cb => {
      cb.checked = cbAll.checked
      cb.closest('tr')?.classList.toggle('selecionada', cbAll.checked)
      if (cbAll.checked) Q.selecionados.add(cb.dataset.id)
      else Q.selecionados.delete(cb.dataset.id)
    })
    _atualizarBulkBar()
  })
  sincronizarCabecalho()
  _atualizarBulkBar()

  container.querySelector('#btn-pagina-ant')?.addEventListener('click', () => {
    if (Q.paginaAtual > 0) { Q.paginaAtual--; _renderView(); _rolarParaLista() }
  })
  container.querySelector('#btn-pagina-prox')?.addEventListener('click', () => {
    if (Q.paginaAtual < totalPaginas - 1) { Q.paginaAtual++; _renderView(); _rolarParaLista() }
  })
}

export function _rolarParaLista() {
  const alvo = document.getElementById('pedidos-view')
  if (!alvo) return
  const topo = alvo.getBoundingClientRect().top + window.scrollY - 80
  if (window.scrollY > topo) window.scrollTo({ top: Math.max(0, topo), behavior: 'smooth' })
}

// ── Quadro: rolagem horizontal com indicação (telas estreitas) ─
export function _bindBoardScroll(container, scrollInicial = 0) {
  const wrap  = container.querySelector('.kanban-wrap')
  const board = wrap?.querySelector('.kanban-board')
  if (!wrap || !board) return
  const atualizar = () => {
    const max = board.scrollWidth - board.clientWidth
    wrap.classList.toggle('tem-esq', board.scrollLeft > 4)
    wrap.classList.toggle('tem-dir', board.scrollLeft < max - 4)
  }
  if (scrollInicial) board.scrollLeft = scrollInicial
  board.addEventListener('scroll', atualizar, { passive: true })
  const passo = () => {
    const col = board.querySelector('.kanban-col')
    const w = col ? col.getBoundingClientRect().width + 10 : 160
    return Math.max(w, Math.floor(board.clientWidth / w) * w - w)
  }
  wrap.querySelector('[data-board-ant]')?.addEventListener('click', () => board.scrollBy({ left: -passo(), behavior: 'smooth' }))
  wrap.querySelector('[data-board-prox]')?.addEventListener('click', () => board.scrollBy({ left: passo(), behavior: 'smooth' }))
  atualizar()
  if (!Q.resizeLigado) {
    Q.resizeLigado = true
    const onResize = debounce(() => {
      const w = document.querySelector('#pedidos-view .kanban-wrap')
      const b = w?.querySelector('.kanban-board')
      if (!w || !b) return
      const max = b.scrollWidth - b.clientWidth
      w.classList.toggle('tem-esq', b.scrollLeft > 4)
      w.classList.toggle('tem-dir', b.scrollLeft < max - 4)
    }, 120)
    window.addEventListener('resize', onResize)
    registrarLimpador(() => { window.removeEventListener('resize', onResize); Q.resizeLigado = false })
  }
}

// ── Celular: régua de etapas ──────────────────────────────────
// Os sete numerais ficam numa régua tocável; a etapa escolhida aparece
// sozinha, em lista vertical. Deslizar para os lados troca de etapa.
export function _selecionarEtapa(status, { focar = false, rolar = false } = {}) {
  const view = document.getElementById('pedidos-view')
  if (!view || !status) return
  Q.etapaMovel = status
  view.querySelectorAll('.regua-item[data-etapa]').forEach(b => {
    const on = b.dataset.etapa === status
    b.classList.toggle('ativa', on)
    b.setAttribute('aria-selected', on ? 'true' : 'false')
    b.tabIndex = on ? 0 : -1
    if (on && focar) b.focus({ preventScroll: true })
  })
  view.querySelectorAll('.kanban-col[data-status]').forEach(c => c.classList.toggle('atual', c.dataset.status === status))
  if (rolar) {
    const regua = view.querySelector('.regua')
    const wrap = view.querySelector('.kanban-wrap')
    if (regua && wrap) {
      const fixo = parseFloat(getComputedStyle(regua).top) || 0
      const topoWrap = wrap.getBoundingClientRect().top + window.scrollY - fixo
      if (window.scrollY > topoWrap) window.scrollTo({ top: topoWrap })
    }
  }
}

export function _bindRegua(container) {
  const regua = container.querySelector('.regua[role="tablist"]')
  if (!regua) return
  const itens = () => [...regua.querySelectorAll('.regua-item[data-etapa]')]
  regua.addEventListener('click', e => {
    const b = e.target.closest('.regua-item[data-etapa]')
    if (b) _selecionarEtapa(b.dataset.etapa, { rolar: true })
  })
  regua.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const lista = itens()
    const i = lista.findIndex(b => b.dataset.etapa === Q.etapaMovel)
    let j = i
    if (e.key === 'ArrowLeft') j = Math.max(0, i - 1)
    if (e.key === 'ArrowRight') j = Math.min(lista.length - 1, i + 1)
    if (e.key === 'Home') j = 0
    if (e.key === 'End') j = lista.length - 1
    e.preventDefault()
    _selecionarEtapa(lista[j].dataset.etapa, { focar: true })
  })

  // Deslizar a lista para os lados troca de etapa
  const board = container.querySelector('.kanban-board')
  let x0 = 0, y0 = 0, ativo = false
  board?.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { ativo = false; return }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; ativo = true
  }, { passive: true })
  board?.addEventListener('touchend', e => {
    if (!ativo || Q.arrastandoToque) { ativo = false; return }
    ativo = false
    if (!regua.offsetParent) return // só no celular, com a régua visível
    const dx = e.changedTouches[0].clientX - x0
    const dy = e.changedTouches[0].clientY - y0
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return
    const lista = itens()
    const i = lista.findIndex(b => b.dataset.etapa === Q.etapaMovel)
    const j = dx < 0 ? i + 1 : i - 1
    if (j >= 0 && j < lista.length) _selecionarEtapa(lista[j].dataset.etapa, { rolar: true })
  }, { passive: true })
}

// ── Arrastar e soltar ─────────────────────────────────────────
// Só passos de uma etapa que não exigem dados extras. Indicar cotação (Em cotação → Em aprovação)
// e registrar a compra (Aprovado → Comprado) pedem informações e ficam na tela do pedido.
export function _transicoesDragPermitidas(perfil) {
  if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) {
    return {
      [STATUS.SOLICITADO]:   [STATUS.AG_COTACAO],
      [STATUS.EM_APROVACAO]: [STATUS.APROVADO],
      [STATUS.COMPRADO]:     [STATUS.ENTREGUE],
      [STATUS.ENTREGUE]:     [STATUS.PAGO],
    }
  }
  if (perfil === PERFIS.APROVADOR) return {
    [STATUS.EM_APROVACAO]: [STATUS.APROVADO],
  }
  if (perfil === PERFIS.COMPRADOR) return {
    [STATUS.SOLICITADO]: [STATUS.AG_COTACAO],
    [STATUS.COMPRADO]:   [STATUS.ENTREGUE],
  }
  if (perfil === PERFIS.FINANCEIRO) return {
    [STATUS.ENTREGUE]: [STATUS.PAGO],
  }
  return {}
}

// "Mover para…" pelo teclado: as mesmas etapas que o arrasto permite a este
// perfil, e as mesmas travas (_tentarMoverPedido). O foco volta ao cartão
export async function _moverPorTeclado(id) {
  const p = Q.pedidos.find(x => x.id === id)
  if (!p) return
  const destinos = _transicoesDragPermitidas(sessao.usuario.perfil)[p.status] || []
  if (!destinos.length) { prxToast(t('quadroSemMover'), 'info'); return }
  const escolha = await prxEscolha(
    t('moverParaTitulo', { num: p.numeroPedido || '' }),
    t('moverParaTexto', { etapa: STATUS_LABEL[p.status] }),
    destinos.map(st => ({ valor: st, rotulo: STATUS_LABEL[st] })))
  if (escolha) await _tentarMoverPedido(p.id, p.status, escolha)
  setTimeout(() => document.querySelector(`#pedidos-view [data-id="${CSS.escape(id)}"]`)?.focus(), escolha ? 700 : 0)
}

// J e K: próximo e anterior entre os cartões (ou as linhas da lista), na
// ordem da tela
export function _andarEntreItens(passo) {
  const itens = [...document.querySelectorAll('#pedidos-view .kcard, #pedidos-view tbody tr[data-id]')].filter(el => el.offsetParent)
  if (!itens.length) return
  const atual = itens.indexOf(document.activeElement)
  const prox = atual < 0 ? (passo > 0 ? 0 : itens.length - 1) : Math.min(itens.length - 1, Math.max(0, atual + passo))
  itens[prox].focus()
  itens[prox].scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export async function _tentarMoverPedido(id, statusOrigem, statusDestino) {
  const perfil   = sessao.usuario.perfil
  const permitidos = _transicoesDragPermitidas(perfil)
  const destinos   = permitidos[statusOrigem] || []

  if (statusOrigem === statusDestino) return
  if (!destinos.includes(statusDestino)) {
    prxToast(t('quadroNaoMove', { de: STATUS_LABEL[statusOrigem], para: STATUS_LABEL[statusDestino] }), 'error')
    return
  }
  // As mesmas travas das regras: quem abriu ou cotou não aprova o pedido, quem
  // aprovou não registra o pagamento, e o recebimento é do comprador
  // responsável (ou de um gestor)
  const p = Q.pedidos.find(x => x.id === id)
  const uid = sessao.usuario.id
  const impedeDecidir = p && statusDestino === STATUS.APROVADO && impedimentoDeFuncao(p, sessao.usuario, 'decidir')
  if (impedeDecidir) {
    prxToast({ abriu: t('semDecidirProprio'), cotou: t('semDecidirCotou'), votou: t('semDecidirVotou') }[impedeDecidir] || t('semDecidirNivel'), 'error')
    return
  }
  // Com alçada, a aprovação é por nível, com o voto registrado: no detalhe
  if (p?.aprovacao && statusDestino === STATUS.APROVADO) {
    prxToast(t('alcadaNoDetalhe'), 'info', { acoes: [{ rotulo: t('verPedido'), fn: () => navegar('detalhe', { id }) }] })
    return
  }
  if (p && statusDestino === STATUS.PAGO && impedimentoDeFuncao(p, sessao.usuario, 'pagar')) {
    prxToast(t('semPagarAprovou'), 'error')
    return
  }
  if (p && statusDestino === STATUS.ENTREGUE && perfil === PERFIS.COMPRADOR && p.compradorId !== uid && p.solicitanteId !== uid) {
    prxToast(t('soCompradorRecebe'), 'error')
    return
  }

  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const campos = { status: statusDestino, atualizadoEm: serverTimestamp() }
    if (statusDestino === STATUS.AG_COTACAO) {
      campos.compradorId       = sessao.usuario.id
      campos.compradorNome     = sessao.usuario.nome || null
      campos.compradorAssumiuEm = serverTimestamp()
    }
    if (statusDestino === STATUS.APROVADO && statusOrigem === STATUS.EM_APROVACAO) {
      campos.aprovadoPor = sessao.usuario.id
      campos.aprovadoEm  = serverTimestamp()
    }
    // Status e histórico no mesmo lote: um não grava sem o outro
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', id), campos)
    lote.set(doc(collection(db, 'pedidos', id, 'historico')), {
      status:    statusDestino,
      autorId:   sessao.usuario.id,
      autorNome: sessao.usuario.nome || '',
      nota:      null,
      criadoEm:  serverTimestamp(),
    })
    await lote.commit()
    prxToast(t('quadroMovido', { etapa: STATUS_LABEL[statusDestino] }), 'success')
  } catch (err) {
    console.warn('Mover pelo quadro:', err)
    prxToast(t('quadroErroMover'), 'error')
  } finally {
    esconderSpinner()
  }
}

// Zonas de soltura: a coluna inteira (computador) e os numerais da régua (celular)
export function _bindDragDrop(container) {
  const permitidos = _transicoesDragPermitidas(sessao.usuario.perfil)
  const podeSoltar = (origem, destino) => !!origem && destino !== origem && (permitidos[origem] || []).includes(destino)
  const zonas = () => container.querySelectorAll('[data-drop-status]')
  const marcarDestinos = origem => {
    container.classList.add('arrastando')
    zonas().forEach(z => {
      z.classList.toggle('drop-ok', podeSoltar(origem, z.dataset.dropStatus))
      z.classList.toggle('drop-origem', z.dataset.dropStatus === origem)
    })
  }
  const limpar = () => {
    container.classList.remove('arrastando')
    zonas().forEach(z => z.classList.remove('drop-over', 'drop-ok', 'drop-origem'))
  }

  // ── HTML5 ──
  let dragId = null
  let dragStatus = null
  container.querySelectorAll('.kcard[draggable="true"]').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId     = card.dataset.id
      dragStatus = card.closest('.kanban-col')?.dataset.status
      card.classList.add('kcard-dragging')
      Q.arrastoAtivo = true
      marcarDestinos(dragStatus)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', dragId)
    })
    card.addEventListener('dragend', () => {
      card.classList.remove('kcard-dragging')
      dragId = null; dragStatus = null
      limpar()
      _fimDoArrasto()
    })
  })
  zonas().forEach(zone => {
    zone.addEventListener('dragover', e => {
      if (!dragId) return
      const ok = podeSoltar(dragStatus, zone.dataset.dropStatus)
      if (!ok) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      zone.classList.add('drop-over')
    })
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-over')
    })
    zone.addEventListener('drop', e => {
      e.preventDefault()
      zone.classList.remove('drop-over')
      if (dragId) _tentarMoverPedido(dragId, dragStatus, zone.dataset.dropStatus)
    })
  })

  // ── Toque: segurar 280 ms e arrastar até um numeral da régua ──
  let ghost = null
  let timer = null
  let tId = null
  let tStatus = null
  let x0 = 0, y0 = 0

  container.querySelectorAll('.kcard[draggable="true"]').forEach(card => {
    card.addEventListener('touchstart', e => {
      const toque = e.touches[0]
      x0 = toque.clientX; y0 = toque.clientY
      tId = card.dataset.id
      tStatus = card.closest('.kanban-col')?.dataset.status
      timer = setTimeout(() => {
        timer = null
        Q.arrastandoToque = true
        Q.arrastoAtivo = true
        card.classList.add('kcard-drag-active')
        marcarDestinos(tStatus)
        ghost = card.cloneNode(true)
        ghost.classList.add('kcard-ghost')
        Object.assign(ghost.style, {
          position: 'fixed', zIndex: 'var(--z-dica)', pointerEvents: 'none',
          width: card.offsetWidth + 'px',
          left: (toque.clientX - card.offsetWidth / 2) + 'px',
          top:  (toque.clientY - 20) + 'px',
        })
        document.body.appendChild(ghost)
      }, 280)
    }, { passive: true })

    card.addEventListener('touchmove', e => {
      const toque = e.touches[0]
      // Mexeu antes do tempo: é rolagem, não arrasto
      if (timer && (Math.abs(toque.clientX - x0) > 8 || Math.abs(toque.clientY - y0) > 8)) {
        clearTimeout(timer); timer = null; tId = null
        return
      }
      if (!ghost) return
      ghost.style.left = (toque.clientX - ghost.offsetWidth / 2) + 'px'
      ghost.style.top  = (toque.clientY - 20) + 'px'
      ghost.style.display = 'none'
      const el = document.elementFromPoint(toque.clientX, toque.clientY)
      ghost.style.display = ''
      zonas().forEach(z => z.classList.remove('drop-over'))
      const zona = el?.closest('[data-drop-status]')
      if (zona && podeSoltar(tStatus, zona.dataset.dropStatus)) zona.classList.add('drop-over')
    }, { passive: true })

    const terminar = e => {
      clearTimeout(timer); timer = null
      card.classList.remove('kcard-drag-active')
      const tinhaGhost = !!ghost
      if (ghost) { ghost.remove(); ghost = null }
      limpar()
      setTimeout(() => { Q.arrastandoToque = false }, 0)
      if (!tinhaGhost || !tId || !tStatus || e.type === 'touchcancel') { tId = null; tStatus = null; if (tinhaGhost) _fimDoArrasto(); return }
      const toque = e.changedTouches[0]
      const zona = document.elementFromPoint(toque.clientX, toque.clientY)?.closest('[data-drop-status]')
      if (zona) _tentarMoverPedido(tId, tStatus, zona.dataset.dropStatus)
      tId = null; tStatus = null
      _fimDoArrasto()
    }
    card.addEventListener('touchend', terminar)
    card.addEventListener('touchcancel', terminar)
  })
}
