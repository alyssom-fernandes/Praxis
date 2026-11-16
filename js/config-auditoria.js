// Administração › Auditoria: quem mudou usuário, convite, empresa, categoria e
// fornecedor, quando, e o que mudou (antes → depois). Os registros nascem com
// cada mudança (js/auditoria.js) e não mudam nem somem (firestore.rules).
//
// O supremo lê todos; o gestor, os que tocam as empresas dele (a consulta
// filtra por empresaIds, como as regras exigem). Sem orderBy: a ordem é feita
// aqui, para a consulta não pedir índice composto.

import { db, collection, getDocs, query, where, consulta, eContaDemo } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter } from './app.js'
import { sessao } from './estado.js'
import { prxToast } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { PERFIS, PERFIS_LABEL, t } from './constants.js'
import { dataEHora, empresasDoUsuario, hojeISO, baixarCSV } from './utils.js'
import { ICO, tf, cabecalho, linhaVazia, linhasEsqueleto, esc, revelarItemLateral, completarContagensLateral } from './config-comum.js'

const COLUNAS = 4
const PERIODOS = { 30: 30, 90: 90, tudo: null }
let _registros = []
let _empresas = {}
let _filtro = { pessoa: '', entidade: '', periodo: '90' }

const _ENTIDADE_ROTULO = () => ({
  usuario: t('audUsuario'), convite: t('audConvite'), empresa: t('audEmpresa'),
  categoria: t('audCategoria'), fornecedor: t('audFornecedor'),
})
const _ACAO_ROTULO = () => ({ criar: t('audCriou'), editar: t('audEditou'), apagar: t('audApagou') })
const _CAMPO_ROTULO = () => ({
  nome: t('cfgNome'), email: t('cfgEmail'), perfil: t('cfgColPerfil'), empresas: t('cfgColEmpresas'),
  ativo: t('audAtivo'), ativa: t('audAtivo'), cnpj: 'CNPJ', segmento: t('audSegmento'), cor: t('audCor'),
  expiraEm: t('audExpira'), tipo: t('audTipo'),
})
// Campos que repetem outro no registro (o fornecedor guarda o nome em três formas)
const _CAMPOS_OCULTOS = new Set(['nomeOriginal', 'nomeExibicao'])

const _ms = v => (v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : 0)

function _valor(campo, v) {
  if (v == null || v === '') return '—'
  if (campo === 'perfil') return PERFIS_LABEL[v] || v
  if (campo === 'empresas' && Array.isArray(v)) return v.map(id => _empresas[id] || id).join(', ') || '—'
  if (typeof v === 'boolean') return v ? t('sim') : t('nao')
  if (campo === 'expiraEm' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v))) return dataEHora(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// As mudanças de um registro, campo a campo: [rótulo, antes, depois]
function _mudancas(r) {
  const rot = _CAMPO_ROTULO()
  const campos = [...new Set([...Object.keys(r.depois || {}), ...Object.keys(r.antes || {})])]
    .filter(c => !_CAMPOS_OCULTOS.has(c))
  return campos.map(c => [rot[c] || c, r.antes ? _valor(c, r.antes[c]) : '', r.depois ? _valor(c, r.depois[c]) : ''])
}

export async function renderConfigAuditoria() {
  _filtro = { pessoa: '', entidade: '', periodo: '90' }
  const ent = _ENTIDADE_ROTULO()
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-auditoria', true)}
      <main class="main-content cfg-pagina aud-pagina">
        ${cabecalho(t('audTitulo'), {
          resumoId: 'aud-resumo',
          acao: `<button type="button" class="btn-secondary" id="btn-aud-csv">${ICO.baixar()}${t('exportarCSV')}</button>`,
        })}

        <div class="cfg-toolbar aud-filtros">
          <div class="form-group">
            <label for="aud-pessoa">${t('audFiltroPessoa')}</label>
            <select id="aud-pessoa"><option value="">${t('audTodas')}</option></select>
          </div>
          <div class="form-group">
            <label for="aud-entidade">${t('audFiltroEntidade')}</label>
            <select id="aud-entidade">
              <option value="">${t('audTodos')}</option>
              ${Object.entries(ent).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="aud-periodo">${t('audFiltroPeriodo')}</label>
            <select id="aud-periodo">
              <option value="30">${t('audUltimos30')}</option>
              <option value="90" selected>${t('audUltimos90')}</option>
              <option value="tudo">${t('audTudo')}</option>
            </select>
          </div>
        </div>

        <div class="cfg-livro">
          <table class="cfg-tabela aud-tabela">
            <thead>
              <tr>
                <th class="c-quando">${t('audColQuando')}</th>
                <th class="c-quem">${t('audColQuem')}</th>
                <th class="c-oque">${t('audColOque')}</th>
                <th class="c-mudanca">${t('audColMudanca')}</th>
              </tr>
            </thead>
            <tbody id="tbody-auditoria">${linhasEsqueleto(COLUNAS, 6)}</tbody>
          </table>
        </div>
      </main>
      ${renderFooter()}
    </div>`

  initTopbarEvents(true)
  renderNotificacoes()
  revelarItemLateral()

  for (const [id, chave] of [['aud-pessoa', 'pessoa'], ['aud-entidade', 'entidade'], ['aud-periodo', 'periodo']]) {
    document.getElementById(id)?.addEventListener('change', e => { _filtro[chave] = e.target.value; _renderLista() })
  }
  document.getElementById('btn-aud-csv')?.addEventListener('click', _exportar)

  await _carregar()
  completarContagensLateral({})
}

async function _carregar() {
  try {
    const u = sessao.usuario
    const ref = collection(db, 'auditoria')
    const empresas = empresasDoUsuario(u).slice(0, 30)
    // O supremo e a demo leem tudo (a demo, só o que é dela); o gestor, pelas empresas dele
    const q = eContaDemo() || u.perfil === PERFIS.SUPREMO ? consulta(ref)
      : empresas.length ? query(ref, where('empresaIds', 'array-contains-any', empresas)) : null
    const [snap, empSnap] = await Promise.all([q ? getDocs(q) : Promise.resolve({ docs: [] }), getDocs(consulta(collection(db, 'empresas')))])
    _empresas = Object.fromEntries(empSnap.docs.map(d => [d.id, d.data().nome || d.id]))
    _registros = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => _ms(b.em) - _ms(a.em))
    const pessoas = [...new Set(_registros.map(r => r.autorNome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    const sel = document.getElementById('aud-pessoa')
    if (sel) sel.insertAdjacentHTML('beforeend', pessoas.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join(''))
    _renderLista()
  } catch (err) {
    console.error(err)
    const tbody = document.getElementById('tbody-auditoria')
    if (tbody) tbody.innerHTML = linhaVazia(COLUNAS, { titulo: t('audErroTitulo'), texto: t('verificarConexao') })
  }
}

function _filtrados() {
  const dias = PERIODOS[_filtro.periodo]
  const desde = dias ? Date.now() - dias * 864e5 : 0
  return _registros.filter(r =>
    (!_filtro.pessoa || r.autorNome === _filtro.pessoa) &&
    (!_filtro.entidade || r.entidade === _filtro.entidade) &&
    _ms(r.em) >= desde)
}

function _renderLista() {
  const tbody = document.getElementById('tbody-auditoria')
  if (!tbody) return
  const lista = _filtrados()
  const resumo = document.getElementById('aud-resumo')
  if (resumo) resumo.textContent = lista.length === 1 ? t('audResumoUm') : tf('audResumoN', { n: lista.length })
  document.getElementById('btn-aud-csv')?.toggleAttribute('disabled', !lista.length)

  if (!lista.length) {
    const comFiltro = _filtro.pessoa || _filtro.entidade || _filtro.periodo !== 'tudo'
    tbody.innerHTML = linhaVazia(COLUNAS, comFiltro && _registros.length
      ? { titulo: t('audSemResultadoTitulo'), texto: t('audSemResultadoTexto') }
      : { titulo: t('audVazioTitulo'), texto: t('audVazioTexto') })
    return
  }
  const ent = _ENTIDADE_ROTULO()
  const acao = _ACAO_ROTULO()
  tbody.innerHTML = lista.map(r => {
    const mud = _mudancas(r)
    const detalhe = r.acao === 'apagar' ? `<span class="aud-mudo">${t('audRegistroApagado')}</span>`
      : mud.length ? `<ul class="aud-mudancas">${mud.map(([campo, antes, depois]) => `
          <li><span class="aud-campo">${esc(campo)}</span>${r.acao === 'criar'
            ? `<span class="aud-depois">${esc(depois)}</span>`
            : `<span class="aud-antes">${esc(antes)}</span><span class="aud-seta" aria-label="${t('audPara')}">→</span><span class="aud-depois">${esc(depois)}</span>`}</li>`).join('')}
        </ul>` : '<span class="aud-mudo">—</span>'
    return `
      <tr>
        <td class="c-quando">${r.em ? dataEHora(r.em) : '—'}</td>
        <td class="c-quem">${esc(r.autorNome || '—')}</td>
        <td class="c-oque"><span class="aud-acao">${acao[r.acao] || esc(r.acao)} ${(ent[r.entidade] || esc(r.entidade)).toLowerCase()}</span><span class="aud-nome">${esc(r.nome || r.entidadeId)}</span></td>
        <td class="c-mudanca">${detalhe}</td>
      </tr>`
  }).join('')
}

// Uma linha por campo mudado (o registro de apagar e o sem mudança, uma linha só)
function _exportar() {
  const lista = _filtrados()
  if (!lista.length) return
  const ent = _ENTIDADE_ROTULO()
  const acao = _ACAO_ROTULO()
  const linhas = lista.flatMap(r => {
    const base = [r.em ? dataEHora(r.em) : '', r.autorNome || '', ent[r.entidade] || r.entidade, r.nome || r.entidadeId, acao[r.acao] || r.acao]
    const mud = r.acao === 'apagar' ? [] : _mudancas(r)
    return mud.length ? mud.map(m => [...base, ...m]) : [[...base, '', '', '']]
  })
  baixarCSV(`praxis-auditoria-${hojeISO()}.csv`,
    [t('audColQuando'), t('audColQuem'), t('audFiltroEntidade'), t('cfgNome'), t('audColAcao'), t('audColCampo'), t('audColAntes'), t('audColDepois')],
    linhas)
  prxToast(lista.length === 1 ? t('audExportadoUm') : tf('audExportadoN', { n: lista.length }), 'success')
}
