# ESTÁGIO 4 — Refinamento Avançado e Portfólio (Fase 3)

> ## RITUAL DE INÍCIO (OBRIGATÓRIO ANTES DE COMEÇAR)
> 1. Leia `_build/00-PROTOCOLO.md` inteiro.
> 2. Leia `_build/PROGRESS.md` — confirme que os Estágios 0, 1, 2 e 3 estão ✅. Se não estiverem, volte e termine-os primeiro.
> 3. Garanta que o Firebase Emulator está rodando com o seed carregado (`_build/01-AMBIENTE.md`).
> 4. Leia este documento inteiro antes de tocar em qualquer arquivo.
> **git é PROIBIDO. Uma fatia vertical por vez. Rode tudo no emulador. Verifique com checklist. Atualize o PROGRESS.md. Nunca pare no meio de uma tarefa.**

---

## OBJETIVO DESTE ESTÁGIO

O Praxis já está funcional, robusto, polido e com valor de negócio claro. Este estágio adiciona os diferenciais de sofisticação técnica que impressionam recrutadores europeus e tornam o produto memorável como portfólio. São itens de maior esforço que só fazem sentido em cima de uma base sólida — por isso vieram por último.

---

## TAREFA 4.1 — PWA (Progressive Web App)

**Depende de:** Estágios 0–3 completos
**Arquivos:** `index.html`, `manifest.json` (criar), `service-worker.js` (criar), `assets/logo/`

**Fazer:**
- Criar `manifest.json` na raiz com: nome "Praxis", short_name "Praxis", theme_color `#060606`, background_color `#060606`, display `standalone`, icons (os da pasta `assets/logo/` em 192x192 e 512x512), start_url `/`.
- Referenciar o manifest no `<head>` do `index.html`.
- Criar um `service-worker.js` simples com estratégia de cache para os assets estáticos (CSS, JS, fontes, ícones) usando cache-first, e network-first para as chamadas ao Firestore/API. O objetivo é: o app abre mesmo sem internet (mostrando a tela de loading ou a última versão cacheada), não que funcione offline completamente.
- Registrar o service worker em `app.js` apenas em produção (não no emulador, para não interferir no desenvolvimento).
- Com isso, o Praxis pode ser "instalado" como app no celular e desktop — um diferencial forte de portfólio.

**Definição de Pronto:**
- [ ] `manifest.json` existente e referenciado no `<head>`
- [ ] Ícones 192 e 512px existem em `assets/logo/`
- [ ] Service worker registrado e ativo (visível no DevTools → Application)
- [ ] Assets estáticos cacheados (confirmável no DevTools → Cache Storage)
- [ ] No Chrome desktop, o botão de instalar aparece na barra de endereço
- [ ] O service worker NÃO interfere no emulador local (registro condicional)

**Verificar:** No Chrome (em modo produção ou via `firebase serve`), confirme o ícone de instalar. Verifique o DevTools → Application → Service Workers e Manifest.

**Ao concluir:** marque 4.1 ✅ no PROGRESS.md.

---

## TAREFA 4.2 — Command palette (Cmd+K / Ctrl+K)

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/ui.js`, `js/app.js`, `css/components.css`

**Fazer:**
- Implementar uma paleta de comandos ativada por `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) e também por um ícone discreto na topbar.
- O modal da paleta: campo de busca com foco automático ao abrir, lista de resultados com scroll, ESC fecha.
- Comandos suportados:
  - **Navegação:** "Ir para Pedidos", "Ir para Relatórios", "Ir para Configurações"
  - **Ações:** "Novo pedido" (abre o modal), "Alternar tema" (muda dark/light)
  - **Busca de pedidos:** digitar um número ou trecho do título filtra pedidos em tempo real
- Ao selecionar um resultado de busca de pedido, navega para o detalhe.
- Visual: modal centralizado com fundo overlay sutil, campo de busca grande, resultados agrupados por tipo, atalho de teclado indicado (↑↓ para navegar, Enter para confirmar).

**Definição de Pronto:**
- [ ] Cmd+K / Ctrl+K abre a paleta
- [ ] ESC fecha; campo tem foco automático
- [ ] Navegação pelos resultados com ↑↓ e confirmação com Enter
- [ ] Ações de navegação e "Novo pedido" funcionam
- [ ] Busca de pedidos por número/título retorna resultados em tempo real
- [ ] Visual coerente com o design do Praxis

**Verificar:** No emulador, abra a paleta, navegue com teclado, execute cada tipo de ação e faça uma busca de pedido.

**Ao concluir:** marque 4.2 ✅ no PROGRESS.md.

---

## TAREFA 4.3 — Tour guiado no primeiro acesso

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/ui.js`, `js/app.js`, `css/components.css`

**Fazer:**
- Implementar um tour interativo de boas-vindas que aparece na primeira vez que um novo usuário (ou a conta demo) acessa o sistema — e que pode ser re-ativado manualmente (ex: link "Ver tour" nas configurações ou no menu do avatar).
- O tour é uma sequência de tooltips/popovers que destacam elementos-chave da interface, com setas apontando para cada elemento:
  1. Kanban — "Aqui estão todos os pedidos, organizados por etapa do fluxo"
  2. Botão Novo pedido — "Crie um pedido de compra em segundos"
  3. Sino de notificações — "Fique informado de tudo que muda nos seus pedidos"
  4. Toggle dark/light — "Escolha a aparência que prefere"
  5. Configurações — "Gerencie usuários, empresas e categorias"
- Cada passo tem: título, descrição curta, botão "Próximo" e botão "Pular tour".
- O estado "tour visto" é salvo em `localStorage` para não repetir a cada login.
- Para o modo demo, o tour aparece sempre (pois o visitante é novo).

**Definição de Pronto:**
- [ ] Tour aparece no primeiro acesso e no modo demo
- [ ] Os 5 passos destacam os elementos corretos com seta/overlay
- [ ] Botões "Próximo" e "Pular" funcionam
- [ ] "Tour visto" salvo em localStorage; não repete nos próximos logins
- [ ] Pode ser re-ativado manualmente
- [ ] Visual coerente com o Praxis; não bloqueia o uso ao ser pulado

**Verificar:** No emulador, limpe o localStorage e abra o app como demo. Siga o tour completo. Recarregue e confirme que não repete. Ative manualmente e confirme que reaparece.

**Ao concluir:** marque 4.3 ✅ no PROGRESS.md.

---

## TAREFA 4.4 — Tela de boas-vindas no demo

**Depende de:** 4.3
**Arquivos:** `js/auth.js`, `css/views.css`

**Fazer:**
- Antes de entrar no sistema com a conta demo (após selecionar o idioma), exibir uma tela/modal de boas-vindas breve com:
  - O logotipo PR▲XIS em destaque
  - Uma linha de tagline ("Gestão de compras corporativas. Simples, rastreável, elegante.")
  - Três bullets curtos do que dá para fazer ("Crie pedidos e acompanhe cada etapa", "Aprove compras com rastreabilidade completa", "Monitore gastos e prazos em tempo real")
  - Botão "Começar a explorar" que entra no sistema
  - Crédito discreto: "Desenvolvido por Alyssom Fernandes · AFN Systems"
- A tela é leve, elegante, com a estética do Praxis (estrelas no fundo, tipografia JetBrains Mono no título). Não é um onboarding longo — é uma tela de apresentação de 5 segundos.

**Definição de Pronto:**
- [ ] Tela aparece entre a seleção de idioma e a entrada no sistema (só no demo)
- [ ] Logotipo, tagline, bullets e botão presentes
- [ ] Crédito AFN Systems discreto
- [ ] Visual premium com a estética do Praxis
- [ ] "Começar" entra no sistema normalmente

**Verificar:** No emulador, faça o fluxo completo de entrada demo e confirme a tela de boas-vindas entre a seleção de idioma e o kanban.

**Ao concluir:** marque 4.4 ✅ no PROGRESS.md.

---

## TAREFA 4.5 — Tradução EN completa

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/constants.js` (TRADUCOES), todos os arquivos JS que usam `t()`

**Fazer:**
- Completar o objeto `TRADUCOES` em `constants.js` com todas as strings da interface em inglês — não só o modo demo, mas toda a UI: labels de campos, botões, títulos de tela, tooltips, mensagens de erro, empty states, notificações, export labels.
- Garantir que todos os textos hardcoded nos arquivos JS passam pela função `t()`, incluindo as adições dos Estágios 2, 3 e 4.
- O idioma é definido por `sessionStorage.praxisLang` (já existente); confirmar que funciona para usuários reais também (não só demo) — ao selecionar EN, o sistema todo muda.
- Testar a versão EN do começo ao fim.

**Definição de Pronto:**
- [ ] Toda string visível ao usuário está no `TRADUCOES` e usa `t()`
- [ ] Trocar para EN traduz toda a interface, não só partes
- [ ] Nenhum texto hardcoded restante (exceto nome próprio "Praxis" e "AFN Systems")
- [ ] Funciona para usuários reais, não só demo

**Verificar:** No emulador, mude para EN e percorra todas as telas e fluxos confirmando que tudo está traduzido e legível.

**Ao concluir:** marque 4.5 ✅ no PROGRESS.md.

---

## TAREFA 4.6 — Ações em massa (bulk actions)

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/pedidos.js`, `css/components.css`

**Fazer:**
- Na visualização de lista, adicionar checkboxes nos itens para seleção múltipla.
- Ao selecionar 1 ou mais pedidos, aparece uma barra de ações na parte inferior (style: barra flutuante sobre o conteúdo) com ações disponíveis para a seleção:
  - **Export:** "Exportar selecionados (Excel / PDF)"
  - **Cancelar:** "Cancelar selecionados" (com confirmação e motivo — só para perfis autorizados e só em estados canceláveis)
- A barra mostra quantos itens estão selecionados e tem um botão para desmarcar tudo.
- No kanban, bulk actions não se aplicam (muita variedade de estados — só na lista).

**Definição de Pronto:**
- [ ] Checkboxes aparecem na lista ao passar o mouse (ou sempre)
- [ ] Barra de bulk actions aparece ao selecionar
- [ ] Export dos selecionados funciona
- [ ] Cancelamento em massa pede confirmação e aplica nas devidas condições
- [ ] No kanban, não há checkboxes (só na lista)

**Verificar:** No emulador, selecione 3 pedidos na lista e teste o export e o cancelamento em massa.

**Ao concluir:** marque 4.6 ✅ no PROGRESS.md.

---

## TAREFA 4.7 — Reabertura de pedido reprovado

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/pedido-detalhe.js`

**Fazer:**
- Quando um pedido está em "Reprovado", o Solicitante (e Gestor/Supremo) pode clicar em "Reabrir pedido" para criar uma cópia editável do pedido, com vínculo ao pedido original ("Reaberto a partir do #0042").
- O novo pedido começa em "Solicitado", com os mesmos dados do original, mas com campo de "Justificativa de reabertura" obrigatório.
- O pedido original permanece em "Reprovado" (estado terminal imutável) mas exibe um link "Reaberto como #0043".
- Isso fecha o ciclo que hoje termina em beco sem saída.

**Definição de Pronto:**
- [ ] Botão "Reabrir" disponível em pedidos Reprovados para Solicitante/Gestor/Supremo
- [ ] Cria novo pedido em Solicitado com os dados do original
- [ ] Justificativa de reabertura obrigatória
- [ ] Pedido original exibe link para o novo
- [ ] Novo pedido exibe referência ao original

**Verificar:** No emulador, reabra um pedido reprovado do seed e confirme o vínculo entre os dois.

**Ao concluir:** marque 4.7 ✅ no PROGRESS.md.

---

## TAREFA 4.8 — Paginação na lista de pedidos

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/pedidos.js`

**Fazer:**
- Limitar a query de pedidos na lista a 20 por página, usando `limit(20)` e `startAfter(ultimoDoc)` do Firestore para paginação por cursor.
- Exibir controles de paginação simples no rodapé da lista: "← Anterior" / "Próxima →" e indicador da página atual.
- No kanban, manter o carregamento completo por coluna (as colunas têm poucos itens por natureza), paginação só na lista.

**Definição de Pronto:**
- [ ] Lista carrega no máximo 20 pedidos por vez
- [ ] Controles de Anterior/Próxima funcionam
- [ ] A paginação funciona em conjunto com os filtros ativos
- [ ] Kanban não é afetado

**Verificar:** No emulador (o seed tem 30+ pedidos), confirme a paginação na lista e que os filtros se combinam com ela.

**Ao concluir:** marque 4.8 ✅ no PROGRESS.md.

---

## TAREFA 4.9 — README completo para portfólio

**Depende de:** Estágios 0–3 completos (deve descrever o produto finalizado)
**Arquivos:** `README.md`, `docs/arquitetura.md`, `docs/fluxo-pedidos.md`, `docs/permissoes.md`

**Fazer:**
- **`README.md`** (em inglês, voltado para recrutadores e colaboradores): título com logo PR▲XIS, descrição em uma frase, screenshot/GIF do app em ação (referenciar como `assets/demo/preview.gif` — você não pode gravar o GIF, mas crie o placeholder com instrução para o dev), stack técnica, principais funcionalidades em bullets, instruções de setup local (`cp js/config.example.js js/config.js` + `firebase emulators:start` + seed), link de demo ao vivo (placeholder), e crédito "Built by Alyssom Fernandes · AFN Systems".
- **`docs/arquitetura.md`** (em PT): stack detalhada, decisões técnicas (por que Firebase, por que Vanilla JS, por que sem framework), estrutura de arquivos explicada, padrões de código adotados.
- **`docs/fluxo-pedidos.md`** (em PT): diagrama ASCII do ciclo de estados do pedido, regras de transição por perfil, eventos de notificação por transição, edge cases (claim timeout, transação simultânea).
- **`docs/permissoes.md`** (em PT): tabela completa de 6 perfis × todas as ações possíveis (o que cada perfil pode ver e fazer).

**Definição de Pronto:**
- [ ] README.md completo e profissional em inglês
- [ ] `docs/arquitetura.md` com decisões técnicas reais
- [ ] `docs/fluxo-pedidos.md` com diagrama de estados e regras
- [ ] `docs/permissoes.md` com a matriz de permissões completa
- [ ] Nenhum placeholder vazio; o de screenshot/GIF tem instrução clara para o dev

**Verificar:** Leia cada documento e confirme que está completo, sem lacunas, com informação real do sistema construído.

**Ao concluir:** marque 4.9 ✅ no PROGRESS.md.

---

## TAREFA 4.10 — Anexos gerais no pedido

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/pedido-detalhe.js`, `css/components.css`

**Fazer:**
- Adicionar uma seção "Anexos" no detalhe do pedido, permitindo upload de arquivos gerais (além das cotações e comprovantes já existentes): especificações técnicas, fotos de referência, documentos de apoio.
- Storage path: `/pedidos/{pedidoId}/anexos/{arquivo}` (coerente com o padrão existente).
- Tipos aceitos: PDF, imagens (jpg/png/webp), docx/xlsx. Tamanho máximo 10MB por arquivo, com validação e mensagem clara se exceder.
- Lista de anexos mostra: ícone por tipo, nome, tamanho, quem enviou e quando, botão de download. Quem enviou (ou Gestor/Supremo) pode remover (com confirmação).
- Upload de anexo gera evento na timeline unificada (3.5).
- Qualquer perfil envolvido no pedido pode anexar.

**Definição de Pronto:**
- [ ] Upload de PDF, imagem e docx funciona; arquivo acessível depois
- [ ] Arquivo acima de 10MB ou tipo inválido é barrado com mensagem clara
- [ ] Lista mostra metadados e permite download
- [ ] Remoção com confirmação, só por quem enviou ou Gestor/Supremo
- [ ] Evento aparece na timeline

**Verificar:** No emulador (Storage emulator ativo), anexe arquivos de tipos variados, tente um inválido, baixe um, remova um, e confirme o evento na timeline.

**Ao concluir:** marque 4.10 ✅ no PROGRESS.md.

---

## TAREFA 4.11 — Linha do tempo de SLA por etapa

**Depende de:** Estágios 0–3 completos (usa o histórico da timeline 3.5)
**Arquivos:** `js/pedido-detalhe.js`, `js/utils.js`, `css/components.css`

**Fazer:**
- No detalhe do pedido, adicionar uma barra horizontal segmentada mostrando quanto tempo o pedido passou em cada etapa do fluxo, calculado a partir do histórico de transições de status.
- Cada segmento proporcional ao tempo na etapa, com a cor da etapa; hover mostra "Ag. cotação: 2 dias e 4 horas". A etapa atual aparece "em andamento".
- Destacar sutilmente a etapa mais longa (o gargalo) — isso dá ao Gestor um insight imediato de onde o processo trava.
- Exibir apenas quando o pedido tem 2+ transições no histórico (senão não há o que mostrar).

**Definição de Pronto:**
- [ ] Barra segmentada com tempo proporcional por etapa
- [ ] Hover mostra etapa + duração formatada
- [ ] Etapa mais longa destacada; etapa atual marcada como em andamento
- [ ] Não aparece em pedidos recém-criados sem transições

**Verificar:** No emulador, abra pedidos do seed em estados avançados (Pago, Entregue) e confirme a barra com os tempos coerentes ao histórico.

**Ao concluir:** marque 4.11 ✅ no PROGRESS.md.

---

## TAREFA 4.12 — Saved views (visões salvas)

**Depende de:** Estágios 0–3 completos (usa os filtros da 3.8)
**Arquivos:** `js/pedidos.js`, `css/components.css`

**Fazer:**
- Permitir salvar a combinação atual de filtros + ordenação + modo de visualização (kanban/lista) com um nome dado pelo usuário (ex: "Urgentes de TI", "Meus pendentes de aprovação").
- As visões salvas aparecem como pills/itens no topo da tela de pedidos, ao lado dos filtros padrão; clicar aplica tudo de uma vez.
- Gerenciamento simples: renomear e excluir (com confirmação).
- Persistência em `localStorage` por usuário (chave inclui o uid) — decisão deliberada pela simplicidade; anotar no PROGRESS.md.
- Limite razoável (ex: 8 visões) para não poluir a interface.

**Definição de Pronto:**
- [ ] Salvar a combinação atual com nome funciona
- [ ] Clicar numa visão salva aplica filtros + ordenação + modo de uma vez
- [ ] Renomear e excluir funcionam
- [ ] Persiste entre reloads (localStorage por usuário)
- [ ] Limite de visões respeitado com mensagem clara

**Verificar:** No emulador, monte uma combinação de filtros, salve, mude tudo, clique na visão salva e confirme a restauração completa. Recarregue e confirme persistência.

**Ao concluir:** marque 4.12 ✅ no PROGRESS.md.

---

## TAREFA 4.13 — Refinamentos mobile: bottom nav, pull-to-refresh, gestos

**Depende de:** Estágios 0–3 completos
**Arquivos:** `js/app.js`, `js/pedidos.js`, `css/themes.css`, `css/components.css`

**Fazer:**
- **Bottom navigation (<768px):** substituir/complementar o menu hambúrguer por uma barra de navegação fixa na parte inferior com os destinos principais do perfil (Pedidos, Relatórios quando o perfil vê, Notificações, Mais/Config). Ícones SVG + label curto, item ativo destacado em dourado. Respeitar `safe-area-inset-bottom` (iPhones com notch).
- **Pull-to-refresh:** na tela de pedidos em mobile, o gesto de puxar do topo recarrega os dados, com indicador visual (spinner dourado) durante o refresh. Implementação via touch events, sem bibliotecas.
- **Gestos touch no kanban:** garantir scroll horizontal suave com momentum no kanban mobile, sem conflito com o touch drag & drop da 3.2 (drag exige toque longo no card; scroll é o gesto horizontal padrão).

**Definição de Pronto:**
- [ ] Bottom nav aparece só em mobile, com destinos corretos por perfil e item ativo destacado
- [ ] Safe area respeitada (sem sobreposição com a barra do sistema)
- [ ] Pull-to-refresh recarrega com indicador visual
- [ ] Scroll horizontal do kanban suave; drag & drop continua funcionando sem conflito
- [ ] Em desktop, nada disso interfere

**Verificar:** No emulador em modo responsivo (375px), navegue pela bottom nav, faça pull-to-refresh e teste scroll + drag no kanban. Confirme que desktop permanece intacto.

**Ao concluir:** marque 4.13 ✅ no PROGRESS.md.

---

## TAREFA 4.14 — Polimento final e auditoria de regressão

**Depende de:** todas as tarefas do Estágio 4
**Arquivos:** todos

**Fazer:**
- Percorrer o app inteiro como cada um dos 6 perfis, em dark e em light, anotando qualquer inconsistência visual ou funcional.
- Corrigir qualquer pequena divergência encontrada (um ícone mal alinhado, um texto que não passa pelo `t()`, um hover que perdeu efeito, etc.).
- Confirmar que `console.error` real não aparece no console durante o uso normal.
- Confirmar que nenhuma string de texto está hardcoded fora do `TRADUCOES`.
- Confirmar que nenhum `alert/confirm/prompt` nativo existe.
- Confirmar que a pasta `_build/emulator-data` está no `.gitignore`.

**Definição de Pronto:**
- [ ] App percorrido como cada perfil em dark e light sem inconsistências
- [ ] Console limpo durante uso normal
- [ ] Zero strings hardcoded fora de TRADUCOES
- [ ] Zero nativos de UI
- [ ] `.gitignore` completo

**Verificar:** Percurso manual completo conforme descrito.

**Ao concluir:** marque 4.14 ✅ no PROGRESS.md.

---

## ITENS DELIBERADAMENTE FORA DO ESCOPO (não implementar)

Para evitar deriva, estes itens foram avaliados e descartados conscientemente. **Não os implemente**, mesmo que pareçam boas ideias:

- **Auto-save de rascunho do modal de pedido** — esforço/complexidade de estado maior que o ganho; o modal é curto.
- **Aprovar/reprovar direto do e-mail** — exigiria endpoint público com token; risco de segurança alto demais para o ganho.
- **Onboarding de um-campo-por-vez** — substituído pela combinação tour guiado (4.3) + tela de boas-vindas (4.4), que cumprem o mesmo papel.
- **Twinkle (piscar) nas estrelas do fundo** — contraria o Princípio 3 (profundidade sutil, não enfeite); risco de distrair e custo contínuo de performance.
- **Indicador de presença / "visto por"** — custo de escrita no Firestore desproporcional ao valor.
- **Orçamento por centro de custo, recebimento parcial, catálogo de itens** — fora do propósito da ferramenta (organizar compras, não controle financeiro/estoque).

---

## SMOKE TEST FINAL DO ESTÁGIO 4 (SMOKE TEST GERAL DO SISTEMA)

Este é o smoke test mais completo — cobre o sistema inteiro. Todos no emulador, todos devem passar:

**Fundação (Estágio 0):**
1. [ ] App sobe, seed popula, estrelas no fundo
2. [ ] Login dos 6 perfis; logout; demo PT/EN
3. [ ] Aprovador sem dados financeiros; estados de erro amigáveis

**Fluxo de pedido (Estágio 1):**
4. [ ] Caminho feliz completo ponta a ponta
5. [ ] Reprovação, cancelamento, liberar claim funcionam
6. [ ] Cotações, comentários, parcelas completos
7. [ ] Duplo-clique não duplica registros

**Demo impecável (Estágio 2):**
8. [ ] Count-up, skeleton, animações, empty states, SLA badges
9. [ ] Banner de demo; notificações em tempo real
10. [ ] Acessibilidade: teclado, ARIA, contraste, reduzir-movimento
11. [ ] XSS neutralizado; formulários validam
12. [ ] Tap feedback; tooltips; blur suave; glow dos cards

**Evolução funcional (Estágio 3):**
13. [ ] Número sequencial único nos pedidos
14. [ ] Drag & drop com regras de negócio respeitadas
15. [ ] Comparador de cotações; badge de savings
16. [ ] Timeline unificada; timestamps relativos; auditoria de campo
17. [ ] Filtros e ordenação; export PDF individual
18. [ ] Gráfico temporal; indicador não-lido; home contextual; optimistic UI

**Refinamento (Estágio 4):**
19. [ ] PWA instalável (manifest + service worker)
20. [ ] Command palette abre, busca e navega por teclado
21. [ ] Tour guiado no demo; tela de boas-vindas
22. [ ] Tradução EN completa da interface toda
23. [ ] Bulk actions na lista (export e cancelar)
24. [ ] Reabertura de pedido reprovado com vínculo
25. [ ] Paginação na lista de pedidos
26. [ ] README e docs/ completos
27. [ ] Anexos gerais: upload/validação/download/remoção; evento na timeline
28. [ ] Barra de SLA por etapa nos pedidos com histórico; gargalo destacado
29. [ ] Saved views salvam e restauram filtros + ordenação + modo
30. [ ] Mobile: bottom nav por perfil, pull-to-refresh, scroll do kanban sem conflito com drag

---

## FIM DO ESTÁGIO 4 — RITUAL DE ENCERRAMENTO FINAL

Quando todas as tarefas estiverem ✅ e o smoke test final passar:

1. Marque o Estágio 4 inteiro como ✅ no PROGRESS.md.
2. Apresente ao desenvolvedor um **relatório final completo**:
   - Resumo de tudo que foi construído, estágio por estágio
   - Lista de decisões técnicas tomadas em ambiguidades (do PROGRESS.md)
   - O que foi testado no emulador e como foi verificado

3. **Ensine os testes manuais finais que só o desenvolvedor pode fazer:**

   **E-mail real (Resend):**
   - Com o projeto publicado no Firebase e a chave Resend configurada, execute cada transição que dispara e-mail (aprovar, reprovar, cancelar, vencimento de parcela) e confirme que o e-mail chega, o layout está correto e os links funcionam.

   **Funções agendadas:**
   - `checkClaimTimeout`: deixe um pedido em Solicitado por mais de 48 horas sem comprador e confirme que o Gestor recebe notificação.
   - `checkParcelasVencendo`: chegue ao dia anterior ao vencimento de uma parcela e confirme a notificação ao Financeiro.
   - `demoReset`: no domingo após o deploy, confirme que os dados demo foram resetados.
   - (Alternativa mais rápida: chame as funções manualmente pelo Firebase Console e confirme o efeito.)

   **PWA no celular físico:**
   - Acesse o app publicado no Chrome mobile. Confirme o banner "Adicionar à tela inicial". Instale e abra como app (sem a barra do navegador).

   **Screenshot e GIF para o README:**
   - Grave um GIF de 20-30 segundos mostrando: kanban com pedidos → abrir detalhe → aprovar → notificação chegando. Salve como `assets/demo/preview.gif`. Atualize o README com a referência.

   **Deploy final:**
   - `firebase deploy` completo (Hosting + Functions + Firestore rules + indexes) e confirme que tudo funciona no domínio real.

4. **Parabéns — o Praxis está no ápice. O sistema está completo.**

---
*Fim do Estágio 4 e do plano de construção completo do Praxis.*
