// Lê tudo o que a pessoa alcança e entrega a cópia em JSON (js/exportacao.js).
// Usa as mesmas consultas das telas, então as regras não mudam: o supremo
// leva todas as empresas; o gestor, as dele. O que não puder ser lido entra
// em "faltas" no arquivo, em vez de parar a cópia.
import { db, collection, doc, getDoc, getDocs, query, where, consulta, consultaUsuarios } from './firebase.js'
import { sessao } from './estado.js'
import { PERFIS } from './constants.js'
import { empresasDoUsuario, baixarArquivo } from './utils.js'
import { montarExportacao, nomeDoArquivo, SUBCOLECOES_PEDIDO } from './exportacao.js'

const _docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }))

export async function exportarDados() {
  const u = sessao.usuario
  const supremo = u.perfil === PERFIS.SUPREMO
  const minhas = empresasDoUsuario(u).slice(0, 30)
  const faltas = []
  const ler = async (nome, fn) => {
    try { return await fn() } catch (e) { console.warn(`Cópia: ${nome} não lido`, e); faltas.push(nome); return [] }
  }

  const empresas = (await ler('empresas', async () => _docs(await getDocs(consulta(collection(db, 'empresas'))))))
    .filter(e => supremo || sessao.isDemo || minhas.includes(e.id))
  const ids = empresas.map(e => e.id)
  const porEmpresa = (ref, campo, op = 'in') => supremo || sessao.isDemo ? consulta(ref) : query(ref, where(campo, op, minhas))

  const [categorias, fornecedores, usuarios, convites, auditoria, alcadas, pedidos] = await Promise.all([
    ler('categorias', async () => _docs(await getDocs(consulta(collection(db, 'categorias'))))),
    ler('fornecedores', async () => _docs(await getDocs(consulta(collection(db, 'fornecedores'))))),
    ler('usuarios', async () => _docs(await getDocs(consultaUsuarios(u)))),
    sessao.isDemo || (!supremo && !minhas.length) ? [] : ler('convites', async () =>
      _docs(await getDocs(supremo ? collection(db, 'convites') : query(collection(db, 'convites'), where('empresas', 'array-contains-any', minhas))))),
    !supremo && !sessao.isDemo && !minhas.length ? [] : ler('auditoria', async () =>
      _docs(await getDocs(porEmpresa(collection(db, 'auditoria'), 'empresaIds', 'array-contains-any')))),
    // A alçada tem o ID da empresa; empresa sem alçada não tem documento
    ler('alcadas', async () => (await Promise.all(ids.map(id => getDoc(doc(db, 'alcadas', id)).catch(() => null))))
      .filter(s => s?.exists()).map(s => ({ id: s.id, ...s.data() }))),
    !supremo && !sessao.isDemo && !minhas.length ? [] : ler('pedidos', async () =>
      _docs(await getDocs(porEmpresa(collection(db, 'pedidos'), 'empresaId')))),
  ])

  // As subcoleções de cada pedido (seis leituras por pedido)
  await Promise.all(pedidos.map(p => Promise.all(SUBCOLECOES_PEDIDO.map(async s => {
    try { p[s] = _docs(await getDocs(collection(db, 'pedidos', p.id, s))) } catch { p[s] = []; faltas.push(`pedidos/${p.id}/${s}`) }
  }))))

  const agora = new Date()
  const pacote = montarExportacao({
    geradoEm: agora,
    geradoPor: { id: u.id, nome: u.nome || '', email: u.email || '', perfil: u.perfil },
    empresaIds: ids,
    colecoes: { empresas, categorias, fornecedores, usuarios, convites, alcadas, auditoria },
    pedidos,
    faltas,
  })
  const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' })
  baixarArquivo(nomeDoArquivo(agora), blob)
  return pacote
}
