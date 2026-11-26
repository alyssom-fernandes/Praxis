// Estado compartilhado entre os módulos do app: a sessão e os ganchos que um
// módulo registra para os outros usarem (a navegação, a lista de pedidos do
// quadro e a troca de pessoa da demo).
//
// Este módulo não importa nenhum outro. Assim ui.js e as telas o usam sem
// formar ciclo com app.js, que importa ui.js. Antes, isso passava por globais
// na janela (window.__navegar, window.__getPedidos, window.__praxisSessao).

export const sessao = {
  usuario:   null,  // documento do Firestore
  fireUser:  null,  // FirebaseUser
  isDemo:    false,
  contaDemo: null,  // na demo: o perfil da conta de login (usuario é a pessoa escolhida)
  // Barra lateral: contadores e nomes conhecidos (as telas vão preenchendo)
  lateral:   { contagens: {}, filtroPedidos: 'todos' },
}

const _ganchos = { navegar: null, pedidos: null, trocarPessoa: null }

// app.js registra o roteador; a paleta de comandos, o tour e a faixa da demo
// navegam por aqui
export function registrarNavegacao(fn) { _ganchos.navegar = fn }
export function navegar(tela, params, opcoes) { _ganchos.navegar?.(tela, params, opcoes) }
export function podeNavegar() { return Boolean(_ganchos.navegar) }

// pedidos.js registra a leitura da lista que o quadro escuta; a paleta busca
// nela. Antes de a pessoa abrir o quadro, a lista vem vazia.
export function registrarPedidos(fn) { _ganchos.pedidos = fn }
export function pedidosCarregados() { return _ganchos.pedidos?.() || [] }

// app.js registra a troca de pessoa da demo; a faixa da demo a chama
export function registrarTrocaDePessoa(fn) { _ganchos.trocarPessoa = fn }
export function trocarPessoa(id) { return _ganchos.trocarPessoa?.(id) }

// "Visto por": os pedidos que a pessoa já abriu ficam num documento só dela
// (lidos/{uid da conta}, mapa pedidos → quando). Na demo, a conta é uma para
// todas as pessoas de exemplo: a chave leva a pessoa junto
export function chaveLido(pedidoId) {
  return sessao.isDemo ? `${sessao.usuario?.id}__${pedidoId}` : pedidoId
}
