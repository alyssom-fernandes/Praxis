// Tela da compra já feita: um formulário só, que no celular ocupa a tela
// inteira (com o botão fixo embaixo) e no computador abre como janela. O que
// gravar e o que validar vêm de js/lancamento.js, o mesmo que as regras
// conferem. O pedido, o número e as parcelas entram numa transação só.
import {
  db, collection, doc, getDocs, runTransaction, serverTimestamp,
  consulta, consultaUsuarios, marcaDemo, novoPedidoRef, contadorPedidosRef,
} from './firebase.js'
import { navegar } from './app.js'
import { sessao } from './estado.js'
import { abrirModal, fecharModal, prxToast, exigirConexao, btnComLoading, avisoNoFormulario } from './ui.js'
import { PERFIS, t, corCategoria } from './constants.js'
import { esc, hojeISO, maisXDiasISO, parseMoeda, empresasDoUsuario, mensagemDeErro, normalizarTexto } from './utils.js'
import { MOTIVOS_LANCAMENTO, MAX_NOTA, errosDoLancamento, montarLancamento, pessoa } from './lancamento.js'
import { autocompletar } from './autocompletar.js'
import { prepararCampoNota } from './ler-nota.js'

const ID = 'modal-lancamento'
const _ic = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ICO_X = _ic('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>')

let _usuarios = []
let _empresas = []

const _gestor = () => [PERFIS.GESTOR, PERFIS.SUPREMO].includes(sessao.usuario?.perfil)
// Última empresa em que a pessoa registrou algo (a mesma do novo pedido)
const _chaveUltimaEmpresa = () => `praxis_ultima_empresa_${sessao.usuario?.id || ''}`
function _ultimaEmpresa() { try { return localStorage.getItem(_chaveUltimaEmpresa()) } catch { return null } }
function _guardarUltimaEmpresa(id) { try { localStorage.setItem(_chaveUltimaEmpresa(), id) } catch { /* sem armazenamento */ } }

// Abre o formulário. `aoConcluir(id)` roda depois de gravar
export async function abrirLancamento({ aoConcluir } = {}) {
  const u = sessao.usuario
  if (!u) return
  const supremo = u.perfil === PERFIS.SUPREMO
  const minhas = empresasDoUsuario(u)
  const [empSnap, catSnap, fornSnap, usrSnap] = await Promise.all([
    getDocs(consulta(collection(db, 'empresas'))).catch(() => null),
    getDocs(consulta(collection(db, 'categorias'))).catch(() => null),
    getDocs(consulta(collection(db, 'fornecedores'))).catch(() => null),
    _gestor() ? getDocs(consultaUsuarios(u)).catch(() => null) : Promise.resolve(null),
  ])
  _empresas = (empSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.ativa !== false && (supremo || sessao.isDemo || minhas.includes(e.id)))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
  const categorias = (catSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.ativa !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
  const fornecedores = (fornSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }))
  _usuarios = (usrSnap?.docs || []).map(d => ({ id: d.id, ...d.data() }))
    .filter(x => x.ativo !== false && x.perfil !== 'demo' && x.id !== u.id)
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))

  document.getElementById(ID)?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay lanc-overlay'
  overlay.id = ID
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'lc-h2')
  overlay.innerHTML = _html({ categorias })
  document.body.appendChild(overlay)
  _preencherPessoas()
  autocompletar(document.getElementById('lc-fornecedor'), fornecedores.map(f => ({ nome: _nomeForn(f), usos: f.usos || 0 })))
  prepararCampoNota(document.getElementById('lc-nota'))
  _ligar(overlay, { fornecedores, aoConcluir })
  abrirModal(ID)
}

function _html({ categorias }) {
  const u = sessao.usuario
  const umaEmpresa = _empresas.length === 1
  const campo = (id, rotulo, html, { obrigatorio = true, cls = '' } = {}) => `
    <div class="form-group ${cls}" data-campo="${id}">
      <label for="${id}">${rotulo}${obrigatorio ? ' <span class="np-req" aria-hidden="true">*</span>' : ` <span class="np-opcional">${t('opcional')}</span>`}</label>
      ${html}
    </div>`
  const seg = (nome, rotulo, opcoes) => `
    <div class="form-group" data-campo="lc-${nome}">
      <span class="form-label-falso" id="lc-${nome}-rot">${rotulo}</span>
      <div class="seg" role="radiogroup" aria-labelledby="lc-${nome}-rot" data-seg="${nome}">
        ${opcoes.map(([valor, texto], i) => `<button type="button" class="seg-op${i === 0 ? ' active' : ''}" role="radio" aria-checked="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-valor="${valor}">${texto}</button>`).join('')}
      </div>
    </div>`
  const pessoaCampo = (id, rotulo) => campo(id, rotulo, `
      <select id="${id}"></select>
      <input type="text" id="${id}-nome" class="lanc-pessoa-nome" placeholder="${t('lancNomePessoa')}" maxlength="120" autocomplete="off" hidden aria-label="${t('lancNomePessoa')}">`)
  return `
    <div class="modal lanc-modal">
      <div class="modal-header">
        <div class="np-head">
          <h2 id="lc-h2">${t('lancTitulo')}</h2>
          <p class="np-sub">${t('lancSub')}</p>
        </div>
        <button type="button" class="btn-icon" data-fechar title="${t('fechar')}" aria-label="${t('fechar')}">${ICO_X}</button>
      </div>
      <div class="modal-body">
        <form id="form-lancamento" class="lanc-form" novalidate>
          <section class="lanc-secao" aria-labelledby="lc-s1">
            <h3 class="lanc-secao-tit" id="lc-s1">${t('lancOQue')}</h3>
            ${campo('lc-titulo', t('npTitulo'), `<input type="text" id="lc-titulo" placeholder="${t('lancOQuePlaceholder')}" maxlength="120" autocomplete="off" enterkeyhint="next">`)}
            ${umaEmpresa
              ? `<input type="hidden" id="lc-empresa" value="${esc(_empresas[0].id)}">`
              : campo('lc-empresa', t('npEmpresa'), `<select id="lc-empresa"><option value="">${t('selecionar')}</option>${_empresas.map(e => `<option value="${esc(e.id)}"${e.id === _ultimaEmpresa() ? ' selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>`)}
          </section>

          <section class="lanc-secao" aria-labelledby="lc-s2">
            <h3 class="lanc-secao-tit" id="lc-s2">${t('lancOnde')}</h3>
            ${campo('lc-fornecedor', t('lancFornecedor'), `<input type="text" id="lc-fornecedor" placeholder="${t('lancFornecedorPlaceholder')}" maxlength="120" autocomplete="off">`)}
            <div class="lanc-par">
              ${campo('lc-valor', t('lancValor'), `<input type="text" id="lc-valor" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off">`)}
              ${campo('lc-data', t('lancData'), `<input type="date" id="lc-data" value="${hojeISO()}" max="${hojeISO()}">`)}
            </div>
          </section>

          <section class="lanc-secao" aria-labelledby="lc-s3">
            <h3 class="lanc-secao-tit" id="lc-s3">${t('lancSituacao')}</h3>
            ${seg('recebido', t('lancRecebido'), [['sim', t('lancRecebidoSim')], ['nao', t('lancRecebidoNao')]])}
            ${seg('pago', t('lancPagamento'), [['sim', t('lancPagoSim')], ['nao', t('lancPagoNao')]])}
            <div class="lanc-par" id="lc-a-pagar" hidden>
              ${campo('lc-vencimento', t('lancVencimento'), `<input type="date" id="lc-vencimento" value="${maisXDiasISO(30)}">`)}
              ${campo('lc-parcelas', t('lancParcelas'), `<input type="number" id="lc-parcelas" value="1" min="1" max="60" inputmode="numeric">`)}
            </div>
            ${campo('lc-nota', t('lancNota'), `<input type="text" id="lc-nota" inputmode="numeric" placeholder="${t('lancNotaPlaceholder')}" maxlength="${MAX_NOTA}" autocomplete="off">`, { obrigatorio: false })}
          </section>

          <section class="lanc-secao" aria-labelledby="lc-s4">
            <h3 class="lanc-secao-tit" id="lc-s4">${t('lancPessoas')}</h3>
            ${_gestor() ? '' : pessoaCampo('lc-autorizado-por', t('lancAutorizadoPor'))}
            <div class="lanc-pessoas-resumo" id="lc-pessoas-resumo">
              <span id="lc-pessoas-texto">${esc(t(_gestor() ? 'lancPessoasResumoGestor' : 'lancPessoasResumo'))}</span>
              <button type="button" class="btn-ghost btn-sm" id="lc-pessoas-alterar" aria-expanded="false" aria-controls="lc-pessoas-campos">${t('lancAlterar')}</button>
            </div>
            <div class="lanc-pessoas-campos" id="lc-pessoas-campos" hidden>
              ${pessoaCampo('lc-pedido-por', t('lancPedidoPor'))}
              ${_gestor() ? pessoaCampo('lc-autorizado-por', t('lancAutorizadoPor')) : ''}
              ${pessoaCampo('lc-comprado-por', t('lancCompradoPor'))}
            </div>
          </section>

          <section class="lanc-secao" aria-labelledby="lc-s5">
            <h3 class="lanc-secao-tit" id="lc-s5">${t('lancMotivo')} <span class="np-req" aria-hidden="true">*</span></h3>
            <div class="form-group" data-campo="lc-motivo">
              <div class="category-chips" id="lc-motivos" role="radiogroup" aria-labelledby="lc-s5">
                ${MOTIVOS_LANCAMENTO.map(m => `<button type="button" class="chip" role="radio" aria-checked="false" data-motivo="${m}">${t(`lancMotivo_${m}`)}</button>`).join('')}
              </div>
            </div>
            ${campo('lc-detalhes', t('lancDetalhes'), `<textarea id="lc-detalhes" rows="3" maxlength="1000" placeholder="${t('lancDetalhesPlaceholder')}"></textarea>`, { obrigatorio: false })}
          </section>
          <details class="lanc-mais" id="lc-mais">
            <summary>${t('npMaisDetalhes')}</summary>
            <div class="lanc-mais-corpo">
            ${categorias.length ? `
            <div class="form-group" data-campo="lc-categoria">
              <span class="form-label-falso" id="lc-cat-rot">${t('npCategoria')} <span class="np-opcional">${t('opcional')}</span></span>
              <div class="category-chips" id="lc-categorias" role="radiogroup" aria-labelledby="lc-cat-rot">
                ${categorias.map(c => `<button type="button" class="chip" role="radio" aria-checked="false" data-id="${esc(c.id)}"><span class="chip-dot" data-estilo="background:${corCategoria(c.cor)}"></span>${esc(c.nome)}</button>`).join('')}
              </div>
            </div>` : ''}
            ${campo('lc-link', t('lancLink'), `<input type="url" id="lc-link" inputmode="url" placeholder="${t('cotLinkPlaceholder')}" autocomplete="off">`, { obrigatorio: false })}
            </div>
          </details>
          <p class="lanc-quem">${esc(t('lancResumo', { quem: u.nome || u.email || '', data: hojeISO().split('-').reverse().join('/') }))}</p>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn-secondary" data-fechar>${t('btnCancelar')}</button>
        <button type="button" class="btn-primary" id="btn-lancar">${t('lancSalvar')}</button>
      </div>
    </div>`
}

// As três pessoas: "Eu", as pessoas da empresa (para quem administra) e
// "Outra pessoa", que mostra o campo do nome
function _preencherPessoas() {
  const u = sessao.usuario
  const empresaId = document.getElementById('lc-empresa')?.value
  const daEmpresa = _usuarios.filter(x => x.perfil === PERFIS.SUPREMO || !empresaId || empresasDoUsuario(x).includes(empresaId))
  const padrao = { 'lc-pedido-por': 'eu', 'lc-comprado-por': 'eu', 'lc-autorizado-por': _gestor() ? 'eu' : '' }
  for (const id of ['lc-pedido-por', 'lc-autorizado-por', 'lc-comprado-por']) {
    const sel = document.getElementById(id)
    if (!sel) continue
    const atual = sel.value || padrao[id]
    sel.innerHTML = `
      <option value="">${t('lancEscolher')}</option>
      <option value="eu">${esc(t('lancEu', { nome: u.nome || u.email || '' }))}</option>
      ${daEmpresa.map(x => `<option value="u:${esc(x.id)}">${esc(x.nome || x.email)}</option>`).join('')}
      <option value="outra">${t('lancOutraPessoa')}</option>`
    sel.value = [...sel.options].some(o => o.value === atual) ? atual : padrao[id]
    _mostrarNome(id)
  }
}
// Mostra os campos das pessoas (o resumo some)
function _abrirPessoas(focar = false) {
  const campos = document.getElementById('lc-pessoas-campos')
  if (!campos || !campos.hidden) return
  campos.hidden = false
  document.getElementById('lc-pessoas-resumo').hidden = true
  document.getElementById('lc-pessoas-alterar')?.setAttribute('aria-expanded', 'true')
  if (focar) campos.querySelector('select')?.focus()
}

function _mostrarNome(id) {
  const outra = document.getElementById(id)?.value === 'outra'
  const nome = document.getElementById(`${id}-nome`)
  if (nome) nome.hidden = !outra
}
function _lerPessoa(id) {
  const v = document.getElementById(id)?.value || ''
  const u = sessao.usuario
  if (v === 'eu') return pessoa(u.id, u.nome || u.email)
  if (v.startsWith('u:')) {
    const x = _usuarios.find(p => p.id === v.slice(2))
    return pessoa(x?.id, x?.nome || x?.email)
  }
  if (v === 'outra') return pessoa(null, document.getElementById(`${id}-nome`)?.value)
  return pessoa(null, '')
}

const _seg = nome => document.querySelector(`.seg[data-seg="${nome}"] .seg-op.active`)?.dataset.valor === 'sim'

function _ligar(overlay, { fornecedores, aoConcluir }) {
  const fechar = () => { fecharModal(ID); setTimeout(() => overlay.remove(), 250) }
  overlay.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar))
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) fechar() })
  overlay.addEventListener('keydown', e => { if (e.key === 'Escape') fechar() })

  // Chips de escolha única (categoria, que pode ficar sem nenhuma, e motivo)
  const grupoUnico = (seletor, { desmarca = false } = {}) => {
    const grupo = overlay.querySelector(seletor)
    grupo?.addEventListener('click', e => {
      const chip = e.target.closest('.chip')
      if (!chip) return
      const ja = chip.classList.contains('selected')
      grupo.querySelectorAll('.chip').forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-checked', 'false') })
      if (!(ja && desmarca)) { chip.classList.add('selected'); chip.setAttribute('aria-checked', 'true') }
      _limpar(grupo.closest('[data-campo]')?.dataset.campo)
      if (seletor === '#lc-motivos') _limpar('lc-detalhes')
    })
  }
  grupoUnico('#lc-categorias', { desmarca: true })
  grupoUnico('#lc-motivos')

  // Controles de duas opções (setas trocam, como um grupo de rádio)
  overlay.querySelectorAll('.seg').forEach(seg => {
    const marcar = op => {
      seg.querySelectorAll('.seg-op').forEach(o => {
        const on = o === op
        o.classList.toggle('active', on)
        o.setAttribute('aria-checked', String(on))
        o.tabIndex = on ? 0 : -1
      })
      if (seg.dataset.seg === 'pago') document.getElementById('lc-a-pagar').hidden = _seg('pago')
    }
    seg.addEventListener('click', e => { const op = e.target.closest('.seg-op'); if (op) marcar(op) })
    seg.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      e.preventDefault()
      const ops = [...seg.querySelectorAll('.seg-op')]
      const i = ops.findIndex(o => o.classList.contains('active'))
      const prox = ops[(i + 1) % ops.length]
      marcar(prox); prox.focus()
    })
  })

  document.getElementById('lc-empresa')?.addEventListener('change', () => _preencherPessoas())
  document.getElementById('lc-pessoas-alterar')?.addEventListener('click', () => _abrirPessoas(true))
  for (const id of ['lc-pedido-por', 'lc-autorizado-por', 'lc-comprado-por']) {
    document.getElementById(id)?.addEventListener('change', () => {
      _mostrarNome(id)
      _limpar(id)
      if (document.getElementById(id).value === 'outra') document.getElementById(`${id}-nome`)?.focus()
    })
    document.getElementById(`${id}-nome`)?.addEventListener('input', () => _limpar(id))
  }
  overlay.querySelectorAll('input, select, textarea').forEach(c => {
    c.addEventListener('input', () => _limpar(c.closest('[data-campo]')?.dataset.campo))
  })

  const btn = document.getElementById('btn-lancar')
  btn?.addEventListener('click', () => btnComLoading(btn, () => _gravar({ fornecedores, fechar, aoConcluir })))
}

function _limpar(campo) {
  if (!campo) return
  const grupo = document.querySelector(`#${ID} [data-campo="${campo}"]`)
  grupo?.classList.remove('invalido')
  grupo?.querySelector('.form-error')?.remove()
  grupo?.querySelector('[aria-invalid]')?.removeAttribute('aria-invalid')
}
function _marcar(campo, chave) {
  const grupo = document.querySelector(`#${ID} [data-campo="${campo}"]`)
  if (!grupo) return
  grupo.classList.add('invalido')
  grupo.querySelector('.form-error')?.remove()
  const erro = document.createElement('div')
  erro.className = 'form-error'
  erro.id = `${campo}-erro`
  erro.textContent = t(chave)
  grupo.appendChild(erro)
  const entrada = grupo.querySelector('input:not([type=hidden]):not(.campo-data-nativo), select, textarea, .chip')
  if (entrada) { entrada.setAttribute('aria-invalid', 'true'); entrada.setAttribute('aria-describedby', erro.id) }
}

// O nome do fornecedor como foi cadastrado (o campo nome guarda a forma normalizada)
const _nomeForn = f => f.nomeExibicao || f.nomeOriginal || f.nome || ''

function _ler(fornecedores) {
  const fornecedorNome = document.getElementById('lc-fornecedor')?.value.trim() || ''
  const forn = fornecedorNome ? fornecedores.find(f => normalizarTexto(_nomeForn(f)) === normalizarTexto(fornecedorNome)) : null
  return {
    titulo: document.getElementById('lc-titulo')?.value.trim(),
    empresaId: document.getElementById('lc-empresa')?.value,
    categoriaId: document.querySelector('#lc-categorias .chip.selected')?.dataset.id || '',
    fornecedorNome,
    fornecedorId: forn?.id || null,
    valorFinal: parseMoeda(document.getElementById('lc-valor')?.value || ''),
    dataCompra: document.getElementById('lc-data')?.value,
    link: document.getElementById('lc-link')?.value.trim(),
    notaFiscal: document.getElementById('lc-nota')?.value.trim(),
    recebido: _seg('recebido'),
    pago: _seg('pago'),
    vencimento: document.getElementById('lc-vencimento')?.value,
    parcelas: Number(document.getElementById('lc-parcelas')?.value),
    pedidoPor: _lerPessoa('lc-pedido-por'),
    autorizadoPor: _lerPessoa('lc-autorizado-por'),
    compradoPor: _lerPessoa('lc-comprado-por'),
    motivo: document.querySelector('#lc-motivos .chip.selected')?.dataset.motivo || '',
    detalhes: document.getElementById('lc-detalhes')?.value.trim(),
  }
}

async function _gravar({ fornecedores, fechar, aoConcluir }) {
  const v = _ler(fornecedores)
  document.querySelectorAll(`#${ID} [data-campo]`).forEach(g => _limpar(g.dataset.campo))
  const erros = errosDoLancamento(v, hojeISO())
  // Erro num campo recolhido: abre a parte dele antes de marcar
  if (erros.some(([c]) => ['lc-pedido-por', 'lc-comprado-por'].includes(c) || (c === 'lc-autorizado-por' && _gestor()))) _abrirPessoas()
  if (erros.some(([c]) => ['lc-link', 'lc-categoria'].includes(c))) document.getElementById('lc-mais').open = true
  if (erros.length) {
    erros.forEach(([campo, chave]) => _marcar(campo, chave))
    const grupo = document.querySelector(`#${ID} [data-campo="${erros[0][0]}"]`)
    grupo?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    grupo?.querySelector('input:not([type=hidden]):not(.campo-data-nativo), select, textarea, .chip')?.focus({ preventScroll: true })
    // Um erro só (a chave da nota, a data): o aviso diz qual; vários, o geral
    avisoNoFormulario(`#${ID}`, erros.length === 1 ? t(erros[0][1]) : t('erroCamposObrigatorios'))
    return
  }
  if (!exigirConexao()) return
  const u = sessao.usuario
  const { pedido, parcelas } = montarLancamento(v, { id: u.id, nome: u.nome || u.email || '', perfil: u.perfil }, serverTimestamp())
  try {
    const contadorRef = contadorPedidosRef()
    const pedidoRef = novoPedidoRef()
    await runTransaction(db, async tx => {
      const snap = await tx.get(contadorRef)
      const total = ((snap.exists() ? snap.data().totalPedidos : 0) || 0) + 1
      tx.set(pedidoRef, { ...marcaDemo(), ...pedido, numeroPedido: `PRX-${String(total).padStart(4, '0')}` })
      parcelas.forEach(p => tx.set(doc(collection(db, 'pedidos', pedidoRef.id, 'parcelas')), p))
      tx.set(contadorRef, { totalPedidos: total }, { merge: true })
    })
    _guardarUltimaEmpresa(v.empresaId)
    fechar()
    const pendente = pedido.lancamento.autorizacao === 'pendente'
    prxToast(t(pendente ? 'lancRegistradoPendente' : 'lancRegistrado'), 'success',
      { acoes: [{ rotulo: t('verPedido'), fn: () => navegar('detalhe', { id: pedidoRef.id }) }] })
    aoConcluir?.(pedidoRef.id)
  } catch (err) {
    console.error(err)
    prxToast(mensagemDeErro(err, t('lancErro')), 'error')
  }
}
