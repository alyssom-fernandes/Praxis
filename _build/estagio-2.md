# ESTÁGIO 2 — Demo Impecável + Base de Qualidade (Fase 1)

> ## RITUAL DE INÍCIO (OBRIGATÓRIO ANTES DE COMEÇAR)
> 1. Leia `_build/00-PROTOCOLO.md` inteiro.
> 2. Leia `_build/PROGRESS.md` — confirme que os Estágios 0 e 1 estão ✅. Se não estiverem, volte e termine-os primeiro.
> 3. Garanta que o Firebase Emulator está rodando com o seed carregado (`_build/01-AMBIENTE.md`).
> 4. Leia este documento inteiro antes de tocar em qualquer arquivo.
> **git é PROIBIDO. Uma fatia vertical por vez. Rode tudo no emulador. Verifique com checklist. Atualize o PROGRESS.md. Nunca pare no meio de uma tarefa.**

---

## OBJETIVO DESTE ESTÁGIO

O fluxo já funciona (Estágios 0 e 1). Agora o sistema vai ganhar o polimento que separa um projeto amador de um produto profissional, e a base de qualidade (acessibilidade, segurança, robustez) que impressiona recrutadores europeus. Ao fim deste estágio, o Praxis estará pronto para uma demonstração que impressiona, com cada interação parecendo cuidada e cada tela parecendo viva.

**Lembre-se do Princípio 3 do produto:** a beleza do Praxis vem da profundidade sutil, não do enfeite. NÃO adicione efeitos chamativos novos. As melhorias aqui são refinamentos dos fundamentos, não camadas extras de decoração.

---

## TAREFA 2.1 — Count-up nos números do dashboard

**Depende de:** Estágios 0 e 1 completos
**Arquivos:** `js/relatorios.js`, `js/utils.js`

**Fazer:**
- Criar em `utils.js` uma função `animarNumero(elemento, valorFinal, duracaoMs, formatador)` que anima a contagem de 0 (ou de um valor inicial) até o valor final, usando `requestAnimationFrame`, com easing suave (ease-out).
- Aplicar nos cards de métrica do dashboard (Total de pedidos, Total gasto, Ag. aprovação, Parcelas a vencer): ao carregar a tela, os números sobem de 0 até o valor real.
- O formatador deve respeitar moeda (R$) e separadores quando aplicável.
- **Respeitar `prefers-reduced-motion`** (ver tarefa 2.10): se o usuário pede menos movimento, mostrar o número final direto, sem animação.

**Definição de Pronto:**
- [ ] Os números dos cards do dashboard animam de 0 ao valor real ao carregar
- [ ] Valores monetários animam formatados (R$)
- [ ] Com `prefers-reduced-motion` ativo, aparecem direto sem animar
- [ ] Sem travadas ou números "pulando" o valor final

**Verificar:** No emulador, abra Relatórios e observe a contagem. Ative `prefers-reduced-motion` no navegador e recarregue para confirmar o fallback.

**Ao concluir:** marque 2.1 ✅ no PROGRESS.md.

---

## TAREFA 2.2 — Skeleton loading

**Depende de:** 2.1
**Arquivos:** `css/components.css`, `js/ui.js`, telas que carregam dados (pedidos, detalhe, relatórios)

**Fazer:**
- Criar um componente de skeleton (placeholder animado com shimmer suave) em `components.css` — retângulos no tom `--card2`/`--card3` com uma animação de brilho passando.
- Substituir os spinners de carregamento inicial das telas principais por skeletons que imitam o layout que vai aparecer: cards de kanban viram skeletons de card; linhas de tabela viram skeletons de linha; cards de dashboard viram skeletons de card.
- O skeleton aparece enquanto os dados do Firestore carregam e some quando chegam.
- Respeitar `prefers-reduced-motion`: sem o shimmer animado, apenas o bloco estático.

**Definição de Pronto:**
- [ ] Telas principais mostram skeleton no lugar de spinner durante o carregamento
- [ ] O skeleton lembra o layout final (não é um bloco genérico)
- [ ] Some suavemente quando os dados chegam
- [ ] Com `prefers-reduced-motion`, sem shimmer animado

**Verificar:** No emulador, recarregue cada tela principal e observe o skeleton antes dos dados. (Se carregar rápido demais para ver, pode adicionar um atraso artificial temporário só para validar, depois remover.)

**Ao concluir:** marque 2.2 ✅ no PROGRESS.md.

---

## TAREFA 2.3 — Animação de entrada dos modais

**Depende de:** Estágios 0 e 1
**Arquivos:** `css/components.css`, `js/ui.js`

**Fazer:**
- Adicionar uma animação sutil de entrada nos modais: o overlay faz fade-in e o card do modal faz um leve scale (de ~0.97 para 1) + fade, em ~150-200ms com easing suave.
- Na saída, o inverso (fade-out rápido).
- Respeitar `prefers-reduced-motion`: aparição instantânea sem transição.

**Definição de Pronto:**
- [ ] Modais entram com fade + scale sutil
- [ ] Saem com fade rápido
- [ ] Nada "salta" ou pisca de forma brusca
- [ ] Com `prefers-reduced-motion`, aparição instantânea

**Verificar:** No emulador, abra e feche vários modais (novo pedido, cotação, confirmações) e observe a suavidade.

**Ao concluir:** marque 2.3 ✅ no PROGRESS.md.

---

## TAREFA 2.4 — Loading state dentro dos botões

**Depende de:** Estágios 0 e 1
**Arquivos:** `js/ui.js`, `css/components.css`, e todos os pontos de escrita

**Fazer:**
- Criar um padrão reutilizável de botão em estado de carregamento: ao disparar uma ação assíncrona, o botão desabilita, mostra um spinner pequeno e/ou troca o texto para algo como "Salvando...", e volta ao normal ao terminar (sucesso ou erro).
- Aplicar em TODAS as ações de escrita: criar pedido, assumir, aprovar, reprovar, cancelar, executar compra, adicionar cotação, comentar, pagar parcela, salvar usuário/empresa/categoria.
- Isto se conecta com a proteção anti-duplo-envio da tarefa 1.9 — aqui é a camada visual dela.

**Definição de Pronto:**
- [ ] Todo botão de ação assíncrona mostra estado de carregamento enquanto processa
- [ ] O botão volta ao normal ao concluir, tanto em sucesso quanto em erro
- [ ] Combinado com 1.9, o duplo-clique continua bloqueado

**Verificar:** No emulador, dispare cada tipo de ação e observe o estado de loading do botão. Force um erro (ex: desconectar) e confirme que o botão se recupera.

**Ao concluir:** marque 2.4 ✅ no PROGRESS.md.

---

## TAREFA 2.5 — ESC fecha modal, Enter confirma

**Depende de:** 2.3
**Arquivos:** `js/ui.js`

**Fazer:**
- Em todos os modais: pressionar `ESC` fecha o modal (equivalente a cancelar).
- Em modais com um campo/ação principal: pressionar `Enter` (quando não está num textarea) confirma a ação primária.
- Garantir que isso não conflite com formulários (Enter em textarea continua quebrando linha).
- O foco deve ir para o primeiro campo relevante ao abrir o modal.

**Definição de Pronto:**
- [ ] ESC fecha qualquer modal
- [ ] Enter confirma a ação primária (exceto dentro de textarea)
- [ ] Ao abrir, o foco vai para o primeiro campo
- [ ] Sem conflito com digitação em campos de texto

**Verificar:** No emulador, abra modais e teste ESC e Enter em cada um.

**Ao concluir:** marque 2.5 ✅ no PROGRESS.md.

---

## TAREFA 2.6 — Empty states com a personalidade do Praxis

**Depende de:** Estágios 0 e 1
**Arquivos:** `js/pedidos.js`, `js/pedido-detalhe.js`, `js/notificacoes.js`, `js/relatorios.js`, `css/components.css`

**Fazer:**
- Criar empty states desenhados (não telas vazias) para cada lugar que pode ficar sem conteúdo:
  - Kanban/lista sem pedidos (ou sem resultado de filtro/busca)
  - Pedido sem cotações ainda
  - Pedido sem comentários ainda
  - Sino sem notificações
  - Dashboard sem dados (raro, mas tratar)
- Cada empty state tem: um ícone/ilustração SVG sutil com a estética do Praxis (pode usar o delta/triângulo da marca), uma micro-cópia com personalidade e em PT ("Nenhum pedido por aqui ainda. Que tal abrir o primeiro?"), e quando fizer sentido, um botão de ação (ex: "Novo pedido").
- **Diferenciar** "primeiro uso / vazio" de "nenhum resultado de busca" — as mensagens devem ser diferentes (um convida a criar, o outro sugere ajustar o filtro).

**Definição de Pronto:**
- [ ] Cada lista/seção tem um empty state desenhado, não uma tela em branco
- [ ] Empty state de "vazio" é diferente do de "sem resultado de busca"
- [ ] Micro-cópia em PT, com personalidade, sem ser informal demais para B2B
- [ ] Onde aplicável, há botão de ação no empty state
- [ ] Usa SVG (zero emoji)

**Verificar:** No emulador, force cada caso (filtrar por algo inexistente, abrir pedido sem cotações, etc.) e confirme o empty state.

**Ao concluir:** marque 2.6 ✅ no PROGRESS.md.

---

## TAREFA 2.7 — SLA visual (badge de prazo)

**Depende de:** Estágios 0 e 1
**Arquivos:** `js/pedidos.js`, `js/pedido-detalhe.js`, `js/utils.js`, `css/components.css`

**Fazer:**
- Criar em `utils.js` uma função que, dada a data necessária (prazo) de um pedido, retorna o status de prazo: no prazo, próximo do vencimento (ex: ≤3 dias), ou atrasado.
- Exibir um badge visual nos cards do kanban e no detalhe do pedido indicando esse status, com cor coerente com o design (verde/âmbar/vermelho dessaturados, não neon): ex "Faltam 3 dias", "Vence hoje", "Atrasado 2 dias".
- Aplicar apenas a pedidos em estados ativos (não em terminais como Pago/Reprovado/Cancelado).
- Este é um diferencial de valor de negócio — deixa claro na demo que o sistema ajuda a não perder prazos.

**Definição de Pronto:**
- [ ] Cards e detalhe mostram badge de prazo nos pedidos ativos
- [ ] As três faixas (no prazo / próximo / atrasado) têm cores distintas e coerentes com o tema
- [ ] O texto é claro em PT ("Faltam X dias", "Atrasado X dias")
- [ ] Pedidos em estados terminais não mostram o badge
- [ ] Cores funcionam bem em dark e light

**Verificar:** No emulador (o seed tem datas relativas, então haverá pedidos em várias faixas), confirme os badges no kanban e no detalhe, em dark e light.

**Ao concluir:** marque 2.7 ✅ no PROGRESS.md.

---

## TAREFA 2.8 — Banner de modo demo

**Depende de:** Estágios 0 e 1
**Arquivos:** `js/app.js`, `js/ui.js`, `css/components.css`

**Fazer:**
- Quando a sessão for a conta demo, exibir um banner discreto e elegante (faixa fina no topo ou rodapé, dentro da estética do Praxis) com texto tipo: "Modo demonstração — dados fictícios. Explore à vontade." em PT, e a versão EN quando o demo estiver em inglês.
- O banner não deve atrapalhar a navegação nem cobrir conteúdo importante. Pode ter um botão de fechar (X) que o oculta na sessão.
- Não aparece para usuários reais (não-demo).

**Definição de Pronto:**
- [ ] Banner de demo aparece só na conta demo
- [ ] Texto em PT e EN conforme o idioma do demo
- [ ] Visual coerente com o design, discreto
- [ ] Pode ser fechado e não atrapalha a navegação
- [ ] Não aparece para usuários reais

**Verificar:** No emulador, entre como demo (PT e EN) e confirme o banner; entre como usuário real e confirme a ausência.

**Ao concluir:** marque 2.8 ✅ no PROGRESS.md.

---

## TAREFA 2.9 — Notificações em tempo real

**Depende de:** Estágios 0 e 1
**Arquivos:** `js/notificacoes.js`, `js/app.js`

**Fazer:**
- Substituir o carregamento estático de notificações por um listener `onSnapshot` na coleção de notificações do usuário logado: quando uma nova notificação é criada (ex: por uma Cloud Function de gatilho), o badge do sino atualiza sozinho, sem reload.
- O dropdown, se aberto, reflete a nova notificação em tempo real.
- **Crítico (tarefa 2.13 / item 63):** guardar a função de unsubscribe e desligá-la no logout e ao destruir a view, para não vazar listeners.

**Definição de Pronto:**
- [ ] Nova notificação faz o badge atualizar sozinho, sem reload
- [ ] O dropdown aberto reflete a mudança em tempo real
- [ ] O listener é desligado no logout (sem vazamento)
- [ ] Marcar como lida atualiza o badge em tempo real

**Verificar:** No emulador, com o app aberto, dispare uma ação que gere notificação (em outra aba, mova um pedido de status) e confirme que o badge atualiza sozinho na primeira aba. Faça logout e confirme (via console/UI do emulador) que o listener parou.

**Ao concluir:** marque 2.9 ✅ no PROGRESS.md.

---

## TAREFA 2.10 — prefers-reduced-motion

**Depende de:** 2.1, 2.2, 2.3
**Arquivos:** `css/base.css`, `js/utils.js`

**Fazer:**
- Adicionar suporte global a `@media (prefers-reduced-motion: reduce)`: desativar/reduzir animações não-essenciais (count-up, shimmer do skeleton, transições de modal, hover translateY dos cards, twinkle se houver).
- Criar um helper JS (ex: `prefereMenosMovimento()`) que lê `window.matchMedia('(prefers-reduced-motion: reduce)')` para as animações controladas por JS (como o count-up) saberem se devem rodar.

**Definição de Pronto:**
- [ ] Com `prefers-reduced-motion: reduce`, as animações cosméticas não rodam
- [ ] As animações controladas por JS respeitam a preferência
- [ ] A interface continua 100% funcional sem as animações

**Verificar:** No navegador, ative a preferência de movimento reduzido (DevTools → Rendering → Emulate CSS prefers-reduced-motion) e percorra o app confirmando que as animações cessam.

**Ao concluir:** marque 2.10 ✅ no PROGRESS.md.

---

## TAREFA 2.11 — Foco visível e navegação por teclado

**Depende de:** Estágios 0 e 1
**Arquivos:** `css/base.css`, `css/components.css`, e marcação nos JS

**Fazer:**
- Garantir um estilo de `:focus-visible` claro e bonito (anel/contorno dourado sutil) em todos os elementos interativos: botões, links, campos, itens de lista clicáveis, cards clicáveis.
- Garantir que dá para navegar o app inteiro só com Tab/Shift+Tab/Enter/Espaço: a ordem de foco é lógica, nada fica inacessível, e elementos clicáveis que não são `<button>`/`<a>` recebem `tabindex` e tratam Enter/Espaço.
- Em modais, o foco fica "preso" dentro do modal enquanto aberto (focus trap) e volta ao gatilho ao fechar.

**Definição de Pronto:**
- [ ] Todos os interativos têm foco visível claro
- [ ] Dá para usar o app inteiro só com teclado
- [ ] A ordem de tabulação é lógica
- [ ] Modais prendem o foco e o devolvem ao fechar

**Verificar:** No emulador, navegue por uma tela inteira e por um modal usando só o teclado, confirmando foco visível e ausência de armadilhas.

**Ao concluir:** marque 2.11 ✅ no PROGRESS.md.

---

## TAREFA 2.12 — ARIA labels nos elementos só-ícone

**Depende de:** 2.11
**Arquivos:** todos os JS que renderizam botões só-ícone

**Fazer:**
- Adicionar `aria-label` descritivo em PT a todo botão que é só ícone (sino de notificações, engrenagem de config, toggle de tema, avatar, ações de ícone nos cards e no detalhe, botão de fechar modal).
- Garantir que ícones decorativos tenham `aria-hidden="true"` e que os SVGs informativos tenham rótulo acessível.
- Estados como o badge do sino devem ser anunciáveis (ex: `aria-label="Notificações, 3 não lidas"`).

**Definição de Pronto:**
- [ ] Todo botão só-ícone tem `aria-label` em PT
- [ ] Ícones decorativos têm `aria-hidden`
- [ ] O badge de notificações comunica a contagem via aria

**Verificar:** Inspecione os botões só-ícone no DevTools confirmando os `aria-label`. Se possível, passe um leitor de tela ou a árvore de acessibilidade do DevTools.

**Ao concluir:** marque 2.12 ✅ no PROGRESS.md.

---

## TAREFA 2.13 — Cleanup de listeners onSnapshot

**Depende de:** 2.9
**Arquivos:** `js/pedidos.js`, `js/notificacoes.js`, `js/app.js`, e qualquer view com onSnapshot

**Fazer:**
- Auditar TODOS os usos de `onSnapshot` no projeto. Para cada um, garantir que a função de unsubscribe retornada é guardada e chamada quando a view é trocada ou no logout.
- Padronizar: cada módulo de view expõe uma forma de "limpar" seus listeners, e o roteador em `app.js` chama essa limpeza ao sair da view.
- Este é um bug silencioso clássico (item 63): listeners vazados degradam o app com o tempo e um avaliador técnico percebe.

**Definição de Pronto:**
- [ ] Todo `onSnapshot` tem seu unsubscribe guardado e chamado ao sair da view/logout
- [ ] Trocar de tela várias vezes não acumula listeners (confirmável pelos logs do emulador)
- [ ] Logout encerra todos os listeners ativos

**Verificar:** No emulador, navegue entrando e saindo de telas com listener várias vezes e observe (logs/Network do emulador) que não há acúmulo. Faça logout e confirme que tudo parou.

**Ao concluir:** marque 2.13 ✅ no PROGRESS.md.

---

## TAREFA 2.14 — Contraste WCAG AA

**Depende de:** Estágios 0 e 1
**Arquivos:** `css/tokens.css`, `css/themes.css`, e inline styles nos JS

**Fazer:**
- Revisar os pares de cor texto/fundo em dark e light contra o critério WCAG AA (4.5:1 para texto normal, 3:1 para texto grande).
- O ponto mais sensível (apontado na auditoria) é o `--text3` no light mode e textos secundários sobre cards translúcidos. Ajustar os tokens onde o contraste ficar abaixo do AA, sem destoar da identidade.
- Onde houver `style="color:var(--text3)"` inline em contexto de contraste fraco, trocar por um token com contraste adequado ou por classe dedicada.

**Definição de Pronto:**
- [ ] Texto normal atinge ≥4.5:1 em dark e light nos contextos principais
- [ ] Texto grande atinge ≥3:1
- [ ] O `--text3` no light foi ajustado onde necessário
- [ ] A identidade visual permanece coerente

**Verificar:** Use uma ferramenta de contraste (extensão ou o painel de acessibilidade do DevTools) nas telas principais, em dark e light, confirmando AA nos textos.

**Ao concluir:** marque 2.14 ✅ no PROGRESS.md.

---

## TAREFA 2.15 — Sanitização de inputs (XSS)

**Depende de:** Estágio 1 (1.6 tratou comentários; aqui generaliza)
**Arquivos:** `js/utils.js`, e todo ponto que renderiza texto do usuário

**Fazer:**
- Criar/centralizar em `utils.js` uma função de escape de HTML e usá-la em TODO ponto onde texto fornecido pelo usuário é inserido no DOM (comentários, descrições de pedido, nomes de fornecedor, motivos "Outros", nomes de usuário/empresa/categoria).
- Preferir `textContent` a `innerHTML` para conteúdo do usuário; quando `innerHTML` for inevitável, escapar antes.
- Confirmar que nenhuma entrada do usuário pode injetar HTML/script que execute ou quebre o layout.

**Definição de Pronto:**
- [ ] Todo texto do usuário é escapado/inserido com segurança
- [ ] Injetar `<script>`, `<img onerror=...>` etc. em qualquer campo não executa nada
- [ ] O layout não quebra com caracteres especiais (<, >, &, ", ')

**Verificar:** No emulador, tente injetar payloads de XSS em vários campos (comentário, descrição, nome de fornecedor, motivo "Outros") e confirme que aparecem como texto inofensivo.

**Ao concluir:** marque 2.15 ✅ no PROGRESS.md.

---

## TAREFA 2.16 — Validação robusta de formulários

**Depende de:** Estágios 0 e 1
**Arquivos:** `js/pedido-detalhe.js`, `js/pedidos.js`, `js/config-usuarios.js`, `js/config-cadastros.js`, `js/utils.js`

**Fazer:**
- Adicionar validação antes de qualquer escrita no Firestore: campos obrigatórios preenchidos, valores numéricos válidos e positivos onde aplicável (valor, quantidade), e-mail em formato válido, datas coerentes, etc.
- Mostrar mensagens de erro claras e em PT junto ao campo (ou via `prxToast`), sem enviar dados inválidos ao banco.
- Centralizar validadores comuns em `utils.js` para reuso.

**Definição de Pronto:**
- [ ] Formulários não enviam com campos obrigatórios vazios
- [ ] Valores inválidos (número negativo, e-mail malformado, data incoerente) são barrados com mensagem clara
- [ ] As mensagens são em PT e indicam o que corrigir
- [ ] Nenhum dado inválido chega ao Firestore

**Verificar:** No emulador, tente enviar cada formulário com dados inválidos e confirme as validações; depois envie válido e confirme sucesso.

**Ao concluir:** marque 2.16 ✅ no PROGRESS.md.

---

## TAREFA 2.17 — Meta tags e Open Graph

**Depende de:** nada (independente)
**Arquivos:** `index.html`

**Fazer:**
- Adicionar no `<head>`: `title` descritivo, `meta description`, `meta viewport` (confirmar), `theme-color`, e tags Open Graph (`og:title`, `og:description`, `og:image`, `og:type`, `og:url`) + Twitter Card, para que o link do Praxis gere um preview bonito ao ser compartilhado (LinkedIn, WhatsApp).
- Usar a logo/identidade do Praxis na `og:image` (pode referenciar um asset da pasta de logo).
- Garantir favicon referenciado corretamente.

**Definição de Pronto:**
- [ ] `<head>` tem title, description, theme-color e viewport corretos
- [ ] Tags Open Graph e Twitter Card presentes e preenchidas
- [ ] `og:image` aponta para um asset existente
- [ ] Favicon carrega sem 404

**Verificar:** Inspecione o `<head>` e confirme as tags. Se possível, use um validador de Open Graph (ou o preview do próprio LinkedIn/WhatsApp depois do deploy — isso é teste do desenvolvedor).

**Ao concluir:** marque 2.17 ✅ no PROGRESS.md.

---

## TAREFA 2.18 — Tap feedback universal

**Depende de:** Estágios 0 e 1
**Arquivos:** `css/components.css`, `css/base.css`

**Fazer:**
- Garantir que TODO elemento clicável tem feedback ao toque/clique: um `:active` com leve redução de escala (ex: `transform: scale(0.98)`) ou mudança de brilho, além do hover já existente.
- Aplicar a botões, cards clicáveis, itens de lista, ícones de ação, abas.
- Em mobile, garantir que o feedback aparece no toque (sem depender de hover).
- Respeitar `prefers-reduced-motion` (sem o scale, manter ao menos o feedback de cor).

**Definição de Pronto:**
- [ ] Todo clicável responde visualmente ao `:active`
- [ ] Funciona em mobile (toque), não só no hover de desktop
- [ ] Coerente e sutil, sem exageros
- [ ] Respeita movimento reduzido

**Verificar:** No emulador, clique/toque em vários elementos (incluindo no modo responsivo mobile) e confirme o feedback imediato.

**Ao concluir:** marque 2.18 ✅ no PROGRESS.md.

---

## TAREFA 2.19 — Tooltips informativos nos ícones

**Depende de:** 2.12
**Arquivos:** `js/ui.js`, `css/components.css`, JS que renderizam ícones

**Fazer:**
- Adicionar tooltips no hover (e foco) dos botões só-ícone, mostrando o que cada um faz (sino → "Notificações", engrenagem → "Configurações", tema → "Alternar tema", ações nos cards, etc.).
- O tooltip deve ser leve, com a estética do Praxis, aparecer com um pequeno atraso, e funcionar também por teclado (ao focar o elemento) para acessibilidade.
- Não usar o `title` nativo do navegador (feio e lento) — fazer um tooltip estilizado próprio. Pode reaproveitar o `aria-label` como fonte do texto.

**Definição de Pronto:**
- [ ] Botões só-ícone mostram tooltip estilizado no hover
- [ ] Tooltip também aparece ao focar por teclado
- [ ] Visual coerente com o design, com atraso adequado
- [ ] Não usa o title nativo

**Verificar:** No emulador, passe o mouse e tabule pelos ícones confirmando os tooltips.

**Ao concluir:** marque 2.19 ✅ no PROGRESS.md.

---

## TAREFA 2.20 — Refino do login (blur) e profundidade por camadas

**Depende de:** Estágios 0 e 1
**Arquivos:** `css/views.css`, `css/themes.css`, `css/tokens.css`

**Fazer:**
- **Blur do login (item 64):** reduzir o `backdrop-filter: blur(16px)` do card de login para algo como `blur(8px)`, de modo que as estrelas apareçam suavemente atrás sem borrão agressivo. Validar visualmente que o efeito ficou elegante, não pesado. O glassmorphism pontual no login é aceitável (é o único uso recomendado), mas leve.
- **Profundidade por camadas (item 65):** auditar as telas para garantir que a hierarquia visual vem das camadas de tom (`--bg` < `--card` < `--card2` < `--card3`) e não de bordas pesadas. Onde houver borda forte fazendo o trabalho que o tom deveria fazer, suavizar a borda e usar a diferença de tom. Isto é o que mantém o Praxis com aparência premium e não "template de IA".

**Definição de Pronto:**
- [ ] Blur do login reduzido; estrelas visíveis atrás do card de forma elegante
- [ ] Hierarquia de superfícies vem do tom, não de bordas pesadas
- [ ] A aparência continua coerente e premium em dark e light

**Verificar:** No emulador, observe o login e as telas internas em dark e light, confirmando profundidade por tom e o blur suave.

**Ao concluir:** marque 2.20 ✅ no PROGRESS.md.

---

## TAREFA 2.21 — Glow colorido padronizado nos cards do dashboard

**Depende de:** Estágio 0 (0.5 já mexeu em relatorios.js)
**Arquivos:** `css/components.css`, `js/relatorios.js`

**Fazer:**
- Confirmar/criar as classes de glow colorido em `components.css`: `.card-glow-gold`, `.card-glow-green`, `.card-glow-red`, `.card-glow-blue`, cada uma com o `::before` de radial-gradient na cor correspondente, dessaturada e sutil (coerente com a estética).
- Aplicar consistentemente nos cards do dashboard: Total gasto → gold, Total de pedidos → green, Ag. aprovação → red, Parcelas a vencer → gold. Trocar qualquer gradient inline por classe.
- (Este item estava na auditoria como M1; aqui ele é finalizado junto do polimento visual.)

**Definição de Pronto:**
- [ ] As 4 classes de glow existem e são sutis/coerentes
- [ ] Cada card do dashboard usa a classe correta (sem gradient inline)
- [ ] Funciona em dark e light

**Verificar:** No emulador, abra o dashboard em dark e light e confirme os glows coloridos sob cada card.

**Ao concluir:** marque 2.21 ✅ no PROGRESS.md.

---

## TAREFA 2.22 — Assets de logo e favicon

**Depende de:** nada (independente; complementa 2.17)
**Arquivos:** `assets/logo/` (criar arquivos), `index.html`

**Fazer:**
- Verificar se a pasta `assets/logo/` contém os arquivos referenciados pelo `index.html` e pelo spec. Se faltarem, criar:
  - `praxis-icon.svg` — o ícone delta/triângulo dourado (▲) sobre fundo escuro, vetorial limpo
  - `praxis-logo.svg` — o wordmark PR▲XIS em JetBrains Mono com o A substituído pelo delta
  - `praxis-icon-192.png` e `praxis-icon-512.png` — gerados a partir do SVG (necessários também para o PWA do Estágio 4)
  - `praxis-favicon.ico` (ou favicon PNG) — referenciado no `<head>`
- Garantir que o `index.html` referencia o favicon e que ele carrega sem 404.
- Os SVGs devem usar as cores do design system (`#C8A96E` sobre `#060606`) e ser simples e nítidos em tamanhos pequenos.

**Definição de Pronto:**
- [ ] Todos os arquivos de logo/ícone existem em `assets/logo/`
- [ ] Favicon carrega sem 404 (visível na aba do navegador)
- [ ] O ícone é legível e nítido em 16px e em 512px
- [ ] Cores coerentes com o design system

**Verificar:** No emulador, confirme o favicon na aba do navegador e abra cada asset diretamente pela URL confirmando que carregam.

**Ao concluir:** marque 2.22 ✅ no PROGRESS.md.

---

## TAREFA 2.23 — Confirmação universal de ações destrutivas

**Depende de:** Estágios 0 e 1
**Arquivos:** todos os JS com ações destrutivas

**Fazer:**
- Auditar TODAS as ações destrutivas ou de grande consequência do sistema e garantir que cada uma pede confirmação clara via `prxConfirm` antes de executar: cancelar pedido, reprovar pedido, liberar claim, remover/desativar usuário, remover empresa, remover categoria, remover fornecedor, remover cotação (se existir), e qualquer exclusão.
- A mensagem de confirmação deve ser específica ("Cancelar o pedido #0042? Esta ação não pode ser desfeita.") e não genérica ("Tem certeza?").
- Ações que já exigem motivo (reprovar/cancelar) contam como confirmadas pelo próprio modal de motivo — não duplicar confirmação nesses casos.

**Definição de Pronto:**
- [ ] Toda ação destrutiva pede confirmação antes de executar
- [ ] Mensagens específicas, citando o que será afetado
- [ ] Nenhuma exclusão acontece com um clique único
- [ ] Sem confirmação dupla onde o modal de motivo já cumpre o papel

**Verificar:** No emulador, percorra cada ação destrutiva do sistema e confirme o `prxConfirm` específico em cada uma.

**Ao concluir:** marque 2.23 ✅ no PROGRESS.md.

---

## SMOKE TEST DO ESTÁGIO 2 (rodar antes de fechar o estágio)

Inclui regressão dos Estágios 0 e 1. Todos no emulador, todos devem passar:

**Regressão (Estágios 0 e 1):**
1. [ ] Fluxo completo de pedido ainda funciona ponta a ponta
2. [ ] Reprovação, cancelamento, liberar claim ainda funcionam
3. [ ] Aprovador sem dados financeiros; permissões corretas
4. [ ] Estados de erro (404, inexistente, sem-permissão) amigáveis

**Novos do Estágio 2:**
5. [ ] Count-up anima os números do dashboard
6. [ ] Skeleton aparece durante carregamento das telas
7. [ ] Modais entram com animação suave; ESC fecha, Enter confirma
8. [ ] Botões mostram loading durante ações; duplo-clique segue bloqueado
9. [ ] Empty states desenhados em todas as listas vazias (e diferentes para busca sem resultado)
10. [ ] Badges de SLA/prazo nos pedidos ativos, cores corretas em dark/light
11. [ ] Banner de demo aparece só no demo (PT/EN)
12. [ ] Notificações atualizam em tempo real; listeners encerram no logout
13. [ ] `prefers-reduced-motion` desliga as animações cosméticas
14. [ ] App inteiro navegável por teclado, com foco visível e tooltips nos ícones
15. [ ] Contraste AA em dark e light nas telas principais
16. [ ] XSS neutralizado em todos os campos de texto; formulários validam
17. [ ] Meta tags/OG no head; favicon sem 404
18. [ ] Tap feedback em todos os clicáveis; blur do login suave; glow dos cards coerente
19. [ ] Assets de logo existem; favicon na aba sem 404
20. [ ] Toda ação destrutiva pede confirmação específica antes de executar

---

## FIM DO ESTÁGIO 2 — RITUAL DE ENCERRAMENTO

Quando todas as tarefas estiverem ✅ e o smoke test passar:

1. Marque o Estágio 2 inteiro como ✅ no PROGRESS.md.
2. Apresente ao desenvolvedor um resumo do que foi feito.
3. **Ensine os testes manuais que só ele pode fazer.** Para o Estágio 2:
   - **Preview de Open Graph real:** só dá para confirmar de verdade colando o link publicado no LinkedIn/WhatsApp após o deploy. Ensine como fazer.
   - **Olhar estético final:** peça que ele revise no monitor dele o blur do login, os glows, os badges de SLA e os empty states, em dark e light, para aprovar a "sensação" geral — isso é julgamento humano.
   - **Teste em celular físico:** o tap feedback e a responsividade devem ser sentidos num aparelho real, não só no modo responsivo do navegador.
4. Avise que o Estágio 2 está concluído e que você está pronto para receber o **documento do Estágio 3**.
5. **PARE e aguarde** o desenvolvedor adicionar `_build/estagio-3.md` e pedir para você lê-lo.

---
*Fim do Estágio 2.*
