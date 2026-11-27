# Praxis — Equipamentos

O inventário dos aparelhos de cada unidade: o que é, onde está, quanto custou,
até quando vai a garantia, quantas vezes quebrou e quanto já se gastou com ele.
A pergunta que ele responde: **vale consertar de novo ou é hora de trocar?**

## Quem usa

| Papel em Equipamentos | O que faz |
|---|---|
| **Consulta** | Vê a lista, as fichas e o resumo por tipo e unidade. |
| **Responsável** | Cadastra, edita, move de lugar, manda para o conserto, registra a volta e os custos, faz a contagem. |
| **Gestor** | Tudo isso, mais: dá baixa e reativa, define o preço de um novo (a referência do aviso de troca) e cuida das unidades. |

Quem administra o Praxis (gestor de Compras ou supremo) define os **limites de
troca** de cada empresa. Quem usa Serviços também lê os aparelhos, para ligar o
chamado a um deles.

## A etiqueta

Cada aparelho ganha uma etiqueta com o prefixo do tipo e um número seguido:
`AC-0001` (ar-condicionado), `PC`, `NB` (notebook), `MON`, `IMP`, `CAM`, `RED`
(rede), `NBK` (nobreak), `CEL`, `TV`, `BMB` (bomba) e `EQ` (outro). O número sai
de um contador por prefixo, gravado no mesmo lote do aparelho (as regras
conferem que a etiqueta é a próxima).

**Etiquetas em PDF:** a lista gera uma folha A4 com 24 etiquetas (3 × 8, de
63,5 × 33,9 mm, o formato das folhas adesivas comuns) com o QR, a etiqueta, a
descrição e a unidade. O QR abre a ficha do aparelho no celular.

## A ficha

- **O que pede agora**, no alto: em uso, reserva, em conserto (com a oficina e
  desde quando), baixado, garantia acabando, ou o aviso de troca.
- **Consertos × preço de um novo:** uma barra com o que já se gastou contra o
  preço de um aparelho novo, e a linha do limite da empresa.
- **Consertos:** cada um com a data, o valor, quem fez e o chamado de origem.
- **Chamados de Serviços** ligados ao aparelho.
- **Dados:** marca e modelo, série, unidade e setor, compra (data, valor,
  fornecedor e o pedido de compra, com link), garantia, idade e observações.
- **Registro:** cada mudança, com quem e quando.

### O aviso de troca

O Praxis sugere avaliar a troca quando **os consertos somam uma parte do preço
de um novo** (padrão: 60%) **ou** quando o aparelho teve **mais consertos que o
limite em 12 meses** (padrão: 3). Cada empresa ajusta os dois números em
Equipamentos › Limites de troca. A ficha diz qual dos dois limites passou e
mostra as contas.

### O que mais pede atenção

A aba **Atenção** junta: aviso de troca, conserto parado há mais de 7 dias e
garantia que acaba em até 30 dias.

## Ligações com os outros módulos

- **Compras:** num pedido **entregue** ou **pago**, o menu do pedido tem
  "Cadastrar no inventário", que abre o cadastro já com a descrição, o valor, o
  fornecedor, a data e o número do pedido.
- **Serviços:** o chamado pode apontar um aparelho. Quando ele é **confirmado**,
  o custo (os extras aprovados) entra nos consertos do aparelho no mesmo lote,
  com o número do chamado.

## Contagem

Equipamentos › Contagem: escolha a unidade, ande por ela e marque o que
encontrar (tocando na lista, digitando a etiqueta ou, no Android, lendo o QR).
A contagem em andamento fica guardada no aparelho, para não perder nada se a
tela fechar. Ao concluir, o Praxis grava o que foi encontrado, o que faltou e o
que estava fora do lugar (cadastrado em outra unidade). As contagens anteriores
ficam embaixo, com quem fez e o que faltou. Uma contagem gravada não muda.

## Onde está no código

| Arquivo | O quê |
|---|---|
| `js/equipamentos.js` | Lista, abas, resumo por tipo e unidade, cadastro, etiquetas em PDF, limites |
| `js/equipamento.js` | Ficha: situação, medidor da troca, consertos, mover, conserto, baixa |
| `js/contagem.js` | Contagem por unidade |
| `js/equip-regras.js` | Regras puras (etiqueta, garantia, idade, troca, atenção, contagem), testadas em `tests/modulos.test.mjs` |
| `firestore.rules` | Quem muda o quê; testes em `tests/regras-modulos.test.mjs` |
