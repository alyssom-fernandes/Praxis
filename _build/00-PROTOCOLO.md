# Praxis — Protocolo de Execução
> **LEIA ESTE DOCUMENTO INTEIRO ANTES DE QUALQUER COISA, EM TODA SESSÃO.**
> Este é o "como trabalhar". As regras aqui valem para TODOS os estágios do projeto.
> Se em algum momento o que você for fazer contrariar este protocolo, o protocolo vence.

---

## O QUE É ESTE PROJETO

Você está finalizando o **Praxis**, um sistema web SPA de gestão de compras corporativas em HTML + CSS + Vanilla JS (ES Modules) + Firebase (Firestore, Auth, Cloud Functions). O projeto já existe e está parcialmente construído. Sua missão é deixá-lo 100% funcional, testado e polido, seguindo os documentos de estágio que serão entregues um por vez.

A fonte de verdade do produto é o arquivo `praxis-spec.md` (especificação completa) e `praxis-complemento.md` (decisões complementares). A lista de correções é `praxis-auditoria.md`. Você deve ter esses arquivos disponíveis; se não os encontrar no projeto, peça ao usuário antes de continuar.

---

## REGRA ZERO — GIT É PROIBIDO

**Você NUNCA executa nenhum comando git.** Nada de `git add`, `git commit`, `git push`, `git checkout`, `git merge`, `git rebase`, ou qualquer outro. Você apenas cria e edita arquivos no sistema de arquivos local. Todos os commits são feitos manualmente pelo desenvolvedor através do GitHub Desktop. Se você sentir vontade de "salvar o progresso" com git, **não o faça** — o desenvolvedor cuida disso. Violar esta regra faz o nome errado aparecer como contribuidor no repositório, o que é inaceitável.

---

## AS SETE LEIS DE EXECUÇÃO

Estas são as leis que impedem o projeto de virar "muita coisa pela metade". Siga-as religiosamente.

### Lei 1 — Fatias verticais, nunca camadas horizontais
Você implementa UMA funcionalidade completa de cada vez — da interface à lógica aos dados ao teste — antes de tocar na próxima. NUNCA faça "todo o CSS de todas as telas, depois todo o JS". Termine "criar pedido" inteiro e funcionando antes de começar "aprovar pedido". A qualquer momento, o que está marcado como feito deve estar 100% feito e funcionando.

### Lei 2 — Profundidade antes de largura
É proibido deixar uma tarefa "70% pronta para voltar depois". Ou a tarefa está completa e verificada, ou você ainda está nela. Não existe "depois eu termino". Um sistema com 10 funcionalidades sólidas vale infinitamente mais que um com 50 pela metade.

### Lei 3 — Código que não rodou não conta como feito
Toda funcionalidade deve ser executada de verdade no Firebase Emulator antes de ser declarada pronta. Escrever o código não é terminar. Ver o código funcionar é terminar. Se você não rodou, não está pronto.

### Lei 4 — Toda tarefa tem Definição de Pronto e você verifica item por item
Cada tarefa nos documentos de estágio traz um checklist de "Definição de Pronto" e um passo "Verificar". Você só marca a tarefa como concluída depois de cumprir CADA item do checklist e executar o passo de verificação. "Eu acho que está certo" não é verificação. "Eu rodei e vi os três casos funcionarem" é verificação.

### Lei 5 — Atualize o PROGRESS.md depois de cada tarefa
Existe um arquivo `_build/PROGRESS.md` no projeto. Depois de concluir e verificar cada tarefa, você atualiza esse arquivo imediatamente: marca a tarefa como ✅, anota a data, e escreve uma linha sobre o que foi feito e testado. Este arquivo é a sua memória entre sessões. Trate-o como sagrado.

### Lei 6 — Nunca termine uma sessão com uma tarefa pela metade
Quando perceber que a conversa está ficando longa ou o contexto está enchendo, NÃO comece uma tarefa nova. Termine a atual, verifique-a, atualize o PROGRESS.md, e então faça um resumo do estado. É sempre melhor parar num ponto limpo do que no meio de algo.

### Lei 7 — Não invente, não derive, não "melhore" sozinho
Implemente exatamente o que o documento de estágio pede — nada a mais, nada a menos. Não adicione funcionalidades não solicitadas. Não "melhore" partes que não foram pedidas. Se encontrar uma ambiguidade, releia o `praxis-spec.md`; se ainda assim estiver incerto, escolha a interpretação mais simples e coerente com o resto do sistema e anote sua decisão no PROGRESS.md. Funcionalidades extras não pedidas são a principal forma de um agente se perder e quebrar o que já funcionava.

---

## RITUAL DE INÍCIO DE SESSÃO (faça toda vez)

Sempre que começar a trabalhar — seja uma sessão nova ou a continuação — execute esta sequência antes de escrever qualquer código:

1. **Leia este protocolo** (`_build/00-PROTOCOLO.md`) inteiro.
2. **Leia o `_build/PROGRESS.md`** para saber exatamente o que já foi feito e testado.
3. **Leia o documento do estágio atual** por completo (ex: `_build/estagio-0.md`).
4. **Confirme que o ambiente está de pé**: o Firebase Emulator está rodando? Se não, suba-o (ver `_build/01-AMBIENTE.md`).
5. **Identifique a próxima tarefa não concluída** no documento do estágio.
6. **Confirme que as dependências dela estão prontas** (cada tarefa lista do que depende).
7. Só então **comece a tarefa**.

Nunca pule o ritual. Ele é o que garante que você nunca se perca, mesmo que o contexto tenha sido zerado entre sessões.

---

## RITUAL DE FIM DE TAREFA (faça a cada tarefa concluída)

1. Releia a Definição de Pronto da tarefa.
2. Execute o passo Verificar — de verdade, no emulador.
3. Confirme item por item que tudo passou.
4. Atualize o `_build/PROGRESS.md`: marque ✅, data, e uma linha do que foi feito.
5. Passe para a próxima tarefa (ou encerre, se o contexto estiver enchendo — Lei 6).

---

## RITUAL DE FIM DE ESTÁGIO (faça quando todas as tarefas do estágio estiverem ✅)

1. Execute o **Smoke Test** completo descrito no fim do documento do estágio. O smoke test garante que nada que funcionava antes quebrou.
2. Se algo no smoke test falhar, conserte antes de prosseguir — isso é regressão e tem prioridade máxima.
3. Atualize o `_build/PROGRESS.md` marcando o estágio inteiro como ✅.
4. Apresente ao desenvolvedor:
   - Um resumo claro de tudo que foi feito no estágio.
   - **Os testes manuais que SÓ ELE pode fazer** (e-mail real, funções agendadas, etc.), com o passo a passo ensinado de forma simples, como se ele nunca tivesse feito aquilo.
   - O aviso de que o estágio está concluído e você está pronto para receber o próximo documento de estágio.
5. **Pare e aguarde.** Não invente o próximo estágio de memória. O desenvolvedor vai adicionar o próximo documento à pasta `_build/` e pedir para você lê-lo. Você só prossegue quando ele entregar o próximo documento.

---

## PADRÕES TÉCNICOS OBRIGATÓRIOS (valem em todo o código)

Estes padrões já estão definidos no spec, mas ficam aqui reforçados porque você vai consultá-los o tempo todo:

- **Idioma do código:** português. Nomes de variáveis, funções, comentários e mensagens internas em PT, consistente com o que já existe (`sessao`, `renderPedidos`, etc.). Não traduza código existente para inglês.
- **Sem nativos de UI:** nunca use `alert()`, `confirm()` ou `prompt()`. Use sempre `prxAlert()`, `prxConfirm()`, `prxToast()` de `ui.js`.
- **Sem strings mágicas:** nunca compare status/perfil com strings literais. Sempre importe de `constants.js` (`STATUS.APROVADO`, `PERFIS.GESTOR`, etc.).
- **IDs sempre string:** nunca use `parseInt`, `+id` ou `Number(id)` em IDs do Firestore.
- **Datas internas em `YYYY-MM-DD`.**
- **Queries de pedidos sempre filtram por `empresaId`** quando o usuário não é supremo.
- **Apenas ES Modules** (`import`/`export`). O `index.html` carrega só `<script type="module" src="/js/app.js">`.
- **Zero emojis na interface** — somente ícones SVG inline.
- **Toda escrita assíncrona no Firestore** mostra spinner/loading e é protegida contra duplo-clique.
- **Todo erro** é capturado com try/catch e exibido via `prxToast(mensagem, 'error')` com mensagem amigável em PT.

---

## TRÊS PRINCÍPIOS DE PRODUTO (a filosofia do Praxis)

Estes princípios vêm da análise do que as pessoas amam e odeiam em ferramentas concorrentes. Use-os para guiar decisões de implementação dentro de cada tarefa:

1. **Máximo 2 cliques para qualquer ação comum.** O ódio universal a ferramentas como Jira vem de excesso de cliques e lentidão. Aprovar, comentar, ver um pedido — tudo deve ser alcançável em no máximo 2 cliques. Sempre que uma tarefa permitir reduzir cliques, reduza.

2. **A interface deve sempre responder ao toque.** Todo elemento clicável tem feedback visual imediato (estado `:active`, hover, mudança de cor). Nada que pareça "morto" ao clicar.

3. **A estética do Praxis é a profundidade sutil, não o enfeite.** A beleza vem das camadas de tom escuro, do glow suave saindo de baixo dos cards, das estrelas no fundo e da tipografia forte. NÃO adicione efeitos chamativos novos (parallax, neon, gradientes extras, animações exageradas) — isso puxaria o Praxis para a aparência genérica de template gerado por IA, exatamente o que queremos evitar. Refine os fundamentos; não empilhe efeitos.

---

## COMO LIDAR COM PROBLEMAS

- **Se uma tarefa falhar na verificação:** o problema está contido naquela tarefa. Conserte ali mesmo, não avance. Um bug local é fácil; não deixe virar sistêmico avançando por cima dele.
- **Se você encontrar um bug em algo que já estava marcado como ✅:** isso é regressão. Pare a tarefa atual, conserte a regressão, confirme que o smoke test passa, e só então retome.
- **Se algo no spec parecer contradizer um documento de estágio:** o documento de estágio é mais específico e vence para aquela tarefa. Mas anote a contradição no PROGRESS.md para o desenvolvedor saber.
- **Se você não tiver certeza de algo e o spec não resolver:** escolha o caminho mais simples, implemente, e anote a decisão no PROGRESS.md. Não trave o projeto por indecisão, mas deixe rastro.

---

## RESUMO EM UMA FRASE

Trabalhe uma fatia vertical por vez, rode tudo no emulador, verifique com checklist, registre no PROGRESS.md, nunca pare no meio, nunca use git, nunca invente — e ao fim de cada estágio, ensine o desenvolvedor a testar o que só ele pode testar e peça o próximo estágio.

---
*Fim do protocolo. Este documento é permanente e relido a cada sessão.*
