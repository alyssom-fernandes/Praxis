// A prova de presença do técnico (Serviços): a chegada e a saída, pelo QR da
// placa da unidade (o código dela, conferido pelas regras) ou, sem a placa, à
// mão (fica marcado assim para todos). A hora é a do servidor; a localização
// do celular é lida só nesse momento, para mostrar a distância da unidade.
import { db, doc, serverTimestamp } from './firebase.js'
import { sessao } from './estado.js'
import { prxToast, mostrarSpinner, esconderSpinner, exigirConexao } from './ui.js'
import { t } from './constants.js'
import { tf } from './config-comum.js'
import { ST, distanciaM, RAIO_DO_LOCAL_M } from './servicos-regras.js'
import { gravarComEvento } from './modulos-dados.js'

// A localização agora (ou null: negada, sem GPS, demorou)
export function localAgora(timeout = 12000) {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, precisaoM: Math.round(p.coords.accuracy) }),
      () => ok(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 })
  })
}

// A prova da leitura da placa: SHA-256 de "código|ID do chamado", em
// hexadecimal (firestore.rules confere). O código não vai para o chamado
async function _prova(codigo, chamadoId) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${codigo}|${chamadoId}`))
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}

// O relatório escrito antes da leitura do QR de saída (fica no aparelho)
const _chave = id => `praxis_conclusao_${id}`
export function guardarConclusao(id, r) { try { localStorage.setItem(_chave(id), JSON.stringify(r)) } catch { /* sem armazenamento */ } }
export function rascunhoDaConclusao(id) { try { return JSON.parse(localStorage.getItem(_chave(id)) || 'null') } catch { return null } }
function _esquecer(id) { try { localStorage.removeItem(_chave(id)) } catch { /* */ } }

// Registra a chegada (momento 'chegada') ou a saída com a conclusão ('saida')
export async function registrarPresenca(ch, momento, { via, codigo = '', unidade = null } = {}) {
  if (!exigirConexao()) return false
  mostrarSpinner()
  try {
    const local = await localAgora()
    const dist = local && typeof unidade?.lat === 'number' ? distanciaM(unidade.lat, unidade.lng, local.lat, local.lng) : null
    const m = {
      em: serverTimestamp(), via,
      ...(via === 'qr' ? { prova: await _prova(codigo, ch.id) } : {}),
      ...(local ? { lat: local.lat, lng: local.lng, precisaoM: local.precisaoM } : {}),
      ...(dist != null ? { distanciaM: dist } : {}),
    }
    const u = sessao.usuario
    if (momento === 'chegada') {
      await gravarComEvento(doc(db, 'chamados', ch.id), { status: ST.ATENDIMENTO, chegada: m, tecnicoId: u.id, tecnicoNome: u.nome || '' },
        { tipo: 'chegada', texto: via === 'qr' ? t('svViaQr') : t('svViaManual') })
    } else {
      const r = rascunhoDaConclusao(ch.id)
      if (!r?.relatorio) { prxToast(t('svEscrevaOQueFez'), 'warning'); return false }
      await gravarComEvento(doc(db, 'chamados', ch.id), { status: ST.CONCLUIDO, saida: m, relatorio: r.relatorio, pecas: r.pecas || [] },
        { tipo: 'concluido', texto: via === 'qr' ? t('svViaQr') : t('svViaManual') })
      _esquecer(ch.id)
    }
    const longe = dist != null && dist > RAIO_DO_LOCAL_M
    prxToast(momento === 'chegada'
      ? (longe ? tf('svChegadaLonge', { m: dist }) : t('svChegadaOk'))
      : t('svConcluidoOk'), longe ? 'warning' : 'success', 6000)
    return true
  } catch (e) {
    console.error(e)
    prxToast(e?.code === 'permission-denied' ? t('svPlacaNaoConfere') : t('erroSalvar'), 'error')
    return false
  } finally {
    esconderSpinner()
  }
}

// Leitor de QR dentro do app, onde o navegador tem o detector de códigos (o
// Chrome do Android). No iPhone, a câmera do próprio celular lê a placa e abre
// o Praxis (js/qr-tela.js). Devolve o texto lido ou null
export const temLeitorQr = () => typeof window.BarcodeDetector === 'function' && !!navigator.mediaDevices?.getUserMedia
export async function lerQrNoApp() {
  if (!temLeitorQr()) return null
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  } catch {
    prxToast(t('svCameraNegada'), 'warning')
    return null
  }
  const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
  const tela = document.createElement('div')
  tela.className = 'sv-leitor'
  tela.setAttribute('role', 'dialog')
  tela.setAttribute('aria-label', t('svLerQr'))
  tela.innerHTML = `<video playsinline muted></video><span class="sv-leitor-mira" aria-hidden="true"></span>
    <p class="sv-leitor-txt">${t('svApontePlaca')}</p><button type="button" class="btn-secondary sv-leitor-fechar">${t('btnCancelar')}</button>`
  document.body.appendChild(tela)
  const video = tela.querySelector('video')
  video.srcObject = stream
  await video.play().catch(() => {})
  return new Promise(fim => {
    let ativo = true
    const parar = valor => {
      ativo = false
      stream.getTracks().forEach(tr => tr.stop())
      tela.remove()
      fim(valor)
    }
    tela.querySelector('.sv-leitor-fechar').addEventListener('click', () => parar(null))
    const procurar = async () => {
      if (!ativo) return
      try {
        const codigos = await detector.detect(video)
        if (codigos[0]?.rawValue) return parar(codigos[0].rawValue)
      } catch { /* quadro ainda sem imagem */ }
      setTimeout(procurar, 250)
    }
    procurar()
  })
}
