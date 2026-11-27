// Acesso por módulo (27/11/2026). O Praxis tem três módulos: Compras, Serviços
// e Equipamentos, e cada pessoa tem um papel em cada um, ou nenhum.
//   - `perfil` continua sendo o papel em Compras (supremo, gestor, aprovador,
//     comprador, financeiro, solicitante), com dois valores a mais: 'nenhum'
//     (pessoa da empresa sem Compras) e 'prestador' (técnico ou conta de uma
//     empresa prestadora, de fora: só Serviços, só os chamados da prestadora).
//   - `servicos`: 'solicitante' | 'financeiro' | 'gestor' (ou ausente)
//   - `equipamentos`: 'consulta' | 'responsavel' | 'gestor' (ou ausente)
// O supremo tem todos os módulos, no papel mais alto. As regras do Firestore
// conferem o mesmo (firestore.rules: papelServicos, papelEquip). Sem Firebase
// nem DOM: testado em tests/unidade.test.mjs.

export const MODULOS = { COMPRAS: 'compras', SERVICOS: 'servicos', EQUIPAMENTOS: 'equipamentos' }

export const PERFIL_NENHUM = 'nenhum'
export const PERFIL_PRESTADOR = 'prestador'
export const PERFIS_COMPRAS = ['supremo', 'gestor', 'aprovador', 'comprador', 'financeiro', 'solicitante']

export const PAPEIS_SERVICOS = ['solicitante', 'financeiro', 'gestor']
export const PAPEIS_EQUIP = ['consulta', 'responsavel', 'gestor']
export const PAPEL_PRESTADOR = 'prestador'

const _ativo = u => !!u && u.ativo !== false

export function ePrestador(u) { return _ativo(u) && u.perfil === PERFIL_PRESTADOR }
export function eSupremo(u) { return _ativo(u) && u.perfil === 'supremo' }

// O papel da pessoa em cada módulo (null: sem acesso)
export function papelCompras(u) {
  return _ativo(u) && PERFIS_COMPRAS.includes(u.perfil) ? u.perfil : null
}
export function papelServicos(u) {
  if (!_ativo(u)) return null
  if (u.perfil === 'supremo') return 'gestor'
  if (u.perfil === PERFIL_PRESTADOR) return u.fornecedorId ? PAPEL_PRESTADOR : null
  return PAPEIS_SERVICOS.includes(u.servicos) ? u.servicos : null
}
export function papelEquip(u) {
  if (!_ativo(u)) return null
  if (u.perfil === 'supremo') return 'gestor'
  if (u.perfil === PERFIL_PRESTADOR) return null
  return PAPEIS_EQUIP.includes(u.equipamentos) ? u.equipamentos : null
}

export function papelNoModulo(u, modulo) {
  return modulo === MODULOS.COMPRAS ? papelCompras(u)
    : modulo === MODULOS.SERVICOS ? papelServicos(u)
      : modulo === MODULOS.EQUIPAMENTOS ? papelEquip(u) : null
}

// Os módulos a que a pessoa tem acesso, na ordem da navegação
export function modulosDe(u) {
  return Object.values(MODULOS).filter(m => papelNoModulo(u, m))
}
export function temAlgumModulo(u) { return modulosDe(u).length > 0 }

// As telas de cada módulo (o roteamento em js/app.js barra as outras)
export const TELAS_DO_MODULO = {
  [MODULOS.COMPRAS]: ['pedidos', 'detalhe', 'relatorios'],
  [MODULOS.SERVICOS]: ['servicos', 'chamado', 'qr', 'conferencia', 'prestadora'],
  [MODULOS.EQUIPAMENTOS]: ['equipamentos', 'equipamento', 'contagem'],
}
export function moduloDaTela(tela) {
  return Object.keys(TELAS_DO_MODULO).find(m => TELAS_DO_MODULO[m].includes(tela)) || null
}

// A primeira tela depois de entrar: a do primeiro módulo da pessoa
export function telaInicial(u) {
  const m = modulosDe(u)[0]
  return m === MODULOS.SERVICOS ? 'servicos' : m === MODULOS.EQUIPAMENTOS ? 'equipamentos' : 'pedidos'
}

// Quem administra (usuários, empresas, cadastros): o gestor e o supremo de
// Compras, como hoje. As unidades também ficam com o gestor de Serviços e o de
// Equipamentos, que precisam delas
export function administra(u) { return ['supremo', 'gestor'].includes(papelCompras(u)) }
export function cuidaDasUnidades(u) {
  return administra(u) || papelServicos(u) === 'gestor' || papelEquip(u) === 'gestor'
}
// A conta da empresa prestadora cria os técnicos dela
export function adminDaPrestadora(u) { return ePrestador(u) && u.prestadorAdmin === true }
