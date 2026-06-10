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
| Aprovar pedido | ✅ | ✅ | ✅ | — | — | — |
| Reprovar pedido | ✅ | ✅ | ✅ | — | — | — |
| Executar compra | ✅ | ✅ | — | ✅ | — | — |
| Confirmar entrega | ✅ | ✅ | — | ✅ | — | ✅ |
| Registrar parcela / comprovante | ✅ | ✅ | — | — | ✅ | — |
| Cancelar pedido (até Comprado) | ✅ | ✅ | — | — | — | — |
| Cancelar pedido próprio em Solicitado | ✅ | ✅ | — | — | — | ✅ |
| Comentar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver relatórios financeiros | ✅ | ✅ | — | — | ✅ | — |
| Gerenciar usuários | ✅ | ✅ | — | — | — | — |
| Gerenciar empresas | ✅ | ✅ | — | — | — | — |
| Gerenciar categorias | ✅ | ✅ | — | — | — | — |

## Onde as permissões são aplicadas

1. **Cliente** (`js/`) — botões e telas são renderizados condicionalmente pelo perfil da sessão (ex.: Solicitante não vê "Aprovar"; Aprovador entra em Relatórios mas sem os cards financeiros).
2. **Roteamento** (`app.js`) — telas bloqueadas por perfil redirecionam para `?tela=pedidos`.
3. **Firestore Rules** — validação server-side via Custom Claims (`perfil`, `empresas[]`):
   - usuário só lê/escreve pedidos das empresas em que está vinculado;
   - cotações: escrita só por compradores/gestores/supremo;
   - parcelas: escrita só por financeiro/gestor/supremo;
   - notificações: cada usuário só acessa as próprias.
4. **Cloud Functions** — `setUserClaims` mantém os claims sincronizados com `/usuarios/{id}`; alterações de perfil/empresas têm efeito no próximo refresh do token.

## Relatórios por perfil

| Perfil | O que vê no dashboard |
|---|---|
| Supremo / Gestor | Tudo: total gasto, parcelas, gasto por empresa, status, export Excel/PDF |
| Financeiro | Tudo (foco em parcelas e vencimentos) |
| Aprovador | Apenas operacional: total de pedidos, ag. aprovação, status — **sem valores financeiros nem export** |
| Comprador / Solicitante | Sem acesso à tela de relatórios |
