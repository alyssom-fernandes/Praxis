// Relatórios: exportação em Excel e PDF e a versão para imprimir
// (ver js/relatorios.js).
import { prxToast, carregarBiblioteca, estaOnline } from './ui.js'
import { STATUS_LABEL, t } from './constants.js'
import { formatDate, baixarArquivo } from './utils.js'
import { PAPEL, desenharSimbolo, larguraEspacada, textoEspacado } from './pdf-papel.js'
import {
  tr, _locale, ORDEM_STATUS, TONS_PAPEL, _tonsDaLista, _podeVerFinanceiro, _pad, _iso, _hoje,
  _diasEntre, _dataPedido, _capital, _intervalo, _brl, _brlCompacto, _pct, _nomeEmpresa,
  _nomeCategoria, _plural, _calcular, _leituraMeses,
} from './relatorios.js'
import { R } from './relatorios-estado.js'

// ── Exportações ───────────────────────────────────────────────
export const _hex = rgb => 'FF' + rgb.map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()

export function _nomeArquivo(ext) {
  const iv = _intervalo()
  return `praxis-relatorio-${iv.ini}_a_${iv.fim}.${ext}`
}

export const _dataUTC = d => `${_pad(d.getUTCDate())}/${_pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`

export function _linhasExport(D) {
  return D.ped.map(p => {
    const d = _dataPedido(p)
    return {
      num: p.numeroPedido || '',
      titulo: p.titulo || '',
      empresa: _nomeEmpresa(p.empresaId),
      categoria: _nomeCategoria(p.categoriaId),
      status: STATUS_LABEL[p.status] || p.status || '',
      urgente: p.urgente ? tr('sim') : tr('nao'),
      data: d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null,
      estimado: Number(p.valorEstimado) || null,
      final: Number(p.valorFinal) || null,
    }
  })
}

export async function _comBotao(fn) {
  const btn = document.getElementById('btn-exportar')
  if (btn) { btn.disabled = true; btn.classList.add('loading') }
  try { await fn() } catch (err) {
    console.warn('Relatórios: falha na exportação', err)
    prxToast(estaOnline() ? tr('erroExport') : t('semConexaoAcao'), 'error')
  } finally { if (btn) { btn.disabled = false; btn.classList.remove('loading') } }
}

export async function _exportarExcel() {
  if (!_podeVerFinanceiro()) { prxToast(tr('semPermissao'), 'warning'); return }
  await _comBotao(async () => {
    const ExcelJS = await carregarBiblioteca('exceljs')
    const D = _calcular()
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Praxis'; wb.created = new Date()
    const C = {
      tinta: _hex(PAPEL.tinta), texto3: _hex(PAPEL.texto3), terracota: _hex(PAPEL.terracota),
      argila: _hex(PAPEL.argila), argilaClara: _hex(PAPEL.argilaClara), linha: _hex(PAPEL.linha), linhaForte: _hex(PAPEL.linhaForte),
    }
    const FONTE = 'Calibri'
    const FMT_BRL = '"R$" #,##0.00;-"R$" #,##0.00'
    const FMT_DATA = 'dd/mm/yyyy'
    const solido = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
    // Cabeçalho de tabela: argila com o fio de tinta embaixo, como nas inscrições
    const cabecalho = row => {
      row.height = 22
      row.eachCell(c => {
        c.font = { name: FONTE, bold: true, color: { argb: C.tinta }, size: 10 }
        c.fill = solido(C.argila)
        c.border = { bottom: { style: 'medium', color: { argb: C.tinta } } }
        c.alignment = { vertical: 'middle', horizontal: c.alignment?.horizontal || 'left' }
      })
    }
    const zebra = (ws, de, ate, cols) => {
      for (let r = de; r <= ate; r++) {
        const row = ws.getRow(r)
        for (let c = 1; c <= cols; c++) {
          const cel = row.getCell(c)
          cel.font = { name: FONTE, size: 10, color: { argb: C.tinta } }
          cel.border = { bottom: { style: 'thin', color: { argb: C.linha } } }
          if ((r - de) % 2 === 1) cel.fill = solido(C.argilaClara)
        }
      }
    }
    const totais = row => row.eachCell({ includeEmpty: true }, c => {
      c.font = { name: FONTE, bold: true, size: 10, color: { argb: C.tinta } }
      c.border = { top: { style: 'thin', color: { argb: C.tinta } } }
      c.fill = solido(C.argila)
    })
    const emp = R.filtroEmp === 'todas' ? tr('todas') : _nomeEmpresa(R.filtroEmp)

    // Ordem das abas: Resumo, Pedidos, Parcelas
    const wr = wb.addWorksheet(tr('resumo'), { properties: { tabColor: { argb: C.terracota } }, views: [{ showGridLines: false }] })

    // Aba Pedidos
    const ws = wb.addWorksheet(tr('abaPedidos'), { properties: { tabColor: { argb: C.tinta } }, views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = [
      { header: tr('colNum'), key: 'num', width: 12 },
      { header: tr('colTitulo'), key: 'titulo', width: 44 },
      { header: tr('colEmpresa'), key: 'empresa', width: 24 },
      { header: tr('colCategoria'), key: 'categoria', width: 20 },
      { header: tr('colStatus'), key: 'status', width: 15 },
      { header: tr('colUrgente'), key: 'urgente', width: 10 },
      { header: tr('colCriado'), key: 'data', width: 13, style: { numFmt: FMT_DATA } },
      { header: tr('colEstimado'), key: 'estimado', width: 17, style: { numFmt: FMT_BRL } },
      { header: tr('colFinal'), key: 'final', width: 17, style: { numFmt: FMT_BRL } },
    ]
    const linhas = _linhasExport(D)
    linhas.forEach(l => ws.addRow(l))
    const n = linhas.length
    zebra(ws, 2, n + 1, 9)
    ;['estimado', 'final'].forEach(k => { ws.getColumn(k).alignment = { horizontal: 'right' } })
    ws.getColumn('data').alignment = { horizontal: 'center' }
    ws.getColumn('urgente').alignment = { horizontal: 'center' }
    cabecalho(ws.getRow(1))
    if (n) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: n + 1, column: 9 } }
      const somaE = linhas.reduce((s, l) => s + (l.estimado || 0), 0)
      const somaF = linhas.reduce((s, l) => s + (l.final || 0), 0)
      const tot = ws.addRow({ num: tr('total'), titulo: _plural(n, tr('pedido'), tr('pedidos')) })
      tot.getCell('estimado').value = { formula: `SUM(H2:H${n + 1})`, result: somaE }
      tot.getCell('final').value = { formula: `SUM(I2:I${n + 1})`, result: somaF }
      totais(tot)
    }

    // Aba Parcelas (em aberto e próximas)
    const wp = wb.addWorksheet(tr('abaParcelas'), { properties: { tabColor: { argb: C.linhaForte } }, views: [{ state: 'frozen', ySplit: 1 }] })
    wp.columns = [
      { header: tr('colVenc'), key: 'venc', width: 13, style: { numFmt: FMT_DATA, alignment: { horizontal: 'center' } } },
      { header: tr('colNum'), key: 'num', width: 12 },
      { header: tr('colTitulo'), key: 'titulo', width: 44 },
      { header: tr('colEmpresa'), key: 'empresa', width: 24 },
      { header: tr('colParcela'), key: 'parc', width: 10, style: { alignment: { horizontal: 'center' } } },
      { header: tr('colValor'), key: 'valor', width: 17, style: { numFmt: FMT_BRL, alignment: { horizontal: 'right' } } },
      { header: tr('colSituacao'), key: 'sit', width: 13 },
    ]
    D.abertas.forEach(pc => {
      const p = R.todos.find(x => x.id === pc.pedidoId)
      const diff = _diasEntre(_iso(_hoje()), pc.vencimento)
      const [vy, vm, vd] = pc.vencimento.split('-').map(Number)
      wp.addRow({ venc: new Date(Date.UTC(vy, vm - 1, vd)), num: p?.numeroPedido || '', titulo: p?.titulo || '', empresa: _nomeEmpresa(p?.empresaId),
        parc: `${pc.numero}/${pc.total}`, valor: Number(pc.valor) || 0, sit: diff < 0 ? tr('vencida') : tr('aberta') })
    })
    const m = D.abertas.length
    zebra(wp, 2, m + 1, 7)
    for (let r = 2; r <= m + 1; r++) {
      const sit = wp.getRow(r).getCell('sit')
      if (sit.value === tr('vencida')) sit.font = { name: FONTE, size: 10, bold: true, color: { argb: _hex([179, 38, 30]) } }
    }
    cabecalho(wp.getRow(1))
    if (m) {
      wp.autoFilter = { from: { row: 1, column: 1 }, to: { row: m + 1, column: 7 } }
      const tot = wp.addRow({ venc: null, num: tr('total'), titulo: _plural(m, tr('parcela1'), tr('parcelaN')) })
      tot.getCell('valor').value = { formula: `SUM(F2:F${m + 1})`, result: D.abertas.reduce((s, p) => s + (Number(p.valor) || 0), 0) }
      totais(tot)
    }

    // Aba Resumo: letreiro, período e as tabelas da tela
    wb.views = [{ activeTab: 0 }]
    wr.columns = [{ width: 34 }, { width: 20 }, { width: 12 }, { width: 10 }]
    const r1 = wr.addRow(['PRAXIS'])
    r1.height = 30
    r1.getCell(1).font = { name: FONTE, size: 20, bold: true, color: { argb: C.tinta } }
    const r2 = wr.addRow([tr('relatorioCompras')])
    r2.getCell(1).font = { name: FONTE, size: 12, bold: true, color: { argb: C.terracota } }
    for (let c = 1; c <= 4; c++) r2.getCell(c).border = { bottom: { style: 'medium', color: { argb: C.tinta } } }
    wr.addRow([])
    wr.addRow([tr('periodo'), `${D.iv.nome} (${formatDate(D.iv.ini)} ${tr('a')} ${formatDate(D.iv.fim)})`])
    wr.addRow([tr('empresa'), emp])
    const ag = new Date()
    wr.addRow([tr('geradoEm'), `${formatDate(_iso(ag))} ${_pad(ag.getHours())}:${_pad(ag.getMinutes())}`])
    ;[4, 5, 6].forEach(r => {
      wr.getRow(r).getCell(1).font = { name: FONTE, size: 10, color: { argb: C.texto3 } }
      wr.getRow(r).getCell(2).font = { name: FONTE, size: 10, color: { argb: C.tinta } }
      wr.getRow(r).getCell(2).alignment = { horizontal: 'left' }
    })
    wr.addRow([])
    const secao = (titulos, linhasSec, fmts) => {
      cabecalho(wr.addRow(titulos))
      const de = wr.rowCount + 1
      linhasSec.forEach(l => {
        const r = wr.addRow(l)
        fmts.forEach((f, i) => { if (f) r.getCell(i + 1).numFmt = f })
        for (let i = 2; i <= l.length; i++) r.getCell(i).alignment = { horizontal: 'right' }
      })
      zebra(wr, de, wr.rowCount, titulos.length)
      wr.addRow([])
      return de
    }
    const totalV7 = D.vencer7.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const ini = secao([tr('indicador'), tr('colValor')], [
      [tr('kGasto'), D.gasto], [tr('kPedidos'), D.ped.length], [tr('kAprov'), D.emAprov.length],
      [tr('kEconomia'), D.economia], [tr('kVencer'), totalV7],
    ], [null, null])
    ;[0, 3, 4].forEach(k => { wr.getRow(ini + k).getCell(2).numFmt = FMT_BRL })
    // O gasto é o destaque, em terracota, como na tela
    wr.getRow(ini).getCell(2).font = { name: FONTE, size: 10, bold: true, color: { argb: C.terracota } }
    const totEmp = D.porEmpresa.reduce((s, x) => s + x.valor, 0) || 1
    secao([tr('colEmpresa'), tr('kGasto'), tr('colQtd'), tr('colPct')],
      D.porEmpresa.map(x => [_nomeEmpresa(x.id), x.valor, x.qtd, x.valor / totEmp]), [null, FMT_BRL, null, '0%'])
    const totCat = D.porCategoria.reduce((s, x) => s + x.valor, 0) || 1
    secao([tr('colCategoria'), tr('kGasto'), tr('colQtd'), tr('colPct')],
      D.porCategoria.map(x => [_nomeCategoria(x.id), x.valor, x.qtd, x.valor / totCat]), [null, FMT_BRL, null, '0%'])
    const totF = D.porFornecedor.reduce((s, x) => s + x.valor, 0) || 1
    secao([_capital(tr('fornecedor1')), tr('kGasto'), tr('colQtd'), tr('colPct')],
      D.porFornecedor.map(x => [x.id || tr('semFornecedor'), x.valor, x.qtd, x.valor / totF]), [null, FMT_BRL, null, '0%'])
    secao([tr('colStatus'), tr('colQtd')], ORDEM_STATUS.filter(s => D.porStatus[s]).map(s => [STATUS_LABEL[s], D.porStatus[s]]), [null, null])

    // Impressão das abas: paisagem, uma página de largura, rodapé com a marca e a paginação
    wb.eachSheet(aba => {
      aba.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
      aba.headerFooter = { oddFooter: `&L&8PRAXIS · ${tr('relatorioCompras')}&R&8${tr('pagina')} &P ${tr('de')} &N` }
    })

    const buf = await wb.xlsx.writeBuffer()
    baixarArquivo(_nomeArquivo('xlsx'), new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  })
}

export async function _exportarPDF() {
  if (!_podeVerFinanceiro()) { prxToast(tr('semPermissao'), 'warning'); return }
  await _comBotao(async () => {
    const lib = await carregarBiblioteca('jspdf')
    const { jsPDF } = lib
    const D = _calcular()
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setProperties({ title: `Praxis · ${tr('relatorioCompras')}`, subject: _nomeArquivo('pdf'), author: 'Praxis', creator: 'Praxis' })
    const W = 297, H = 210, M = 14, LARG = W - 2 * M
    const TOPO_CONT = M + 14                  // início do conteúdo nas páginas seguintes
    // eslint-disable-next-line no-control-regex -- a fonte padrão do PDF só aceita Latin-1: o intervalo \x00-\xFF é o alvo
    const limpo = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/[–—−]/g, '-').replace(/[^\x00-\xFF]/g, '')
    const brl = v => limpo(_brl(v))
    const compacto = v => limpo(_brlCompacto(v))
    const cor = (rgb, tipo = 'text') => doc[tipo === 'text' ? 'setTextColor' : tipo === 'fill' ? 'setFillColor' : 'setDrawColor'](...rgb)
    const fonte = (peso, tam) => { doc.setFont('helvetica', peso); doc.setFontSize(tam) }
    const corta = (s, w) => {
      s = limpo(s)
      if (doc.getTextWidth(s) <= w) return s
      while (s.length > 1 && doc.getTextWidth(s + '...') > w) s = s.slice(0, -1)
      return s.trimEnd() + '...'
    }
    const dir = (s, x, yy) => doc.text(s, x, yy, { align: 'right' })
    const larguraEsp = (s, cs) => larguraEspacada(doc, s, cs)
    const espacado = (s, x, yy, cs, aDireita = false) => textoEspacado(doc, s, x, yy, cs, aDireita)
    const fio = (x1, yy, x2, grosso = true) => { cor(grosso ? PAPEL.tinta : PAPEL.linha, 'draw'); doc.setLineWidth(grosso ? 0.55 : 0.25); doc.line(x1, yy, x2, yy) }
    const tituloSecao = (x, yy, w, titulo, meta) => {
      fio(x, yy, x + w)
      fonte('bold', 9.5); cor(PAPEL.tinta)
      doc.text(limpo(titulo), x, yy + 5.5)
      if (meta) { fonte('normal', 7.2); cor(PAPEL.texto3); dir(limpo(meta), x + w, yy + 5.5) }
      return yy + 10
    }
    const vazio = (x, yy, txt) => { fonte('normal', 7.8); cor(PAPEL.texto3); doc.text(limpo(txt), x, yy + 3.5); return yy + 8 }
    const emp = R.filtroEmp === 'todas' ? tr('todas') : _nomeEmpresa(R.filtroEmp)
    const periodo = limpo(`${D.iv.nome} · ${formatDate(D.iv.ini)} ${tr('a')} ${formatDate(D.iv.fim)} · ${emp}`)
    const agora = new Date()
    const hojeIso = _iso(_hoje())
    const VERMELHO = [179, 38, 30]

    // ── Página 1: o resumo, na mesma ordem da tela ──
    // Cabeçalho: símbolo em terracota + PRAXIS espaçado; à direita, o documento
    let y = M
    desenharSimbolo(doc, M, y, 9, PAPEL.terracota, PAPEL.branco)
    fonte('normal', 16); cor(PAPEL.tinta)
    espacado('PRAXIS', M + 13, y + 8.6, 1.9)
    fonte('bold', 12.5); cor(PAPEL.tinta)
    espacado(limpo(tr('relatorioCompras')).toUpperCase(), W - M, y + 4, 0.55, true)
    fonte('normal', 8.5); cor(PAPEL.texto3)
    dir(periodo, W - M, y + 9)
    y += 13
    fio(M, y, W - M)
    y += 8

    // Indicadores: numeral sob o fio de tinta, sem caixa; o gasto em terracota
    const totalV7 = D.vencer7.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const variacao = (a, b) => {
      if (!b) return a ? tr('semBase') : '0%'
      const p = Math.round(((a - b) / b) * 100)
      return `${p > 0 ? '+' : p < 0 ? '-' : ''}${Math.abs(p)}% ${D.iv.vs}`
    }
    const kpis = [
      [brl(D.gasto), tr('kGasto'), variacao(D.gasto, D.gastoAnt)],
      [String(D.ped.length), tr('kPedidos'), variacao(D.ped.length, D.ant.length)],
      [String(D.emAprov.length), tr('kAprov'), D.urgentes ? _plural(D.urgentes, tr('urgente1'), tr('urgenteN')) : tr('semUrgentes')],
      [brl(D.economia), tr('kEconomia'), D.nEconomia ? tr('economiaSubN', { n: _plural(D.nEconomia, tr('compra1'), tr('compraN')) }) : tr('economiaSub')],
      [brl(totalV7), tr('kVencer'), `${_plural(D.vencer7.length, tr('parcela1'), tr('parcelaN'))}${D.vencidas.length ? ' · ' + _plural(D.vencidas.length, tr('vencida1'), tr('vencidaN')) : ''}`],
    ]
    const gapK = 6, pesos = [1.35, 1, 1, 1, 1], somaP = pesos.reduce((a, b) => a + b, 0)
    let kx = M
    kpis.forEach(([val, rot, sub], i) => {
      const kw = (LARG - gapK * 4) * pesos[i] / somaP
      fio(kx, y, kx + kw)
      fonte('bold', i === 0 ? 20 : 16); cor(i === 0 ? PAPEL.terracota : PAPEL.tinta)
      doc.text(val, kx, y + 9.5)
      fonte('bold', 8.2); cor(PAPEL.tinta)
      doc.text(limpo(rot), kx, y + 15)
      fonte('normal', 7); cor(PAPEL.texto3)
      doc.text(corta(sub, kw - 1), kx, y + 19)
      kx += kw + gapK
    })
    y += 26

    // Três colunas: gasto mensal, categoria, empresa (ou fornecedor)
    const gapC = 10, cw = (LARG - 2 * gapC) / 3
    const topoLinha = y
    const xm = M
    const ym = tituloSecao(xm, y, cw, tr('tMensal'), tr('seisMeses'))
    const maxM = Math.max(...D.meses.map(mm => mm.valor), 0)
    const altG = 26, baseG = ym + 5 + altG
    let fimMensal
    if (maxM) {
      const passo = cw / 6
      const L = _leituraMeses(D)
      // Média dos meses fechados, tracejada, atrás das colunas
      if (L.media > 0) {
        const yMed = baseG - (L.media / maxM) * altG
        cor(PAPEL.texto2, 'draw'); doc.setLineWidth(0.2); doc.setLineDashPattern([0.8, 0.8], 0)
        doc.line(xm, yMed, xm + cw, yMed); doc.setLineDashPattern([], 0)
      }
      D.meses.forEach((mm, i) => {
        const h = (mm.valor / maxM) * altG
        const bx = xm + i * passo + passo * 0.2, bw = passo * 0.6
        // Como na tela: meses fechados em terracota cheia; o mês em andamento,
        // parcial, em contorno sobre a terracota clara
        if (h > 0 && !mm.atual) { cor(PAPEL.terracota, 'fill'); doc.rect(bx, baseG - h, bw, h, 'F') }
        else if (h > 0) { cor(PAPEL.apagada, 'fill'); cor(PAPEL.terracota, 'draw'); doc.setLineWidth(0.5); doc.rect(bx, baseG - h, bw, h, 'FD') }
        else if (mm.atual) { cor(PAPEL.terracota, 'fill'); doc.rect(bx, baseG - 0.5, bw, 0.5, 'F') }
        fonte('bold', 6.4); cor(mm.atual ? PAPEL.tinta : PAPEL.texto2)
        if (mm.valor) {
          // Fundo do papel atrás do rótulo: a média tracejada nunca corta o número
          const rot = compacto(mm.valor), lw = doc.getTextWidth(rot)
          cor(PAPEL.branco, 'fill'); doc.rect(bx + bw / 2 - lw / 2 - 0.8, baseG - h - 4, lw + 1.6, 3.2, 'F')
          doc.text(rot, bx + bw / 2, baseG - h - 1.5, { align: 'center' })
        }
        cor(mm.atual ? PAPEL.tinta : PAPEL.texto3)
        const nm = new Date(mm.ano, mm.mes, 1).toLocaleDateString(_locale(), { month: 'short' }).replace('.', '')
        doc.text(limpo(nm), bx + bw / 2, baseG + 4, { align: 'center' })
      })
      cor(PAPEL.texto3, 'draw'); doc.setLineWidth(0.25); doc.line(xm, baseG, xm + cw, baseG)
      // Legenda: a média e o mês corrente
      const yl = baseG + 9.5
      cor(PAPEL.texto2, 'draw'); doc.setLineWidth(0.2); doc.setLineDashPattern([0.8, 0.8], 0); doc.line(xm, yl - 1, xm + 5, yl - 1); doc.setLineDashPattern([], 0)
      fonte('normal', 6.6); cor(PAPEL.texto3)
      doc.text(limpo(`${tr('mediaMensal')} ${brl(L.media)}`), xm + 7, yl)
      const meio = xm + cw / 2 + 2
      cor(PAPEL.apagada, 'fill'); cor(PAPEL.terracota, 'draw'); doc.setLineWidth(0.35); doc.rect(meio, yl - 2.1, 2, 2, 'FD')
      doc.text(limpo(`${tr('esteMes')} ${brl(L.atual.valor)}`), meio + 3.5, yl)
      fimMensal = yl + 2
    } else {
      fimMensal = vazio(xm, ym, tr('vazioMensal'))
    }

    // Listas com barras finas na mesma escala (fatia do total do período)
    const topo5 = itens => itens.length <= 5 ? itens
      : [...itens.slice(0, 4), { id: '__outras__', valor: itens.slice(4).reduce((s, x) => s + x.valor, 0), qtd: itens.slice(4).reduce((s, x) => s + x.qtd, 0) }]
    const listaBarras = (x, yy, w, itens, nome, corItem) => {
      const total = D.gasto || 1
      if (!itens.length) return vazio(x, yy, tr('vazioCompras'))
      topo5(itens).forEach(it => {
        const c = it.id === '__outras__' ? PAPEL.linhaForte : corItem(it)
        cor(c, 'fill'); doc.rect(x, yy + 0.9, 2, 2, 'F')
        fonte('normal', 7.8); cor(PAPEL.tinta)
        doc.text(corta(it.id === '__outras__' ? tr('outras') : nome(it), w - 50), x + 4, yy + 2.8)
        fonte('bold', 7.8); dir(brl(it.valor), x + w - 11, yy + 2.8)
        fonte('normal', 7.2); cor(PAPEL.texto3); dir(`${_pct(it.valor, total)}%`, x + w, yy + 2.8)
        cor(PAPEL.argila, 'fill'); doc.rect(x + 4, yy + 4.6, w - 4, 0.8, 'F')
        cor(c, 'fill'); doc.rect(x + 4, yy + 4.6, Math.max(0.4, (w - 4) * (it.valor / total)), 0.8, 'F')
        yy += 7.8
      })
      return yy
    }
    const xc = M + cw + gapC
    const yc = tituloSecao(xc, y, cw, tr('porCategoria'), brl(D.gasto))
    const tons = _tonsDaLista(topo5(D.porCategoria).map(x => x.id))
    const fimCat = listaBarras(xc, yc, cw, D.porCategoria, x => _nomeCategoria(x.id), x => TONS_PAPEL[tons[x.id]] || PAPEL.neutra)
    const xe = M + 2 * (cw + gapC)
    const porForn = R.filtroEmp !== 'todas'
    const ye = tituloSecao(xe, y, cw, porForn ? tr('porFornecedor') : tr('porEmpresa'),
      porForn ? _plural(D.porFornecedor.length, tr('fornecedor1'), tr('fornecedorN')) : _plural(D.porEmpresa.length, tr('empresa1'), tr('empresaN')))
    const fimEmp = porForn
      ? listaBarras(xe, ye, cw, D.porFornecedor, x => x.id || tr('semFornecedor'), () => PAPEL.neutra)
      : listaBarras(xe, ye, cw, D.porEmpresa, x => _nomeEmpresa(x.id), () => PAPEL.neutra)
    y = Math.max(fimMensal, fimCat, fimEmp, topoLinha + 46) + 5

    // Parcelas a vencer e maiores compras, lado a lado
    const hw = (LARG - gapC) / 2, ALTL = 6.1
    const linhaLista = (yy, x, w) => { cor(PAPEL.linha, 'draw'); doc.setLineWidth(0.15); doc.line(x, yy, x + w, yy) }
    const totalProx = D.proximas.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    let yp = tituloSecao(M, y, hw, tr('tParcelas'), D.proximas.length ? `${brl(totalProx)} · ${tr('totalParcelas', { n: D.proximas.length })}` : tr('proximos30')) - 1.5
    if (!D.proximas.length) yp = vazio(M, yp, tr('vazioParcelasTit'))
    D.proximas.slice(0, 5).forEach(pc => {
      const p = R.todos.find(x => x.id === pc.pedidoId)
      const diff = _diasEntre(hojeIso, pc.vencimento)
      const sit = diff < 0 ? (diff === -1 ? tr('vencidaHa1') : tr('vencidaHaN', { n: -diff })) : diff === 0 ? tr('venceHoje') : diff === 1 ? tr('venceAmanha') : tr('emDias', { n: diff })
      fonte('bold', 7.6); cor(PAPEL.tinta)
      doc.text(formatDate(pc.vencimento).slice(0, 5), M, yp + 4)
      fonte('normal', 7.6)
      doc.text(corta(p?.titulo || '-', hw - 13 - 12 - 26 - 30), M + 13, yp + 4)
      fonte('normal', 7); cor(PAPEL.texto3); dir(`${pc.numero}/${pc.total}`, M + hw - 58, yp + 4)
      fonte('bold', 7.6); cor(PAPEL.tinta); dir(brl(pc.valor), M + hw - 30, yp + 4)
      fonte(diff < 0 ? 'bold' : 'normal', 7); cor(diff < 0 ? VERMELHO : diff === 0 ? PAPEL.terracotaTxt : PAPEL.texto2)
      dir(limpo(sit), M + hw, yp + 4)
      yp += ALTL; linhaLista(yp, M, hw)
    })
    const xmc = M + hw + gapC
    let yc2 = tituloSecao(xmc, y, hw, tr('tMaiores'), tr('compradasPeriodo')) - 1.5
    if (!D.maiores.length) yc2 = vazio(xmc, yc2, tr('vazioCompras'))
    D.maiores.forEach((p, i) => {
      fonte('bold', 7.6); cor(PAPEL.texto3)
      doc.text(_pad(i + 1), xmc, yc2 + 4)
      cor(PAPEL.tinta); fonte('normal', 7.6)
      doc.text(corta(p.titulo, hw - 8 - 77), xmc + 8, yc2 + 4)
      fonte('normal', 7); cor(PAPEL.texto3)
      doc.text(corta(_nomeEmpresa(p.empresaId), 36), xmc + hw - 74, yc2 + 4)
      cor(PAPEL.texto2); doc.text(limpo(STATUS_LABEL[p.status] || p.status), xmc + hw - 35, yc2 + 4)
      fonte('bold', 7.6); cor(PAPEL.tinta); dir(brl(p.valorFinal), xmc + hw, yc2 + 4)
      yc2 += ALTL; linhaLista(yc2, xmc, hw)
    })
    y = Math.max(yp, yc2) + 7

    // Régua das etapas: sete numerais e, à parte, reprovados e cancelados
    y = tituloSecao(M, y, LARG, tr('tEtapas'), D.ped.length === 1 ? tr('etapasMeta1') : tr('etapasMetaN', { n: D.ped.length })) - 2
    const gE = 4, sepE = 8
    const ew = (LARG - sepE - gE * 7) / (7 + 2 * 0.85)
    let ex = M
    ORDEM_STATUS.forEach((s, i) => {
      const fora = i >= 7
      const w = fora ? ew * 0.85 : ew
      if (i === 7) ex += sepE - gE
      const n = D.porStatus[s] || 0
      cor(fora ? PAPEL.linhaForte : PAPEL.tinta, 'draw'); doc.setLineWidth(fora ? 0.25 : 0.45); doc.line(ex, y, ex + w, y)
      fonte('bold', 15); cor(n ? PAPEL.tinta : PAPEL.linhaForte)
      doc.text(_pad(n), ex, y + 7.4)
      fonte('bold', 7.4); cor(PAPEL.tinta); doc.text(corta(STATUS_LABEL[s], w - 1), ex, y + 11.6)
      fonte('normal', 6.8); cor(PAPEL.texto3); doc.text(n ? compacto(D.valorStatus[s] || 0) : '-', ex, y + 15)
      ex += w + gE
    })

    // ── Páginas seguintes: o detalhe, em tabelas ──
    const ALT = 6.2
    const novaPagina = () => { doc.addPage(); y = TOPO_CONT }
    const tabela = (titulo, cols, linhas, rodape) => {
      const larguraFixa = cols.reduce((s, c) => s + (c.w || 0), 0)
      const flex = cols.filter(c => !c.w).length
      const larg = cols.map(c => c.w || ((LARG - larguraFixa) / flex))
      const desenharCab = () => {
        cor(PAPEL.argila, 'fill'); doc.rect(M, y, LARG, ALT + 0.6, 'F')
        fio(M, y + ALT + 0.6, W - M)
        fonte('bold', 7.4); cor(PAPEL.tinta)
        let cx = M
        cols.forEach((c, i) => {
          const rot = limpo(c.t)
          if (c.dir) dir(rot, cx + larg[i] - 2.5, y + 4.4)
          else doc.text(rot, cx + 2.5, y + 4.4)
          cx += larg[i]
        })
        y += ALT + 0.9
      }
      const precisaPagina = h => { if (y + h > H - M - 8) { novaPagina(); return true } return false }
      precisaPagina(ALT * 4 + 12)
      y = tituloSecao(M, y, LARG, titulo, '') - 2.5
      desenharCab()
      linhas.forEach((l, li) => {
        // A última linha desce junto com o total: nada de total órfão no alto da página
        if (precisaPagina(li === linhas.length - 1 && rodape ? ALT * 2 + 1 : ALT)) desenharCab()
        if (li % 2 === 1) { cor(PAPEL.argilaClara, 'fill'); doc.rect(M, y, LARG, ALT, 'F') }
        let cx = M
        cols.forEach((c, i) => {
          const atraso = c.atraso && l[i] === tr('vencida')
          cor(c.sub ? PAPEL.texto3 : atraso ? VERMELHO : PAPEL.tinta)
          fonte(c.sub || atraso ? 'bold' : 'normal', c.sub ? 7.4 : 7.8)
          const s = corta(l[i], larg[i] - 5)
          if (c.dir) dir(s, cx + larg[i] - 2.5, y + 4.2)
          else if (c.sub) espacado(s, cx + 2.5, y + 4.2, 0.2)
          else doc.text(s, cx + 2.5, y + 4.2)
          cx += larg[i]
        })
        y += ALT
        cor(PAPEL.linha, 'draw'); doc.setLineWidth(0.15); doc.line(M, y, W - M, y)
      })
      if (rodape) {
        precisaPagina(ALT + 1)
        fio(M, y, W - M)
        fonte('bold', 7.8); cor(PAPEL.tinta)
        let cx = M
        cols.forEach((c, i) => {
          if (rodape[i]) {
            if (c.dir) dir(limpo(rodape[i]), cx + larg[i] - 2.5, y + 4.4)
            else doc.text(limpo(rodape[i]), cx + 2.5, y + 4.4)
          }
          cx += larg[i]
        })
        y += ALT + 1
      }
      y += 9
    }

    novaPagina()
    const linhasPed = _linhasExport(D)
    if (linhasPed.length) {
      const somaE = linhasPed.reduce((s, l) => s + (l.estimado || 0), 0)
      const somaF = linhasPed.reduce((s, l) => s + (l.final || 0), 0)
      tabela(`${tr('pedidosPeriodo')} (${linhasPed.length})`, [
        { t: tr('colNum'), w: 22, sub: true }, { t: tr('colTitulo') }, { t: tr('colEmpresa'), w: 42 }, { t: tr('colCategoria'), w: 32 },
        { t: tr('colStatus'), w: 25 }, { t: tr('colCriado'), w: 22 }, { t: tr('colEstimado'), w: 30, dir: true }, { t: tr('colFinal'), w: 30, dir: true },
      ], linhasPed.map(l => [l.num, l.titulo, l.empresa, l.categoria, l.status, l.data ? _dataUTC(l.data) : '-',
        l.estimado ? brl(l.estimado) : '-', l.final ? brl(l.final) : '-']),
      [tr('total'), _plural(linhasPed.length, tr('pedido'), tr('pedidos')), '', '', '', '', brl(somaE), brl(somaF)])
    } else {
      y = tituloSecao(M, y, LARG, tr('pedidosPeriodo'), '')
      y = vazio(M, y, tr('vazioTxt', { ini: formatDate(D.iv.ini), fim: formatDate(D.iv.fim) })) + 8
    }

    if (D.abertas.length) {
      tabela(tr('parcelasAbertas'), [
        { t: tr('colVenc'), w: 24 }, { t: tr('colNum'), w: 22, sub: true }, { t: tr('colTitulo') }, { t: tr('colEmpresa'), w: 48 },
        { t: tr('colParcela'), w: 22, dir: true }, { t: tr('colValor'), w: 32, dir: true }, { t: tr('colSituacao'), w: 26, atraso: true },
      ], D.abertas.map(pc => {
        const p = R.todos.find(x => x.id === pc.pedidoId)
        const diff = _diasEntre(hojeIso, pc.vencimento)
        return [formatDate(pc.vencimento), p?.numeroPedido || '', p?.titulo || '', _nomeEmpresa(p?.empresaId), `${pc.numero}/${pc.total}`, brl(pc.valor), diff < 0 ? tr('vencida') : tr('aberta')]
      }), [tr('total'), '', _plural(D.abertas.length, tr('parcela1'), tr('parcelaN')), '', '', brl(D.abertas.reduce((s, p) => s + (Number(p.valor) || 0), 0)), ''])
    }

    // Cabeçalho corrido (páginas 2+) e rodapé em todas: assinatura AFN, data e paginação
    const total = doc.getNumberOfPages()
    const gerado = `${tr('geradoEm')} ${agora.toLocaleDateString('pt-BR')} ${_pad(agora.getHours())}:${_pad(agora.getMinutes())}`
    for (let i = 1; i <= total; i++) {
      doc.setPage(i)
      if (i > 1) {
        desenharSimbolo(doc, M, M - 1, 5, PAPEL.terracota, PAPEL.branco)
        fonte('normal', 9); cor(PAPEL.tinta); espacado('PRAXIS', M + 7.5, M + 3.8, 1)
        fonte('normal', 7.4); cor(PAPEL.texto3); dir(`${limpo(tr('relatorioCompras'))} · ${periodo}`, W - M, M + 3.8)
        fio(M, M + 7, W - M, false)
      }
      fio(M, H - 10, W - M, false)
      fonte('bold', 7.2)
      cor(PAPEL.afn); espacado('AFN', M, H - 6, 0.4)
      let fx = M + larguraEsp('AFN', 0.4) + 1.6
      cor(PAPEL.cinzaAfn); espacado('SYSTEMS', fx, H - 6, 0.4)
      fx += larguraEsp('SYSTEMS', 0.4) + 3
      fonte('normal', 7.2); doc.text('|  Praxis', fx, H - 6)
      cor(PAPEL.texto3); doc.text(limpo(gerado), W / 2, H - 6, { align: 'center' })
      dir(`${tr('pagina')} ${i} ${tr('de')} ${total}`, W - M, H - 6)
    }
    doc.save(_nomeArquivo('pdf'))
  })
}
