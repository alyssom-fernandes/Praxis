// Partes do formulário "Pedir uma compra" que vieram com a Fase 1: os itens
// (com as sugestões pelo histórico), o resumo automático, o veículo e o
// centro de custo da lista da empresa. O resto do formulário fica em
// js/pedidos.js (HTML e eventos), js/pedidos-quadro.js (opções) e
// js/pedidos-fluxo.js (validação e gravação).
import { t } from './constants.js'
import { esc, formatCurrency, parseMoeda } from './utils.js'
import { Q } from './pedidos-estado.js'
import { montarEditorItens } from './itens-editor.js'
import {
  historicoDeItens, placasDoHistorico, resumoDosItens, itensDoPedido, placaParaExibir, lerPlaca,
  subtotalDosItens, totalComDesconto,
} from './itens.js'

let _editor = null

export function editorNovoPedido() { return _editor }

// Monta o editor dos itens no formulário (uma vez por tela)
export function montarItensNovoPedido() {
  const raiz = document.getElementById('np-itens-ed')
  if (!raiz) return
  _editor = montarEditorItens(raiz, {
    prefixo: 'np',
    comValor: true,
    aoEscolherDoHistorico: h => _sugerirCategoria(h.categoriaId),
    aoMudar: () => { _resumoAutomatico(); _valorDaRequisicao() },
  })
}

// A cada abertura: o histórico vem dos pedidos que o quadro já leu
export function prepararItensNovoPedido() {
  _editor?.usarHistorico(historicoDeItens(Q.pedidos))
  const dl = document.getElementById('np-placas')
  if (dl) dl.innerHTML = placasDoHistorico(Q.pedidos).map(p => `<option value="${esc(placaParaExibir(p))}"></option>`).join('')
  // Fornecedores já usados, para a requisição (o fornecedor de sempre)
  const forn = document.getElementById('np-fornecedores')
  if (forn) {
    const nomes = [...new Set(Q.pedidos.map(p => p.fornecedorNome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    forn.innerHTML = nomes.map(n => `<option value="${esc(n)}"></option>`).join('')
  }
}

// ── Requisição (R4) ───────────────────────────────────────────
// A opção da empresa escolhida: { ativa, limite } ou null
export function opcaoRequisicaoDaEmpresa(empresaId = document.getElementById('np-empresa')?.value) {
  const op = Q.empresas.find(e => e.id === empresaId)?.requisicao
  return op?.ativa === true ? op : null
}

// Mostra o interruptor só na empresa que ligou a requisição
export function _opcaoRequisicao() {
  const grupo = document.getElementById('np-req-grupo')
  if (!grupo) return
  const op = opcaoRequisicaoDaEmpresa()
  grupo.hidden = !op
  const desc = document.getElementById('np-req-desc')
  if (desc) desc.textContent = op ? t(op.limite != null ? 'npRequisicaoDescLimite' : 'npRequisicaoDesc', { valor: formatCurrency(op.limite) }) : ''
  if (!op) _ligarRequisicao(false)
}

export function _ligarRequisicao(on) {
  const tg = document.getElementById('np-req-toggle')
  const wrap = document.getElementById('np-req-wrap')
  tg?.classList.toggle('on', on)
  wrap?.classList.toggle('on', on)
  wrap?.setAttribute('aria-checked', String(on))
  const campos = document.getElementById('np-req-campos')
  if (campos) campos.hidden = !on
  const btn = document.getElementById('btn-abrir-pedido')
  if (btn && !document.getElementById('np-sub')?.textContent) btn.textContent = t(on ? 'btnEnviarRequisicao' : 'btnAbrirPedido')
  if (on) _valorDaRequisicao()
}

export function requisicaoLigada() {
  return !document.getElementById('np-req-grupo')?.hidden && document.getElementById('np-req-toggle')?.classList.contains('on')
}

// O valor da requisição acompanha o total dos itens enquanto ninguém o digita
function _valorDaRequisicao() {
  const campo = document.getElementById('np-req-valor')
  if (!campo || !_editor || campo.dataset.manual) return
  const sub = subtotalDosItens(_editor.preenchidos())
  campo.value = sub != null ? formatCurrency(totalComDesconto(sub, _editor.desconto())) : ''
}

// Fornecedor e valor da requisição, com os erros
export function lerRequisicao() {
  const fornecedorNome = document.getElementById('np-req-fornecedor')?.value.trim() || ''
  const valor = parseMoeda(document.getElementById('np-req-valor')?.value || '')
  const op = opcaoRequisicaoDaEmpresa()
  const erros = []
  if (!fornecedorNome) erros.push(['np-req-fornecedor', t('campoObrigatorio')])
  if (!(valor > 0)) erros.push(['np-req-valor', t('campoObrigatorio')])
  else if (op?.limite != null && valor > op.limite) erros.push(['np-req-valor', t('npReqAcimaLimite', { valor: formatCurrency(op.limite) })])
  return { fornecedorNome, valor: Math.round(valor * 100) / 100, erros }
}

// O resumo segue os itens enquanto ninguém o escreve à mão. Com um item só,
// o campo fica escondido e o título é o próprio item
export function _resumoAutomatico() {
  const campo = document.getElementById('np-titulo')
  const grupo = document.getElementById('np-titulo-grupo')
  if (!campo || !_editor) return
  const itens = _editor.preenchidos()
  if (grupo) grupo.hidden = itens.length < 2 && !campo.dataset.manual
  if (!campo.dataset.manual) campo.value = resumoDosItens(itens, t)
}

// A categoria que o item costuma ter, se nenhuma foi escolhida
function _sugerirCategoria(id) {
  if (!id || document.querySelector('#np-categorias .chip.selected')) return
  const chip = document.querySelector(`#np-categorias .chip[data-id="${CSS.escape(id)}"]`)
  if (!chip) return
  chip.classList.add('selected')
  chip.setAttribute('aria-checked', 'true')
}

export function _placaMudou() {
  const placa = document.getElementById('np-placa')
  const km = document.getElementById('np-km')
  if (!placa || !km) return
  const ok = lerPlaca(placa.value)
  km.disabled = !ok || !!ok.invalida
  if (km.disabled) km.value = ''
}

// Centro de custo: a lista da empresa escolhida. Sem lista, o campo some
export function _centrosDeCusto(valor = '') {
  const sel = document.getElementById('np-cc')
  const grupo = document.getElementById('np-cc-grupo')
  if (!sel || !grupo) return
  const emp = Q.empresas.find(e => e.id === document.getElementById('np-empresa')?.value)
  const lista = Array.isArray(emp?.centrosCusto) ? emp.centrosCusto.filter(Boolean) : []
  const opcoes = valor && !lista.includes(valor) ? [...lista, valor] : lista
  sel.innerHTML = `<option value="">${t('selecionar')}</option>` +
    opcoes.map(c => `<option value="${esc(c)}"${c === valor ? ' selected' : ''}>${esc(c)}</option>`).join('')
  grupo.hidden = !opcoes.length
}

export function resetarItensNovoPedido() {
  _editor?.definir([])
  const campo = document.getElementById('np-titulo')
  if (campo) { campo.value = ''; campo.dataset.manual = '' }
  const grupo = document.getElementById('np-titulo-grupo')
  if (grupo) grupo.hidden = true
  const placa = document.getElementById('np-placa')
  if (placa) placa.value = ''
  _placaMudou()
  _centrosDeCusto()
  const forn = document.getElementById('np-req-fornecedor')
  if (forn) forn.value = ''
  const val = document.getElementById('np-req-valor')
  if (val) { val.value = ''; val.dataset.manual = '' }
  _opcaoRequisicao()
  _ligarRequisicao(false)
}

// "Comprar de novo" e "Duplicar": os itens, o desconto e o veículo do original
// (o KM não: o do original já passou)
export function preencherItensNovoPedido(p) {
  const itens = itensDoPedido(p)
  _editor?.definir(itens, p.desconto || null)
  const campo = document.getElementById('np-titulo')
  if (campo) {
    const auto = resumoDosItens(itens, t)
    campo.value = p.titulo || auto
    campo.dataset.manual = p.titulo && p.titulo !== auto ? '1' : ''
  }
  _resumoAutomatico()
  const placa = document.getElementById('np-placa')
  if (placa) placa.value = p.veiculo?.placa ? placaParaExibir(p.veiculo.placa) : ''
  _placaMudou()
  _centrosDeCusto(p.centroCusto || '')
  _opcaoRequisicao()
  // A requisição repetida volta como requisição, com o mesmo fornecedor
  if (p.requisicao && opcaoRequisicaoDaEmpresa()) {
    _ligarRequisicao(true)
    const forn = document.getElementById('np-req-fornecedor')
    if (forn) forn.value = p.fornecedorNome || ''
  }
}
