import { auth, onAuthStateChanged, db, doc, getDoc, updateDoc, serverTimestamp, naProjetoDemo } from './firebase.js'
import { initTheme, mostrarCeu, mostrarSpinner, esconderSpinner, mostrarDemoBanner, initOfflineWatcher, initCommandPalette, abrirCommandPalette, marcaPraxis, simboloPraxis, prxEscolha, consumirVoltarDeModal, quandoHistoricoLivre, empilharVoltar, desempilharVoltar } from './ui.js'
import { mostrarEntrada, carregarUsuario, fazerLogout, avisarNaEntrada, pedirConfirmacaoNaEntrada, estaSaindo, lembrarSessao, esquecerSessao, entradaNaDemoPendente, continuarEntradaNaDemo } from './auth.js'
import { PERFIS, PERFIS_LABEL, t, carregarIdioma } from './constants.js'
import { gerarIniciais, esc, prefereMenosMovimento, marcarProjetoDemo } from './utils.js'
import { iniciarCamposData } from './campo-data.js'
import { PESSOAS_DEMO, pessoaEscolhida, escolherPessoa, esquecerPessoa } from './demo-pessoas.js'
import { sessao, registrarNavegacao, registrarTrocaDePessoa } from './estado.js'

// ── Limpadores de listeners (2.13) ────────────────────────────
const _limpadores = new Set()
export function registrarLimpador(fn) { _limpadores.add(fn) }
function _limparTudo() {
  _limpadores.forEach(fn => { try { fn() } catch {} })
  _limpadores.clear()
}
// Sair (js/auth.js): as escutas param antes de o banco ser encerrado
window.addEventListener('praxis:saindo', () => _limparTudo())

// ── Boot ─────────────────────────────────────────────────────

// Service worker: o app inteiro guardado no aparelho, numa versão fechada
// (service-worker.js). Fora de localhost e 127.0.0.1, onde atrapalharia quem
// desenvolve; em praxis.localhost registra (os testes usam). Quem já tem um
// registrado (volta ao app) registra na hora, para receber a versão nova; na
// primeira visita, só depois que a primeira tela da conta abriu: guardar o app
// baixa cerca de 500 KB, que disputavam a rede com a entrada
const _comServiceWorker = 'serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1'
let _swRegistrado = false
function _registrarServiceWorkerUmaVez() {
  if (!_comServiceWorker || _swRegistrado) return
  _swRegistrado = true
  _registrarServiceWorker()
}
if (_comServiceWorker && navigator.serviceWorker.controller) _registrarServiceWorkerUmaVez()

// Versão nova publicada: fica guardada ao lado e só assume quando a pessoa
// toca em "Atualizar" (recarrega) ou quando o app é fechado e aberto de novo.
// Assim nada que esteja sendo preenchido se perde no meio
async function _registrarServiceWorker() {
  let reg
  try {
    reg = await navigator.serviceWorker.register('/service-worker.js')
  } catch (err) {
    console.warn('Service worker não registrado:', err?.message || err)
    return
  }
  // Navegador que bloqueia service workers (políticas, alguns modos privados)
  if (!reg) return
  let pediuAtualizar = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pediuAtualizar) location.reload()
  })
  const avisar = novo => {
    if (!novo || !navigator.serviceWorker.controller || document.querySelector('.toast[data-versao]')) return
    import('./ui.js').then(({ prxToast }) => {
      prxToast(t('versaoNova'), 'info', { duracao: 0, acoes: [{ rotulo: t('versaoAtualizar'), fn: () => { pediuAtualizar = true; novo.postMessage('praxis:atualizar') } }] })
      document.querySelector('#toast-container .toast:last-child')?.setAttribute('data-versao', '')
    })
  }
  if (reg.waiting) avisar(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const novo = reg.installing
    novo?.addEventListener('statechange', () => { if (novo.state === 'installed') avisar(novo) })
  })
  // O app aberto por dias (comum no celular) procura a versão nova ao voltar
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {})
  })
}

// Perfil mudou no servidor depois da abertura rápida (js/auth.js): a tela se
// redesenha com o acesso de agora, menos se houver uma janela aberta
window.addEventListener('praxis:perfil', e => {
  if (!sessao.usuario) return
  if (sessao.isDemo) { sessao.contaDemo = e.detail; return }
  sessao.usuario = e.detail
  const janelaAberta = document.querySelector('.modal-overlay.visible, .bv-overlay, #tour-popover, .cmd-palette-overlay.visible')
  if (!janelaAberta) _rotear()
})

// Erros de rede na abertura (sem internet, rede caindo): a conta continua
// aberta. Antes, a falha levava à saída da conta e apagava a cópia local
function _erroDeRede(err) {
  const codigo = String(err?.code || '')
  return codigo === 'unavailable' || codigo === 'auth/network-request-failed' || codigo === 'deadline-exceeded' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
}
function _mostrarSemConexaoNaAbertura() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <main class="pagina-404 pagina-cheia">
      <section class="p404" aria-labelledby="sem-rede-titulo">
        <div class="p404-topo">${simboloPraxis(64, 'p404-simbolo')}</div>
        <h1 class="p404-titulo" id="sem-rede-titulo">${t('aberturaSemRedeTitulo')}</h1>
        <p class="p404-texto">${t('aberturaSemRedeTexto')}</p>
        <button type="button" class="btn-primary" id="btn-tentar-de-novo">${t('tentarDeNovo')}</button>
      </section>
    </main>`
  document.getElementById('btn-tentar-de-novo').onclick = () => location.reload()
  window.addEventListener('online', () => location.reload(), { once: true })
}

// Quem escolheu o inglês baixa o dicionário antes da primeira tela
await carregarIdioma()

initTheme()
initOfflineWatcher()
iniciarCamposData()
initCommandPalette()

onAuthStateChanged(auth, async (fireUser) => {
  // Saindo: a página recarrega em seguida (fazerLogout, em js/auth.js); a
  // tela fica como está, com a espera, em vez de piscar a entrada
  if (!fireUser && estaSaindo()) return

  // Projeto da demo (js/utils.js, marcaProjetoDemo): recém-recarregada para
  // entrar na demo, a entrada continua com a pessoa já escolhida; fora disso,
  // sem a conta demo aberta, a página volta ao projeto real
  if (!fireUser && naProjetoDemo) {
    if (entradaNaDemoPendente()) { continuarEntradaNaDemo(); return }
    marcarProjetoDemo(false)
    location.reload()
    return
  }
  esconderSpinner()

  if (!fireUser) {
    _limparTudo()
    sessao.usuario  = null
    sessao.fireUser = null
    sessao.isDemo   = false
    sessao.contaDemo = null
    esquecerPessoa()
    sessao.lateral  = { contagens: {}, filtroPedidos: 'todos' }
    try { sessionStorage.removeItem('praxis_lateral_contagens') } catch {}
    mostrarDemoBanner(false)
    document.getElementById('bottom-nav')?.remove()
    document.getElementById('notif-fundo')?.remove()
    esquecerSessao()
    // A entrada pode já estar na tela (index.html, js/entrada.js): redesenhar
    // apagaria o que a pessoa começou a digitar
    mostrarEntrada()
    window.__praxisPronto?.()
    // Com a entrada na tela, o quadro de pedidos vem no tempo ocioso: o
    // primeiro clique depois do login continua instantâneo
    ;(window.requestIdleCallback || setTimeout)(() => import('./pedidos.js').catch(() => {}))
    return
  }

  mostrarSpinner()
  // A espera (com o progresso da renovação da demo) assume o lugar do splash
  window.__praxisPronto?.()
  try {
    const usuario = await carregarUsuario(fireUser.uid)
    if (!usuario.ativo) {
      avisarNaEntrada(t('entradaInativo'))
      await fazerLogout()
      return
    }
    sessao.usuario  = usuario
    sessao.fireUser = fireUser
    sessao.isDemo   = fireUser.email === 'demo@praxis.app'
    lembrarSessao()
    if (!sessao.isDemo) _registrarAcesso(fireUser.uid)

    // Na demo, o app age como a pessoa escolhida na entrada
    // (js/demo-pessoas.js). As permissões da conta demo vêm das regras (pelo
    // e-mail), sem Cloud Functions.
    if (sessao.isDemo) {
      sessao.contaDemo = usuario
      sessao.usuario = await _carregarPessoaDemo(pessoaEscolhida())
    }

    mostrarCeu(false)
    mostrarDemoBanner(sessao.isDemo)
    // A entrada no celular costuma estar rolada (o botão da demo fica embaixo)
    window.scrollTo(0, 0)
    // O CSS das telas (index.html, js/entrada.js) chega em paralelo com a entrada
    await window.__praxisCssTelas
    await _rotear()
    // A3: quem entrou com a senha inicial do gestor troca antes de seguir
    if (usuario.trocarSenha && !sessao.isDemo) {
      const { pedirSenhaNova } = await import('./senha-nova.js')
      await pedirSenhaNova(usuario)
    }
    setTimeout(_registrarServiceWorkerUmaVez, 3000)
    // Primeiro acesso do dia: a demo volta aos dados de exemplo, com as datas
    // de hoje, depois que a tela já apareceu
    if (sessao.isDemo) _renovarDemoDoDia(fireUser)
  } catch (err) {
    // Conta sem perfil ou convite vencido são situações previstas, com aviso na entrada
    if (String(err?.code || '').startsWith('praxis/')) console.warn(err.message)
    else console.error(err)
    if (_erroDeRede(err)) { _mostrarSemConexaoNaAbertura(); return }
    if (err?.code === 'praxis/sem-perfil') avisarNaEntrada(t('entradaSemPerfil'))
    else if (err?.code === 'praxis/convite-expirado') avisarNaEntrada(t('entradaConviteExpirado'))
    else if (err?.code === 'praxis/email-nao-confirmado') pedirConfirmacaoNaEntrada(fireUser.email)
    await fazerLogout()
  } finally {
    esconderSpinner()
  }
})

// Renovação do dia em segundo plano: quem entra vê o quadro na hora, com os
// dados de antes, e os pedidos voltam ao lugar conforme as gravações chegam
// (o quadro escuta o Firestore). As outras telas leem uma vez, então são
// redesenhadas no fim, menos se houver uma janela aberta, para não perder o
// que a pessoa está fazendo. Uma falha aqui não atrapalha a navegação.
async function _renovarDemoDoDia(fireUser) {
  try {
    const { renovarDemo } = await import('./demo-reset.js')
    if (await renovarDemo(sessao.contaDemo) !== 'renovada') return
    if (sessao.fireUser !== fireUser) return
    const empresasAntes = JSON.stringify(sessao.usuario?.empresas || [])
    sessao.contaDemo = await carregarUsuario(fireUser.uid, { doServidor: true })
    sessao.usuario = await _carregarPessoaDemo(pessoaEscolhida())
    mostrarDemoBanner(true)
    const tela = new URLSearchParams(location.search).get('tela') || 'pedidos'
    const mudouEmpresas = JSON.stringify(sessao.usuario.empresas || []) !== empresasAntes
    const janelaAberta = document.querySelector('.modal-overlay.visible, .bv-overlay, #tour-popover, .cmd-palette-overlay.visible')
    if ((tela !== 'pedidos' || mudouEmpresas) && !janelaAberta) _rotear()
  } catch (e) {
    console.warn('Renovação da demo falhou:', e.message)
  }
}

// Último acesso (Cadastros › Usuários): uma gravação por pessoa e aba
function _registrarAcesso(id) {
  try {
    if (sessionStorage.getItem(`praxis_acesso_${id}`)) return
    sessionStorage.setItem(`praxis_acesso_${id}`, '1')
  } catch {}
  // Depois que a tela abriu: a gravação disputava a fila do Firestore com as
  // primeiras leituras do quadro
  setTimeout(() => updateDoc(doc(db, 'usuarios', id), { ultimoAcesso: serverTimestamp() }).catch(() => {}), 4000)
}

// ── Pessoas da demonstração ───────────────────────────────────
async function _carregarPessoaDemo(id) {
  const base = PESSOAS_DEMO.find(p => p.id === id) || PESSOAS_DEMO[0]
  _registrarAcesso(base.id)
  try {
    const snap = await getDoc(doc(db, 'usuarios', base.id))
    if (snap.exists()) return { id: snap.id, ...snap.data() }
  } catch {}
  // Sem o perfil no banco (a renovação falhou): usa os dados fixos da pessoa
  return { id: base.id, nome: base.nome, email: base.email, perfil: base.perfil, ativo: true, empresas: sessao.contaDemo?.empresas || [] }
}

// "Trocar perfil" na faixa da demo: muda a pessoa sem sair da conta
export async function trocarPessoaDemo(id) {
  if (!sessao.isDemo) return
  escolherPessoa(id)
  mostrarSpinner()
  try {
    sessao.usuario = await _carregarPessoaDemo(id)
    sessao.lateral = { contagens: {}, filtroPedidos: 'todos' }
    try { sessionStorage.removeItem('praxis_lateral_contagens') } catch {}
    mostrarDemoBanner(true)
    window.scrollTo(0, 0)
    navegar('pedidos', {}, { substituir: true })
  } finally {
    esconderSpinner()
  }
}
registrarTrocaDePessoa(trocarPessoaDemo)

// ── Roteamento ────────────────────────────────────────────────
export function navegar(tela, params = {}, { substituir = false } = {}) {
  // Se uma janela acabou de fechar no celular, espera o voltar dela terminar
  quandoHistoricoLivre(() => {
    const url = new URL(window.location)
    url.searchParams.set('tela', tela)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    // Limpa params não fornecidos (são de uma tela só)
    ;['id', 'aba', 'filtro'].forEach(p => { if (!(p in params)) url.searchParams.delete(p) })
    if (substituir) window.history.replaceState({}, '', url)
    else window.history.pushState({}, '', url)
    _trocarTela(() => _rotear())
  })
}

// O voltar do celular (e do navegador) fecha primeiro a janela aberta; só
// depois volta de tela (ui.js guarda uma entrada no histórico por janela)
window.addEventListener('popstate', () => {
  if (consumirVoltarDeModal()) return
  if (sessao.usuario) _trocarTela(() => _rotear())
})

// ── Cartão ↔ pedido ───────────────────────────────────────────
// Abrir um pedido pelo quadro: o título do cartão voa até virar o título do
// pedido; voltar faz o caminho inverso, até o cartão (View Transitions; o resto
// da tela troca na hora, components.css). Sem suporte ou com movimento
// reduzido, a troca é direta. A nova tela é esperada no máximo 0,6 s
let _rotaAtual = { tela: null, id: null, filtro: null, aba: null }
const _TITULO_VT = 'pedido-titulo'
function _rotaDaUrl() {
  const p = new URLSearchParams(location.search)
  return { tela: p.get('tela') || 'pedidos', id: p.get('id'), filtro: p.get('filtro'), aba: p.get('aba') }
}
// As abas principais na ordem da navegação: entre elas, o conteúdo desliza
// para o lado em que a aba fica (para a frente ou para trás)
const _ORDEM_ABAS = ['pedidos', 'fila', 'relatorios', 'cad-empresas', 'cad-categorias', 'cad-fornecedores', 'config-usuarios', 'config-alcadas', 'config-auditoria', 'config-geral']
const _aba = r => r.tela === 'pedidos' ? (r.filtro === 'pendentes' ? 'fila' : 'pedidos')
  : r.tela === 'config-cadastros' ? `cad-${r.aba || 'empresas'}` : r.tela
function _trocarTela(executar) {
  const de = _rotaAtual, para = _rotaDaUrl()
  const pode = typeof document.startViewTransition === 'function' && !prefereMenosMovimento() && document.visibilityState === 'visible'
  const id = para.tela === 'detalhe' ? para.id : de.tela === 'detalhe' ? de.id : null
  const tituloCartao = () => id && document.querySelector(`.kcard[data-id="${CSS.escape(id)}"] .kcard-title`)
  const tituloPedido = () => document.querySelector('.detalhe-titulo')
  let origem = null, destino = null
  if (pode && para.tela === 'detalhe' && de.tela === 'pedidos') { origem = tituloCartao(); destino = tituloPedido }
  else if (pode && de.tela === 'detalhe' && para.tela === 'pedidos') { origem = tituloPedido(); destino = tituloCartao }
  if (!origem) {
    const ia = _ORDEM_ABAS.indexOf(_aba(de)), ib = _ORDEM_ABAS.indexOf(_aba(para))
    if (!pode || ia < 0 || ib < 0 || ia === ib) { executar(); return }
    const raiz = document.documentElement
    raiz.dataset.vtAba = ib > ia ? 'frente' : 'tras'
    document.startViewTransition(() => executar()).finished.finally(() => { delete raiz.dataset.vtAba })
    return
  }
  origem.style.viewTransitionName = _TITULO_VT
  const vt = document.startViewTransition(() => new Promise(fim => {
    executar()
    const t0 = performance.now()
    const procurar = () => {
      const alvo = destino()
      if (alvo) { alvo.style.viewTransitionName = _TITULO_VT; fim(); return }
      if (performance.now() - t0 > 600) { fim(); return }
      setTimeout(procurar, 16)
    }
    procurar()
  }))
  vt.finished.finally(() => document.querySelectorAll('.detalhe-titulo, .kcard-title').forEach(el => { if (el.style.viewTransitionName === _TITULO_VT) el.style.removeProperty('view-transition-name') }))
}

const TELAS_CONFIG = ['config-usuarios', 'config-cadastros', 'config-geral', 'config-auditoria', 'config-alcadas']

// Quem pode ver o quê (usado na guarda de rota, na topbar e na barra inferior)
function _acessos(perfil = sessao.usuario?.perfil) {
  return {
    relatorios: [PERFIS.SUPREMO, PERFIS.GESTOR, PERFIS.APROVADOR, PERFIS.FINANCEIRO].includes(perfil),
    config:     [PERFIS.SUPREMO, PERFIS.GESTOR].includes(perfil),
  }
}

function _rotear() {
  _limparTudo() // cancela listeners da view anterior (2.13)
  _fecharMenuUsuario(false)
  _fecharNotificacoes()

  const params = new URLSearchParams(window.location.search)
  const tela   = params.get('tela') || 'pedidos'
  const id     = params.get('id')
  _rotaAtual = { tela, id, filtro: params.get('filtro'), aba: params.get('aba') }

  // Guarda de rota por perfil: troca o endereço (sem deixar a tela bloqueada
  // no histórico, senão o "voltar" cairia nela de novo) e avisa
  const pode = _acessos()
  const bloqueado = (tela === 'relatorios' && !pode.relatorios) || (TELAS_CONFIG.includes(tela) && !pode.config)
  if (bloqueado) {
    navegar('pedidos', {}, { substituir: true })
    import('./ui.js').then(({ prxToast }) => prxToast(t('semAcessoTela'), 'info'))
    return
  }

  const tela_ = _TELAS[tela]
  if (!tela_) return _render404(tela)
  const [modulo, render] = tela_
  const seq = ++_rotaSeq
  // Atalhos do app instalado (manifest.json): ?novo=pedido ou ?novo=compra
  // abrem a janela por cima do quadro; o parâmetro sai do endereço
  const novo = tela === 'pedidos' ? params.get('novo') : null
  if (novo) {
    const url = new URL(window.location)
    url.searchParams.delete('novo')
    window.history.replaceState({}, '', url)
  }
  return import(modulo)
    .then(m => { if (seq === _rotaSeq) return m[render](id) })   // outra tela foi pedida no meio: não desenha esta
    .then(async () => {
      if (seq !== _rotaSeq) return
      if (novo === 'pedido') (await import('./pedidos.js')).abrirNovoPedido()
      else if (novo === 'compra') (await import('./lancar-compra.js')).abrirLancamento()
    })
    .catch(err => {
      console.error(err)
      import('./ui.js').then(({ prxToast }) => prxToast(t('erroCarregar'), 'error'))
    })
}

// Telas carregadas sob demanda: a entrada não baixa o código do quadro, do
// detalhe, dos relatórios e dos cadastros (~470 KB sem compressão) antes de
// aparecer. Cada uma vem na primeira visita e fica em cache.
const _TELAS = {
  'pedidos':          ['./pedidos.js',          'renderPedidos'],
  'detalhe':          ['./pedido-detalhe.js',   'renderDetalhe'],
  'relatorios':       ['./relatorios.js',       'renderRelatorios'],
  'config-usuarios':  ['./config-usuarios.js',  'renderConfigUsuarios'],
  'config-auditoria': ['./config-auditoria.js', 'renderConfigAuditoria'],
  'config-alcadas':   ['./config-alcadas.js',   'renderConfigAlcadas'],
  'config-cadastros': ['./config-cadastros.js', 'renderConfigCadastros'],
  'config-geral':     ['./config-geral.js',     'renderConfigGeral'],
  // Catálogo do sistema visual, fora da navegação (docs/sistema.md)
  'sistema':          ['./sistema.js',          'renderSistema'],
}
let _rotaSeq = 0

function _render404(tela) {
  const app = document.getElementById('app')
  const nomeTela = esc(String(tela).slice(0, 60))
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('')}
      <main class="main-content pagina-404">
        <section class="p404" aria-labelledby="p404-titulo">
          <div class="p404-topo">
            <span class="p404-codigo numeral" aria-hidden="true">404</span>
            ${simboloPraxis(64, 'p404-simbolo')}
          </div>
          <h1 class="p404-titulo" id="p404-titulo">${t('pagina404Titulo')}</h1>
          <p class="p404-texto">${t('pagina404Texto').replace('{tela}', `<code>${nomeTela}</code>`)}</p>
          <button type="button" class="btn-primary" id="btn-404-voltar">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            ${t('pagina404Botao')}
          </button>
        </section>
      </main>
      ${renderFooter()}
    </div>
  `
  document.getElementById('btn-404-voltar')?.addEventListener('click', () => navegar('pedidos'))
  initTopbarEvents(false)
  import('./notificacoes.js').then(m => m.renderNotificacoes()).catch(() => {})
}

// ── Ícones da moldura (mesmo traço: stroke 2, 16–18px) ───────
const _ico = (corpo, tam = 16) => `<svg width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${corpo}</svg>`
const ICO = {
  busca:   (n) => _ico('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', n),
  sino:    (n) => _ico('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>', n),
  engren:  (n) => _ico('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>', n),
  fechar:  (n) => _ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', n),
  quadro:  (n) => _ico('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', n),
  barras:  (n) => _ico('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', n),
  sol:     (n) => _ico('<circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/><line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="6.34" y2="17.66"/><line x1="17.66" y1="6.34" x2="19.07" y2="4.93"/>', n),
  lua:     (n) => _ico('<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>', n),
  sair:    (n) => _ico('<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', n),
  setas:   (n) => _ico('<polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/>', n),
  ajustes: (n) => _ico('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', n),
  mais:    (n) => _ico('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', n),
  fila:    (n) => _ico('<path d="M4 6h11"/><path d="M4 12h11"/><path d="M4 18h7"/><polyline points="16 16 18 18 22 14"/>', n),
  carrinho: (n) => _ico('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 001 .8h9.6a1 1 0 001-.8L21 7H6.2"/>', n),
  recibo:  (n) => _ico('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="9" y1="12" x2="15" y2="12"/>', n),
  admin:   (n) => _ico('<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>', n),
  comando: (n) => _ico('<path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/>', n),
}

const _ehMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
const _atalhoBusca = _ehMac ? '⌘K' : 'Ctrl K'

// ── Barra lateral ─────────────────────────────────────────────
// Desenho da Inscrição: letreiro no alto, itens em texto com o contador em
// numeral à direita, o grupo de cadastros separado por um fio e, no pé, a
// conta (só o nome). Busca e empresa ficam nas próprias telas, não aqui:
// nada aparece duas vezes. No celular ela vira uma faixa no topo (marca e
// notificações) e a navegação passa para a barra inferior.
//
// Chaves dos itens: pedidos, fila, relatorios, cad-empresas, cad-categorias,
// cad-fornecedores, usuarios, config-geral. As telas atualizam contadores e
// o item ativo por atualizarLateral().

function _itemAtivo(telaAtiva) {
  const params = new URLSearchParams(window.location.search)
  if (telaAtiva === 'pedidos') {
    const filtro = params.get('filtro') || sessao.lateral.filtroPedidos
    return filtro === 'pendentes' ? 'fila' : 'pedidos'
  }
  if (telaAtiva === 'config-cadastros') return `cad-${params.get('aba') || 'empresas'}`
  if (telaAtiva === 'config-usuarios') return 'usuarios'
  if (telaAtiva === 'config-auditoria') return 'auditoria'
  if (telaAtiva === 'config-alcadas') return 'alcadas'
  return telaAtiva
}

// Os contadores ficam guardados na sessão do navegador: ao recarregar uma tela
// que não os calcula (detalhe, relatórios), a barra mostra os últimos vistos
const _CHAVE_CONTAGENS = 'praxis_lateral_contagens'
function _carregarContagens() {
  if (Object.keys(sessao.lateral.contagens).length) return
  try { Object.assign(sessao.lateral.contagens, JSON.parse(sessionStorage.getItem(_CHAVE_CONTAGENS) || '{}')) } catch {}
}

function _contador(chave) {
  const n = sessao.lateral.contagens[chave]
  return Number.isFinite(n) ? String(n) : ''
}
// Na barra inferior, só a fila, e só quando há o que fazer
function _contadorBarra(chave) {
  const n = sessao.lateral.contagens[chave]
  return Number.isFinite(n) && n > 0 ? (n > 99 ? '99+' : String(n)) : ''
}

export function renderTopbar(telaAtiva, modoConfig = false) {
  const { usuario } = sessao
  if (!usuario) return ''

  const pode  = _acessos(usuario.perfil)
  const ativo = _itemAtivo(telaAtiva)
  _carregarContagens()

  const item = (chave, tela, rotulo, extra = {}) => {
    const qs = new URLSearchParams({ tela, ...extra }).toString()
    const dados = Object.entries(extra).map(([k, v]) => `data-${k}="${v}"`).join(' ')
    const on = ativo === chave
    return `<a class="lateral-item ${on ? 'active' : ''}" href="?${qs}" data-nav="${tela}" data-item="${chave}" ${dados} ${on ? 'aria-current="page"' : ''}><span class="lateral-item-rotulo">${rotulo}</span><span class="lateral-n" data-n="${chave}">${_contador(chave)}</span></a>`
  }

  return `
    <a class="link-salto" href="#">${t('pularConteudo')}</a>
    <aside class="lateral" data-mode="${modoConfig ? 'config' : 'main'}">
      <div class="lateral-topo">
        <a class="lateral-marca" href="?tela=pedidos&filtro=todos" data-nav="pedidos" data-filtro="todos">${marcaPraxis()}<span class="sr-only">: ${t('navPedidos')}</span></a>
        <div class="notif-wrap" id="notif-wrap">
          <button type="button" class="lateral-icone" id="btn-notif" aria-label="${t('tooltipNotificacoes')}" aria-haspopup="dialog" aria-expanded="false" aria-controls="notif-dropdown" data-tooltip="${t('tooltipNotificacoes')}">
            ${ICO.sino(17)}
            <span class="notif-badge" id="notif-count" data-estilo="display:none" aria-hidden="true">0</span>
          </button>
          <div class="notif-dropdown" id="notif-dropdown" role="dialog" aria-label="${t('tooltipNotificacoes')}"></div>
        </div>
      </div>

      <nav class="lateral-nav" aria-label="${t('navNavegacao')}">
        ${item('pedidos', 'pedidos', t('navPedidos'), { filtro: 'todos' })}
        ${item('fila', 'pedidos', t('navMinhaFila'), { filtro: 'pendentes' })}
        ${pode.relatorios ? item('relatorios', 'relatorios', t('navRelatorios')) : ''}
        ${pode.config ? `
        <div class="lateral-grupo" id="lateral-cadastros" role="group" aria-labelledby="lateral-cadastros-rotulo">
          <span class="lateral-grupo-rotulo" id="lateral-cadastros-rotulo">${t('navAdministracao')}</span>
          ${item('cad-empresas', 'config-cadastros', t('secaoEmpresas'), { aba: 'empresas' })}
          ${item('cad-categorias', 'config-cadastros', t('secaoCategorias'), { aba: 'categorias' })}
          ${item('cad-fornecedores', 'config-cadastros', t('secaoFornecedores'), { aba: 'fornecedores' })}
          ${item('usuarios', 'config-usuarios', t('configUsuarios'))}
          ${item('alcadas', 'config-alcadas', t('alcTitulo'))}
          ${item('auditoria', 'config-auditoria', t('audTitulo'))}
        </div>` : ''}
      </nav>

      <div class="lateral-rodape">
        <button type="button" class="lateral-conta" id="btn-avatar" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu" aria-label="${t('tooltipConta')}: ${esc(usuario.nome)}">
          <span class="lateral-conta-nome">${esc(usuario.nome)}</span>
          ${ICO.setas(14)}
        </button>
      </div>
    </aside>
  `
}

// Atualiza a barra lateral sem redesenhar a tela.
//   contagens:     { pedidos, fila, relatorios, 'cad-empresas', 'cad-categorias', 'cad-fornecedores', usuarios }
//   filtroPedidos: pill ativa na tela de pedidos ('pendentes' acende "Minha fila")
//   ativo:         chave do item a destacar
export function atualizarLateral({ contagens, filtroPedidos, ativo } = {}) {
  if (contagens) {
    Object.assign(sessao.lateral.contagens, contagens)
    try { sessionStorage.setItem(_CHAVE_CONTAGENS, JSON.stringify(sessao.lateral.contagens)) } catch {}
    document.querySelectorAll('#bottom-nav [data-n]').forEach(el => { el.textContent = _contadorBarra(el.dataset.n) })
  }
  if (filtroPedidos) sessao.lateral.filtroPedidos = filtroPedidos
  const raiz = document.querySelector('.lateral')
  if (!raiz) return
  if (contagens) {
    for (const chave of Object.keys(contagens)) {
      raiz.querySelectorAll(`[data-n="${chave}"]`).forEach(el => { el.textContent = _contador(chave) })
    }
  }
  const chave = ativo || (filtroPedidos ? (filtroPedidos === 'pendentes' ? 'fila' : 'pedidos') : null)
  if (chave) {
    raiz.querySelectorAll('.lateral-item').forEach(a => {
      const on = a.dataset.item === chave
      a.classList.toggle('active', on)
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current')
    })
  }
}

// A tela de pedidos registra aqui como trocar de filtro sem refazer a tela
// (clicar em "Pedidos" ou "Minha fila" estando nela). Limpo a cada troca de tela.
let _trocarFiltroPedidos = null
export function registrarFiltroLateral(fn) {
  _trocarFiltroPedidos = fn
  registrarLimpador(() => { if (_trocarFiltroPedidos === fn) _trocarFiltroPedidos = null })
}

// Listeners de documento: registrados uma vez só (antes cada renderização
// da topbar somava um listener novo de clique no documento)
let _docListeners = false
function _registrarListenersDocumento() {
  if (_docListeners) return
  _docListeners = true

  document.addEventListener('click', e => {
    // "Pular para o conteúdo": leva o foco à área principal da tela
    if (e.target.closest('.link-salto')) {
      e.preventDefault()
      const principal = document.querySelector('main')
      if (principal) { principal.tabIndex = -1; principal.focus() }
      return
    }
    const wrap = document.getElementById('notif-wrap')
    if (_notifPainel && !_notifPainel.contains(e.target) && !wrap?.contains(e.target)) _fecharNotificacoes()
    const menu = document.getElementById('user-menu')
    if (menu?.classList.contains('open') && !menu.contains(e.target) && !e.target.closest('#btn-avatar, #bnav-conta')) {
      _fecharMenuUsuario(false)
    }
  })

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (document.getElementById('user-menu')?.classList.contains('open')) {
      e.stopImmediatePropagation()
      _fecharMenuUsuario(true)
      return
    }
    if (_notifPainel) {
      e.stopImmediatePropagation()
      _fecharNotificacoes()
      document.getElementById('btn-notif')?.focus()
    }
  }, true)

  window.addEventListener('resize', () => {
    _fecharMenuUsuario(false)
    if (_notifPainel) {
      _posicionarNotificacoes()
      _fundoNotificacoes(false)
      _fundoNotificacoes(true)
    }
  })
}

export function initTopbarEvents(_modoConfig = false) {
  _registrarListenersDocumento()

  // Links da barra lateral (marca e itens) — navegação sem recarregar
  document.querySelectorAll('.lateral [data-nav]').forEach(a => {
    a.addEventListener('click', e => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return
      e.preventDefault()
      const tela = a.dataset.nav
      const params = {}
      if (a.dataset.filtro) params.filtro = a.dataset.filtro
      if (a.dataset.aba) params.aba = a.dataset.aba
      const telaAtual = new URLSearchParams(window.location.search).get('tela') || 'pedidos'
      // Já na tela de pedidos: só troca o filtro, sem refazer a tela
      if (tela === 'pedidos' && telaAtual === 'pedidos' && _trocarFiltroPedidos) {
        _trocarFiltroPedidos(params.filtro || 'todos')
        return
      }
      navegar(tela, params)
    })
  })

  document.getElementById('btn-cmd-palette')?.addEventListener('click', () => abrirCommandPalette())

  document.getElementById('btn-avatar')?.addEventListener('click', e => {
    e.stopPropagation()
    _alternarMenuUsuario(e.currentTarget)
  })

  document.getElementById('btn-notif')?.addEventListener('click', e => {
    if (_notifPainel) { _fecharNotificacoes(); return }
    _abrirNotificacoes(e.detail === 0)
  })

  _renderBottomNav()
}

// O painel mora no sino, mas abre pendurado no <body>: assim o position:fixed
// vale para a janela (no celular a faixa do topo tem backdrop-filter, que
// prenderia o painel nela) e ele fica acima do fundo escuro e da barra
// inferior. Ao fechar, volta para o sino (ou some, se a tela já mudou).
let _notifPainel = null
let _notifCasa = null

function _abrirNotificacoes(peloTeclado = false) {
  const dd = document.getElementById('notif-dropdown')
  if (!dd) return
  _fecharMenuUsuario(false)
  _notifCasa = dd.parentElement
  _notifPainel = dd
  document.body.appendChild(dd)
  dd.classList.add('open')
  _posicionarNotificacoes()
  _fundoNotificacoes(true)
  document.getElementById('btn-notif')?.setAttribute('aria-expanded', 'true')
  // Pelo teclado, o foco entra no painel (Tab circula dentro, Esc devolve ao sino)
  if (peloTeclado) {
    dd.tabIndex = -1
    setTimeout(() => (dd.querySelector('button') || dd).focus({ preventScroll: true }), 30)
  }
  if (!dd._prenderTab) {
    dd._prenderTab = true
    dd.addEventListener('keydown', ev => {
      if (ev.key !== 'Tab') return
      const els = [...dd.querySelectorAll('button')]
      if (!els.length) { ev.preventDefault(); return }
      const i = els.indexOf(document.activeElement)
      ev.preventDefault()
      els[ev.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : (i + 1) % els.length].focus()
    })
  }
}

function _fecharNotificacoes() {
  _fundoNotificacoes(false)
  const dd = _notifPainel
  if (!dd) return
  dd.classList.remove('open')
  if (_notifCasa?.isConnected) _notifCasa.appendChild(dd)
  else dd.remove()
  _notifPainel = null
  _notifCasa = null
  document.getElementById('btn-notif')?.setAttribute('aria-expanded', 'false')
}

// Celular: o resto da tela escurece abaixo do painel (a faixa do topo, com o
// sino, continua tocável). Tocar no escuro só fecha o painel.
function _fundoNotificacoes(mostrar) {
  let fundo = document.getElementById('notif-fundo')
  if (!mostrar) { if (fundo) fundo.hidden = true; return }
  if (!window.matchMedia('(max-width: 1023px), (max-width: 1279px) and (pointer: coarse)').matches) return
  if (!fundo) {
    fundo = document.createElement('div')
    fundo.id = 'notif-fundo'
    fundo.className = 'notif-fundo'
    fundo.setAttribute('aria-hidden', 'true')
    document.body.appendChild(fundo)
  }
  const topo = document.getElementById('notif-dropdown')?.style.getPropertyValue('--notif-top')
  if (topo) fundo.style.setProperty('--notif-top', topo)
  fundo.hidden = false
}

// O painel abre preso ao sino. No computador sai da barra lateral para a
// direita, com o fio do alto na altura do sino; no celular desce rente à
// faixa do topo, na largura toda (o CSS cuida das laterais)
function _posicionarNotificacoes() {
  const dd = document.getElementById('notif-dropdown')
  const btn = document.getElementById('btn-notif')
  if (!dd || !btn) return
  const r = btn.getBoundingClientRect()
  const lateral = document.querySelector('.lateral')?.getBoundingClientRect()
  const movel = window.matchMedia('(max-width: 1023px), (max-width: 1279px) and (pointer: coarse)').matches
  if (movel) {
    dd.style.setProperty('--notif-top', `${Math.round(lateral?.bottom ?? r.bottom)}px`)
    dd.style.setProperty('--notif-left', '0px')
    return
  }
  const largura = dd.offsetWidth || 384
  const esquerda = Math.round((lateral?.right ?? r.right) + 10)
  dd.style.setProperty('--notif-top', `${Math.max(8, Math.round(r.top - 2))}px`)
  dd.style.setProperty('--notif-left', `${Math.max(12, Math.min(esquerda, window.innerWidth - largura - 12))}px`)
}

// ── Menu do usuário ───────────────────────────────────────────
// Desktop: menu suspenso preso ao avatar. Celular: folha que sobe de baixo,
// aberta pelo item "Conta" da barra inferior.
// Cabeçalho tipográfico (nome, e-mail e, abaixo de um fio tracejado como o
// pé dos cartões do quadro, o perfil em texto: perfil não tem cor); depois as ações.
function _menuUsuarioHTML() {
  const { usuario } = sessao
  const claro = document.documentElement.classList.contains('light')
  const perfil = usuario.perfil
  return `
    <div class="um-cabecalho">
      <div class="um-nome">${esc(usuario.nome)}</div>
      <div class="um-email">${esc(usuario.email || '')}</div>
      <div class="um-perfil">
        <span class="um-perfil-rotulo">${t('menuPerfil')}</span>
        <span class="um-perfil-valor">${esc(PERFIS_LABEL[perfil] || perfil)}</span>
      </div>
    </div>
    <div class="um-sep" role="separator"></div>
    <button type="button" class="um-item" role="menuitem" data-acao="tema">
      ${claro ? ICO.lua(16) : ICO.sol(16)}
      <span>${claro ? t('menuTemaEscuro') : t('menuTemaClaro')}</span>
    </button>
    ${_acessos(perfil).relatorios ? `
    <button type="button" class="um-item um-so-movel" role="menuitem" data-acao="relatorios">
      ${ICO.barras(16)}
      <span>${t('navRelatorios')}</span>
    </button>` : ''}
    ${_acessos(perfil).config ? `
    <button type="button" class="um-item um-so-movel" role="menuitem" data-acao="admin">
      ${ICO.admin(16)}
      <span>${t('navAdministracao')}</span>
    </button>
    <button type="button" class="um-item" role="menuitem" data-acao="ajustes">
      ${ICO.ajustes(16)}
      <span>${t('navAjustes')}</span>
    </button>` : ''}
    <button type="button" class="um-item um-so-desktop" role="menuitem" data-acao="buscar">
      ${ICO.busca(16)}
      <span>${t('menuAtalhos')}</span>
      <kbd>${_atalhoBusca}</kbd>
    </button>
    <div class="um-sep" role="separator"></div>
    <button type="button" class="um-item um-sair" role="menuitem" data-acao="sair">
      ${ICO.sair(16)}
      <span>${t('navSair')}</span>
    </button>
  `
}

function _garantirMenuUsuario() {
  let menu = document.getElementById('user-menu')
  if (menu) return menu
  const fundo = document.createElement('div')
  fundo.id = 'user-menu-fundo'
  fundo.className = 'user-menu-fundo'
  fundo.addEventListener('click', () => _fecharMenuUsuario(false))
  document.body.appendChild(fundo)

  menu = document.createElement('div')
  menu.id = 'user-menu'
  menu.className = 'user-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', t('tooltipConta'))
  menu.addEventListener('click', _acaoMenuUsuario)
  menu.addEventListener('keydown', e => {
    const itens = [...menu.querySelectorAll('.um-item')].filter(b => b.offsetParent !== null)
    const i = itens.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); itens[(i + 1) % itens.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); itens[(i - 1 + itens.length) % itens.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); itens[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); itens.at(-1)?.focus() }
    else if (e.key === 'Tab') { _fecharMenuUsuario(false) }
  })
  document.body.appendChild(menu)
  return menu
}

let _menuGatilho = null

function _alternarMenuUsuario(gatilho) {
  const menu = document.getElementById('user-menu')
  if (menu?.classList.contains('open')) { _fecharMenuUsuario(true); return }
  _abrirMenuUsuario(gatilho)
}

function _abrirMenuUsuario(gatilho) {
  if (!sessao.usuario) return
  _fecharNotificacoes()
  const menu = _garantirMenuUsuario()
  menu.innerHTML = _menuUsuarioHTML()
  _menuGatilho = gatilho || null

  const movel = window.matchMedia('(max-width: 1023px), (max-width: 1279px) and (pointer: coarse)').matches
  menu.classList.toggle('folha', movel)
  menu.style.top = menu.style.right = menu.style.bottom = menu.style.left = ''
  if (!movel && gatilho) {
    // Aberto pela conta no pé da barra lateral: sobe a partir dela
    const r = gatilho.getBoundingClientRect()
    menu.style.left   = `${Math.round(r.left)}px`
    menu.style.bottom = `${Math.round(window.innerHeight - r.top + 8)}px`
  }
  menu.classList.add('open')
  if (movel && !menu._voltar) menu._voltar = empilharVoltar(() => { menu._voltar = null; _fecharMenuUsuario(false) })
  document.getElementById('user-menu-fundo')?.classList.toggle('open', movel)
  // A folha cobre a barra de baixo: ela sai do alcance do toque e do leitor de tela
  if (movel) document.getElementById('bottom-nav')?.setAttribute('inert', '')
  document.getElementById('btn-avatar')?.setAttribute('aria-expanded', 'true')
  document.getElementById('bnav-conta')?.setAttribute('aria-expanded', 'true')
  setTimeout(() => menu.querySelector('.um-item')?.focus({ preventScroll: true }), 30)
}

function _fecharMenuUsuario(devolverFoco = true) {
  const menu = document.getElementById('user-menu')
  if (!menu?.classList.contains('open')) return
  if (menu._voltar) { desempilharVoltar(menu._voltar); menu._voltar = null }
  menu.classList.remove('open')
  document.getElementById('user-menu-fundo')?.classList.remove('open')
  document.getElementById('bottom-nav')?.removeAttribute('inert')
  document.getElementById('btn-avatar')?.setAttribute('aria-expanded', 'false')
  document.getElementById('bnav-conta')?.setAttribute('aria-expanded', 'false')
  if (devolverFoco && _menuGatilho?.isConnected) _menuGatilho.focus()
  _menuGatilho = null
}

async function _acaoMenuUsuario(e) {
  const item = e.target.closest('.um-item')
  if (!item) return
  const acao = item.dataset.acao
  if (acao === 'tema') {
    const { toggleTheme } = await import('./ui.js')
    toggleTheme()
    // Atualiza o texto do item sem fechar: a troca é visível na hora
    const menu = document.getElementById('user-menu')
    if (menu) {
      menu.innerHTML = _menuUsuarioHTML()
      menu.querySelector('[data-acao="tema"]')?.focus({ preventScroll: true })
    }
    return
  }
  if (acao === 'buscar') {
    _fecharMenuUsuario(false)
    abrirCommandPalette()
    return
  }
  if (acao === 'ajustes') {
    _fecharMenuUsuario(false)
    navegar('config-geral')
    return
  }
  if (acao === 'relatorios' || acao === 'admin') {
    _fecharMenuUsuario(false)
    navegar(acao === 'admin' ? 'config-usuarios' : 'relatorios')
    return
  }
  if (acao === 'sair') {
    _fecharMenuUsuario(false)
    await confirmarSaida()
  }
}

export async function confirmarSaida() {
  const { prxConfirm } = await import('./ui.js')
  const ok = await prxConfirm(t('confirmarSair'), t('confirmarSairMsg'), t('navSair'), t('btnCancelar'))
  if (ok) fazerLogout()
}

// O "+" do celular: pedir uma compra (abre o pedido para cotar e aprovar) ou
// lançar uma compra que já aconteceu (só para rastrear)
export async function escolherNovo() {
  const escolha = await prxEscolha(t('novoOQueFazer'), '', [
    { valor: 'pedir', rotulo: t('novoPedirCompra'), desc: t('novoPedirCompraDesc'), icone: ICO.carrinho(22) },
    { valor: 'lancar', rotulo: t('novoLancarCompra'), desc: t('novoLancarCompraDesc'), icone: ICO.recibo(22) },
  ])
  // A folha de escolha fechou: espera o voltar dela antes de abrir a próxima
  await new Promise(r => quandoHistoricoLivre(r))
  if (escolha === 'pedir') {
    const { abrirNovoPedido } = await import('./pedidos.js')
    abrirNovoPedido()
  } else if (escolha === 'lancar') {
    const { abrirLancamento } = await import('./lancar-compra.js')
    abrirLancamento()
  }
}

// ── Footer ────────────────────────────────────────────────────
export function renderFooter() {
  return `
    <footer class="main-footer">
      <div data-estilo="display:flex;align-items:baseline">
        <span class="pf-afn" data-estilo="font-size:10px">AFN</span>
        <span class="pf-gap"></span>
        <span class="pf-sys" data-estilo="font-size:10px">SYSTEMS</span>
      </div>
      <span class="pf-pipe" data-estilo="font-size:13px">|</span>
      <span class="pf-info" data-estilo="font-size:11px">Praxis</span>
    </footer>
  `
}

// A paleta de comandos, o tour e a faixa da demo (ui.js) navegam pelo estado
registrarNavegacao(navegar)

// Links e botões com data-navegar="tela" (e data-id): navegam sem recarregar.
// Substitui os onclick inline, que a política de segurança (CSP) bloqueia.
document.addEventListener('click', e => {
  const alvo = e.target.closest?.('[data-navegar]')
  if (!alvo || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return
  e.preventDefault()
  navegar(alvo.dataset.navegar, alvo.dataset.id ? { id: alvo.dataset.id } : {})
})

// ── Barra inferior (celular) ──────────────────────────────────
// Pedidos · Minha fila · + (novo) · Buscar · Conta. Relatórios e
// Administração ficam na folha da Conta; o sino, no alto da tela
function _renderBottomNav() {
  const { usuario } = sessao
  if (!usuario) { document.getElementById('bottom-nav')?.remove(); return }

  const params   = new URLSearchParams(window.location.search)
  const tela     = params.get('tela') || 'pedidos'
  const naFila   = tela === 'pedidos' && params.get('filtro') === 'pendentes'
  const ativoPedidos = (tela === 'pedidos' && !naFila) || tela === 'detalhe'

  let nav = document.getElementById('bottom-nav')
  if (!nav) {
    nav = document.createElement('nav')
    nav.id = 'bottom-nav'
    nav.className = 'bottom-nav'
    nav.setAttribute('aria-label', t('navNavegacao'))
    document.body.appendChild(nav)
  }

  // A fila leva a contagem sobre o ícone (a mesma da lateral no computador)
  const item = (chave, ativo, icone, rotulo, contagem = false) => `
    <button type="button" class="bottom-nav-item ${ativo ? 'active' : ''}" data-bnav="${chave}" ${ativo ? 'aria-current="page"' : ''}>
      ${icone}<span>${rotulo}</span>${contagem ? `<span class="bnav-contagem" data-n="${chave}">${_contadorBarra(chave)}</span>` : ''}
    </button>`

  nav.innerHTML = `
    ${item('pedidos', ativoPedidos, ICO.quadro(22), t('navPedidos'))}
    ${item('fila', naFila, ICO.fila(22), t('navMinhaFila'), true)}
    <button type="button" class="bottom-nav-item bnav-novo" id="bnav-novo" aria-haspopup="dialog">
      <span class="bnav-novo-circulo" aria-hidden="true">${ICO.mais(24)}</span><span>${t('navNovo')}</span>
    </button>
    <button type="button" class="bottom-nav-item" id="bnav-buscar" aria-label="${t('tooltipPaleta')}">
      ${ICO.busca(22)}<span>${t('navBuscar')}</span>
    </button>
    <button type="button" class="bottom-nav-item" id="bnav-conta" aria-haspopup="menu" aria-expanded="false" aria-controls="user-menu">
      <span class="bnav-avatar" aria-hidden="true">${esc(gerarIniciais(usuario.nome))}</span><span>${t('navConta')}</span>
    </button>
  `

  nav.querySelectorAll('[data-bnav]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.bnav === 'fila') navegar('pedidos', { filtro: 'pendentes' })
      else navegar(btn.dataset.bnav)
    })
  })
  document.getElementById('bnav-novo')?.addEventListener('click', () => escolherNovo())
  document.getElementById('bnav-buscar')?.addEventListener('click', () => abrirCommandPalette())
  document.getElementById('bnav-conta')?.addEventListener('click', e => {
    e.stopPropagation()
    _alternarMenuUsuario(e.currentTarget)
  })
}
