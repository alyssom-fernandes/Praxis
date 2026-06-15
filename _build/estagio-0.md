# ESTÁGIO 0 — Estabilizar a Fundação

> ## RITUAL DE INÍCIO (OBRIGATÓRIO ANTES DE COMEÇAR)
> 1. Leia `_build/00-PROTOCOLO.md` inteiro.
> 2. Leia `_build/PROGRESS.md` para ver o que já foi feito.
> 3. Leia `_build/01-AMBIENTE.md` e garanta que o Firebase Emulator está rodando.
> 4. Leia este documento inteiro antes de tocar em qualquer arquivo.
> 5. Tenha `praxis-spec.md`, `praxis-complemento.md` e `praxis-auditoria.md` disponíveis. Se faltarem, peça ao desenvolvedor.
> **Lembre-se: git é PROIBIDO. Uma fatia vertical por vez. Rode tudo no emulador. Verifique com checklist. Atualize o PROGRESS.md.**

---

## OBJETIVO DESTE ESTÁGIO

Deixar a fundação 100% sólida: o app sobe, conecta ao emulador, o seed popula o banco, o login funciona em todos os modos, e TODAS as correções de alta prioridade da auditoria estão aplicadas e testadas. Ao fim deste estágio, o sistema base funciona de ponta a ponta — sem as funcionalidades novas ainda, mas com tudo que já existe funcionando corretamente.

**Não implemente nada das Fases 1, 2 ou 3 aqui.** Este estágio é só fundação e correção do que já existe.

---

## TAREFA 0.1 — Ambiente e emulador funcionando

**Depende de:** nada (é o ponto de partida)
**Arquivos:** `firebase.json`, `js/firebase.js`, `.gitignore`

**Fazer:**
- Conferir/criar a seção `emulators` no `firebase.json` conforme `_build/01-AMBIENTE.md`.
- Garantir que `js/firebase.js` detecta localhost e conecta aos emuladores (Auth, Firestore, Functions) conforme o exemplo do guia de ambiente.
- Adicionar `_build/emulator-data` ao `.gitignore` se ainda não estiver.
- Subir o emulador com `firebase emulators:start` e confirmar que sobe sem erro.

**Definição de Pronto:**
- [ ] `firebase emulators:start` sobe Auth, Firestore, Functions e Hosting sem erros
- [ ] http://localhost:5000 abre o app Praxis
- [ ] http://localhost:4000 abre a interface visual do emulador
- [ ] O console do navegador mostra a mensagem de conexão com emuladores
- [ ] `.gitignore` contém `_build/emulator-data`

**Verificar:** Abra localhost:5000 e localhost:4000 no navegador, confirme que ambos carregam e que o console indica conexão local.

**Ao concluir:** marque 0.1 ✅ no PROGRESS.md.

---

## TAREFA 0.2 — Seed reproduzível no emulador

**Depende de:** 0.1
**Arquivos:** `_build/seed-emulator.js` (criar), `functions/seed.json`

**Fazer:**
- Consolidar o seed: `functions/seed.json` é o ÚNICO seed canônico. Se `assets/demo/seed.json` existir e divergir, remova-o (e ajuste qualquer referência a ele).
- Garantir que `functions/seed.json` está completo conforme a auditoria (item A2): 3 empresas (2 ativas, 1 inativa), 6 usuários (um por perfil), 30+ pedidos distribuídos pelos estados, 8 fornecedores, 8 categorias padrão + 2 personalizadas, com histórico/comentários/cotações/parcelas aninhados onde aplicável. Se faltar conteúdo, complete agora.
- **Datas relativas (item 60 das ideias, importante):** as datas do seed NÃO podem ser fixas/absolutas, senão a demo "envelhece". O script de seed deve calcular as datas relativas ao momento em que roda — ex: um pedido "criado há 2 dias", uma parcela "vencendo em 3 dias a partir de hoje". Use o campo `diasAtras` que já existe no seed para computar a data real na hora de inserir.
- Criar `_build/seed-emulator.js`: um script Node que lê `functions/seed.json`, computa as datas relativas, e escreve tudo no Firestore do emulador (apontando o admin SDK para localhost:8080). Deve criar também os usuários no Auth do emulador com senha padrão de teste, para permitir login.
- Documentar no topo do script como rodá-lo (ex: `node _build/seed-emulator.js` com o emulador no ar).

**Definição de Pronto:**
- [ ] Existe só um seed canônico (`functions/seed.json`); o duplicado foi removido
- [ ] O seed tem a distribuição completa de 30+ pedidos descrita na auditoria
- [ ] As datas são calculadas relativas a hoje (nenhuma data fixa "envelhece")
- [ ] `node _build/seed-emulator.js` popula o Firestore do emulador sem erro
- [ ] Na UI do emulador (localhost:4000 → Firestore) aparecem as coleções: usuarios, empresas, categorias, fornecedores, pedidos (com subcoleções)
- [ ] Os 6 usuários existem no Auth do emulador (localhost:4000 → Authentication) e conseguem logar

**Verificar:** Rode o seed, abra localhost:4000, confirme visualmente as coleções e os usuários. Tente logar no app com um dos usuários do seed.

**Ao concluir:** marque 0.2 ✅ no PROGRESS.md.

---

## TAREFA 0.3 — Login e autenticação completos

**Depende de:** 0.2
**Arquivos:** `js/auth.js`, `js/app.js`, `css/views.css`

**Fazer:**
- Verificar e garantir que os 4 estados do login funcionam: `login`, `demo-lang`, `forgot`, `sent`.
- Login com e-mail/senha conecta e roteia para a tela inicial conforme o perfil.
- Logout funciona e é descobrível (item 61) — confirme que clicar no avatar oferece sair claramente.
- "Esqueci a senha" → chama `sendPasswordResetEmail` → mostra view `sent`.
- Modo demo → seleção PT/EN → entra com a conta demo do seed.
- Proteção de rotas: sem login vai para login; perfil sem permissão para uma tela é redirecionado para pedidos.

**Definição de Pronto:**
- [ ] Login com cada um dos 6 perfis do seed funciona e cai na tela certa
- [ ] Logout funciona e volta ao login
- [ ] Esqueci a senha mostra a tela de confirmação (a chamada ao Firebase Auth roda no emulador)
- [ ] Modo demo entra e a seleção PT/EN troca os textos
- [ ] Acessar `?tela=relatorios` como Comprador ou Solicitante redireciona para pedidos
- [ ] Acessar `?tela=config-usuarios` como não-gestor redireciona para pedidos

**Verificar:** No emulador, faça login/logout com cada perfil e teste cada redirecionamento de proteção de rota.

**Ao concluir:** marque 0.3 ✅ no PROGRESS.md.

---

## TAREFA 0.4 — Canvas de estrelas persistente em todas as telas

**Depende de:** 0.3
**Arquivos:** `index.html`, `js/ui.js`, `css/base.css`

**Fazer:**
- Confirmar que o `<canvas id="bg-canvas">` está FORA do `#app` no `index.html`, com `position:fixed; inset:0; z-index:0`, e que `#app` tem `position:relative; z-index:1`. (A auditoria indica que isso já está correto — apenas confirme e teste.)
- Garantir que `desenharEstrelas(tema)` é chamada na carga e no resize, e que o canvas aparece em TODAS as telas (login, pedidos, detalhe, relatórios, todas as configs), não só no login.

**Definição de Pronto:**
- [ ] As estrelas e nebulas aparecem no fundo de TODAS as telas
- [ ] Ao navegar entre telas, o fundo permanece (não some nem recarrega bruscamente)
- [ ] Ao redimensionar a janela, o canvas se ajusta

**Verificar:** Navegue por todas as telas no emulador e confirme o fundo presente em cada uma.

**Ao concluir:** marque 0.4 ✅ no PROGRESS.md.

---

## TAREFA 0.5 — Correção de alta prioridade: Aprovador sem dados financeiros

**Depende de:** 0.3
**Arquivos:** `js/relatorios.js`

**Fazer:**
- Em `_renderDash()` (e onde os cards são montados), computar:
  `const podeVerFinanceiro = ['supremo','gestor','financeiro'].includes(sessao.usuario.perfil)`
- Se `podeVerFinanceiro` for falso (caso do Aprovador), OMITIR do HTML: card "Total gasto", card "Parcelas a vencer", bloco "Gasto por empresa", bloco "Próximas parcelas", e os botões de export Excel/PDF.
- Manter visível para o Aprovador: card "Total de pedidos", card "Ag. aprovação" (com urgentes), bloco "Status dos pedidos".

**Definição de Pronto:**
- [ ] Logado como Aprovador: NENHUM dado financeiro aparece na tela de Relatórios
- [ ] Logado como Gestor: tudo aparece normalmente
- [ ] Logado como Financeiro: tudo aparece normalmente
- [ ] Logado como Supremo: tudo aparece normalmente

**Verificar:** No emulador, faça login como Aprovador, Gestor, Financeiro e Supremo, abra Relatórios em cada um e confirme os quatro casos.

**Ao concluir:** marque 0.5 ✅ no PROGRESS.md.

---

## TAREFA 0.6 — Confirmar transações de concorrência (claim e aprovação)

**Depende de:** 0.3
**Arquivos:** `js/pedido-detalhe.js`

**Fazer:**
- A auditoria confirma que `_assumirPedido`, `_aprovarPedido` e `_reprovarPedido` já usam `runTransaction` corretamente. Sua tarefa aqui é **testar** que funciona, não reescrever (a menos que o teste revele falha).
- Simular concorrência: abra o mesmo pedido em duas abas do navegador (ambas no emulador). Em ambas, clique em "Assumir" (ou "Aprovar") quase ao mesmo tempo. A segunda deve falhar com mensagem amigável ("Pedido já foi assumido/aprovado por outro...").

**Definição de Pronto:**
- [ ] Claim simultâneo em duas abas: só uma vence, a outra recebe toast de erro amigável
- [ ] Aprovação simultânea em duas abas: só uma vence, a outra recebe toast de erro amigável
- [ ] A mensagem de erro é amigável e em PT (não um erro técnico cru)

**Verificar:** Teste real com duas abas no emulador, como descrito.

**Ao concluir:** marque 0.6 ✅ no PROGRESS.md.

---

## TAREFA 0.7 — Notificação #14 (pedido entregue → solicitante)

**Depende de:** 0.2
**Arquivos:** `functions/src/triggers.js`

**Fazer:**
- No `onPedidoStatusChange`, no `case 'entregue'`: além de notificar o Financeiro (evento #9 já existente), também criar notificação para `pedido.solicitanteId` com o evento `pedido_entregue_solic` (in-app, sem e-mail).

**Definição de Pronto:**
- [ ] Ao mover um pedido para "Entregue", o Solicitante recebe uma notificação in-app
- [ ] O Financeiro continua recebendo a notificação dele
- [ ] Ambas aparecem como documento na coleção de notificações (visível na UI do emulador)

**Verificar:** No emulador, mova um pedido para Entregue e confirme as duas notificações na UI do emulador (localhost:4000) e no sino do app logado como solicitante.

**Ao concluir:** marque 0.7 ✅ no PROGRESS.md.

---

## TAREFA 0.8 — Confirmar dataCompra e motivos estruturados

**Depende de:** 0.3
**Arquivos:** `js/pedido-detalhe.js`

**Fazer:**
- Confirmar (e corrigir se necessário) que o modal "Executar compra" salva `dataCompra` (campo de data, default hoje) junto de fornecedor, valorFinal, condicaoPagamento e parcelas.
- Confirmar que os modais de Reprovar e Cancelar usam as listas `MOTIVOS_REPROVACAO` e `MOTIVOS_CANCELAMENTO` de `constants.js`, com o campo de texto livre aparecendo apenas quando "Outros" é selecionado.

**Definição de Pronto:**
- [ ] Executar compra grava `dataCompra` no pedido (visível na UI do emulador)
- [ ] Modal de reprovar mostra a lista de motivos + campo "Outros" condicional
- [ ] Modal de cancelar mostra a lista de motivos + campo "Outros" condicional
- [ ] Reprovar só está disponível quando o status é "Em aprovação"

**Verificar:** No emulador, execute uma compra e confira `dataCompra` no banco; abra os modais de reprovar e cancelar e teste o campo condicional "Outros".

**Ao concluir:** marque 0.8 ✅ no PROGRESS.md.

---

## TAREFA 0.9 — Resolver nomenclatura config-cadastros / config-geral

**Depende de:** 0.3
**Arquivos:** `js/app.js`, `js/config-cadastros.js`, `js/config-geral.js`

**Fazer:**
- Manter a separação atual em dois arquivos (funciona bem). Garantir coerência:
  - A navegação de configurações mostra de forma consistente: `Usuários · Cadastros · Geral` em `renderTopbar` e em `_toggleMobileMenu`.
  - Confirmar que `config-geral.js` tem conteúdo real (preferências do sistema). Se estiver vazio/placeholder, ou popular com preferências úteis (ex: tema padrão, idioma padrão do sistema) ou consolidar removendo a aba Geral e deixando só Usuários + Cadastros. Escolha o caminho mais simples e anote a decisão no PROGRESS.md.
- Garantir que as três telas de config respeitam a restrição de perfil (só Gestor e Supremo acessam).

**Definição de Pronto:**
- [ ] A navegação de config é coerente em desktop e mobile
- [ ] Todas as abas de config abrem sem erro
- [ ] Apenas Gestor e Supremo acessam configurações
- [ ] A decisão sobre config-geral está anotada no PROGRESS.md

**Verificar:** No emulador, como Gestor, navegue por todas as abas de config. Como outro perfil, confirme que não acessa.

**Ao concluir:** marque 0.9 ✅ no PROGRESS.md.

---

## TAREFA 0.10 — Estados de erro: 404, pedido inexistente, sem permissão

**Depende de:** 0.3
**Arquivos:** `js/app.js`, `js/pedido-detalhe.js`, `js/ui.js`

**Fazer:**
- **Rota inválida (404):** se `?tela=` for um valor desconhecido, mostrar uma tela amigável "Página não encontrada" com botão para voltar aos pedidos (em vez de quebrar ou tela branca).
- **Pedido inexistente:** abrir `?tela=detalhe&id=xxx` com id que não existe deve mostrar "Pedido não encontrado" amigável, não erro de Firestore.
- **Sem permissão / outra empresa:** abrir um pedido de empresa à qual o usuário não tem acesso deve mostrar "Você não tem acesso a este pedido" amigável.
- Garantir que erros de escrita barrados por regra do Firestore exibem `prxToast` amigável em PT, não erro técnico.

**Definição de Pronto:**
- [ ] `?tela=qualquercoisa` mostra tela 404 amigável com botão de voltar
- [ ] Detalhe de pedido inexistente mostra mensagem amigável
- [ ] Detalhe de pedido de outra empresa mostra mensagem de sem-acesso
- [ ] Nenhum desses casos quebra o app ou mostra erro técnico cru

**Verificar:** No emulador, teste manualmente cada URL inválida e confirme as telas amigáveis.

**Ao concluir:** marque 0.10 ✅ no PROGRESS.md.

---

## TAREFA 0.11 — Confirmar firestore.rules e indexes

**Depende de:** 0.2
**Arquivos:** `firestore.rules`, `firestore.indexes.json`

**Fazer:**
- Revisar `firestore.rules`: segregação por `empresas[]` do token (Custom Claims), proteção de subcoleções (cotações, comentários, parcelas, histórico), notificações acessíveis só pelo próprio dono, cotações graváveis só por comprador, parcelas só por financeiro.
- Confirmar os 3 índices compostos do spec em `firestore.indexes.json`.
- Testar as regras no emulador: tentar ler pedido de empresa não autorizada deve ser barrado.

**Definição de Pronto:**
- [ ] As rules segregam corretamente por empresa (testado no emulador)
- [ ] Subcoleções estão protegidas conforme spec
- [ ] Os 3 índices compostos estão no indexes.json
- [ ] Uma tentativa de acesso indevido é barrada pela regra

**Verificar:** No emulador, com um usuário de empresa A, tente acessar dado de empresa B e confirme o bloqueio.

**Ao concluir:** marque 0.11 ✅ no PROGRESS.md.

---

## TAREFA 0.12 — Limpeza e padrões

**Depende de:** todas as anteriores
**Arquivos:** todos os JS

**Fazer:**
- Buscar e remover `alert(`, `confirm(`, `prompt(` nativos — substituir por `prxAlert`/`prxConfirm`/`prxToast`.
- Buscar comparações de status/perfil com strings literais e trocar por `STATUS.*`/`PERFIS.*`.
- Buscar `parseInt`/`+id`/`Number(id)` em IDs e corrigir para string.
- Remover `console.log` de debug (manter `console.error` reais e a mensagem de conexão do emulador).

**Definição de Pronto:**
- [ ] Zero `alert/confirm/prompt` nativos no código
- [ ] Zero strings mágicas de status/perfil
- [ ] Zero coerção numérica de IDs
- [ ] Console limpo de logs de debug desnecessários

**Verificar:** Busca textual no projeto por cada padrão proibido, confirmando ausência.

**Ao concluir:** marque 0.12 ✅ no PROGRESS.md.

---

## SMOKE TEST DO ESTÁGIO 0 (rodar antes de fechar o estágio)

Execute todos no emulador. Todos devem passar:

1. [ ] `firebase emulators:start` sobe sem erro e o seed popula o banco
2. [ ] O app carrega em localhost:5000 com as estrelas no fundo
3. [ ] Login funciona com os 6 perfis; logout funciona
4. [ ] Modo demo entra e troca idioma PT/EN
5. [ ] Kanban renderiza os pedidos do seed nas 7 colunas
6. [ ] Abrir um pedido mostra o detalhe completo (metadados, cotações, comentários, histórico)
7. [ ] Aprovador NÃO vê dados financeiros em Relatórios; Gestor vê
8. [ ] Claim e aprovação simultâneos (2 abas) barram o segundo com mensagem amigável
9. [ ] Mover pedido para Entregue notifica Financeiro E Solicitante
10. [ ] Rota inválida, pedido inexistente e sem-permissão mostram telas amigáveis
11. [ ] Navegação por todas as telas sem erro no console
12. [ ] Tema dark/light alterna em todas as telas e persiste

---

## FIM DO ESTÁGIO 0 — RITUAL DE ENCERRAMENTO

Quando todas as tarefas estiverem ✅ e o smoke test passar:

1. Marque o Estágio 0 inteiro como ✅ no PROGRESS.md.
2. Apresente ao desenvolvedor um resumo do que foi feito.
3. **Ensine os testes manuais que só ele pode fazer.** Para o Estágio 0, o principal é:
   - **Nada de e-mail real ainda é crítico aqui** (será mais relevante nos estágios com notificação por e-mail), mas avise se algo de Auth real precisar de conferência.
   - Confirme com ele se quer dar uma olhada visual geral antes de prosseguir.
4. Avise que o Estágio 0 está concluído e que você está pronto para receber o **documento do Estágio 1**.
5. **PARE e aguarde** o desenvolvedor adicionar `_build/estagio-1.md` e pedir para você lê-lo. Não prossiga de memória.

---
*Fim do Estágio 0.*
