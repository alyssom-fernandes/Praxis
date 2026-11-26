// Requisição (R4): o registro da retirada; e a autorização para mostrar ao
// fornecedor (R5). As contas ficam em js/requisicao.js; o resto das ações do
// detalhe, em js/detalhe-acoes.js.
import { db, doc, collection, writeBatch, serverTimestamp } from './firebase.js'
import { sessao } from './estado.js'
import {
  prxToast, avisoNoFormulario, seloDeDecisao, mostrarSpinner, esconderSpinner, exigirConexao, carregarBiblioteca,
} from './ui.js'
import { STATUS, PERFIS, t } from './constants.js'
import {
  formatCurrency, formatDate, hojeISO, maisXDiasISO, parseMoeda, esc, dividirEmParcelas, vencimentosMensais, mensagemDeErro,
} from './utils.js'
import { conferirNota } from './nota.js'
import { itensDoPedido, placaParaExibir } from './itens.js'
import { pdfDaAutorizacao, valorEmAprovacao, validadeDaAutorizacao } from './requisicao.js'
import { _cabModal } from './pedido-detalhe.js'
import { _montarOverlay } from './detalhe-acoes.js'
import { _historicoJunto } from './detalhe-dados.js'
import { D } from './detalhe-estado.js'

// ── Requisição (R4): quem foi buscar registra a retirada ─────────
// O pedido aprovado sem cotação: o valor da nota, quem retirou e, para quem é
// do financeiro, se já foi pago. Chega como "Entregue" (já está na mão)
export function _registrarRetirada() {
  const p = D.pedido
  const fin = [PERFIS.FINANCEIRO, PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario.perfil)
  const { fechar } = _montarOverlay('modal-retirada', `
    <div class="modal" data-estilo="max-width:560px" role="dialog" aria-modal="true" aria-labelledby="modal-retirada-titulo">
      ${_cabModal('modal-retirada-titulo', t('btnRegistrarRetirada'), 'data-fechar')}
      <div class="modal-body">
        <p class="modal-intro">${t('retiradaIntro')}</p>
        <div class="form-grid form-grid-2">
          <div class="form-group col-span-2">
            <label for="rt-fornecedor">${t('fornecedorLabel')} *</label>
            <input type="text" id="rt-fornecedor" value="${esc(p.fornecedorNome || '')}" maxlength="120" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="rt-valor">${t('valorFinalLabel')} *</label>
            <input type="text" id="rt-valor" inputmode="decimal" value="${esc(p.valorEstimado ? formatCurrency(p.valorEstimado) : '')}" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="rt-data">${t('retiradaData')} *</label>
            <input type="date" id="rt-data" value="${hojeISO()}" max="${hojeISO()}">
          </div>
          <div class="form-group col-span-2">
            <label for="rt-quem">${t('retiradaQuem')} *</label>
            <input type="text" id="rt-quem" value="${esc(sessao.usuario.nome || '')}" maxlength="120" autocomplete="off">
          </div>
          <div class="form-group col-span-2">
            <label for="rt-nota">${t('lancNota')} <span class="np-opcional">${t('opcional')}</span></label>
            <input type="text" id="rt-nota" inputmode="numeric" maxlength="60" placeholder="${t('lancNotaPlaceholder')}" autocomplete="off">
          </div>
          ${fin ? `<div class="form-group col-span-2">
            <label class="emp-opcao-check"><input type="checkbox" id="rt-pago"> <span>${t('retiradaJaPago')}</span></label>
          </div>` : ''}
          <div class="form-group" id="rt-venc-grupo">
            <label for="rt-venc">${t('vencimentoPrimeiraLabel')} *</label>
            <input type="date" id="rt-venc" value="${maisXDiasISO(30)}">
          </div>
          <div class="form-group" id="rt-parc-grupo">
            <label for="rt-parcelas">${t('numParcelasLabel')} *</label>
            <input type="number" id="rt-parcelas" value="1" min="1" max="60" inputmode="numeric">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button class="btn-primary" id="salvar-retirada">${t('btnRegistrarRetirada')}</button>
      </div>
    </div>`)
  document.getElementById('rt-pago')?.addEventListener('change', e => {
    document.getElementById('rt-venc-grupo').hidden = e.target.checked
    document.getElementById('rt-parc-grupo').hidden = e.target.checked
  })
  document.getElementById('salvar-retirada')?.addEventListener('click', () => _salvarRetirada(fechar))
}

async function _salvarRetirada(fechar) {
  const fornecedor = document.getElementById('rt-fornecedor')?.value.trim()
  const valorFinal = Math.round(parseMoeda(document.getElementById('rt-valor')?.value || '') * 100) / 100
  const dataCompra = document.getElementById('rt-data')?.value
  const quem = document.getElementById('rt-quem')?.value.trim().slice(0, 120)
  const nota = document.getElementById('rt-nota')?.value.trim()
  const pago = !!document.getElementById('rt-pago')?.checked
  const venc1 = document.getElementById('rt-venc')?.value
  const numParc = parseInt(document.getElementById('rt-parcelas')?.value) || 1
  if (!fornecedor || !(valorFinal > 0) || !dataCompra || !quem || (!pago && !venc1)) {
    avisoNoFormulario('#modal-retirada', t('erroCamposObrigatorios'))
    return
  }
  if (['digito', 'tamanho'].includes(conferirNota(nota))) {
    prxToast(t(conferirNota(nota) === 'digito' ? 'notaDigitoErrado' : 'notaTamanhoErrado'), 'warning')
    return
  }
  if (!exigirConexao()) return
  mostrarSpinner()
  try {
    const lote = writeBatch(db)
    const destino = pago ? STATUS.PAGO : STATUS.ENTREGUE
    // Quem retirou: a própria pessoa (com o id) ou outro nome
    const euMesmo = quem === (sessao.usuario.nome || '')
    lote.update(doc(db, 'pedidos', D.pedidoId), {
      status: destino,
      fornecedorNome: fornecedor,
      valorFinal,
      condicaoPagamento: pago ? 'a_vista' : 'apos_recebimento',
      dataCompra,
      dataEntrega: dataCompra,
      retiradoPor: { id: euMesmo ? sessao.usuario.id : null, nome: quem },
      ...(nota ? { notaFiscal: nota } : {}),
      atualizadoEm: serverTimestamp(),
    })
    _historicoJunto(lote, STATUS.ENTREGUE, { chave: 'notaRetirada', dados: { quem, fornecedor, valor: formatCurrency(valorFinal) } })
    if (pago) _historicoJunto(lote, STATUS.PAGO, { chave: 'notaPagoNaCompra' })
    const n = pago ? 1 : numParc
    const valores = dividirEmParcelas(valorFinal, n)
    const datas = pago ? [dataCompra] : vencimentosMensais(venc1, n)
    valores.forEach((valor, i) => lote.set(doc(collection(db, 'pedidos', D.pedidoId, 'parcelas')), {
      numero: i + 1, total: n, valor, vencimento: datas[i],
      pago, pagoEm: pago ? serverTimestamp() : null, comprovante: null,
    }))
    await lote.commit()
    fechar()
    seloDeDecisao(destino)
    prxToast(t('retiradaRegistrada'), 'success')
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroRegistrarCompra')), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}

// ── R5: a autorização para mostrar ao fornecedor ──────────────
// PDF com o número, os itens, a placa, quem autorizou e até quando vale.
// No celular, abre o compartilhar (WhatsApp, e-mail); senão, baixa
export async function _gerarAutorizacao() {
  const p = D.pedido
  mostrarSpinner()
  try {
    const [{ jsPDF }, papel] = await Promise.all([carregarBiblioteca('jspdf'), import('./pdf-papel.js')])
    const ind = D.cotacoes.find(c => c.indicada)
    const aprovadoMs = p.aprovadoEm?.toMillis ? p.aprovadoEm.toMillis() : Date.now()
    const blob = await pdfDaAutorizacao(p, {
      texto: t,
      empresa: D.empresas.find(e => e.id === p.empresaId)?.nome || '',
      fornecedor: p.fornecedorNome || ind?.fornecedorNome || '',
      valor: formatCurrency(valorEmAprovacao(p, D.cotacoes)),
      validade: formatDate(validadeDaAutorizacao(p, aprovadoMs)),
      aprovador: p.aprovadoPorNome || '',
      aprovadoEm: new Date(aprovadoMs).toLocaleDateString('pt-BR'),
      solicitante: p.solicitanteNome || '',
      placa: p.veiculo?.placa ? placaParaExibir(p.veiculo.placa) : '',
      itens: itensDoPedido(p),
    }, { jsPDF, ...papel })
    const nome = `autorizacao-${(p.numeroPedido || 'pedido').toLowerCase()}.pdf`
    const arquivo = new File([blob], nome, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: `${t('autTitulo')} ${p.numeroPedido || ''}` }).catch(() => {})
    } else {
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: nome })
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    }
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroAutorizacao')), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
  }
}
