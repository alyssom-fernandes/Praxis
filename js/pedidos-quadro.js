// Tela de pedidos: o quadro e a lista, os estados vazios, empresas, categorias
// e usuários, as visões salvas e as ações em massa (ver js/pedidos.js).
import { db, collection, doc, serverTimestamp, writeBatch, consulta, consultaUsuarios, lerRapido } from './firebase.js'
import { sessao, chaveLido } from './estado.js'
import {
  prxToast, prxConfirm, estadoVazio, mostrarSpinner, esconderSpinner, abrirModal, fecharModal,
  exigirConexao, estaOnline,
} from './ui.js'
import {
  STATUS, STATUS_LABEL, CATEGORIA_ETAPA, PERFIS, KANBAN_COLUNAS, CATEGORIAS_PADRAO, UNIDADES,
  MOTIVOS_CANCELAMENTO, MOTIVO_OUTROS, rotuloMotivo, corCategoria, t,
} from './constants.js'
import {
  formatCurrency, formatDate, dataAbsoluta, gerarIniciais, hojeISO, esc, empresasDoUsuario,
  csvNumero, baixarCSV,
} from './utils.js'
import {
  _LANE_LIMIT, _VIEWS_MAX, _mudouEm, _nomeTransicao, ICO, _FILTROS_PILL, _rotuloFiltro,
  _sincronizarControles, _sincronizarLateral, _limparTodosFiltros,
} from './pedidos.js'
import {
  _marcarErroCampo, _limparErroCampo, _valorPedido, _filtrarPedidos, _statusDaFila, _moedaCompacta,
  _renderView, _transicoesDragPermitidas,
} from './pedidos-fluxo.js'
import { Q } from './pedidos-estado.js'

// ── Quadro ────────────────────────────────────────────────────
export function _renderKanban(lista) {
  if (!lista.length) return _renderEmptyState(_tipoVazio())

  const encerrados = Q.filtroAtivo === 'encerrados'
  const colunas = encerrados ? [STATUS.REPROVADO, STATUS.CANCELADO] : KANBAN_COLUNAS
  const statusFila = encerrados ? null : _statusDaFila()
  const porEtapa = {}
  colunas.forEach(st => { porEtapa[st] = [] })
  lista.forEach(p => { if (porEtapa[p.status]) porEtapa[p.status].push(p) })

  // Celular: etapa mostrada — a escolhida; senão a da fila; senão a primeira com pedidos
  let atual = colunas.includes(Q.etapaMovel) ? Q.etapaMovel : null
  if (!atual) atual = (statusFila && porEtapa[statusFila]?.length) ? statusFila : (colunas.find(st => porEtapa[st].length) || colunas[0])
  Q.etapaMovel = atual

  const regua = `
    <div class="regua" role="tablist" aria-label="${t('etapas')}" data-estilo="--cols:${colunas.length}">
      ${colunas.map(st => {
        const n = porEtapa[st].length
        const sel = st === atual
        const classes = ['regua-etapa', 'regua-item', sel ? 'ativa' : '', st === statusFila ? 'eh-fila' : '', n === 0 ? 'zero' : ''].filter(Boolean).join(' ')
        const nome = STATUS_LABEL[st]
        return `<button type="button" role="tab" class="${classes}" id="regua-${st}" data-etapa="${st}" data-drop-status="${st}"
          aria-selected="${sel}" aria-controls="coluna-${st}" tabindex="${sel ? 0 : -1}" aria-label="${esc(STATUS_LABEL[st])}: ${n}">
          <span class="regua-n" aria-hidden="true">${n}</span><span class="regua-nome" aria-hidden="true">${esc(nome)}</span>
        </button>`
      }).join('')}
    </div>`

  const cols = colunas.map(status => {
    // Urgentes primeiro; dentro de cada grupo mantém a ordem (mais recentes antes)
    const cards = porEtapa[status]
      .map((p, i) => [p, i])
      .sort((a, b) => (b[0].urgente ? 1 : 0) - (a[0].urgente ? 1 : 0) || a[1] - b[1])
      .map(([p]) => p)
    // Recolhe só quando sobram pelo menos 2 (esconder 1 cartão atrás de um botão não compensa)
    const recolhe   = cards.length > _LANE_LIMIT + 1
    const expandida = Q.colunasExpandidas.has(status)
    const visiveis  = (expandida || !recolhe) ? cards : cards.slice(0, _LANE_LIMIT)
    const restantes = cards.length - visiveis.length
    const soma = cards.reduce((s, p) => s + (Number(_valorPedido(p)) || 0), 0)
    const label = STATUS_LABEL[status]
    const ehFila = status === statusFila

    let rodape = ''
    if (restantes > 0) {
      rodape = `<button type="button" class="kanban-ver-mais" data-ver-mais="${status}">${t('verMais')} <span class="numeral">${restantes}</span></button>`
    } else if (expandida && recolhe) {
      rodape = `<button type="button" class="kanban-ver-mais" data-ver-mais="${status}">${t('verMenos')}</button>`
    }

    return `
      <section class="kanban-col${ehFila ? ' eh-fila' : ''}${status === atual ? ' atual' : ''}${!cards.length && !encerrados ? ' recolhida' : ''}" id="coluna-${status}" data-status="${status}" data-drop-status="${status}" aria-labelledby="etapa-${status}">
        <header class="kanban-col-header"${ehFila ? ` title="${t('etapaDaFila')}"` : ''}>
          <!-- O numeral é a quantidade de pedidos na etapa (sem zero à esquerda,
               para não ler como o número da etapa, que vai de 01 a 07 no detalhe) -->
          <span class="etapa-topo">
            <span class="etapa-n${cards.length ? '' : ' zero'}" aria-hidden="true" title="${cards.length} ${cards.length === 1 ? t('pedidoSing') : t('pedidosPlural')} ${t('nestaEtapa')}">${cards.length}</span>
            ${ehFila ? `<span class="etapa-fila" aria-hidden="true">${t('etapaFilaCurto')}</span>` : ''}
          </span>
          <h2 class="etapa-nome" id="etapa-${status}">${label}<span class="sr-only">: ${cards.length} ${cards.length === 1 ? t('pedidoSing') : t('pedidosPlural')}${ehFila ? `. ${t('etapaDaFila')}` : ''}</span></h2>
          <span class="etapa-soma">${soma > 0 ? `<span title="${formatCurrency(soma)}">${_moedaCompacta.format(soma)}</span>` : '—'}</span>
        </header>
        <div class="kanban-cards" data-status="${status}">
          ${visiveis.length ? visiveis.map(_renderKcard).join('') : `<div class="kanban-vazio">${t('semPedidosColuna')}</div>`}
          ${rodape}
        </div>
      </section>
    `
  }).join('')

  // No computador, a etapa sem pedidos vira uma faixa estreita (o numeral e o
  // nome na vertical) e a largura que sobra vai para as colunas com cartões
  const modelo = colunas.map(st => (porEtapa[st].length || encerrados ? 'minmax(128px, 1fr)' : 'var(--col-recolhida)')).join(' ')
  return `
    <div class="kanban-wrap${encerrados ? ' kanban-poucas' : ''}">
      ${regua}
      <button type="button" class="kanban-nav kanban-nav-ant" data-board-ant aria-label="${t('colunasAnteriores')}" title="${t('colunasAnteriores')}">${ICO.setaEsq(16)}</button>
      <div class="kanban-board" data-estilo="--cols:${colunas.length};--modelo:${modelo}">${cols}</div>
      <button type="button" class="kanban-nav kanban-nav-prox" data-board-prox aria-label="${t('proximasColunas')}" title="${t('proximasColunas')}">${ICO.setaDir(16)}</button>
    </div>`
}

export function _tsMs(ts) {
  if (!ts) return 0
  return ts.toMillis ? ts.toMillis() : (ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime())
}

export function _nomeEmpresa(id) {
  if (!id) return ''
  const e = Q.empresasTodas.find(x => x.id === id) || Q.empresas.find(x => x.id === id)
  return e?.nome || ''
}

// Quem está com o pedido: o comprador que assumiu (nome do cadastro, ou o
// gravado no pedido para quem não lê a lista de usuários)
export function _nomeComprador(p) {
  if (!p.compradorId) return ''
  return Q.usuarios.find(x => x.id === p.compradorId)?.nome
    || (p.compradorId === sessao.usuario.id ? sessao.usuario.nome : '')
    || p.compradorNome || ''
}

export function _nomeSolicitante(p) {
  const u = Q.usuarios.find(x => x.id === p.solicitanteId)
  if (u?.nome) return u.nome
  if (p.solicitanteId && p.solicitanteId === sessao.usuario.id) return sessao.usuario.nome || ''
  return p.solicitanteNome || ''
}

// Data (texto ISO ou Timestamp) → aaaa-mm-dd
export function _isoDe(v) {
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  return _tsToISO(v)
}
export function _diasEntre(isoA, isoB) {
  return Math.round((new Date(isoB + 'T00:00:00') - new Date(isoA + 'T00:00:00')) / 86400000)
}
// Prazo em texto, como no quadro aprovado: "Falta 1 dia", "Faltam 22 dias",
// "Atrasado 8 dias", "Entregue há 2 dias", "Pago em 26/09/2026". A data
// absoluta vai no title (data) quando o texto é relativo.
//   classe: '' | 'perto' (até 3 dias) | 'hoje' | 'atrasado' | 'feito' | 'sem'
export function _prazoPedido(p) {
  const r = _prazoTexto(p)
  if (r && !r.data && p.dataNecessaria && !['feito', 'sem'].includes(r.classe)) r.data = `${t('dtPrazo')}: ${dataAbsoluta(p.dataNecessaria)}`
  return r
}
export function _prazoTexto(p) {
  const hoje = hojeISO()
  const emData = (chave, campo) => {
    const iso = _isoDe(p[campo]) || _isoDe(p.atualizadoEm)
    return iso ? { texto: t(chave).replace('{d}', dataAbsoluta(iso)), classe: 'feito' } : null
  }
  switch (p.status) {
    case STATUS.PAGO:      return emData('prazoPagoEm', 'pagoEm')
    case STATUS.REPROVADO: return emData('prazoReprovadoEm', 'reprovadoEm')
    case STATUS.CANCELADO: return emData('prazoCanceladoEm', 'canceladoEm')
    case STATUS.ENTREGUE: {
      const iso = _isoDe(p.dataEntrega) || _isoDe(p.atualizadoEm)
      if (!iso) return null
      const n = Math.max(0, _diasEntre(iso, hoje))
      return { texto: n === 0 ? t('prazoEntregueHoje') : (n === 1 ? t('prazoEntregue1') : t('prazoEntregue').replace('{n}', n)), classe: 'feito', data: dataAbsoluta(iso) }
    }
    default: {
      if (!p.dataNecessaria) return { texto: t('prazoSem'), classe: 'sem' }
      const n = _diasEntre(hoje, p.dataNecessaria)
      if (n < 0) return { texto: n === -1 ? t('prazoAtrasado1') : t('prazoAtrasado').replace('{n}', -n), classe: 'atrasado' }
      if (n === 0) return { texto: t('prazoVenceHoje'), classe: 'hoje' }
      if (n === 1) return { texto: t('prazoFalta1'), classe: 'perto' }
      return { texto: t('prazoFaltam').replace('{n}', n), classe: n <= 3 ? 'perto' : '' }
    }
  }
}

export function _podeArrastar(status) {
  return (_transicoesDragPermitidas(sessao.usuario.perfil)[status] || []).length > 0
}

export function _temComentarioNaoLido(p) {
  // Pedidos antigos ainda podem ter a marca dentro deles (vistoPor)
  const visto = Q.lidos?.[chaveLido(p.id)] || p.vistoPor?.[sessao.usuario.id]
  return p.ultimoComentarioEm && _tsMs(p.ultimoComentarioEm) > _tsMs(visto)
}

// ── "Meus pedidos" da solicitante ─────────────────────────────
// Quem só pede compras quer saber onde está cada pedido, não ver sete colunas
// quase vazias. No celular e no computador, o quadro da solicitante vira a lista dos pedidos
// dela, os em andamento primeiro, cada um com o caminho das sete etapas, a
// etapa em que está e com quem. O cartão é o mesmo do quadro
export function _usaMeusPedidos() {
  return sessao.usuario?.perfil === PERFIS.SOLICITANTE && Q.filtroAtivo !== 'encerrados'
}
// Título da tela: a fila, os pedidos da solicitante ou o quadro de todos
export function _tituloTela() {
  if (Q.filtroAtivo === 'pendentes') return t('navMinhaFila')
  return sessao.usuario?.perfil === PERFIS.SOLICITANTE ? t('meusPedidos') : t('titulo')
}
const _FIM = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
export function _renderMeusPedidos(lista) {
  if (!lista.length) return _renderEmptyState(_tipoVazio())
  const grupo = (titulo, itens) => itens.length ? `
    <section class="meus-grupo" aria-label="${esc(titulo)}">
      <h2 class="meus-grupo-titulo">${esc(titulo)}<span class="numeral">${itens.length}</span></h2>
      <div class="meus-lista">${itens.map(p => _renderKcard(p, { caminho: true })).join('')}</div>
    </section>` : ''
  return `<div class="meus">${grupo(t('meusEmAndamento'), lista.filter(p => !_FIM.includes(p.status)))}${grupo(t('meusConcluidos'), lista.filter(p => _FIM.includes(p.status)))}</div>`
}
// O caminho em sete traços: os feitos e o atual em bronze; e quem responde agora
function _caminhoMini(p) {
  const i = KANBAN_COLUNAS.indexOf(p.status)
  if (i < 0) return ''
  const resp = _nomeComprador(p)
  const quem = p.status === STATUS.SOLICITADO ? t('meusAguardaComprador')
    : p.status === STATUS.EM_APROVACAO ? t('meusNaAprovacao')
      : p.status === STATUS.ENTREGUE ? t('meusNoFinanceiro')
        : p.status === STATUS.PAGO ? t('meusConcluido')
          : resp ? t('meusComQuem', { nome: resp }) : ''
  return `
      <div class="meus-caminho" role="img" aria-label="${esc(t('meusEtapaDe', { n: i + 1, total: KANBAN_COLUNAS.length, nome: STATUS_LABEL[p.status] }))}">
        ${KANBAN_COLUNAS.map((_, k) => `<span class="meus-passo${k < i ? ' feito' : k === i ? ' atual' : ''}"></span>`).join('')}
      </div>
      <div class="meus-etapa"><span class="numeral">${String(i + 1).padStart(2, '0')}</span><span class="meus-etapa-nome">${esc(STATUS_LABEL[p.status])}</span>${quem ? `<span class="meus-quem">${esc(quem)}</span>` : ''}</div>`
}

export function _renderKcard(p, { caminho = false } = {}) {
  const nomeEmp = _nomeEmpresa(p.empresaId)
  const valor   = _valorPedido(p)
  const naoLido = _temComentarioNaoLido(p)
  const prazo   = _prazoPedido(p)
  const resp    = _nomeComprador(p)
  const desde   = _mudouEm.has(p.id) ? Math.round(performance.now() - _mudouEm.get(p.id)) : null
  if (desde != null && desde > 1900) _mudouEm.delete(p.id)
  const mudou   = desde != null && desde <= 1900
  const rotulo  = [p.numeroPedido, p.titulo, p.urgente ? t('urgenteTag') : '', prazo?.texto, valor ? formatCurrency(valor) : '', resp ? `${t('colComprador')}: ${resp}` : '']
    .filter(Boolean).join(', ')

  return `
    <article class="kcard${p.urgente ? ' kcard-urgente' : ''}${mudou ? ' kcard-mudou' : ''}" data-id="${esc(p.id)}"${_podeArrastar(p.status) ? ' draggable="true"' : ''} tabindex="0" aria-keyshortcuts="Enter M"
      ${mudou ? `data-estilo="--desde: -${desde}ms${Q.mudaramAgora.has(p.id) ? `; view-transition-name: ${_nomeTransicao(p.id)}` : ''}"` : ''}
      aria-label="${esc(rotulo)}">
      <div class="kcard-top">
        ${p.numeroPedido ? `<span class="kcard-num">${esc(p.numeroPedido)}</span>` : ''}
        ${naoLido ? `<span class="kcard-unread-dot" title="${t('comentarioNaoLido')}" role="img" aria-label="${t('comentarioNaoLido')}"></span>` : ''}
        ${p.urgente ? `<span class="kcard-urg">${t('urgenteTag')}</span>` : ''}
        ${_seloLancamento(p)}
      </div>
      <h3 class="kcard-title" title="${esc(p.titulo)}">${esc(p.titulo)}</h3>
      ${nomeEmp ? `<div class="kcard-empresa" title="${esc(nomeEmp)}">${esc(nomeEmp)}</div>` : ''}
      ${caminho ? _caminhoMini(p) : ''}
      <div class="kcard-pe">
        ${prazo ? `<span class="kcard-prazo${prazo.classe ? ' ' + prazo.classe : ''}"${prazo.data ? ` title="${prazo.data}"` : ''}>${ICO.relogio(12)}<span>${prazo.texto}</span></span>` : ''}
        ${valor ? `<span class="kcard-valor">${formatCurrency(valor)}</span>` : `<span class="kcard-sem-valor">${t('semValor')}</span>`}
        ${resp ? `<span class="kcard-resp" title="${t('colComprador')}: ${esc(resp)}" aria-hidden="true">${esc(gerarIniciais(resp))}</span>` : ''}
      </div>
    </article>
  `
}

// Compra já feita: o selo, com a autorização a confirmar ou não reconhecida
export function _seloLancamento(p) {
  const l = p.lancamento
  if (!l) return ''
  const titulo = l.autorizacao === 'pendente' ? t('lancAutPendente')
    : l.autorizacao === 'negada' ? t('lancAutNegada', { nome: l.autorizacaoPorNome || '' }) : t('lancTag')
  return `<span class="selo-lanc selo-lanc-${esc(l.autorizacao || 'confirmada')}" title="${esc(titulo)}">${t('lancTag')}</span>`
}

// ── Estados vazios ────────────────────────────────────────────
export function _tipoVazio() {
  const temFiltroExtra = !!(Q.termoBusca.trim() || Q.filtroCategoria || Q.filtroEmpresa || Q.filtroComprador || Q.filtroDataIni || Q.filtroDataFim)
  if (temFiltroExtra) return 'busca'
  if (Q.filtroAtivo === 'pendentes') return 'pendentes'
  if (Q.filtroAtivo !== 'todos') return 'filtro'
  return 'vazio'
}

export function _renderEmptyState(tipo) {
  if (tipo === 'busca') {
    const termo = Q.termoBusca.trim()
    return estadoVazio({ numeral: true, nivel: 'h2',
      titulo: termo ? `${t('nenhumResultadoPara')} “${esc(termo)}”` : t('nenhumResultado'),
      texto: t('ajustarFiltro'),
      acao: `<button class="btn-secondary btn-sm" data-empty-limpar>${t('limparFiltros')}</button>`,
    })
  }
  if (tipo === 'pendentes') {
    return estadoVazio({ numeral: true, nivel: 'h2', titulo: t('semPendentesTitulo'), texto: t('semPendentesSub'),
      acao: `<button class="btn-secondary btn-sm" data-empty-limpar>${t('verTodos')}</button>` })
  }
  if (tipo === 'filtro') {
    return estadoVazio({ numeral: true, nivel: 'h2', titulo: t('semPedidosFiltro'), texto: t('semPedidosFiltroSub'),
      acao: `<button class="btn-secondary btn-sm" data-empty-limpar>${t('verTodos')}</button>` })
  }
  return estadoVazio({ numeral: true, nivel: 'h2',
    titulo: t('nenhumPedido'),
    texto: t('semPedidosSub'),
    acao: `<button class="btn-secondary btn-sm" data-empty-novo>${ICO.mais(14)}${t('novoPedido')}</button>`,
  })
}

export function _bindEmptyActions(container) {
  container.querySelector('[data-empty-limpar]')?.addEventListener('click', _limparTodosFiltros)
  container.querySelector('[data-empty-novo]')?.addEventListener('click', () => document.getElementById('btn-novo-pedido')?.click())
}

// ── Lista ─────────────────────────────────────────────────────
export function _sortIcon(campo) {
  if (Q.ordemCampo !== campo) return `<svg class="sort-ico" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><polyline points="7 9 12 4 17 9"/><polyline points="7 15 12 20 17 15"/></svg>`
  return Q.ordemDesc
    ? `<svg class="sort-ico ativo" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="18 13 12 19 6 13"/></svg>`
    : `<svg class="sort-ico ativo" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>`
}

export function _thOrdenavel(campo, rotulo, classe = '') {
  const ativo = Q.ordemCampo === campo
  const aria = ativo ? (Q.ordemDesc ? 'descending' : 'ascending') : 'none'
  return `<th class="sortable${ativo ? ' ativo' : ''}${classe ? ' ' + classe : ''}" data-campo="${campo}" tabindex="0" aria-sort="${aria}" scope="col">${rotulo}${_sortIcon(campo)}</th>`
}

export function _renderLista(lista, totalFiltrada, totalPaginas, inicio) {
  if (!lista.length) return _renderEmptyState(_tipoVazio())

  const linhas = lista.map(p => {
    const nomeEmp  = _nomeEmpresa(p.empresaId)
    const solicit  = _nomeSolicitante(p)
    const label    = STATUS_LABEL[p.status] || p.status
    const sel      = Q.selecionados.has(p.id)
    const valor    = _valorPedido(p)
    const prazo    = _prazoPedido(p)
    const rotulo   = esc((p.numeroPedido ? p.numeroPedido + ' ' : '') + (p.titulo || ''))

    return `
      <tr data-id="${p.id}" tabindex="0" class="${sel ? 'selecionada' : ''}">
        <td class="bulk-cb-cell c-cb"><input type="checkbox" class="bulk-cb" data-id="${p.id}" aria-label="${t('selecionar')} ${rotulo}"${sel ? ' checked' : ''}></td>
        <td class="c-pedido">
          <div class="lp-linha">
            ${p.numeroPedido ? `<span class="lp-num">${esc(p.numeroPedido)}</span>` : ''}
            <span class="lp-titulo">${esc(p.titulo)}</span>
            ${_temComentarioNaoLido(p) ? `<span class="kcard-unread-dot" title="${t('comentarioNaoLido')}" role="img" aria-label="${t('comentarioNaoLido')}"></span>` : ''}
            ${p.urgente ? `<span class="kcard-urg">${t('urgenteTag')}</span>` : ''}
            ${_seloLancamento(p)}
          </div>
        </td>
        <td class="c-empresa">${esc(nomeEmp || '—')}</td>
        <td class="c-solic">${esc(solicit || '—')}</td>
        <td class="c-status"><span class="lozenge lozenge-${CATEGORIA_ETAPA[p.status] || 'aguardando'}">${label}</span></td>
        <td class="c-prazo">${prazo ? `<span class="lp-prazo${prazo.classe ? ' ' + prazo.classe : ''}"${prazo.data ? ` title="${prazo.data}"` : ''}>${prazo.texto}</span>` : '—'}</td>
        <td class="c-valor">${valor ? `<span class="lp-valor">${formatCurrency(valor)}</span>` : `<span class="lp-nulo">${t('semValor')}</span>`}</td>
        <td class="c-data">${p.criadoEm ? formatDate(_tsToISO(p.criadoEm)) : '—'}</td>
      </tr>
    `
  }).join('')

  const todasSelecionadas = lista.length > 0 && lista.every(p => Q.selecionados.has(p.id))
  const fim = inicio + lista.length
  const paginacao = totalPaginas > 1 ? `
    <nav class="lista-paginacao" aria-label="${t('paginacao')}">
      <span class="pagina-info"><span class="numeral">${inicio + 1}–${fim}</span> ${t('paginaDe')} <span class="numeral">${totalFiltrada}</span></span>
      <div class="pagina-btns">
        <button type="button" id="btn-pagina-ant" class="btn-ghost btn-sm"${Q.paginaAtual === 0 ? ' disabled' : ''} aria-label="${t('paginaAnt')}">
          ${ICO.setaEsq(15)}<span>${t('paginaAnt')}</span>
        </button>
        <span class="pagina-atual"><span class="numeral">${Q.paginaAtual + 1}</span> / ${totalPaginas}</span>
        <button type="button" id="btn-pagina-prox" class="btn-ghost btn-sm"${Q.paginaAtual >= totalPaginas - 1 ? ' disabled' : ''} aria-label="${t('paginaProx')}">
          <span>${t('paginaProx')}</span>${ICO.setaDir(15)}
        </button>
      </div>
    </nav>` : ''

  return `
    <div class="pedidos-tabela-wrap${Q.selecionados.size ? ' com-selecao' : ''}">
      <table class="table-card-mobile pedidos-tabela">
        <thead>
          <tr>
            <th class="c-cb" scope="col"><input type="checkbox" id="cb-select-all" aria-label="${t('selecionarPagina')}"${todasSelecionadas ? ' checked' : ''}></th>
            ${_thOrdenavel('titulo', t('colPedido'), 'c-pedido')}
            <th class="c-empresa" scope="col">${t('colEmpresa')}</th>
            <th class="c-solic" scope="col">${t('colSolicitante')}</th>
            ${_thOrdenavel('status', t('colEtapa'), 'c-status')}
            ${_thOrdenavel('prazo', t('colPrazo'), 'c-prazo')}
            ${_thOrdenavel('valorEstimado', t('colValor'), 'c-valor')}
            ${_thOrdenavel('criadoEm', t('colCriadoEm'), 'c-data')}
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
    ${paginacao}
  `
}

// ── Auxiliares ────────────────────────────────────────────────
export async function _carregarDadosAuxiliares() {
  // Da cópia local quando ela existe (lerRapido, js/firebase.js): a versão do
  // servidor chega logo depois e só troca as listas na memória
  const comCategorias = s => { Q.categorias = s.docs.map(d => ({ id: d.id, ...d.data() })) }
  const comEmpresas = s => {
    Q.empresasTodas = s.docs.map(d => ({ id: d.id, ...d.data() }))
    // Seletores mostram só as ativas; o nome das inativas segue disponível para pedidos antigos
    Q.empresas = Q.empresasTodas.filter(e => e.ativa !== false)
  }
  // Na demo, a conta de login não é uma pessoa: fica fora das menções e listas
  const comUsuarios = s => { Q.usuarios = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => !(sessao.isDemo && u.email === 'demo@praxis.app')) }
  const [catSnap, empSnap, usrSnap] = await Promise.all([
    lerRapido(consulta(collection(db, 'categorias')), comCategorias, `categorias_${sessao.fireUser?.uid || ''}`),
    lerRapido(consulta(collection(db, 'empresas')), comEmpresas, `empresas_${sessao.fireUser?.uid || ''}`),
    // A lista de usuários só é legível para o supremo, o gestor e a conta da
    // demo (firestore.rules); os outros nem pedem (era uma ida ao servidor,
    // recusada, a cada abertura do quadro)
    _podeListarUsuarios() ? lerRapido(consultaUsuarios(sessao.usuario), comUsuarios).catch(() => null) : null,
  ])
  comCategorias(catSnap)
  comEmpresas(empSnap)
  if (usrSnap) comUsuarios(usrSnap)
  else Q.usuarios = []
}

export function _podeListarUsuarios() {
  return sessao.isDemo || [PERFIS.SUPREMO, PERFIS.GESTOR].includes(sessao.usuario?.perfil)
}

export function _empresasAcessiveis(lista) {
  const empIds = empresasDoUsuario(sessao.usuario)
  return sessao.usuario.perfil === PERFIS.SUPREMO ? lista : lista.filter(e => empIds.includes(e.id))
}

// Seletores do painel: empresa (com 2 ou mais), categoria e comprador (quando a lista de usuários é legível)
export function _preencherFiltros() {
  const add = (sel, valor, texto) => {
    const opt = document.createElement('option')
    opt.value = valor; opt.textContent = texto
    sel.appendChild(opt)
  }
  const selEmp = document.getElementById('fl-empresa-global')
  if (selEmp) {
    // No filtro entram também as inativas: há pedidos antigos delas no quadro
    const disponiveis = _empresasAcessiveis(Q.empresasTodas)
      .slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
    if (disponiveis.length >= 2) {
      disponiveis.forEach(e => add(selEmp, e.id, e.ativa === false ? `${e.nome} (${t('inativa')})` : e.nome))
      document.getElementById('pf-campo-empresa')?.removeAttribute('hidden')
    }
  }
  const selCat = document.getElementById('fl-categoria')
  if (selCat) {
    Q.categorias.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
      .forEach(c => add(selCat, c.id, c.nome))
  }
  const selComp = document.getElementById('fl-comprador')
  const compradores = Q.usuarios.filter(u => [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(u.perfil))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  if (selComp && compradores.length) {
    compradores.forEach(u => add(selComp, u.id, u.nome))
    document.getElementById('pf-campo-comprador')?.removeAttribute('hidden')
  }
  // Grade de duas colunas sem buraco: com número ímpar de seletores, o último ocupa a linha
  const simples = [...document.querySelectorAll('#painel-filtros .pf-campo:not(.pf-periodo):not(.pf-ordem)')].filter(c => !c.hidden)
  if (simples.length % 2) simples[simples.length - 1].classList.add('pf-largo')
}

export function _preencherModalNovoPedido() {
  // Empresas — só as ativas às quais o usuário tem acesso
  const empSel = document.getElementById('np-empresa')
  if (empSel) {
    _empresasAcessiveis(Q.empresas).forEach(e => {
      const opt = document.createElement('option')
      opt.value = e.id; opt.textContent = e.nome
      empSel.appendChild(opt)
    })
  }

  // Unidades
  const unidSel = document.getElementById('np-unidade')
  if (unidSel) {
    UNIDADES.forEach(u => {
      const opt = document.createElement('option')
      opt.value = u; opt.textContent = u
      if (u === 'un') { opt.defaultSelected = true; opt.selected = true }
      unidSel.appendChild(opt)
    })
  }

  // Categorias
  const catWrap = document.getElementById('np-categorias')
  if (catWrap) {
    const lista = Q.categorias.length ? Q.categorias : CATEGORIAS_PADRAO.map((c, i) => ({ id: String(i), ...c }))
    lista.forEach(c => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.dataset.id = c.id
      chip.setAttribute('role', 'radio')
      chip.setAttribute('aria-checked', 'false')
      chip.innerHTML = `<span class="chip-dot" data-estilo="background:${esc(c.cor ? corCategoria(c.cor) : 'var(--text3)')}"></span>${esc(c.nome)}`
      catWrap.appendChild(chip)
    })
  }
}

export function _preencherModalDuplicar(p) {
  const titulo  = document.getElementById('np-titulo')
  const empresa = document.getElementById('np-empresa')
  const quant   = document.getElementById('np-quantidade')
  const unid    = document.getElementById('np-unidade')
  const cc      = document.getElementById('np-cc')
  const obs     = document.getElementById('np-obs')

  if (titulo)  titulo.value  = p.titulo || ''
  if (empresa) {
    // Empresa inativa (ou sem acesso) não está entre as opções: o campo volta para "Selecionar…"
    empresa.value = p.empresaId || ''
    if (empresa.value !== (p.empresaId || '')) empresa.value = ''
  }
  if (quant)   quant.value   = p.quantidade || ''
  if (unid)    unid.value    = p.unidade || ''
  if (cc)      cc.value      = p.centroCusto || p.cc || ''
  if (obs)     obs.value     = p.descricao || ''
  // A data necessária não é copiada: o prazo do original quase sempre já passou

  if (p.urgente) {
    document.getElementById('np-urgente-toggle')?.classList.add('on')
    const wrap = document.getElementById('np-urgente-wrap')
    wrap?.setAttribute('aria-checked', 'true')
    wrap?.classList.add('on')
  }

  if (p.categoriaId) {
    const chip = document.querySelector(`#np-categorias .chip[data-id="${p.categoriaId}"]`)
    if (chip) { chip.classList.add('selected'); chip.setAttribute('aria-checked', 'true') }
  }
  const mais = document.getElementById('np-mais')
  if (mais && (p.categoriaId || p.centroCusto || p.cc || p.descricao)) mais.open = true

  const h2 = document.getElementById('np-h2')
  if (h2) h2.textContent = t('duplicarPedido')
  const sub = document.getElementById('np-sub')
  if (sub) {
    sub.innerHTML = `${t('duplicarBase')} ${p.numeroPedido ? `<span class="np-sub-num">${esc(p.numeroPedido)}</span> · ` : ''}${t('duplicarAjuste')}`
    sub.hidden = false
  }
  const btn = document.getElementById('btn-abrir-pedido')
  if (btn) btn.textContent = t('btnCriarCopia')
}

export function _tsToISO(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── Visões salvas (dentro do painel de filtros) ───────────────
export function _carregarViews() {
  const uid = sessao.usuario.id
  try {
    const raw = localStorage.getItem(`praxis_views_${uid}`)
    Q.viewsSalvas = raw ? JSON.parse(raw) : []
  } catch {
    Q.viewsSalvas = []
  }
}

export function _persistirViews() {
  const uid = sessao.usuario.id
  try { localStorage.setItem(`praxis_views_${uid}`, JSON.stringify(Q.viewsSalvas)) } catch {}
}

export function _capturarEstadoFiltros() {
  return {
    filtroAtivo:     Q.filtroAtivo,
    termoBusca:      Q.termoBusca,
    filtroCategoria: Q.filtroCategoria,
    filtroEmpresa:   Q.filtroEmpresa,
    filtroComprador: Q.filtroComprador,
    filtroDataIni:   Q.filtroDataIni,
    filtroDataFim:   Q.filtroDataFim,
    ordemCampo:      Q.ordemCampo,
    ordemDesc:       Q.ordemDesc,
    viewMode:        Q.viewMode,
  }
}

// O que uma visão guarda, em itens curtos (modal de salvar e lista do painel)
export function _itensDoEstado(e) {
  const itens = [
    e.viewMode === 'lista' ? t('visaoLista') : t('visaoQuadro'),
    _rotuloFiltro(e.filtroAtivo || 'todos'),
  ]
  if (e.filtroEmpresa) itens.push(_nomeEmpresa(e.filtroEmpresa))
  if (e.filtroDataIni || e.filtroDataFim) itens.push(`${e.filtroDataIni ? formatDate(e.filtroDataIni) : '…'} – ${e.filtroDataFim ? formatDate(e.filtroDataFim) : '…'}`)
  if (e.termoBusca) itens.push(`“${e.termoBusca}”`)
  if (e.filtroCategoria) itens.push(Q.categorias.find(c => c.id === e.filtroCategoria)?.nome || '')
  if (e.filtroComprador) itens.push(Q.usuarios.find(u => u.id === e.filtroComprador)?.nome || '')
  return itens.filter(Boolean)
}

export function _preencherResumoVisao() {
  const el = document.getElementById('visao-resumo-itens')
  if (!el) return
  el.innerHTML = _itensDoEstado(_capturarEstadoFiltros()).map(i => `<span class="visao-resumo-item">${esc(i)}</span>`).join('')
}

export function _aplicarView(v) {
  const estado = v.estado || {}
  Q.filtroAtivo     = _FILTROS_PILL.includes(estado.filtroAtivo) ? estado.filtroAtivo : 'todos'
  Q.termoBusca      = estado.termoBusca      ?? ''
  Q.filtroCategoria = estado.filtroCategoria ?? ''
  Q.filtroEmpresa   = estado.filtroEmpresa   ?? ''
  Q.filtroComprador = estado.filtroComprador ?? ''
  Q.filtroDataIni   = estado.filtroDataIni   ?? ''
  Q.filtroDataFim   = estado.filtroDataFim   ?? ''
  Q.ordemCampo      = estado.ordemCampo      ?? 'criadoEm'
  Q.ordemDesc       = estado.ordemDesc       ?? true
  Q.viewMode        = estado.viewMode === 'lista' ? 'lista' : 'kanban'
  Q.paginaAtual     = 0
  Q.etapaMovel      = null
  Q.visaoAtiva      = v.id

  _sincronizarControles()
  _sincronizarLateral()
  _renderVisoes()
  _renderView()
}

export function _renderVisoes() {
  const ul = document.getElementById('pf-visoes-lista')
  if (!ul) return
  if (!Q.viewsSalvas.length) {
    ul.innerHTML = `<li class="pf-visoes-vazio">${t('visoesVazio')}</li>`
    return
  }
  ul.innerHTML = Q.viewsSalvas.map(v => {
    const ativa = Q.visaoAtiva === v.id
    return `
      <li class="pf-visao${ativa ? ' ativa' : ''}" data-view-id="${v.id}">
        <button type="button" class="pf-visao-nome" data-aplicar-view="${v.id}" aria-pressed="${ativa}">
          <span class="pf-visao-titulo">${esc(v.nome)}</span>
          <span class="pf-visao-desc">${esc(_itensDoEstado(v.estado || {}).join(' · '))}</span>
        </button>
        <button type="button" class="btn-icon pf-visao-acao" data-renomear-view="${v.id}" title="${t('renomear')}" aria-label="${t('renomear')} ${esc(v.nome)}">${ICO.editar(13)}</button>
        <button type="button" class="btn-icon pf-visao-acao pf-visao-del" data-remover-view="${v.id}" title="${t('remover')}" aria-label="${t('remover')} ${esc(v.nome)}">${ICO.x(13)}</button>
      </li>`
  }).join('')
}

export function _confirmarSalvarVisao() {
  const nome = document.getElementById('visao-nome')?.value.trim()
  if (!nome) {
    _marcarErroCampo('visao-nome', t('informeNomeVisao'))
    document.getElementById('visao-nome')?.focus()
    return
  }
  if (Q.viewsSalvas.length >= _VIEWS_MAX) {
    prxToast(t('visoesLimite', { n: _VIEWS_MAX }), 'error')
    return
  }
  const nova = { id: Date.now().toString(), nome, estado: _capturarEstadoFiltros() }
  Q.viewsSalvas.push(nova)
  Q.visaoAtiva = nova.id
  _persistirViews()
  fecharModal('modal-salvar-visao')
  _renderVisoes()
  prxToast(t('visaoSalva'), 'success')
}

export function _renomearView(viewId) {
  const view = Q.viewsSalvas.find(v => v.id === viewId)
  if (!view) return
  const item = document.querySelector(`.pf-visao[data-view-id="${viewId}"]`)
  const nomeBtn = item?.querySelector('.pf-visao-nome')
  if (!item || !nomeBtn) return
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.className = 'pf-visao-input'
  inp.value = view.nome
  inp.maxLength = 40
  inp.setAttribute('aria-label', t('nomeVisao'))
  item.replaceChild(inp, nomeBtn)
  inp.focus()
  inp.select()
  let feito = false
  const confirmar = () => {
    if (feito) return
    feito = true
    const novo = inp.value.trim()
    if (novo) { view.nome = novo; _persistirViews() }
    _renderVisoes()
    document.querySelector(`.pf-visao[data-view-id="${viewId}"] .pf-visao-nome`)?.focus({ preventScroll: true })
  }
  inp.addEventListener('blur', confirmar)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); confirmar() }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = view.nome; confirmar() }
  })
}

export function _removerView(viewId) {
  const view = Q.viewsSalvas.find(v => v.id === viewId)
  if (!view) return
  prxConfirm(t('visaoRemoverTitulo', { nome: view.nome }), t('visaoRemoverMsg'), t('remover'), t('cancelar'), true).then(ok => {
    if (!ok) return
    Q.viewsSalvas = Q.viewsSalvas.filter(v => v.id !== viewId)
    if (Q.visaoAtiva === viewId) Q.visaoAtiva = null
    _persistirViews()
    _renderVisoes()
  })
}

// ── Ações em massa ────────────────────────────────────────────
export function _atualizarBulkBar() {
  const bar = document.getElementById('bulk-bar')
  if (!bar) return
  const n = Q.selecionados.size
  bar.hidden = n === 0
  document.body.classList.toggle('pedidos-com-selecao', n > 0)
  document.querySelector('#pedidos-view .pedidos-tabela-wrap')?.classList.toggle('com-selecao', n > 0)
  const countEl = document.getElementById('bulk-count')
  if (countEl) countEl.innerHTML = `<span class="numeral">${n}</span> ${n !== 1 ? t('selecionados') : t('selecionado')}`
  const btnCancel = document.getElementById('btn-bulk-cancel')
  if (btnCancel) {
    const perfil = sessao.usuario.perfil
    btnCancel.hidden = ![PERFIS.GESTOR, PERFIS.SUPREMO, PERFIS.SOLICITANTE].includes(perfil)
  }
}

// CSV para o Excel em português (utils.js: baixarCSV)
export function _exportarCSV() {
  const ids = new Set(Q.selecionados)
  // Mantém a ordem em que aparecem na tela
  const ordem = _filtrarPedidos().map(p => p.id)
  const lista = Q.pedidos.filter(p => ids.has(p.id))
    .sort((a, b) => {
      const ia = ordem.indexOf(a.id), ib = ordem.indexOf(b.id)
      return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib)
    })
  if (!lista.length) return
  const cabecalho = [
    'csvNumero', 'npTitulo', 'colEmpresa', 'npCategoria', 'colSolicitante', 'cfgColStatus', 'urgente',
    'npQuantidade', 'npUnidade', 'csvValorEstimado', 'csvValorFinal',
    'npData', 'colCriadoEm', 'npCC',
  ].map(chave => t(chave))
  const linhas = lista.map(p => [
    p.numeroPedido || '',
    p.titulo || '',
    _nomeEmpresa(p.empresaId),
    Q.categorias.find(c => c.id === p.categoriaId)?.nome || '',
    _nomeSolicitante(p),
    STATUS_LABEL[p.status] || p.status || '',
    p.urgente ? t('sim') : t('nao'),
    p.quantidade ?? '',
    p.unidade || '',
    csvNumero(p.valorEstimado),
    csvNumero(p.valorFinal),
    p.dataNecessaria ? formatDate(p.dataNecessaria) : '',
    p.criadoEm ? formatDate(_tsToISO(p.criadoEm)) : '',
    p.centroCusto || '',
  ])
  baixarCSV(`praxis-pedidos-${hojeISO()}.csv`, cabecalho, linhas)
  prxToast(`${lista.length} ${lista.length !== 1 ? t('pedidosExportados') : t('pedidoExportado')}.`, 'success')
}

export function _candidatosCancelamento() {
  const CANCELAVEIS = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO]
  const perfil = sessao.usuario.perfil
  const uid = sessao.usuario.id
  return Q.pedidos.filter(p => {
    if (!Q.selecionados.has(p.id)) return false
    if (!CANCELAVEIS.includes(p.status)) return false
    if ([PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) return true
    if (perfil === PERFIS.SOLICITANTE) return p.solicitanteId === uid
    return false
  })
}

export function _abrirModalBulkCancel() {
  const total = Q.selecionados.size
  const candidatos = _candidatosCancelamento()
  if (!candidatos.length) {
    prxToast(t('bulkNenhumCancelavel'), 'error')
    return
  }
  const msg = document.getElementById('bulk-cancel-msg')
  if (msg) {
    const n = candidatos.length
    let texto = `${n} ${n === 1 ? t('bulkSeraCancelado') : t('bulkSeraoCancelados')}`
    if (n < total) texto += ` ${t('bulkDemaisFicam').replace('{n}', String(total - n))}`
    msg.textContent = texto
  }
  const ul = document.getElementById('bulk-cancel-lista')
  if (ul) {
    const MAX = 5
    ul.innerHTML = candidatos.slice(0, MAX).map(p => `
      <li><span class="lp-num">${esc(p.numeroPedido || '')}</span><span class="bulk-cancel-titulo">${esc(p.titulo || '')}</span></li>
    `).join('') + (candidatos.length > MAX ? `<li class="bulk-cancel-mais">+ ${candidatos.length - MAX} ${t('outros')}</li>` : '')
  }
  const sel = document.getElementById('bulk-motivo')
  if (sel) {
    sel.innerHTML = `<option value="">${t('motivoPlaceholder')}</option>`
    MOTIVOS_CANCELAMENTO.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m; opt.textContent = rotuloMotivo(m)
      sel.appendChild(opt)
    })
  }
  _limparErroCampo('bulk-motivo')
  _limparErroCampo('bulk-motivo-outros')
  const wrap = document.getElementById('bulk-motivo-outros-wrap')
  if (wrap) wrap.hidden = true
  const outros = document.getElementById('bulk-motivo-outros')
  if (outros) outros.value = ''
  abrirModal('modal-bulk-cancel')
}

export async function _confirmarBulkCancel() {
  const motivo = document.getElementById('bulk-motivo')?.value
  const motivoOutros = document.getElementById('bulk-motivo-outros')?.value.trim()
  if (!motivo) { _marcarErroCampo('bulk-motivo', t('selecionarMotivo')); return }
  if (motivo === MOTIVO_OUTROS && !motivoOutros) { _marcarErroCampo('bulk-motivo-outros', t('descreverMotivo')); return }

  const uid = sessao.usuario.id
  const candidatos = _candidatosCancelamento()
  if (!candidatos.length) { fecharModal('modal-bulk-cancel'); return }

  if (!exigirConexao()) return
  const btnConfirmar = document.getElementById('btn-confirmar-bulk-cancel')
  if (btnConfirmar) btnConfirmar.disabled = true
  mostrarSpinner()
  try {
    // Um lote por pedido: o cancelamento e a entrada do histórico gravam juntos
    await Promise.all(candidatos.map(async p => {
      const lote = writeBatch(db)
      lote.update(doc(db, 'pedidos', p.id), {
        status: STATUS.CANCELADO,
        canceladoPor: uid,
        canceladoEm: serverTimestamp(),
        motivoCancelamento: motivo,
        motivoCancelamentoOutros: motivo === MOTIVO_OUTROS ? motivoOutros : null,
        atualizadoEm: serverTimestamp(),
      })
      lote.set(doc(collection(db, 'pedidos', p.id, 'historico')), {
        status: STATUS.CANCELADO,
        autorId: uid,
        autorNome: sessao.usuario.nome || '',
        nota: motivo === MOTIVO_OUTROS ? motivoOutros : motivo,
        criadoEm: serverTimestamp(),
      })
      await lote.commit()
    }))
    fecharModal('modal-bulk-cancel')
    Q.selecionados.clear()
    _atualizarBulkBar()
    _renderView()
    prxToast(`${candidatos.length} ${candidatos.length !== 1 ? t('pedidosCancelados') : t('pedidoCancelado')}.`, 'success')
  } catch (err) {
    prxToast(estaOnline() ? t('erroCancelarPedidos') : t('semConexaoAcao'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btnConfirmar) btnConfirmar.disabled = false
  }
}
