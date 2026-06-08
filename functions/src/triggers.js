const { onDocumentWritten, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const admin = require('firebase-admin')
const { enviarEmail } = require('./email')
const { criarNotificacao, buscarUsuariosPorPerfil } = require('./utils')

const db = admin.firestore()

// ── setUserClaims ──────────────────────────────────────────────
// Trigger: ao criar ou atualizar um documento em /usuarios/{userId}
// Seta Custom Claims no Firebase Auth com perfil e empresas
exports.setUserClaims = onDocumentWritten(
  { document: 'usuarios/{userId}', region: 'southamerica-east1' },
  async (event) => {
    const userId = event.params.userId
    const data   = event.data?.after?.data()

    if (!data) {
      // Documento deletado — limpa claims
      try {
        await admin.auth().setCustomUserClaims(userId, {})
      } catch (err) {
        console.error('setUserClaims delete error:', err)
      }
      return
    }

    try {
      await admin.auth().setCustomUserClaims(userId, {
        perfil:   data.perfil   || '',
        empresas: data.empresas || [],
      })
      console.log(`Claims setadas para ${userId}: perfil=${data.perfil}`)
    } catch (err) {
      console.error('setUserClaims error:', err)
    }
  }
)

// ── onPedidoStatusChange ───────────────────────────────────────
// Trigger: ao atualizar /pedidos/{pedidoId}
// Detecta mudança de status e dispara notificações + e-mails
exports.onPedidoStatusChange = onDocumentUpdated(
  { document: 'pedidos/{pedidoId}', region: 'southamerica-east1' },
  async (event) => {
    const antes  = event.data.before.data()
    const depois = event.data.after.data()
    const pedidoId = event.params.pedidoId

    if (antes.status === depois.status) return // Nenhuma mudança de status

    const statusAnt = antes.status
    const statusNov = depois.status
    const pedido    = { id: pedidoId, ...depois }

    console.log(`Pedido ${pedidoId}: ${statusAnt} → ${statusNov}`)

    try {
      await _despacharNotificacoes(pedido, statusAnt, statusNov)
    } catch (err) {
      console.error('onPedidoStatusChange error:', err)
    }
  }
)

// ── Despacho de notificações por transição ────────────────────
async function _despacharNotificacoes(pedido, statusAnt, statusNov) {
  const empresaId = pedido.empresaId

  switch (statusNov) {

    // Ag. cotação — notifica compradores
    case 'ag_cotacao': {
      const compradores = await buscarUsuariosPorPerfil(['comprador', 'gestor', 'supremo'], empresaId)
      const urgente = pedido.urgente ? ' 🔴 URGENTE' : ''
      await Promise.all(compradores.map(u =>
        criarNotificacao(u.id, {
          evento:   'ag_cotacao',
          titulo:   `Novo pedido disponível${urgente}`,
          corpo:    `"${pedido.titulo}" aguarda um comprador.`,
          pedidoId: pedido.id,
        })
      ))
      // E-mail apenas se urgente
      if (pedido.urgente) {
        const gestores = await buscarUsuariosPorPerfil(['gestor', 'supremo'], empresaId)
        await Promise.all(gestores.map(u =>
          criarNotificacao(u.id, {
            evento:   'pedido_urgente',
            titulo:   '🔴 Pedido urgente aberto',
            corpo:    `"${pedido.titulo}" precisa de atenção imediata.`,
            pedidoId: pedido.id,
          })
        ))
        const emailList = gestores.concat(await buscarUsuariosPorPerfil(['aprovador'], empresaId))
        await Promise.all(emailList.map(u =>
          enviarEmail({ to: u.email, evento: 'pedido_urgente', pedido, usuario: u })
        ))
      }
      break
    }

    // Em aprovação — notifica aprovadores
    case 'em_aprovacao': {
      const aprovadores = await buscarUsuariosPorPerfil(['aprovador', 'gestor', 'supremo'], empresaId)
      await Promise.all(aprovadores.map(u =>
        criarNotificacao(u.id, {
          evento:   'cotacoes_prontas',
          titulo:   'Pedido aguarda aprovação',
          corpo:    `"${pedido.titulo}" tem cotações prontas para análise.`,
          pedidoId: pedido.id,
        })
      ))
      await Promise.all(aprovadores.map(u =>
        enviarEmail({ to: u.email, evento: 'cotacoes_prontas', pedido, usuario: u })
      ))
      break
    }

    // Aprovado — notifica solicitante e comprador
    case 'aprovado': {
      const destinatarios = await _buscarSolicitanteEComprador(pedido)
      await Promise.all(destinatarios.map(u =>
        criarNotificacao(u.id, {
          evento:   'pedido_aprovado',
          titulo:   'Pedido aprovado! ✅',
          corpo:    `"${pedido.titulo}" foi aprovado.`,
          pedidoId: pedido.id,
        })
      ))
      await Promise.all(destinatarios.map(u =>
        enviarEmail({ to: u.email, evento: 'pedido_aprovado', pedido, usuario: u })
      ))
      // Notifica aprovadores que "perderam" (os que ainda não aprovaram)
      if (pedido.aprovadorIds?.length > 1) {
        const outros = await Promise.all(
          (pedido.aprovadorIds || [])
            .filter(id => id !== pedido.aprovadoPor)
            .map(id => db.collection('usuarios').doc(id).get()
              .then(s => s.exists ? { id: s.id, ...s.data() } : null))
        )
        await Promise.all(outros.filter(Boolean).map(u =>
          criarNotificacao(u.id, {
            evento:   'pedido_aprovado',
            titulo:   'Pedido já aprovado',
            corpo:    `"${pedido.titulo}" já foi aprovado por outro aprovador.`,
            pedidoId: pedido.id,
          })
        ))
      }
      break
    }

    // Reprovado — notifica solicitante e comprador
    case 'reprovado': {
      const destinatarios = await _buscarSolicitanteEComprador(pedido)
      const motivo = pedido.motivoReprovacao === 'Outros'
        ? pedido.motivoReprovacaoOutros
        : pedido.motivoReprovacao
      await Promise.all(destinatarios.map(u =>
        criarNotificacao(u.id, {
          evento:   'pedido_reprovado',
          titulo:   'Pedido reprovado ❌',
          corpo:    `"${pedido.titulo}" foi reprovado. Motivo: ${motivo || '—'}`,
          pedidoId: pedido.id,
        })
      ))
      await Promise.all(destinatarios.map(u =>
        enviarEmail({ to: u.email, evento: 'pedido_reprovado', pedido, usuario: u })
      ))
      break
    }

    // Cancelado — notifica todos os envolvidos
    case 'cancelado': {
      const envolvidos = await _buscarEnvolvidos(pedido)
      await Promise.all(envolvidos.map(u =>
        criarNotificacao(u.id, {
          evento:   'pedido_cancelado',
          titulo:   'Pedido cancelado',
          corpo:    `"${pedido.titulo}" foi cancelado.`,
          pedidoId: pedido.id,
        })
      ))
      await Promise.all(envolvidos.map(u =>
        enviarEmail({ to: u.email, evento: 'pedido_cancelado', pedido, usuario: u })
      ))
      break
    }

    // Comprado — notifica financeiro e gestores
    case 'comprado': {
      const fins = await buscarUsuariosPorPerfil(['financeiro', 'gestor', 'supremo'], empresaId)
      await Promise.all(fins.map(u =>
        criarNotificacao(u.id, {
          evento:   'pedido_comprado',
          titulo:   'Pedido comprado',
          corpo:    `"${pedido.titulo}" foi comprado. Aguardando entrega.`,
          pedidoId: pedido.id,
        })
      ))
      await Promise.all(fins.map(u =>
        enviarEmail({ to: u.email, evento: 'pedido_comprado', pedido, usuario: u })
      ))
      break
    }

    // Entregue — notifica financeiro e solicitante
    case 'entregue': {
      const fins = await buscarUsuariosPorPerfil(['financeiro'], empresaId)
      await Promise.all(fins.map(u =>
        criarNotificacao(u.id, {
          evento:   'pedido_entregue',
          titulo:   'Pedido entregue',
          corpo:    `"${pedido.titulo}" foi entregue. Confirme o pagamento.`,
          pedidoId: pedido.id,
        })
      ))
      // Notifica solicitante
      if (pedido.solicitanteId) {
        await criarNotificacao(pedido.solicitanteId, {
          evento:   'pedido_entregue_solic',
          titulo:   'Seu pedido foi entregue! 📦',
          corpo:    `"${pedido.titulo}" chegou.`,
          pedidoId: pedido.id,
        })
      }
      break
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────
async function _buscarSolicitanteEComprador(pedido) {
  const ids = [pedido.solicitanteId, pedido.compradorId].filter(Boolean)
  const snapshots = await Promise.all(ids.map(id => db.collection('usuarios').doc(id).get()))
  return snapshots.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }))
}

async function _buscarEnvolvidos(pedido) {
  const ids = [
    pedido.solicitanteId,
    pedido.compradorId,
    ...(pedido.aprovadorIds || []),
  ].filter(Boolean)
  const unique = [...new Set(ids)]
  const snapshots = await Promise.all(unique.map(id => db.collection('usuarios').doc(id).get()))
  return snapshots.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }))
}
