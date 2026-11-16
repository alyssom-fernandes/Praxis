// Auditoria administrativa: quem mudou usuário, perfil, convite, empresa,
// categoria e fornecedor (pelo cadastro), e quando.
//
// Cada mudança vai num lote com o seu registro em /auditoria. As regras
// (firestore.rules, "auditada") recusam a mudança sem um registro novo que
// aponte para ela, assinado por quem grava e com a hora do servidor; o
// registro não muda nem some. Ao criar e editar, o documento leva auditoriaId;
// ao apagar, o registro tem ID fixo (apagou-{entidade}-{id}-{auditoriaId}).
//
// O registro guarda só o que mudou (antes e depois) e as empresas que a
// mudança toca, para o gestor ler o que é das empresas dele.

import { auth, db, doc, collection, writeBatch, serverTimestamp, eContaDemo } from './firebase.js'
import { sessao } from './estado.js'

export const ENTIDADES = { usuarios: 'usuario', convites: 'convite', empresas: 'empresa', categorias: 'categoria', fornecedores: 'fornecedor' }

// Campos que não contam como mudança: datas de controle e a própria ligação
const _IGNORADOS = new Set(['auditoriaId', 'atualizadoEm', 'criadoEm', 'criadaEm', 'ultimoAcesso', 'criadoPor', 'criadoPorNome', 'isDemo'])

// Valor que cabe no registro: o que não é dado simples (data do servidor,
// Timestamp) vira texto
function _valor(v) {
  if (v == null) return null
  if (typeof v?.toDate === 'function') return v.toDate().toISOString()
  if (Array.isArray(v)) return v.map(_valor)
  if (typeof v === 'object') return typeof v._methodName === 'string' ? null : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, _valor(x)]))
  return v
}

// Só o que mudou entre antes e depois
export function diferenca(antes = {}, depois = {}) {
  const a = {}
  const d = {}
  for (const k of new Set([...Object.keys(antes || {}), ...Object.keys(depois || {})])) {
    if (_IGNORADOS.has(k) || !(k in (depois || {}))) continue
    const va = _valor(antes?.[k])
    const vd = _valor(depois[k])
    // Lista de IDs (empresas) vale como conjunto: a ordem não é mudança
    const igual = Array.isArray(va) && Array.isArray(vd)
      ? JSON.stringify([...va].sort()) === JSON.stringify([...vd].sort())
      : JSON.stringify(va) === JSON.stringify(vd)
    if (igual) continue
    a[k] = va
    d[k] = vd
  }
  return { antes: a, depois: d }
}

function _limpo(dados) {
  return Object.fromEntries(Object.entries(dados || {}).filter(([k]) => !_IGNORADOS.has(k)).map(([k, v]) => [k, _valor(v)]))
}

// Grava a mudança com o seu registro, num lote só.
//   tipo: 'criar' (set de documento novo), 'editar' (update ou set sobre um
//   que existe) ou 'apagar'. antes: o documento como estava (para editar e
//   apagar). Devolve o ID do documento.
export async function gravarAuditado({ colecao, id = null, tipo, dados = {}, antes = null, nome = '', empresaIds = [], sobrescrever = false }) {
  const entidade = ENTIDADES[colecao]
  if (!entidade) throw new Error(`coleção sem auditoria: ${colecao}`)
  const ref = id ? doc(db, colecao, id) : doc(collection(db, colecao))
  const aid = tipo === 'apagar'
    ? `apagou-${entidade}-${ref.id}-${antes?.auditoriaId || '0'}`
    : doc(collection(db, 'auditoria')).id
  const mudanca = tipo === 'apagar' ? { antes: _limpo(antes), depois: null }
    : tipo === 'criar' ? { antes: null, depois: _limpo(dados) }
    : diferenca(antes, dados)

  const lote = writeBatch(db)
  lote.set(doc(db, 'auditoria', aid), {
    autorId:    auth.currentUser?.uid || '',
    autorNome:  sessao.usuario?.nome || '',
    em:         serverTimestamp(),
    entidade,
    entidadeId: ref.id,
    nome:       String(nome || '').slice(0, 120),
    acao:       tipo,
    antes:      mudanca.antes,
    depois:     mudanca.depois,
    empresaIds: [...new Set([...(entidade === 'empresa' ? [ref.id] : []), ...empresaIds].filter(Boolean))].slice(0, 30),
    ...(eContaDemo() ? { isDemo: true } : {}),
  })
  if (tipo === 'apagar') lote.delete(ref)
  else if (tipo === 'criar' || sobrescrever) lote.set(ref, { ...dados, auditoriaId: aid })
  else lote.update(ref, { ...dados, auditoriaId: aid })
  await lote.commit()
  return ref.id
}
