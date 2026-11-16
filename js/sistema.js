// Catálogo do sistema visual: ?tela=sistema (fora da navegação).
//
// Cada componente aparece com as classes reais do app, nos estados que ele
// tem, ao lado da regra de uso. Serve para conferir uma mudança de token ou de
// componente sem caçar a tela em que ele aparece, nos dois temas. As regras
// estão também em docs/sistema.md; os nomes, em docs/glossario.md.
//
// É uma ferramenta de quem mantém o código: os textos ficam aqui, em
// português, fora do dicionário (tests/textos.test.mjs sabe disso).

import { renderTopbar, initTopbarEvents, renderFooter } from './app.js'
import { prxToast, prxConfirm, definirTema, preferenciaTema } from './ui.js'
import { renderNotificacoes } from './notificacoes.js'
import { STATUS, STATUS_LABEL, CATEGORIA_ETAPA } from './constants.js'
import { esc } from './utils.js'

const _svg = (n, d) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const ICONE = {
  mais:    n => _svg(n, '<path d="M12 5v14M5 12h14"/>'),
  relogio: n => _svg(n, '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  filtros: n => _svg(n, '<path d="M4 6h16M7 12h10M10 18h4"/>'),
  lixo:    n => _svg(n, '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
}

// Tokens mostrados (o valor vem do CSS calculado, no tema da vez)
const CORES = [
  ['--gold-fill', 'Marca: botão primário, fio do item ativo, selo Urgente, "com você"'],
  ['--gold', 'Marca em texto: link, aba ativa'],
  ['--foco', 'Só o anel de foco'],
  ['--borda-campo', 'Borda que identifica campo e botão secundário (3:1)'],
  ['--text', 'Texto principal e dados (contagens, valores)'],
  ['--text2', 'Texto secundário'],
  ['--text3', 'Metadados; nunca sobre --card3'],
  ['--bg', 'Fundo da página'],
  ['--card', 'Superfície 1: painéis, modais'],
  ['--card2', 'Superfície 2: cartões, campos'],
  ['--card3', 'Superfície 3: hover'],
  ['--blue', 'Etapa em andamento'],
  ['--green', 'Concluído (só Pago) e confirmação'],
  ['--red', 'Encerrado sem compra, erro, atraso'],
  ['--amber', 'Aviso: vence hoje, a vencer'],
]
const ACENTOS = ['ocre', 'areia', 'oliva', 'mar', 'egeu', 'ametista', 'rosa', 'vinho', 'argila']
const TIPOS = [
  ['--t-titulo-2', '20 px', 'Título de seção e de diálogo'],
  ['--t-titulo-3', '16 px', 'Título de cartão, de grupo e de painel'],
  ['--t-corpo', '14 px', 'Texto padrão, células, campos, botões'],
  ['--t-pequeno', '12 px', 'Metadados, legenda, cabeçalho de tabela, selo (mínimo)'],
]
const CAMADAS = ['--z-menu', '--z-fixo', '--z-barra-selecao', '--z-escolha-pessoa', '--z-puxar', '--z-acoes-fixas',
  '--z-barra', '--z-faixa', '--z-popover', '--z-painel-fundo', '--z-painel', '--z-cortina', '--z-folha',
  '--z-tour-bloqueio', '--z-tour-destaque', '--z-tour', '--z-folha-conta-fundo', '--z-folha-conta', '--z-paleta',
  '--z-calendario', '--z-dialogo', '--z-bloqueio', '--z-dica', '--z-aviso', '--z-salto']

const CATEGORIAS = {
  aguardando: 'Aguardando', andamento: 'Em andamento', concluido: 'Concluído', encerrado: 'Encerrado sem compra',
}

function _secao(id, titulo, regra, exemplo) {
  return `
    <section class="sis-secao" aria-labelledby="sis-${id}">
      <h2 class="rotulo-secao" id="sis-${id}">${titulo}</h2>
      <p class="sis-regra">${regra}</p>
      <div class="sis-exemplo">${exemplo}</div>
    </section>`
}

function _cartao({ num, titulo, empresa, urgente = false, prazo, classe = '', valor, resp = '' }) {
  return `
    <article class="kcard${urgente ? ' kcard-urgente' : ''}" tabindex="0" aria-label="${esc(`${num}, ${titulo}`)}">
      <div class="kcard-top">
        <span class="kcard-num">${num}</span>
        ${urgente ? '<span class="kcard-urg">Urgente</span>' : ''}
      </div>
      <h3 class="kcard-title">${esc(titulo)}</h3>
      <div class="kcard-empresa">${esc(empresa)}</div>
      <div class="kcard-pe">
        <span class="kcard-prazo${classe ? ' ' + classe : ''}">${ICONE.relogio(12)}<span>${prazo}</span></span>
        <span class="kcard-valor">${valor}</span>
        ${resp ? `<span class="kcard-resp" title="Comprador: ${esc(resp)}" aria-hidden="true">${resp.split(' ').map(s => s[0]).join('')}</span>` : ''}
      </div>
    </article>`
}

export function renderSistema() {
  const etapas = Object.values(STATUS).map(st => `
    <li class="sis-etapa"><span class="lozenge lozenge-${CATEGORIA_ETAPA[st]}">${STATUS_LABEL[st]}</span>
      <span class="sis-mudo">${CATEGORIAS[CATEGORIA_ETAPA[st]]}</span></li>`).join('')

  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="main-layout">
      ${renderTopbar('')}
      <main class="main-content sis-pagina">
        <header class="sis-cabeca">
          <h1 class="titulo-pagina">Sistema</h1>
          <p class="sis-resumo">Tokens e componentes do Praxis, com a regra de cada um. Regras completas em <code>docs/sistema.md</code>.</p>
          <div class="cfg-seg sis-tema" role="radiogroup" aria-label="Tema">
            ${['dark', 'light'].map(tema => `<button type="button" class="cfg-seg-op ${preferenciaTema() === tema ? 'active' : ''}" role="radio" aria-checked="${preferenciaTema() === tema}" data-tema="${tema}">${tema === 'dark' ? 'Escuro' : 'Claro'}</button>`).join('')}
          </div>
        </header>

        ${_secao('cores', 'Cores', 'A terracota tem quatro papéis: ação primária, item ou aba ativa, urgência e "com você". Contagem e valor são dado, na cor do texto. Etapa tem cor por categoria; perfil não tem cor.', `
          <ul class="sis-cores">${CORES.map(([tk, uso]) => `
            <li><span class="sis-amostra" style="background:var(${tk})"></span><code>${tk}</code><span class="sis-valor" data-token="${tk}"></span><span class="sis-mudo">${uso}</span></li>`).join('')}
          </ul>
          <p class="sis-sub">Acentos sem significado (categorias de compra e séries de gráfico)</p>
          <ul class="sis-acentos">${ACENTOS.map(a => `<li><span class="sis-amostra" style="background:var(--acento-${a})"></span>${a}</li>`).join('')}</ul>`)}

        ${_secao('tipos', 'Texto', 'Quatro degraus de texto, mínimo de 12 px. Título de tela, numerais e KPIs são a inscrição (Neohellenic) e ficam fora desta escala.', `
          <ul class="sis-tipos">${TIPOS.map(([tk, px, uso]) => `
            <li><span style="font-size:var(${tk})">Pedido de compra 1.234</span><code>${tk}</code><span class="sis-mudo">${px} · ${uso}</span></li>`).join('')}
          </ul>`)}

        ${_secao('botoes', 'Botões', 'Começam com verbo e dizem o objeto ("Criar pedido"). Um primário por área. Ghost sem borda; perigo só para o que não volta.', `
          <div class="sis-linha">
            <button type="button" class="btn-primary">${ICONE.mais(16)}Criar pedido</button>
            <button type="button" class="btn-secondary">${ICONE.filtros(15)}Filtros</button>
            <button type="button" class="btn-ghost">Cancelar</button>
            <button type="button" class="btn-danger">${ICONE.lixo(15)}Apagar</button>
            <button type="button" class="btn-primary" disabled>Indisponível</button>
          </div>
          <div class="sis-linha">
            <button type="button" class="btn-primary btn-sm">Pequeno</button>
            <button type="button" class="btn-secondary btn-sm">Pequeno</button>
            <button type="button" class="btn-icon" aria-label="Novo">${ICONE.mais(16)}</button>
          </div>`)}

        ${_secao('campos', 'Campos', 'Rótulo visível e substantivo; o placeholder dá exemplo. Borda em --borda-campo, anel de foco em --foco, inválido em vermelho com a mensagem abaixo.', `
          <div class="sis-campos">
            <div class="form-group"><label for="sis-c1">Título</label><input id="sis-c1" type="text" placeholder="Ex.: Caixa de luvas descartáveis"></div>
            <div class="form-group"><label for="sis-c2">Empresa</label><select id="sis-c2"><option>Selecionar…</option><option>Orbix Industrial</option></select></div>
            <div class="form-group"><label for="sis-c3">Necessário até</label><input id="sis-c3" class="campo-data-texto" type="text" placeholder="dd/mm/aaaa" inputmode="numeric"></div>
            <div class="form-group invalido"><label for="sis-c4">Valor estimado</label><input id="sis-c4" type="text" value="abc" aria-invalid="true" aria-describedby="sis-c4-erro"><p class="form-error" id="sis-c4-erro">Informe um valor em reais.</p></div>
          </div>`)}

        ${_secao('etapas', 'Etapas', 'Mesmo nome em toda parte (docs/glossario.md). A etiqueta (lozenge) tem a cor da categoria e o nome da etapa; na paleta e nos relatórios, um ponto na mesma cor.', `
          <ul class="sis-etapas">${etapas}</ul>`)}

        ${_secao('selos', 'Selo e contagem', 'Selo só para Urgente e "com você". Contagem é neutra; terracota só no sino quando há não lidas.', `
          <div class="sis-linha">
            <span class="kcard-urg">Urgente</span>
            <span class="detalhe-urgente">Urgente</span>
            <span class="sis-contagem">Pedidos <span class="lateral-n">34</span></span>
            <span class="sis-sino"><span class="notif-badge">3</span></span>
          </div>`)}

        ${_secao('filtros', 'Filtros rápidos e troca de visão', 'Filtro rápido é um chip reto com aria-pressed e o número ao lado; o ativo ganha fundo. No celular, os filtros rápidos ficam no topo da folha Filtros. Abas só trocam a visão do mesmo conteúdo.', `
          <div class="sis-linha">
            <div class="pedidos-rapidos" role="group" aria-label="Filtros rápidos">
              <button type="button" class="rapido active" aria-pressed="true"><span class="rapido-rotulo">Todos</span><span class="rapido-n">34</span></button>
              <button type="button" class="rapido" aria-pressed="false"><span class="rapido-rotulo">Urgentes</span><span class="rapido-n">4</span></button>
              <button type="button" class="rapido" aria-pressed="false"><span class="rapido-rotulo">Encerrados</span><span class="rapido-n">4</span></button>
            </div>
          </div>`)}

        ${_secao('cartao', 'Cartão de pedido', 'Número, título em até duas linhas, empresa, prazo e valor. A urgência é um selo, não uma cor de fundo. Datas dd/mm/aaaa.', `
          <div class="sis-cartoes">
            ${_cartao({ num: 'PRX-0014', titulo: 'Impressora multifuncional para RH', empresa: 'Orbix Industrial', urgente: true, prazo: 'Faltam 4 dias', valor: 'R$ 3.500,00' })}
            ${_cartao({ num: 'PRX-0030', titulo: 'Seguro empresarial — frota e patrimônio', empresa: 'Veltora Serviços', prazo: 'Atrasado 8 dias', classe: 'atrasado', valor: 'R$ 16.800,00', resp: 'Diana Alves' })}
            ${_cartao({ num: 'PRX-0002', titulo: 'Uniformes e EPIs — equipe de campo', empresa: 'Orbix Industrial', prazo: 'Pago em 11/11/2026', classe: 'feito', valor: 'R$ 7.980,00' })}
          </div>`)}

        ${_secao('avisos', 'Avisos e confirmação', 'Sucesso em frase curta, sem "com sucesso", com até duas ações ("Ver pedido"). Erro diz o que houve e o que fazer, sem mensagem técnica, e fica até a pessoa fechar. Confirmação só para o que não volta.', `
          <div class="sis-linha">
            <button type="button" class="btn-secondary btn-sm" data-aviso="success">Aviso de sucesso</button>
            <button type="button" class="btn-secondary btn-sm" data-aviso="error">Aviso de erro</button>
            <button type="button" class="btn-secondary btn-sm" data-aviso="info">Aviso informativo</button>
            <button type="button" class="btn-secondary btn-sm" id="sis-confirmar">Confirmação</button>
          </div>`)}

        ${_secao('vazio', 'Estado vazio e carregando', 'Vazio diz a causa e a saída, com uma ação de uma ou duas palavras. O esqueleto tem a medida do conteúdo que vem.', `
          <div class="sis-vazio">
            <div class="pedidos-vazio">
              <span class="pedidos-vazio-n" aria-hidden="true">0</span>
              <h2 class="pedidos-vazio-titulo">Nada encontrado para “zzqx”</h2>
              <p class="pedidos-vazio-sub">Tente ajustar o filtro ou o termo de busca.</p>
              <div class="pedidos-vazio-acao"><button type="button" class="btn-secondary btn-sm">Limpar filtros</button></div>
            </div>
            <div class="sis-esqueleto" aria-hidden="true"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div></div>
          </div>`)}

        ${_secao('camadas', 'Camadas', 'z-index global só por token, de baixo para cima. Até 20, empilhamento local dentro do componente.', `
          <ol class="sis-camadas">${CAMADAS.map(tk => `<li><code>${tk}</code><span class="sis-valor" data-token="${tk}"></span></li>`).join('')}</ol>`)}

        ${_secao('foco', 'Foco', 'Um anel só: 2 px em --foco, a 2 px do elemento (para dentro em listas e tabelas). O primeiro Tab de toda tela é "Pular para o conteúdo". Use Tab nesta página para ver.', '')}
      </main>
      ${renderFooter()}
    </div>`

  initTopbarEvents(false)
  renderNotificacoes()
  _mostrarValores()

  document.querySelectorAll('.sis-tema [data-tema]').forEach(b => b.addEventListener('click', () => {
    definirTema(b.dataset.tema)
    renderSistema()
  }))
  document.querySelectorAll('[data-aviso]').forEach(b => b.addEventListener('click', () => {
    const textos = {
      success: 'Pedido criado.',
      error: 'O pedido não foi aprovado. Verifique a conexão e tente de novo.',
      info: 'Pedido movido para "Aprovado".',
    }
    const acoes = b.dataset.aviso === 'success' ? [{ rotulo: 'Ver pedido', fn: () => {} }] : []
    prxToast(textos[b.dataset.aviso], b.dataset.aviso, { acoes })
  }))
  document.getElementById('sis-confirmar')?.addEventListener('click', () =>
    prxConfirm('Cancelar 2 pedidos?', 'Os pedidos saem da fila e ficam em Encerrados, com o motivo.', 'Cancelar pedidos', 'Voltar', true))
}

// Valor de cada token no tema da vez, lido do CSS calculado
function _mostrarValores() {
  const raiz = getComputedStyle(document.documentElement)
  document.querySelectorAll('.sis-valor[data-token]').forEach(el => {
    el.textContent = raiz.getPropertyValue(el.dataset.token).trim()
  })
}
