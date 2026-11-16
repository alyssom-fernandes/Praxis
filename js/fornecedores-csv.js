// Importação de fornecedores por CSV: leitura do arquivo e classificação de
// cada linha contra o cadastro. Sem Firebase nem DOM, para os testes de
// unidade; a tela e a gravação ficam em js/config-cadastros.js.
//
// O arquivo: cabeçalho obrigatório na primeira linha, com a coluna "nome"
// (obrigatória) e "CNPJ" (opcional), separador ";" ou ",", BOM UTF-8 ou não.
// Cada linha vira uma situação:
//   novo        nenhum fornecedor com o mesmo nome nem o mesmo CNPJ
//   completar   já existe pelo nome, sem CNPJ, e a linha traz o CNPJ
//   existente   já existe pelo nome (com o mesmo CNPJ ou sem CNPJ na linha)
//               ou pelo CNPJ: nada muda
//   conflito    o mesmo nome com outro CNPJ (ou com o CNPJ de outro
//               fornecedor): nada é gravado
//   recusada    nome vazio ou longo demais, CNPJ inválido ou linha repetida
// Importar o mesmo arquivo de novo não cria nada: o que foi criado ou
// completado passa a ser "existente".

import { normalizarTexto, cnpjValido, formatCNPJ } from './utils.js'

export const MAX_LINHAS = 1000
export const MAX_NOME   = 100

// Nomes aceitos para cada coluna do cabeçalho (comparados sem acento e caixa)
const COLUNAS = {
  nome: ['nome', 'fornecedor', 'razao social', 'name', 'supplier'],
  cnpj: ['cnpj'],
}

// Bytes do arquivo em texto: UTF-8 (o BOM sai); se não for UTF-8 válido, o
// Windows-1252 dos CSV antigos do Excel
export function decodificarArquivo(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { /* não é UTF-8 */ }
  return new TextDecoder('windows-1252').decode(bytes)
}

// Separador: o que mais aparece na primeira linha, fora de aspas (";" no empate)
function _separador(texto) {
  let pv = 0, vg = 0, aspas = false
  for (const c of texto) {
    if (c === '"') aspas = !aspas
    else if (!aspas && (c === '\n' || c === '\r')) break
    else if (!aspas && c === ';') pv++
    else if (!aspas && c === ',') vg++
  }
  return vg > pv ? ',' : ';'
}

// Registros do CSV (RFC 4180): campos entre aspas podem ter separador, aspas
// dobradas e quebra de linha. Cada registro guarda a linha do arquivo em que
// começa, para o relatório apontar a linha que a pessoa vê no editor.
function _registros(texto, sep) {
  const regs = []
  let campos = [], campo = '', aspas = false, linha = 1, inicio = 1, i = 0
  while (i < texto.length) {
    const c = texto[i]
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 2; continue }
        aspas = false; i++; continue
      }
      if (c === '\n') linha++
      campo += c; i++; continue
    }
    if (c === '"' && campo.trim() === '') { campo = ''; aspas = true; i++; continue }
    if (c === sep) { campos.push(campo); campo = ''; i++; continue }
    if (c === '\r' || c === '\n') {
      campos.push(campo)
      regs.push({ linha: inicio, campos })
      campos = []; campo = ''
      if (c === '\r' && texto[i + 1] === '\n') i++
      i++; linha++; inicio = linha
      continue
    }
    campo += c; i++
  }
  if (aspas) return null
  if (campo !== '' || campos.length) { campos.push(campo); regs.push({ linha: inicio, campos }) }
  return regs
}

// Lê o texto do arquivo. Devolve { linhas: [{ linha, nome, cnpj }], separador }
// ou { erro: chave do dicionário, vars }. Linhas totalmente em branco são
// ignoradas; o teto conta as que sobram.
export function lerCSV(texto) {
  const limpo = String(texto ?? '').replace(/^\uFEFF/, '')
  if (!limpo.trim()) return { erro: 'impErroVazio' }
  const separador = _separador(limpo)
  const regs = _registros(limpo, separador)
  if (!regs) return { erro: 'impErroAspas' }
  const preenchido = r => r.campos.some(c => c.trim() !== '')
  const [cab, ...resto] = regs.filter(preenchido)
  const titulos = cab.campos.map(c => normalizarTexto(c).replace(/\s+/g, ' '))
  const iNome = titulos.findIndex(c => COLUNAS.nome.includes(c))
  const iCnpj = titulos.findIndex(c => COLUNAS.cnpj.includes(c))
  if (iNome < 0) return { erro: 'impErroSemNome' }
  if (!resto.length) return { erro: 'impErroSemLinhas' }
  if (resto.length > MAX_LINHAS) return { erro: 'impErroMuitasLinhas', vars: { max: MAX_LINHAS, n: resto.length } }
  return {
    separador,
    linhas: resto.map(r => ({
      linha: r.linha,
      nome:  (r.campos[iNome] ?? '').trim(),
      cnpj:  iCnpj < 0 ? '' : (r.campos[iCnpj] ?? '').trim(),
    })),
  }
}

const _digitos = v => String(v || '').replace(/\D/g, '')
const _limparNome = v => String(v || '').replace(/\s+/g, ' ').trim()
// Chave de comparação: a mesma do fornecedor criado pela cotação
// (js/pedido-detalhe.js), com os espaços repetidos reduzidos a um
const _chave = v => normalizarTexto(_limparNome(v))
export const nomeDoFornecedor = f => f.nomeExibicao || f.nomeOriginal || f.nome || ''

// Classifica cada linha lida contra os fornecedores cadastrados.
// Devolve [{ linha, nome, cnpj (só dígitos), situacao, motivo, fornecedor }],
// em que motivo = { chave, vars } explica a situação (recusa, conflito ou
// o que já existe) e fornecedor é o cadastro encontrado.
export function classificarFornecedores(linhas, existentes) {
  const porNome = new Map()
  const porCnpj = new Map()
  for (const f of existentes) {
    const k = _chave(nomeDoFornecedor(f))
    if (k && !porNome.has(k)) porNome.set(k, f)
    const d = _digitos(f.cnpj)
    if (d.length === 14 && !porCnpj.has(d)) porCnpj.set(d, f)
  }

  const vistosNome = new Map()
  const vistosCnpj = new Map()
  return linhas.map(l => {
    const nome = _limparNome(l.nome)
    const bruto = String(l.cnpj || '').trim()
    const cnpj = _digitos(bruto)
    const item = (situacao, chave = '', vars = {}, fornecedor = null) =>
      ({ linha: l.linha, nome, cnpj, cnpjInformado: bruto, situacao, motivo: chave ? { chave, vars } : null, fornecedor })

    if (!nome) return item('recusada', 'impMotivoSemNome')
    if (nome.length > MAX_NOME) return item('recusada', 'impMotivoNomeLongo', { max: MAX_NOME })
    // Só dígitos e a pontuação da máscara; vazio vale (o CNPJ é opcional)
    if (/[^\d.\-/\s]/.test(bruto) || !cnpjValido(bruto)) return item('recusada', 'impMotivoCnpj')

    const k = _chave(nome)
    const repetida = vistosNome.get(k) ?? (cnpj ? vistosCnpj.get(cnpj) : undefined)
    if (repetida) return item('recusada', 'impMotivoRepetida', { n: repetida })
    vistosNome.set(k, l.linha)
    if (cnpj) vistosCnpj.set(cnpj, l.linha)

    const mesmoNome = porNome.get(k)
    const mesmoCnpj = cnpj ? porCnpj.get(cnpj) : null
    if (mesmoNome) {
      const atual = _digitos(mesmoNome.cnpj)
      if (cnpj && atual && atual !== cnpj) {
        return item('conflito', 'impMotivoOutroCnpj', { cnpj: formatCNPJ(atual) }, mesmoNome)
      }
      if (cnpj && !atual) {
        if (mesmoCnpj && mesmoCnpj.id !== mesmoNome.id) {
          return item('conflito', 'impMotivoCnpjDeOutro', { nome: nomeDoFornecedor(mesmoCnpj) }, mesmoNome)
        }
        return item('completar', 'impMotivoSemCnpj', {}, mesmoNome)
      }
      return item('existente', 'impMotivoMesmoNome', {}, mesmoNome)
    }
    if (mesmoCnpj) return item('existente', 'impMotivoMesmoCnpj', { nome: nomeDoFornecedor(mesmoCnpj) }, mesmoCnpj)
    return item('novo')
  })
}

// Quantas linhas em cada situação
export function contarSituacoes(itens) {
  const c = { novo: 0, completar: 0, existente: 0, conflito: 0, recusada: 0 }
  for (const i of itens) c[i.situacao] = (c[i.situacao] || 0) + 1
  return c
}
