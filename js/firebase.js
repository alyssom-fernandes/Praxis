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
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js'

const app       = initializeApp(FIREBASE_CONFIG)
const auth      = getAuth(app)
const db        = getFirestore(app)
const storage   = getStorage(app)
const functions = getFunctions(app, 'southamerica-east1')

const _isLocal =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

if (_isLocal && !globalThis.__praxisEmuladoresConectados) {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, 'localhost', 9090)
    connectFunctionsEmulator(functions, 'localhost', 5001)
    connectStorageEmulator(storage, 'localhost', 9199)
    globalThis.__praxisEmuladoresConectados = true
    console.log('🔧 Praxis: conectado aos emuladores locais (Auth, Firestore, Functions, Storage)')
  } catch (e) {
    console.error('Falha ao conectar nos emuladores locais:', e)
  }
}

export {
  app, auth, db, storage, functions,
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
  // Functions
  httpsCallable,
}
