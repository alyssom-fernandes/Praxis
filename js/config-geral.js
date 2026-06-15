import { functions, httpsCallable } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner, reativarTour } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { t } from './constants.js'

export async function renderConfigGeral() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-geral', true)}
      <div class="main-content">
        <div>

          <!-- Seção: Demo -->
          <div class="config-section-header" style="margin-bottom:1.25rem">
            <h2>${t('configGeral')}</h2>
          </div>

          <div style="display:flex;flex-direction:column;gap:1.5rem;max-width:560px">

            <!-- Card: Dados de demonstração -->
            <div class="card no-hover" style="padding:1.5rem">
              <div style="display:flex;align-items:flex-start;gap:1rem">
                <div style="flex-shrink:0;width:36px;height:36px;border-radius:var(--radius-sm);background:var(--gold-dim);border:1px solid var(--gold-border);display:flex;align-items:center;justify-content:center;color:var(--gold)">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                  </svg>
                </div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.35rem">${t('demoTitulo')}</div>
                  <p style="font-size:0.8rem;color:var(--text3);line-height:1.6;margin-bottom:1rem">
                    ${t('demoDesc')}
                  </p>
                  <button class="btn-secondary btn-sm" id="btn-resetar-demo" style="display:inline-flex;align-items:center;gap:0.4rem">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                    </svg>
                    ${t('btnResetarDemo')}
                  </button>
                </div>
              </div>
            </div>

            <!-- Card: Tour guiado -->
            <div class="card no-hover" style="padding:1.5rem">
              <div style="display:flex;align-items:flex-start;gap:1rem">
                <div style="flex-shrink:0;width:36px;height:36px;border-radius:var(--radius-sm);background:var(--gold-dim);border:1px solid var(--gold-border);display:flex;align-items:center;justify-content:center;color:var(--gold)">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                  </svg>
                </div>
                <div style="flex:1">
                  <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.35rem">${t('tourTitulo')}</div>
                  <p style="font-size:0.8rem;color:var(--text3);line-height:1.6;margin-bottom:1rem">
                    ${t('tourDesc')}
                  </p>
                  <button class="btn-secondary btn-sm" id="btn-ver-tour" style="display:inline-flex;align-items:center;gap:0.4rem">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    ${t('btnVerTour')}
                  </button>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
      ${renderFooter()}
    </div>
  `

  initTopbarEvents(true)
  renderNotificacoes()
  _bindEvents()
}

function _bindEvents() {
  document.getElementById('btn-resetar-demo')?.addEventListener('click', _resetarDemo)
  document.getElementById('btn-ver-tour')?.addEventListener('click', () => {
    import('./app.js').then(({ navegar }) => navegar('pedidos'))
    setTimeout(reativarTour, 300)
  })
}

async function _resetarDemo() {
  const ok = await prxConfirm(t('confirmarResetDemo'))
  if (!ok) return
  const btn = document.getElementById('btn-resetar-demo')
  if (btn) { btn.disabled = true; btn.textContent = t('demoAguarde') }
  mostrarSpinner()
  try {
    const fn = httpsCallable(functions, 'triggerDemoSeed')
    await fn({})
    prxToast(t('demoResetadoMsg'), 'success', 4000)
  } catch (err) {
    prxToast(t('demoErroReset'), 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btn) {
      btn.disabled = false
      btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg> ${t('btnResetarDemo')}`
    }
  }
}
