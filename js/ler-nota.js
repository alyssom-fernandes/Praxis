// Ler a chave da nota pela câmera: um botão ao lado do campo da nota abre a
// câmera (ou a galeria, no computador) e lê o QR Code da NFC-e na foto. Usa
// o leitor nativo do navegador quando existe (Android) e, nos outros, o
// jsQR servido pelo próprio site (vendor/), carregado só neste momento.
import { carregarBiblioteca, prxToast } from './ui.js'
import { t } from './constants.js'
import { chaveDoQr, conferirNota } from './nota.js'

const ICO_QR = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M21 14v7h-4M14 21v-3"/></svg>'

// Põe o botão de ler o QR ao lado do campo e o aviso de chave errada embaixo
export function prepararCampoNota(input) {
  if (!input || input._notaPronta) return
  input._notaPronta = true
  const linha = document.createElement('div')
  linha.className = 'nota-linha'
  input.replaceWith(linha)
  linha.appendChild(input)
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.className = 'btn-secondary nota-ler'
  botao.innerHTML = `${ICO_QR}<span>${t('notaLerQr')}</span>`
  botao.setAttribute('aria-label', t('notaLerQrDica'))
  linha.appendChild(botao)
  const arquivo = document.createElement('input')
  arquivo.type = 'file'
  arquivo.accept = 'image/*'
  arquivo.setAttribute('capture', 'environment')
  arquivo.className = 'sr-only'
  arquivo.tabIndex = -1
  arquivo.setAttribute('aria-hidden', 'true')
  linha.appendChild(arquivo)
  const aviso = document.createElement('div')
  aviso.className = 'form-hint nota-aviso'
  aviso.setAttribute('aria-live', 'polite')
  linha.after(aviso)

  const conferir = () => {
    const r = conferirNota(input.value)
    aviso.textContent = r === 'digito' ? t('notaDigitoErrado') : r === 'tamanho' ? t('notaTamanhoErrado') : r === 'chave' ? t('notaChaveOk') : ''
    aviso.classList.toggle('erro', r === 'digito' || r === 'tamanho')
  }
  input.addEventListener('input', conferir)
  input.addEventListener('change', conferir)
  botao.addEventListener('click', () => arquivo.click())
  arquivo.addEventListener('change', async () => {
    const foto = arquivo.files?.[0]
    arquivo.value = ''
    if (!foto) return
    botao.disabled = true
    try {
      const chave = await _lerChave(foto)
      if (chave) {
        input.value = chave
        input.dispatchEvent(new Event('input', { bubbles: true }))
        prxToast(t('notaQrLido'), 'success')
      } else prxToast(t('notaQrNaoLido'), 'warning')
    } catch (err) {
      console.warn('QR da nota:', err)
      prxToast(t('notaQrNaoLido'), 'warning')
    } finally {
      botao.disabled = false
    }
  })
}

async function _lerChave(foto) {
  const imagem = await createImageBitmap(foto)
  // Leitor nativo (Android): QR Code e o código de barras do DANFE
  if (window.BarcodeDetector) {
    try {
      const leitor = new window.BarcodeDetector({ formats: ['qr_code', 'code_128'] })
      for (const c of await leitor.detect(imagem)) {
        const chave = chaveDoQr(c.rawValue)
        if (chave) return chave
      }
    } catch { /* cai no jsQR */ }
  }
  // jsQR: a foto reduzida a até 1600 px no lado maior (mais rápido e lê igual)
  const jsQR = await carregarBiblioteca('jsqr')
  const escala = Math.min(1, 1600 / Math.max(imagem.width, imagem.height))
  const w = Math.round(imagem.width * escala), h = Math.round(imagem.height * escala)
  const tela = document.createElement('canvas')
  tela.width = w; tela.height = h
  const ctx = tela.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(imagem, 0, 0, w, h)
  const dados = ctx.getImageData(0, 0, w, h)
  const lido = jsQR(dados.data, w, h, { inversionAttempts: 'attemptBoth' })
  return lido ? chaveDoQr(lido.data) : null
}
