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
```

## Regras de transição

| De | Para | Quem pode | Observações |
|---|---|---|---|
| Solicitado | Ag. cotação | Comprador, Gestor, Supremo | Claim via `runTransaction` — o primeiro vence |
| Ag. cotação | Em aprovação | Comprador, Gestor, Supremo | Requer ≥1 cotação e 1 indicada |
| Em aprovação | Aprovado | Aprovador, Gestor, Supremo | `runTransaction` — primeiro a aprovar vence |
| Em aprovação | Reprovado | Aprovador, Gestor, Supremo | Motivo obrigatório (lista + "Outros" com texto) |
| Aprovado | Comprado | Comprador, Gestor, Supremo | Fornecedor (autocomplete), valor final, condição, data da compra, parcelas |
| Comprado | Entregue | Comprador, Solicitante, Gestor, Supremo | Data de entrega real |
| Entregue | Pago | Financeiro, Gestor, Supremo | Após a última parcela ser confirmada |
| Qualquer (até Comprado) | Cancelado | Gestor/Supremo; Solicitante só em Solicitado | Motivo obrigatório |

## Concorrência

Duas operações usam `runTransaction` obrigatoriamente:

1. **Claim do comprador** — a transação relê `compradorId`; se já estiver preenchido, lança erro tratado como *"Este pedido já foi assumido por outro usuário."*
2. **Aprovação** — a transação relê `status`; se não estiver mais `em_aprovacao`, lança erro tratado como *"Este pedido já foi aprovado por outro usuário."* Os demais aprovadores recebem notificação de que o pedido já foi processado.

## SLA de claim

- Pedido comum sem comprador há **48h** → notifica gestores (function `checkClaimTimeout`, roda a cada hora).
- Pedido **urgente** sem comprador há **4h** → idem.
- Gestor/Supremo podem usar **"Liberar pedido"** no detalhe para remover o claim e devolver o pedido à fila.

## Motivos estruturados

**Reprovação:** Valor acima do orçamento · Cotações insuficientes · Justificativa inadequada · Fornecedor não aprovado · Outros (texto livre)

**Cancelamento:** Compra não necessária · Fornecedor indisponível · Erro no pedido · Pedido duplicado · Outros (texto livre)

Cada transição grava uma entrada em `/pedidos/{id}/historico` com status, autor e nota.
