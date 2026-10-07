import {
  auth, db,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  doc,
} from './firebase.js'
import { prxToast, mostrarSpinner, esconderSpinner, mostrarCeu, marcaPraxis, frisoGrego } from './ui.js'
import { t } from './constants.js'
import { DEMO_CREDENTIALS } from './config.js'

const DEMO_EMAIL    = DEMO_CREDENTIALS.email
const DEMO_PASSWORD = DEMO_CREDENTIALS.password

// ── Ícones (traço 2, mesma família do resto da interface) ────
const _svg = (tam, corpo, traco = 2) =>
  `<svg width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`

const ICO = {
  olho:    _svg(16, '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
  olhoOff: _svg(16, '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><path d="M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'),
  voltar:  _svg(15, '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
  email:   _svg(20, '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
  alerta:  _svg(14, '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  seta:    _svg(16, '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'),
}

const _escapar = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// As sete etapas do caminho, em medalhões numerados (decorativo: o texto ao
// lado já diz o mesmo). A etapa acesa percorre o caminho devagar; com
// movimento reduzido, fica parada na aprovação.
function _etapasEntrada() {
  const nomes = String(t('loginEtapas')).split('|')
  return `
    <ol class="entrada-etapas" aria-hidden="true">
      ${nomes.map((nome, i) => `
        <li style="--i:${i}">
          <span class="entrada-medalhao">${String(i + 1).padStart(2, '0')}</span>
          <span class="entrada-etapa-nome">${nome}</span>
        </li>`).join('')}
    </ol>`
}

// "Toda compra / tem um caminho." em duas linhas: a primeira fica com a
// metade menor das palavras, como no desenho aprovado
function _quebraTitulo(texto) {
  const palavras = String(texto).split(' ')
  if (palavras.length < 3) return texto
  const meio = Math.floor(palavras.length / 2)
  return `${palavras.slice(0, meio).join(' ')}<br>${palavras.slice(meio).join(' ')}`
}

// Bloco da marca no login — exatamente como no afn_brand_guide.html
function _blocoMarcaAfn() {
  return `
    <div class="login-afn">
      <div class="login-afn-nome">
        <span class="pf-afn" style="font-size:13px">AFN</span><span class="pf-gap"></span><span class="pf-sys" style="font-size:13px">SYSTEMS</span>
      </div>
      <span class="pf-sys" style="font-size:8px;letter-spacing:1.4px;text-transform:uppercase">by Alyssom Fernandes</span>
    </div>`
}

// ── Render da tela de login ──────────────────────────────────
export function renderLogin() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="login-page">
      <section class="entrada-lado">
        <div class="entrada-miolo">
          <div class="entrada-marca">${marcaPraxis()}</div>
          <h1 class="entrada-titulo">${_quebraTitulo(t('loginTitulo'))}<span>${t('loginTitulo2')}</span></h1>
          <p class="entrada-texto">${t('loginTexto')}</p>
          ${_etapasEntrada()}
        </div>
        ${frisoGrego({ classe: 'entrada-friso' })}
      </section>

      <main class="login-shell">
        <section class="login-card" aria-label="${t('loginCardTitulo')}">

          <!-- Visão: entrar -->
          <div class="view active" id="view-login">
            <h2 class="login-card-titulo">${t('loginCardTitulo')}</h2>
            <p class="login-card-sub">${t('loginCardSub')}</p>
            <form class="login-form" id="form-login" novalidate>
              <div class="form-group">
                <label for="input-email">${t('emailLabel')}</label>
                <input type="email" id="input-email" placeholder="voce@empresa.com" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required>
              </div>
              <div class="form-group">
                <div class="login-label-linha">
                  <label for="input-senha">${t('senhaLabel')}</label>
                  <button type="button" class="login-link" id="link-forgot">${t('esqueci')}</button>
                </div>
                <div class="login-senha">
                  <input type="password" id="input-senha" placeholder="Sua senha" autocomplete="current-password" required>
                  <button type="button" class="login-olho" id="btn-olho" aria-pressed="false" aria-controls="input-senha" aria-label="${t('mostrarSenha')}" title="${t('mostrarSenha')}">${ICO.olho}</button>
                </div>
              </div>
              <div class="login-erro" id="login-erro" role="alert" hidden></div>
              <button type="submit" class="btn-primary login-botao" id="btn-entrar">${t('btnEntrar')}</button>
            </form>
            <div class="login-sep"><span>ou</span></div>
            <button type="button" class="btn-secondary login-botao" id="btn-demo">${t('btnDemo')}</button>
            <p class="login-demo-dica">${t('demoDica')}</p>
            ${_blocoMarcaAfn()}
          </div>

          <!-- Visão: esqueci a senha -->
          <div class="view" id="view-forgot">
            <button type="button" class="login-voltar" id="btn-forgot-voltar">${ICO.voltar}<span>${t('voltar')}</span></button>
            <h2 class="login-card-titulo">${t('recuperarSenha')}</h2>
            <p class="login-card-sub">${t('emailReset')}</p>
            <form class="login-form" id="form-forgot" novalidate>
              <div class="form-group">
                <label for="input-forgot-email">${t('emailLabel')}</label>
                <input type="email" id="input-forgot-email" placeholder="voce@empresa.com" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required>
              </div>
              <div class="login-erro" id="forgot-erro" role="alert" hidden></div>
              <button type="submit" class="btn-primary login-botao" id="btn-enviar-link">${t('enviarLink')}</button>
            </form>
          </div>

          <!-- Visão: link enviado -->
          <div class="view" id="view-sent">
            <div class="sent-icon" aria-hidden="true">${ICO.email}</div>
            <h2 class="login-card-titulo">${t('resetEnviado')}</h2>
            <p class="login-card-sub" id="sent-msg" role="status">${t('resetMsg')}</p>
            <button type="button" class="btn-secondary login-botao login-sent-acao" id="btn-sent-voltar">${ICO.voltar}<span>${t('voltarLogin')}</span></button>
          </div>

        </section>
      </main>
    </div>
  `

  mostrarCeu(true)
  _bindLoginEvents()
}

function _mostrarErro(id, msg) {
  const el = document.getElementById(id)
  if (!el) return
  if (!msg) { el.hidden = true; el.innerHTML = ''; return }
  el.innerHTML = `${ICO.alerta}<span>${_escapar(msg)}</span>`
  el.hidden = false
}

function _bindLoginEvents() {
  document.getElementById('form-login')?.addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('input-email').value.trim()
    const senha = document.getElementById('input-senha').value
    if (!email || !senha) {
      _mostrarErro('login-erro', t('preenchaCampos'))
      // Marca o que falta (borda carmim) e leva o foco ao primeiro vazio
      if (!email) document.getElementById('input-email')?.setAttribute('aria-invalid', 'true')
      if (!senha) document.getElementById('input-senha')?.setAttribute('aria-invalid', 'true')
      document.getElementById(email ? 'input-senha' : 'input-email')?.focus()
      return
    }
    await _fazerLogin(email, senha)
  })

  // O erro some assim que a pessoa volta a digitar
  ;['input-email', 'input-senha'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      _mostrarErro('login-erro', '')
      document.querySelectorAll('#form-login input').forEach(i => i.removeAttribute('aria-invalid'))
    })
  })
  document.getElementById('input-forgot-email')?.addEventListener('input', e => {
    _mostrarErro('forgot-erro', '')
    e.target.removeAttribute('aria-invalid')
  })

  document.getElementById('btn-olho')?.addEventListener('click', () => {
    const input = document.getElementById('input-senha')
    const btn = document.getElementById('btn-olho')
    const mostrar = input.type === 'password'
    input.type = mostrar ? 'text' : 'password'
    btn.innerHTML = mostrar ? ICO.olhoOff : ICO.olho
    const rotulo = mostrar ? t('ocultarSenha') : t('mostrarSenha')
    btn.setAttribute('aria-label', rotulo)
    btn.setAttribute('aria-pressed', String(mostrar))
    btn.title = rotulo
  })

  document.getElementById('link-forgot')?.addEventListener('click', () => {
    // Aproveita o e-mail já digitado
    const email = document.getElementById('input-email')?.value.trim()
    if (email) document.getElementById('input-forgot-email').value = email
    _irParaView('forgot')
  })
  document.getElementById('btn-demo')?.addEventListener('click', () => _mostrarBoasVindas())

  document.getElementById('form-forgot')?.addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('input-forgot-email').value.trim()
    if (!email) {
      _mostrarErro('forgot-erro', t('informeEmail'))
      const campo = document.getElementById('input-forgot-email')
      campo?.setAttribute('aria-invalid', 'true')
      campo?.focus()
      return
    }
    await _enviarResetSenha(email)
  })

  document.getElementById('btn-forgot-voltar')?.addEventListener('click', () => _irParaView('login'))
  document.getElementById('btn-sent-voltar')?.addEventListener('click', () => _irParaView('login'))
}

function _irParaView(nome) {
  document.querySelectorAll('.login-card .view').forEach(v => v.classList.remove('active'))
  const view = document.getElementById(`view-${nome}`)
  view?.classList.add('active')
  // Foco no primeiro campo da nova visão; no celular não abre o teclado sozinho
  if (!window.matchMedia?.('(pointer: coarse)').matches) view?.querySelector('input')?.focus()
}

function _botaoCarregando(btn, carregando, textoNormal, textoCarregando) {
  if (!btn) return
  // Enquanto envia, o formulário inteiro espera (campos e o botão da demo)
  btn.closest('.view')?.querySelectorAll('input, #btn-demo').forEach(el => { el.disabled = carregando })
  btn.disabled = carregando
  btn.classList.toggle('login-carregando', carregando)
  btn.setAttribute('aria-busy', carregando ? 'true' : 'false')
  btn.innerHTML = carregando
    ? `<span class="login-spin" aria-hidden="true"></span><span>${textoCarregando}</span>`
    : textoNormal
}

async function _fazerLogin(email, senha) {
  const btn = document.getElementById('btn-entrar')
  _mostrarErro('login-erro', '')
  _botaoCarregando(btn, true, t('btnEntrar'), t('entrando'))
  let focar = null
  try {
    await signInWithEmailAndPassword(auth, email, senha)
  } catch (err) {
    _mostrarErro('login-erro', _traduzirErroAuth(err.code))
    if (err.code === 'auth/invalid-email') {
      document.getElementById('input-email')?.setAttribute('aria-invalid', 'true')
      focar = 'input-email'
    } else if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(err.code)) {
      document.getElementById('input-email')?.setAttribute('aria-invalid', 'true')
      document.getElementById('input-senha')?.setAttribute('aria-invalid', 'true')
      focar = 'input-senha'
    }
  } finally {
    _botaoCarregando(btn, false, t('btnEntrar'), t('entrando'))
  }
  // Depois de reabilitar os campos: o foco volta para onde corrigir
  if (focar && !window.matchMedia?.('(pointer: coarse)').matches) {
    const campo = document.getElementById(focar)
    campo?.focus()
    campo?.select()
  }
}

// ── Boas-vindas do modo demonstração ─────────────────────────
// Momento de marca entre a entrada e o app: o título em Didot, as três
// frentes do produto como inscrições numeradas (fio de tinta, numeral, nome)
// e o friso de meandro na base, como na entrada.
const _BV_FRENTES = [
  ['Quadro de pedidos', 'Cada compra numa coluna, do pedido ao pagamento.'],
  ['Aprovação com histórico', 'Quem aprovou, quando e com base em quais cotações.'],
  ['Relatórios', 'Gastos por empresa, centro de custo e período.'],
]

function _mostrarBoasVindas() {
  if (document.getElementById('boas-vindas-overlay')) return
  const overlay = document.createElement('div')
  overlay.id = 'boas-vindas-overlay'
  overlay.className = 'bv-overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'bv-titulo')
  overlay.setAttribute('aria-describedby', 'bv-texto')

  overlay.innerHTML = `
    <div class="bv-card">
      <div class="bv-corpo">
        <p class="bv-rotulo">Modo demonstração</p>
        <h2 class="bv-titulo" id="bv-titulo">Conheça o Praxis por dentro</h2>
        <p class="bv-texto" id="bv-texto">Você entra como administrador de uma empresa fictícia, com pedidos em todas as etapas. Crie, aprove e cancele à vontade: os dados voltam ao original todo dia.</p>
        <ol class="bv-lista">
          ${_BV_FRENTES.map(([nome, desc], i) => `
          <li>
            <span class="bv-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
            <b class="bv-nome">${nome}</b>
            <span class="bv-desc">${desc}</span>
          </li>`).join('')}
        </ol>
        <div class="bv-acoes">
          <button type="button" class="btn-ghost" id="bv-voltar">${t('voltar')}</button>
          <button type="button" class="btn-primary" id="bv-comecar"><span>Começar a explorar</span>${ICO.seta}</button>
        </div>
      </div>
      ${frisoGrego({ classe: 'bv-friso' })}
    </div>
  `

  document.body.appendChild(overlay)
  const app = document.getElementById('app')
  if (app) app.inert = true
  requestAnimationFrame(() => overlay.classList.add('visible'))
  setTimeout(() => overlay.querySelector('#bv-comecar')?.focus({ preventScroll: true }), 60)

  const fechar = (depois) => {
    document.removeEventListener('keydown', aoTeclar)
    overlay.classList.remove('visible')
    if (app) app.inert = false
    setTimeout(() => { overlay.remove(); depois?.() }, 200)
  }
  const voltarAoBotao = () => document.getElementById('btn-demo')?.focus()
  // Esc fecha; Tab fica preso entre os dois botões (a entrada atrás está inerte)
  const aoTeclar = e => {
    if (e.key === 'Escape') { fechar(voltarAoBotao); return }
    if (e.key !== 'Tab') return
    const botoes = [...overlay.querySelectorAll('button')]
    const i = botoes.indexOf(document.activeElement)
    e.preventDefault()
    botoes[e.shiftKey ? (i <= 0 ? botoes.length - 1 : i - 1) : (i + 1) % botoes.length]?.focus()
  }
  document.addEventListener('keydown', aoTeclar)

  overlay.addEventListener('click', e => { if (e.target === overlay) fechar(voltarAoBotao) })
  overlay.querySelector('#bv-voltar').addEventListener('click', () => fechar(voltarAoBotao))
  overlay.querySelector('#bv-comecar').addEventListener('click', () => fechar(_entrarDemo))
}

async function _entrarDemo() {
  mostrarSpinner()
  try {
    await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)
  } catch (err) {
    prxToast(t('erroAcessarDemo'), 'error')
    _irParaView('login')
  } finally {
    esconderSpinner()
  }
}

// ── Recuperação de senha ─────────────────────────────────────
async function _enviarResetSenha(email) {
  const btn = document.getElementById('btn-enviar-link')
  _mostrarErro('forgot-erro', '')
  _botaoCarregando(btn, true, t('enviarLink'), t('enviarLink'))
  try {
    await sendPasswordResetEmail(auth, email)
    _mostrarEnviado(email)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Não revela se a conta existe: a resposta é a mesma de um envio bem-sucedido
      _mostrarEnviado(email)
    } else if (err.code === 'auth/invalid-email' || err.code === 'auth/missing-email') {
      _mostrarErro('forgot-erro', 'E-mail inválido.')
    } else if (err.code === 'auth/network-request-failed') {
      _mostrarErro('forgot-erro', 'Erro de conexão. Verifique sua internet.')
    } else {
      _mostrarErro('forgot-erro', t('erroEnviarEmail'))
    }
  } finally {
    _botaoCarregando(btn, false, t('enviarLink'), t('enviarLink'))
  }
}

function _mostrarEnviado(email) {
  const msg = document.getElementById('sent-msg')
  if (msg) {
    const [antes, depois] = String(t('resetMsgPara')).split('{email}')
    msg.innerHTML = `${_escapar(antes)}<b>${_escapar(email)}</b>${_escapar(depois ?? '')}`
  }
  _irParaView('sent')
}

// ── Logout ────────────────────────────────────────────────────
export async function fazerLogout() {
  try {
    await signOut(auth)
  } catch (err) {
    prxToast(t('erroSair'), 'error')
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
    'auth/user-not-found':         'E-mail ou senha incorretos.',
    'auth/wrong-password':         'E-mail ou senha incorretos.',
    'auth/invalid-credential':     'E-mail ou senha incorretos.',
    'auth/too-many-requests':      'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/user-disabled':          'Esta conta está desativada. Fale com o administrador.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
  }
  return map[code] ?? 'Não foi possível entrar. Tente novamente.'
}
