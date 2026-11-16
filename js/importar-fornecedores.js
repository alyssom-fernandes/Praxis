// Importação de fornecedores por CSV (Administração › Fornecedores).
//
// Um diálogo em três passos: instruções e escolha do arquivo; a prévia, com a
// situação de cada linha (js/fornecedores-csv.js); e o relatório depois de
// gravar. Nada é gravado antes da confirmação, e cada gravação vai com o seu
// registro de auditoria (gravarAuditado): o fornecedor novo e o CNPJ que
// faltava num existente. Na demo, a prévia funciona e gravar não.

import { db, collection, getDocs, serverTimestamp, consulta } from './firebase.js'
import { sessao } from './estado.js'
import { prxToast, abrirModal, fecharModal, estadoVazio } from './ui.js'
import { t } from './constants.js'
import { esc, normalizarTexto, formatCNPJ } from './utils.js'
import { gravarAuditado } from './auditoria.js'
import { ICO, tf, plural, numero } from './config-comum.js'
import {
  MAX_LINHAS, decodificarArquivo, lerCSV, classificarFornecedores, contarSituacoes, nomeDoFornecedor,
} from './fornecedores-csv.js'

const MODAL_ID   = 'modal-importar'
const MAX_BYTES  = 1024 * 1024
// Gravações ao mesmo tempo: cada uma é um lote de duas escritas (o fornecedor
// e o registro). Um lote com vários fornecedores esbarraria no limite de
// leituras das regras (20 por lote), já que cada registro é conferido nelas
const SIMULTANEAS = 5

// Ordem das linhas na tabela: o que precisa de atenção primeiro
const ORDEM = { erro: 0, recusada: 1, conflito: 2, novo: 3, criado: 3, completar: 4, completado: 4, existente: 5 }
// Rótulo e tom de cada situação (o tom é a cor do ponto)
const SITUACAO = {
  novo:       { rotulo: 'impSitNovo',       tom: 'novo' },
  completar:  { rotulo: 'impSitCompletar',  tom: 'novo' },
  existente:  { rotulo: 'impSitExistente',  tom: 'neutro' },
  conflito:   { rotulo: 'impSitConflito',   tom: 'atencao' },
  recusada:   { rotulo: 'impSitRecusada',   tom: 'erro' },
  criado:     { rotulo: 'impSitCriado',     tom: 'feito' },
  completado: { rotulo: 'impSitCompletado', tom: 'feito' },
  erro:       { rotulo: 'impSitErro',       tom: 'erro' },
}

let _arquivo = ''
let _lidas   = []   // linhas como vieram do arquivo (lerCSV)
let _itens   = []   // as mesmas, classificadas
let _aoConcluir = null

// Abre o diálogo no passo das instruções. aoConcluir: recarrega a lista
// depois de gravar.
export function abrirImportacao({ aoConcluir } = {}) {
  _aoConcluir = aoConcluir
  document.getElementById(MODAL_ID)?.remove()
  const overlay = document.createElement('div')
  overlay.id = MODAL_ID
  overlay.className = 'modal-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'imp-titulo')
  overlay.innerHTML = `
    <div class="modal cfg-modal imp-modal">
      <div class="modal-header">
        <div class="cfg-modal-head">
          <h2 id="imp-titulo">${t('impTitulo')}</h2>
          <p class="cfg-modal-sub" id="imp-sub" hidden></p>
        </div>
        <button class="btn-icon" data-imp="fechar" aria-label="${t('fechar')}">${ICO.fechar()}</button>
      </div>
      <div class="modal-body" id="imp-corpo" aria-live="polite"></div>
      <div class="modal-footer" id="imp-rodape"></div>
      <input type="file" id="imp-arquivo" accept=".csv,text/csv" hidden>
    </div>`
  document.body.appendChild(overlay)

  overlay.addEventListener('click', e => {
    if (e.target === overlay) { _fechar(); return }
    const acao = e.target.closest('[data-imp]')?.dataset.imp
    if (acao === 'fechar') _fechar()
    if (acao === 'escolher') document.getElementById('imp-arquivo').click()
    if (acao === 'gravar') _gravar()
  })
  document.getElementById('imp-arquivo').addEventListener('change', e => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (arquivo) _ler(arquivo)
  })

  _passoInstrucoes()
  abrirModal(MODAL_ID)
}

function _fechar() {
  const overlay = document.getElementById(MODAL_ID)
  if (!overlay || overlay.dataset.gravando) return
  fecharModal(MODAL_ID)
  setTimeout(() => overlay.remove(), 250)
}

function _definir({ sub = '', corpo, rodape }) {
  const el = document.getElementById('imp-sub')
  el.textContent = sub
  el.hidden = !sub
  document.getElementById('imp-corpo').innerHTML = corpo
  document.getElementById('imp-rodape').innerHTML = rodape
}

const _botaoEscolher = (classe, chave) =>
  `<button type="button" class="${classe}" data-imp="escolher">${ICO.enviar()}${t(chave)}</button>`

// ── Passo 1: instruções ───────────────────────────────────────
function _passoInstrucoes() {
  document.getElementById('imp-titulo').textContent = t('impTitulo')
  _definir({
    corpo: `
      <ul class="imp-regras">
        <li>${t('impRegraCabecalho')}</li>
        <li>${esc(tf('impRegraSeparador', { max: numero(MAX_LINHAS) }))}</li>
        <li>${t('impRegraPrevia')}</li>
      </ul>
      <div class="imp-escolher">${_botaoEscolher('btn-secondary', 'impEscolher')}</div>`,
    rodape: `<button class="btn-secondary" data-imp="fechar">${t('btnCancelar')}</button>`,
  })
}

// ── Leitura do arquivo e prévia ───────────────────────────────
async function _ler(arquivo) {
  _arquivo = arquivo.name
  const erro = (chave, vars = {}) => _passoErro(tf(chave, Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, numero(v)]))))
  if (arquivo.size > MAX_BYTES) { erro('impErroTamanho'); return }
  _definir({ sub: _arquivo, corpo: `<p class="imp-espera">${t('impLendo')}</p>`, rodape: '' })
  let lido
  try {
    lido = lerCSV(decodificarArquivo(new Uint8Array(await arquivo.arrayBuffer())))
  } catch (err) {
    console.error(err)
    erro('impErroLeitura')
    return
  }
  if (lido.erro) { erro(lido.erro, lido.vars); return }
  try {
    _lidas = lido.linhas
    _itens = classificarFornecedores(_lidas, await _fornecedoresAtuais())
  } catch (err) {
    console.error(err)
    erro('erroCarregar')
    return
  }
  _passoPrevia()
}

async function _fornecedoresAtuais() {
  const snap = await getDocs(consulta(collection(db, 'fornecedores')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

function _passoErro(mensagem) {
  _lidas = []
  _itens = []
  _definir({
    sub: _arquivo,
    corpo: estadoVazio({ titulo: t('impErroTitulo'), texto: esc(mensagem), variante: 'solto', erro: true,
      acao: _botaoEscolher('btn-secondary btn-sm', 'impEscolherOutro') }),
    rodape: `<button class="btn-secondary" data-imp="fechar">${t('btnCancelar')}</button>`,
  })
}

const _aGravar = () => _itens.filter(i => i.situacao === 'novo' || i.situacao === 'completar')

function _passoPrevia() {
  const c = contarSituacoes(_itens)
  const n = _aGravar().length
  _definir({
    sub: `${_arquivo} · ${plural(_itens.length, 'impLinhaSing', 'impLinhaPlur')}`,
    corpo: `
      ${_resumo([
        ['impResNovos', c.novo], ['impResCompletar', c.completar], ['impResExistentes', c.existente],
        ['impResConflitos', c.conflito], ['impResRecusadas', c.recusada],
      ])}
      ${sessao.isDemo ? `<p class="imp-nota">${t('impDemoAviso')}</p>` : ''}
      ${n ? '' : `<p class="imp-nota">${t('impNadaAGravar')}</p>`}
      ${_tabela()}`,
    rodape: `
      ${_botaoEscolher('btn-secondary cfg-acao-esquerda', 'impEscolherOutro')}
      <button class="btn-secondary" data-imp="fechar">${t('btnCancelar')}</button>
      ${n ? `<button class="btn-primary" data-imp="gravar">${esc(n === 1 ? t('impGravarSing') : tf('impGravarPlur', { n }))}</button>` : ''}`,
  })
}

// Números da prévia e do relatório; os zerados ficam apagados
function _resumo(pares) {
  return `<dl class="imp-resumo">${pares.filter(([, n]) => n != null).map(([chave, n]) => `
    <div class="imp-res${n ? '' : ' is-zero'}"><dt>${t(chave)}</dt><dd class="numeral">${n}</dd></div>`).join('')}</dl>`
}

function _tabela() {
  const linhas = [..._itens].sort((a, b) => (ORDEM[a.situacao] - ORDEM[b.situacao]) || (a.linha - b.linha))
  return `
    <div class="imp-livro">
      <table class="imp-tabela">
        <thead>
          <tr>
            <th class="c-linha">${t('impColLinha')}</th>
            <th class="c-nome">${t('cfgColFornecedor')}</th>
            <th class="c-cnpj">CNPJ</th>
            <th class="c-sit">${t('impColSituacao')}</th>
          </tr>
        </thead>
        <tbody>${linhas.map(_linha).join('')}</tbody>
      </table>
    </div>`
}

function _linha(i) {
  const s = SITUACAO[i.situacao]
  const motivo = i.motivo ? tf(i.motivo.chave, i.motivo.vars) : ''
  return `
    <tr class="is-${s.tom}">
      <td class="c-linha">${i.linha}</td>
      <td class="c-nome">${i.nome ? esc(i.nome) : `<span class="cfg-mudo">${t('impSemNome')}</span>`}</td>
      <td class="c-cnpj">${i.cnpjInformado ? `<span class="cfg-mono">${esc(i.cnpj.length === 14 ? formatCNPJ(i.cnpj) : i.cnpjInformado)}</span>` : '<span class="cfg-mudo">—</span>'}</td>
      <td class="c-sit">
        <span class="imp-sit"><span class="cfg-ponto" aria-hidden="true"></span>${t(s.rotulo)}</span>
        ${motivo ? `<span class="imp-motivo">${esc(motivo)}</span>` : ''}
      </td>
    </tr>`
}

// ── Gravação e relatório ──────────────────────────────────────
async function _gravar() {
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
  const overlay = document.getElementById(MODAL_ID)
  const botao = overlay.querySelector('[data-imp="gravar"]')
  overlay.dataset.gravando = '1'
  overlay.querySelectorAll('.modal-footer button, [data-imp="fechar"]').forEach(b => { b.disabled = true })

  try {
    // Confere de novo com o cadastro de agora: o que outra pessoa criou
    // depois da prévia vira "existente", e nada se duplica
    _itens = classificarFornecedores(_lidas, await _fornecedoresAtuais())
  } catch (err) {
    console.error(err)
    delete overlay.dataset.gravando
    overlay.querySelectorAll('.modal-footer button, [data-imp="fechar"]').forEach(b => { b.disabled = false })
    prxToast(t('erroCarregar'), 'error')
    return
  }

  const fila = _aGravar()
  let feitos = 0
  const progresso = () => { if (botao) botao.textContent = tf('impProgresso', { n: feitos, total: fila.length }) }
  progresso()
  for (let i = 0; i < fila.length; i += SIMULTANEAS) {
    await Promise.all(fila.slice(i, i + SIMULTANEAS).map(async item => {
      try {
        await _gravarItem(item)
        item.situacao = item.situacao === 'novo' ? 'criado' : 'completado'
        item.motivo = null
      } catch (err) {
        console.warn('Importação, linha', item.linha, err?.code || err?.message)
        item.situacao = 'erro'
        item.motivo = { chave: 'impMotivoErroGravar', vars: {} }
      }
      feitos++
      progresso()
    }))
  }

  delete overlay.dataset.gravando
  _passoRelatorio()
  const falhas = _itens.filter(i => i.situacao === 'erro').length
  prxToast(falhas ? t('impConcluidoFalhas') : t('impConcluido'), falhas ? 'warning' : 'success')
  await _aoConcluir?.()
}

function _gravarItem(item) {
  const cnpj = item.cnpj ? formatCNPJ(item.cnpj) : ''
  if (item.situacao === 'completar') {
    const f = item.fornecedor
    return gravarAuditado({ colecao: 'fornecedores', id: f.id, tipo: 'editar', antes: f, nome: nomeDoFornecedor(f),
      dados: { cnpj } })
  }
  return gravarAuditado({ colecao: 'fornecedores', tipo: 'criar', nome: item.nome,
    dados: { nome: normalizarTexto(item.nome), nomeOriginal: item.nome, nomeExibicao: item.nome, cnpj,
      usos: 0, criadoEm: serverTimestamp() } })
}

function _passoRelatorio() {
  const c = contarSituacoes(_itens)
  document.getElementById('imp-titulo').textContent = t('impRelatorioTitulo')
  _definir({
    sub: `${_arquivo} · ${plural(_itens.length, 'impLinhaSing', 'impLinhaPlur')}`,
    corpo: `
      ${_resumo([
        ['impResCriados', c.criado || 0], ['impResCompletados', c.completado || 0], ['impResExistentes', c.existente],
        ['impResConflitos', c.conflito], ['impResRecusadas', c.recusada], ['impResFalhas', c.erro || null],
      ])}
      ${_tabela()}`,
    rodape: `<button class="btn-primary" data-imp="fechar">${t('fechar')}</button>`,
  })
  document.querySelector(`#${MODAL_ID} [data-imp="fechar"].btn-primary`)?.focus()
}
