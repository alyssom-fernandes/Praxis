import {
  db, collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where,
} from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, renderFooter, atualizarLateral } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, abrirModal, fecharModal } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { CATEGORIAS_PADRAO, TONS_CATEGORIA, CORES_CATEGORIA, corCategoria, tomDaCor, PERFIS, STATUS, t } from './constants.js'
import { formatCNPJ, debounce, normalizarTexto } from './utils.js'
import {
  ICO, tf, plural, cabecalho, botaoNovo, vazio, linhaVazia, linhasEsqueleto, esc,
  doisDigitos, moedaCurta, moeda,
  marcarErro, limparErro, limparErros, focarPrimeiroErro,
  mascararCNPJ, ligarMascaraCNPJ, cnpjValido, ligarInterruptor, definirInterruptor,
  revelarItemLateral,
} from './config-comum.js'

// Cadastros: cada um é uma tela própria (?tela=config-cadastros&aba=…), aberta
// pela barra lateral. Os três são carregados juntos para a lateral mostrar as
// contagens de todos.
const SECOES = ['empresas', 'categorias', 'fornecedores']
const TERMINAIS = [STATUS.PAGO, STATUS.REPROVADO, STATUS.CANCELADO]
const PERDIDOS  = [STATUS.REPROVADO, STATUS.CANCELADO]

let _secao        = 'empresas'
let _empresas     = []
let _categorias   = []
let _fornecedores = []
let _contagem     = null   // ver _contar(); null quando não deu para contar
let _buscaForn    = ''

export async function renderConfigCadastros() {
  const pedida = new URLSearchParams(location.search).get('aba')
  _secao     = SECOES.includes(pedida) ? pedida : 'empresas'
  _buscaForn = ''

  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-cadastros', true)}
      <main class="main-content cfg-pagina cfg-${_secao}">
        ${_cabecalho()}
        ${_corpo()}
      </main>
      ${renderFooter()}
    </div>
    ${_secao === 'empresas' ? _modalEmpresa() : ''}
    ${_secao === 'categorias' ? _modalCategoria() : ''}
  `

  initTopbarEvents(true)
  atualizarLateral({ ativo: `cad-${_secao}` })
  revelarItemLateral()
  renderNotificacoes()
  _bindEvents()
  await _carregar()
}

// ── Estrutura de cada tela ────────────────────────────────────
function _cabecalho() {
  if (_secao === 'empresas') {
    return cabecalho(t('secaoEmpresas'), {
      resumoId: 'cad-resumo',
      acao: botaoNovo('btn-nova-empresa', t('btnNovaEmpresa'), t('cfgNovaCurto')),
    })
  }
  if (_secao === 'categorias') {
    return cabecalho(t('secaoCategorias'), {
      resumoId: 'cad-resumo',
      acao: botaoNovo('btn-nova-categoria', t('btnNovaCategoria'), t('cfgNovaCurto')),
    })
  }
  // Fornecedores entram pelas cotações: a ação da tela é a busca
  return cabecalho(t('secaoFornecedores'), {
    resumoId: 'cad-resumo',
    acao: `
      <div class="search-input-wrap cfg-busca">
        ${ICO.busca()}
        <input type="search" id="busca-forn" placeholder="${t('cfgBuscarFornecedor')}" aria-label="${t('cfgBuscarFornecedor')}" autocomplete="off">
      </div>`,
  })
}

function _corpo() {
  if (_secao === 'empresas') {
    return `
      <div class="emp-grade" id="grid-empresas" aria-busy="true">
        ${'<div class="emp-cartao is-esqueleto" aria-hidden="true"><span class="skeleton cfg-esq-card"></span></div>'.repeat(3)}
      </div>`
  }
  if (_secao === 'categorias') {
    return `
      <div class="cfg-livro">
        <table class="cfg-tabela cat-tabela">
          <thead>
            <tr>
              <th class="c-nome">${t('cfgColCategoria')}</th>
              <th class="c-tipo">${t('cfgColTipo')}</th>
              <th class="c-uso">${t('cfgColPedidos')}</th>
              <th class="c-acoes"><span class="sr-only">${t('cfgColAcoes')}</span></th>
            </tr>
          </thead>
          <tbody id="tbody-categorias">${linhasEsqueleto(4, 6)}</tbody>
        </table>
      </div>`
  }
  return `
    <div class="cfg-livro">
      <table class="cfg-tabela forn-tabela">
        <thead>
          <tr>
            <th class="c-nome">${t('cfgColFornecedor')}</th>
            <th class="c-cnpj">CNPJ</th>
            <th class="c-num">${t('cfgColPedidos')}</th>
            <th class="c-valor">${t('cfgColValor')}</th>
            <th class="c-acoes"><span class="sr-only">${t('cfgColAcoes')}</span></th>
          </tr>
        </thead>
        <tbody id="tbody-fornecedores">${linhasEsqueleto(5, 6)}</tbody>
      </table>
    </div>`
}

function _modalEmpresa() {
  return `
    <div class="modal-overlay" id="modal-empresa" role="dialog" aria-modal="true" aria-labelledby="modal-empresa-titulo">
      <div class="modal cfg-modal cfg-modal-sm">
        <div class="modal-header">
          <div class="cfg-modal-head">
            <h2 id="modal-empresa-titulo">${t('novaEmpresaTitulo')}</h2>
            <p class="cfg-modal-sub" id="modal-empresa-sub" hidden></p>
          </div>
          <button class="btn-icon" id="close-modal-empresa" aria-label="${t('btnCancelar')}">${ICO.fechar()}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="emp-id">
          <div class="form-grid form-grid-2 cfg-form">
            <div class="form-group col-span-2" data-campo="emp-nome">
              <label for="emp-nome">${t('cfgNome')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <input type="text" id="emp-nome" placeholder="${t('cfgRazaoSocial')}" maxlength="100" autocomplete="off">
            </div>
            <div class="form-group" data-campo="emp-cnpj">
              <label for="emp-cnpj">CNPJ</label>
              <input type="text" id="emp-cnpj" class="cfg-mono" placeholder="00.000.000/0000-00" maxlength="18" inputmode="numeric" autocomplete="off">
            </div>
            <div class="form-group" data-campo="emp-segmento">
              <label for="emp-segmento">${t('cfgSegmento')}</label>
              <input type="text" id="emp-segmento" placeholder="${t('cfgSegmentoPh')}" maxlength="40" autocomplete="off">
            </div>
            <div class="form-group col-span-2" id="emp-ativa-grupo">
              <div class="cfg-linha-interruptor">
                <div>
                  <span class="cfg-rotulo-campo" id="emp-ativa-rotulo">${t('cfgColStatus')}</span>
                  <p class="cfg-linha-desc" id="emp-ativa-desc">${t('cfgEmpresaAtivaDesc')}</p>
                </div>
                <div class="toggle-wrap cfg-interruptor" id="emp-ativa-wrap" role="switch" tabindex="0" aria-checked="true" aria-labelledby="emp-ativa-rotulo emp-ativa-label">
                  <span class="toggle-label" id="emp-ativa-label">${t('cfgAtiva')}</span>
                  <div class="toggle on"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-modal-empresa">${t('btnCancelar')}</button>
          <button class="btn-primary" id="salvar-empresa">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>`
}

function _modalCategoria() {
  return `
    <div class="modal-overlay" id="modal-categoria" role="dialog" aria-modal="true" aria-labelledby="modal-cat-titulo">
      <div class="modal cfg-modal cfg-modal-sm">
        <div class="modal-header">
          <div class="cfg-modal-head">
            <h2 id="modal-cat-titulo">${t('novaCategoriaTitulo')}</h2>
            <p class="cfg-modal-sub" id="modal-cat-sub" hidden></p>
          </div>
          <button class="btn-icon" id="close-modal-cat" aria-label="${t('btnCancelar')}">${ICO.fechar()}</button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="cat-id">
          <div class="cfg-form cfg-form-pilha">
            <div class="form-group" data-campo="cat-nome">
              <label for="cat-nome">${t('cfgNome')} <span class="cfg-req" aria-hidden="true">*</span></label>
              <input type="text" id="cat-nome" placeholder="${t('cfgNomeCategoriaPh')}" maxlength="60" autocomplete="off">
            </div>
            <div class="form-group">
              <span class="cfg-rotulo-campo" id="cat-cor-rotulo">${t('cfgCor')}</span>
              <div class="cfg-cores" id="cat-cores" role="radiogroup" aria-labelledby="cat-cor-rotulo">
                ${Object.entries(TONS_CATEGORIA).map(([tom, c]) => `<button type="button" class="cfg-cor" role="radio" aria-checked="false" data-cor="${c}" style="--cor:var(--rel-${tom})" aria-label="${tom}"></button>`).join('')}
              </div>
            </div>
            <div class="cfg-previa">
              <span class="cfg-rotulo-campo">${t('cfgPrevia')}</span>
              <span class="cfg-cat" id="cat-previa"><span class="cfg-cat-dot" id="cat-previa-dot"></span><span class="cfg-cat-nome" id="cat-previa-nome">${t('cfgColCategoria')}</span></span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" id="cancel-modal-cat">${t('btnCancelar')}</button>
          <button class="btn-primary" id="salvar-categoria">${t('salvarLabel')}</button>
        </div>
      </div>
    </div>`
}

// ── Carregamento ──────────────────────────────────────────────
async function _carregar() {
  try {
    const [empSnap, catSnap, fornSnap] = await Promise.all([
      getDocs(collection(db, 'empresas')),
      getDocs(collection(db, 'categorias')),
      getDocs(collection(db, 'fornecedores')),
    ])
    const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
    _empresas     = empSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => ((a.ativa === false) - (b.ativa === false)) || porNome(a, b))
    _categorias   = catSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.tipo === b.tipo ? porNome(a, b) : a.tipo === 'padrao' ? -1 : 1))
    _fornecedores = fornSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    if (!_categorias.length) await _seedCategorias()
  } catch (err) {
    console.error(err)
    prxToast(t('erroCarregar'), 'error')
  }

  _contagem = await _contar()
  _fornecedores.sort((a, b) => (_usos(b) - _usos(a)) || _nomeForn(a).localeCompare(_nomeForn(b), 'pt-BR'))

  // A tela pode ter sido trocada enquanto os dados chegavam
  if (!document.getElementById('cad-resumo')) return

  const contagens = {
    'cad-empresas': _empresas.length,
    'cad-categorias': _categorias.length,
    'cad-fornecedores': _fornecedores.length,
  }
  if (_contagem?.usuarios != null) contagens.usuarios = _contagem.usuarios
  atualizarLateral({ ativo: `cad-${_secao}`, contagens })

  _atualizarResumo()
  if (_secao === 'empresas') _renderEmpresas()
  if (_secao === 'categorias') _renderCategorias()
  if (_secao === 'fornecedores') _renderFornecedores()
}

// Pedidos por empresa (total, em aberto e valor em aberto), por categoria e por
// fornecedor (quantidade e valor), e usuários ativos por empresa. Se a leitura
// falhar, as telas mostram "—" em vez de números errados.
async function _contar() {
  try {
    const perfil = sessao.usuario?.perfil
    const raw    = sessao.usuario?.empresas
    const ids    = Array.isArray(raw) ? raw : Object.keys(raw || {})
    const [pedSnap, usrSnap] = await Promise.all([
      perfil === PERFIS.SUPREMO
        ? getDocs(collection(db, 'pedidos'))
        : (ids.length ? getDocs(query(collection(db, 'pedidos'), where('empresaId', 'in', ids.slice(0, 10)))) : null),
      getDocs(collection(db, 'usuarios')).catch(() => null),
    ])
    const c = { empresa: {}, categoria: {}, fornecedor: {}, valorFornecedor: {}, usuariosEmpresa: null, usuarios: null }
    const soma = (obj, k, n = 1) => { if (k) obj[k] = (obj[k] || 0) + n }
    pedSnap?.docs.forEach(d => {
      const p = d.data()
      const valor = Number(p.valorFinal ?? p.valorEstimado) || 0
      if (p.empresaId) {
        const e = c.empresa[p.empresaId] || (c.empresa[p.empresaId] = { pedidos: 0, valorAberto: 0 })
        e.pedidos++
        if (!TERMINAIS.includes(p.status)) e.valorAberto += valor
      }
      soma(c.categoria, p.categoriaId)
      soma(c.fornecedor, p.fornecedorId)
      if (!PERDIDOS.includes(p.status)) soma(c.valorFornecedor, p.fornecedorId, valor)
    })
    if (usrSnap) {
      c.usuariosEmpresa = {}
      c.usuarios = usrSnap.size
      usrSnap.docs.forEach(d => {
        const u = d.data()
        if (u.ativo === false) return
        const emps = Array.isArray(u.empresas) ? u.empresas : Object.keys(u.empresas || {})
        emps.forEach(id => soma(c.usuariosEmpresa, id))
      })
    }
    return c
  } catch (err) {
    console.warn('Contagem de uso indisponível:', err.message)
    return null
  }
}

async function _seedCategorias() {
  for (const cat of CATEGORIAS_PADRAO) {
    const ref = await addDoc(collection(db, 'categorias'), {
      nome: cat.nome, cor: cat.cor, tipo: 'padrao', criadaEm: serverTimestamp(),
    })
    _categorias.push({ id: ref.id, ...cat, tipo: 'padrao' })
  }
}

const _nomeForn = f => f.nomeExibicao || f.nomeOriginal || f.nome || ''
// Usos: pedidos em que o fornecedor foi escolhido; sem a contagem, o contador gravado no cadastro
const _usos     = f => (_contagem ? (_contagem.fornecedor[f.id] || 0) : (f.usos || 0))
const _num      = (mapa, id) => (_contagem && mapa ? (mapa[id] || 0) : null)
// No celular o número ganha o rótulo ("3 pedidos"), já que não há cabeçalho de coluna
const _sufixo   = n => (n == null ? '' : ` data-sufixo=" ${n === 1 ? t('usosPedido') : t('usosPedidos')}"`)
const _numHtml  = n => (n == null ? '<span class="cfg-mudo">—</span>' : n === 0 ? '<span class="cfg-mudo">0</span>' : String(n))

// Frase do cabeçalho: os números da tela e, em seguida, para que ela serve
function _atualizarResumo() {
  const el = document.getElementById('cad-resumo')
  if (!el) return
  let numeros = ''
  let desc = ''
  if (_secao === 'empresas') {
    const inativas = _empresas.filter(e => e.ativa === false).length
    numeros = plural(_empresas.length, 'cfgEmpresaSing', 'cfgEmpresaPlur') +
      (inativas ? `, ${plural(inativas, 'cfgInativaSing', 'cfgInativaPlur')}` : '')
    desc = t('cfgEmpresasDesc')
  } else if (_secao === 'categorias') {
    const proprias = _categorias.filter(c => c.tipo !== 'padrao').length
    numeros = plural(_categorias.length, 'cfgCategoriaSing', 'cfgCategoriaPlur') +
      (proprias ? `, ${plural(proprias, 'cfgCriadaEquipeSing', 'cfgCriadaEquipePlur')}` : '')
    desc = t('cfgCategoriasDesc')
  } else {
    numeros = plural(_fornecedores.length, 'cfgFornecedorSing', 'cfgFornecedorPlur')
    desc = t('cfgFornecedoresDesc')
  }
  el.innerHTML = `<span class="cfg-resumo-num">${numeros}.</span> ${desc}`
}

// ── Empresas ──────────────────────────────────────────────────
// Cada empresa é uma placa: fio de tinta no alto, nome e CNPJ, e embaixo os
// numerais da inscrição (pedidos, com o valor em aberto, e usuários).
function _renderEmpresas() {
  const grid = document.getElementById('grid-empresas')
  if (!grid) return
  grid.removeAttribute('aria-busy')

  if (!_empresas.length) {
    grid.innerHTML = vazio({
      icone: ICO.predio(20), titulo: t('cfgSemEmpresasTitulo'), sub: t('cfgSemEmpresasSub'),
      acao: `<button class="btn-secondary btn-sm" data-acao-vazio="empresa">${ICO.mais(13)}${t('btnNovaEmpresa')}</button>`,
    })
    grid.classList.add('is-vazio')
    return
  }
  grid.classList.remove('is-vazio')

  grid.innerHTML = _empresas.map(e => {
    const ativa  = e.ativa !== false
    const info   = _contagem ? (_contagem.empresa[e.id] || { pedidos: 0, valorAberto: 0 }) : null
    const usr    = _num(_contagem?.usuariosEmpresa, e.id)
    const numeral = n => (n == null ? '—' : doisDigitos(n))
    const aberto = !info ? '' : info.valorAberto > 0
      ? `<span title="${esc(moeda(info.valorAberto))}">${esc(moedaCurta(info.valorAberto))}</span> ${t('emAberto')}`
      : t('cfgNadaEmAberto')
    return `
      <article class="emp-cartao ${ativa ? '' : 'is-inativa'}" data-emp-id="${esc(e.id)}" tabindex="0" aria-label="${esc(tf('cfgEditarX', { nome: e.nome }))}">
        <div class="emp-cab">
          <h2 class="emp-nome">${esc(e.nome)}</h2>
          <span class="cfg-status ${ativa ? 'is-ativo' : ''}"><span class="cfg-ponto" aria-hidden="true"></span>${ativa ? t('cfgAtiva') : t('cfgInativa')}</span>
          <span class="emp-editar" aria-hidden="true">${ICO.editar(14)}</span>
        </div>
        <p class="emp-meta">
          ${e.cnpj ? `<span class="cfg-mono">${esc(formatCNPJ(e.cnpj))}</span>` : `<span class="cfg-mudo">${t('cnpjNaoInformado')}</span>`}
          ${e.segmento ? `<span class="emp-seg">${esc(e.segmento)}</span>` : ''}
        </p>
        <dl class="emp-numeros">
          <div class="emp-num">
            <dt>${t('cfgColPedidos')}</dt>
            <dd class="numeral">${numeral(info?.pedidos ?? null)}</dd>
            ${aberto ? `<dd class="emp-num-sub">${aberto}</dd>` : ''}
          </div>
          <div class="emp-num">
            <dt>${t('configUsuarios')}</dt>
            <dd class="numeral">${numeral(usr)}</dd>
          </div>
        </dl>
      </article>`
  }).join('')
}

// ── Categorias ────────────────────────────────────────────────
// Ao lado do número de pedidos, uma régua na cor da categoria mostra o peso de
// cada uma em relação à mais usada.
function _renderCategorias() {
  const tbody = document.getElementById('tbody-categorias')
  if (!tbody) return

  if (!_categorias.length) {
    tbody.innerHTML = linhaVazia(4, {
      icone: ICO.etiqueta(), titulo: t('cfgSemCategoriasTitulo'), sub: t('cfgSemCategoriasSub'),
      acao: `<button class="btn-secondary btn-sm" data-acao-vazio="categoria">${ICO.mais(13)}${t('btnNovaCategoria')}</button>`,
    })
    return
  }

  const maior = Math.max(1, ..._categorias.map(c => _num(_contagem?.categoria, c.id) || 0))
  tbody.innerHTML = _categorias.map(c => {
    const n   = _num(_contagem?.categoria, c.id)
    const cor = corCategoria(c.cor)
    const pct = n ? Math.max(3, Math.round((n / maior) * 100)) : 0
    return `
      <tr data-cat-id="${esc(c.id)}" tabindex="0">
        <td class="c-nome"><span class="cfg-cat" style="--cor:var(--rel-${tomDaCor(cor)})"><span class="cfg-cat-dot" aria-hidden="true"></span><span class="cfg-cat-nome">${esc(c.nome)}</span></span></td>
        <td class="c-tipo">${c.tipo === 'padrao' ? `<span class="cfg-mudo">${t('categoriaPadraoLabel')}</span>` : `<span class="cfg-tipo-propria">${t('catPersonalizadaLabel')}</span>`}</td>
        <td class="c-uso">
          <span class="cfg-uso" style="--cor:${cor};--p:${pct}%">
            <span class="cfg-uso-trilho" aria-hidden="true"><span class="cfg-uso-barra"></span></span>
            <span class="cfg-uso-n"${_sufixo(n)}>${_numHtml(n)}</span>
          </span>
        </td>
        <td class="c-acoes">
          <button class="btn-icon cfg-btn-editar btn-editar-cat" data-cat-id="${esc(c.id)}" aria-label="${esc(tf('cfgEditarX', { nome: c.nome }))}" data-tooltip="${t('editarLabel')}">${ICO.editar()}</button>
        </td>
      </tr>`
  }).join('')
}

// ── Fornecedores ──────────────────────────────────────────────
function _renderFornecedores() {
  const tbody = document.getElementById('tbody-fornecedores')
  if (!tbody) return

  const q = normalizarTexto(_buscaForn)
  const qDig = _buscaForn.replace(/\D/g, '')
  const lista = q
    ? _fornecedores.filter(f => normalizarTexto(_nomeForn(f)).includes(q) || (qDig.length >= 2 && String(f.cnpj || '').replace(/\D/g, '').includes(qDig)))
    : _fornecedores

  if (!lista.length) {
    tbody.innerHTML = q
      ? linhaVazia(5, {
          icone: ICO.busca(20), titulo: t('cfgSemResultadoTitulo'),
          sub: esc(tf('cfgSemResultadoBusca', { q: _buscaForn.trim() })),
          acao: `<button class="btn-secondary btn-sm" data-acao-vazio="limpar-forn">${t('cfgLimparBusca')}</button>`,
        })
      : linhaVazia(5, { icone: ICO.caminhao(), titulo: t('cfgSemFornecedoresTitulo'), sub: t('cfgSemFornecedoresSub') })
    return
  }

  tbody.innerHTML = lista.map(f => {
    const n = _usos(f)
    const valor = _contagem ? (_contagem.valorFornecedor[f.id] || 0) : null
    return `
      <tr data-forn-id="${esc(f.id)}" tabindex="0">
        <td class="c-nome"><span class="forn-nome">${esc(_nomeForn(f))}</span></td>
        <td class="c-cnpj">${f.cnpj ? `<span class="cfg-mono">${esc(formatCNPJ(f.cnpj))}</span>` : `<span class="cfg-mudo">${t('cnpjNaoInformado')}</span>`}</td>
        <td class="c-num"${_sufixo(n)}>${_numHtml(n)}</td>
        <td class="c-valor">${valor == null ? '<span class="cfg-mudo">—</span>' : valor > 0 ? esc(moeda(valor)) : '<span class="cfg-mudo">—</span>'}</td>
        <td class="c-acoes">
          <button class="btn-icon cfg-btn-editar btn-editar-forn" data-forn-id="${esc(f.id)}" aria-label="${esc(tf('cfgEditarX', { nome: _nomeForn(f) }))}" data-tooltip="${t('editarLabel')}">${ICO.editar()}</button>
        </td>
      </tr>`
  }).join('')
}

// ── Modal Empresa ─────────────────────────────────────────────
function _definirAtiva(on) {
  definirInterruptor(document.getElementById('emp-ativa-wrap'), on)
  const lbl = document.getElementById('emp-ativa-label')
  if (lbl) lbl.textContent = on ? t('cfgAtiva') : t('cfgInativa')
}

function _abrirModalEmpresa(emp = null) {
  limparErros(document.getElementById('modal-empresa'))
  document.getElementById('modal-empresa-titulo').textContent = emp ? t('editarEmpresaTitulo') : t('novaEmpresaTitulo')
  const sub = document.getElementById('modal-empresa-sub')
  sub.textContent = emp?.nome || ''
  sub.hidden = !emp
  document.getElementById('emp-id').value       = emp?.id || ''
  document.getElementById('emp-nome').value     = emp?.nome || ''
  document.getElementById('emp-cnpj').value     = mascararCNPJ(emp?.cnpj || '')
  document.getElementById('emp-segmento').value = emp?.segmento || ''
  // Empresa nova nasce ativa; o interruptor só aparece na edição
  document.getElementById('emp-ativa-grupo').hidden = !emp
  _definirAtiva(emp ? emp.ativa !== false : true)
  abrirModal('modal-empresa')
}

// ── Modal Categoria ───────────────────────────────────────────
function _definirCor(cor) {
  cor = corCategoria(cor)
  document.querySelectorAll('#cat-cores [data-cor]').forEach(b => {
    const on = b.dataset.cor === cor
    b.setAttribute('aria-checked', String(on))
    b.classList.toggle('active', on)
  })
  document.getElementById('cat-previa')?.style.setProperty('--cor', `var(--rel-${tomDaCor(cor)})`)
}

function _atualizarPrevia() {
  const nome = document.getElementById('cat-nome').value.trim()
  document.getElementById('cat-previa-nome').textContent = nome || t('cfgColCategoria')
}

function _abrirModalCategoria(cat = null) {
  limparErros(document.getElementById('modal-categoria'))
  document.getElementById('modal-cat-titulo').textContent = cat ? t('editarCategoriaTitulo') : t('novaCategoriaTitulo')
  const sub = document.getElementById('modal-cat-sub')
  const n = cat ? _num(_contagem?.categoria, cat.id) : null
  sub.textContent = cat ? [cat.nome, n != null ? `${n} ${n === 1 ? t('usosPedido') : t('usosPedidos')}` : ''].filter(Boolean).join(' · ') : ''
  sub.hidden = !cat
  document.getElementById('cat-id').value   = cat?.id || ''
  document.getElementById('cat-nome').value = cat?.nome || ''
  _definirCor(cat?.cor || CORES_CATEGORIA[0])
  _atualizarPrevia()
  abrirModal('modal-categoria')
}

// ── Modal Fornecedor ──────────────────────────────────────────
function _editarFornecedor(forn) {
  const MODAL_ID = 'modal-forn-edit'
  document.getElementById(MODAL_ID)?.remove()
  const usos = _usos(forn)
  const overlay = document.createElement('div')
  overlay.id = MODAL_ID
  overlay.className = 'modal-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'forn-modal-titulo')
  overlay.innerHTML = `
    <div class="modal cfg-modal cfg-modal-sm">
      <div class="modal-header">
        <div class="cfg-modal-head">
          <h2 id="forn-modal-titulo">${t('editarFornTitulo')}</h2>
          <p class="cfg-modal-sub">${esc(_nomeForn(forn))} · ${esc(usos === 1 ? `1 ${t('usosPedido')}` : `${usos} ${t('usosPedidos')}`)}</p>
        </div>
        <button class="btn-icon" id="close-forn-modal" aria-label="${t('btnCancelar')}">${ICO.fechar()}</button>
      </div>
      <div class="modal-body">
        <div class="cfg-form cfg-form-pilha">
          <div class="form-group" data-campo="forn-nome">
            <label for="forn-nome">${t('cfgNome')} <span class="cfg-req" aria-hidden="true">*</span></label>
            <input type="text" id="forn-nome" value="${esc(_nomeForn(forn))}" maxlength="100" autocomplete="off">
          </div>
          <div class="form-group" data-campo="forn-cnpj">
            <label for="forn-cnpj">CNPJ</label>
            <input type="text" id="forn-cnpj" class="cfg-mono" value="${esc(mascararCNPJ(forn.cnpj || ''))}" placeholder="00.000.000/0000-00" maxlength="18" inputmode="numeric" autocomplete="off">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-forn-modal">${t('btnCancelar')}</button>
        <button class="btn-primary" id="salvar-forn-modal">${t('salvarLabel')}</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)
  abrirModal(MODAL_ID)
  const _fechar = () => { fecharModal(MODAL_ID); setTimeout(() => overlay.remove(), 250) }
  overlay.addEventListener('click', e => { if (e.target === overlay) _fechar() })
  document.getElementById('close-forn-modal')?.addEventListener('click', _fechar)
  document.getElementById('cancel-forn-modal')?.addEventListener('click', _fechar)
  ligarMascaraCNPJ(document.getElementById('forn-cnpj'))
  document.getElementById('forn-nome')?.addEventListener('input', () => limparErro('forn-nome'))
  document.getElementById('forn-cnpj')?.addEventListener('input', () => limparErro('forn-cnpj'))
  const salvar = async () => {
    const nome = document.getElementById('forn-nome').value.trim()
    const cnpj = document.getElementById('forn-cnpj').value.trim()
    limparErros(overlay)
    if (!nome) marcarErro('forn-nome', t('nomeObrigatorio'))
    if (!cnpjValido(cnpj)) marcarErro('forn-cnpj', t('cfgCnpjInvalido'))
    if (overlay.querySelector('[data-campo].invalido')) { focarPrimeiroErro(overlay); return }
    if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }
    mostrarSpinner()
    try {
      await updateDoc(doc(db, 'fornecedores', forn.id), {
        nome: normalizarTexto(nome), nomeOriginal: nome, nomeExibicao: nome, cnpj,
      })
      _fechar()
      await _carregar()
      prxToast(t('fornecedorAtualizado'), 'success')
    } catch {
      prxToast(t('erroSalvar'), 'error')
    } finally {
      esconderSpinner()
    }
  }
  document.getElementById('salvar-forn-modal')?.addEventListener('click', salvar)
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); salvar() }
  })
}

// ── Eventos ───────────────────────────────────────────────────
function _bindEvents() {
  // Empresas: o cartão inteiro abre a edição
  const grid = document.getElementById('grid-empresas')
  const abrirEmp = card => { const emp = _empresas.find(x => x.id === card.dataset.empId); if (emp) _abrirModalEmpresa(emp) }
  grid?.addEventListener('click', e => {
    if (e.target.closest('[data-acao-vazio="empresa"]')) { _abrirModalEmpresa(); return }
    const card = e.target.closest('[data-emp-id]')
    if (card) abrirEmp(card)
  })
  grid?.addEventListener('keydown', e => {
    const card = e.target.closest('[data-emp-id]')
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirEmp(card) }
  })

  // Tabelas: a linha inteira abre a edição
  const ligarTabela = (tbodyId, attr, abrir) => {
    const tb = document.getElementById(tbodyId)
    tb?.addEventListener('click', e => {
      const acao = e.target.closest('[data-acao-vazio]')?.dataset.acaoVazio
      if (acao === 'categoria') { _abrirModalCategoria(); return }
      if (acao === 'limpar-forn') {
        const b = document.getElementById('busca-forn'); b.value = ''; _buscaForn = ''; _renderFornecedores(); b.focus(); return
      }
      const tr = e.target.closest(`tr[${attr}]`)
      if (tr) abrir(tr.getAttribute(attr))
    })
    tb?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'TR') abrir(e.target.getAttribute(attr))
    })
  }
  ligarTabela('tbody-categorias', 'data-cat-id', id => { const c = _categorias.find(x => x.id === id); if (c) _abrirModalCategoria(c) })
  ligarTabela('tbody-fornecedores', 'data-forn-id', id => { const f = _fornecedores.find(x => x.id === id); if (f) _editarFornecedor(f) })

  // Empresa
  document.getElementById('btn-nova-empresa')?.addEventListener('click', () => _abrirModalEmpresa())
  document.getElementById('close-modal-empresa')?.addEventListener('click', () => fecharModal('modal-empresa'))
  document.getElementById('cancel-modal-empresa')?.addEventListener('click', () => fecharModal('modal-empresa'))
  ligarInterruptor(document.getElementById('emp-ativa-wrap'), on => {
    const lbl = document.getElementById('emp-ativa-label')
    if (lbl) lbl.textContent = on ? t('cfgAtiva') : t('cfgInativa')
  })
  ligarMascaraCNPJ(document.getElementById('emp-cnpj'))
  document.getElementById('emp-nome')?.addEventListener('input', () => limparErro('emp-nome'))
  document.getElementById('emp-cnpj')?.addEventListener('input', () => limparErro('emp-cnpj'))
  document.getElementById('salvar-empresa')?.addEventListener('click', _salvarEmpresa)

  // Categoria
  document.getElementById('btn-nova-categoria')?.addEventListener('click', () => _abrirModalCategoria())
  document.getElementById('close-modal-cat')?.addEventListener('click', () => fecharModal('modal-categoria'))
  document.getElementById('cancel-modal-cat')?.addEventListener('click', () => fecharModal('modal-categoria'))
  document.getElementById('cat-cores')?.addEventListener('click', e => {
    const b = e.target.closest('[data-cor]')
    if (b) _definirCor(b.dataset.cor)
  })
  document.getElementById('cat-nome')?.addEventListener('input', () => { limparErro('cat-nome'); _atualizarPrevia() })
  document.getElementById('salvar-categoria')?.addEventListener('click', _salvarCategoria)

  // Enter salva nos modais de uma linha só
  document.getElementById('modal-empresa')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); _salvarEmpresa() }
  })
  document.getElementById('modal-categoria')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'cat-nome') { e.preventDefault(); _salvarCategoria() }
  })

  // Busca fornecedores
  document.getElementById('busca-forn')?.addEventListener('input',
    debounce(e => { _buscaForn = e.target.value; _renderFornecedores() }, 200))
}

// ── Salvar Empresa ────────────────────────────────────────────
async function _salvarEmpresa() {
  const modal    = document.getElementById('modal-empresa')
  const id       = document.getElementById('emp-id').value
  const nome     = document.getElementById('emp-nome').value.trim()
  const cnpj     = document.getElementById('emp-cnpj').value.trim()
  const segmento = document.getElementById('emp-segmento').value.trim()
  const ativa    = document.getElementById('emp-ativa-wrap').getAttribute('aria-checked') === 'true'

  limparErros(modal)
  if (!nome) marcarErro('emp-nome', t('nomeObrigatorio'))
  if (!cnpjValido(cnpj)) marcarErro('emp-cnpj', t('cfgCnpjInvalido'))
  if (modal.querySelector('[data-campo].invalido')) { focarPrimeiroErro(modal); return }

  // Confirmação ao inativar empresa existente
  if (id && !ativa) {
    const original = _empresas.find(e => e.id === id)
    if (original && original.ativa !== false) {
      const ok = await prxConfirm(t('cfgInativarEmpresaTitulo'), tf('cfgInativarEmpresaMsg', { nome }), t('cfgInativar'), t('btnCancelar'), true)
      if (!ok) return
    }
  }

  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }

  mostrarSpinner()
  try {
    if (id) {
      await updateDoc(doc(db, 'empresas', id), { nome, cnpj, segmento, ativa })
      prxToast(t('empresaAtualizada'), 'success')
    } else {
      await addDoc(collection(db, 'empresas'), { nome, cnpj, segmento, ativa: true, criadaEm: serverTimestamp() })
      prxToast(t('empresaCriada'), 'success')
    }
    fecharModal('modal-empresa')
    await _carregar()
  } catch {
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}

// ── Salvar Categoria ──────────────────────────────────────────
async function _salvarCategoria() {
  const modal = document.getElementById('modal-categoria')
  const id    = document.getElementById('cat-id').value
  const nome  = document.getElementById('cat-nome').value.trim()
  const cor   = (document.querySelector('#cat-cores .cfg-cor.active')?.dataset.cor || CORES_CATEGORIA[0])

  limparErros(modal)
  if (!nome) { marcarErro('cat-nome', t('nomeObrigatorio')); focarPrimeiroErro(modal); return }
  if (sessao.isDemo) { prxToast(t('modoDemo'), 'warning'); return }

  mostrarSpinner()
  try {
    if (id) {
      await updateDoc(doc(db, 'categorias', id), { nome, cor })
      prxToast(t('categoriaAtualizada'), 'success')
    } else {
      await addDoc(collection(db, 'categorias'), {
        nome, cor, tipo: 'personalizada', criadaEm: serverTimestamp(),
      })
      prxToast(t('categoriaCriada'), 'success')
    }
    fecharModal('modal-categoria')
    await _carregar()
  } catch {
    prxToast(t('erroSalvar'), 'error')
  } finally {
    esconderSpinner()
  }
}
