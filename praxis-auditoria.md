# Praxis — Auditoria Técnica Completa
> Engenheiro sênior full-stack · Auditoria pré-demonstração · Junho 2026
> **REGRA ABSOLUTA: Não fazer commits. Não usar git. Apenas escrever/editar arquivos localmente.**

---

## Resumo Executivo

O projeto está **bem mais avançado do que uma primeira olhada sugere**. Auditando o código real arquivo por arquivo, confirmei que muita coisa crítica já está corretamente implementada:

**Já implementado e correto:**
- `runTransaction` no claim do comprador (`_assumirPedido`) — correto
- `runTransaction` na aprovação (`_aprovarPedido`) — correto
- `runTransaction` na reprovação (`_reprovarPedido`) — correto
- Botão "Liberar pedido" (`_liberarClaim`) para gestor/supremo — implementado
- Reprovado restrito a `EM_APROVACAO` — correto na função e nas ações
- Motivos estruturados de reprovação/cancelamento com campo "Outros" — implementado
- Cloud Functions `triggers.js` com notificações por transição — implementado
- `setUserClaims` Custom Claims — implementado
- Canvas `#bg-canvas` posicionado fora do `#app` no `index.html` — correto
- Design tokens dark/light completos em `tokens.css` — correto
- AFN light mode no rodapé já existe em `themes.css` — correto
- Responsividade mobile (kanban scroll, tabelas viram cards, modal bottom-sheet) — implementada em `themes.css`

**Os problemas reais a corrigir estão listados abaixo, por prioridade.**

---

## PRIORIDADE ALTA (bloqueadores para demonstração)

### A1. Aprovador vê dados financeiros no dashboard — VIOLA O SPEC
**Arquivo:** `js/relatorios.js`
**Problema:** A função `_renderDash()` renderiza todos os cards financeiros (Total gasto, Parcelas a vencer, Gasto por empresa, Próximas parcelas) sem verificar o perfil. O spec é explícito: **Aprovador NÃO acessa relatórios financeiros consolidados**. Hoje ele vê tudo.
**Correção:**
- No início de `_renderDash()`, computar: `const podeVerFinanceiro = ['supremo','gestor','financeiro'].includes(sessao.usuario.perfil)`
- Se `false` (Aprovador), ocultar/omitir do HTML: card "Total gasto", card "Parcelas a vencer", bloco "Gasto por empresa", bloco "Próximas parcelas"
- Manter visível para Aprovador apenas: card "Total de pedidos", card "Ag. aprovação" (com urgentes), bloco "Status dos pedidos"
- Também ocultar os botões de export Excel/PDF para Aprovador, já que exportam dados financeiros

### A2. Seed do banco precisa estar completo e ser o único
**Arquivos:** `functions/seed.json` (canônico) e `assets/demo/seed.json` (duplicado divergente)
**Problema:** Existem dois seeds com estruturas diferentes. O `functions/seed.json` tem estrutura rica (key, historico, cotacoes, parcelas aninhados); o `assets/demo/seed.json` é simplificado e incompleto. Isso gera confusão sobre qual é a fonte de verdade.
**Correção:**
- Adotar `functions/seed.json` como ÚNICO seed. A Cloud Function `demoReset` deve lê-lo.
- Remover `assets/demo/seed.json` OU torná-lo um symlink/cópia idêntica do canônico (preferível remover e ajustar qualquer referência).
- Garantir que o seed final tenha distribuição completa:
  - 5 Solicitado (2 urgentes)
  - 4 Ag. cotação (variando nº de cotações)
  - 3 Em aprovação (cotações completas + 1 indicada)
  - 4 Aprovado
  - 3 Comprado (1 com parcelas)
  - 4 Entregue (2 com parcelas vencendo em 3 dias para popular o dashboard)
  - 5 Pago
  - 2 Reprovado (motivos distintos)
  - 2 Cancelado (motivos distintos)
- Cada pedido: histórico com timestamps coerentes, 2+ comentários (com @menção), cotações onde aplicável, parcelas onde aplicável
- 8 fornecedores fictícios com CNPJ realista
- 8 categorias padrão + 2 personalizadas
- 6 usuários (um por perfil) + 3 empresas (2 ativas, 1 inativa)
- Todos com `isDemo: true`

### A3. Nomenclatura de rota inconsistente: config-cadastros
**Arquivos:** `js/app.js`, `js/config-cadastros.js`
**Problema:** O spec previa `config-geral.js` consolidando tudo, mas a implementação criou `config-cadastros.js` (Empresas/Categorias/Fornecedores em abas) + `config-geral.js` (preferências). A estrutura em si é boa, mas a rota `config-cadastros` é menos clara e diverge do spec.
**Decisão:** MANTER a separação em dois arquivos (funciona bem), mas:
- A navegação de config mostra: `Usuários · Cadastros · Geral` — confirmar que está coerente em todos os pontos (`renderTopbar` e `_toggleMobileMenu` em `app.js`)
- Confirmar que `config-geral.js` tem conteúdo real (preferências) e não está vazio/placeholder
- Se `config-geral` estiver vazio, ou popular com preferências reais (ex: tema padrão do sistema, idioma padrão) ou removê-lo e deixar só Usuários + Cadastros

---

## PRIORIDADE MÉDIA (qualidade visual e completude)

### M1. Glow colorido nos cards do dashboard
**Arquivos:** `js/relatorios.js`, `css/components.css`
**Problema:** O card "Total gasto" usa gradient inline; "Total de pedidos" usa `.card-glow-green`; "Ag. aprovação" usa `.card-glow-red`; mas "Parcelas a vencer" não tem glow. Padronizar.
**Correção:**
- Confirmar/criar em `components.css` as classes: `.card-glow-gold`, `.card-glow-green`, `.card-glow-red`, `.card-glow-blue` aplicando o `::before` com radial-gradient da cor correspondente
- Aplicar consistentemente: Total gasto → `card-glow-gold`, Total pedidos → `card-glow-green`, Ag. aprovação → `card-glow-red`, Parcelas a vencer → `card-glow-gold`
- Trocar o gradient inline do card "Total gasto" pela classe, para manter consistência

### M2. Notificação #14 — Pedido entregue → Solicitante
**Arquivo:** `functions/src/triggers.js`
**Problema:** No `case 'entregue'`, só notifica o Financeiro (evento #9). O spec define evento #14: também notificar o Solicitante de que o pedido dele chegou.
**Correção:** No `case 'entregue'`, após notificar o financeiro, buscar `pedido.solicitanteId` e criar notificação `pedido_entregue_solic` para ele (in-app, sem e-mail).

### M3. Confirmar campo dataCompra na execução de compra
**Arquivo:** `js/pedido-detalhe.js`
**Problema:** O spec define `dataCompra` persistido ao mover para Comprado. Verificar se `_executarCompra()` salva `dataCompra` (idealmente editável no modal, default hoje).
**Correção:** Garantir que o modal de compra tem campo de data (default `hojeISO()`) e que `dataCompra` é gravado no Firestore junto de fornecedor, valorFinal, condicaoPagamento e parcelas.

### M4. Fornecedor estruturado com autocomplete
**Arquivos:** `js/pedido-detalhe.js` (modal de cotação e de compra), `js/config-cadastros.js`
**Problema:** O modal de cotação tem campo de fornecedor como texto livre simples. O spec pede autocomplete contra `/fornecedores` + criação automática se não existir, para evitar duplicatas.
**Correção:**
- Ao digitar fornecedor (na cotação e na compra), buscar em `/fornecedores` por nome normalizado e sugerir correspondências (datalist ou dropdown)
- Se não existir, criar o documento em `/fornecedores` com `nome`, `nomeOriginal`, `cnpj` (opcional), `criadoEm`, `usos: 1`
- Se existir, incrementar `usos` e usar o `fornecedorId` existente
- Salvar `fornecedorId` + `fornecedorNome` (desnormalizado) na cotação/pedido

### M5. Assets de logo
**Pasta:** `assets/logo/`
**Problema:** `index.html` referencia `praxis-favicon.ico` e `praxis-icon-512.png`. Confirmar que os arquivos existem; se não, criar.
**Correção:** Criar (se ausentes) SVGs vetoriais para o ícone (delta/triângulo dourado sobre fundo escuro) e o wordmark. Gerar PNG/ICO a partir do SVG. Garantir que o favicon carrega sem 404.

### M6. README incompleto
**Arquivo:** `README.md`
**Problema:** Só tem título + uma linha de descrição.
**Correção:** Completar (em inglês, para portfólio europeu) com: descrição, stack, funcionalidades principais, screenshots/GIF, instruções de setup (`cp js/config.example.js js/config.js` + Firebase), link de demo, resumo de arquitetura. Tom profissional.

### M7. Pasta docs/ vazia
**Pasta:** `docs/`
**Problema:** Spec prevê `arquitetura.md`, `fluxo-pedidos.md`, `permissoes.md` — ainda não criados.
**Correção:** Criar os três com conteúdo real extraído do spec (diagrama de estados, matriz de permissões, decisões técnicas). Bom diferencial para recrutadores.

---

## PRIORIDADE BAIXA (polimento)

### B1. Login card — backdrop-filter pode borrar estrelas demais
**Arquivo:** `css/views.css`
**Problema:** `.login-card` usa `backdrop-filter: blur(16px)`. Sobre o canvas de estrelas, pode borrar demais e tirar o efeito desejado.
**Correção:** Reduzir para `blur(8px)` e validar visualmente que as estrelas aparecem suavemente atrás do card.

### B2. Inline styles com var(--text3) no light mode
**Arquivos:** `js/relatorios.js`, `js/pedidos.js`, `js/pedido-detalhe.js`
**Problema:** Vários `style="color:var(--text3)"` inline. No light, `--text3` (#AFA398) pode ter contraste fraco em alguns contextos.
**Correção:** Auditar e, onde o contraste ficar fraco no light, trocar por classe CSS dedicada ou usar `--text2`.

### B3. Limpeza de console.log
**Todos os JS**
**Correção:** Manter `console.error` para erros reais; remover `console.log` de debug não essenciais.

### B4. Auditoria de strings mágicas e IDs
**Todos os JS**
**Correção:** Confirmar que todas as comparações de status usam `STATUS.*` de `constants.js` (a maior parte já usa). Confirmar que nenhum ID do Firestore passa por `parseInt`/`+`/`Number`.

### B5. Verificar firestore.rules e indexes
**Arquivos:** `firestore.rules`, `firestore.indexes.json`
**Correção:** Confirmar que as rules segregam por `empresas[]` do token e protegem subcoleções (cotações, comentários, parcelas, histórico, notificações por dono). Confirmar os 3 índices compostos do spec.

---

## VERIFICAÇÕES FUNCIONAIS (rodar e confirmar)

Antes de declarar pronto, executar nos emuladores Firebase:

**Fluxo principal:**
- [ ] Criar pedido (Solicitante) → aparece em Solicitado
- [ ] Assumir (Comprador) → vai para Ag. cotação; testar 2 cliques simultâneos (transaction barra o segundo)
- [ ] Adicionar 3 cotações com arquivo/valor/prazo/condições → indicar 1
- [ ] Mover para Em aprovação
- [ ] Aprovar (Aprovador) → testar 2 aprovações simultâneas (transaction barra a segunda, mensagem amigável)
- [ ] Executar compra (fornecedor + valor + condição + dataCompra + parcelas)
- [ ] Confirmar entrega → status Entregue
- [ ] Financeiro confirma pagamento/parcelas → Pago

**Alternativos:**
- [ ] Reprovar (motivo da lista + Outros) — só disponível em Em aprovação
- [ ] Cancelar em Solicitado (próprio Solicitante) e em etapas intermediárias (Gestor)
- [ ] Liberar pedido travado (Gestor/Supremo) → volta para fila

**Permissões:**
- [ ] Solicitante não vê Aprovar; Financeiro não vê Assumir
- [ ] Aprovador entra em Relatórios mas SEM dados financeiros (após correção A1)
- [ ] Usuário só enxerga pedidos das suas empresas

**Notificações:**
- [ ] Os 14 eventos criam documento correto; badge atualiza; marcar lida funciona
- [ ] Evento #14 (entregue → solicitante) dispara após correção M2

**Visual/UX:**
- [ ] Estrelas visíveis em TODAS as telas (login, pedidos, detalhe, relatórios, config)
- [ ] Dark/light alterna em tudo e persiste; AFN troca de cor
- [ ] Cards kanban: glow de baixo + hover levanta + borda acende
- [ ] Export Excel e PDF baixam respeitando filtros

**Mobile (375px):**
- [ ] Kanban com scroll horizontal
- [ ] Dashboard empilhado
- [ ] Tabelas viram cards
- [ ] Modal em bottom-sheet, campos em coluna única

---

## ORDEM DE EXECUÇÃO RECOMENDADA

1. **A1** — Aprovador sem financeiro (rápido, alto impacto, é violação de spec)
2. **A2** — Seed completo (essencial para a demo ter conteúdo rico)
3. **A3** — Resolver config-cadastros/geral (coerência de navegação)
4. **M1–M4** — Glow dos cards, notificação #14, dataCompra, fornecedor autocomplete
5. **M5–M7** — Assets, README, docs
6. **B1–B5** — Polimento final
7. Rodar todas as **verificações funcionais** nos emuladores

---

*Fim da auditoria. Versão 2.0 (revisada contra o código real do repositório).*
