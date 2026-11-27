// Fotos dos chamados (Serviços): tiradas pela câmera do celular (o campo de
// arquivo com capture), reduzidas no aparelho (até 1.600 px, JPEG) e com a
// faixa que grava na própria foto a data, a hora, a unidade, o número do
// chamado e quem tirou. Vão para o Storage (chamados/{id}/fotos/{fotoId}.jpg)
// e ganham o registro em /chamados/{id}/fotos, que as regras conferem. Não se
// apagam: são a prova do atendimento.
import { auth, db, doc, collection, setDoc, serverTimestamp, armazenamento, marcaDemo } from './firebase.js'
import { sessao } from './estado.js'
import { DEMO_ENVIA_ARQUIVOS } from './constants.js'

const _MAX = 1600

function _carregarImagem(arquivo) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); ok(img) }
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('imagem')) }
    img.src = url
  })
}

// A foto reduzida, com a faixa de baixo (as linhas de `marca`)
export async function prepararFoto(arquivo, marca = []) {
  const img = await _carregarImagem(arquivo)
  const escala = Math.min(1, _MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * escala), h = Math.round(img.naturalHeight * escala)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0, w, h)
  const fonte = Math.max(14, Math.round(w / 45))
  const faixa = Math.round(fonte * 1.5 * marca.length + fonte)
  g.fillStyle = 'rgba(0, 0, 0, 0.62)'
  g.fillRect(0, h - faixa, w, faixa)
  g.fillStyle = '#FFFFFF'
  marca.forEach((linha, i) => {
    g.font = `${i === 0 ? 600 : 400} ${fonte}px system-ui, -apple-system, 'Segoe UI', sans-serif`
    g.fillText(linha, Math.round(fonte * 0.8), h - faixa + Math.round(fonte * 1.4 * (i + 1)))
  })
  return new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.82))
}

// Envia a foto e grava o registro. `tipo`: 'antes' | 'depois' | 'abertura'
export async function enviarFotoDoChamado(chamado, tipo, blob, local = null) {
  if (sessao.isDemo && !DEMO_ENVIA_ARQUIVOS) {
    const e = new Error('demo sem arquivos')
    e.code = 'praxis/demo-sem-arquivos'
    throw e
  }
  const chRef = doc(db, 'chamados', chamado.id)
  const fotoRef = doc(collection(chRef, 'fotos'))
  const caminho = `chamados/${chamado.id}/fotos/${fotoRef.id}.jpg`
  const st = await armazenamento()
  await st.uploadBytes(st.ref(caminho), blob, { contentType: 'image/jpeg', customMetadata: { autorUid: auth.currentUser?.uid || '' } })
  await setDoc(fotoRef, {
    tipo, storagePath: caminho, tamanho: blob.size,
    autorId: auth.currentUser?.uid || '', autorNome: sessao.usuario?.nome || '',
    criadoEm: serverTimestamp(),
    ...(local ? { lat: local.lat, lng: local.lng } : {}),
    ...marcaDemo(),
  })
  return fotoRef.id
}

const _urls = new Map()
export async function urlDaFoto(caminho) {
  if (!_urls.has(caminho)) {
    const st = await armazenamento()
    _urls.set(caminho, st.getDownloadURL(st.ref(caminho)).catch(e => { _urls.delete(caminho); throw e }))
  }
  return _urls.get(caminho)
}
