// Partes do formulário "Pedir uma compra" que vieram com a Fase 1: os itens
// (com as sugestões pelo histórico), o resumo automático, o veículo e o
// centro de custo da lista da empresa. O resto do formulário fica em
// js/pedidos.js (HTML e eventos), js/pedidos-quadro.js (opções) e
// js/pedidos-fluxo.js (validação e gravação).
import { t } from './constants.js'
import { esc } from './utils.js'
import { Q } from './pedidos-estado.js'
import { montarEditorItens } from './itens-editor.js'
import {
  historicoDeItens, placasDoHistorico, resumoDosItens, itensDoPedido, placaParaExibir, lerPlaca,
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
    aoMudar: _resumoAutomatico,
  })
}

// A cada abertura: o histórico vem dos pedidos que o quadro já leu
export function prepararItensNovoPedido() {
  _editor?.usarHistorico(historicoDeItens(Q.pedidos))
  const dl = document.getElementById('np-placas')
  if (dl) dl.innerHTML = placasDoHistorico(Q.pedidos).map(p => `<option value="${esc(placaParaExibir(p))}"></option>`).join('')
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
}
