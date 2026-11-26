// Requisição (R4), autoaprovação (A4) e a autorização para mostrar ao
// fornecedor (R5). As contas não tocam Firebase nem DOM (os testes de
// unidade as usam); o PDF usa o jsPDF do próprio site (vendor/). As regras
// do Firestore conferem o mesmo: cabeNoLimite, autoAprova e requisicaoValida.

// Opção da empresa ({ ativa, limite }; limite null é sem limite) e o valor
export function cabeNoLimite(op, valor) {
  if (op?.ativa !== true) return false
  return op.limite == null || (typeof valor === 'number' && valor <= op.limite)
}

// O valor que a aprovação olha: o estimado da requisição ou o da cotação indicada
export function valorEmAprovacao(pedido, cotacoes = []) {
  if (pedido?.requisicao) return pedido.valorEstimado ?? null
  return cotacoes.find(c => c.indicada)?.valor ?? null
}

// A4: quem abriu o pedido pode aprová-lo se a empresa deixa e o valor cabe
// (nunca quem cotou, nem com alçada)
export function autoAprovaPermitida(pedido, usuario, empresa, cotacoes = []) {
  if (!pedido || !usuario?.id || pedido.solicitanteId !== usuario.id) return false
  if (pedido.compradorId === usuario.id || pedido.aprovacao) return false
  return cabeNoLimite(empresa?.autoAprovacao, valorEmAprovacao(pedido, cotacoes))
}

// Até quando a autorização vale: o prazo do pedido, se for depois de uma
// semana da aprovação; senão, uma semana
export function validadeDaAutorizacao(pedido, aprovadoEmMs) {
  const base = new Date(aprovadoEmMs || Date.now())
  base.setDate(base.getDate() + 7)
  const semana = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`
  return pedido?.dataNecessaria && pedido.dataNecessaria > semana ? pedido.dataNecessaria : semana
}

// ── R5: o PDF da autorização ──────────────────────────────────
// `dados`: { empresa, aprovador, solicitante, fornecedor, valor, validade,
// aprovadoEm, itens, placa, texto } (texto = t do app). Devolve o Blob
export async function pdfDaAutorizacao(p, dados, { jsPDF, PAPEL, desenharSimbolo, textoEspacado }) {
  const t = dados.texto
  const pdf = new jsPDF({ unit: 'mm', format: 'a5' })
  const M = 14, LARG = 148 - M * 2
  const COR = PAPEL
  const fonte = (tam, estilo = 'normal') => { pdf.setFont('helvetica', estilo); pdf.setFontSize(tam) }
  const cor = c => pdf.setTextColor(...c)
  const fio = yy => { pdf.setDrawColor(...COR.tinta); pdf.setLineWidth(0.5); pdf.line(M, yy, M + LARG, yy) }
  pdf.setProperties({ title: `${t('autTitulo')} ${p.numeroPedido || ''}`, author: 'Praxis', creator: 'Praxis' })

  let y = 12
  desenharSimbolo(pdf, M, y, 8, COR.terracota, COR.branco)
  fonte(13); cor(COR.tinta)
  textoEspacado(pdf, 'PRAXIS', M + 11, y + 7.4, 1.6)
  fonte(11, 'bold')
  textoEspacado(pdf, p.numeroPedido || '', M + LARG, y + 4, 0.5, true)
  fonte(7.5); cor(COR.texto3)
  pdf.text(dados.empresa || '', M + LARG, y + 8.5, { align: 'right' })
  y += 12; fio(y); y += 8

  fonte(14, 'bold'); cor(COR.tinta)
  pdf.text(t('autTitulo'), M, y)
  y += 5.5
  fonte(8.5); cor(COR.texto2)
  const intro = pdf.splitTextToSize(t('autIntro', { fornecedor: dados.fornecedor || '—' }), LARG)
  pdf.text(intro, M, y, { lineHeightFactor: 1.35 })
  y += intro.length * 4 + 3

  // Itens
  fonte(7.4, 'bold'); cor(COR.texto3)
  pdf.text(t('dtItens').toUpperCase(), M, y); y += 2
  pdf.setDrawColor(...COR.linha); pdf.setLineWidth(0.2)
  dados.itens.forEach(i => {
    fonte(9); cor(COR.tinta)
    const desc = pdf.splitTextToSize(i.descricao, LARG - 28)
    pdf.text(desc, M, y + 4.2)
    fonte(9, 'bold')
    pdf.text(`${String(i.quantidade).replace('.', ',')} ${i.unidade}`, M + LARG, y + 4.2, { align: 'right' })
    y += Math.max(1, desc.length) * 4.2 + 2.2
    pdf.line(M, y, M + LARG, y)
  })
  y += 5

  // Dados da autorização, dois por linha
  const pares = [
    [t('autValor'), dados.valor || '—'], [t('autValidade'), dados.validade || '—'],
    [t('autAutorizadoPor'), dados.aprovador || '—'], [t('autEm'), dados.aprovadoEm || '—'],
    [t('autPedidoPor'), dados.solicitante || '—'], [t('metaVeiculo'), dados.placa || '—'],
  ]
  for (let i = 0; i < pares.length; i += 2) {
    ;[pares[i], pares[i + 1]].forEach(([rot, val], k) => {
      const x = M + k * (LARG / 2)
      fonte(7.2, 'bold'); cor(COR.texto3); pdf.text(rot.toUpperCase(), x, y)
      fonte(10, 'bold'); cor(COR.tinta); pdf.text(String(val), x, y + 5)
    })
    y += 12
  }
  y += 2; fio(y); y += 5
  fonte(7.5); cor(COR.texto3)
  pdf.text(pdf.splitTextToSize(t('autRodape'), LARG), M, y, { lineHeightFactor: 1.35 })
  return pdf.output('blob')
}
