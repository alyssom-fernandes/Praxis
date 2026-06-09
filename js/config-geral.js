import { functions, httpsCallable } from './firebase.js'
import { renderTopbar, initTopbarEvents, renderFooter } from './app.js'
import { prxToast, prxConfirm, mostrarSpinner, esconderSpinner } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'

export async function renderConfigGeral() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('config-geral', true)}
      <div class="main-content">
        <div>

          <!-- Seção: Demo -->
          <div class="config-section-header" style="margin-bottom:1.25rem">
            <h2>Geral</h2>
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
                  <div style="font-weight:600;font-size:0.9rem;margin-bottom:0.35rem">Dados de demonstração</div>
                  <p style="font-size:0.8rem;color:var(--text3);line-height:1.6;margin-bottom:1rem">
                    Redefine todos os pedidos, cotações e histórico do ambiente demo para os dados de exemplo padrão. Esta ação apaga os dados atuais e não pode ser desfeita.
                  </p>
                  <button class="btn-secondary btn-sm" id="btn-resetar-demo" style="display:inline-flex;align-items:center;gap:0.4rem">
                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
                    </svg>
                    Resetar dados demo
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
}

async function _resetarDemo() {
  const ok = await prxConfirm('Isso vai apagar todos os pedidos e recriar os dados de exemplo. Continuar?')
  if (!ok) return
  const btn = document.getElementById('btn-resetar-demo')
  if (btn) { btn.disabled = true; btn.textContent = 'Aguarde…' }
  mostrarSpinner()
  try {
    const fn = httpsCallable(functions, 'triggerDemoSeed')
    await fn({})
    prxToast('Dados demo resetados com sucesso!', 'success', 4000)
  } catch (err) {
    prxToast('Erro ao resetar dados demo.', 'error')
    console.error(err)
  } finally {
    esconderSpinner()
    if (btn) {
      btn.disabled = false
      btn.innerHTML = `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg> Resetar dados demo`
    }
  }
}
