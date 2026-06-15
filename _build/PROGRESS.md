# Praxis — Progresso de Construção
> Este arquivo é a MEMÓRIA do projeto entre sessões. O Claude Code lê no início de cada sessão e atualiza ao fim de cada tarefa. Nunca apague o histórico — apenas acrescente.

## Estado geral
- [x] Estágio 0 — Estabilizar a fundação ✅ (concluído em 2026-06-11)
- [x] Estágio 1 — Blindar o fluxo de pedido ✅ (código concluído em 2026-06-11; testes manuais multi-usuário pendentes — ver seção "Pendências")
- [x] Estágio 2 — Fase 1 (demo impecável + base de qualidade) ✅ (código concluído em 2026-06-11; smoke test manual pendente — ver seção de smoke test)
- [x] Estágio 3 — Fase 2 (evolução funcional) ✅ (código concluído em 2026-06-12; smoke test manual pendente)
- [x] Estágio 4 — Fase 3 (refinamento e portfólio) ✅ (código concluído em 2026-06-12; smoke test manual por perfil pendente — ver 4.14)

---

## Registro de tarefas concluídas
> Formato: `[data] ✅ Estágio.Tarefa — o que foi feito e testado`

### Estágio 0 — Estabilizar a fundação

[2026-06-11] ✅ 0.1 — Ambiente e emulador funcionando
- `firebase.json` com seção `emulators` configurada (Auth 9099, Firestore 9090, Functions 5001, Storage 9199)
- `js/firebase.js` detecta localhost e conecta aos emuladores
- Emuladores sobem com `npx firebase emulators:start` (usando firebase-tools v13.35.1 local, compatível com JDK 17)
- Console mostra mensagem de conexão com emuladores
- `.gitignore` contém `_build/emulator-data`

[2026-06-11] ✅ 0.2 — Seed reproduzível no emulador
- Script `_build/seed-emulator.js` cria 2 empresas (Alpha Tecnologia, Beta Soluções), 6 usuários com custom claims (supremo, gestor, aprovador, comprador, financeiro, solicitante), categorias, fornecedores e pedidos de exemplo
- Comando: `cd <projeto> && $env:NODE_PATH="<projeto>\functions\node_modules" && node _build/seed-emulator.js`

[2026-06-11] ✅ 0.3 — Login e autenticação completos
- Login com email/senha, logout, proteção de rotas, "Esqueci senha" (toast em emulador), modo demo
- Corrigido mismatch de senha no modo demo: `config.js` tinha `praxis-demo-2024`, seed usa `demo1234`
- 6 perfis testados: todos entram e saem corretamente

[2026-06-11] ✅ 0.4 — Canvas de estrelas em todas as telas
- Canvas `<bg-canvas>` verificado em pedidos, relatorios, detalhe e config

[2026-06-11] ✅ 0.5 — Aprovador sem dados financeiros em Relatórios
- `_podeVerFinanceiro()` retorna false para aprovador
- "Total gasto", "Parcelas a vencer", "Gasto por empresa" e botões de exportação ocultos para aprovador

[2026-06-11] ✅ 0.6 — Concorrência claim/aprovação (código verificado)
- `_assumirPedido`, `_aprovarPedido`, `_reprovarPedido` usam `runTransaction` em `pedido-detalhe.js`
- Segundo click retorna toast amigável em PT
- **Teste manual necessário:** duas abas simultâneas (ver seção "Pendências para o desenvolvedor")

[2026-06-11] ✅ 0.7 — Notificação pedido entregue → solicitante (código verificado)
- `functions/src/triggers.js` `case 'entregue'` notifica tanto o Financeiro quanto o Solicitante
- **Teste manual necessário:** mover pedido para Entregue e verificar dois documentos na UI do emulador

[2026-06-11] ✅ 0.8 — dataCompra e motivos estruturados
- Modal "Executar compra" salva `dataCompra` (default hoje), `valorFinal`, `fornecedorId`, `condicaoPagamento`, parcelas
- Modais Reprovar e Cancelar usam `MOTIVOS_REPROVACAO` e `MOTIVOS_CANCELAMENTO` de `constants.js`
- Campo "Outros" aparece condicionalmente ao selecionar "Outros" no dropdown
- **Correção aplicada:** `_carregarAuxiliares()` em `pedido-detalhe.js` agora tem try/catch em torno do getDocs de `usuarios` — perfis não-gestor (aprovador, comprador, financeiro, solicitante) receberiam `permission-denied` na listagem e a página travava antes de renderizar

[2026-06-11] ✅ 0.9 — Nomenclatura config-cadastros/config-geral
- Três abas: Usuários · Cadastros · Geral — coerentes em desktop (topbar) e mobile (menu vai para config-usuarios)
- `config-geral.js` tem conteúdo real: funcionalidade "Resetar dados demo" via Cloud Function `triggerDemoSeed`
- **Decisão:** mantida a aba Geral com o reset de demo — funcionalidade útil para o ambiente demo, não é placeholder
- **Correção aplicada:** guarda de rota adicionada para `PERFIS.APROVADOR` em `js/app.js` — aprovador não pode acessar `config-*` mesmo via URL direta

[2026-06-11] ✅ 0.10 — Estados de erro (404, inexistente, sem permissão)
- Rota inválida (`?tela=qualquercoisa`) → tela 404 amigável com código, descrição e botão "Voltar para pedidos"
- Pedido inexistente ou de outra empresa → `_renderErroDetalhe()` exibe "Sem acesso" amigável com botão de voltar
- Comportamento esperado: Firestore retorna `permission-denied` para documento inexistente (resource é null), capturado pelo handler `permission-denied` → mensagem amigável

[2026-06-11] ✅ 0.11 — Confirmar firestore.rules e indexes
- 3 índices obrigatórios do spec presentes: `pedidos(empresaId+status+criadoEm)`, `pedidos(empresaId+urgente+criadoEm)`, `parcelas(vencimento+pago)` — mais 7 índices adicionais
- Regras: segregação por `empresas[]` do token, subcoleções protegidas, notificações só pelo dono, cotações graváveis só por comprador, parcelas atualizáveis só por financeiro
- **Teste manual necessário:** tentar acessar pedido de empresa B logado como usuário da empresa A

[2026-06-11] ✅ 0.12 — Limpeza e padrões
- Zero `alert/confirm/prompt` nativos
- Zero strings mágicas de status/perfil
- Zero coerção numérica de IDs
- Console limpo de logs de debug

---

## Decisões tomadas em ambiguidades

[2026-06-11] **config-geral.js:** mantida a aba Geral com funcionalidade de reset de dados demo (`triggerDemoSeed`). Alternativa descartada: consolidar em Usuários+Cadastros seria mais simples mas perderia a funcionalidade de reset que é útil em demo.

[2026-06-11] **Aprovador e listagem de usuários:** aprovador recebe `[]` para `_usuarios` em `pedido-detalhe.js` e `pedidos.js` (permission-denied tratado com try/catch). Nomes de pessoas envolvidas ficam em branco para aprovador. Decisão aceita: segurança > conveniência, e os dados críticos (status, título, botões de ação) funcionam normalmente.

---

## Pendências para o desenvolvedor (testes manuais)

> Estes itens requerem interação humana — não podem ser verificados automaticamente.

### 0.6 — Concorrência claim/aprovação
Abrir o mesmo pedido em `em_aprovacao` em **duas abas do navegador** como aprovador.
Clicar "Aprovar" ou "Assumir" nas duas abas quase simultaneamente.
**Esperado:** a segunda aba recebe toast amigável em português ("Este pedido já foi assumido por outro comprador" ou similar), não erro técnico cru.

### 0.7 — Notificação pedido entregue → solicitante
Como comprador, abrir um pedido em status `comprado` e clicar "Confirmar entrega".
**Esperado:**
1. Na UI do emulador (localhost:4000 → Firestore → notificacoes), dois documentos criados: um para o usuário Financeiro, um para o Solicitante do pedido.
2. No app logado como solicitante, o sino de notificações exibe "Seu pedido foi entregue".

### 0.11 — Regras cross-empresa
Logar como usuário da empresa Alpha. Obter na UI do emulador o ID de um pedido da empresa Beta.
Navegar para `?tela=detalhe&id=<ID_BETA>`.
**Esperado:** tela "Sem acesso" amigável, sem dados do pedido Beta expostos.

### 0.8 — dataCompra gravado
Como comprador, assumir um pedido aprovado e clicar "Executar compra".
Preencher fornecedor, valor final, condição de pagamento, data da compra.
**Esperado:** na UI do emulador (Firestore → pedidos → documento), campos `dataCompra` e `fornecedorNome` presentes com os valores informados.

---

## Estágio 1 — Testes manuais multi-usuário

### 1.1 — Caminho feliz completo (8 etapas)
Execute o ciclo completo no emulador trocando de usuário em cada etapa:
1. **Solicitante** (`solicitante@praxis.app / demo1234`): Clicar "Novo pedido" → preencher todos os campos → confirmar. Verificar que aparece na coluna "Solicitado".
2. **Comprador** (`comprador@praxis.app / demo1234`): Abrir o pedido → clicar "Assumir pedido". Verificar que vai para "Ag. cotação".
3. **Comprador**: Adicionar 3 cotações (fornecer nome, valor, prazo, arquivo). Indicar uma como preferida. Verificar que vai para "Em aprovação".
4. **Aprovador** (`aprovador@praxis.app / demo1234`): Abrir o pedido → clicar "Aprovar". Verificar que vai para "Aprovado".
5. **Comprador**: Clicar "Executar compra" → preencher fornecedor, valor, data, parcelas → confirmar. Verificar que vai para "Comprado".
6. **Comprador** (ou Solicitante): Clicar "Confirmar entrega". Verificar que vai para "Entregue" e `dataEntrega` gravado.
7. **Financeiro** (`financeiro@praxis.app / demo1234`): Abrir o pedido → confirmar pagamento de cada parcela. Verificar que na última parcela o pedido vai para "Pago".
8. **Verificar histórico**: No detalhe do pedido, o histórico deve mostrar todas as 7 transições com autor e timestamp.

### 1.2 — Reprovação
1. Levar um pedido a "Em aprovação" (passos 1-3 acima).
2. Como **Aprovador**: clicar "Reprovar" → tentar enviar sem motivo (deve bloquear) → selecionar motivo da lista → confirmar.
3. Selecionar "Outros" → confirmar que campo de texto aparece → preencher → reprovar.
4. **Esperado:** pedido vai para "Reprovado". Solicitante e comprador devem ver notificação no sino.

### 1.3 — Cancelamento
1. Como **Solicitante**: criar pedido → cancelar enquanto em "Solicitado" (deve conseguir com motivo).
2. Com outro pedido: deixar um Comprador assumir → tentar cancelar como Solicitante (não deve conseguir).
3. Como **Gestor** (`gestor@praxis.app / demo1234`): cancelar pedido em "Aprovado" (deve conseguir).
4. Como **Gestor**: tentar cancelar pedido em "Entregue" (botão não deve aparecer).

### 1.4 — Liberar claim
1. Deixar um Comprador assumir um pedido (status "Ag. cotação").
2. Como **Gestor**: no detalhe, verificar botão "Liberar pedido" → clicar → confirmar.
3. **Esperado:** pedido volta a "Solicitado", comprador removido, histórico registra a liberação.
4. Outro Comprador deve conseguir assumir normalmente.

### 1.5 — Cotações com upload
1. Como **Comprador**: adicionar cotação com arquivo PDF real e outro com imagem.
2. Verificar que os arquivos ficam acessíveis (link "Ver arquivo" abre o PDF/imagem).
3. Adicionar 3 cotações ao mesmo pedido. Indicar uma → trocar a indicação para outra.
4. **Esperado:** só uma cotação por vez fica "Indicada".

### 1.7 — Parcelas
1. Executar uma compra em **3 parcelas**.
2. Como **Financeiro**: confirmar a 1ª parcela → pedido permanece "Entregue".
3. Confirmar a 2ª → pedido ainda "Entregue".
4. Confirmar a 3ª → pedido deve ir para "Pago".
5. Testar também o upload de comprovante em uma parcela.

### 1.6 — @menção (complemento ao teste do Claude Code)
O Claude Code já testou XSS e duplo-click. Confirme manualmente:
1. Comentar com `@financeiro` (ou o primeiro nome do usuário financeiro).
2. Logar como Financeiro → verificar que recebeu notificação no sino "Você foi mencionado".

### E-mails (só verificável no Firebase real, não no emulador)
As seguintes transições disparam e-mail via `enviarEmail()` em `triggers.js`:
- Pedido urgente aberto → gestor e aprovadores
- Cotações prontas → aprovadores
- Pedido aprovado → solicitante e comprador
- Pedido reprovado → solicitante e comprador
- Pedido cancelado → todos os envolvidos
- Pedido comprado → financeiro e gestores

Para confirmar no Firebase real: executar o fluxo completo uma vez em produção e checar as caixas de entrada.

---

## Estágio 2 — Demo Impecável + Base de Qualidade (Fase 1)

[2026-06-11] ✅ 2.1 — Listener cleanup via `registrarLimpador`/`_limparTudo`
- `app.js` expõe `registrarLimpador(fn)` e `_limparTudo()` usando um `Set` de funções
- `_limparTudo()` chamado em `_rotear()` e no logout (`onAuthStateChanged`)
- `notificacoes.js`, `pedidos.js`, `pedido-detalhe.js` registram seus `unsubscribe` via `registrarLimpador`
- Previne memory leaks e listeners duplicados ao trocar de rota ou deslogar

[2026-06-11] ✅ 2.2 — `prefers-reduced-motion` em CSS e JS
- `css/base.css`: media query global zera durações de animação/transição quando usuário optou por menos movimento
- `js/utils.js`: helper `prefereMenosMovimento()` usando `window.matchMedia`
- Skeleton shimmer desativado via `.skeleton::after { animation: none }` no media query

[2026-06-11] ✅ 2.3 — Count-up animation nos cards de dashboard
- `js/utils.js`: `animarNumero(elemento, valorFinal, duracaoMs, formatador)` com easing ease-out cúbico via `requestAnimationFrame`
- `js/relatorios.js` aplica nos 4 cards de estatística (valor formatado para moeda, total pedidos, ag. aprovação)
- Skips animation automaticamente se `prefereMenosMovimento()` retorna true

[2026-06-11] ✅ 2.4 — Badge de SLA nos cards de pedido
- `js/utils.js`: `calcularSLA(dataNecessaria)` → `{label, classe}` com classes `sla-danger`/`sla-warn`/`sla-ok`
- `css/components.css`: estilos `.sla-badge`, `.sla-ok`, `.sla-warn`, `.sla-danger` (verde/dourado/vermelho)
- `js/pedidos.js`: badge renderizado em `_renderKcard` e `_renderLista` para pedidos não-terminais
- `js/pedido-detalhe.js`: badge no cabeçalho do detalhe para pedidos não-terminais

[2026-06-11] ✅ 2.5 — Skeleton loading antes de dados chegarem
- `js/ui.js`: funções `skeletonKanban(nColunas)`, `skeletonLista(nLinhas)`, `skeletonDashCards(n)`
- `css/components.css`: `.skeleton`, `@keyframes shimmer`, variantes `.skeleton-text/title/card/row`, `.skeleton-kanban`, `.skeleton-col`
- `js/pedidos.js` renderiza `skeletonKanban(4)` antes do primeiro snapshot; `js/relatorios.js` renderiza `skeletonDashCards(4)`

[2026-06-11] ✅ 2.6 — Animação de fechamento de modal
- `css/components.css`: `.modal-overlay.closing` com `@keyframes overlayFadeOut` e `@keyframes modalOut`
- `js/ui.js`: `abrirModal` remove `.closing`, adiciona `.visible`; `fecharModal` adiciona `.closing`, remove `.visible`+`.closing` após 190ms
- Skip da animação quando `prefers-reduced-motion` ativo

[2026-06-11] ✅ 2.7 — Padrão `btnComLoading` para proteção de duplo-clique
- `js/ui.js`: `btnComLoading(btn, acao)` — desabilita btn, adiciona classe `btn-loading`, awaita ação, restaura
- `css/components.css`: `.btn-loading::after` com spinner animado
- `js/pedido-detalhe.js` usa o padrão nos botões de ação principais

[2026-06-11] ✅ 2.8 — Demo banner
- `js/ui.js`: `mostrarDemoBanner(isDemo, idioma)` cria/remove `.demo-banner` fixo no rodapé
- `css/components.css`: `.demo-banner`, `.demo-banner-close` (barra gold fixa bottom)
- `js/app.js` chama `mostrarDemoBanner(sessao.isDemo, idioma)` após login

[2026-06-11] ✅ 2.9 — Tooltips via `data-tooltip`
- `css/components.css`: `[data-tooltip]::before` tooltip CSS puro com delay 0.4s, aparece em hover e `focus-visible`
- Topbar buttons receberam `data-tooltip` e `aria-label` em `js/app.js`

[2026-06-11] ✅ 2.10 — Tap feedback em elementos interativos
- `css/components.css`: `:active` com `scale(0.97)` em `button`, `.kcard`, `.card`, `.pill`, `.chip`, `tbody tr`, `.notif-item`

[2026-06-11] ✅ 2.11 — Focus trap em modais
- `js/ui.js`: `abrirModal` instala handler `keydown` que mantém Tab/Shift+Tab dentro dos elementos focusáveis do modal
- `fecharModal` remove o handler e restaura o foco ao elemento que abriu o modal (`.focusTrigger`)
- Selector `_FOCUSAVEIS` cobre links, buttons, inputs, selects, textareas e `tabindex != -1`

[2026-06-11] ✅ 2.12 — Atributos ARIA na topbar
- `js/app.js`: todos os botões de ícone receberam `aria-label` e `data-tooltip`; SVGs decorativos têm `aria-hidden="true"`; badge tem `aria-live="polite"`; avatar tem `tabindex="0"` e `role="button"`

[2026-06-11] ✅ 2.13 — Handlers globais de teclado (ESC / Enter)
- `js/ui.js`: IIFE instala `document.keydown` — ESC fecha dialog ou modal mais recente; Enter confirma dialog (fora de textarea/select)
- `js/ui.js`: `abrirModal` auto-foca primeiro campo após 60ms

[2026-06-11] ✅ 2.14 — Contraste WCAG AA modo claro
- `css/tokens.css`: `--text3` no `.light` alterado de `#AFA398` (ratio ~1.9:1) para `#625C57` (~5.0:1 contra `--bg` #EDE8DF)
- Modo escuro `--text3: #8A8278` mantido (ok contra fundo escuro)

[2026-06-11] ✅ 2.15 — Empty states com visual branded
- `css/components.css`: `.empty-state-branded`, `.empty-icon`, `.empty-title`, `.empty-sub`
- `js/pedidos.js`: `_renderEmptyState(temBusca)` — dois variants: "Nenhum resultado para a busca" vs "Nenhum pedido ainda"
- `js/pedido-detalhe.js`: cotações e comentários usam `.empty-state-branded`

[2026-06-11] ✅ 2.16 — Validação robusta de formulários
- `js/utils.js`: `validarEmail(email)`, `validarRequerido(val)`, `validarNumeroPositivo(val)` exportados
- `js/config-usuarios.js`: validação campo a campo com mensagens específicas em PT; `validarEmail` aplicado em novos usuários (email desabilitado na edição)
- `js/config-cadastros.js`: validação de nome obrigatório em empresa, categoria e fornecedor já existia; mantida e verificada

[2026-06-11] ✅ 2.17 — Meta tags Open Graph e Twitter Card
- `index.html`: adicionados `og:type`, `og:site_name`, `og:title`, `og:description`, `og:image`, `twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`

[2026-06-11] ✅ 2.18 — XSS: escape antes de innerHTML
- `js/utils.js`: `esc()` / `_esc()` usados em todos os pontos que inserem dados do Firestore via innerHTML
- `js/pedidos.js`: `esc()` em título e nomes; `js/pedido-detalhe.js`: `_esc()` em descrição e nomes

[2026-06-11] ✅ 2.19 — Validators centralizados em `utils.js`
- `validarEmail`, `validarRequerido`, `validarNumeroPositivo` prontos para importação por qualquer módulo

[2026-06-11] ✅ 2.21 — `:focus-visible` outline acessível
- `css/base.css`: `:focus { outline: none }` + `:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px }` — visible apenas com navegação via teclado

[2026-06-11] ✅ 2.22 — Assets de logo e favicon
- `assets/logo/` contém: `praxis-icon.svg`, `praxis-logo.svg`, `praxis-icon-512.png`, `praxis-favicon.ico`
- `index.html` referencia todos com caminhos corretos; sem 404 esperado

[2026-06-11] ✅ 2.23 — Confirmações destrutivas
- `js/config-usuarios.js`: ao salvar edição de usuário com `ativo = false` partindo de usuário ativo → `prxConfirm` com danger=true antes de gravar
- `js/config-cadastros.js`: ao salvar edição de empresa com `ativa = false` partindo de empresa ativa → `prxConfirm` com danger=true antes de gravar

---

## Correções pós-teste manual (2026-06-11)

[2026-06-11] ✅ Fix 1.7-bis — "Confirmar pagamento" só aparece quando todas as parcelas estão pagas
- `js/pedido-detalhe.js` (linha ~555): adicionada guarda `const todasPagas = _parcelas.length === 0 || _parcelas.every(par => par.pago)`
- O botão só é adicionado ao DOM se `todasPagas === true`
- Impede que o pedido pule para "Pago" sem ter todas as parcelas quitadas individualmente

[2026-06-11] ✅ Fix 1.1-bis — Upload de comprovante permitido mesmo após parcela marcada como paga
- `js/pedido-detalhe.js` (seção `_renderCotacoes`): condição `!parc.pago && _podePagarParcela()` alterada para `_podePagarParcela() && !parc.comprovante`
- Agora o botão "Anexar" aparece para qualquer parcela sem comprovante, paga ou não
- Impede que comprovante fique sem upload caso o usuário clique "Confirmar" antes de anexar

[2026-06-11] ✅ Fix 1.6-bis — @mention autocomplete dropdown nos comentários
- `js/pedido-detalhe.js`: funções `_handleMentionInput` e `_fecharMentionDropdown`; textarea com listener `input`; ESC fecha o dropdown
- `index.html` template do detalhe: `<div id="mention-dropdown" class="mention-dropdown">` abaixo do textarea
- `css/components.css`: `.mention-dropdown`, `.mention-item`, `.avatar-xs` — lista posicionada `bottom: calc(100% + 4px)` acima do textarea

[2026-06-11] ℹ️ Diagnóstico bugs de seed (não são bugs de código):
- **1.3/1.4** — O seed usa `demoUserId` como `solicitanteId` e `compradorId=null` para pedidos em ag_cotacao. Por isso o botão cancelar e o botão liberar não aparecem nos pedidos seed. Com pedidos criados pelo usuário real, funciona corretamente.
- **0.11** — O seed associa o solicitante a TODAS as empresas. Em produção, cada usuário teria apenas suas empresas.
- **0.7** — Notificações requerem que as Cloud Functions estejam rodando (`npx firebase emulators:start --only auth,firestore,functions,storage`).

---

### Estado do Estágio 2
Todas as 23 tarefas do documento implementadas. 3 bugs encontrados em testes manuais corrigidos. Verificação visual pendente (ver smoke test abaixo).

## Smoke test do Estágio 2 (a verificar manualmente)

1. Login como demo → banner gold aparece no rodapé
2. Clicar X no banner → banner desaparece e não volta sem novo login
3. Acessar Pedidos → skeleton kanban aparece antes dos cards
4. Acessar Relatórios → skeleton cards aparecem; números sobem animados ao carregar
5. Pedido com `dataNecessaria` no passado → badge "Atrasado N dias" em vermelho no kcard e no detalhe
6. Pedido com `dataNecessaria` em 1-3 dias → badge "Faltam N dias" em dourado
7. Pedido sem pedidos cadastrados → empty state branded com texto "Nenhum pedido ainda"
8. Busca sem resultados → empty state "Nenhum resultado para…"
9. Abrir modal de novo pedido com Tab → foco permanece dentro do modal
10. Shift+Tab no primeiro campo → vai para o último campo do modal
11. ESC com modal aberto → modal fecha com animação fade-out
12. Após fechar modal → foco retorna ao botão que o abriu
13. Enter no dialog de confirmação → confirma sem clicar no mouse
14. Hover em botão da topbar → tooltip aparece após ~0.4s
15. Tentar salvar novo usuário com e-mail inválido → toast "E-mail em formato inválido."
16. Tentar salvar novo usuário sem selecionar empresa → toast "Vincule pelo menos uma empresa."
17. Editar usuário, desativar toggle → modal `prxConfirm` aparece antes de salvar
18. Editar empresa, desativar toggle → modal `prxConfirm` aparece antes de salvar
19. Modo claro (toggle tema) → textos terciários visíveis com contraste adequado
20. Inspecionar `<head>` no DevTools → meta tags og:title e twitter:card presentes

---

## Estágio 3 — Evolução Funcional (Fase 2)

[2026-06-11] ✅ 3.6 — Timestamps relativos em todo o sistema
- `js/utils.js`: `formatarDataRelativa(ts)` retorna `{label, title}` — "Agora", "Há X min/h/dias/meses" com fallback para data por extenso
- `formatTimestamp` delegado para `formatarDataRelativa().label` (compatível retroativamente)
- Aplicado na activity feed via `title` attribute (hover mostra data/hora exatas)

[2026-06-11] ✅ 3.5 — Activity feed unificado no detalhe do pedido
- `js/pedido-detalhe.js`: `_renderActivityFeed()` substitui `_renderComentarios()` e `_renderHistorico()` — merge de `_historico` e `_comentarios` ordenados por timestamp
- Tipos de evento: `status` (dot colorido), `comentario` (avatar + balão), `cotacao` (ícone clipboard), `comprovante` (ícone documento)
- `_iniciarListenerHistorico` e `_refreshComentarios` agora atualizam `#activity-feed`
- Ao salvar cotação: escreve em historico `{ tipo:'cotacao', fornecedorNome, valor }`
- Ao anexar comprovante: escreve em historico `{ tipo:'comprovante', parcelaNumero }`
- CSS: `.activity-feed`, `.feed-item`, `.feed-left`, `.feed-body`, `.feed-icon-dot`, `.feed-header`, `.feed-author`, `.feed-time`, `.feed-nota`
- Seções separadas "Comentários" e "Histórico" removidas; substituídas por seção única "Atividade"

[2026-06-11] ✅ 3.3 — Comparador de cotações lado a lado
- `js/pedido-detalhe.js`: botão "Comparar" no cabeçalho da seção Cotações quando `_cotacoes.length >= 2`
- `_compararCotacoes()` cria modal dinâmico com grid de colunas (uma por cotação)
- Menor valor destacado com `.text-green` e badge verde; cotação indicada com borda dourada
- CSS: `.cotacao-compare-grid`, `.cotacao-compare-col`, `.cotacao-compare-indicada`, `.cotacao-compare-valor`

[2026-06-11] ✅ 3.7 — Auditoria campo-a-campo (field-level audit)
- `js/pedido-detalhe.js`: botão "Editar pedido" em `_renderAcoes()` para solicitante-em-solicitado e gestor/supremo
- `_editarPedido()`: modal com campos título, descrição, valor estimado, data necessária, categoria, urgência
- `_salvarEdicaoPedido()`: diff dos 6 campos auditáveis; escreve em historico um doc `{ tipo:'edicao', campo, campoLabel, valorAnterior, valorNovo }` por campo alterado via `writeBatch`
- `_renderActivityFeed()`: tipo `edicao` renderizado com ícone de lápis e texto "X alterado de '...' para '...'"

[2026-06-11] ✅ 3.9 — Exportar pedido individual em PDF
- `js/pedido-detalhe.js`: botão "Exportar PDF" em `_renderAcoes()` para GESTOR, SUPREMO, FINANCEIRO e COMPRADOR
- `_exportarPedidoPDF()`: import dinâmico do jsPDF 2.5.1 (mesma CDN do relatório); helpers `linha()`/`secao()`/`quebraPagina()` com paginação automática em y>285
- Seções: cabeçalho (número + título), Dados do pedido (status, empresa, categoria, solicitante, comprador, quantidade, datas, valores, cc, observações), Histórico (status/cotação/comprovante/edição com timestamps pt-BR), Cotações (com flag INDICADA), Parcelas (pagas/em aberto)
- Arquivo salvo como `praxis-pedido-XXXX.pdf`; spinner + toast em sucesso/erro; guard de conexão

[2026-06-11] ✅ 3.13 — Optimistic UI nas ações principais
- `js/pedido-detalhe.js`: `_enviarComentario` insere comentário com `id: temp-{ts}` em `_comentarios` e re-renderiza o feed antes do `addDoc`; rollback no catch remove o temp, restaura o texto no input e mostra toast de erro; `_refreshComentarios()` substitui o temp pelo doc real após sucesso
- `js/notificacoes.js`: "Marcar todas" zera badge e dropdown imediatamente, restaura `items` originais no catch; clique individual remove o item da lista e navega sem aguardar o `updateDoc` (rollback via catch)
- Ações sérias (aprovar, reprovar, cancelar, pagar, executar compra) mantêm spinner bloqueante — sem optimistic

[2026-06-11] ✅ 3.17 — Tratamento de offline e erro de rede
- `js/ui.js`: `initOfflineWatcher()` — listeners `online`/`offline` no window; banner fixo vermelho no topo (`.offline-banner`) enquanto offline; toast success "Conexão restabelecida." ao voltar
- `js/ui.js`: `exigirConexao()` — retorna false + toast de erro se `navigator.onLine === false`; usado como guard antes de toda escrita com spinner
- `js/app.js`: `initOfflineWatcher()` chamado no boot
- `js/pedido-detalhe.js`: guard aplicado nas 12 funções de escrita com spinner + `_enviarComentario` — evita spinner infinito (escritas Firestore offline ficam em fila sem rejeitar)
- `js/pedidos.js`: guard em `_submeterNovoPedido` e `_tentarMoverPedido`; listener de pedidos agora renderiza estado de erro no lugar do skeleton quando a query falha
- CSS: `.offline-banner` em `css/components.css`

[2026-06-11] ✅ 3.16 — @menção com autocomplete e navegação por teclado
- `js/pedido-detalhe.js`: `_handleMentionKeydown(e)` — ↑↓ navegam (com wrap), Enter/Tab aplicam a menção selecionada, Escape fecha; interceptado antes dos atalhos do textarea
- `_mentionIndex` (estado de seleção), `_destacarMentionItem()`, `_aplicarMencao()` extraída para reuso mouse/teclado
- Filtro de sugestões: exclui o próprio usuário e inativos; apenas usuários com acesso à empresa do pedido (supremo sempre visível); `mouseenter` sincroniza índice com hover
- CSS: `.mention-item-active` compartilha estilo do hover

[2026-06-11] ✅ 3.11 — Indicador de comentário não lido no card
- Pedido recebe campo `ultimoComentarioEm: Timestamp` (atualizado fire-and-forget ao salvar comentário)
- Detalhe atualiza `vistoPor.{uid}: Timestamp` na primeira snapshot, com flag `_vistoMarcado` para evitar loop
- `_renderKcard(p)`: compara `_tsMs(p.ultimoComentarioEm)` > `_tsMs(p.vistoPor?.[uid])` → exibe `.kcard-unread-dot`
- CSS: `.kcard-unread-dot` — ponto dourado 8px no canto superior direito do card

[2026-06-11] ✅ 3.15 — Duplicar pedido
- `js/pedidos.js`: `agendarDuplicar(pedido)` exportado; `_pedidoFonteDuplicar` armazenado até próximo render; `_preencherModalDuplicar(p)` pré-preenche todos os campos do modal (título com prefixo "(Cópia)", empresa, quantidade, unidade, valor, cc, obs, categoria, urgente); abre modal automaticamente
- `js/pedido-detalhe.js`: botão "Duplicar pedido" em `_renderAcoes()` para SOLICITANTE, GESTOR e SUPREMO; binding chama `agendarDuplicar(_pedido)` + `navegar('pedidos')`
- Campos excluídos da duplicação: status, comprador, cotações, parcelas, historico, numeroPedido, dataNecessaria (requer nova data)

[2026-06-11] ✅ 3.2 — Drag & drop no kanban
- `js/pedidos.js`: `_transicoesDragPermitidas(perfil)` mapeia origin→[destinos] por perfil (exclui REPROVADO/CANCELADO que precisam de motivo)
- `_tentarMoverPedido(id, origem, destino)`: valida, escreve `status`+`atualizadoEm` via `updateDoc`, seta `compradorId`/`aprovadoPor` conforme destino, escreve historico fire-and-forget
- `_bindDragDrop(container)`: vincula HTML5 drag (`dragstart`, `dragover`, `dragleave`, `drop`, `dragend`) + touch drag (`touchstart`, `touchmove`, `touchend`) com ghost clonado
- Colunas com `data-status` no `.kanban-col` e `.kanban-cards`; cards com `draggable="true"`
- Drop inválido → `prxToast(msg, 'error')` descritivo; drop válido → spinner + toast success
- CSS: `.kcard-dragging`, `.kcard[draggable]`, `.kanban-cards.drop-over` em `css/components.css`

[2026-06-11] ✅ 3.8 — Filtros adicionais e ordenação na lista
- `js/pedidos.js`: estado `_filtroCategoria`, `_filtroEmpresa`, `_filtroComprador`, `_ordemCampo` (criadoEm default), `_ordemDesc`
- `_renderLista()`: barra `.lista-filtros` com selects de categoria, empresa e comprador (comprador apenas para perfis que enxergam `_usuarios`); botão "Limpar filtros" quando algum filtro ativo
- Cabeçalhos `th.sortable[data-campo]`: Pedido, Valor est., Status, Data — ícone de seta indica campo/direção ativos
- `_filtrarPedidos()`: aplica os 3 filtros extras + sort por campo quando `_viewMode === 'lista'`
- Bindings adicionados em `_renderView()` após cada render da lista (delegation sobre container)
- CSS: `.lista-filtros`, `.lista-filtros select`, `th.sortable` em `css/components.css`

[2026-06-11] ✅ 3.4 — Indicador de savings por pedido
- `js/pedido-detalhe.js`: badge "Economia: R$ X" no bloco de badges do cabeçalho do detalhe
- Exibido quando: pedido em APROVADO/COMPRADO/ENTREGUE/PAGO + 2+ cotações + cotação indicada
- Cálculo: `savings = max(cotações.valor) - indicada.valor`; ignorado se savings ≤ 0
- Badge reutiliza classe `.badge-green` já existente em `css/base.css`

[2026-06-11] ✅ 3.12 — Pill "Meus pendentes" com contador contextual
- `js/pedidos.js`: novo pill `data-filtro="pendentes"` inserido antes de "todos" nos filter-pills
- Lógica de filtro por perfil: Aprovador → EM_APROVACAO; Comprador → SOLICITADO-sem-comprador OU AG_COTACAO própria; Financeiro → ENTREGUE; Gestor/Supremo → urgentes + parados há +48h (não terminais); Solicitante → seus pedidos não terminais
- `_atualizarPillPendentes()`: calcula count sem alterar `_filtroAtivo` ativo e atualiza label do pill após cada `_renderView()`
- Pill exibe "Meus pendentes (N)" quando N > 0

[2026-06-12] ✅ 3.10 — Gráfico de linha temporal no dashboard
- `js/relatorios.js`: `_desenharGraficoLinha()` — Canvas API, gráfico de linha dourada com área preenchida; eixo X = últimos 6 meses (pt-BR); eixo Y = `valorFinal` total em R$ (não contagem); labels abreviadas no eixo Y (1k, 50k, 1M); tooltip `position:fixed` ao hover mostrando mês + valor exato; grade horizontal; usa `--gold`/`--text3`/`--border` via `getComputedStyle`
- `_carregarDados()`: deriva `_pedidosTodos` do mesmo snap (sem extra query) filtrando por status APROVADO/COMPRADO/ENTREGUE/PAGO e últimos 180 dias
- Exibido apenas para GESTOR, SUPREMO, FINANCEIRO no bloco inferior do dashboard

[2026-06-12] ✅ 3.14 — Gráfico de donut por categoria
- `js/relatorios.js`: `_desenharGraficoDonut()` — Canvas API; segmentos por `categoriaId` usando `cat.cor` do Firestore (fallback palette de 8 cores); buraco central preenchido com `--card`; legenda lateral com cor, nome truncado e %
- Usa `_pedidos` (período filtrado) em vez de `_pedidosTodos` — respeita o filtro de período ativo; filtrado adicionalmente por STATUS_CONCLUIDOS + valorFinal
- `_carregarDados()`: `_categorias` carregado em paralelo com parcelas+cotações via `Promise.all`
- Tooltip mostra `nome: R$ valor (X%)` — inclui percentual conforme spec
- Normalização de ângulo `atan2` para hit-test: `if (ang < -π/2) ang += 2π`
- Pedidos sem `categoriaId` agrupados em "Sem categoria"; filtro de empresa aplicado via `_filtroEmp`
- Exibido apenas para GESTOR, SUPREMO, FINANCEIRO

[2026-06-12] ✅ 3.4 (complemento) — Total de savings no dashboard
- `js/relatorios.js`: `_cotacoesPorPedido` carregado para pedidos com `valorFinal` em paralelo com parcelas; `totalSavings` calculado como `Σ(maior_cotação - indicada)` por pedido com 2+ cotações e indicação
- Card "Economia acumulada" adicionado abaixo da grade de 4 cards (verde, `.card-glow-green`) com count-up animado; aparece apenas quando `totalSavings > 0`

[2026-06-11] ✅ 3.1 — Número sequencial legível do pedido (#0001)
- `firestore.rules`: regra `match /_meta/{docId}` allow read/write para usuários logados
- `js/pedidos.js`: `_submeterNovoPedido` usa `runTransaction` que lê `_meta/contadores`, incrementa `totalPedidos` atomicamente e grava `numeroPedido` no pedido
- `js/pedidos.js`: `_renderKcard` exibe `<div class="kcard-num">#XXXX</div>` em dourado acima do título; `_renderLista` exibe o número na coluna Pedido
- `js/pedido-detalhe.js`: breadcrumb usa `p.numeroPedido` com fallback para `#${id.slice(-4)}`
- `css/components.css`: `.kcard-num` — dourado 0.68rem 700
- `_build/seed-emulator.js`: cada pedido recebe `numeroPedido` sequencial; após loop, grava `_meta/contadores.totalPedidos`

---

## Correções e melhorias entre estágios 3→4 (2026-06-12)

[2026-06-12] ✅ Fix demo — fixDemoClaims + custom claims automáticos
- `functions/index.js`: nova Cloud Function callable `fixDemoClaims` define claims JWT para o usuário demo
- `js/app.js`: após login demo, se claims ausentes → chama `fixDemoClaims()` e força renovação do JWT
- Corrige drag & drop e escritas Firestore que falhavam silenciosamente por falta de claims

[2026-06-12] ✅ Fix 3.1 — numeroPedido formato PRX-XXXX
- `js/pedidos.js`: numeroPedido gerado como `PRX-${String(total).padStart(4, '0')}` (ex: PRX-0001)
- `js/pedido-detalhe.js`: fallback em breadcrumb e PDF alterado para `—` quando campo ausente
- `functions/src/scheduled.js`: `_aplicarSeed` agora gera `PRX-XXXX` sequencial + grava contador

[2026-06-12] ✅ Fix — Filtro de período na aba Pedidos
- `js/pedidos.js`: estado `_filtroDataIni` / `_filtroDataFim`; inputs de data abaixo da toolbar
- `css/views.css`: classes `.pedidos-date-filter`, `.date-filter-label`, `.date-filter-sep`

[2026-06-12] ✅ Fix 3.5 — Activity feed coluna direita vazia
- `js/pedido-detalhe.js`: removido wrapper `.detalhe-row` ao redor do card de activity feed

---

## Estágio 4 — Refinamento Avançado e Portfólio (Fase 3)

[2026-06-12] ✅ 4.1 — PWA (Progressive Web App)
- `manifest.json` criado na raiz: name "Praxis", short_name "Praxis", theme/bg `#060606`, display `standalone`, ícones SVG (any) + PNG 512x512
- `index.html`: `<link rel="manifest" href="/manifest.json">` adicionado no `<head>`
- `service-worker.js` criado: cache-first para assets same-origin, network-first para CDN, network-only para Firestore/Auth/Functions; fallback offline → index.html cacheado
- `js/app.js`: registro do SW condicional — apenas quando hostname não é `localhost`/`127.0.0.1`

[2026-06-12] ✅ 4.2 — Command palette (Cmd+K / Ctrl+K)
- `js/ui.js`: `initCommandPalette()`, `abrirCommandPalette()` — paleta com overlay, input com foco automático, ↑↓ navega, Enter confirma, ESC fecha; pedidos filtrados em tempo real por numeroPedido/título; 5 ações fixas (ir para Pedidos/Relatórios/Config, Novo pedido, Alternar tema)
- `js/pedidos.js`: `window.__getPedidos = () => _pedidos` — getter global para a paleta consumir sem circular import
- `js/app.js`: botão `#btn-cmd-palette` na topbar; `initCommandPalette()` no boot; binding do botão em `initTopbarEvents`
- `css/components.css`: `.cmd-palette-overlay`, `.cmd-palette`, `.cmd-input`, `.cmd-item`, `.cmd-group-label`, `.cmd-palette-footer`

[2026-06-12] ✅ 4.3 — Tour guiado no primeiro acesso
- `js/ui.js`: `iniciarTour(isDemo)` / `reativarTour()` — tour de 5 passos com spotlight CSS (`box-shadow` 9999px), popover posicionado dinamicamente, ↑ "Pular" / "Próximo" / "Concluir", estado salvo em `localStorage` (regular) / `sessionStorage` (demo)
- `js/pedidos.js`: `iniciarTour(sessao.isDemo)` chamado após `initTopbarEvents` em `renderPedidos`
- `js/config-geral.js`: card "Tour de apresentação" com botão "Ver tour" que navega para pedidos e chama `reativarTour()`
- `css/components.css`: `.tour-target` (spotlight via box-shadow), `.tour-popover`, `.tour-step-count`, `.tour-titulo`, `.tour-desc`, `.tour-actions`

[2026-06-12] ✅ 4.4 — Tela de boas-vindas no demo
- `js/auth.js`: `_mostrarBoasVindas()` — overlay fixo sobre a tela de login, suporte PT/EN, logotipo, tagline, 3 bullets, botão "Começar a explorar" que chama `_entrarDemo()` após fade-out; `btn-demo-continuar` agora chama `_mostrarBoasVindas()` em vez de `_entrarDemo()` diretamente
- `css/views.css`: `.bv-overlay`, `.bv-card`, `.bv-logo`, `.bv-tagline`, `.bv-bullets`, `.bv-btn`, `.bv-credit` — animações escalonadas com `cmdIn`

[2026-06-12] ✅ 4.7 — Reabertura de pedido reprovado
- `js/pedido-detalhe.js`: botão "Reabrir pedido" em `_renderAcoes()` para SOLICITANTE/GESTOR/SUPREMO quando `status === REPROVADO` e `!reabertoPara`
- `_reabrirPedido()`: `runTransaction` incrementa contador → gera `PRX-XXXX` → cria novo pedido com `reabertoDe: originalId`; atualiza original com `reabertoPara: novoId`; escreve historico no novo pedido
- Modal `modal-reabrir` com textarea de justificativa obrigatória
- Banners `.reaberto-banner` nos dois pedidos (original e reabertura) com link para o outro
- `css/views.css`: `.reaberto-banner`, `.reaberto-link`

[2026-06-12] ✅ 4.8 — Paginação na lista de pedidos
- `js/pedidos.js`: estado `_paginaAtual = 0` e `_PAGE_SIZE = 20`; em `_renderView()` modo lista, `lista` é fatiada antes de passar para `_renderLista()`; controles `.lista-paginacao` adicionados dinamicamente quando `totalFiltrada > 20`
- Botões "← Anterior" / "Próxima →" com SVG chevron e estado `disabled` quando nas bordas
- Indicador "Página X de Y · N pedidos" centralizado
- Reset para página 0 em todos os eventos de filtro: pills, busca, datas, ordenação de colunas, dropdowns de categoria/empresa/comprador, toggle para modo lista
- Kanban não afetado (usa `lista` completa sem paginação)
- `css/views.css`: `.lista-paginacao`, `.pagina-info`

[2026-06-12] ✅ 4.10 — Anexos gerais
- `js/constants.js`: `STORAGE_PATHS.anexo(pedidoId)` adicionado
- `js/pedido-detalhe.js`: card "Anexos" antes das parcelas com botão "Adicionar" (label sobre input file oculto)
- `_uploadAnexo(file)`: valida MIME (PDF/JPG/PNG/WebP/DOCX/XLSX) e tamanho (10 MB); upload para Storage; cria doc em subcollection `pedidos/{id}/anexos`; escreve historico `{tipo:'anexo'}`
- `_removerAnexo(anexoId, storagePath)`: `prxConfirm` → `deleteDoc` + `deleteObject` (fire-and-forget)
- `_renderAnexos()`: lista com ícone por tipo (PDF=vermelho, imagem=dourado, outro=cinza), nome, tamanho formatado, autor, timestamp relativo, link download, botão remover (próprio ou gestor+)
- `_renderActivityFeed()`: tipo `anexo` com ícone paperclip e texto "Arquivo X anexado por Y"
- `firestore.rules`: regra `match /anexos/{anexoId}` — read/create exige acesso à empresa; delete exige ser autor ou gestor+; update false
- `css/components.css`: `.anexo-item`, `.anexo-icon`, `.anexo-icon-pdf`, `.anexo-icon-img`, `.anexo-info`, `.anexo-nome`, `.anexo-meta`

[2026-06-12] ✅ 4.11 — SLA Timeline
- `js/pedido-detalhe.js`: `_renderSLATimeline()` — extrai transições de status do `_historico` (filtra `h.status && (!h.tipo || h.tipo === 'status')`); ignora se < 2 transições
- Barra horizontal proporcional com segmentos coloridos; gargalo (segmento mais longo) com borda dourada e animação de pulso para pedidos em andamento
- `_formatDuracao(ms)` — formata "Xd Xh" / "Xh" / "Xmin"
- Legenda abaixo da barra com cada status e duração
- `css/components.css`: `.sla-timeline-wrap`, `.sla-timeline-header`, `.sla-timeline`, `.sla-seg`, `.sla-gargalo`, `@keyframes slaAndamento`, `.sla-andamento`, `.sla-legend`, `.sla-legend-item`, `.sla-legend-dot`

[2026-06-12] ✅ 4.6 — Ações em massa (bulk actions)
- `js/pedidos.js`: estado `_selecionados = new Set()`; coluna de checkbox adicionada à tabela lista (thead com "selecionar tudo" + `cb-select-all`, tbody com `.bulk-cb` por linha)
- Clique na célula `td.bulk-cb-cell` tem `stopPropagation()` para não disparar navegação ao detalhe
- Barra flutuante `.bulk-bar` (fixed bottom, 50% transform) com count dourado, ações e botão desmarcar; aparece ao selecionar 1+; oculta ao trocar para kanban (seleção limpa)
- **Exportar CSV**: gera CSV com BOM UTF-8 (abre corretamente no Excel), colunas Número/Título/Empresa/Status/Valor/Data; separador `;`; salvo como `praxis-pedidos.csv`
- **Cancelar selecionados**: botão visível apenas para GESTOR, SUPREMO, SOLICITANTE; abre `modal-bulk-cancel` com lista de candidatos elegíveis (estados SOLICITADO/AG_COTACAO/EM_APROVACAO/APROVADO); select de `MOTIVOS_CANCELAMENTO` + textarea "Outros"; `Promise.all` com `updateDoc` + historico fire-and-forget; spinner + proteção duplo-clique
- Seleção persiste entre trocas de filtro/página; limpa ao trocar para kanban
- `css/components.css`: `.bulk-bar`, `.bulk-count`, `.bulk-bar-actions` com animação `cmdIn`

[2026-06-12] ✅ 4.9 — README e docs completos
- `README.md`: atualizado com features do Estágio 4 (bulk actions, saved views, attachments, SLA timeline, PWA, command palette, tour); stack, estrutura de arquivos e setup local revisados
- `docs/arquitetura.md`: modelo de dados atualizado (subcollection `anexos`, campo `reabertoDe/Para`, `_meta/contadores`); Storage paths documentados; tabela de funcionalidades avançadas do Estágio 4
- `docs/fluxo-pedidos.md`: reabertura de pedido reprovado (fluxo completo); ações em massa documentadas (elegibilidade, comportamento, historico)
- `docs/permissoes.md`: novas linhas — cancelamento em massa, reabertura, adicionar/remover anexo, exportar CSV

[2026-06-12] ✅ 4.14 — Polimento final — auditoria automatizável
- Zero `alert/confirm/prompt` nativos em todo `js/` (verificado via grep)
- Zero coerção de IDs de Firestore (`parseInt`/`Number()` só em campos de quantidade/parcelas)
- `_build/emulator-data/` está no `.gitignore` (linha 36)
- Único `console.log` restante é o de conexão aos emuladores em `firebase.js:63` — só roda em `localhost`, aceitável
- Checklist restante da 4.14 requer percurso manual por cada perfil em dark/light (ver smoke test final do Estágio 4 no spec)

[2026-06-12] ✅ 4.12 — Visões salvas
- `js/pedidos.js`: estado `_viewsSalvas = []` e `const _VIEWS_MAX = 8`; persistência em `localStorage` por chave `praxis_views_{uid}`
- Botão "Salvar visão" (ícone bookmark) na toolbar, ao lado do botão "Novo pedido"
- Modal `modal-salvar-visao` com input de nome (máx 40 chars); Enter confirma; validação de nome obrigatório e limite de 8 visões
- `<div id="views-salvas-row" class="pedidos-views-row">` renderizado abaixo da barra de filtros de data; oculto quando lista vazia
- Cada pill mostra nome clicável (aplica visão), ícone de renomear (inline — troca botão por input; ESC cancela) e ícone de remover (com `prxConfirm`)
- `_capturarEstadoFiltros()` captura os 10 estados (filtroAtivo, termoBusca, 3 filtros extras, datas, ordem, viewMode)
- `_aplicarView(estado)` restaura todos os estados + sincroniza DOM (pills, inputs, toggles) + re-renderiza
- `css/components.css`: `.pedidos-views-row`, `.view-salva-pill`, `.view-salva-nome`, `.view-salva-rename`, `.view-salva-del`, `.view-salva-input`

[2026-06-12] ✅ 4.13 — Refinamentos mobile
- **Bottom navigation bar** (<768px): função `_renderBottomNav()` em `app.js` — nav fixa no `body`, itens condicionais por perfil (Solicitante/Comprador: só Pedidos; Aprovador/Financeiro: + Relatórios; Gestor/Supremo: + Configurações; sempre: Sair com `prxConfirm`); atualizada a cada chamada de `initTopbarEvents()`; removida no logout via `onAuthStateChanged`
- **CSS bottom nav**: `.bottom-nav` + `.bottom-nav-item` em `themes.css` (z-index 900, height 56px + safe-area-inset); `.main-content` recebe `padding-bottom` móvel para conteúdo não ficar sob a nav; `.bulk-bar` elevado acima da nav; hamburger oculto com `!important`
- **Config sub-nav no mobile**: topbar recebe `data-mode="config"` quando `modoConfig=true`; CSS exibe `.topbar-nav` como row scrollável horizontal no mobile para permitir navegação entre Usuários/Cadastros/Geral sem o hamburger
- **Pull-to-refresh**: `_initPullToRefresh()` em `pedidos.js` — listener de touch no `#app`; indicador visual `.pull-indicator` animado (aparece ao puxar > 24px, confirma ao ≥ 68px, gira durante refresh); chama `window.__navegar('pedidos')` após 550ms; registrado em `registrarLimpador` para cleanup correto
- **Kanban scroll sem conflito**: `_bindDragDrop` usa longpress 280ms antes de ativar drag — `touchstart` passive (não bloqueia scroll), timer cancela se dx > 8px e dx > dy (movimento horizontal = scroll), ghost só criado após hold; CSS `.kcard-drag-active { touch-action: none }` aplicado apenas durante drag ativo; `.kcard[draggable]` agora usa `touch-action: pan-x pan-y` por padrão

[2026-06-12] ✅ 4.5 — Tradução EN completa
- `js/constants.js`: objeto `TRADUCOES` com seções `pt` e `en` expandido para 300+ chaves cobrindo todos os arquivos JS
- Função `t(chave, lang?)` lê `sessionStorage.praxis_lang` e devolve a tradução ou a própria chave como fallback
- Arquivos com `import { t } from './constants.js'` adicionado e strings traduzidas: `auth.js`, `pedidos.js`, `pedido-detalhe.js`, `relatorios.js`, `app.js`, `ui.js`, `config-usuarios.js`, `config-cadastros.js`, `config-geral.js`, `notificacoes.js`
- Cobertura: todos os `prxToast`, `innerHTML` templates, títulos de modal, botões, labels, badges, estados vazios, toasts de erro/sucesso
- `ui.js`: `_TOUR_PASSOS` convertido de array estático para função `_getTourPassos()` para avaliação lazy ao tempo de render (não no carregamento do módulo)
- `config-cadastros.js`: tabs de aba, cabeçalhos de seção, badges de status/tipo, botões e todos os toasts traduzidos
- `config-geral.js`: títulos dos cards, descrições, botões e toasts traduzidos
- `notificacoes.js`: toasts de erro e fallback de título de notificação traduzidos
