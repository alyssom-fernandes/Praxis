# Praxis — Perfis e Permissões

## Perfis

| Perfil | Descrição |
|---|---|
| **Supremo** | Acesso total. Configura o sistema, gerencia todos os usuários e empresas. |
| **Gestor** | Visão completa e relatórios financeiros consolidados. Aprova pedidos. Cancela pedidos em qualquer etapa até Comprado. Libera claim travado. |
| **Aprovador** | Aprova pedidos das empresas a que tem acesso. Vê cotações e histórico. **Não acessa relatórios financeiros consolidados.** |
| **Comprador** | Assume pedidos (claim), anexa cotações, executa compras. |
| **Financeiro** | Visualiza pagamentos, parcelas e vencimentos. Confirma pagamentos e anexa comprovantes. Não aprova pedidos nem altera campos comerciais. |
| **Solicitante** | Abre pedidos e acompanha status. Pode cancelar pedido próprio apenas em "Solicitado". |

## Matriz de permissões

| Ação | Supremo | Gestor | Aprovador | Comprador | Financeiro | Solicitante |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Criar pedido | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver todos os pedidos da empresa | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ só os seus |
| Assumir pedido (claim) | ✅ | ✅ | — | ✅ | — | — |
| Liberar claim (reatribuir) | ✅ | ✅ | — | — | — | — |
| Anexar cotações | ✅ | ✅ | — | ✅ | — | — |
| Indicar cotação preferida | ✅ | ✅ | — | ✅ | — | — |
| Aprovar pedido (menos o próprio) | ✅ | ✅ | ✅ | — | — | — |
| Reprovar pedido (menos o próprio) | ✅ | ✅ | ✅ | — | — | — |
| Executar compra | ✅ | ✅ | — | ✅ | — | — |
| Confirmar entrega | ✅ | ✅ | — | ⚠️ só o responsável | — | ✅ |
| Registrar parcela / comprovante | ✅ | ✅ | — | — | ✅ | — |
| Cancelar pedido (até Comprado) | ✅ | ✅ | — | — | — | — |
| Cancelar pedido próprio em Solicitado | ✅ | ✅ | — | — | — | ✅ |
| Cancelamento em massa (bulk) | ✅ | ✅ | — | — | — | ⚠️ só os seus |
| Reabrir pedido reprovado | ✅ | ✅ | — | — | — | ✅ |
| Comentar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Adicionar/remover anexo próprio | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Remover anexo de outro usuário | ✅ | ✅ | — | — | — | — |
| Exportar selecionados (CSV) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver relatórios financeiros | ✅ | ✅ | — | — | ✅ | — |
| Gerenciar usuários | ✅ | ✅ | — | — | — | — |
| Gerenciar empresas | ✅ | ✅ | — | — | — | — |
| Gerenciar categorias | ✅ | ✅ | — | — | — | — |

## Onde as permissões são aplicadas

1. **Cliente** (`js/`) — botões e telas são renderizados condicionalmente pelo perfil da sessão (ex.: Solicitante não vê "Aprovar"; Aprovador entra em Relatórios mas sem os cards financeiros).
2. **Roteamento** (`app.js`) — telas bloqueadas por perfil redirecionam para `?tela=pedidos`.
3. **Regras do Firestore** (`firestore.rules`) — validação no servidor via Custom Claims (`perfil`, `empresas[]`):
   - conta sem perfil (criada fora do app) não lê nem grava nada;
   - pedidos: cada um só é lido por quem tem a empresa dele (ou pelo solicitante, nos próprios); listar exige filtrar pelas empresas do usuário, e só o supremo lista sem filtro;
   - cada passo do fluxo tem dono e campos próprios, como na tabela de [`fluxo-pedidos.md`](fluxo-pedidos.md): só quem aprova aprova (assinando com o próprio ID), e nunca o próprio pedido (o supremo pode); só o comprador do pedido registra a compra e confirma o recebimento (além de quem pediu); só o financeiro confirma o pagamento, e cada passo só muda os campos dele;
   - a marca `isDemo` nasce com o pedido e não muda: ninguém transforma um pedido real em pedido da demo;
   - cotações e parcelas: escrita pelo perfil certo e só em pedidos da empresa (cotações, só pelo comprador que assumiu o pedido ou por um gestor); comentários, histórico e anexos assinados por quem escreve; editar um comentário muda só o texto, e editar ou apagar vale só dentro da empresa do pedido;
   - usuários: ninguém muda o próprio perfil nem as próprias empresas (só o último acesso); o gestor só lê quem tem alguma empresa em comum com ele, só edita quem está inteiro dentro das empresas dele, não cria nem promove ninguém a supremo e só dá acesso às empresas que ele tem; empresas, só as dele;
   - conta demo: perfil próprio, `demo`, que só lê e grava o que é da demonstração (documentos com `isDemo == true`, pedidos com ID `demo-…` e as subcoleções deles, os avisos das pessoas da demo e o contador `_meta/contadoresDemo`);
   - notificações: cada usuário só lê as próprias; pelo app, só se cria o aviso de @menção, assinado por quem mencionou (os automáticos vêm das Cloud Functions);
   - datas fora do formato `aaaa-mm-dd` são recusadas para todos, inclusive a conta demo.
4. **Regras do Storage** (`storage.rules`) — arquivos só para quem tem perfil; cotação pelo comprador, comprovante pelo financeiro; anexo assinado com o UID de quem enviou, que só ele ou um gestor apaga; a conta demo só mexe em arquivos de pedidos com ID `demo-…`. Limitação conhecida: o Storage não confere a empresa do pedido (isso exigiria ler o Firestore a cada arquivo).
5. **Testes** (`tests/regras.test.mjs`) — cada perfil tenta o que pode e o que não pode, no emulador (`npm run testar-regras`), a cada envio ao GitHub.
6. **Cloud Functions** — `setUserClaims` mantém os claims sincronizados com `/usuarios/{id}`; alterações de perfil/empresas têm efeito no próximo refresh do token. A demo pública não tem Cloud Functions: a conta demo recebe o perfil `demo` pelo e-mail (`eDemo()` nas regras), e os claims gravados no token dela não valem. `triggerDemoSeed` (plano pago) só atende a conta demo ou um supremo, uma vez por dia.

## Relatórios por perfil

| Perfil | O que vê no dashboard |
|---|---|
| Supremo / Gestor | Tudo: total gasto, parcelas, gasto por empresa, status, export Excel/PDF |
| Financeiro | Tudo (foco em parcelas e vencimentos) |
| Aprovador | Apenas operacional: total de pedidos, ag. aprovação, status — **sem valores financeiros nem export** |
| Comprador / Solicitante | Sem acesso à tela de relatórios |
