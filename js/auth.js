// O Firebase vem sob demanda: a tela de entrada aparece sem esperar o SDK
// (js/entrada.js), e cada ação que fala com o Firebase espera por ele (_fb).
// O download começa na carga deste módulo, em paralelo com o desenho da tela
let auth, db, apagarCopiaLocal, naProjetoDemo,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut, sendPasswordResetEmail,
  doc, getDoc, getDocFromCache, getDocFromServer, setDoc, writeBatch, serverTimestamp
const _firebase = import('./firebase.js').then(m => {
  ;({
    auth, db, apagarCopiaLocal, naProjetoDemo,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut, sendPasswordResetEmail,
    doc, getDoc, getDocFromCache, getDocFromServer, setDoc, writeBatch, serverTimestamp,
  } = m)
})
const _fb = () => _firebase
import { prxToast, mostrarSpinner, esconderSpinner, mostrarCeu, marcaPraxis, frisoGrego } from './ui.js'
import { abrirEscolhaPessoa } from './demo-pessoas.js'
import { t, idioma, trocarIdioma, STATUS, STATUS_LABEL } from './constants.js'
import { DEMO_CREDENTIALS, FIREBASE_CONFIG_DEMO } from './config.js'
import { esc, marcarProjetoDemo } from './utils.js'

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
}

// As sete etapas do caminho na régua (a mesma do detalhe e do quadro no
// celular; decorativa: o texto ao lado já diz o mesmo). O fio aceso percorre
// o caminho devagar; com movimento reduzido, fica o estado final.
function _etapasEntrada() {
  const nomes = [STATUS.SOLICITADO, STATUS.AG_COTACAO, STATUS.EM_APROVACAO, STATUS.APROVADO, STATUS.COMPRADO, STATUS.ENTREGUE, STATUS.PAGO]
    .map(st => STATUS_LABEL[st])
  return `
    <ol class="regua entrada-etapas" aria-hidden="true">
      ${nomes.map((nome, i) => `
        <li class="regua-etapa" data-estilo="--i:${i}">
          <span class="regua-n">${String(i + 1).padStart(2, '0')}</span>
          <span class="regua-nome">${nome}</span>
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

// Bloco da marca no login — exatamente como no guia da marca AFN
function _blocoMarcaAfn() {
  return `
    <div class="login-afn">
      <div class="login-afn-nome">
        <span class="pf-afn" data-estilo="font-size:13px">AFN</span><span class="pf-gap"></span><span class="pf-sys" data-estilo="font-size:13px">SYSTEMS</span>
      </div>
      <span class="pf-sys" data-estilo="font-size:8px;letter-spacing:1.4px;text-transform:uppercase">by Alyssom Fernandes</span>
    </div>`
}

// ── Tela de entrada ──────────────────────────────────────────
// O index.html já traz a entrada desenhada em português (scripts/gerar-entrada.mjs,
// a partir de renderLogin): a primeira pintura não espera JavaScript. Aqui ela
// só ganha os eventos. Em inglês, ou sem a cópia no HTML, desenha de novo.
export function mostrarEntrada() {
  const estatica = document.querySelector('#app > .login-page[data-estatica]')
  if (estatica && idioma() === 'pt') {
    document.documentElement.classList.remove('entrada-escondida')
    if (estatica.dataset.ligada) return
    estatica.dataset.ligada = '1'
    _prepararEntrada()
    return
  }
  if (document.querySelector('#app > .login-page:not([data-estatica])')) return
  renderLogin()
  document.documentElement.classList.remove('entrada-escondida')
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
                <input type="email" id="input-email" placeholder="${t('emailPlaceholder')}" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required>
              </div>
              <div class="form-group">
                <div class="login-label-linha">
                  <label for="input-senha">${t('senhaLabel')}</label>
                  <button type="button" class="login-link" id="link-forgot">${t('esqueci')}</button>
                </div>
                <div class="login-senha">
                  <input type="password" id="input-senha" placeholder="${t('senhaPlaceholder')}" autocomplete="current-password" required>
                  <button type="button" class="login-olho" id="btn-olho" aria-pressed="false" aria-controls="input-senha" aria-label="${t('mostrarSenha')}" title="${t('mostrarSenha')}">${ICO.olho}</button>
                </div>
              </div>
              <div class="login-erro" id="login-erro" role="alert" hidden></div>
              <button type="submit" class="btn-primary login-botao" id="btn-entrar">${t('btnEntrar')}</button>
              <p class="login-primeiro">${t('loginPrimeiroAcesso')} <button type="button" class="login-link" id="link-criar">${t('loginCriarSenha')}</button></p>
            </form>
            <div class="login-sep"><span>${t('loginOu')}</span></div>
            <button type="button" class="btn-secondary login-botao" id="btn-demo">${t('btnDemo')}</button>
            <p class="login-demo-dica">${t('demoDica')}</p>
            <p class="login-idioma"><button type="button" class="login-link" id="btn-idioma" lang="${idioma() === 'en' ? 'pt-BR' : 'en'}" aria-label="${t('idiomaTrocarRotulo')}">${t('idiomaTrocar')}</button></p>
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
                <input type="email" id="input-forgot-email" placeholder="${t('emailPlaceholder')}" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required>
              </div>
              <div class="login-erro" id="forgot-erro" role="alert" hidden></div>
              <button type="submit" class="btn-primary login-botao" id="btn-enviar-link">${t('enviarLink')}</button>
            </form>
          </div>

          <!-- Visão: primeiro acesso (quem foi convidado cria a senha) -->
          <div class="view" id="view-criar">
            <button type="button" class="login-voltar" id="btn-criar-voltar">${ICO.voltar}<span>${t('voltar')}</span></button>
            <h2 class="login-card-titulo">${t('criarTitulo')}</h2>
            <p class="login-card-sub">${t('criarSub')}</p>
            <form class="login-form" id="form-criar" novalidate>
              <div class="form-group">
                <label for="input-criar-email">${t('emailLabel')}</label>
                <input type="email" id="input-criar-email" placeholder="${t('emailPlaceholder')}" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required>
              </div>
              <div class="form-group">
                <label for="input-criar-senha">${t('senhaLabel')}</label>
                <input type="password" id="input-criar-senha" autocomplete="new-password" minlength="${_SENHA_MINIMA}" aria-describedby="criar-senha-dica" required>
                <p class="form-hint" id="criar-senha-dica">${t('criarSenhaDica', { n: _SENHA_MINIMA })}</p>
              </div>
              <div class="login-erro" id="criar-erro" role="alert" hidden></div>
              <button type="submit" class="btn-primary login-botao" id="btn-criar">${t('criarBotao')}</button>
            </form>
          </div>

          <!-- Visão: confirmar o e-mail (o link foi enviado) -->
          <div class="view" id="view-confirmar">
            <div class="sent-icon" aria-hidden="true">${ICO.email}</div>
            <h2 class="login-card-titulo">${t('confirmarTitulo')}</h2>
            <p class="login-card-sub" id="confirmar-msg" role="status"></p>
            <button type="button" class="btn-secondary login-botao login-sent-acao" id="btn-confirmar-voltar">${ICO.voltar}<span>${t('voltarLogin')}</span></button>
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

  _prepararEntrada()
}

function _prepararEntrada() {
  mostrarCeu(true)
  _bindLoginEvents()
  // Quem entrou sem acesso volta para cá sabendo o motivo; quem ainda não
  // confirmou o e-mail, direto na visão que pede a confirmação
  const aviso = _tirarAviso()
  if (aviso?.confirmar) _mostrarConfirmar(aviso.confirmar)
  else if (aviso?.erro) _mostrarErro('login-erro', aviso.erro)
}

// Aviso mostrado uma vez na próxima tela de entrada: o erro de quem entrou
// sem acesso (conta sem perfil, convite vencido, acesso desativado) ou o
// pedido de confirmar o e-mail. Sair recarrega a página, então ele atravessa
// a recarga no sessionStorage
let _avisoEntrada = null
const _CHAVE_AVISO = 'praxis_aviso_entrada'
export function avisarNaEntrada(msg) { _guardarAviso(msg ? { erro: msg } : null) }
export function pedirConfirmacaoNaEntrada(email) { _guardarAviso({ confirmar: email }) }
function _guardarAviso(aviso) {
  _avisoEntrada = aviso
  try {
    if (aviso) sessionStorage.setItem(_CHAVE_AVISO, JSON.stringify(aviso))
    else sessionStorage.removeItem(_CHAVE_AVISO)
  } catch { /* sem armazenamento */ }
}
function _tirarAviso() {
  let aviso = _avisoEntrada
  try {
    aviso ||= JSON.parse(sessionStorage.getItem(_CHAVE_AVISO) || 'null')
    sessionStorage.removeItem(_CHAVE_AVISO)
  } catch { /* sem armazenamento ou texto antigo */ }
  _avisoEntrada = null
  return aviso
}

function _mostrarErro(id, msg) {
  const el = document.getElementById(id)
  if (!el) return
  if (!msg) { el.hidden = true; el.innerHTML = ''; return }
  el.innerHTML = `${ICO.alerta}<span>${esc(msg)}</span>`
  el.hidden = false
}

function _bindLoginEvents() {
  document.getElementById('btn-idioma')?.addEventListener('click', () => trocarIdioma(idioma() === 'en' ? 'pt' : 'en'))

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

  // Primeiro acesso: aproveita o e-mail já digitado na entrada
  document.getElementById('link-criar')?.addEventListener('click', () => {
    const email = document.getElementById('input-email')?.value.trim()
    if (email) document.getElementById('input-criar-email').value = email
    _irParaView('criar')
  })
  document.getElementById('btn-criar-voltar')?.addEventListener('click', () => _irParaView('login'))
  document.getElementById('btn-confirmar-voltar')?.addEventListener('click', () => _irParaView('login'))
  ;['input-criar-email', 'input-criar-senha'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      _mostrarErro('criar-erro', '')
      document.querySelectorAll('#form-criar input').forEach(i => i.removeAttribute('aria-invalid'))
    })
  })
  document.getElementById('form-criar')?.addEventListener('submit', async e => {
    e.preventDefault()
    const email = document.getElementById('input-criar-email').value.trim()
    const senha = document.getElementById('input-criar-senha').value
    const falta = !email ? 'input-criar-email' : senha.length < _SENHA_MINIMA ? 'input-criar-senha' : null
    if (falta) {
      _mostrarErro('criar-erro', email ? t('criarErroSenhaCurta', { n: _SENHA_MINIMA }) : t('informeEmail'))
      const campo = document.getElementById(falta)
      campo?.setAttribute('aria-invalid', 'true')
      campo?.focus()
      return
    }
    await _criarConta(email, senha)
  })
}

function _irParaView(nome) {
  document.querySelectorAll('.login-card .view').forEach(v => v.classList.remove('active'))
  const view = document.getElementById(`view-${nome}`)
  view?.classList.add('active')
  // Fora da visão de entrar, o celular esconde o título grande: o formulário
  // de senha e o aviso de e-mail sobem para o alto da tela
  document.querySelector('.login-page')?.toggleAttribute('data-secundaria', nome !== 'login')
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
    await _fb()
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

// ── Primeiro acesso: criar a senha ───────────────────────────
// Quem foi convidado cria a própria conta de login. O resto segue sozinho
// (onAuthStateChanged, em js/app.js): sem perfil e com o e-mail por confirmar,
// _aceitarConvite envia o link e a entrada volta pedindo a confirmação
const _SENHA_MINIMA = 8

async function _criarConta(email, senha) {
  const btn = document.getElementById('btn-criar')
  _mostrarErro('criar-erro', '')
  _botaoCarregando(btn, true, t('criarBotao'), t('criando'))
  try {
    await _fb()
    await createUserWithEmailAndPassword(auth, email, senha)
  } catch (err) {
    _mostrarErro('criar-erro', _traduzirErroAuth(err.code))
    if (['auth/invalid-email', 'auth/email-already-in-use'].includes(err.code)) {
      document.getElementById('input-criar-email')?.setAttribute('aria-invalid', 'true')
    } else if (err.code === 'auth/weak-password' || err.code === 'auth/password-does-not-meet-requirements') {
      document.getElementById('input-criar-senha')?.setAttribute('aria-invalid', 'true')
    }
  } finally {
    _botaoCarregando(btn, false, t('criarBotao'), t('criando'))
  }
}

// Envia o link de confirmação no idioma da tela; depois de confirmar, a página
// do Firebase oferece voltar ao Praxis (endereço autorizado no projeto; se não
// for, vai sem o retorno)
async function _enviarConfirmacao(usuario) {
  await _fb()
  auth.languageCode = idioma() === 'en' ? 'en' : 'pt-BR'
  try {
    await sendEmailVerification(usuario, { url: `${location.origin}/` })
  } catch (err) {
    if (!String(err?.code || '').includes('continue-uri')) throw err
    await sendEmailVerification(usuario)
  }
}

function _mostrarConfirmar(email) {
  const msg = document.getElementById('confirmar-msg')
  if (msg) {
    const [antes, depois] = String(t('confirmarMsgPara')).split('{email}')
    msg.innerHTML = `${esc(antes)}<b>${esc(email)}</b>${esc(depois ?? '')}`
  }
  _irParaView('confirmar')
}

// ── Entrada na demonstração ──────────────────────────────────
// "Acessar modo demo" abre a escolha de quem ser (js/demo-pessoas.js); a
// pessoa escolhida fica na aba e o login é sempre o da conta demo.
function _mostrarBoasVindas() {
  abrirEscolhaPessoa({
    modo: 'entrar',
    aoEscolher: () => _entrarDemo(),
    aoFechar: () => document.getElementById('btn-demo')?.focus(),
  })
}

// Com projeto próprio da demo (js/config.js), a página recarrega já nele e
// a entrada continua sozinha (continuarEntradaNaDemo, chamada por js/app.js)
const _CHAVE_ENTRAR_DEMO = 'praxis_entrar_demo'
async function _entrarDemo() {
  mostrarSpinner()
  try {
    await _fb()
    if (FIREBASE_CONFIG_DEMO && !naProjetoDemo) {
      marcarProjetoDemo(true)
      try { sessionStorage.setItem(_CHAVE_ENTRAR_DEMO, '1') } catch { /* sem armazenamento */ }
      location.reload()
      return
    }
    await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)
  } catch (err) {
    if (naProjetoDemo) {
      // A entrada de verdade não pode ficar no projeto da demo
      marcarProjetoDemo(false)
      avisarNaEntrada(t('erroAcessarDemo'))
      location.reload()
      return
    }
    prxToast(t('erroAcessarDemo'), 'error')
    _irParaView('login')
  }
  esconderSpinner()
}

// Depois da recarga para o projeto da demo: true uma vez só
export function entradaNaDemoPendente() {
  try {
    const pendente = sessionStorage.getItem(_CHAVE_ENTRAR_DEMO) === '1'
    sessionStorage.removeItem(_CHAVE_ENTRAR_DEMO)
    return pendente
  } catch { return false }
}
export function continuarEntradaNaDemo() { return _entrarDemo() }

// ── Recuperação de senha ─────────────────────────────────────
async function _enviarResetSenha(email) {
  const btn = document.getElementById('btn-enviar-link')
  _mostrarErro('forgot-erro', '')
  _botaoCarregando(btn, true, t('enviarLink'), t('enviarLink'))
  try {
    await _fb()
    await sendPasswordResetEmail(auth, email)
    _mostrarEnviado(email)
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Não revela se a conta existe: a resposta é a mesma de um envio bem-sucedido
      _mostrarEnviado(email)
    } else if (err.code === 'auth/invalid-email' || err.code === 'auth/missing-email') {
      _mostrarErro('forgot-erro', t('emailInvalido'))
    } else if (err.code === 'auth/network-request-failed') {
      _mostrarErro('forgot-erro', t('erroConexao'))
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
    msg.innerHTML = `${esc(antes)}<b>${esc(email)}</b>${esc(depois ?? '')}`
  }
  _irParaView('sent')
}

// ── Logout ────────────────────────────────────────────────────
// Sair apaga a cópia local dos dados (js/firebase.js) antes de deixar a conta
// e recarrega a página: o banco encerrado não volta na mesma página. Enquanto
// isso, a tela fica como está, com o indicador de espera (estaSaindo() faz o
// app não desenhar a entrada antes da recarga)
let _saindo = false
export const estaSaindo = () => _saindo

// Marca de sessão neste aparelho: com ela, a abertura espera o Firebase (o
// quadro vem em seguida); sem ela, a entrada aparece na hora (js/entrada.js)
const _CHAVE_SESSAO = 'praxis_sessao'
export function lembrarSessao() { try { localStorage.setItem(_CHAVE_SESSAO, '1') } catch { /* sem armazenamento */ } }
export function esquecerSessao() { try { localStorage.removeItem(_CHAVE_SESSAO) } catch { /* sem armazenamento */ } }
export function temSessaoLembrada() { try { return localStorage.getItem(_CHAVE_SESSAO) === '1' } catch { return false } }

export async function fazerLogout() {
  if (_saindo) return
  _saindo = true
  mostrarSpinner()
  esquecerSessao()
  await _fb()
  // As telas param de escutar o banco antes de ele ser encerrado (js/app.js):
  // senão cada escuta recebe o erro do encerramento e reage a ele
  window.dispatchEvent(new Event('praxis:saindo'))
  await apagarCopiaLocal()
  // A próxima entrada volta ao projeto real
  marcarProjetoDemo(false)
  try {
    await signOut(auth)
  } catch (err) {
    // A conta continua aberta: a página recarrega com um banco novo
    console.warn('Sair:', err?.code || err?.message || err)
  }
  location.reload()
}

// ── Carregar dados do usuário logado ─────────────────────────
// Quem já entrou neste aparelho abre o app com o perfil da cópia local, sem
// esperar a rede (e sem internet também). A conferência com o perfil do
// servidor vem logo depois, em segundo plano: conta desativada sai; perfil ou
// empresas diferentes renovam o token e redesenham a tela (evento
// praxis:perfil, em js/app.js).
// Antes, cada abertura esperava as duas idas à rede, e sem internet a falha
// levava à saída da conta, que apagava a cópia local.
// doServidor: lê só do servidor (a renovação da demo muda o perfil)
export async function carregarUsuario(uid, { doServidor = false } = {}) {
  await _fb()
  if (!doServidor) {
    let local = null
    try {
      const s = await getDocFromCache(doc(db, 'usuarios', uid))
      if (s.exists()) local = { id: s.id, ...s.data() }
    } catch { /* sem cópia local deste perfil */ }
    if (local) {
      // Depois que a primeira tela abriu, para não disputar a rede e a fila do
      // Firestore com as leituras dela
      setTimeout(() => _conferirNoServidor(uid, local), 2500)
      return local
    }
  }
  // Token com o perfil e as empresas de agora; logo depois de entrar ele acabou
  // de ser emitido e não precisa de outra ida à rede
  try {
    const u = auth.currentUser
    if (u && Date.now() - Date.parse((await u.getIdTokenResult()).issuedAtTime) > 60000) await u.getIdToken(true)
  } catch (e) {
    console.warn('Erro ao renovar token:', e.message)
  }
  const snap = await getDocFromServer(doc(db, 'usuarios', uid))
  if (!snap.exists()) {
    // Conta demo criada direto no console do Firebase: o perfil nasce aqui,
    // no primeiro acesso (sem Cloud Functions). A renovação da demo, logo em
    // seguida, liga o perfil às empresas de exemplo. O perfil 'demo' não dá
    // permissão nenhuma: dentro do app vale a pessoa escolhida na entrada, e
    // as regras só deixam a conta mexer nos dados da demonstração.
    if (auth.currentUser?.email === DEMO_EMAIL) {
      const perfilDemo = { nome: 'Demo Praxis', email: DEMO_EMAIL, perfil: 'demo', ativo: true, empresas: [], ultimoAcesso: null }
      await setDoc(doc(db, 'usuarios', uid), { ...perfilDemo, criadoEm: serverTimestamp() })
      return { id: uid, ...perfilDemo }
    }
    // Primeiro acesso de quem foi convidado: o perfil nasce do convite
    const convidado = await _aceitarConvite(uid)
    if (convidado) return convidado
    throw _erroEntrada('praxis/sem-perfil')
  }
  return { id: snap.id, ...snap.data() }
}

// Os campos do perfil que mudam o que a pessoa vê e pode fazer
const _CAMPOS_DO_ACESSO = ['perfil', 'empresas', 'ativo', 'nome', 'email']
function _mesmoAcesso(a, b) {
  return _CAMPOS_DO_ACESSO.every(c => JSON.stringify(a?.[c] ?? null) === JSON.stringify(b?.[c] ?? null))
}

// Segundo plano da abertura rápida: sem internet, fica com a cópia local (as
// gravações já esperam a conexão, ver o aviso de sem conexão em js/ui.js).
// O token só é renovado quando o perfil mudou (o perfil e as empresas vão no
// token); renovar a cada abertura era mais uma ida à rede
async function _conferirNoServidor(uid, local) {
  try {
    await _fb()
    const snap = await getDocFromServer(doc(db, 'usuarios', uid))
    if (auth.currentUser?.uid !== uid || _saindo) return
    const doBanco = snap.exists() ? { id: snap.id, ...snap.data() } : null
    if (!doBanco || !doBanco.ativo) {
      avisarNaEntrada(t(doBanco ? 'entradaInativo' : 'entradaSemPerfil'))
      await fazerLogout()
      return
    }
    if (_mesmoAcesso(local, doBanco)) return
    if (auth.currentUser) await auth.currentUser.getIdToken(true)
    window.dispatchEvent(new CustomEvent('praxis:perfil', { detail: doBanco }))
  } catch (e) {
    console.warn('Perfil conferido só na cópia local:', e?.code || e?.message || e)
  }
}

// Convite pendente para o e-mail da conta (/convites/{e-mail}, criado em
// Configurações › Usuários): a própria pessoa grava o seu perfil copiando o
// convite e apaga o convite, no mesmo lote. As regras conferem campo a campo
// e o prazo (firestore.rules, aceitaConvite).
async function _aceitarConvite(uid) {
  await _fb()
  const email = String(auth.currentUser?.email || '').trim().toLowerCase()
  if (!email) return null
  // O convite só vale com o e-mail confirmado (firestore.rules, aceitaConvite
  // e a leitura do convite): sem isso, alguém criaria a conta com o e-mail de
  // outra pessoa. A confirmação pode ter sido feita em outra aba: o usuário e
  // o token são relidos antes de decidir. Quem ainda não confirmou recebe o
  // link (de novo) e volta para a entrada sabendo o porquê
  if (!auth.currentUser.emailVerified) {
    try {
      await auth.currentUser.reload()
      await auth.currentUser.getIdToken(true)
    } catch { /* decide com o que tem */ }
  }
  if (!auth.currentUser?.emailVerified) {
    try {
      await _enviarConfirmacao(auth.currentUser)
    } catch (e) {
      console.warn('Link de confirmação não enviado:', e?.code || e?.message)
    }
    throw _erroEntrada('praxis/email-nao-confirmado')
  }
  const ref = doc(db, 'convites', email)
  let snap
  try {
    snap = await getDoc(ref)
  } catch (e) {
    console.warn('Convite não lido:', e.message)
    return null
  }
  if (!snap.exists()) return null
  const c = snap.data()
  if (!c.expiraEm?.toMillis || c.expiraEm.toMillis() <= Date.now()) {
    throw _erroEntrada('praxis/convite-expirado')
  }
  const perfil = {
    nome: c.nome, email: c.email, perfil: c.perfil, empresas: c.empresas,
    ativo: c.ativo, convidadoPor: c.criadoPor, ultimoAcesso: null,
  }
  const lote = writeBatch(db)
  lote.set(doc(db, 'usuarios', uid), { ...perfil, criadoEm: serverTimestamp() })
  lote.delete(ref)
  await lote.commit()
  return { id: uid, ...perfil }
}

// O código vai para o console; a tela mostra o aviso traduzido (app.js)
function _erroEntrada(codigo) {
  const erro = new Error(codigo)
  erro.code = codigo
  return erro
}

// ── Tradução de erros Firebase Auth ──────────────────────────
function _traduzirErroAuth(code) {
  const map = {
    'auth/invalid-email':          'emailInvalido',
    'auth/user-not-found':         'loginErroCredenciais',
    'auth/wrong-password':         'loginErroCredenciais',
    'auth/invalid-credential':     'loginErroCredenciais',
    'auth/too-many-requests':      'loginErroTentativas',
    'auth/user-disabled':          'loginErroDesativada',
    'auth/network-request-failed': 'erroConexao',
    // Primeiro acesso (criar a senha)
    'auth/email-already-in-use':   'criarErroExiste',
    'auth/weak-password':          'criarErroSenhaFraca',
    'auth/password-does-not-meet-requirements': 'criarErroSenhaFraca',
    'auth/operation-not-allowed':  'criarErroDesligado',
    'auth/admin-restricted-operation': 'criarErroDesligado',
  }
  return t(map[code] ?? 'loginErroGenerico')
}
