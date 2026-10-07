import { db, collection, getDocs } from './firebase.js'
import { sessao, renderTopbar, initTopbarEvents, renderFooter, atualizarLateral } from './app.js'
import { reativarTour, toggleTheme } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t } from './constants.js'
import { ICO, cabecalho, perfilHtml, iniciais, revelarItemLateral, completarContagensLateral, esc } from './config-comum.js'

// Ajustes: quem é você no Praxis e as preferências deste navegador. Restaurar
// os dados de demonstração fica na faixa do modo demo, no alto de toda tela.
const _temaAtual = () => (document.documentElement.classList.contains('light') ? 'light' : 'dark')

export async function renderConfigGeral() {
  const u    = sessao.usuario || {}
  const tema = _temaAtual()
  const opcaoTema = (valor, icone, rotulo) => `
    <button type="button" class="cfg-seg-op ${tema === valor ? 'active' : ''}" role="radio" aria-checked="${tema === valor}" tabindex="${tema === valor ? 0 : -1}" data-tema="${valor}">
      ${icone}<span>${rotulo}</span>
    </button>`

  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-geral', true)}
      <main class="main-content cfg-pagina cfg-pagina-estreita">
        ${cabecalho(t('navAjustes'), { resumo: t('cfgGeralResumo') })}

        <section class="cfg-secao" aria-labelledby="sec-acesso">
          <h2 class="rotulo-secao" id="sec-acesso">${t('cfgSeuAcesso')}</h2>
          <div class="cfg-lista">
            <div class="cfg-item cfg-item-conta">
              <span class="avatar avatar-lg" aria-hidden="true">${esc(iniciais(u.nome || u.email))}</span>
              <div class="cfg-item-texto">
                <div class="cfg-item-titulo">${esc(u.nome || '')}</div>
                <p class="cfg-item-desc">${esc(u.email || '')}</p>
                <dl class="cfg-fatos">
                  <div>
                    <dt>${t('cfgColPerfil')}</dt>
                    <dd>${perfilHtml(u.perfil)}<span class="cfg-fatos-desc">${t(`perfilDesc_${u.perfil}`)}</span></dd>
                  </div>
                  <div>
                    <dt>${t('cfgColEmpresas')}</dt>
                    <dd id="cfg-minhas-empresas"><span class="skeleton cfg-esq" aria-hidden="true"></span></dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        <section class="cfg-secao" aria-labelledby="sec-pref">
          <h2 class="rotulo-secao" id="sec-pref">${t('cfgPreferencias')}</h2>
          <div class="cfg-lista">
            <div class="cfg-item">
              <div class="cfg-item-texto">
                <div class="cfg-item-titulo" id="cfg-aparencia-titulo">${t('cfgAparencia')}</div>
                <p class="cfg-item-desc">${t('cfgAparenciaDesc')}</p>
              </div>
              <div class="cfg-seg" id="cfg-tema" role="radiogroup" aria-labelledby="cfg-aparencia-titulo">
                ${opcaoTema('dark', ICO.lua(), t('cfgTemaEscuro'))}
                ${opcaoTema('light', ICO.sol(), t('cfgTemaClaro'))}
              </div>
            </div>
            <div class="cfg-item">
              <div class="cfg-item-texto">
                <div class="cfg-item-titulo">${t('tourTitulo')}</div>
                <p class="cfg-item-desc">${t('tourDesc')}</p>
              </div>
              <button class="btn-secondary btn-sm cfg-item-acao" id="btn-ver-tour">${ICO.play(12)}<span>${t('btnVerTour')}</span></button>
            </div>
          </div>
        </section>
      </main>
      ${renderFooter()}
    </div>
  `

  initTopbarEvents(true)
  atualizarLateral({ ativo: 'config-geral' })
  revelarItemLateral()
  renderNotificacoes()
  _bindEvents()
  await _minhasEmpresas(u)
}

// Empresas a que você tem acesso: "Todas as empresas" e os nomes, ou só os nomes
async function _minhasEmpresas(u) {
  let todas = null
  try {
    const snap = await getDocs(collection(db, 'empresas'))
    todas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'))
  } catch (err) {
    console.warn('Empresas indisponíveis:', err.message)
  }
  if (todas) atualizarLateral({ contagens: { 'cad-empresas': todas.length } })
  completarContagensLateral()
  const el = document.getElementById('cfg-minhas-empresas')
  if (!el) return
  if (!todas) { el.innerHTML = '<span class="cfg-mudo">—</span>'; return }
  const raw = u.empresas || []
  const ids = Array.isArray(raw) ? raw : Object.keys(raw)
  const minhas = todas.filter(e => ids.includes(e.id))
  const nomes = esc(minhas.map(e => e.nome).join(', '))
  if (!minhas.length) el.innerHTML = `<span class="cfg-mudo">${t('cfgNenhuma')}</span>`
  else if (todas.length > 1 && minhas.length === todas.length) el.innerHTML = `<span class="cfg-fatos-forte">${t('cfgTodasEmpresasTxt')}</span><span class="cfg-fatos-desc">${nomes}</span>`
  else el.innerHTML = `<span class="cfg-fatos-forte">${nomes}</span>`
}

function _marcarTema(tema) {
  document.querySelectorAll('#cfg-tema [data-tema]').forEach(b => {
    const on = b.dataset.tema === tema
    b.classList.toggle('active', on)
    b.setAttribute('aria-checked', String(on))
    b.tabIndex = on ? 0 : -1
  })
}

function _bindEvents() {
  const grupo = document.getElementById('cfg-tema')
  grupo?.addEventListener('click', e => {
    const b = e.target.closest('[data-tema]')
    if (!b || b.dataset.tema === _temaAtual()) return
    _marcarTema(toggleTheme())
  })
  grupo?.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    const novo = toggleTheme()
    _marcarTema(novo)
    grupo.querySelector(`[data-tema="${novo}"]`)?.focus()
  })

  // reativarTour leva ao quadro de pedidos e começa o tour lá
  document.getElementById('btn-ver-tour')?.addEventListener('click', () => reativarTour())
}
