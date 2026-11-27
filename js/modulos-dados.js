// Acesso aos dados de Serviços, Equipamentos e Unidades (27/11/2026): as
// consultas com os filtros que as regras exigem (a empresa da pessoa ou, do
// prestador, a prestadora; na demo, isDemo), os números (CH-0001, AC-0001) e a
// gravação de cada mudança com a sua entrada no histórico, no mesmo lote
// (firestore.rules: eventoNovo).
import {
  auth, db, collection, doc, query, where, writeBatch, serverTimestamp, increment, runTransaction, getDoc,
  consulta, eContaDemo, marcaDemo,
} from './firebase.js'
import { sessao } from './estado.js'
import { empresasDoUsuario } from './utils.js'
import { ePrestador } from './modulos.js'

// IDs novos: na demo, com o prefixo da área da demonstração
export function novoId(colecao) {
  const id = doc(collection(db, colecao)).id
  return eContaDemo() ? `demo-${id}` : id
}

// Coleção filtrada pela empresa da pessoa (o supremo vê todas). Na demo vale o
// mesmo para a pessoa escolhida; consulta() junta o filtro da área da demo
function _porEmpresa(colecao, ...extra) {
  const u = sessao.usuario
  const ref = collection(db, colecao)
  const empresas = empresasDoUsuario(u)
  if (u?.perfil === 'supremo' || (eContaDemo() && !empresas.length)) return consulta(ref, ...extra)
  return consulta(ref, where('empresaId', 'in', empresas.slice(0, 30)), ...extra)
}
export const consultaUnidades = (...extra) => _porEmpresa('unidades', ...extra)
export const consultaEquipamentos = (...extra) => _porEmpresa('equipamentos', ...extra)
export const consultaContagens = (...extra) => _porEmpresa('contagens', ...extra)
// Chamados: o prestador vê os da prestadora dele; a gente da empresa, os das empresas
export function consultaChamados(...extra) {
  const u = sessao.usuario
  if (ePrestador(u)) {
    if (eContaDemo()) return consulta(collection(db, 'chamados'), where('fornecedorId', '==', u.fornecedorId), ...extra)
    return query(collection(db, 'chamados'), where('fornecedorId', '==', u.fornecedorId), ...extra)
  }
  return _porEmpresa('chamados', ...extra)
}

// ── Números ────────────────────────────────────────────────────────
// CH-0001: o contador sobe 1 no mesmo lote em que o chamado nasce. Fica numa
// transação (como o número dos pedidos), que pede internet
export async function proximoNumeroChamado() {
  const ref = eContaDemo() ? doc(db, '_meta', 'contadoresDemo') : doc(db, '_meta', 'contadorChamados')
  return runTransaction(db, async tx => {
    const s = await tx.get(ref)
    const campo = eContaDemo() ? 'chamados' : 'total'
    const n = (s.exists() ? s.data()[campo] || 0 : 0) + 1
    if (s.exists()) tx.update(ref, { [campo]: n })
    else tx.set(ref, { [campo]: n })
    return n
  })
}
// Etiqueta: o número do prefixo vai no mesmo lote do equipamento (as regras
// conferem: o contador do prefixo sobe 1 e a etiqueta é esse número)
export async function proximoNumeroEtiqueta(prefixo) {
  if (eContaDemo()) {
    const ref = doc(db, '_meta', 'contadoresDemo')
    const s = await getDoc(ref)
    return { n: (s.exists() ? s.data()[`equip_${prefixo}`] || 0 : 0) + 1, ref, campo: `equip_${prefixo}` }
  }
  const ref = doc(db, '_meta', `contadorEquip-${prefixo}`)
  const s = await getDoc(ref)
  return { n: (s.exists() ? s.data().total || 0 : 0) + 1, ref, campo: 'total' }
}

// ── Gravação com o histórico ──────────────────────────────────────
// `ref`: o documento; `dados`: o que muda (ou o documento inteiro, ao criar);
// `evento`: o que entra no histórico (tipo, texto…); `extra(lote)`: o resto do
// mesmo lote (contador, custo do aparelho…). Devolve o ID da entrada
export async function gravarComEvento(ref, dados, evento, { criar = false, extra = null } = {}) {
  const lote = writeBatch(db)
  const evRef = doc(collection(ref, 'historico'))
  const agora = serverTimestamp()
  const autor = { autorId: auth.currentUser?.uid || '', autorNome: sessao.usuario?.nome || '' }
  if (criar) lote.set(ref, { ...dados, ...marcaDemo(), criadoEm: agora, atualizadoEm: agora, ultimoEventoId: evRef.id })
  else lote.update(ref, { ...dados, atualizadoEm: agora, ultimoEventoId: evRef.id })
  lote.set(evRef, { ...autor, criadoEm: agora, ...evento, ...marcaDemo() })
  if (extra) extra(lote, agora)
  await lote.commit()
  return evRef.id
}

// O último instante de uma data (janela da visita, garantia…), em ms
export const fimDoDiaMs = iso => Date.parse(`${iso}T23:59:59.999-03:00`)
export const msDe = v => (v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : typeof v === 'number' ? v : null)
export { serverTimestamp, increment }
