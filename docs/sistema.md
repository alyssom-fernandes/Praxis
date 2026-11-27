# Sistema visual

Identidade "Mármore e bronze" (desde 16/11/2026; antes, "Inscrição em terracota"): grafite de pedra e mármore, texto em osso, acento bronze, cantos arredondados (desde 27/11/2026) e hierarquia pela tipografia (GFS Neohellenic nos títulos e numerais, GFS Didot na marca, Hanken Grotesk na interface). Este documento dá nome e limite ao que fica por baixo dela.

- **Tokens:** `css/tokens.css` (tema escuro em `:root`, claro em `.light`).
- **Catálogo ao vivo:** `?tela=sistema` (fora da navegação). Mostra cada componente com as classes reais, nos dois temas.
- **Nomes e textos:** [`docs/glossario.md`](glossario.md).
- **Conferido no CI:** `tests/sistema.test.mjs` cobre os contrastes, o foco, a escala de texto, o espaço, as camadas, os papéis de cor e os componentes únicos (estado vazio e régua).

## Cores

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--gold-fill` (bronze) | #C29A55 | #86652A | Botão primário, fio do item ou aba ativa, "com você" |
| `--gold` (bronze em texto) | #C9A15C | #7A5B21 | Link e texto da aba ativa |
| `--urgente` | #B4473A | #A63D31 | Só o selo "Urgente" (texto em `--on-urgente`, branco) |
| `--foco` | tinta (#EEE9DF) | tinta (#1B1915) | **Só** o anel de foco |
| `--borda-campo` | #7A7264 | #8E8676 | Borda que identifica campo e botão secundário (3:1) |
| `--text` / `--text2` / `--text3` | | | Texto; contagens e valores usam `--text`. `--text3` nunca sobre `--card3` |
| `--blue` · `--green` · `--red` · `--amber` | | | Em andamento · concluído · encerrado, erro e atraso · aviso (vence hoje) |
| `--acento-*` (9 matizes) | | | Sem significado: categorias de compra e séries de gráfico |

**Regras:**
- O bronze tem três papéis: ação primária, item ou aba ativa e "com você". A urgência tem cor própria (`--urgente`), para o alerta não disputar com a ação. Nenhum dos dois marca foco, contagem, dado nem perfil.
- Os nomes `--gold*` ficaram por compatibilidade; o nome antigo "terracota" também ficou nas cores do PDF (`js/pdf-papel.js`), com os valores do bronze.
- A etapa tem cor pela **categoria**, num mapa só (`CATEGORIA_ETAPA` em `js/constants.js`):
  - aguardando, neutro: Solicitado;
  - em andamento, azul: de Em cotação a Entregue;
  - concluído, verde: só Pago;
  - encerrado, vermelho: Reprovado e Cancelado.
- **Perfil não tem cor.**
- **Contraste mínimo** (WCAG 2.2 AA):
  - texto, 4,5:1;
  - anel de foco e borda de campo, 3:1, nas superfícies dos dois temas.

## Texto

| Token | Tamanho | Uso |
|---|---|---|
| `--t-titulo-2` | 20 px | Título de seção e de diálogo |
| `--t-titulo-3` | 16 px (17 no celular) | Título de cartão, de grupo e de painel |
| `--t-lista` | 15 px (17 no celular) | Itens da lateral e das listas agrupadas |
| `--t-corpo` | 14 px (15 no celular) | Texto padrão, células, campos, botões |
| `--t-legenda` | 13 px | Rótulo de grupo (caixa alta) e contador da lateral |
| `--t-pequeno` | 12 px | Metadados, legenda, cabeçalho de tabela, selo |

- **Tamanho mínimo:** 12 px.
- **Display:** dois degraus na GFS Neohellenic, `--t-display-g` (40 px: título de tela, numeral da coluna, KPI em destaque) e `--t-display-m` (28 px: título do pedido, numerais da régua, KPIs). No celular, o título de tela fica em 28 px. Desde 27/11 o título de tela vai em caixa baixa, como o título grande do iOS; no celular ele passa para a faixa do alto ao rolar. A entrada e o 404 têm tamanhos próprios.
- **Diálogos:** o título vai na fonte da interface (20 px), sem caixa alta.
- **Rótulo de grupo:** 13 px, caixa alta, sobre cada lista agrupada (Descrição, Cotações, Dados do pedido, Onde e quando).

## Cantos e superfícies (estilo novo, 27/11/2026)

| Token | px | Uso |
|---|---|---|
| `--radius` | 12 | Janelas, diálogos e folhas (no celular, só o alto) |
| `--radius-card` | 10 | Cartões, painéis e listas agrupadas |
| `--radius-sm` · `--radius-btn` · `--radius-input` | 8 | Botões, campos, itens internos, seleção da lateral |
| `--radius-tag` | cápsula | Selos, contadores e filtros |

- **Ficam retos:** a régua das sete etapas, o fio do alto das colunas do quadro, os numerais e o alto do painel de decisão (o fio da cor do momento só em cima).
- **Lista agrupada:** uma superfície só, com os divisores recuados e o valor à direita (cotações, dados, pessoas, descrição).
- **Botão secundário:** preenchido (`--preenchido`), sem borda. Os botões do próximo passo vão só com o texto, sem ícone.
- **Barras translúcidas:** `--vidro` com desfoque na barra de filtros (presa ao rolar), na barra de baixo e na barra do pedido no celular.
- **Celular:** as folhas têm a alça e fecham arrastando o alto (js/ui.js); no app instalado no iPhone, deslizar da borda esquerda volta do pedido (js/app.js).

## Espaço

Base 8, treze degraus. Padding, margin e gap só por estes tokens; o teste barra literal fora da escala.

| Token | px | Uso |
|---|---|---|
| `--esp-025` | 2 | Ajuste fino: selo, ícone e texto |
| `--esp-050` | 4 | Ícone + rótulo, padding vertical de selo |
| `--esp-075` | 6 | Padding de etiqueta, gap de chips |
| `--esp-100` | 8 | Gap padrão dentro de um componente |
| `--esp-150` | 12 | Padding de cartão e de célula, gap de cartões |
| `--esp-200` | 16 | Padding de painel e de campo, margem lateral no celular |
| `--esp-250` | 20 | Entre grupos de campos |
| `--esp-300` | 24 | Padding de diálogo, entre blocos do detalhe |
| `--esp-400` | 32 | Margem da página no computador, entre seções |
| `--esp-500` | 40 | Abaixo do cabeçalho de página |
| `--esp-600` | 48 | Entre seções grandes |
| `--esp-800` | 64 | Respiro de estados vazios e do 404 |
| `--esp-1000` | 80 | Só na entrada |

- **Faixas:** dentro de um componente, 2 a 8; entre componentes, 12 a 24; layout, 32 a 80.
- **Fora da escala, sem token:** 0, 1 px (compensa uma borda), unidades relativas (%, em, vh, vw) e a área segura do celular (`env()`).
- **Alturas que o espaço desconta:** `--barra-inferior-h` (56 px) e `--acoes-fixas-h` (65 px), no celular.
- **Exceções com motivo** (lista em `tests/sistema.test.mjs`): o recuo do gráfico mensal, igual à largura dos rótulos do eixo Y, e o respiro fluido (`clamp`) da entrada.
- **Negativo:** `calc(var(--esp-…) * -1)`, para a sangria que cancela o padding de quem está em volta.

## Camadas

Nove camadas, de baixo para cima. O `z-index` global só usa estes tokens, ou um degrau acima ou abaixo de um deles, com `calc(var(--z-…) + n)`, para quem convive na mesma camada. Valores até 20 ficam no próprio componente.

| Token | Valor | O que fica nela |
|---|---|---|
| `--z-fixo` | 100 | Lateral |
| `--z-barra` | 200 | Barra de seleção; barra inferior (+1), faixa da demo (+2), aviso offline (+3) |
| `--z-popover` | 300 | Menus, sino e menu da conta no computador, dica do gráfico |
| `--z-folha` | 400 | Folhas do celular: filtros, sino, conta; o fundo de cada folha em −1 |
| `--z-cortina` | 500 | Janela com cortina: modal, paleta, escolha de pessoa |
| `--z-modal` | 510 | Diálogo de confirmação ou escolha, que abre sobre uma janela; calendário (+1) |
| `--z-tour` | 600 | Tour: bloqueio, destaque (+1) e balão (+2) |
| `--z-aviso` | 700 | Avisos; a tela de bloqueio em −1 |
| `--z-dica` | 800 | Dica, cartão arrastado; link de salto (+1) |

- **Ordem:** a do ADS, com uma diferença: o aviso fica acima do tour, como sempre ficou no Praxis (um erro durante o tour precisa aparecer).
- **Pares que aparecem juntos, conferidos no navegador:** calendário dentro do modal, confirmação sobre o modal, aviso sobre o modal e sobre o tour, barra inferior sobre a barra de seleção, menu da conta no celular sobre a barra inferior e a faixa, tour sobre a faixa e a barra inferior.

## Foco

- **Anel:** um só, de 2 px em `--foco`, a 2 px do elemento. Em listas e tabelas que cortam o que passa da borda, vai para dentro (`outline-offset` negativo).
- **Foco apagado:** nenhum foco é apagado sem outro no lugar.
- **Link de salto:** "Pular para o conteúdo" é o primeiro Tab de toda tela com a barra lateral e leva o foco ao `<main>`.

## Teclado

| Tecla | Onde | O que faz |
|---|---|---|
| C | Quadro | Cria um pedido |
| J / K | Quadro e lista | Próximo e anterior |
| Enter | Cartão ou linha | Abre o pedido |
| M, tecla de menu ou Shift+F10 | Cartão ou linha | "Mover para…": as mesmas etapas e travas do arrasto |
| / | Quadro | Foca a busca |
| Ctrl + K | Todas as telas | Paleta: buscar pedido e comandos |
| ? | Quadro | Lista dos atalhos |

- **Atalhos de uma tecla** (C, J, K, M, ?): podem ser desligados pela paleta ("Desligar atalhos de uma tecla"), por qualquer perfil, e em Ajustes (WCAG 2.1.4). A tecla de menu e o Shift+F10 continuam valendo com eles desligados.
- **No arrasto:** a coluna de destino permitida acende, e as outras esmaecem desde o começo.

## Componentes

| Componente | Quando usar | Quando não usar | Texto |
|---|---|---|---|
| Botão primário | A ação principal da área, uma por área | Ações secundárias, cancelar | Verbo + objeto: "Criar pedido" |
| Botão secundário | Ações de apoio (filtros, exportar) | A ação principal | Verbo ou substantivo curto |
| Ghost | Cancelar, fechar, ações de baixo peso | Ação que grava | "Cancelar", "Voltar" |
| Perigo | O que não volta (apagar, cancelar pedidos) | Reprovar (tem fluxo próprio, com motivo) | Diz o objeto: "Cancelar pedidos" |
| Campo | Dado que a pessoa escreve | Escolha entre poucas opções (use botões ou select) | Rótulo substantivo; placeholder com exemplo; erro abaixo, dizendo o que fazer |
| Etiqueta de etapa (lozenge) | Etapa na lista (20 px, cor da categoria); na paleta e nos relatórios, um ponto na mesma cor | Perfil, categoria | Sempre o nome da etapa |
| Responsável no cartão | O comprador que assumiu, em iniciais (24 px), com o nome no title | Antes de alguém assumir | Nenhum; o nome vai no title e no rótulo do cartão |
| Selo | Urgente e "com você" | Etapa, contagem | Uma palavra, sem caixa alta |
| Contagem | Quantos itens há numa aba, filtro ou item da lateral | Destacar (é dado, fica neutra) | Só o número |
| Filtro rápido | Recortes do quadro: chip reto com o número ao lado (`aria-pressed`); no celular, no topo da folha Filtros | Trocar a forma da visão | Substantivo curto: "Urgentes" |
| Troca de visão | Quadro e lista, gráfico e tabela: o mesmo conteúdo | Filtrar | Ícone com `aria-label` |
| Cartão de pedido | Pedido no quadro | Detalhe do pedido | Número, título em até duas linhas, empresa, prazo, valor |
| Aviso (toast) | Resultado de uma ação; até duas ações ("Ver pedido") | Erro de carga (vai na própria área) | Sucesso curto, sem "com sucesso"; erro com o que houve e o que fazer, e fica até a pessoa fechar |
| Confirmação | Ação que não volta | Ação que dá para desfazer | Título em pergunta; botão com verbo + objeto |
| Estado vazio | Lista ou área sem itens: um componente só (`estadoVazio` em `js/ui.js`). Na página, sob o fio de tinta (no quadro, com o 0 da contagem); `solto` em tabela, grade ou seção; `compacto` num bloco do detalhe; `painel` no sino e na paleta. Erro de carga: o mesmo componente, com ícone em vermelho | Aviso de ação (use o toast) | Título curto; uma frase com a causa e a saída; uma ação de uma ou duas palavras |
| Régua de etapas | As sete etapas do caminho: na entrada, no detalhe e no quadro do celular (`.regua`). Numeral, nome (`STATUS_LABEL`) e data, sob um fio de 2 px; destaque só no fio: tinta (feita), bronze (atual ou escolhida), vermelho (onde parou), tracejado (o que não vai acontecer) | Etapa de um pedido numa lista (use a etiqueta) | O nome da etapa, igual ao do quadro |
| Esqueleto | Enquanto a área carrega | Ações em andamento (use o botão carregando) | Nenhum; a medida do conteúdo que vem |
