// Navegação por módulo (27/11/2026): os grupos da lateral e a barra de baixo
// de quem usa mais de um módulo (js/modulos.js), e o voltar pela borda do app
// instalado no iPhone. Saiu de js/app.js, que passava das 1.200 linhas.
import { t } from './constants.js'
import { esc, gerarIniciais } from './utils.js'
import { icone } from './icones.js'
import { papelCompras, papelServicos, papelEquip, moduloDaTela, cuidaDasUnidades, adminDaPrestadora, MODULOS } from './modulos.js'

export const ROTULO_MODULO = { compras: 'modCompras', servicos: 'modServicos', equipamentos: 'modEquipamentos' }

// O "+" cria no módulo da tela atual: pedido (Compras), chamado (Serviços) ou
// equipamento (Equipamentos). O prestador não abre chamado: sem "+"
const NOVO_DO_MODULO = {
  [MODULOS.COMPRAS]: u => !!papelCompras(u),
  [MODULOS.SERVICOS]: u => ['solicitante', 'financeiro', 'gestor'].includes(papelServicos(u)),
  [MODULOS.EQUIPAMENTOS]: u => ['responsavel', 'gestor'].includes(papelEquip(u)),
}

// Os grupos da lateral, um por módulo que a pessoa tem (acesso por módulo,
// js/modulos.js), separados só pela linha; a administração por último. Quem
// só tem Compras vê a lateral de sempre
export function gruposDaLateral(usuario, pode, item) {
  const grupo = (id, rotulo, conteudo, primeiro) => !conteudo.trim() ? '' : primeiro ? conteudo
    : `<div class="lateral-grupo" id="lateral-${id}" role="group" aria-label="${esc(rotulo)}">${conteudo}</div>`
  const partes = []
  if (papelCompras(usuario)) {
    partes.push(['compras', t('modCompras'), `
      ${item('pedidos', 'pedidos', t('navPedidos'), { filtro: 'todos' })}
      ${item('fila', 'pedidos', t('navMinhaFila'), { filtro: 'pendentes' })}
      ${pode.relatorios ? item('relatorios', 'relatorios', t('navRelatorios')) : ''}`])
  }
  const ps = papelServicos(usuario)
  if (ps) {
    partes.push(['servicos', t('modServicos'), `
      ${item('servicos', 'servicos', ps === 'prestador' ? t('svChamadosDaPrestadora') : t('modServicos'))}
      ${['gestor', 'financeiro'].includes(ps) ? item('conferencia', 'conferencia', t('navConferencia')) : ''}
      ${ps === 'gestor' || adminDaPrestadora(usuario) ? item('prestadoras', 'prestadora', adminDaPrestadora(usuario) ? t('svTecnicos') : t('svPrestadoras')) : ''}`])
  }
  const pe = papelEquip(usuario)
  if (pe) {
    partes.push(['equipamentos', t('modEquipamentos'), `
      ${item('equipamentos', 'equipamentos', t('modEquipamentos'))}
      ${['responsavel', 'gestor'].includes(pe) ? item('contagem', 'contagem', t('eqContagem')) : ''}`])
  }
  if (pode.config || cuidaDasUnidades(usuario)) {
    partes.push(['cadastros', t('navAdministracao'), `
      ${pode.config ? item('cad-empresas', 'config-cadastros', t('secaoEmpresas'), { aba: 'empresas' }) : ''}
      ${item('unidades', 'unidades', t('unUnidades'))}
      ${pode.config ? `
      ${item('cad-categorias', 'config-cadastros', t('secaoCategorias'), { aba: 'categorias' })}
      ${item('cad-fornecedores', 'config-cadastros', t('secaoFornecedores'), { aba: 'fornecedores' })}
      ${item('usuarios', 'config-usuarios', t('configUsuarios'))}
      ${item('alcadas', 'config-alcadas', t('alcTitulo'))}
      ${item('auditoria', 'config-auditoria', t('audTitulo'))}` : ''}`])
  }
  return partes.map(([id, rotulo, html], i) => grupo(id, rotulo, html, i === 0)).join('')
}

export function htmlBarraDeModulos(usuario, mods, tela, item, ICO) {
  const atual = moduloDaTela(tela) || mods[0]
  const ROT = { compras: ['pedidos', ICO.quadro(22), t('navPedidos')], servicos: ['servicos', icone('servicos', 22), papelServicos(usuario) === 'prestador' ? t('svChamadosDaPrestadora') : t('modServicos')],
    equipamentos: ['equipamentos', icone('equipamentos', 22), t('modEquipamentos')] }
  const itens = mods.map(m => item(ROT[m][0], m === atual && moduloDaTela(tela) === m, ROT[m][1], ROT[m][2], m === MODULOS.SERVICOS))
  const comNovo = mods.find(m => m === atual && NOVO_DO_MODULO[m](usuario)) || mods.find(m => NOVO_DO_MODULO[m](usuario))
  // O "+" no meio, como no app de sempre
  const meio = Math.ceil(itens.length / 2)
  return `
    ${itens.slice(0, meio).join('')}
    ${comNovo ? `<button type="button" class="bottom-nav-item bnav-novo" id="bnav-novo" data-modulo="${comNovo}" aria-label="${esc(t('navNovoEm', { modulo: t(ROTULO_MODULO[comNovo]) }))}">
      <span class="bnav-novo-circulo" aria-hidden="true">${ICO.mais(24)}</span><span>${t('navNovo')}</span>
    </button>` : ''}
    ${itens.slice(meio).join('')}
    <button type="button" class="bottom-nav-item" id="bnav-conta" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu">
      <span class="bnav-avatar" aria-hidden="true">${esc(gerarIniciais(usuario.nome))}</span><span>${t('navConta')}</span>
    </button>
  `
}

// ── Voltar pela borda (app instalado no iPhone) ───────────────
// No Safari o próprio navegador volta ao deslizar da borda esquerda; no app
// instalado na tela de início não há esse gesto. Aqui, num pedido, deslizar da
// borda leva a tela junto com o dedo e, passado o ponto, toca o "‹ Voltar"
const _ehAppIphone = () => /iP(hone|ad|od)/.test(navigator.userAgent) &&
  (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true)
let _borda = null
document.addEventListener('touchstart', e => {
  if (e.touches.length !== 1 || e.touches[0].clientX > 22 || !_ehAppIphone()) return
  const voltar = document.querySelector('.detalhe-voltar')
  const tela = document.querySelector('.main-content')
  if (!voltar || !tela || document.querySelector('.modal-overlay.visible, .dialog-overlay.visible')) return
  _borda = { x0: e.touches[0].clientX, y0: e.touches[0].clientY, t0: performance.now(), dx: 0, tela, voltar, horizontal: null }
}, { passive: true })
document.addEventListener('touchmove', e => {
  if (!_borda) return
  const dx = e.touches[0].clientX - _borda.x0, dy = e.touches[0].clientY - _borda.y0
  if (_borda.horizontal == null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) _borda.horizontal = Math.abs(dx) > Math.abs(dy)
  if (!_borda.horizontal) return
  _borda.dx = Math.max(0, dx)
  _borda.tela.classList.add('arrastando-borda')
  _borda.tela.style.setProperty('transform', `translateX(${_borda.dx}px)`)
}, { passive: true })
const _soltarBorda = () => {
  if (!_borda) return
  const { dx, t0, tela, voltar } = _borda
  _borda = null
  tela.classList.remove('arrastando-borda')
  const v = dx / Math.max(1, performance.now() - t0)
  if (dx > window.innerWidth * 0.33 || (dx > 40 && v > 0.5)) {
    tela.style.setProperty('transform', 'translateX(100%)')
    setTimeout(() => voltar.click(), 180)
  } else tela.style.removeProperty('transform')
}
document.addEventListener('touchend', _soltarBorda)
document.addEventListener('touchcancel', _soltarBorda)
