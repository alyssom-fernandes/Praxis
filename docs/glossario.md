# Glossário

Um nome para cada coisa, igual em todas as telas, no PDF, nos relatórios e nos e-mails. Os textos ficam em `js/constants.js` (português e inglês) e em `js/textos-relatorios.js`; o teste `tests/textos.test.mjs` confere que toda chave existe nos dois idiomas e que nenhum texto de tela fica fora do dicionário.

## Conceitos

| Termo | Em inglês | O que é | Não usar |
|---|---|---|---|
| Pedido | Order | O pedido de compra, do momento em que é criado até o pagamento | Requisição, ticket, chamado |
| Etapa | Stage | Onde o pedido está no fluxo (as sete abaixo, mais Reprovado e Cancelado) | Status, situação, fase |
| Criar pedido | Create order | A ação do botão do formulário "Novo pedido". Depois de criado, o pedido foi "aberto por" quem o criou | Abrir pedido (no botão), enviar |
| Cotação | Quote | Uma proposta de fornecedor registrada pelo comprador, com valor, prazo e condições | Orçamento (no sentido de proposta) |
| Cotação indicada | Selected quote | A cotação que o comprador recomenda; indicar leva o pedido para "Em aprovação" | Cotação escolhida, vencedora |
| Fornecedor | Supplier | Quem vende; nasce no cadastro ou na primeira cotação | Vendedor |
| Parcela | Installment | Cada pagamento da compra, com vencimento e comprovante | Prestação |
| Centro de custo | Cost center | Código interno de quem paga a compra, opcional | |
| Urgente | Urgent | Marca do pedido que vai para o topo da coluna e avisa quem age | Prioritário |
| Minha fila | My queue | Os pedidos que esperam uma ação da pessoa que está usando | Pendências |
| Nota interna | Internal note | Comentário marcado "Só equipe de compras": quem tem o perfil solicitante não vê. Para preço, prazo e negociação | Comentário privado, nota secreta |
| Ajustes | Settings | Tema e preferências; na paleta, "Ir para Ajustes" | Configurações: Geral |
| Cadastros | Records | Empresas, categorias e fornecedores | |
| Administração | Administration | Grupo da barra lateral com os cadastros e os usuários, só para quem administra | Configurações |

## Etapas

Os nomes são os mesmos no quadro, na régua do detalhe, na régua do celular, na entrada, no PDF, nos relatórios e nos avisos. Numa coluna estreita, o nome é cortado na tela (reticências), sem trocar por uma abreviação.

| Nº | Etapa | Em inglês | Quem age |
|---|---|---|---|
| 01 | Solicitado | Requested | Comprador assume |
| 02 | Em cotação | Quoting | Comprador registra e indica a cotação |
| 03 | Em aprovação | Awaiting approval | Aprovador decide (quem abriu ou cotou não decide) |
| 04 | Aprovado | Approved | Comprador registra a compra |
| 05 | Comprado | Purchased | Comprador confirma a entrega |
| 06 | Entregue | Delivered | Financeiro registra o pagamento |
| 07 | Pago | Paid | Fim |
| — | Reprovado | Rejected | Fim, com motivo |
| — | Cancelado | Cancelled | Fim, com motivo |

## Perfis

| Perfil | Em inglês |
|---|---|
| Solicitante | Requester |
| Comprador | Buyer |
| Aprovador | Approver |
| Financeiro | Finance |
| Gestor | Manager |
| Supremo | Supreme |

## Como escrever

- **Botões** começam com verbo e dizem o objeto: "Criar pedido", "Registrar compra", "Aprovar". Nunca "OK" nem "Enviar".
- **Sucesso**: frase curta, sem "com sucesso": "Pedido criado.", "Pedido aprovado."
- **Erro**: o que houve e o que fazer, sem mensagem técnica: "O pedido não foi aprovado. Verifique a conexão e tente de novo." O detalhe técnico vai só para o console (`mensagemDeErro` em `js/utils.js`).
- **Sem instrução fixa na tela**: o resumo diz o estado ("34 pedidos, 4 urgentes, R$ 222,8 mil em aberto"); como ler a tela fica no tour e nos títulos (`title`).
- **Datas**: dd/mm/aaaa à vista; o relativo ("há 2 dias") só como complemento (`dataAbsoluta` e `dataComRelativo` em `js/utils.js`).
- **Rótulos de campo** são substantivos ("Observações"); o placeholder dá um exemplo, nunca faz o papel do rótulo.
