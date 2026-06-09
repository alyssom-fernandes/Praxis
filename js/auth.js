import {
  auth, db,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  doc, getDoc,
} from './firebase.js'
import { prxToast, prxAlert, mostrarSpinner, esconderSpinner } from './ui.js'
import { t } from './constants.js'
import { DEMO_CREDENTIALS } from './config.js'

const DEMO_EMAIL    = DEMO_CREDENTIALS.email
const DEMO_PASSWORD = DEMO_CREDENTIALS.password

// Estado de idioma do demo
let _lang = sessionStorage.getItem('praxis_lang') || 'pt'

// ── Render da tela de login ──────────────────────────────────
export function renderLogin() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="login-page">
      <div class="login-wrap">

        <div class="login-brand">
          <div class="logo-text">PR<span class="delta">▲</span>XIS</div>
          <div class="login-tagline">${t('tagline')}</div>
        </div>

        <div class="login-card">

          <!-- View: login -->
          <div class="view active" id="view-login">
            <form class="login-form" id="form-login" novalidate>
              <div class="form-group">
                <label for="input-email">${t('emailLabel')}</label>
                <input type="email" id="input-email" placeholder="voce@empresa.com" autocomplete="email" required>
              </div>
              <div class="form-group">
                <label for="input-senha">${t('senhaLabel')}</label>
                <input type="password" id="input-senha" placeholder="••••••••" autocomplete="current-password" required>
                <a class="forgot-link" id="link-forgot">${t('esqueci')}</a>
              </div>
              <div class="login-actions">
                <button type="submit" class="btn-primary" id="btn-entrar">${t('btnEntrar')}</button>
              </div>
            </form>
            <div class="login-sep">ou</div>
            <button class="btn-ghost" id="btn-demo" style="width:100%;justify-content:center;padding:0.75rem">
              ${t('btnDemo')}
            </button>
            <div class="login-afn">
              <div class="afn-name">AFN SYSTEMS</div>
              <div class="afn-by">by Alyssom Fernandes</div>
            </div>
          </div>

          <!-- View: demo-lang -->
          <div class="view" id="view-demo-lang">
            <div style="text-align:center;margin-bottom:1rem">
              <h3 style="font-size:1rem;margin-bottom:0.25rem">${t('escolherIdioma')}</h3>
            </div>
            <div class="lang-pills">
              <button class="lang-pill selected" data-lang="pt">
                <span class="lang-flag-abbr">PT</span>
                Português
              </button>
              <button class="lang-pill" data-lang="en">
                <span class="lang-flag-abbr">EN</span>
                English
              </button>
            </div>
            <div class="login-actions">
              <button class="btn-primary" id="btn-demo-continuar" style="justify-content:center">
                ${t('continuar')}
              </button>
              <button class="btn-secondary" id="btn-demo-voltar" style="justify-content:center">
                ${t('voltar')}
              </button>
            </div>
          </div>

          <!-- View: forgot -->
          <div class="view" id="view-forgot">
            <h3 style="font-size:1rem;margin-bottom:0.5rem">Recuperar senha</h3>
            <p style="font-size:0.85rem;color:var(--text3);margin-bottom:1.25rem">${t('emailReset')}</p>
            <form id="form-forgot" novalidate>
              <div class="form-group" style="margin-bottom:1rem">
                <label for="input-forgot-email">${t('emailLabel')}</label>
                <input type="email" id="input-forgot-email" placeholder="voce@empresa.com" autocomplete="email" required>
              </div>
              <div class="login-actions">
                <button type="submit" class="btn-primary" style="justify-content:center">${t('enviarLink')}</button>
                <button type="button" class="btn-secondary" id="btn-forgot-voltar" style="justify-content:center">${t('voltar')}</button>
              </div>
            </form>
          </div>

          <!-- View: sent -->
          <div class="view" id="view-sent">
            <div class="sent-icon">
              <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h3 style="text-align:center;margin-bottom:0.5rem">${t('resetEnviado')}</h3>
            <p style="text-align:center;font-size:0.875rem;color:var(--text3);margin-bottom:1.25rem">${t('resetMsg')}</p>
            <button class="btn-secondary" id="btn-sent-voltar" style="width:100%;justify-content:center">${t('voltar')}</button>
          </div>

        </div>
      </div>
    </div>
  `

  _bindLoginEvents()
}

function _bindLoginEvents() {
  document.getElementById('form-login')?.addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('input-email').value.trim()
    const senha = document.getElementById('input-senha').value
    if (!email || !senha) return
    await _fazerLogin(email, senha)
  })

  document.getElementById('link-forgot')?.addEventListener('click', () => _irParaView('forgot'))
  document.getElementById('btn-demo')?.addEventListener('click', () => _irParaView('demo-lang'))

  document.querySelectorAll('.lang-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.lang-pill').forEach(p => p.classList.remove('selected'))
      pill.classList.add('selected')
      _lang = pill.dataset.lang
    })
  })

  document.getElementById('btn-demo-continuar')?.addEventListener('click', async () => {
    sessionStorage.setItem('praxis_lang', _lang)
    await _entrarDemo()
  })

  document.getElementById('btn-demo-voltar')?.addEventListener('click', () => _irParaView('login'))

  document.getElementById('form-forgot')?.addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('input-forgot-email').value.trim()
    if (!email) return
    await _enviarResetSenha(email)
  })

  document.getElementById('btn-forgot-voltar')?.addEventListener('click', () => _irParaView('login'))
  document.getElementById('btn-sent-voltar')?.addEventListener('click', () => _irParaView('login'))
}

function _irParaView(nome) {
  document.querySelectorAll('.login-card .view').forEach(v => v.classList.remove('active'))
  document.getElementById(`view-${nome}`)?.classList.add('active')
}

async function _fazerLogin(email, senha) {
  const btn = document.getElementById('btn-entrar')
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando…' }
  try {
    await signInWithEmailAndPassword(auth, email, senha)
  } catch (err) {
    const msg = _traduzirErroAuth(err.code)
    prxToast(msg, 'error')
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('btnEntrar') }
  }
}

async function _entrarDemo() {
  const btn = document.getElementById('btn-demo-continuar')
  if (btn) { btn.disabled = true; btn.textContent = 'Carregando…' }
  try {
    await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)
  } catch (err) {
    prxToast('Erro ao acessar modo demo. Tente novamente.', 'error')
    _irParaView('login')
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('continuar') }
  }
}

async function _enviarResetSenha(email) {
  mostrarSpinner()
  try {
    await sendPasswordResetEmail(auth, email)
    _irParaView('sent')
  } catch (err) {
    prxToast('Erro ao enviar e-mail. Verifique o endereço.', 'error')
  } finally {
    esconderSpinner()
  }
}

// ── Logout ────────────────────────────────────────────────────
export async function fazerLogout() {
  try {
    sessionStorage.removeItem('praxis_lang')
    await signOut(auth)
  } catch (err) {
    prxToast('Erro ao sair. Tente novamente.', 'error')
  }
}

// ── Carregar dados do usuário logado ─────────────────────────
export async function carregarUsuario(uid) {
  try {
    if (auth.currentUser) await auth.currentUser.getIdToken(true)
  } catch (e) {
    console.warn('Erro ao renovar token:', e.message)
  }
  const { getDocFromServer } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js')
  const snap = await getDocFromServer(doc(db, 'usuarios', uid))
  if (!snap.exists()) throw new Error('Usuário não encontrado no sistema.')
  return { id: snap.id, ...snap.data() }
}

// ── Tradução de erros Firebase Auth ──────────────────────────
function _traduzirErroAuth(code) {
  const map = {
    'auth/invalid-email':          'E-mail inválido.',
    'auth/user-not-found':         'Usuário não encontrado.',
    'auth/wrong-password':         'Senha incorreta.',
    'auth/invalid-credential':     'E-mail ou senha incorretos.',
    'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos.',
    'auth/user-disabled':          'Esta conta está desativada.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
  }
  return map[code] ?? 'Erro ao entrar. Tente novamente.'
}
