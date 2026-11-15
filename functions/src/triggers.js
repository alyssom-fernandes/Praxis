const { onDocumentWritten, onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { getAuth } = require('firebase-admin/auth')
const { entregarAvisos } = require('./utils')
const { planoDoPedido, chaveAviso } = require('./avisos')

// ── setUserClaims ──────────────────────────────────────────────
// Trigger: ao criar ou atualizar um documento em /usuarios/{userId}
// Seta Custom Claims no Firebase Auth com perfil e empresas
exports.setUserClaims = onDocumentWritten(
  { document: 'usuarios/{userId}', region: 'southamerica-east1' },
  async (event) => {
    const userId = event.params.userId
    const data   = event.data?.after?.data()

    if (!data || data.ativo === false) {
      // Documento apagado ou usuário desativado: limpa as claims (as regras
      // também negam o perfil de quem está inativo)
      try {
        await getAuth().setCustomUserClaims(userId, {})
      } catch (err) {
        console.error('setUserClaims delete error:', err)
      }
      return
    }

    try {
      await getAuth().setCustomUserClaims(userId, {
        perfil:   data.perfil   || '',
        empresas: data.empresas || [],
      })
      console.log(`Claims setadas para ${userId}: perfil=${data.perfil}`)
    } catch (err) {
      console.error('setUserClaims error:', err)
    }
  }
)

// ── Avisos do pedido ──────────────────────────────────────────
// O que cada mudança avisa, e a quem, está em src/avisos.js (planoDoPedido).
// O ID do evento é a chave de idempotência: se o gatilho for entregue duas
// vezes, os avisos saem uma vez só.
async function _avisar(event, antes, depois) {
  const pedido = { id: event.params.pedidoId, ...depois }
  try {
    await entregarAvisos(chaveAviso('evt', event.id), planoDoPedido(antes, pedido), pedido)
  } catch (err) {
    console.error(`Avisos do pedido ${pedido.id}:`, err)
  }
}

// Pedido aberto: avisa a fila de compra (com e-mail, se urgente)
exports.onPedidoCriado = onDocumentCreated(
  { document: 'pedidos/{pedidoId}', region: 'southamerica-east1' },
  async (event) => {
    if (!event.data) return
    await _avisar(event, null, event.data.data())
  }
)

// Pedido alterado: comprador assumiu ou devolveu, urgência marcada depois e
// mudanças de etapa
exports.onPedidoAtualizado = onDocumentUpdated(
  { document: 'pedidos/{pedidoId}', region: 'southamerica-east1' },
  async (event) => {
    await _avisar(event, event.data.before.data(), event.data.after.data())
  }
)
