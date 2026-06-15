# ESTÁGIO 1 — Blindar o Fluxo de Pedido

> ## RITUAL DE INÍCIO (OBRIGATÓRIO ANTES DE COMEÇAR)
> 1. Leia `_build/00-PROTOCOLO.md` inteiro.
> 2. Leia `_build/PROGRESS.md` — confirme que o Estágio 0 está ✅. Se não estiver, volte e termine o Estágio 0 primeiro.
> 3. Garanta que o Firebase Emulator está rodando com o seed carregado (`_build/01-AMBIENTE.md`).
> 4. Leia este documento inteiro antes de tocar em qualquer arquivo.
> **git é PROIBIDO. Uma fatia vertical por vez. Rode tudo no emulador. Verifique com checklist. Atualize o PROGRESS.md. Nunca pare no meio de uma tarefa.**

---

## OBJETIVO DESTE ESTÁGIO

Garantir que o coração do sistema — o ciclo de vida completo de um pedido — funcione perfeitamente de ponta a ponta, com todos os caminhos (feliz, reprovação, cancelamento, liberação de claim) testados exaustivamente no emulador. Ao fim deste estágio, você poderá pegar QUALQUER pedido e levá-lo por todo o fluxo sem nenhum bug.

Não é sobre estética nem funcionalidades novas — é sobre robustez absoluta do fluxo central. Isto precede tudo porque todas as funcionalidades das próximas fases dependem de um fluxo sólido.

**Não implemente nada das Fases 1, 2 ou 3 aqui.**

---

## TAREFA 1.1 — Roteiro de aceitação: caminho feliz completo

**Depende de:** Estágio 0 completo
**Arquivos:** `js/pedidos.js`, `js/pedido-detalhe.js` (corrigir o que o teste revelar)

**Fazer:**
Executar no emulador o ciclo completo de um pedido, do início ao fim, corrigindo qualquer falha encontrada em cada etapa. O roteiro:

1. Logado como **Solicitante**, criar um pedido novo (preencher todos os campos do modal). Confirmar que aparece em "Solicitado".
2. Logado como **Comprador**, abrir o pedido e clicar "Assumir". Confirmar que vai para "Ag. cotação" e que o comprador foi registrado.
3. Ainda como Comprador, adicionar 3 cotações (fornecedor, valor, prazo, condições, arquivo). Indicar uma como preferida.
4. Mover o pedido para "Em aprovação".
5. Logado como **Aprovador**, abrir o pedido, ver as cotações, e clicar "Aprovar". Confirmar que vai para "Aprovado".
6. Logado como **Comprador**, clicar "Executar compra" — preencher fornecedor vencedor, valor final, condição de pagamento, dataCompra e parcelas. Confirmar que vai para "Comprado".
7. Confirmar entrega (como Comprador ou Solicitante). Confirmar que vai para "Entregue" e que dataEntrega foi gravada.
8. Logado como **Financeiro**, confirmar o pagamento das parcelas. Confirmar que vai para "Pago".

A cada etapa, se algo falhar (botão não aparece, transição não acontece, dado não grava, erro no console), corrija antes de seguir.

**Definição de Pronto:**
- [ ] O ciclo completo dos 8 passos roda sem nenhum erro
- [ ] Cada transição de status grava os campos corretos (visível na UI do emulador)
- [ ] O histórico do pedido registra cada transição com autor e timestamp
- [ ] Em cada etapa, só o perfil correto vê o botão de ação correspondente

**Verificar:** Execute o roteiro inteiro no emulador, do passo 1 ao 8, com os perfis indicados.

**Ao concluir:** marque 1.1 ✅ no PROGRESS.md.

---

## TAREFA 1.2 — Roteiro de aceitação: reprovação

**Depende de:** 1.1
**Arquivos:** `js/pedido-detalhe.js` (corrigir o que o teste revelar)

**Fazer:**
1. Levar um pedido até "Em aprovação" (criar, assumir, cotar, indicar, mover).
2. Como Aprovador, clicar "Reprovar". Confirmar que o modal exige motivo.
3. Selecionar um motivo da lista. Confirmar que envia.
4. Selecionar "Outros" e confirmar que o campo de texto livre aparece e é exigido.
5. Reprovar com "Outros" + texto. Confirmar que vai para "Reprovado" (estado terminal).
6. Confirmar que o motivo fica registrado e visível no detalhe e no histórico.
7. Confirmar que Solicitante e Comprador recebem notificação de reprovação.
8. Confirmar que "Reprovar" NÃO aparece em nenhum estado que não seja "Em aprovação".

**Definição de Pronto:**
- [ ] Reprovar exige motivo (não deixa enviar vazio)
- [ ] Campo "Outros" condicional funciona
- [ ] Pedido vai para "Reprovado" e o motivo fica registrado
- [ ] Solicitante e Comprador são notificados
- [ ] "Reprovar" só existe em "Em aprovação"

**Verificar:** Execute o roteiro de reprovação no emulador, incluindo o caso "Outros".

**Ao concluir:** marque 1.2 ✅ no PROGRESS.md.

---

## TAREFA 1.3 — Roteiro de aceitação: cancelamento

**Depende de:** 1.1
**Arquivos:** `js/pedido-detalhe.js` (corrigir o que o teste revelar)

**Fazer:**
1. Como Solicitante, criar um pedido e cancelá-lo enquanto está em "Solicitado". Confirmar que consegue (motivo exigido) e vai para "Cancelado".
2. Como Solicitante, criar outro pedido, fazer um Comprador assumir, e confirmar que o Solicitante NÃO consegue mais cancelar (já saiu de "Solicitado").
3. Como Gestor, cancelar um pedido em etapa intermediária (ex: "Aprovado"). Confirmar que consegue (motivo exigido).
4. Confirmar que Gestor NÃO consegue cancelar pedido já "Entregue", "Pago", "Reprovado" ou "Cancelado".
5. Confirmar que o motivo de cancelamento (lista + "Outros") funciona igual à reprovação.
6. Confirmar que todos os envolvidos são notificados do cancelamento.

**Definição de Pronto:**
- [ ] Solicitante cancela só o próprio pedido e só em "Solicitado"
- [ ] Gestor cancela em qualquer etapa até "Comprado"
- [ ] Gestor NÃO cancela em Entregue/Pago/Reprovado/Cancelado
- [ ] Motivo de cancelamento (lista + Outros) funciona
- [ ] Envolvidos são notificados

**Verificar:** Execute os casos de cancelamento no emulador com os perfis indicados.

**Ao concluir:** marque 1.3 ✅ no PROGRESS.md.

---

## TAREFA 1.4 — Roteiro de aceitação: liberar claim travado

**Depende de:** 1.1
**Arquivos:** `js/pedido-detalhe.js` (corrigir o que o teste revelar)

**Fazer:**
1. Levar um pedido a "Ag. cotação" (um Comprador assume).
2. Como Gestor (ou Supremo), abrir o pedido e clicar "Liberar pedido".
3. Confirmar que o comprador é removido e o pedido volta para "Solicitado", disponível para outro claim.
4. Confirmar que o histórico registra a liberação.
5. Confirmar que "Liberar pedido" só aparece para Gestor/Supremo e só quando há um comprador atribuído.

**Definição de Pronto:**
- [ ] Liberar remove o comprador e volta para "Solicitado"
- [ ] Histórico registra a liberação com autor
- [ ] Botão só visível para Gestor/Supremo
- [ ] Após liberar, outro comprador consegue assumir normalmente

**Verificar:** Execute o roteiro de liberação no emulador.

**Ao concluir:** marque 1.4 ✅ no PROGRESS.md.

---

## TAREFA 1.5 — Cotações: robustez completa

**Depende de:** 1.1
**Arquivos:** `js/pedido-detalhe.js`, `firebase.json` (storage do emulador, se aplicável)

**Fazer:**
- Confirmar que adicionar cotação funciona com upload de arquivo (PDF e imagem) para o Storage. Se o emulador de Storage não estiver configurado, configure-o no `firebase.json` (porta padrão 9199) e na detecção de localhost do `firebase.js`.
- Confirmar que dá para adicionar múltiplas cotações ao mesmo pedido.
- Confirmar que indicar a preferida funciona e que trocar a indicação atualiza corretamente (só uma indicada por vez).
- Confirmar que o valor, prazo e condições são gravados e exibidos.
- Confirmar que só o Comprador (e Gestor/Supremo) pode adicionar cotação, e só no estado certo.

**Definição de Pronto:**
- [ ] Upload de PDF e de imagem funciona (arquivo acessível depois)
- [ ] Múltiplas cotações no mesmo pedido
- [ ] Indicar preferida funciona; só uma indicada por vez
- [ ] Valor/prazo/condições gravados e exibidos
- [ ] Permissão correta para adicionar cotação

**Verificar:** No emulador, adicione 3 cotações com arquivos reais, troque a indicação, confirme tudo na UI do emulador.

**Ao concluir:** marque 1.5 ✅ no PROGRESS.md.

---

## TAREFA 1.6 — Comentários e @menção: robustez completa

**Depende de:** 1.1
**Arquivos:** `js/pedido-detalhe.js`

**Fazer:**
- Confirmar que comentar funciona e o comentário aparece com autor, avatar e horário.
- Confirmar que @menção funciona: ao digitar "@", idealmente sugere usuários; ao enviar, o usuário mencionado aparece destacado em dourado no texto e recebe notificação.
- Confirmar sanitização: um comentário com `<script>` ou HTML malicioso NÃO deve executar nem quebrar o layout (deve ser exibido como texto puro).

**Definição de Pronto:**
- [ ] Comentar funciona e exibe autor/avatar/hora
- [ ] @menção destaca o usuário e o notifica
- [ ] HTML/script em comentário é neutralizado (exibido como texto, não executado)

**Verificar:** No emulador, comente, mencione um usuário (confirme a notificação dele), e tente injetar `<script>alert(1)</script>` num comentário confirmando que não executa.

**Ao concluir:** marque 1.6 ✅ no PROGRESS.md.

---

## TAREFA 1.7 — Parcelas e pagamento: robustez completa

**Depende de:** 1.1
**Arquivos:** `js/pedido-detalhe.js`

**Fazer:**
- Confirmar que, ao executar compra parcelada, as parcelas são criadas com número, valor e vencimento corretos.
- Confirmar que o Financeiro consegue marcar cada parcela como paga e anexar comprovante.
- Confirmar que o pedido só vai para "Pago" quando a última parcela (ou o pagamento único) é confirmado.
- Confirmar que só o Financeiro (e Gestor/Supremo) pode marcar parcela como paga.

**Definição de Pronto:**
- [ ] Compra parcelada cria as parcelas corretamente
- [ ] Financeiro marca parcela paga e anexa comprovante
- [ ] Pedido vai para "Pago" só na quitação final
- [ ] Permissão correta para pagar parcela

**Verificar:** No emulador, crie uma compra em 3 parcelas, pague uma a uma como Financeiro, confirme a transição para Pago só na última.

**Ao concluir:** marque 1.7 ✅ no PROGRESS.md.

---

## TAREFA 1.8 — Kanban e lista: filtros, busca e navegação

**Depende de:** 1.1
**Arquivos:** `js/pedidos.js`

**Fazer:**
- Confirmar que o toggle kanban/lista funciona e preserva o estado.
- Confirmar os filtros: Todos, Urgentes, Meus pedidos, Esta semana — cada um filtrando corretamente.
- Confirmar a busca por título/descrição.
- Confirmar que clicar num card/linha abre o detalhe correto.
- Confirmar que as colunas terminais (Reprovado, Cancelado) ficam ocultas por padrão e acessíveis por filtro.
- Confirmar que o usuário só vê pedidos das empresas a que tem acesso (Solicitante vê só os próprios).

**Definição de Pronto:**
- [ ] Toggle kanban/lista funciona e preserva estado
- [ ] Os 4 filtros funcionam corretamente
- [ ] Busca funciona
- [ ] Clicar abre o detalhe certo
- [ ] Colunas terminais ocultas por padrão
- [ ] Visibilidade por empresa/perfil correta

**Verificar:** No emulador, teste cada filtro, a busca, o toggle, e a visibilidade com perfis diferentes.

**Ao concluir:** marque 1.8 ✅ no PROGRESS.md.

---

## TAREFA 1.9 — Proteção contra duplo-envio em todas as escritas

**Depende de:** 1.1 a 1.8
**Arquivos:** `js/pedido-detalhe.js`, `js/pedidos.js`, e todo lugar com escrita

**Fazer:**
- Garantir que toda ação de escrita (criar pedido, assumir, aprovar, reprovar, cancelar, executar compra, adicionar cotação, comentar, pagar parcela) desabilita o botão durante o processamento, evitando que um duplo-clique crie registros duplicados ou dispare a ação duas vezes.
- Isto é integridade de dados — não apenas visual. Mesmo que o spinner apareça, confirme que dois cliques rápidos não geram dois efeitos.

**Definição de Pronto:**
- [ ] Nenhuma ação de escrita pode ser disparada duas vezes por duplo-clique
- [ ] Botões desabilitam durante o processamento
- [ ] Testado em ao menos: criar pedido, adicionar cotação, comentar (os mais prováveis de duplicar)

**Verificar:** No emulador, tente clicar duas vezes rápido em "Abrir pedido", "Salvar cotação" e "Enviar comentário" — confirme que só um registro é criado em cada caso.

**Ao concluir:** marque 1.9 ✅ no PROGRESS.md.

---

## TAREFA 1.10 — Fornecedor estruturado com autocomplete

**Depende de:** 1.5
**Arquivos:** `js/pedido-detalhe.js` (modais de cotação e de compra), `js/config-cadastros.js`

**Fazer:**
- No campo de fornecedor (no modal de cotação e no de executar compra), substituir o texto livre simples por autocomplete contra a coleção `/fornecedores`: ao digitar, buscar por nome normalizado (sem acentos, minúsculas) e sugerir correspondências num dropdown (ou datalist estilizado).
- Se o fornecedor digitado não existir, criar automaticamente o documento em `/fornecedores` com `nome` (normalizado), `nomeOriginal`, `cnpj` (opcional), `criadoEm` e `usos: 1`.
- Se já existir, usar o `fornecedorId` existente e incrementar `usos`.
- Salvar na cotação/pedido tanto o `fornecedorId` quanto o `fornecedorNome` (desnormalizado para exibição).
- Objetivo: evitar duplicatas como "Dell", "DELL Computadores" e "dell" virarem três fornecedores diferentes.

**Definição de Pronto:**
- [ ] Digitar no campo de fornecedor sugere fornecedores existentes
- [ ] Selecionar uma sugestão usa o fornecedor existente (incrementa `usos`)
- [ ] Digitar um nome novo cria o fornecedor automaticamente
- [ ] Digitar variação de um existente ("DELL" quando existe "Dell") sugere o existente em vez de criar duplicata
- [ ] Cotação/pedido salvam `fornecedorId` + `fornecedorNome`

**Verificar:** No emulador, adicione cotações usando: um fornecedor existente do seed, um nome novo, e uma variação de maiúsculas/acentos de um existente. Confirme na UI do emulador que não há duplicatas.

**Ao concluir:** marque 1.10 ✅ no PROGRESS.md.

---

## SMOKE TEST DO ESTÁGIO 1 (rodar antes de fechar o estágio)

Inclui o smoke test do Estágio 0 mais os novos. Todos no emulador, todos devem passar:

**Regressão (do Estágio 0):**
1. [ ] App sobe, seed popula, estrelas no fundo, login dos 6 perfis funciona
2. [ ] Aprovador sem dados financeiros; Gestor com tudo
3. [ ] Estados de erro (404, inexistente, sem-permissão) amigáveis

**Novos do Estágio 1:**
4. [ ] Caminho feliz completo (criar → assumir → cotar → aprovar → comprar → entregar → pagar) sem erros
5. [ ] Reprovação com motivo (lista e "Outros") funciona; só em "Em aprovação"
6. [ ] Cancelamento respeita perfis e estados; motivo funciona
7. [ ] Liberar claim funciona e devolve à fila
8. [ ] Cotações: upload PDF/imagem, múltiplas, indicação única
9. [ ] Comentários: @menção notifica; HTML malicioso neutralizado
10. [ ] Parcelas: criação, pagamento individual, transição a Pago na quitação
11. [ ] Filtros, busca, toggle, visibilidade por perfil
12. [ ] Duplo-clique não duplica registros
13. [ ] Autocomplete de fornecedor sugere existentes e não cria duplicatas

---

## FIM DO ESTÁGIO 1 — RITUAL DE ENCERRAMENTO

Quando todas as tarefas estiverem ✅ e o smoke test passar:

1. Marque o Estágio 1 inteiro como ✅ no PROGRESS.md.
2. Apresente ao desenvolvedor um resumo do que foi feito e blindado.
3. **Ensine os testes manuais que só ele pode fazer.** Para o Estágio 1:
   - Se o fluxo dispara e-mails (aprovação, reprovação, etc.), explique que o **envio real do e-mail** só pode ser confirmado por ele no Firebase real — o emulador roda a lógica mas não entrega e-mail. Liste quais transições disparam e-mail para ele conferir depois.
4. Avise que o Estágio 1 está concluído e que você está pronto para receber o **documento do Estágio 2**.
5. **PARE e aguarde** o desenvolvedor adicionar `_build/estagio-2.md` e pedir para você lê-lo.

---
*Fim do Estágio 1.*
