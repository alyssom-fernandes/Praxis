# Sistema visual

Identidade "Inscrição em terracota": preto quente de cerâmica e argila, texto em osso, acento terracota, cantos retos e hierarquia pela tipografia (GFS Neohellenic nos títulos e numerais, GFS Didot na marca, Hanken Grotesk na interface). Este documento dá nome e limite ao que fica por baixo dela.

- **Tokens:** `css/tokens.css` (tema escuro em `:root`, claro em `.light`).
- **Catálogo ao vivo:** `?tela=sistema` (fora da navegação). Mostra cada componente com as classes reais, nos dois temas.
- **Nomes e textos:** [`docs/glossario.md`](glossario.md).
- **Conferido no CI:** `tests/sistema.test.mjs` cobre os contrastes, o foco, a escala de texto, as camadas e os papéis de cor.

## Cores

| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--gold-fill` | #D2693F | #B5502E | Botão primário, fio do item ou aba ativa, selo Urgente, "com você" |
| `--gold` | #D2693F | #A4462A | Link e texto da aba ativa |
| `--foco` | tinta (#EFE5D6) | tinta (#1A1510) | **Só** o anel de foco |
| `--borda-campo` | #7A6D5E | #8E7C64 | Borda que identifica campo e botão secundário (3:1) |
| `--text` / `--text2` / `--text3` | | | Texto; contagens e valores usam `--text`. `--text3` nunca sobre `--card3` |
| `--blue` · `--green` · `--red` · `--amber` | | | Em andamento · concluído · encerrado, erro e atraso · aviso (vence hoje) |
| `--acento-*` (9 matizes) | | | Sem significado: categorias de compra e séries de gráfico |

**Regras:**
- A terracota tem quatro papéis: ação primária, item ou aba ativa, urgência e "com você". Ela não marca foco, contagem, dado nem perfil.
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
| `--t-titulo-3` | 16 px | Título de cartão, de grupo e de painel |
| `--t-corpo` | 14 px | Texto padrão, células, campos, botões |
| `--t-pequeno` | 12 px | Metadados, legenda, cabeçalho de tabela, selo |

- **Tamanho mínimo:** 12 px.
- **Display:** dois degraus na GFS Neohellenic, `--t-display-g` (40 px: título de tela, numeral da coluna, KPI em destaque) e `--t-display-m` (28 px: título do pedido, numerais da régua, KPIs). No celular, o título de tela fica em 30 px. A entrada e o 404 têm tamanhos próprios.
- **Diálogos:** o título vai na fonte da interface (20 px), sem caixa alta. A inscrição em maiúsculas é só do título de tela.

## Camadas

O `z-index` global só usa os tokens `--z-*`, de baixo para cima, de `--z-menu` (60) a `--z-salto` (10001). Valores até 20 ficam no próprio componente. Hoje os tokens guardam os valores antigos. Juntar tudo nas nove camadas da auditoria (fixo, barra, popover, folha, cortina, modal, aviso, tour, dica) muda a ordem de pares que aparecem juntos e pede conferência tela a tela.

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
| Filtro rápido | Recortes do quadro com o número ao lado (`aria-pressed`) | Trocar a forma da visão | Substantivo curto: "Urgentes" |
| Troca de visão | Quadro e lista, gráfico e tabela: o mesmo conteúdo | Filtrar | Ícone com `aria-label` |
| Cartão de pedido | Pedido no quadro | Detalhe do pedido | Número, título em até duas linhas, empresa, prazo, valor |
| Aviso (toast) | Resultado de uma ação; até duas ações ("Ver pedido") | Erro de carga (vai na própria área) | Sucesso curto, sem "com sucesso"; erro com o que houve e o que fazer, e fica até a pessoa fechar |
| Confirmação | Ação que não volta | Ação que dá para desfazer | Título em pergunta; botão com verbo + objeto |
| Estado vazio | Lista ou área sem itens | Erro | Causa e saída, com uma ação de uma ou duas palavras |
| Esqueleto | Enquanto a área carrega | Ações em andamento (use o botão carregando) | Nenhum; a medida do conteúdo que vem |

## O que falta (Fase 1 do roteiro)

- **Espaço (1.5):** tokens `--esp-*` em base 8. As alturas de botão (40 e 32 px) já estão feitas.
- **Componentes unificados (1.6):** régua e estado vazio únicos. A etiqueta de etapa, a faixa da demo, o título dos diálogos, o aviso com ação e o erro que persiste já estão feitos.
- **Estrutura das telas (1.9):** depende de um protótipo próprio e da revisão do dono.
