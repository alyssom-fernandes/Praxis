// Detalhe do pedido: permissões, releitura das subcoleções, anexos e o
// tempo por etapa (ver js/pedido-detalhe.js).
import {
  auth, db, armazenamento, doc, collection, getDocs, addDoc, deleteDoc, runTransaction,
  serverTimestamp, marcaDemo, novoPedidoRef, contadorPedidosRef,
} from './firebase.js'
import { navegar } from './app.js'
import { sessao } from './estado.js'
import {
  prxToast, prxConfirm, estadoVazio, mostrarSpinner, esconderSpinner, btnComLoading, fecharModal,
  exigirConexao, estaOnline, carregarBiblioteca,
} from './ui.js'
import {
  STATUS, STATUS_LABEL, PERFIS, MOTIVO_OUTROS, rotuloMotivo, rotuloNota, CONDICAO_PAGAMENTO,
  STORAGE_PATHS, t,
} from './constants.js'
import {
  formatCurrency, formatDate, dataComRelativo, hojeISO, urlSegura, esc, arquivoIndisponivel,
  impedimentoDeFuncao, mensagemDeErro,
} from './utils.js'
import { situacaoAprovacao } from './alcadas.js'
import { PAPEL, desenharSimbolo, larguraEspacada, textoEspacado } from './pdf-papel.js'
import { msDe, segmentosDoPedido, formatarDuracao } from './processo.js'
import {
  _secaoAberta, _botaoRecolher, _lerComentarios, _enviarEGravar, _enviaArquivos, ICO, _TERMINAIS,
  _nomePorId, _quemFez, _ETAPAS, _dois, _renderDetalhe,
} from './pedido-detalhe.js'
import { _renderActivityFeed } from './detalhe-painel.js'
import { _rotuloCampo, _valorEdicao } from './detalhe-acoes.js'
import { D } from './detalhe-estado.js'
import { itensDoPedido, placaParaExibir } from './itens.js'

// ── Helpers de permissão ──────────────────────────────────────
export function _podeAssumir() {
  const p = D.pedido
  const perfil = sessao.usuario.perfil
  return p.status === STATUS.SOLICITADO && !p.compradorId &&
         [PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)
}

// Aprova ou reprova quem tem o perfil, menos quem abriu ou cotou o pedido (o
// supremo pode), como nas regras do Firestore
export function _podeDecidir() {
  return [PERFIS.APROVADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil) &&
         !impedimentoDeFuncao(D.pedido, sessao.usuario, 'decidir')
}

export function _podeLiberar() {
  const perfil = sessao.usuario.perfil
  // Só faz sentido devolver à fila enquanto o comprador reúne cotações
  return [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil) && !!D.pedido.compradorId &&
         D.pedido.status === STATUS.AG_COTACAO
}

export function _podeAnexarCotacao() {
  const p = D.pedido
  const perfil = sessao.usuario.perfil
  return p.status === STATUS.AG_COTACAO &&
         ([PERFIS.COMPRADOR, PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil)) &&
         (p.compradorId === sessao.usuario.id || [PERFIS.GESTOR, PERFIS.SUPREMO].includes(perfil))
}

export function _podeIndicarCotacao() {
  return _podeAnexarCotacao() && D.cotacoes.some(c => !c.semProduto)
}

// Registra o pagamento (parcelas, comprovante e conclusão) o financeiro ou um
// gestor, menos quem aprovou o pedido (o supremo pode)
export function _podePagarParcela() {
  return [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil) &&
         !impedimentoDeFuncao(D.pedido, sessao.usuario, 'pagar')
}

// Por que quem teria o perfil para o passo não pode dá-lo neste pedido (a
// separação de funções), para o painel explicar em vez de só esconder a ação
export function _avisoDeFuncao(acao, perfisDoPasso) {
  if (!perfisDoPasso.includes(sessao.usuario.perfil)) return ''
  const motivo = impedimentoDeFuncao(D.pedido, sessao.usuario, acao)
  if (!motivo) return ''
  if (acao === 'decidir') {
    if (motivo === 'votou') return t('dtJaVotou')
    if (motivo === 'foraDoNivel') return t('dtForaDoNivel', { nome: esc(situacaoAprovacao(D.pedido)?.nome || '') })
    return motivo === 'abriu' ? t('dtNaoDecideAbriu') : t('dtNaoDecideCotou')
  }
  return acao === 'comprar' ? t('dtNaoCompraAprovou') : t('dtNaoPagaAprovou')
}

// ── Refresh parcial de subcoleções ────────────────────────────
// Gera o PDF com os dados já carregados: sem internet, funciona se o jsPDF já
// foi baixado uma vez (o service worker guarda o arquivo)
export async function _exportarPedidoPDF() {
  mostrarSpinner()
  try {
    const { jsPDF } = await carregarBiblioteca('jspdf')
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const p   = D.pedido

    const empresa   = D.empresas.find(e => e.id === p.empresaId)
    const categoria = D.categorias.find(c => c.id === p.categoriaId)
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
      // Vários itens: a lista; um só, a quantidade (Fase 1)
      ...(itensDoPedido(p).length > 1
        ? [[t('dtItens'), itensDoPedido(p).map(i => `${String(i.quantidade).replace('.', ',')} ${i.unidade} ${i.descricao}`).join('; ')]]
        : [[t('npQuantidade'), `${p.quantidade ?? '—'} ${p.unidade || ''}`.trim()]]),
      ...(p.veiculo?.placa ? [[t('metaVeiculo'), `${placaParaExibir(p.veiculo.placa)}${p.veiculo.km ? ` · ${p.veiculo.km.toLocaleString('pt-BR')} ${t('kmSufixo')}` : ''}`]] : []),
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
    if (D.cotacoes.length) {
      secao(`${t('secaoCotacoes')} (${D.cotacoes.length})`)
      const menor = Math.min(...D.cotacoes.map(c => c.valor))
      tabela([
        { titulo: t('fornecedorLabel'), w: 48 },
        { titulo: t('pdfColPrazo'), w: 24 },
        { titulo: t('cmpCondicoes'), w: 50 },
        { titulo: t('colValor'), w: 29, alinhar: 'right', negrito: true },
        { titulo: t('pdfColSituacao'), w: LARG - 151 },
      ], [...D.cotacoes].sort((a, b) => a.valor - b.valor).map(c => ({
        celulas: [c.fornecedorNome || '—', c.prazoEntrega || '—', c.condicoesComerciais || '—', formatCurrency(c.valor),
          [c.indicada ? t('dtIndicada') : '', c.valor === menor && D.cotacoes.length > 1 ? t('dtMenorValor') : ''].filter(Boolean).join(', ') || '—'],
        destaque: !!c.indicada,
        cores: { 4: c.indicada ? COR.terracotaTxt : COR.texto3 },
      })))
    }

    // ── Parcelas
    if (D.parcelas.length) {
      const total = D.parcelas.reduce((s, x) => s + (x.valor || 0), 0)
      const pago  = D.parcelas.filter(x => x.pago).reduce((s, x) => s + (x.valor || 0), 0)
      secao(`${t('secaoParcelas')} (${D.parcelas.length})`)
      tabela([
        { titulo: t('dtParcela'), w: 24 },
        { titulo: t('pdfColVencimento'), w: 34 },
        { titulo: t('colValor'), w: 36, alinhar: 'right', negrito: true },
        { titulo: t('pdfColSituacao'), w: 40 },
        { titulo: t('pdfColPagoEm'), w: LARG - 134 },
      ], D.parcelas.map(par => {
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
    if (D.historico.length) {
      secao(t('pdfHistorico'))
      tabela([
        { titulo: t('colData'), w: 30 },
        { titulo: t('pdfColEvento'), w: 62 },
        { titulo: t('pdfColPor'), w: 36 },
        { titulo: t('pdfColObservacao'), w: LARG - 128 },
      ], D.historico.map(h => {
        const evento = h.tipo === 'cotacao'     ? `${t('pdfEvCotacao', { fornecedor: h.fornecedorNome || '—' })}${h.valor ? ' (' + formatCurrency(h.valor) + ')' : ''}`
                     : h.tipo === 'comprovante' ? t('pdfEvComprovante', { parcela: h.parcelaNumero || '' })
                     : h.tipo === 'edicao'      ? t('pdfEvEdicao', { campo: _rotuloCampo(h) })
                     : h.tipo === 'anexo'       ? t('pdfEvAnexo', { arquivo: h.nomeArquivo || '—' })
                     : h.tipo === 'voto'        ? t('pdfEvVoto', { nivel: h.nivel, total: h.nivelTotal, nome: h.nivelNome || '' })
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

export async function _refreshComentarios() {
  D.comentarios = await _lerComentarios()
  const el = document.getElementById('activity-feed')
  if (el) el.innerHTML = _renderActivityFeed()
}

export async function _refreshCotacoes() {
  const snap = await getDocs(collection(db, 'pedidos', D.pedidoId, 'cotacoes'))
  D.cotacoes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  _renderDetalhe()
}

export async function _refreshParcelas() {
  const snap = await getDocs(collection(db, 'pedidos', D.pedidoId, 'parcelas'))
  D.parcelas = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.numero - b.numero)
  _renderDetalhe()
}

// ── Utilitário ────────────────────────────────────────────────
export async function _reabrirPedido() {
  if (!exigirConexao()) return
  const justificativa = document.getElementById('reabrir-justificativa')?.value.trim()
  if (!justificativa) {
    prxToast(t('informarJustificativa'), 'error')
    return
  }
  const btn = document.getElementById('btn-confirmar-reabrir')
  await btnComLoading(btn, async () => {
    const p = D.pedido
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
        ...(Array.isArray(p.itens) ? { itens: p.itens, desconto: p.desconto || null } : {}),
        ...(p.veiculo ? { veiculo: p.veiculo } : {}),
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
export function _historicoJunto(escrita, status, nota = null) {
  const doSistema = nota !== null && typeof nota === 'object'
  escrita.set(doc(collection(db, 'pedidos', D.pedidoId, 'historico')), {
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
export function _textoNota(h) {
  if (h.notaChave) return t(h.notaChave, h.notaDados || undefined)
  return h.nota ? rotuloNota(h.nota) : ''
}

export const _tsMs = msDe

// ── Anexos gerais (4.10) ──────────────────────────────────────
export function _renderAnexos() {
  if (!D.anexos.length) return estadoVazio({ variante: 'compacto', titulo: t('dtAnexosVazio'),
    texto: _enviaArquivos() ? t('dtAnexosVazioTexto') : t('dtArquivosDesligados') })
  const uid    = sessao.usuario.id
  const perfil = sessao.usuario.perfil
  return `<ul class="anexos-lista">${D.anexos.map(a => {
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

export function _formatarTamanho(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export async function _uploadAnexo(file) {
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
    const storagePath = STORAGE_PATHS.anexo(D.pedidoId) + '/' + Date.now() + '_' + file.name
    const anexoRef = doc(collection(db, 'pedidos', D.pedidoId, 'anexos'))
    // As regras do Storage só deixam apagar o anexo quem o enviou (ou um gestor
    // da empresa). O anexo e a entrada do histórico, com o mesmo ID, vão no
    // mesmo lote
    await _enviarEGravar(storagePath, file,
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
        lote.set(doc(db, 'pedidos', D.pedidoId, 'historico', anexoRef.id), {
          tipo: 'anexo',
          nomeArquivo: file.name,
          autorId: sessao.usuario.id,
          autorNome: sessao.usuario.nome || '',
          criadoEm: serverTimestamp(),
        })
      })
    // Atualiza lista local
    const snap = await getDocs(collection(db, 'pedidos', D.pedidoId, 'anexos'))
    D.anexos = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => _tsMs(a.criadoEm) - _tsMs(b.criadoEm))
    _renderDetalhe()
    prxToast(`${t('anexoAdicionado')} ${file.name}`, 'success')
  } catch (err) {
    prxToast(arquivoIndisponivel(err) ? t('arquivosIndisponiveis') : t('erroEnviarAnexo') + file.name, 'error')
  } finally {
    esconderSpinner()
  }
}

export async function _removerAnexo(anexoId, storagePath) {
  const ok = await prxConfirm(t('anexoRemoverTitulo'), t('acaoIrreversivel'), t('remover'), t('btnCancelar'), true)
  if (!ok) return
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    await deleteDoc(doc(db, 'pedidos', D.pedidoId, 'anexos', anexoId))
    if (storagePath) armazenamento().then(S => S.deleteObject(S.ref(storagePath))).catch(() => {})
    D.anexos = D.anexos.filter(a => a.id !== anexoId)
    _renderDetalhe()
    prxToast(t('anexoRemovido'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroRemoverAnexo')), 'error')
  } finally {
    esconderSpinner()
  }
}

export function _bindAnexosEvents() {
  document.querySelectorAll('[data-remover-anexo]').forEach(btn => {
    btn.addEventListener('click', () => _removerAnexo(btn.dataset.removerAnexo, btn.dataset.storagePath))
  })
}

// ── SLA timeline (4.11) ───────────────────────────────────────
export function _renderSLATimeline() {
  // Em pedido encerrado, a última transição marca o fim (js/processo.js)
  const terminal = _TERMINAIS.includes(D.pedido.status)
  const segmentos = segmentosDoPedido(D.pedido, D.historico)
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
        <span class="tempo-dur">${formatarDuracao(seg.durMs)}</span>
        <span class="tempo-barra" aria-hidden="true"><span data-estilo="width:${larg.toFixed(1)}%"></span></span>
      </li>`
  }).join('')

  const aberta = _secaoAberta('sla', false)
  return `
    <section class="dt-bloco ord-sla recolhivel${aberta ? '' : ' recolhida'}" aria-labelledby="sec-sla">
      <div class="dt-card-head">
        <h2 class="dt-secao" id="sec-sla">${t('dtTempoPorEtapa')}</h2>
        <span class="tempo-total" title="${terminal ? '' : t('dtAteAgora')}"><span class="dt-numeral">${formatarDuracao(totalMs)}</span></span>
        ${_botaoRecolher('sla', 'sec-sla', 'corpo-sla', aberta)}
      </div>
      <ol class="tempo-lista" id="corpo-sla">${linhas}</ol>
    </section>
  `
}
