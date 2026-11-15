const { motivoDe } = require('./avisos')
const { dataBR } = require('./datas')

const APP_URL    = process.env.APP_URL   || 'https://praxis-af618.web.app'
const FROM_EMAIL = process.env.FROM_EMAIL || 'Praxis <onboarding@resend.dev>'

// ── Função principal ───────────────────────────────────────────
async function enviarEmail({ to, evento, pedido, usuario }) {
  const resendKey = process.env.RESEND_API_KEY || ''
  if (!to || !resendKey) return // E-mails desativados até a key ser configurada

  const template = modeloDoEmail(evento, pedido, usuario)
  if (!template) return

  try {
    const { Resend } = require('resend')
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from:    FROM_EMAIL,
      to:      [to],
      subject: template.subject,
      html:    _wrapLayout(template.subject, template.body, pedido?.id),
    })
  } catch (err) {
    console.error(`Erro ao enviar e-mail (${evento}) para ${to}:`, err.message)
  }
}

// ── Templates por evento ──────────────────────────────────────
// Título, nome e motivo vêm do que as pessoas digitaram: no HTML, sempre
// escapados. O assunto é texto puro e vai sem escape.
function _esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function modeloDoEmail(evento, pedido, usuario) {
  const tituloTxt = [pedido?.numeroPedido, pedido?.titulo || '(pedido)'].filter(Boolean).join(' · ')
  const titulo = _esc(tituloTxt)
  const nome   = _esc(usuario?.nome || 'usuário')
  const destaque = `<p style="font-size:1.1rem;font-weight:700">${titulo}</p>`
  const parcela  = pedido?.parcela
    ? `Parcela ${_esc(pedido.parcela.numero)}/${_esc(pedido.parcela.total)}`
    : ''
  const motivo = campo => {
    const m = pedido ? motivoDe(pedido, campo) : null
    return m ? `<p>Motivo: ${_esc(m)}</p>` : ''
  }

  const templates = {
    pedido_urgente: {
      subject: `🔴 Pedido urgente: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>Um pedido <strong>urgente</strong> precisa de atenção imediata:</p>${destaque}<p>Por favor, acesse o Praxis para verificar e tomar as ações necessárias.</p>`,
    },
    cotacoes_prontas: {
      subject: `Pedido aguarda aprovação: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>O pedido abaixo tem cotações prontas e aguarda sua aprovação:</p>${destaque}`,
    },
    pedido_aprovado: {
      subject: `✅ Pedido aprovado: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>Boa notícia! O pedido foi aprovado:</p>${destaque}`,
    },
    pedido_reprovado: {
      subject: `❌ Pedido reprovado: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>O pedido abaixo foi reprovado:</p>${destaque}${motivo('motivoReprovacao')}`,
    },
    pedido_cancelado: {
      subject: `Pedido cancelado: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>O pedido abaixo foi cancelado:</p>${destaque}${motivo('motivoCancelamento')}`,
    },
    pedido_comprado: {
      subject: `Pedido comprado: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>O pedido abaixo foi comprado e aguarda entrega:</p>${destaque}`,
    },
    parcela_vencendo: {
      subject: `⏰ Parcela a vencer: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>Uma parcela do pedido abaixo está próxima do vencimento:</p>${destaque}${parcela ? `<p>${parcela} — Vencimento: ${dataBR(pedido.parcela.vencimento)}</p>` : ''}`,
    },
    parcela_vencida: {
      subject: `🔴 Parcela vencida: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>Uma parcela do pedido abaixo está <strong>vencida</strong>:</p>${destaque}${parcela ? `<p>${parcela} — Venceu em: ${dataBR(pedido.parcela.vencimento)}</p>` : ''}`,
    },
    pedido_parado: {
      subject: `⚠️ Pedido sem comprador: ${tituloTxt}`,
      body:    `<p>Olá,</p><p>O pedido abaixo está parado sem comprador designado:</p>${destaque}<p>Por favor, verifique e atribua um comprador.</p>`,
    },
    mencao_comentario: {
      subject: `Você foi mencionado em um comentário`,
      body:    `<p>Olá ${nome},</p><p>Você foi mencionado em um comentário no pedido:</p>${destaque}`,
    },
  }

  return templates[evento] || null
}

// ── Layout HTML base ──────────────────────────────────────────
function _wrapLayout(titulo, corpo, pedidoId) {
  const ctaUrl = pedidoId ? `${APP_URL}?tela=detalhe&id=${encodeURIComponent(pedidoId)}` : APP_URL

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${_esc(titulo)}</title>
  <style>
    body { margin:0; padding:0; background:#f5f5f5; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; }
    .wrapper { max-width:560px; margin:32px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 16px rgba(0,0,0,0.08); }
    .header { background:#0C0C0C; padding:24px 32px; text-align:center; }
    .logo { font-family:monospace; font-size:1.4rem; font-weight:700; letter-spacing:0.1em; color:#F0EDE6; }
    .logo .delta { color:#C8A96E; }
    .body { padding:32px; color:#333; font-size:0.95rem; line-height:1.65; }
    .cta { display:inline-block; background:linear-gradient(135deg,#D4B474,#C8A96E,#B8924A); color:#0A0A0A !important; font-weight:700; padding:12px 28px; border-radius:20px; text-decoration:none; margin:20px 0; font-size:0.9rem; }
    .footer { background:#0C0C0C; padding:16px 32px; text-align:center; }
    .footer-brand { font-family:monospace; font-size:0.65rem; font-weight:700; letter-spacing:0.12em; color:#c44a5a; }
    .footer-by { font-size:0.65rem; color:rgba(255,255,255,0.28); margin-top:2px; }
    p { margin:0 0 12px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo">PR<span class="delta">▲</span>XIS</div>
    </div>
    <div class="body">
      ${corpo}
      <a href="${ctaUrl}" class="cta">Ver pedido no Praxis →</a>
    </div>
    <div class="footer">
      <div class="footer-brand">AFN SYSTEMS</div>
      <div class="footer-by">by Alyssom Fernandes</div>
    </div>
  </div>
</body>
</html>
  `.trim()
}

module.exports = { enviarEmail, modeloDoEmail }
