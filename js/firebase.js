import { FIREBASE_CONFIG } from './config.js'
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import {
  getAuth,
  connectAuthEmulator,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
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
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
import {
  getStorage,
  connectStorageEmulator,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js'
// O SDK de Cloud Functions não é importado: o app não chama nenhuma função
// (as Functions reagem sozinhas a gravações no Firestore). Era um download a
// mais em toda visita.

const app       = initializeApp(FIREBASE_CONFIG)
const auth      = getAuth(app)
const db        = getFirestore(app)
const storage   = getStorage(app)

const _isLocal =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

if (_isLocal && !globalThis.__praxisEmuladoresConectados) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, 'localhost', 9090)
    connectStorageEmulator(storage, 'localhost', 9199)
    globalThis.__praxisEmuladoresConectados = true
    console.log('🔧 Praxis: conectado aos emuladores locais (Auth, Firestore, Storage)')
  } catch (e) {
    console.error('Falha ao conectar nos emuladores locais:', e)
  }
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
  const raw = usuario?.empresas
  const empresas = Array.isArray(raw) ? raw : Object.keys(raw || {})
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

// Contador dos números de pedido (PRX-0001…)
function contadorPedidosRef() {
  return doc(db, '_meta', eContaDemo() ? 'contadoresDemo' : 'contadores')
}

export {
  app, auth, db, storage,
  // Área da demonstração
  eContaDemo, consulta, consultaUsuarios, marcaDemo, novoPedidoRef, contadorPedidosRef,
  // Auth
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  // Firestore
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, runTransaction,
  serverTimestamp, Timestamp, writeBatch,
  // Storage
  storageRef, uploadBytes, getDownloadURL, deleteObject,
}
