// Nota fiscal: a chave de acesso (44 dígitos) e o que vem do QR Code da
// NFC-e. Sem DOM: os formulários (js/ler-nota.js, a compra, a compra já feita)
// e os testes usam as mesmas funções.

// Dígito verificador da chave (módulo 11, pesos 2 a 9 da direita para a
// esquerda; resto 0 ou 1 dá 0), como no Manual de Orientação do Contribuinte
export function digitoDaChave(chave43) {
  let soma = 0, peso = 2
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

// O que foi digitado no campo da nota: vazio, número (até 20 dígitos ou com
// letras, como "NF 1234"), chave válida, chave com o dígito errado ou com o
// tamanho errado (mais de 20 dígitos e diferente de 44)
export function conferirNota(texto) {
  const t = String(texto || '').trim()
  if (!t) return 'vazia'
  const digitos = t.replace(/[\s.\-/]/g, '')
  if (!/^\d+$/.test(digitos) || digitos.length <= 20) return 'numero'
  if (digitos.length !== 44) return 'tamanho'
  return digitoDaChave(digitos.slice(0, 43)) === Number(digitos[43]) ? 'chave' : 'digito'
}

// Chave de 44 dígitos em blocos de 4, como no DANFE (o resto fica como veio)
export function formatarNota(texto) {
  const digitos = String(texto || '').replace(/\s/g, '')
  return /^\d{44}$/.test(digitos) ? digitos.match(/.{4}/g).join(' ') : texto
}

// A chave dentro do conteúdo do QR Code: a URL da Sefaz traz a chave no
// parâmetro "p" (chave|versão|ambiente|...) ou em "chNFe"; em último caso,
// a primeira sequência de 44 dígitos com o dígito certo
export function chaveDoQr(conteudo) {
  const t = String(conteudo || '')
  const candidatos = []
  try {
    const url = new URL(t)
    const p = url.searchParams.get('p') || url.searchParams.get('chNFe') || ''
    candidatos.push(p.split('|')[0])
  } catch { /* não é URL */ }
  candidatos.push(...(t.match(/\d{44}/g) || []))
  return candidatos.find(c => /^\d{44}$/.test(c) && conferirNota(c) === 'chave') || null
}
