# Praxis — Fluxo de Pedidos

## Diagrama de estados

```
                    ┌─────────────┐
                    │  Solicitado │ ← estado inicial
                    └──────┬──────┘
                           │ Comprador faz claim (runTransaction)
                    ┌──────▼──────┐
                    │ Ag. cotação │
                    └──────┬──────┘
                           │ ≥1 cotação anexada e 1 indicada
                    ┌──────▼──────┐
                    │Em aprovação │
                    └──────┬──────┘
             ┌─────────────┴─────────────┐
             │ Aprovado                  │ Reprovado (+ motivo)
      ┌──────▼──────┐            ┌──────▼──────┐
      │   Aprovado  │            │  Reprovado  │ ← terminal
      └──────┬──────┘            └─────────────┘
             │ Comprador executa compra
      ┌──────▼──────┐
      │   Comprado  │  fornecedor, valor final, condição, dataCompra, parcelas
      └──────┬──────┘
             │ Comprador ou Solicitante confirma recebimento
      ┌──────▼──────┐
      │   Entregue  │
      └──────┬──────┘
             │ Financeiro confirma última parcela / pagamento único
      ┌──────▼──────┐
      │     Pago    │ ← terminal
      └─────────────┘

Cancelado (terminal) ← possível de Solicitado até Comprado, conforme perfil

           Reprovado ──(Reabrir)──► novo Solicitado
                       Solicitante/Gestor/Supremo podem reabrir
                       pedido reprovado com justificativa obrigatória;
                       o pedido original recebe reabertoPara, o novo
                       recebe reabertoDe — ambos exibem banner de vínculo.
```

## Regras de transição

| De | Para | Quem pode | Observações |
|---|---|---|---|
| Solicitado | Ag. cotação | Comprador, Gestor, Supremo | Claim via `runTransaction` — o primeiro vence |
| Ag. cotação | Em aprovação | Comprador que assumiu, Gestor, Supremo | Requer ≥1 cotação e 1 indicada: o pedido guarda a indicada em `cotacaoIndicadaId`, e as regras conferem que ela existe e saiu do lote marcada. A cotação "não tinha o produto" registra um lugar consultado, sem valor, e não pode ser indicada. Com uma cotação só com preço, o comprador diz por quê (`motivoCotacaoUnica`). Daí em diante as cotações não mudam |
| Em aprovação | Aprovado | Aprovador, Gestor, Supremo | `runTransaction` — primeiro a aprovar vence; quem abriu ou cotou o pedido não aprova. Com alçada na empresa (Administração › Alçadas), o pedido entra com o retrato da faixa do valor da cotação indicada e passa pelos níveis em ordem: cada voto conta no nível atual, o nível completo passa ao seguinte e o último aprova; cada pessoa vota uma vez por pedido |
| Em aprovação | Reprovado | Aprovador, Gestor, Supremo | Motivo obrigatório (lista + "Outros" com texto), conferido pelas regras; quem abriu ou cotou o pedido não reprova; com alçada, reprova quem está no nível atual |
| Aprovado | Comprado | Comprador, Gestor, Supremo | Fornecedor (autocomplete), valor final, condição (à vista, antecipado ou após o recebimento), data da compra, parcelas e, se houver, a nota fiscal (número ou chave de 44 dígitos; também pode ser informada depois); quem aprovou não registra a compra |
| Comprado | Entregue | Comprador que assumiu, Solicitante, Gestor, Supremo | Data de entrega real |
| Entregue | Pago | Financeiro, Gestor, Supremo | Após a última parcela ser confirmada; quem aprovou não registra parcelas, comprovantes nem a conclusão |
| Qualquer (até Comprado) | Cancelado | Gestor/Supremo; Solicitante só em Solicitado | Motivo obrigatório, conferido pelas regras |

O supremo segue estas mesmas transições, como um gestor de todas as empresas: não pula etapas e não abre pedido já adiantado. A separação de funções e a alçada não valem para ele: aprova em qualquer nível, de uma vez, e pode aprovar, comprar e pagar o mesmo pedido.

## Compra já feita

Para a compra que aconteceu antes de passar pelo Praxis (o gerente manda alguém pegar na loja, algo urgente ou já decidido), quem tem acesso à empresa lança depois, só para ficar rastreada: o que foi, onde, quanto, a data, a nota (se houver), quem pediu, quem autorizou e quem comprou ou retirou (pessoas do Praxis ou só o nome) e por que foi direto.

| O item já chegou? | Pagamento | O pedido nasce em |
|---|---|---|
| Sim | Já pago | Pago |
| Sim | A pagar (vencimento e parcelas) | Entregue (o financeiro paga as parcelas) |
| Não | A pagar | Comprado (depois Entregue e Pago) |
| Não | Já pago | Comprado; ao receber, vai direto a Pago |

Sem solicitação, cotação, aprovação nem alçada. A autorização fica confirmada quando quem lança é o gestor (ou o supremo) que autorizou; nos outros casos fica pendente até a pessoa apontada, ou um gestor da empresa que não lançou, confirmar ou marcar como não reconhecida (a compra continua registrada, com o selo). Tudo vai para o histórico. As compras já feitas ficam fora do tempo do processo nos relatórios, porque não passaram pelas etapas.

## Concorrência

Duas operações usam `runTransaction` obrigatoriamente:

1. **Claim do comprador** — a transação relê `compradorId`; se já estiver preenchido, lança erro tratado como *"Este pedido já foi assumido por outro usuário."*
2. **Aprovação** — a transação relê `status`; se não estiver mais `em_aprovacao`, lança erro tratado como *"Este pedido já foi aprovado por outro usuário."*

A liberação do claim pelo gestor também usa `runTransaction` (só devolve à fila um pedido que ainda está em cotação). Em toda mudança de status, a entrada do histórico vai na mesma transação ou no mesmo lote (`writeBatch`): se uma das duas gravações é recusada, nenhuma acontece.

## SLA de claim

- Pedido comum sem comprador há **48h** → avisa a gestão (function `checkClaimTimeout`, roda a cada hora; o aviso sai uma vez por pedido e prazo).
- Pedido **urgente** sem comprador há **4h** → idem.
- Gestor/Supremo podem usar **"Liberar pedido"** no detalhe para remover o claim e devolver o pedido à fila.

## Motivos estruturados

**Reprovação:** Valor acima do orçamento · Cotações insuficientes · Justificativa inadequada · Fornecedor não aprovado · Outros (texto livre)

**Cancelamento:** Compra não necessária · Fornecedor indisponível · Erro no pedido · Pedido duplicado · Outros (texto livre)

Cada transição grava uma entrada em `/pedidos/{id}/historico` com status, autor e nota.

## Ações em massa

Na visualização de lista, usuários com perfil Gestor, Supremo ou Solicitante podem selecionar múltiplos pedidos e:

- **Exportar CSV** — gera arquivo com número, título, empresa, status, valor e data; abre no Excel
- **Cancelar selecionados** — aplica apenas aos pedidos elegíveis (estados Solicitado/Ag.cotação/Em aprovação/Aprovado); Solicitante só pode cancelar os seus próprios; motivo obrigatório; cada cancelamento grava entrada no historico

## Reabertura de pedido reprovado

Solicitante, Gestor e Supremo podem reabrir um pedido em estado **Reprovado** (desde que não tenha sido reaberto antes). A reabertura:

1. Cria um novo pedido com os mesmos campos (título, empresa, categoria, valor, etc.) e status **Solicitado**
2. Grava `reabertoDe: pedidoOriginalId` no novo pedido
3. Grava `reabertoPara: novoPedidoId` no original (impede segunda reabertura)
4. Registra a justificativa no novo pedido (`justificativaReabertura`, exigida pelas regras) e no histórico dele
5. Exibe banners de vínculo em ambos os pedidos

O novo pedido recebe numeração sequencial própria (PRX-XXXX) e segue o fluxo normalmente.
