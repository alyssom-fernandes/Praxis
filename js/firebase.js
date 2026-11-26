import { FIREBASE_CONFIG, FIREBASE_CONFIG_DEMO } from './config.js'
import { empresasDoUsuario, marcaProjetoDemo } from './utils.js'
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  terminate,
  clearIndexedDbPersistence,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
  increment,
} from 'https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js'
// O SDK do Storage não entra na primeira visita: só anexos, cotações com
// arquivo e comprovantes usam (armazenamento(), abaixo).
// O SDK de Cloud Functions não é importado: o app não chama nenhuma função
// (as Functions reagem sozinhas a gravações no Firestore). Era um download a
// mais em toda visita.

// A demonstração pública usa o projeto dela quando há um (ver
// marcaProjetoDemo, em js/utils.js). Sem FIREBASE_CONFIG_DEMO (emuladores,
// testes), a demo fica no mesmo projeto, separada pelas regras
const naProjetoDemo = !!FIREBASE_CONFIG_DEMO && marcaProjetoDemo()
const app       = initializeApp(naProjetoDemo ? FIREBASE_CONFIG_DEMO : FIREBASE_CONFIG)
// Login só por e-mail e senha: sem o resolvedor de janela (popup/redirect)
// que o getAuth() traz, o SDK não tenta carregar o script de apis.google.com,
// que a política de segurança do site bloqueia. A sessão fica guardada como
// no getAuth() (IndexedDB, depois localStorage e sessionStorage)
const auth      = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
})
// Cópia local do Firestore (IndexedDB): o que já foi visto abre sem esperar
// a rede e continua legível sem internet; as abas dividem a mesma cópia.
// Sem IndexedDB (aba anônima de alguns navegadores), o SDK fica só na
// memória, como antes. Sair apaga a cópia (apagarCopiaLocal)
const db        = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
})
// Local: localhost, 127.0.0.1 e *.localhost (os testes usam praxis.localhost,
// onde o service worker registra; ver tests/celular.test.mjs)
const _isLocal =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.localhost'))

if (_isLocal && !globalThis.__praxisEmuladoresConectados) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, 'localhost', 9090)
    globalThis.__praxisEmuladoresConectados = true
    console.log('🔧 Praxis: conectado aos emuladores locais (Auth, Firestore; Storage no primeiro envio)')
  } catch (e) {
    console.error('Falha ao conectar nos emuladores locais:', e)
  }
}

// ── Storage sob demanda ───────────────────────────────────────
// Carregado no primeiro envio ou remoção de arquivo. O integrity continua
// valendo: um modulepreload posto na hora confere o arquivo do gstatic com o
// do npm (tests/unidade.test.mjs), e o import() reaproveita o módulo já
// conferido. Se a conferência falhar, nada é carregado
const SDK_STORAGE = 'https://www.gstatic.com/firebasejs/13.3.0/firebase-storage.js'
const SRI_STORAGE = 'sha384-XI/vZ0ZW0hYp5K15yEQUhMAyUpTh4R4f132KKsjw8UlKc1Fqe74pLpd8xQQVFysw'
let _armazenamento = null
function armazenamento() {
  if (!_armazenamento) {
    _armazenamento = (async () => {
      await new Promise((ok, erro) => {
        const link = document.createElement('link')
        link.rel = 'modulepreload'
        link.href = SDK_STORAGE
        link.integrity = SRI_STORAGE
        link.crossOrigin = 'anonymous'
        link.onload = ok
        link.onerror = () => erro(new Error('Não foi possível carregar o envio de arquivos.'))
        document.head.appendChild(link)
      })
      const sdk = await import(SDK_STORAGE)
      const storage = sdk.getStorage(app)
      if (_isLocal) sdk.connectStorageEmulator(storage, 'localhost', 9199)
      return {
        ref: caminho => sdk.ref(storage, caminho),
        uploadBytes: sdk.uploadBytes, getDownloadURL: sdk.getDownloadURL, deleteObject: sdk.deleteObject,
      }
    })().catch(err => { _armazenamento = null; throw err })
  }
  return _armazenamento
}

// ── Área da demonstração ──────────────────────────────────────
// A conta demo pública tem um perfil próprio nas regras (firestore.rules):
// ela só lê documentos marcados com isDemo == true (toda consulta precisa
// desse filtro) e só grava pedidos com ID "demo-…", marcados, numerados por
// um contador separado. Fora da demo, estas funções não mudam nada.
const EMAIL_DEMO = 'demo@praxis.app'

function eContaDemo() {
  return auth.currentUser?.email === EMAIL_DEMO
}

// Consulta a uma coleção, com o filtro da demo quando é a conta demo
function consulta(ref, ...restricoes) {
  if (eContaDemo()) return query(ref, where('isDemo', '==', true), ...restricoes)
  return restricoes.length ? query(ref, ...restricoes) : ref
}

// Usuários que a pessoa pode listar: o gestor só lista os das empresas dele
// (as regras exigem esse filtro); o supremo e a conta demo, sem ele
function consultaUsuarios(usuario) {
  const ref = collection(db, 'usuarios')
  if (eContaDemo() || usuario?.perfil === 'supremo') return consulta(ref)
  const empresas = empresasDoUsuario(usuario)
  return empresas.length ? query(ref, where('empresas', 'array-contains-any', empresas.slice(0, 30))) : ref
}

// Campos que marcam um documento novo como da demo
function marcaDemo() {
  return eContaDemo() ? { isDemo: true } : {}
}

// Referência para um pedido novo (na demo, com o ID na área da demo)
function novoPedidoRef() {
  const ref = doc(collection(db, 'pedidos'))
  return eContaDemo() ? doc(db, 'pedidos', `demo-${ref.id}`) : ref
}

// Apaga a cópia local dos dados, para quem usar o aparelho depois não ver os
// pedidos de quem saiu (celular compartilhado no posto). Encerra o banco:
// depois disso ele não serve mais nesta página, e quem chama recarrega. Com
// outra aba do Praxis aberta, a cópia continua em uso e não é apagada
async function apagarCopiaLocal() {
  esquecerMemorias()
  try {
    await terminate(db)
    await clearIndexedDbPersistence(db)
  } catch (e) {
    console.warn('Cópia local do Firestore não apagada:', e?.code || e?.message || e)
  }
}

// Leitura rápida para abrir uma tela: com a cópia local já preenchida, usa
// ela na hora e busca a do servidor em seguida (mantém a cópia em dia e entrega
// o resultado a aoAtualizar, se houver). Sem cópia, espera o servidor. Para
// listas que mudam pouco (empresas, categorias, usuários). Com as idas ao
// servidor fora do caminho, reabrir até o quadro caiu de 4,8 s para 3,0 s no
// celular simulado (4G lento, CPU 4x; scripts/medir-desempenho.mjs)
// memoria: chave de uma cópia pequena no próprio navegador (localStorage),
// lida sem esperar o Firestore abrir a cópia dele; sai junto com a sessão
// (esquecerMemorias). Só para listas curtas: empresas e categorias
const _PREFIXO_MEMORIA = 'praxis_memo_'
function _guardarMemoria(chave, snap) {
  try { localStorage.setItem(_PREFIXO_MEMORIA + chave, JSON.stringify(snap.docs.map(d => [d.id, d.data()]))) } catch { /* cheio ou bloqueado */ }
}
function _lerMemoria(chave) {
  try {
    const lista = JSON.parse(localStorage.getItem(_PREFIXO_MEMORIA + chave) || 'null')
    if (!Array.isArray(lista) || !lista.length) return null
    return { empty: false, size: lista.length, docs: lista.map(([id, dados]) => ({ id, data: () => dados })) }
  } catch { return null }
}
function esquecerMemorias() {
  try { Object.keys(localStorage).filter(k => k.startsWith(_PREFIXO_MEMORIA)).forEach(k => localStorage.removeItem(k)) } catch { /* bloqueado */ }
}

async function lerRapido(consultaOuRef, aoAtualizar, memoria) {
  const doServidor = () => getDocs(consultaOuRef).then(s => {
    if (memoria) { _guardarMemoria(memoria, s); _lidoNoServidor.set(memoria, Date.now()) }
    return s
  })
  const guardado = memoria ? _lerMemoria(memoria) : null
  if (guardado) {
    // Lida no servidor há pouco (lerCadastro, abaixo): a cópia já está em dia
    if (!_cadastroEmDia(memoria)) doServidor().then(s => aoAtualizar?.(s)).catch(() => {})
    return guardado
  }
  try {
    const local = await getDocsFromCache(consultaOuRef)
    if (!local.empty) {
      doServidor().then(s => aoAtualizar?.(s)).catch(() => {})
      return local
    }
  } catch { /* sem cópia local */ }
  return doServidor()
}

// Cadastros (empresas, categorias, fornecedores, usuários) mudam pouco e eram
// relidos inteiros a cada pedido aberto: com 200 fornecedores, 200 leituras
// por abertura. Agora vão ao servidor no máximo uma vez a cada 10 minutos por
// visita; no intervalo, vêm da cópia local do Firestore. O que a própria
// pessoa grava entra na cópia na hora; o que outra pessoa grava aparece em
// até 10 minutos (ou ao recarregar a página)
const _VALIDADE_CADASTRO = 10 * 60 * 1000
const _lidoNoServidor = new Map()
const _cadastroEmDia = nome => Date.now() - (_lidoNoServidor.get(nome) || 0) < _VALIDADE_CADASTRO
async function lerCadastro(nome, consultaOuRef) {
  if (_cadastroEmDia(nome)) {
    try { return await getDocsFromCache(consultaOuRef) } catch { /* sem cópia: vai ao servidor */ }
  }
  const snap = await getDocs(consultaOuRef)
  _lidoNoServidor.set(nome, Date.now())
  return snap
}

// Contador dos números de pedido (PRX-0001…)
function contadorPedidosRef() {
  return doc(db, '_meta', eContaDemo() ? 'contadoresDemo' : 'contadores')
}

export {
  app, auth, db, naProjetoDemo,
  // Área da demonstração
  eContaDemo, consulta, consultaUsuarios, marcaDemo, novoPedidoRef, contadorPedidosRef,
  apagarCopiaLocal, lerRapido, lerCadastro, esquecerMemorias,
  // Auth
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  sendPasswordResetEmail,
  // Firestore
  collection, doc, getDoc, getDocFromCache, getDocFromServer, getDocs, getDocsFromCache, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction,
  serverTimestamp, Timestamp, writeBatch, increment,
  // Storage (sob demanda)
  armazenamento,
}
