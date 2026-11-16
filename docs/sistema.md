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
- **Display:** o título de tela, os numerais, os KPIs e a entrada são a "inscrição" e ficam fora desta escala, com os valores aprovados (1,3rem ou mais, ou `clamp`).

## Camadas

O `z-index` global só usa os tokens `--z-*`, de baixo para cima, de `--z-menu` (60) a `--z-salto` (10001). Valores até 20 ficam no próprio componente. Hoje os tokens guardam os valores antigos. Juntar tudo nas nove camadas da auditoria (fixo, barra, popover, folha, cortina, modal, aviso, tour, dica) muda a ordem de pares que aparecem juntos e pede conferência tela a tela.

## Foco

- **Anel:** um só, de 2 px em `--foco`, a 2 px do elemento. Em listas e tabelas que cortam o que passa da borda, vai para dentro (`outline-offset` negativo).
- **Foco apagado:** nenhum foco é apagado sem outro no lugar.
- **Link de salto:** "Pular para o conteúdo" é o primeiro Tab de toda tela com a barra lateral e leva o foco ao `<main>`.

## Componentes

| Componente | Quando usar | Quando não usar | Texto |
|---|---|---|---|
| Botão primário | A ação principal da área, uma por área | Ações secundárias, cancelar | Verbo + objeto: "Criar pedido" |
| Botão secundário | Ações de apoio (filtros, exportar) | A ação principal | Verbo ou substantivo curto |
| Ghost | Cancelar, fechar, ações de baixo peso | Ação que grava | "Cancelar", "Voltar" |
| Perigo | O que não volta (apagar, cancelar pedidos) | Reprovar (tem fluxo próprio, com motivo) | Diz o objeto: "Cancelar pedidos" |
| Campo | Dado que a pessoa escreve | Escolha entre poucas opções (use botões ou select) | Rótulo substantivo; placeholder com exemplo; erro abaixo, dizendo o que fazer |
| Ponto de etapa | Etapa em lista, paleta e relatórios | Perfil, categoria | O nome da etapa ao lado |
| Selo | Urgente e "com você" | Etapa, contagem | Uma palavra, sem caixa alta |
| Contagem | Quantos itens há numa aba, filtro ou item da lateral | Destacar (é dado, fica neutra) | Só o número |
| Filtro rápido | Recortes do quadro com o número ao lado (`aria-pressed`) | Trocar a forma da visão | Substantivo curto: "Urgentes" |
| Troca de visão | Quadro e lista, gráfico e tabela: o mesmo conteúdo | Filtrar | Ícone com `aria-label` |
| Cartão de pedido | Pedido no quadro | Detalhe do pedido | Número, título em até duas linhas, empresa, prazo, valor |
| Aviso (toast) | Resultado de uma ação | Erro de carga (vai na própria área) | Sucesso curto, sem "com sucesso"; erro com o que houve e o que fazer |
| Confirmação | Ação que não volta | Ação que dá para desfazer | Título em pergunta; botão com verbo + objeto |
| Estado vazio | Lista ou área sem itens | Erro | Causa e saída, com uma ação de uma ou duas palavras |
| Esqueleto | Enquanto a área carrega | Ações em andamento (use o botão carregando) | Nenhum; a medida do conteúdo que vem |

## O que falta (Fase 1 do roteiro)

- **Espaço e alturas de controle:** tokens `--esp-*` em base 8 e controles de 32 e 40 px (1.5).
- **Componentes unificados:**
  - lozenge, régua e estado vazio únicos;
  - faixa da demo em tinta invertida;
  - aviso com ação e erro que persiste (1.6).
- **Densidade do quadro e estrutura das telas (1.7 e 1.9):** dependem de revisão do dono.
