// Detalhe do pedido: as ações de cada etapa, o comparador de cotações, a
// edição com auditoria campo a campo, as menções e os comentários
// (ver js/pedido-detalhe.js).
import {
  auth, db, doc, collection, getDoc, addDoc, updateDoc, deleteDoc, runTransaction, writeBatch,
  serverTimestamp, eContaDemo,
} from './firebase.js'
import { registrarLimpador } from './app.js'
import { sessao } from './estado.js'
import {
  prxToast, avisoNoFormulario, seloDeDecisao, prxConfirm, mostrarSpinner, esconderSpinner, abrirModal, fecharModal, exigirConexao,
} from './ui.js'
import { STATUS, PERFIS, PERFIS_LABEL, MOTIVO_OUTROS, rotuloUrgencia, STORAGE_PATHS, t } from './constants.js'
import {
  formatCurrency, formatDate, gerarIniciais, hojeISO, normalizarTexto, parseMoeda, urlSegura, esc,
  dividirEmParcelas, vencimentosMensais, arquivoIndisponivel, impedimentoDeFuncao,
  empresasDoUsuario, mensagemDeErro,
} from './utils.js'
import { retratoAprovacao, situacaoAprovacao, aplicarVoto } from './alcadas.js'
import { conferirNota } from './nota.js'
import { autocompletar } from './autocompletar.js'
import { montarEditorItens } from './itens-editor.js'
import {
  itensDoPedido, resumoDosItens, errosDosItens, erroDaPlaca, subtotalDosItens, totalComDesconto, veiculo, placaParaExibir,
} from './itens.js'
import {
  _COL_INTERNA, _ehEquipe, _opcoesFornecedor, _fornecedorNoLote, _enviarEGravar, _enviaArquivos,
  ICO, _cabModal, _pct,
} from './pedido-detalhe.js'
import { _perguntarCotacaoUnica, _renderActivityFeed } from './detalhe-painel.js'
import { _refreshComentarios, _refreshCotacoes, _refreshParcelas, _historicoJunto } from './detalhe-dados.js'
import { D } from './detalhe-estado.js'

// ── Ações de workflow ─────────────────────────────────────────
export async function _assumirPedido() {
  const ok = await prxConfirm(t('dlgAssumirTitulo'), t('dlgAssumirTexto'), t('dlgAssumirOk'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', D.pedidoId)
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

export async function _liberarClaim() {
  const ok = await prxConfirm(t('dlgLiberarTitulo'), t('dlgLiberarTexto'), t('dlgLiberarOk'), t('btnCancelar'), true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // Em transação: se o comprador indicou uma cotação nesse meio-tempo, o
    // pedido não volta para a fila por cima disso
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', D.pedidoId)
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

export async function _aprovarPedido() {
  if (situacaoAprovacao(D.pedido)) return _votarNaAlcada()
  const ind = D.cotacoes.find(c => c.indicada)
  const ok = await prxConfirm(t('dlgAprovarTitulo'),
    ind ? t('dlgAprovarTextoInd', { fornecedor: ind.fornecedorNome, valor: formatCurrency(ind.valor) }) : t('dlgAprovarTexto'),
    t('btnAprovar'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', D.pedidoId)
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
    seloDeDecisao(STATUS.APROVADO)
    prxToast(t('pedidoAprovado'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroAprovar')), 'error')
  } finally {
    esconderSpinner()
  }
}

// Com alçada: a aprovação conta para o nível atual. Quando o nível completa,
// o pedido passa ao seguinte ou, no último, fica aprovado; tudo numa
// transação, com a entrada do histórico (firestore.rules, votar). O supremo
// aprova de uma vez, em qualquer nível
export async function _votarNaAlcada() {
  const s = situacaoAprovacao(D.pedido)
  const supremo = sessao.usuario?.perfil === 'supremo'
  const ultimo = s.numero === s.total
  const fecha = s.faltam <= 1
  const ok = await prxConfirm(t(supremo ? 'dlgAprovarTitulo' : 'dlgVotoTitulo'),
    t(supremo ? 'dlgVotoSupremo' : fecha ? (ultimo ? 'dlgVotoAprova' : 'dlgVotoAvanca') : 'dlgVotoConta',
      { nivel: s.numero, total: s.total, nome: s.nome, faltam: s.faltam - 1 }),
    t('btnAprovar'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const resultado = await runTransaction(db, async (tx) => {
      const ref  = doc(db, 'pedidos', D.pedidoId)
      const snap = await tx.get(ref)
      const atual = snap.data()
      if (atual.status !== STATUS.EM_APROVACAO) throw new Error(t('pedidoJaProcessado'))
      if (impedimentoDeFuncao(atual, sessao.usuario, 'decidir')) throw new Error(t('votoJaContado'))
      const agora = situacaoAprovacao(atual)
      const { campos, resultado } = aplicarVoto(atual, sessao.usuario.id, { supremo })
      tx.update(ref, {
        ...campos,
        ...(resultado === 'aprovado' ? {
          status: STATUS.APROVADO,
          aprovadoPor: sessao.usuario.id,
          aprovadoPorNome: sessao.usuario.nome || null,
          aprovadoEm: serverTimestamp(),
        } : {}),
        atualizadoEm: serverTimestamp(),
      })
      const dados = { nivel: agora.numero, total: agora.total, nome: agora.nome }
      const nota = supremo && !(agora.numero === agora.total && agora.faltam <= 1) ? 'notaAprovouSupremo' : 'notaAprovouAlcada'
      if (resultado === 'aprovado') _historicoJunto(tx, STATUS.APROVADO, { chave: nota, dados })
      else {
        tx.set(doc(collection(db, 'pedidos', D.pedidoId, 'historico')), {
          tipo: 'voto', nivel: agora.numero, nivelTotal: agora.total, nivelNome: agora.nome,
          avancou: resultado === 'avancou',
          autorId: sessao.usuario.id, autorNome: sessao.usuario.nome || null, criadoEm: serverTimestamp(),
        })
      }
      return resultado
    })
    prxToast(t(resultado === 'aprovado' ? 'pedidoAprovado' : resultado === 'avancou' ? 'votoAvancou' : 'votoContado'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroAprovar')), 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _reprovarPedido() {
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
      const ref  = doc(db, 'pedidos', D.pedidoId)
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
    seloDeDecisao(STATUS.REPROVADO)
    prxToast(t('pedidoReprovado'), 'info')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroReprovar')), 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _executarCompra() {
  const fornecedor = document.getElementById('mc-fornecedor')?.value.trim()
  const valorStr   = document.getElementById('mc-valor')?.value.trim()
  const condicao   = document.getElementById('mc-condicao')?.value
  const dataCompra = document.getElementById('mc-data')?.value
  const numParc    = parseInt(document.getElementById('mc-parcelas')?.value) || 1
  const venc1      = document.getElementById('mc-venc1')?.value
  const nota       = document.getElementById('mc-nota')?.value.trim()
  const valorFinal = parseMoeda(valorStr)

  if (!fornecedor || !valorFinal || !condicao || !dataCompra || !venc1) {
    avisoNoFormulario('#modal-compra', t('erroCamposObrigatorios'))
    return
  }
  if (['digito', 'tamanho'].includes(conferirNota(nota))) {
    prxToast(t(conferirNota(nota) === 'digito' ? 'notaDigitoErrado' : 'notaTamanhoErrado'), 'warning')
    return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // Fornecedor (novo ou com mais um uso), pedido, histórico e parcelas num
    // lote só: a compra nunca fica registrada pela metade
    const lote = writeBatch(db)
    const forn = await _fornecedorNoLote(fornecedor, lote)
    lote.update(doc(db, 'pedidos', D.pedidoId), {
      status: STATUS.COMPRADO,
      fornecedorId: forn.id,
      fornecedorNome: fornecedor,
      valorFinal,
      condicaoPagamento: condicao,
      dataCompra,
      ...(nota ? { notaFiscal: nota } : {}),
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.COMPRADO, { chave: 'notaCompra', dados: { fornecedor, valor: formatCurrency(valorFinal) } })
    // Parcelas em centavos (a última leva a diferença), com vencimentos que
    // respeitam o fim do mês
    const valores = dividirEmParcelas(valorFinal, numParc)
    const vencimentos = vencimentosMensais(venc1, numParc)
    valores.forEach((valor, i) => {
      lote.set(doc(collection(db, 'pedidos', D.pedidoId, 'parcelas')), {
        numero: i + 1, total: numParc,
        valor, vencimento: vencimentos[i],
        pago: false, pagoEm: null, comprovante: null,
      })
    })
    await lote.commit()
    if (forn.novo) D.fornecedores.push(forn.novo)

    fecharModal('modal-compra')
    seloDeDecisao(STATUS.COMPRADO)
    prxToast(t('compraRegistrada'), 'success')
  } catch (err) {
    prxToast(t('erroRegistrarCompra'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

export async function _confirmarEntrega() {
  const ok = await prxConfirm(t('dlgEntregaTitulo'), t('dlgEntregaTexto'), t('confirmar'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const lote = writeBatch(db)
    const fecha = D.pedido.lancamento?.pago === true
    lote.update(doc(db, 'pedidos', D.pedidoId), {
      status: fecha ? STATUS.PAGO : STATUS.ENTREGUE,
      dataEntrega: hojeISO(),
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, fecha ? STATUS.PAGO : STATUS.ENTREGUE)
    await lote.commit()
    seloDeDecisao(STATUS.ENTREGUE)
    prxToast(t('entregaConfirmada'), 'success')
  } catch (err) {
    prxToast(t('erroConfirmarEntrega'), 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _confirmarPagamento() {
  const forn = D.pedido.fornecedorNome || ''
  const resumo = D.pedido.valorFinal
    ? t(forn ? 'dtPagosValorA' : 'dtPagosValor', { valor: formatCurrency(D.pedido.valorFinal), fornecedor: forn })
    : t(forn ? 'dlgPagamentoRegistradoA' : 'dlgPagamentoRegistrado', { fornecedor: forn })
  const ok = await prxConfirm(t('dlgPagamentoTitulo'), `${resumo} ${t('dlgPagamentoConclui')}`, t('confirmar'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', D.pedidoId), {
      status: STATUS.PAGO,
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.PAGO)
    await lote.commit()
    seloDeDecisao(STATUS.PAGO)
    prxToast(t('pagamentoConfirmado'), 'success')
  } catch (err) {
    prxToast(t('erroConfirmarPagamento'), 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _cancelarPedido() {
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
    lote.update(doc(db, 'pedidos', D.pedidoId), {
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
export function _montarOverlay(id, html) {
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

export function _compararCotacoes() {
  const comValor = D.cotacoes.filter(c => !c.semProduto)
  const menorValor = Math.min(...comValor.map(c => c.valor))
  const lista = [...comValor].sort((a, b) => a.valor - b.valor)
  _montarOverlay('modal-comparar', `
    <div class="modal modal-comparar" role="dialog" aria-modal="true" aria-labelledby="modal-comparar-titulo">
      ${_cabModal('modal-comparar-titulo', t('dtLadoALadoTitulo'), 'data-fechar')}
      <div class="modal-body">
        <div class="cotacao-compare-grid" data-estilo="--colunas:${Math.min(lista.length, 4)}">
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
export const _CAMPO_CHAVE = {
  titulo: 'npTitulo', descricao: 'dtDescricao', valorEstimado: 'npValor',
  dataNecessaria: 'campoDataNecessaria', urgente: 'campoUrgencia', categoriaId: 'npCategoria',
  itens: 'dtItens', desconto: 'itemDesconto', veiculo: 'metaVeiculo', centroCusto: 'npCC',
}
// Nome do campo de uma edição no idioma de quem lê (o rótulo gravado fica para
// campos que o app não conhece mais)
export const _rotuloCampo = h => _CAMPO_CHAVE[h.campo] ? t(_CAMPO_CHAVE[h.campo]) : (h.campoLabel || h.campo || '')
export const _valorEdicao = (h, v) => h.campo === 'urgente' ? rotuloUrgencia(v) : (v || '—')

export function _editarPedido() {
  const p = D.pedido
  const { fechar } = _montarOverlay('modal-editar-pedido', `
    <div class="modal" data-estilo="max-width:680px" role="dialog" aria-modal="true" aria-labelledby="modal-editar-titulo">
      ${_cabModal('modal-editar-titulo', t('btnEditarPedido'), 'data-fechar')}
      <div class="modal-body">
        <p class="modal-intro">${t('editIntro')}</p>
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2" data-campo="ed-itens">
            <span class="form-label-falso" id="edit-itens-rot">${t('dtItens')} *</span>
            <div id="edit-itens-ed" role="group" aria-labelledby="edit-itens-rot"></div>
          </div>
          <div class="form-group col-span-2">
            <label for="edit-titulo">${t('npResumo')} *</label>
            <input type="text" id="edit-titulo" value="${esc(p.titulo || '')}" maxlength="120">
          </div>
          <div class="form-group">
            <label for="edit-placa">${t('npVeiculo')}</label>
            <input type="text" id="edit-placa" value="${esc(p.veiculo?.placa ? placaParaExibir(p.veiculo.placa) : '')}" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="${t('npPlacaPlaceholder')}">
          </div>
          <div class="form-group">
            <label for="edit-km">${t('npKm')}</label>
            <input type="text" id="edit-km" value="${esc(p.veiculo?.km ?? '')}" inputmode="numeric" maxlength="9" autocomplete="off">
          </div>
          ${(() => {
            const lista = D.empresas.find(e => e.id === p.empresaId)?.centrosCusto || []
            const ops = p.centroCusto && !lista.includes(p.centroCusto) ? [...lista, p.centroCusto] : lista
            return ops.length ? `
          <div class="form-group col-span-2">
            <label for="edit-cc">${t('npCC')}</label>
            <select id="edit-cc"><option value="">${t('selecionar')}</option>${ops.map(c => `<option value="${esc(c)}"${c === p.centroCusto ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>
          </div>` : ''
          })()}
          <div class="form-group col-span-2">
            <label for="edit-descricao">${t('dtDescricao')}</label>
            <textarea id="edit-descricao" rows="3" data-estilo="resize:vertical">${esc(p.descricao || '')}</textarea>
          </div>
          <div class="form-group">
            <label for="edit-data">${t('npData')}</label>
            <input type="date" id="edit-data" value="${esc(p.dataNecessaria || '')}">
          </div>
          <div class="form-group">
            <label for="edit-categoria">${t('npCategoria')}</label>
            <select id="edit-categoria">
              <option value=""${p.categoriaId ? '' : ' selected'}>—</option>
              ${D.categorias.map(c => `<option value="${esc(c.id)}" ${p.categoriaId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <div class="toggle-wrap np-urgente${p.urgente ? ' on' : ''}" id="edit-urgente-wrap" role="switch" tabindex="0" aria-checked="${p.urgente ? 'true' : 'false'}" aria-labelledby="edit-urgente-rotulo" aria-describedby="edit-urgente-desc">
              <div class="np-urgente-txt">
                <span class="toggle-label" id="edit-urgente-rotulo">${t('npUrgente')}<span class="kcard-urg np-urgente-selo" aria-hidden="true">${t('urgenteTag')}</span></span>
                <span class="np-urgente-desc" id="edit-urgente-desc">${t('npUrgenteDesc')}</span>
              </div>
              <div class="toggle ${p.urgente ? 'on' : ''}" id="edit-urgente-toggle" aria-hidden="true"></div>
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
  // O mesmo interruptor do novo pedido: a caixa inteira alterna, com o selo e a descrição
  const tg = document.getElementById('edit-urgente-toggle')
  const wrap = document.getElementById('edit-urgente-wrap')
  const alternar = () => {
    const on = tg.classList.toggle('on')
    wrap.classList.toggle('on', on)
    wrap.setAttribute('aria-checked', String(on))
  }
  wrap?.addEventListener('click', alternar)
  wrap?.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); alternar() } })
  // Os itens no mesmo editor do novo pedido; o resumo acompanha enquanto é o
  // automático
  const campoTitulo = document.getElementById('edit-titulo')
  let automatico = !p.titulo || p.titulo === resumoDosItens(itensDoPedido(p), t)
  campoTitulo?.addEventListener('input', () => { automatico = false })
  _editorEdicao = montarEditorItens(document.getElementById('edit-itens-ed'), {
    prefixo: 'ed',
    comValor: !p.lancamento,
    aoMudar: () => { if (automatico && campoTitulo) campoTitulo.value = resumoDosItens(_editorEdicao?.preenchidos() || [], t) },
  })
  _editorEdicao.definir(itensDoPedido(p), p.desconto || null)
  document.getElementById('salvar-edicao')?.addEventListener('click', () => _salvarEdicaoPedido(fechar))
}
let _editorEdicao = null

// Como cada campo aparece no histórico da edição
const _textoItens = itens => (itens || []).map(i => `${String(i.quantidade).replace('.', ',')} ${i.unidade} ${i.descricao}`).join('; ')
const _textoDesconto = d => (!d ? '—' : d.tipo === 'pct' ? `${String(d.valor).replace('.', ',')}%` : formatCurrency(d.valor))
const _textoVeiculo = v => (!v ? '—' : `${placaParaExibir(v.placa)}${v.km ? ` · ${v.km.toLocaleString('pt-BR')} ${t('kmSufixo')}` : ''}`)

export async function _salvarEdicaoPedido(fechar) {
  const titulo      = document.getElementById('edit-titulo')?.value.trim()
  const descricao   = document.getElementById('edit-descricao')?.value.trim()
  const data        = document.getElementById('edit-data')?.value
  const categoriaId = document.getElementById('edit-categoria')?.value
  const urgente     = document.getElementById('edit-urgente-toggle')?.classList.contains('on')
  const placaTxt    = document.getElementById('edit-placa')?.value || ''
  const ccCampo     = document.getElementById('edit-cc')

  const p = D.pedido
  const errItens = errosDosItens(_editorEdicao?.itens() || [], { prefixo: 'ed' })
  if (errItens.length) { prxToast(t(errItens[0][1] === 'campoObrigatorio' ? 'editItemObrigatorio' : errItens[0][1]), 'error'); return }
  if (!titulo) { prxToast(t('editTituloObrigatorio'), 'error'); return }
  if (erroDaPlaca(placaTxt)) { prxToast(t('placaInvalida'), 'error'); return }

  const itens = _editorEdicao.preenchidos()
  const sub = subtotalDosItens(itens)
  const desconto = sub != null ? _editorEdicao.desconto() : null
  const novos = {
    // Vazio é null (como o pedido nasce): '' contra null não é mudança
    titulo, descricao, dataNecessaria: data || null, categoriaId: categoriaId || '', urgente,
    itens, desconto, veiculo: veiculo(placaTxt, document.getElementById('edit-km')?.value),
    ...(ccCampo ? { centroCusto: ccCampo.value || null } : {}),
  }
  // Os campos de antes acompanham o primeiro item; o valor estimado, a soma
  // dos itens com valor (o pedido antigo sem itens guarda o que tinha)
  const derivados = {
    quantidade: itens[0].quantidade, unidade: itens[0].unidade,
    valorEstimado: sub != null ? totalComDesconto(sub, desconto) : (Array.isArray(p.itens) ? null : (p.valorEstimado ?? null)),
  }
  const formatar = (campo, val) => {
    if (campo === 'valorEstimado')  return val ? formatCurrency(val) : '—'
    if (campo === 'dataNecessaria') return val ? formatDate(val) : '—'
    if (campo === 'urgente')        return val ? t('urgente') : t('campoNormal')
    if (campo === 'categoriaId')    return D.categorias.find(c => c.id === val)?.nome || val
    if (campo === 'itens')          return _textoItens(val)
    if (campo === 'desconto')       return _textoDesconto(val)
    if (campo === 'veiculo')        return _textoVeiculo(val)
    return String(val ?? '—')
  }

  // Comparação pelo conteúdo: itens, desconto e veículo são listas e mapas.
  // Os itens do pedido antigo (sem a lista) contam como o item que ele tinha
  const comoEra = k => (k === 'itens' ? itensDoPedido(p) : (p[k] ?? null))
  const alteracoes = Object.keys(novos).filter(k => {
    const antes = comoEra(k)
    const depois = novos[k] ?? null
    return typeof depois === 'object' || typeof antes === 'object'
      ? JSON.stringify(antes) !== JSON.stringify(depois)
      : String(antes) !== String(depois)
  })
  Object.assign(novos, derivados)

  if (!alteracoes.length) { prxToast(t('editSemAlteracao'), 'info'); fechar(); return }

  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // A edição e a primeira entrada do histórico vão no mesmo lote, e o pedido
    // aponta para ela: as regras recusam a edição sem ela. As outras entradas
    // (uma por campo) vão logo depois, num lote próprio: no mesmo lote, a
    // edição de vários campos passava do limite de expressões das regras
    const entradas = alteracoes.map(() => doc(collection(db, 'pedidos', D.pedidoId, 'historico')))
    const entrada = (campo, i) => [entradas[i], {
      tipo:          'edicao',
      campo,
      campoLabel:    _rotuloCampo({ campo }),
      valorAnterior: formatar(campo, comoEra(campo)),
      valorNovo:     formatar(campo, novos[campo]),
      autorId:       sessao.usuario.id,
      autorNome:     sessao.usuario.nome,
      criadoEm:      serverTimestamp(),
    }]
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', D.pedidoId), {
      ...novos, ultimaEdicaoId: entradas[0].id, atualizadoEm: serverTimestamp(),
    })
    lote.set(...entrada(alteracoes[0], 0))
    await lote.commit()
    if (alteracoes.length > 1) {
      const resto = writeBatch(db)
      alteracoes.slice(1).forEach((campo, i) => resto.set(...entrada(campo, i + 1)))
      await resto.commit().catch(err => console.error(err))
    }
    fechar()
    prxToast(t('pedidoAtualizado'), 'success')
  } catch (err) {
    prxToast(t('erroSalvarAlteracoes'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

export function _mentionAberto() {
  const dd = document.getElementById('mention-dropdown')
  return dd && dd.style.display !== 'none'
}

export function _fecharMentionDropdown() {
  const dd = document.getElementById('mention-dropdown')
  if (dd) dd.style.display = 'none'
  D.mentionIndex = -1
}

export function _aplicarMencao(textarea, primeiroNome) {
  const pos   = textarea.selectionStart
  const antes = textarea.value.slice(0, pos)
  const novoAntes = antes.replace(/@([\wÀ-ÿ]*)$/, `@${primeiroNome} `)
  textarea.value = novoAntes + textarea.value.slice(pos)
  textarea.selectionStart = textarea.selectionEnd = novoAntes.length
  _fecharMentionDropdown()
  textarea.focus()
}

export function _destacarMentionItem(dd) {
  dd.querySelectorAll('.mention-item').forEach((item, i) => {
    item.classList.toggle('mention-item-active', i === D.mentionIndex)
  })
}

export function _handleMentionKeydown(e) {
  if (!_mentionAberto()) return false
  const dd = document.getElementById('mention-dropdown')
  const itens = dd.querySelectorAll('.mention-item')
  if (!itens.length) return false

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    D.mentionIndex = (D.mentionIndex + 1) % itens.length
    _destacarMentionItem(dd)
    return true
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    D.mentionIndex = (D.mentionIndex - 1 + itens.length) % itens.length
    _destacarMentionItem(dd)
    return true
  }
  if ((e.key === 'Enter' || e.key === 'Tab') && D.mentionIndex >= 0) {
    e.preventDefault()
    _aplicarMencao(e.target, itens[D.mentionIndex].dataset.nome)
    return true
  }
  return false
}

export function _handleMentionInput(e) {
  const textarea = e.target
  const pos = textarea.selectionStart
  const antes = textarea.value.slice(0, pos)
  const match = antes.match(/@([\wÀ-ÿ]*)$/)
  const dd = document.getElementById('mention-dropdown')
  if (!dd) return

  if (!match) { _fecharMentionDropdown(); return }

  const query = normalizarTexto(match[1])
  const empresaId = D.pedido?.empresaId
  // Gestores leem a lista de usuários; os demais perfis mencionam quem já participou do pedido
  let base = D.usuarios.filter(u => {
    if (u.ativo === false) return false
    if (u.perfil === PERFIS.SUPREMO || !empresaId) return true
    return empresasDoUsuario(u).includes(empresaId)
  })
  if (D.notaInterna && _ehEquipe()) base = base.filter(u => u.perfil !== PERFIS.SOLICITANTE)
  if (!base.length) {
    const vistos = new Map()
    ;[...D.historico, ...D.comentarios].forEach(x => { if (x.autorId && x.autorNome && !vistos.has(x.autorId)) vistos.set(x.autorId, { id: x.autorId, nome: x.autorNome }) })
    base = [...vistos.values()]
  }
  const sugestoes = base
    .filter(u => u.id !== sessao.usuario.id && normalizarTexto(u.nome || '').includes(query))
    .slice(0, 6)

  if (!sugestoes.length) { _fecharMentionDropdown(); return }

  D.mentionIndex = 0
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
      D.mentionIndex = i
      _destacarMentionItem(dd)
    })
    item.addEventListener('mousedown', ev => {
      ev.preventDefault()
      _aplicarMencao(textarea, item.dataset.nome)
    })
  })
}

export async function _enviarComentario() {
  const input = document.getElementById('input-comentario')
  const btn   = document.getElementById('btn-enviar-comentario')
  const texto = input?.value.trim()
  if (!texto) return
  if (!exigirConexao()) return
  if (btn) btn.disabled = true

  // Extrai @menções (nomes/apelidos após @)
  const mencoes = [...new Set((texto.match(/@([\wÀ-ÿ]+)/g) || []).map(m => m.slice(1)))]

  // Nota interna (só a equipe) ou comentário para todos os envolvidos
  const interno = _ehEquipe() && D.notaInterna
  const colecao = interno ? _COL_INTERNA : 'comentarios'

  // Optimistic: insere na UI imediatamente; removido no rollback se a escrita falhar
  const tempId = `temp-${Date.now()}`
  D.comentarios.push({
    id:        tempId,
    _col:      colecao,
    interno,
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
    await addDoc(collection(db, 'pedidos', D.pedidoId, colecao), {
      texto,
      autorId:   sessao.usuario.id,
      autorNome: sessao.usuario.nome,
      mencoes,
      criadoEm:  serverTimestamp(),
    })
    // A marca de "comentário não lido" do cartão é de todos: a nota interna não a acende
    if (!interno) updateDoc(doc(db, 'pedidos', D.pedidoId), { ultimoComentarioEm: serverTimestamp() }).catch(() => {})
    await _refreshComentarios()

    // Notifica usuários mencionados (best-effort; D.usuarios pode ser [] para não-gestor)
    for (const m of mencoes) {
      const mNorm = normalizarTexto(m)
      const user  = D.usuarios.find(u => normalizarTexto((u.nome || '').split(' ')[0]) === mNorm)
      if (user && user.id !== sessao.usuario.id && !(interno && user.perfil === PERFIS.SOLICITANTE)) {
        addDoc(collection(db, 'notificacoes', user.id, 'items'), {
          evento:   'mencao_comentario',
          titulo:   t('notifMencaoTitulo'),
          corpo:    t('notifMencaoCorpo', { nome: sessao.usuario.nome, titulo: D.pedido.titulo }),
          pedidoId: D.pedidoId,
          lida:     false,
          criadaEm: serverTimestamp(),
          autorId:  auth.currentUser?.uid || '', // as regras conferem quem avisou
        }).catch(() => {}) // não-bloqueia se falhar
      }
    }
  } catch (err) {
    // Rollback: remove o comentário otimista e devolve o texto ao campo
    D.comentarios = D.comentarios.filter(c => c.id !== tempId)
    const el = document.getElementById('activity-feed')
    if (el) el.innerHTML = _renderActivityFeed()
    if (input) input.value = texto
    prxToast(t('erroEnviarComentario'), 'error')
  } finally {
    if (btn) btn.disabled = false
  }
}

// ── Comentário: o autor edita o próprio; o gestor e o supremo apagam ──
// As regras deixam só o autor trocar o texto (com editadoEm e o texto anterior
// em versoes) e o gestor da empresa do pedido (o supremo, de qualquer uma)
// apagar. Vale também para a nota interna. A edição não avisa de novo quem foi
// mencionado.
export function _podeApagarComentario() {
  const u = sessao.usuario
  return u.perfil === PERFIS.SUPREMO || (u.perfil === PERFIS.GESTOR && empresasDoUsuario(u).includes(D.pedido.empresaId))
}

export function _redesenharAtividade() {
  const el = document.getElementById('activity-feed')
  if (el) el.innerHTML = _renderActivityFeed()
}

export function _focarComentario(id, seletor) {
  const el = document.querySelector(`#activity-feed [data-coment-id="${CSS.escape(id)}"]${seletor}`)
  el?.focus()
  return el
}

export function _abrirEdicaoComentario(id) {
  const c = D.comentarios.find(x => x.id === id)
  if (!c) return
  D.comentEditando = { id, rascunho: c.texto || '' }
  _redesenharAtividade()
  const ta = document.getElementById(`coment-edit-${id}`)
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length) }
}

export function _fecharEdicaoComentario(id) {
  D.comentEditando = null
  _redesenharAtividade()
  _focarComentario(id, '[data-coment-acao="editar"]')
}

export async function _salvarComentario(id) {
  const c = D.comentarios.find(x => x.id === id)
  const texto = (D.comentEditando?.id === id ? D.comentEditando.rascunho : '').trim()
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
    // O texto anterior vai para versoes, com a data dele (as regras conferem)
    const versoes = [...(c.versoes || []), { texto: c.texto, em: c.editadoEm || c.criadoEm || null }]
    await updateDoc(doc(db, 'pedidos', D.pedidoId, c._col, id), { texto, editadoEm: serverTimestamp(), versoes })
    D.comentEditando = null
    await _refreshComentarios()
    _focarComentario(id, '[data-coment-acao="editar"]')
    prxToast(t('comentAtualizado'), 'success')
  } catch (err) {
    console.warn('Editar comentário:', err)
    botoes.forEach(b => { b.disabled = false })
    prxToast(t('erroEditarComentario'), 'error')
  }
}

export async function _apagarComentario(id) {
  const c = D.comentarios.find(x => x.id === id)
  if (!c) return
  const ok = await prxConfirm(t('comentApagarTitulo'), t('acaoIrreversivel'), t('comentApagar'), t('btnCancelar'), true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await deleteDoc(doc(db, 'pedidos', D.pedidoId, c._col, id))
    await _refreshComentarios()
    prxToast(t('comentApagado'), 'success')
  } catch (err) {
    console.warn('Apagar comentário:', err)
    prxToast(t('erroApagarComentario'), 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _indicarCotacao(cotacaoId) {
  const c = D.cotacoes.find(x => x.id === cotacaoId)
  let motivoCotacaoUnica = null
  if (D.pedido.status === STATUS.AG_COTACAO) {
    if (D.cotacoes.filter(x => !x.semProduto).length === 1) {
      motivoCotacaoUnica = await _perguntarCotacaoUnica(c)
      if (!motivoCotacaoUnica) return
    } else {
      const ok = await prxConfirm(t('dtIndicarConfirmaTitulo'),
        c ? `${c.fornecedorNome}, ${formatCurrency(c.valor)}. ${t('dtIndicarConfirmaTexto')}` : t('dtIndicarConfirmaTexto'),
        t('dtIndicarConfirmaOk'), t('btnCancelar'))
      if (!ok) return
    }
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // Troca a indicação e, se ainda em cotação, avança para aprovação: tudo
    // num lote só, com a entrada do histórico. O pedido guarda qual cotação
    // foi indicada, e as regras só o deixam seguir com ela (firestore.rules).
    // Com alçada na empresa, o pedido guarda também o retrato da faixa em que
    // cai o valor da cotação (js/alcadas.js), conferido pelas regras
    const retrato = D.pedido.status === STATUS.AG_COTACAO && c ? retratoAprovacao(await _alcadaDaEmpresa(), c.valor) : null
    const lote = writeBatch(db)
    for (const c of D.cotacoes) {
      if (c.indicada && c.id !== cotacaoId) lote.update(doc(db, 'pedidos', D.pedidoId, 'cotacoes', c.id), { indicada: false })
    }
    lote.update(doc(db, 'pedidos', D.pedidoId, 'cotacoes', cotacaoId), { indicada: true })
    if (D.pedido.status === STATUS.AG_COTACAO) {
      lote.update(doc(db, 'pedidos', D.pedidoId), {
        status: STATUS.EM_APROVACAO,
        cotacaoIndicadaId: cotacaoId,
        ...(motivoCotacaoUnica ? { motivoCotacaoUnica } : {}),
        ...(retrato || {}),
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

// A alçada da empresa do pedido, ou null quando ela não tem (na demo, a
// leitura de um documento que não existe é negada: também vale como sem)
export async function _alcadaDaEmpresa() {
  try {
    const snap = await getDoc(doc(db, 'alcadas', D.pedido.empresaId))
    return snap.exists() ? snap.data() : null
  } catch (err) {
    if (!eContaDemo()) console.warn('Alçada indisponível:', err?.code || err?.message)
    return null
  }
}

export async function _pagarParcela(parcelaId) {
  const par = D.parcelas.find(x => x.id === parcelaId)
  const ok = await prxConfirm(t('dlgParcelaTitulo'),
    par ? t('dlgParcelaTexto', { parcela: `${par.numero}/${par.total}`, valor: formatCurrency(par.valor), d: formatDate(par.vencimento) }) : '',
    t('dlgParcelaOk'), t('btnCancelar'))
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    // A última parcela paga conclui o pedido no mesmo lote, com o histórico
    const todasPagas = D.parcelas.every(p => p.id === parcelaId ? true : p.pago)
    const conclui = todasPagas && D.pedido.status === STATUS.ENTREGUE
    const lote = writeBatch(db)
    lote.update(doc(db, 'pedidos', D.pedidoId, 'parcelas', parcelaId), {
      pago: true,
      pagoEm: serverTimestamp(),
    })
    if (conclui) {
      lote.update(doc(db, 'pedidos', D.pedidoId), { status: STATUS.PAGO, atualizadoEm: serverTimestamp() })
      _historicoJunto(lote, STATUS.PAGO, { chave: 'notaUltimaParcela' })
    }
    await lote.commit()
    if (!conclui) await _refreshParcelas()
    if (conclui) seloDeDecisao(STATUS.PAGO)
    prxToast(t('pagamentoRegistrado'), 'success')
  } catch (err) {
    prxToast(t('erroRegistrarPagamento'), 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _anexarComprovante(parcelaId, file) {
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const parc = D.parcelas.find(p => p.id === parcelaId)
    const caminho = STORAGE_PATHS.comprovante(D.pedidoId, parcelaId) + '/' + file.name
    // O comprovante e a entrada do histórico vão no mesmo lote, e a parcela
    // aponta para a entrada (as regras recusam o comprovante sem ela)
    await _enviarEGravar(caminho, file, undefined, (lote, url) => {
      const entrada = doc(collection(db, 'pedidos', D.pedidoId, 'historico'))
      lote.update(doc(db, 'pedidos', D.pedidoId, 'parcelas', parcelaId), {
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

export async function _mostrarModalCotacao() {
  const { fechar } = _montarOverlay('modal-cotacao', `
    <div class="modal" data-estilo="max-width:520px" role="dialog" aria-modal="true" aria-labelledby="modal-cotacao-titulo">
      ${_cabModal('modal-cotacao-titulo', t('dtRegistrarCotacao'), 'data-fechar')}
      <div class="modal-body">
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label for="cot-forn">${t('fornecedorLabel')} *</label>
            <input type="text" id="cot-forn" placeholder="${t('cotFornecedorBusca')}" autocomplete="off">
          </div>
          <div class="form-group col-span-2">
            <label class="cot-sem-produto-op">
              <input type="checkbox" id="cot-sem">
              <span><strong>${t('cotSemProduto')}</strong><small>${t('cotSemProdutoDesc')}</small></span>
            </label>
          </div>
          <div class="form-group cot-com-produto">
            <label for="cot-valor">${t('colValor')} *</label>
            <input type="text" id="cot-valor" inputmode="decimal" placeholder="R$ 0,00">
          </div>
          <div class="form-group cot-com-produto">
            <label for="cot-prazo">${t('cotPrazoEntrega')}</label>
            <input type="text" id="cot-prazo" placeholder="${t('cotPrazoExemplo')}">
          </div>
          <div class="form-group col-span-2">
            <label for="cot-cond">${t('cotCondicoes')}</label>
            <input type="text" id="cot-cond" placeholder="${t('cotCondicoesExemplo')}">
          </div>
          <div class="form-group col-span-2">
            <label for="cot-link">${t('cotLink')} <span class="np-opcional">${t('opcional')}</span></label>
            <input type="url" id="cot-link" inputmode="url" placeholder="${t('cotLinkPlaceholder')}" autocomplete="off">
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
          <div class="form-group col-span-2">
            <label class="cot-sem-produto-op">
              <input type="checkbox" id="cot-outra">
              <span><strong>${t('cotOutraDepois')}</strong></span>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button class="btn-primary" id="salvar-cotacao">${t('cotSalvar')}</button>
      </div>
    </div>
  `)
  autocompletar(document.getElementById('cot-forn'), _opcoesFornecedor)
  // "Registrar outra depois de salvar": a janela fica aberta e volta limpa ao fornecedor,
  // para quem cota três lugares seguidos não abrir a janela três vezes
  const limpar = () => {
    for (const id of ['cot-forn', 'cot-valor', 'cot-prazo', 'cot-cond', 'cot-link']) {
      const el = document.getElementById(id)
      if (el) el.value = ''
    }
    const sem = document.getElementById('cot-sem')
    if (sem?.checked) { sem.checked = false; sem.dispatchEvent(new Event('change')) }
    const arquivo = document.getElementById('cot-arquivo')
    if (arquivo?.value) { arquivo.value = ''; arquivo.dispatchEvent(new Event('change')) }
    document.querySelector('#modal-cotacao .modal-body')?.scrollTo(0, 0)
    document.getElementById('cot-forn')?.focus()
  }
  // Sem o produto: some o valor e o prazo (o lugar fica registrado sem preço)
  document.getElementById('cot-sem')?.addEventListener('change', e => {
    document.querySelectorAll('#modal-cotacao .cot-com-produto').forEach(g => { g.hidden = e.target.checked })
  })
  document.getElementById('cot-arquivo')?.addEventListener('change', e => {
    const f = e.target.files?.[0]
    const el = document.getElementById('cot-arquivo-nome')
    if (el) el.textContent = f ? f.name : t('cotSelecionarArquivo')
  })

  const salvar = async outra => {
    const fornNome = document.getElementById('cot-forn')?.value.trim()
    const valorStr = document.getElementById('cot-valor')?.value.trim()
    const prazo    = document.getElementById('cot-prazo')?.value.trim()
    const cond     = document.getElementById('cot-cond')?.value.trim()
    const arquivoInp = document.getElementById('cot-arquivo')
    const arquivo  = arquivoInp?.files[0]
    const semProduto = document.getElementById('cot-sem')?.checked === true
    const link     = document.getElementById('cot-link')?.value.trim()
    const valor = semProduto ? null : parseMoeda(valorStr)

    if (!fornNome || (!semProduto && !valor)) { prxToast(t('fornecedorValorObrig'), 'error'); return }
    if (link && !/^https?:\/\/\S+$/i.test(link)) { prxToast(t('lancLinkInvalido'), 'error'); return }

    const botoes = [document.getElementById('salvar-cotacao')].filter(Boolean)
    botoes.forEach(b => { b.disabled = true })
    mostrarSpinner()
    try {
      const cotRef = doc(collection(db, 'pedidos', D.pedidoId, 'cotacoes'))
      const caminho = arquivo
        ? STORAGE_PATHS.cotacao(D.pedidoId, cotRef.id) + '/' + arquivo.name
        : null
      // Fornecedor, cotação e histórico num lote só; a entrada do histórico usa
      // o ID da cotação, como as regras exigem
      const forn = await _enviarEGravar(caminho, arquivo, undefined, async (lote, url) => {
        const f = await _fornecedorNoLote(fornNome, lote)
        lote.set(cotRef, {
          fornecedorId: f.id,
          fornecedorNome: fornNome,
          valor, prazoEntrega: semProduto ? '' : prazo, condicoesComerciais: cond,
          semProduto, link: link || null,
          arquivoUrl: url, arquivoNome: arquivo ? arquivo.name : null,
          indicada: false,
          criadaEm: serverTimestamp(),
          compradorId: sessao.usuario.id,
        })
        lote.set(doc(db, 'pedidos', D.pedidoId, 'historico', cotRef.id), {
          tipo: 'cotacao',
          fornecedorNome: fornNome,
          valor,
          semProduto,
          autorId:   sessao.usuario.id,
          autorNome: sessao.usuario.nome,
          criadoEm:  serverTimestamp(),
        })
        return f
      })
      if (forn.novo) D.fornecedores.push(forn.novo)
      if (outra) limpar()
      else fechar()
      await _refreshCotacoes()
      prxToast(t('cotacaoAdicionada'), 'success')
    } catch (err) {
      prxToast(arquivoIndisponivel(err) ? t('arquivosIndisponiveis') : t('erroSalvarCotacao'), 'error')
    } finally {
      botoes.forEach(b => { b.disabled = false })
      esconderSpinner()
    }
  }
  // Com a opção marcada, a janela fica aberta e volta limpa para a próxima
  document.getElementById('salvar-cotacao')?.addEventListener('click', () => salvar(document.getElementById('cot-outra')?.checked === true))
}
