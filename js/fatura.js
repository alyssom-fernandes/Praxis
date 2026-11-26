// Fatura do fornecedor (R6): quem é do financeiro escolhe as compras
// entregues do mesmo fornecedor, na mesma empresa, e registra um pagamento
// só; cada pedido fica como pago, com as parcelas pagas e a entrada no
// histórico. Opcional por empresa (empresa.faturaMensal.ativa). Não muda as
// regras: o pagamento de cada parcela e de cada pedido já é do financeiro.
import {
  db, doc, collection, where, getDocs, writeBatch, serverTimestamp, consulta,
} from './firebase.js'
import { sessao } from './estado.js'
import { prxToast, mostrarSpinner, esconderSpinner, exigirConexao, abrirModal, fecharModal } from './ui.js'
import { STATUS, t } from './constants.js'
import { esc, formatCurrency, formatDate, mensagemDeErro } from './utils.js'
import { comprasDaFatura } from './requisicao.js'
import { ICO } from './pedido-detalhe.js'

export async function abrirFatura(base) {
  if (!exigirConexao()) return
  mostrarSpinner()
  let lista
  try {
    const snap = await getDocs(consulta(collection(db, 'pedidos'),
      where('empresaId', '==', base.empresaId), where('status', '==', STATUS.ENTREGUE)))
    lista = comprasDaFatura(snap.docs.map(d => ({ id: d.id, ...d.data() })), base, sessao.usuario)
      .sort((a, b) => String(a.dataCompra || '').localeCompare(String(b.dataCompra || '')))
  } catch (err) {
    prxToast(mensagemDeErro(err, t('erroCarregar')), 'error')
    return
  } finally {
    esconderSpinner()
  }

  document.getElementById('modal-fatura')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.id = 'modal-fatura'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'fat-titulo')
  overlay.innerHTML = `
    <div class="modal fat-modal">
      <div class="modal-header">
        <div class="np-head">
          <h2 id="fat-titulo">${t('fatTitulo')}</h2>
          <p class="np-sub">${esc(base.fornecedorNome || '')}</p>
        </div>
        <button type="button" class="btn-icon" data-fechar aria-label="${t('fechar')}">${ICO.fechar}</button>
      </div>
      <div class="modal-body">
        <p class="modal-intro">${t('fatIntro')}</p>
        <ul class="fat-lista">
          ${lista.map(p => `
            <li><label class="fat-linha">
              <input type="checkbox" value="${esc(p.id)}" data-valor="${Number(p.valorFinal) || 0}" checked>
              <span class="fat-num">${esc(p.numeroPedido || '')}</span>
              <span class="fat-tit">${esc(p.titulo || '')}</span>
              <span class="fat-data">${p.dataCompra ? formatDate(p.dataCompra) : ''}</span>
              <span class="fat-valor">${formatCurrency(Number(p.valorFinal) || 0)}</span>
            </label></li>`).join('')}
        </ul>
        <p class="fat-total" aria-live="polite"></p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button class="btn-primary" id="fat-pagar">${t('fatPagar')}</button>
      </div>
    </div>`
  document.body.appendChild(overlay)
  const fechar = () => { fecharModal('modal-fatura'); setTimeout(() => overlay.remove(), 250) }
  overlay.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar))
  const marcados = () => [...overlay.querySelectorAll('.fat-lista input:checked')]
  const somar = () => {
    const m = marcados()
    const total = m.reduce((s, c) => s + Number(c.dataset.valor), 0)
    overlay.querySelector('.fat-total').textContent = t(m.length === 1 ? 'fatTotal1' : 'fatTotal', { n: m.length, valor: formatCurrency(total) })
    overlay.querySelector('#fat-pagar').disabled = !m.length
  }
  overlay.querySelector('.fat-lista').addEventListener('change', somar)
  somar()
  overlay.querySelector('#fat-pagar').addEventListener('click', async () => {
    const ids = marcados().map(c => c.value)
    const total = marcados().reduce((s, c) => s + Number(c.dataset.valor), 0)
    if (!ids.length || !exigirConexao()) return
    mostrarSpinner()
    let pagos = 0
    try {
      // Um pedido por vez: as parcelas em aberto e, depois, o pedido com a
      // entrada do histórico (lotes pequenos, longe do limite das regras)
      for (const id of ids) {
        const parcelas = await getDocs(collection(db, 'pedidos', id, 'parcelas'))
        const abertas = parcelas.docs.filter(d => !d.data().pago)
        if (abertas.length) {
          const lote = writeBatch(db)
          abertas.forEach(d => lote.update(d.ref, { pago: true, pagoEm: serverTimestamp() }))
          await lote.commit()
        }
        const lote = writeBatch(db)
        lote.update(doc(db, 'pedidos', id), { status: STATUS.PAGO, atualizadoEm: serverTimestamp() })
        lote.set(doc(collection(db, 'pedidos', id, 'historico')), {
          status: STATUS.PAGO, autorId: sessao.usuario.id, autorNome: sessao.usuario.nome || null, nota: null,
          notaChave: 'notaPagoNaFatura', notaDados: { fornecedor: base.fornecedorNome || '', n: ids.length, valor: formatCurrency(total) },
          criadoEm: serverTimestamp(),
        })
        await lote.commit()
        pagos++
      }
      fechar()
      prxToast(t(pagos === 1 ? 'fatPaga1' : 'fatPaga', { n: pagos, valor: formatCurrency(total) }), 'success')
    } catch (err) {
      console.error(err)
      prxToast(pagos ? t(pagos === 1 ? 'fatParcial1' : 'fatParcial', { n: pagos }) : mensagemDeErro(err, t('erroConfirmarPagamento')), 'error')
    } finally {
      esconderSpinner()
    }
  })
  abrirModal('modal-fatura')
}
