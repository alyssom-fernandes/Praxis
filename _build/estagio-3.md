# ESTÁGIO 3 — Evolução Funcional (Fase 2)

> ## RITUAL DE INÍCIO (OBRIGATÓRIO ANTES DE COMEÇAR)
> 1. Leia `_build/00-PROTOCOLO.md` inteiro.
> 2. Leia `_build/PROGRESS.md` — confirme que os Estágios 0, 1 e 2 estão ✅. Se não estiverem, volte e termine-os primeiro.
> 3. Garanta que o Firebase Emulator está rodando com o seed carregado (`_build/01-AMBIENTE.md`).
> 4. Leia este documento inteiro antes de tocar em qualquer arquivo.
> **git é PROIBIDO. Uma fatia vertical por vez. Rode tudo no emulador. Verifique com checklist. Atualize o PROGRESS.md. Nunca pare no meio de uma tarefa.**

---

## OBJETIVO DESTE ESTÁGIO

A base está sólida, polida e testada. Agora o Praxis ganha funcionalidades que agregam valor real de negócio — coisas que fazem gestores e compradores quererem usar o sistema no dia a dia, e que mostram ao recrutador que você entende procurement de verdade. Cada tarefa aqui entrega algo tangível que a demo pode mostrar.

---

## TAREFA 3.1 — Número sequencial legível do pedido (#0001)

**Depende de:** Estágios 0–2 completos
**Arquivos:** `functions/src/triggers.js`, `functions/src/utils.js`, `js/pedidos.js`, `js/pedido-detalhe.js`, `css/components.css`

**Fazer:**
- Criar um contador atômico em Firestore: documento `_meta/contadores` com campo `totalPedidos` (começa em 0).
- Ao criar um pedido (via Cloud Function ou direto), usar `runTransaction` para incrementar o contador e gravar o número sequencial formatado (`#0001`, `#0042`) no campo `numeroPedido` do pedido.
- Exibir o `numeroPedido` em destaque no card do kanban (acima do título), no detalhe (no cabeçalho/breadcrumb), e nas listas.
- No seed, popular `numeroPedido` para todos os pedidos existentes, mantendo consistência.
- Atualizar `_meta/contadores` no seed para refletir o total do seed.

**Definição de Pronto:**
- [ ] Novo pedido recebe `numeroPedido` sequencial único (ex: `#0031` se já há 30)
- [ ] O número aparece no card do kanban, no detalhe e na lista
- [ ] Dois pedidos criados simultaneamente recebem números diferentes (transaction garante unicidade)
- [ ] Pedidos do seed têm `numeroPedido` preenchido

**Verificar:** No emulador, crie 3 pedidos em sequência e confirme os números incrementando. Tente 2 simultâneos e confirme unicidade.

**Ao concluir:** marque 3.1 ✅ no PROGRESS.md.

---

## TAREFA 3.2 — Drag & drop no kanban

**Depende de:** 3.1
**Arquivos:** `js/pedidos.js`, `css/components.css`

**Fazer:**
- Implementar drag & drop nos cards do kanban usando a API nativa HTML5 (`draggable`, `dragstart`, `dragover`, `drop`) — sem bibliotecas externas.
- **Regras críticas de negócio que devem ser respeitadas:**
  - O arrastar só é permitido para transições de status válidas (o mesmo fluxo que os botões já respeitam — um comprador não pode arrastar um pedido para "Aprovado").
  - Colunas que o usuário não pode mover para ficam visualmente bloqueadas durante o drag (cursor proibido).
  - Ao soltar num destino inválido, o card volta à posição original com uma animação suave e um toast explicativo.
  - Ao soltar num destino válido, a transição de status acontece com todas as validações normais (ex: se mover para "Em aprovação" precisar de cotação indicada, verificar isso).
- Feedback visual durante o drag: card arrastado com opacidade reduzida, coluna de destino válida com highlight sutil.
- Em mobile, o drag & drop deve funcionar com touch events (ou ser desabilitado graciosamente com os botões normais como fallback).

**Definição de Pronto:**
- [ ] Arrastar e soltar num destino válido executa a transição de status
- [ ] Arrastar para destino inválido retorna o card com toast explicativo
- [ ] As mesmas permissões por perfil se aplicam (comprador não arrasta para Aprovado)
- [ ] Feedback visual claro durante o drag
- [ ] Em mobile: touch drag funciona, ou botões normais são o fallback

**Verificar:** No emulador, teste drag & drop com diferentes perfis, tentando transições válidas e inválidas, confirmando que o fluxo de negócio é respeitado em ambos os casos.

**Ao concluir:** marque 3.2 ✅ no PROGRESS.md.

---

## TAREFA 3.3 — Comparador de cotações lado a lado

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedido-detalhe.js`, `css/components.css`

**Fazer:**
- Quando um pedido tem 2 ou mais cotações, adicionar um botão "Comparar cotações" (ou similar) que abre um modal/painel com as cotações em colunas paralelas: fornecedor, valor, prazo de entrega, condições de pagamento.
- Destacar visualmente: a cotação de menor valor com badge/cor de destaque; a cotação indicada como preferida com borda dourada.
- Se houver apenas 1 cotação, o botão não aparece (sem sentido comparar).

**Definição de Pronto:**
- [ ] Com 2+ cotações, botão "Comparar" aparece e abre o comparador
- [ ] As cotações ficam em colunas lado a lado com os campos-chave
- [ ] Menor valor destacado; cotação indicada destacada com borda gold
- [ ] Com 1 cotação, o botão não aparece

**Verificar:** No emulador, abra um pedido do seed que tem 3 cotações e teste o comparador.

**Ao concluir:** marque 3.3 ✅ no PROGRESS.md.

---

## TAREFA 3.4 — Indicador de savings (economia) por pedido

**Depende de:** 3.3
**Arquivos:** `js/pedido-detalhe.js`, `js/relatorios.js`, `css/components.css`

**Fazer:**
- Calcular savings como: valor da cotação mais cara recebida − valor da cotação indicada/escolhida. Apenas quando há 2+ cotações.
- Exibir um badge verde discreto no detalhe do pedido (ex: "Economia: R$ 1.200") quando o pedido está em Aprovado, Comprado, Entregue ou Pago.
- No dashboard de relatórios, adicionar ao card de "Total gasto" (ou em card separado) o total acumulado de savings das compras com múltiplas cotações. Apenas para perfis que veem dados financeiros.
- Este é o "número que justifica a ferramenta" para a diretoria — exibir de forma clara e em destaque.

**Definição de Pronto:**
- [ ] Badge de economia no detalhe para pedidos com 2+ cotações nos estados avançados
- [ ] Valor calculado corretamente (maior cotação − indicada)
- [ ] Total de savings no dashboard (para Gestor/Supremo/Financeiro)
- [ ] Não aparece quando há só 1 cotação ou no início do fluxo

**Verificar:** No emulador, abra pedidos do seed com múltiplas cotações e confirme o badge. Abra o dashboard como Gestor e confirme o total de savings.

**Ao concluir:** marque 3.4 ✅ no PROGRESS.md.

---

## TAREFA 3.5 — Activity feed unificado no detalhe do pedido

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedido-detalhe.js`, `css/components.css`

**Fazer:**
- Unificar o histórico de status e os comentários em uma única timeline cronológica no detalhe do pedido, intercalando os dois tipos de evento em ordem de tempo.
- Cada item da timeline tem: timestamp relativo (ex: "há 2 horas"), avatar do autor, e um visual distinto por tipo:
  - **Mudança de status:** ícone de transição + "Pedido movido para Aprovado por João"
  - **Comentário:** balão de fala, texto completo, com @menções destacadas
  - **Cotação adicionada:** ícone de cotação + "Cotação de Fornecedor X adicionada por Maria"
  - **Comprovante enviado:** ícone de documento + "Comprovante da parcela 1 enviado por Carlos"
- Este é o "activity feed" padrão das melhores ferramentas (Linear, Notion, Jira moderno). Substitui os dois blocos separados atuais.

**Definição de Pronto:**
- [ ] Timeline única intercala status, comentários, cotações e comprovantes em ordem cronológica
- [ ] Cada tipo tem visual distinto e claro
- [ ] Timestamps relativos ("há X minutos/horas/dias")
- [ ] @menções destacadas nos comentários
- [ ] Os dois blocos separados anteriores foram substituídos (sem duplicação)

**Verificar:** No emulador, abra um pedido com histórico rico do seed e confirme a timeline unificada e cronológica.

**Ao concluir:** marque 3.5 ✅ no PROGRESS.md.

---

## TAREFA 3.6 — Timestamps relativos em todo o sistema

**Depende de:** 3.5
**Arquivos:** `js/utils.js`, e todos os pontos que exibem datas

**Fazer:**
- Criar/aprimorar em `utils.js` a função `formatarDataRelativa(timestamp)` que retorna "há 5 minutos", "há 2 horas", "há 3 dias", "há 1 mês", etc., ou a data por extenso quando for mais antigo (ex: "12 jan").
- Ao passar o mouse (hover/title), mostrar a data e hora exata.
- Aplicar em: timestamps da timeline do pedido (3.5), data de criação nos cards do kanban, "criado em" no detalhe, timestamps de notificações.

**Definição de Pronto:**
- [ ] Datas recentes aparecem como relativas ("há X")
- [ ] Datas antigas aparecem por extenso
- [ ] Hover/title mostra a data/hora exata
- [ ] Aplicado consistentemente em pedidos, timeline e notificações

**Verificar:** No emulador, confirme os timestamps relativos nos cards e na timeline. Passe o mouse e veja a data exata.

**Ao concluir:** marque 3.6 ✅ no PROGRESS.md.

---

## TAREFA 3.7 — Auditoria campo-a-campo (field-level audit)

**Depende de:** 3.5
**Arquivos:** `js/pedido-detalhe.js`, `functions/src/triggers.js`, `css/components.css`

**Fazer:**
- Registrar na timeline (activity feed) quando campos sensíveis do pedido são editados após criação: título, descrição, valor estimado, data necessária, urgência, categoria.
- O registro deve mostrar: campo alterado + valor anterior + valor novo + quem alterou + quando. Ex: "Valor estimado alterado de R$ 5.000 para R$ 5.500 por João".
- Implementar via interceptação nos updates: quando um update de pedido inclui mudança nesses campos, gravar um evento de auditoria na subcoleção `historico`.
- Isso fecha a lacuna que as 5 IAs apontaram na validação da spec: o Praxis passa a ter rastreabilidade real, não só de status mas de conteúdo.

**Definição de Pronto:**
- [ ] Editar título/descrição/valor/data/urgência/categoria gera evento de auditoria na timeline
- [ ] O evento mostra valor anterior, novo, autor e timestamp
- [ ] Aparece na timeline unificada (3.5) no lugar cronológico correto
- [ ] Campos não-sensíveis (ex: metadados internos) não geram evento

**Verificar:** No emulador, edite campos de um pedido e confirme os eventos de auditoria na timeline.

**Ao concluir:** marque 3.7 ✅ no PROGRESS.md.

---

## TAREFA 3.8 — Filtros adicionais e ordenação na lista

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedidos.js`, `css/components.css`

**Fazer:**
- Adicionar filtros adicionais na tela de pedidos (além dos pills existentes): filtro por categoria (dropdown), filtro por empresa (dropdown, para perfis que veem múltiplas empresas), filtro por comprador atribuído.
- Na visualização de lista, tornar os cabeçalhos das colunas principais clicáveis para ordenação (ex: ordenar por data de criação, por valor, por prazo). Indicar visualmente qual coluna está ordenada e em qual direção.
- Os filtros e ordenação combinam entre si (ex: filtro de categoria + ordenação por prazo).

**Definição de Pronto:**
- [ ] Filtros de categoria, empresa (quando aplicável) e comprador funcionam
- [ ] Cabeçalhos da lista são clicáveis para ordenação
- [ ] Filtros e ordenação se combinam
- [ ] O estado dos filtros é preservado ao voltar para a tela

**Verificar:** No emulador, aplique combinações de filtros e ordene por diferentes colunas confirmando resultados corretos.

**Ao concluir:** marque 3.8 ✅ no PROGRESS.md.

---

## TAREFA 3.9 — Exportar pedido individual em PDF

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedido-detalhe.js`, `js/utils.js`

**Fazer:**
- Adicionar um botão "Exportar PDF" no detalhe do pedido (visível para Gestor, Supremo, Financeiro e Comprador).
- Gerar via jsPDF (já importado no projeto) um PDF com: cabeçalho Praxis + numeroPedido, todos os metadados, a timeline completa de eventos, as cotações (valores, fornecedores, indicação) e as parcelas. Layout limpo e legível.
- O arquivo baixa com nome `pedido-{numeroPedido}.pdf`.

**Definição de Pronto:**
- [ ] Botão "Exportar PDF" aparece para os perfis corretos
- [ ] PDF gerado contém todas as informações relevantes do pedido
- [ ] Nome do arquivo inclui o numeroPedido
- [ ] Layout legível e profissional

**Verificar:** No emulador, exporte um pedido completo do seed e abra o PDF confirmando os dados.

**Ao concluir:** marque 3.9 ✅ no PROGRESS.md.

---

## TAREFA 3.10 — Gráfico temporal no dashboard

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/relatorios.js`, `css/components.css`

**Fazer:**
- Adicionar um gráfico de linha (usando a lib de gráficos já presente no projeto) mostrando o valor total de pedidos aprovados/pagos por mês nos últimos 6 meses.
- O eixo X são os meses; o eixo Y é o valor em reais. Tooltip ao hover mostra o mês e valor exato.
- Apenas para perfis que veem dados financeiros (`podeVerFinanceiro`).
- Visual alinhado com o design: linha dourada, fundo transparente sobre o card escuro, sem bordas intrusivas.

**Definição de Pronto:**
- [ ] Gráfico de linha temporal aparece no dashboard para Gestor/Supremo/Financeiro
- [ ] Dados são os últimos 6 meses a partir de hoje
- [ ] Tooltip no hover mostra mês e valor
- [ ] Visual coerente com o design do Praxis

**Verificar:** No emulador, abra Relatórios como Gestor e confirme o gráfico. Como Aprovador, confirme que não aparece.

**Ao concluir:** marque 3.10 ✅ no PROGRESS.md.

---

## TAREFA 3.11 — Indicador de comentário não lido no card

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedidos.js`, `js/pedido-detalhe.js`

**Fazer:**
- Quando um pedido tem comentários novos desde a última vez que o usuário o abriu, exibir um indicador discreto (ponto dourado ou badge pequeno) no card do kanban/lista.
- Ao abrir o detalhe, o indicador some para aquele usuário.
- Implementação sugerida: gravar `vistoPor: {userId: timestamp}` no pedido; ao comparar com o `updatedAt` do pedido ou o timestamp do último comentário, determinar se há novidade para aquele usuário.

**Definição de Pronto:**
- [ ] Pedido com comentário novo desde a última visita mostra indicador no card
- [ ] Abrir o detalhe marca como visto (indicador some)
- [ ] Cada usuário tem seu próprio estado de "visto"

**Verificar:** No emulador, adicione um comentário num pedido como usuário A. Como usuário B, confirme o indicador no card; abra o detalhe e confirme que o indicador some.

**Ao concluir:** marque 3.11 ✅ no PROGRESS.md.

---

## TAREFA 3.12 — Home contextual "Meus pendentes"

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedidos.js`, `js/app.js`

**Fazer:**
- Adicionar um filtro rápido "Meus pendentes" como a primeira opção dos pills de filtro (ou como a view padrão ao entrar no sistema pela primeira vez num dia), que mostra exatamente o que depende do usuário logado:
  - **Aprovador:** pedidos em "Em aprovação" aguardando sua aprovação
  - **Comprador:** pedidos em "Solicitado" sem comprador + pedidos em "Ag. cotação" assumidos por ele
  - **Financeiro:** pedidos em "Entregue" aguardando pagamento + parcelas vencendo
  - **Solicitante:** seus pedidos em andamento (não terminais)
  - **Gestor/Supremo:** pedidos urgentes + pedidos parados há mais de 48h
- O filtro mostra um número no pill quando há pendências ("Meus pendentes (3)").

**Definição de Pronto:**
- [ ] Pill "Meus pendentes" existe e mostra o número de pendências
- [ ] O conteúdo filtrado é contextual ao perfil do usuário logado
- [ ] Com zero pendências, o número não aparece (ou aparece como "0")
- [ ] Cada perfil vê o conjunto correto de pendências

**Verificar:** No emulador, logue com cada perfil e confirme que "Meus pendentes" mostra o conjunto correto de pedidos.

**Ao concluir:** marque 3.12 ✅ no PROGRESS.md.

---

## TAREFA 3.13 — Optimistic UI nas ações principais

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedido-detalhe.js`, `js/pedidos.js`

**Fazer:**
- Nas ações mais frequentes (comentar, marcar notificação como lida, marcar parcela paga), aplicar optimistic UI: a UI atualiza imediatamente ao clicar, sem esperar a confirmação do Firestore. Se a operação falhar, reverter a mudança e mostrar toast de erro.
- Para ações com consequências mais sérias (aprovar, reprovar, assumir), manter o loading state (tarefa 2.4) em vez do optimistic, pois a reversão seria confusa.
- Isso dá ao app a sensação de velocidade que caracteriza Linear e ferramentas modernas.

**Definição de Pronto:**
- [ ] Comentar aparece instantaneamente na timeline antes da confirmação do servidor
- [ ] Marcar notificação como lida atualiza o badge imediatamente
- [ ] Se a operação falhar, a UI reverte e toast de erro aparece
- [ ] Ações sérias (aprovar, reprovar) continuam com loading state, não optimistic

**Verificar:** No emulador, comente num pedido e observe a aparição instantânea. Simule uma falha (ex: desconecte brevemente) e confirme o rollback.

**Ao concluir:** marque 3.13 ✅ no PROGRESS.md.

---

## TAREFA 3.14 — Gráfico de pizza por categoria

**Depende de:** 3.10
**Arquivos:** `js/relatorios.js`, `css/components.css`

**Fazer:**
- Adicionar ao dashboard um gráfico de pizza/donut mostrando a distribuição de gastos por categoria (dos pedidos aprovados/comprados/pagos do período filtrado).
- Usar as cores das categorias (cada categoria já tem cor no cadastro); tooltip no hover mostra categoria, valor e percentual.
- Apenas para perfis com `podeVerFinanceiro`. Posicionar ao lado ou abaixo do gráfico de barras existente, mantendo o layout equilibrado.
- Estilo donut (com furo central) combina melhor com a estética do Praxis que pizza cheia.

**Definição de Pronto:**
- [ ] Donut de gastos por categoria no dashboard para perfis financeiros
- [ ] Usa as cores cadastradas das categorias
- [ ] Tooltip com categoria, valor e percentual
- [ ] Respeita o filtro de período/empresa ativo
- [ ] Aprovador não vê

**Verificar:** No emulador, abra Relatórios como Gestor e confirme o donut com os dados do seed; mude o filtro de período e confirme a atualização.

**Ao concluir:** marque 3.14 ✅ no PROGRESS.md.

---

## TAREFA 3.15 — Duplicar pedido

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/pedido-detalhe.js`, `js/pedidos.js`

**Fazer:**
- Adicionar a ação "Duplicar pedido" no detalhe (menu de ações secundárias), disponível para o Solicitante do pedido e para Gestor/Supremo, em qualquer estado.
- Duplicar abre o modal de novo pedido pré-preenchido com os dados do original (título, descrição, categoria, quantidade, unidade, valor estimado, empresa) — mas SEM copiar: status, comprador, cotações, aprovações, histórico, comentários, parcelas.
- O usuário pode editar antes de enviar. O novo pedido nasce em "Solicitado" como qualquer outro, com novo `numeroPedido`.
- Útil para compras recorrentes (ex: material de escritório mensal).

**Definição de Pronto:**
- [ ] Ação "Duplicar" disponível para os perfis corretos
- [ ] Modal abre pré-preenchido com os dados certos (e sem os dados de fluxo)
- [ ] O novo pedido nasce em Solicitado com numeroPedido próprio
- [ ] O original permanece intocado

**Verificar:** No emulador, duplique um pedido Pago do seed, edite um campo, envie, e confirme o novo pedido independente em Solicitado.

**Ao concluir:** marque 3.15 ✅ no PROGRESS.md.

---

## TAREFA 3.16 — @menção com autocomplete real

**Depende de:** Estágios 0–2 completos (a 1.6 validou a base)
**Arquivos:** `js/pedido-detalhe.js`, `css/components.css`

**Fazer:**
- Evoluir a @menção dos comentários para o padrão Slack/Linear: ao digitar `@` no campo de comentário, abrir um dropdown flutuante com os usuários da empresa do pedido, filtrando em tempo real conforme se digita.
- Navegável por teclado (↑↓ + Enter) e por clique. ESC fecha o dropdown sem perder o texto.
- Ao selecionar, insere a menção formatada no texto; ao enviar, a menção fica destacada em dourado e o usuário mencionado é notificado (comportamento já existente da 1.6).
- O dropdown mostra avatar + nome de cada usuário.

**Definição de Pronto:**
- [ ] Digitar `@` abre dropdown de usuários filtrável em tempo real
- [ ] Navegação por teclado e clique funcionam
- [ ] Menção inserida fica destacada e notifica o mencionado
- [ ] ESC fecha sem perder o texto digitado
- [ ] Só lista usuários com acesso à empresa do pedido

**Verificar:** No emulador, comente usando o autocomplete completo (digitar @, filtrar, selecionar por teclado) e confirme a notificação do mencionado.

**Ao concluir:** marque 3.16 ✅ no PROGRESS.md.

---

## TAREFA 3.17 — Tratamento de offline e erro de rede

**Depende de:** Estágios 0–2 completos
**Arquivos:** `js/app.js`, `js/ui.js`, `css/components.css`

**Fazer:**
- Detectar perda de conexão (`navigator.onLine` + eventos `online`/`offline`) e exibir um banner fino e discreto: "Sem conexão — algumas ações podem não funcionar". Ao reconectar, o banner muda brevemente para "Conexão restabelecida" e some.
- Quando uma escrita no Firestore falhar por rede, mostrar toast claro ("Falha de conexão. Tente novamente.") em vez de erro técnico — e garantir que a UI não fica travada em loading infinito (timeout razoável nos loading states).
- Não é para funcionar offline (isso é o PWA do Estágio 4) — é para falhar com elegância e informar o usuário.

**Definição de Pronto:**
- [ ] Banner de offline aparece ao perder conexão e some ao reconectar
- [ ] Escritas que falham por rede mostram toast amigável
- [ ] Nenhum botão fica em loading infinito após falha
- [ ] O app não quebra nem perde estado ao oscilar a conexão

**Verificar:** No emulador, use o DevTools (Network → Offline) para simular queda de rede, tente uma ação, e confirme banner + toast + recuperação ao religar.

**Ao concluir:** marque 3.17 ✅ no PROGRESS.md.

---

## SMOKE TEST DO ESTÁGIO 3 (rodar antes de fechar o estágio)

Inclui regressão dos Estágios 0, 1 e 2. Todos no emulador, todos devem passar:

**Regressão (Estágios 0–2):**
1. [ ] Fluxo completo de pedido ainda funciona
2. [ ] Todas as permissões por perfil corretas
3. [ ] Polimento visual (skeleton, animações, empty states, SLA) intacto
4. [ ] Acessibilidade (foco, ARIA, reduzir-movimento) intacta

**Novos do Estágio 3:**
5. [ ] Novo pedido recebe numeroPedido sequencial único
6. [ ] Drag & drop respeita o fluxo e as permissões; destino inválido devolve o card
7. [ ] Comparador de cotações abre com 2+ cotações; menor valor e indicada destacados
8. [ ] Badge de savings no detalhe e total no dashboard
9. [ ] Timeline unificada intercala status/comentários/cotações em ordem cronológica
10. [ ] Timestamps relativos com data exata no hover
11. [ ] Editar campo sensível gera evento de auditoria na timeline
12. [ ] Filtros de categoria/empresa/comprador funcionam; ordenação de colunas funciona
13. [ ] Export PDF do pedido individual baixa com todos os dados
14. [ ] Gráfico temporal no dashboard para perfis financeiros
15. [ ] Indicador de comentário não lido no card; some ao abrir
16. [ ] "Meus pendentes" mostra o conjunto certo por perfil
17. [ ] Optimistic UI em comentar e notificações; rollback em falha
18. [ ] Donut de gastos por categoria para perfis financeiros
19. [ ] Duplicar pedido pré-preenche sem copiar dados de fluxo
20. [ ] @menção com dropdown filtrável navegável por teclado
21. [ ] Banner de offline e falha elegante em queda de rede

---

## FIM DO ESTÁGIO 3 — RITUAL DE ENCERRAMENTO

Quando todas as tarefas estiverem ✅ e o smoke test passar:

1. Marque o Estágio 3 inteiro como ✅ no PROGRESS.md.
2. Apresente ao desenvolvedor um resumo do que foi feito.
3. **Ensine os testes manuais que só ele pode fazer.** Para o Estágio 3:
   - **Drag & drop em celular físico:** o touch drag pode se comportar diferente do emulador de mobile do navegador. Peça para testar num dispositivo real.
   - **Export PDF gerado:** abrir o PDF exportado e verificar se o layout ficou legível e profissional no leitor de PDF dele.
   - **Savings e gráfico temporal:** confirmar que os números fazem sentido com os dados reais (não só os fictícios do seed).
4. Avise que o Estágio 3 está concluído e que você está pronto para receber o **documento do Estágio 4**.
5. **PARE e aguarde** o desenvolvedor adicionar `_build/estagio-4.md` e pedir para você lê-lo.

---
*Fim do Estágio 3.*
