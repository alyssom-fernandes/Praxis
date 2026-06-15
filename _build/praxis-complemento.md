# Praxis — Decisões Complementares e Plano de Evolução
> Este documento é a fonte de verdade das decisões de produto tomadas após a especificação original (`praxis-spec.md`).
> Contém: decisões de escopo, os 71 itens de melhoria aprovados organizados por fase, e itens explicitamente descartados.
> O Claude Code deve ler este documento junto com `praxis-spec.md` e `praxis-auditoria.md` para ter o contexto completo do que construir.

---

## 1. DECISÕES DE ESCOPO

### 1.1 O que o Praxis É
O Praxis é uma ferramenta de **organização e rastreabilidade do processo de compras corporativas**. Seu valor está em: centralizar os pedidos, manter o fluxo de aprovação auditável, e dar visibilidade a todos os envolvidos. É o oposto do processo por e-mail/planilha, onde nada tem dono e nada é rastreável.

### 1.2 O que o Praxis NÃO é (deliberado)
- **Não é uma ferramenta de controle financeiro.** Já existem ferramentas para isso. O Praxis registra valores de pedidos e parcelas para rastreabilidade, mas não é um sistema de orçamento, centro de custo ou ERP.
- **Não é um sistema de estoque.** Recebimento parcial, catálogo de itens e controle de inventário estão fora do escopo.
- **Não é um app nativo.** É uma SPA web responsiva com suporte a instalação via PWA (Fase 3), mas não tem app nativo iOS/Android.

### 1.3 Identidade visual — princípio de proteção
A estética do Praxis (profundidade por camadas de tom, glow sutil de baixo nos cards, estrelas e nebulas no fundo, acento dourado dessaturado, tipografia JetBrains Mono + Plus Jakarta Sans) é um **diferencial deliberado** — é o que separa o Praxis de "mais um dashboard com cara de IA gerado por template".

**Regra permanente:** não adicionar efeitos estéticos novos. Qualquer melhoria de design deve **refinar os fundamentos** (espaçamento, hierarquia, tom, contraste) e nunca empilhar efeitos (sem parallax, neon, gradientes extras, neomorphism, animações chamativas, glassmorphism além do uso pontual já existente no login).

O glassmorphism (`backdrop-filter: blur`) é aceito apenas no card de login, com blur ≤ 8px. Em nenhuma outra tela.

---

## 2. IDIOMA E PADRÕES TÉCNICOS

- **Idioma do código:** português. Nomes de variáveis, funções, comentários e mensagens internas em PT, consistente com o código existente (`sessao`, `renderPedidos`, `STATUS`, `PERFIS`, etc.). Não traduzir código para inglês.
- **Idioma do produto:** português (PT-BR) com suporte a inglês (EN) via `TRADUCOES` em `constants.js`. O modo demo suporta PT/EN. A tradução EN completa é entregue na Fase 3 (Estágio 4).
- **Idioma da documentação (`docs/`, `README.md`):** `README.md` em inglês (portfólio europeu); arquivos em `docs/` em português.
- **Git proibido para o Claude Code.** Commits são feitos manualmente pelo desenvolvedor.

---

## 3. OS 71 ITENS DE MELHORIA — ORGANIZADOS POR FASE

Estes itens foram aprovados pelo desenvolvedor após benchmarking de Coupa, SAP Ariba, Procurify, Jira, Linear, Asana, Kissflow, ApprovalMax e pesquisa em fóruns (Reddit, Hacker News, Blind) sobre o que usuários amam e odeiam nessas ferramentas. Cada item tem uma tarefa correspondente no documento de estágio indicado.

### FASE 1 — Demo impecável + base de qualidade (Estágio 2)
Executar após os Estágios 0 e 1 (fundação + fluxo). Alto valor, baixo/médio esforço, baixo risco.

1. **Count-up nos números do dashboard** — animar de 0 ao valor real ao carregar → Tarefa 2.1
2. **Skeleton loading** — placeholder animado com shimmer no lugar do spinner → Tarefa 2.2
3. **Animação de entrada dos modais** — fade + scale suave (~150ms) → Tarefa 2.3
4. **Loading state dentro dos botões** — spinner + "Salvando..." durante ações assíncronas → Tarefa 2.4
5. **ESC fecha modal, Enter confirma** — atalhos de teclado básicos em todos os modais → Tarefa 2.5
6. **Empty states com personalidade** — ilustração SVG + micro-cópia contextual, diferenciando "vazio" de "sem resultado" → Tarefa 2.6
7. **SLA visual (badge de prazo)** — "Faltam 3 dias" / "Atrasado 2 dias" com cor nos pedidos ativos → Tarefa 2.7
8. **Banner de modo demo** — faixa discreta "Dados fictícios — explore à vontade" (PT/EN) → Tarefa 2.8
9. **Notificações em tempo real** — badge atualiza sozinho via onSnapshot sem reload → Tarefa 2.9
10. **`prefers-reduced-motion`** — desligar animações cosméticas para quem pede → Tarefa 2.10
11. **Focus visible + navegação por teclado** — anel de foco dourado, focus trap em modais, tab funcional → Tarefa 2.11
12. **ARIA labels** — aria-label em PT em todos os botões só-ícone → Tarefa 2.12
13. **Cleanup de listeners onSnapshot** — unsubscribe ao trocar de view e no logout → Tarefa 2.13
14. **Contraste WCAG AA** — ≥4.5:1 para texto normal em dark e light → Tarefa 2.14
15. **Sanitização de inputs (XSS)** — escape HTML em todo texto do usuário → Tarefa 2.15
16. **Validação robusta de formulários** — antes de qualquer escrita no Firestore, com mensagem clara em PT → Tarefa 2.16
17. **Meta tags / Open Graph** — preview bonito ao compartilhar link no LinkedIn/WhatsApp → Tarefa 2.17
18. **Tap feedback universal** — `:active` com scale(0.98) ou mudança de cor em todo clicável → Tarefa 2.18
19. **Tooltips informativos nos ícones** — tooltip estilizado (não nativo) no hover/foco dos botões só-ícone → Tarefa 2.19
20. **Refino do blur do login e profundidade por camadas** — blur ≤ 8px no card de login; hierarquia visual por tom, não por bordas → Tarefa 2.20
21. **Glow colorido padronizado nos cards do dashboard** — classes `.card-glow-gold/green/red/blue` em vez de inline styles → Tarefa 2.21
22. **Assets de logo e favicon** — SVG do delta e wordmark, PNGs 192/512px, favicon sem 404 → Tarefa 2.22
23. **Confirmação universal de ações destrutivas** — `prxConfirm` com mensagem específica em toda ação irreversível → Tarefa 2.23

### FASE 2 — Evolução funcional (Estágio 3)
Executar após o Estágio 2 validado. Funcionalidades que agregam valor real de negócio.

24. **Número sequencial legível (#0001)** — contador atômico em Firestore, exibido no card/detalhe/lista → Tarefa 3.1
25. **Drag & drop no kanban** — API nativa HTML5, respeitando fluxo e permissões, com fallback mobile → Tarefa 3.2
26. **Comparador de cotações lado a lado** — modal com colunas paralelas, menor valor e indicada destacados → Tarefa 3.3
27. **Indicador de savings (economia)** — badge no detalhe + total no dashboard (≥2 cotações) → Tarefa 3.4
28. **Activity feed unificado** — timeline única intercalando status/comentários/cotações/comprovantes cronologicamente → Tarefa 3.5
29. **Timestamps relativos** — "há 2 horas" com data exata no hover → Tarefa 3.6
30. **Auditoria campo-a-campo** — registrar mudanças de título/valor/data/urgência/categoria na timeline → Tarefa 3.7
31. **Filtros adicionais e ordenação** — filtro por categoria/empresa/comprador; cabeçalhos de coluna clicáveis → Tarefa 3.8
32. **Export PDF do pedido individual** — via jsPDF, com todos os metadados + timeline + cotações + parcelas → Tarefa 3.9
33. **Gráfico temporal no dashboard** — linha de gastos dos últimos 6 meses (só perfis financeiros) → Tarefa 3.10
34. **Indicador de comentário não lido** — ponto dourado no card; some ao abrir → Tarefa 3.11
35. **Home contextual "Meus pendentes"** — pill com conteúdo diferente por perfil (Aprovador vê o que precisa aprovar, etc.) → Tarefa 3.12
36. **Optimistic UI** — comentar e notificações atualizam imediatamente; rollback em falha → Tarefa 3.13
37. **Gráfico de pizza/donut por categoria** — distribuição de gastos por categoria (só perfis financeiros) → Tarefa 3.14
38. **Duplicar pedido** — pré-preenche modal com dados do original sem copiar fluxo → Tarefa 3.15
39. **@menção com autocomplete real** — dropdown flutuante ao digitar `@`, navegável por teclado → Tarefa 3.16
40. **Tratamento de offline / erro de rede** — banner de sem-conexão + falha elegante + sem loading infinito → Tarefa 3.17

### FASE 3 — Refinamento avançado e portfólio (Estágio 4)
Executar por último. Maior esforço, itens de sofisticação técnica e portfólio.

41. **PWA** — manifest.json + service worker (cache-first para assets, network-first para dados) → Tarefa 4.1
42. **Command palette (Cmd+K)** — navegação, ações rápidas e busca de pedidos por teclado → Tarefa 4.2
43. **Tour guiado no primeiro acesso** — 5 passos, tooltips/popovers, pode ser reativado → Tarefa 4.3
44. **Tela de boas-vindas no demo** — logo + tagline + 3 bullets + crédito AFN, entre seleção de idioma e kanban → Tarefa 4.4
45. **Tradução EN completa** — toda a UI pelo `t()`, não só o demo → Tarefa 4.5
46. **Ações em massa (bulk actions)** — checkboxes na lista + barra flutuante para export e cancelamento → Tarefa 4.6
47. **Reabertura de pedido reprovado** — clonar com vínculo ao original + justificativa obrigatória → Tarefa 4.7
48. **Paginação na lista** — 20 por página com cursor do Firestore → Tarefa 4.8
49. **README e docs/ completos** — README em EN para portfólio; docs/ em PT com arquitetura/fluxo/permissões → Tarefa 4.9
50. **Anexos gerais no pedido** — upload para `/pedidos/{id}/anexos/`, validação 10MB, evento na timeline → Tarefa 4.10
51. **Linha do tempo de SLA por etapa** — barra segmentada com tempo por etapa, gargalo destacado → Tarefa 4.11
52. **Saved views** — salvar combinações de filtro com nome, localStorage por usuário → Tarefa 4.12
53. **Refinamentos mobile** — bottom navigation, pull-to-refresh, gestos touch no kanban → Tarefa 4.13

---

## 4. ITENS DELIBERADAMENTE DESCARTADOS

Estes itens foram avaliados e rejeitados. Não implementar, mesmo que pareçam boas ideias no momento:

| Item | Motivo do descarte |
|---|---|
| Auto-save de rascunho do modal | Esforço alto, ganho baixo — o modal de pedido é curto |
| Aprovar/reprovar direto do e-mail | Exige endpoint público com token temporário — risco de segurança desproporcional |
| Onboarding de um-campo-por-vez | Substituído pelo tour guiado (4.3) + tela de boas-vindas (4.4) |
| Twinkle/piscar nas estrelas do fundo | Contraria o Princípio 3 — distrai e tem custo contínuo de performance |
| Indicador de presença / "visto por" | Custo de escrita no Firestore por acesso de view; sem ganho proporcional |
| Orçamento por centro de custo | Fora do propósito — o Praxis organiza compras, não controla finanças |
| Recebimento parcial | Muito complexo (novo modelo de estado) para pouco ganho prático |
| Catálogo de itens recorrentes | Nova entidade e tela de gestão sem retorno claro no MVP |
| Integração com ERP / NF-e | Fora do escopo completamente |
| App nativo iOS/Android | Não é o objetivo; PWA cumpre o papel de instalabilidade |
| Projetos Firebase por CNPJ | Multitenancy real seria uma reescrita — multiempresa por `companyId` é suficiente |
| Parallax, neon, gradientes extras, neomorphism | Empurrariam o design para "cara de IA genérica" — proteger a identidade visual |

---

## 5. PRINCÍPIOS DE PRODUTO (referência rápida)

Derivados da análise do que usuários amam e odeiam em ferramentas concorrentes:

1. **Máximo 2 cliques para qualquer ação comum.** O ódio a Jira/SAP é quase sempre sobre excesso de cliques e lentidão.
2. **A interface deve sempre responder ao toque.** Nenhum elemento clicável pode parecer "morto".
3. **A estética é profundidade sutil, não enfeite.** Refinar fundamentos; nunca empilhar efeitos.
4. **Falhar com elegância.** Qualquer erro mostra mensagem amigável em PT; nenhum erro técnico cru chega ao usuário.
5. **Rastreabilidade como valor central.** O que diferencia o Praxis de "e-mail glorificado" é saber, a qualquer momento, quem fez o quê, quando e por quê.

---
*Fim do documento de decisões complementares.*
