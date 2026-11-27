# Praxis — Serviços

O módulo de Serviços controla o trabalho das prestadoras contratadas: os
chamados (quando algo quebra) e as visitas periódicas (a manutenção do
contrato). Ele existe para responder três perguntas sem depender da palavra de
ninguém: **o técnico veio?**, **o que ele fez?** e **o que pode ser cobrado?**

Os contratos ficam fora do Praxis. Aqui entra só o que eles definem para o dia a
dia: a frequência das visitas, o prazo de atendimento e as unidades atendidas.

## Quem usa

| Papel em Serviços | O que faz |
|---|---|
| **Abre chamados** (solicitante) | Abre chamados nas unidades da empresa, conversa com a prestadora, confirma ou contesta o atendimento dos chamados que abriu. |
| **Financeiro** | O mesmo, mais a **Conferência do mês** (o que a fatura pode cobrar). |
| **Gestor** | Tudo isso, mais: configura os serviços contratados de cada prestadora, aprova ou reprova os extras, confirma qualquer atendimento e cuida das unidades. |
| **Prestadora** (perfil próprio) | Vê só os chamados e as visitas da prestadora dela. Agenda, registra a chegada e a saída pela placa, tira as fotos, pede extras e escreve o que fez. |
| **Conta da prestadora** | Uma pessoa da prestadora marcada como responsável: além do acima, cria e desativa os acessos dos técnicos dela (usuário e senha, sem e-mail). |

O papel em Serviços é separado do papel em Compras (veja
[`permissoes.md`](permissoes.md#acesso-por-módulo)).

## O chamado

```
Aberto → Agendado → No local → Concluído → Confirmado
                                   └─→ Contestado → volta para a prestadora
```

1. **Aberto.** Quem pede escolhe a prestadora, a unidade e, se quiser, o
   aparelho (do módulo Equipamentos), descreve o problema e pode anexar uma
   foto. Se o serviço contratado tem prazo, ele começa a contar aqui.
2. **Agendado.** A prestadora marca o dia e a hora. Quem pediu vê no chamado.
3. **No local.** O técnico lê o QR da placa da unidade ao chegar (veja abaixo).
   A hora é a do servidor; a localização do celular é registrada nesse momento.
4. **Concluído.** O técnico tira as fotos de antes e depois, escreve o que fez e
   as peças trocadas, e lê a placa de novo ao sair.
5. **Confirmado** ou **Contestado.** Quem pediu (ou o gestor) confirma que o
   técnico veio e resolveu, ou contesta com o motivo. O contestado volta para a
   prestadora, que agenda de novo.

O chamado aberto ou agendado pode ser cancelado por quem pediu ou pelo gestor,
com o motivo. Tudo fica no **Registro**, assinado e com a hora: cada mudança de
situação nasce junto com a sua entrada no histórico (as regras do Firestore não
aceitam uma sem a outra).

## A prova de presença

Cada unidade tem uma **placa com QR** (Administração › Unidades › Placa da
unidade, em PDF A5). O QR leva ao próprio Praxis com o ID da unidade e um
código aleatório. A câmera do celular abre o app direto na tela da placa, que
mostra ao técnico os chamados daquela unidade para registrar a chegada ou a
saída. No Android, o botão "Ler o QR" lê a placa sem sair do app.

- **O código não fica com a prestadora.** Ele está num documento à parte
  (`unidades/{id}/privado/placa`), que só quem cuida das unidades lê. No
  chamado, o app grava apenas a **prova**: o SHA-256 de "código|ID do chamado".
  As regras do Firestore recalculam a prova com o código guardado e só aceitam
  a chegada se bater. Uma prova antiga não serve para outro chamado.
- **A hora é a do servidor** (`request.time`): o celular não consegue adiantar
  nem atrasar o registro.
- **A distância** entre o celular e a unidade aparece no chamado quando a
  unidade tem a localização cadastrada. Chegada a mais de 300 m gera um aviso.
- **Sem a placa** (unidade nova, placa arrancada), o técnico pode registrar à
  mão. Fica escrito "registrada à mão, sem a placa" para todos verem.
- **Placa perdida ou fotografada:** "Trocar o código" invalida a placa
  impressa; a nova passa a valer na hora. A troca fica na auditoria.

O QR é fixo: quem fotografar a placa consegue reproduzir a leitura de longe.
Por isso a placa deve ficar num lugar visível só de dentro (atrás do balcão, na
sala técnica), e o código deve ser trocado quando houver suspeita.

## Visitas periódicas

Na ficha da prestadora (Serviços › Prestadoras), o gestor cadastra o serviço
contratado como **visita periódica**: a cada quantos dias, a data da primeira
visita e as unidades. O Praxis cria cada visita na data prevista, sem servidor:
quem abre a lista de Serviços garante as visitas do período atual e dos dois
anteriores, com um ID fixo (duas pessoas abrindo ao mesmo tempo gravam o mesmo
documento). Se o período passa sem a chegada do técnico, a visita vira **não
realizada**; as regras conferem a data.

## Extras

Durante o atendimento, o técnico pode pedir um serviço extra com o valor (por
exemplo, a troca de uma peça que não está no contrato). O **gestor aprova ou
reprova antes** de o serviço ser feito. Só o extra aprovado entra na
conferência; o que não passou pelo Praxis não foi aprovado.

## Conferência do mês

Serviços › Conferência: escolha a prestadora e o mês. A tela mostra as visitas
feitas e as não realizadas, os chamados confirmados, os contestados em aberto e
os extras aprovados, reprovados e sem decisão, com quem aprovou. O texto "Como
conferir a fatura" diz o que a fatura pode cobrar além do contrato. Tudo sai em
CSV.

## Painel da prestadora

Na lista de prestadoras, cada uma com contrato mostra os últimos 90 dias:
chamados, quantos chegaram no prazo, visitas feitas, contestados e o valor dos
extras aprovados.

## O que ainda depende do plano pago do Firebase

- **Fotos.** O envio para o Storage pede o plano Blaze. O app já comprime a foto
  no celular (até 1600 px) e grava a data, a hora e a unidade na própria imagem;
  as regras do Storage aceitam só JPEG de até 5 MB, só de quem está no chamado e
  só na etapa certa, e nunca apagam.
- **Avisos automáticos.** Sem Cloud Functions, os avisos são o "Com você" nas
  contagens da lateral e o botão "Avisar no WhatsApp" com a mensagem pronta.

## Onde está no código

| Arquivo | O quê |
|---|---|
| `js/servicos.js` | Lista, abas, novo chamado, visitas periódicas |
| `js/chamado.js` | Detalhe: régua, próximo passo, fotos, extras, conversa, registro |
| `js/presenca.js` | Chegada e saída (prova, hora, localização) e o leitor de QR |
| `js/qr-tela.js` | A tela que a câmera abre ao ler a placa |
| `js/prestadoras.js` | Serviços contratados, painel, técnicos da prestadora |
| `js/conferencia.js` | Conferência do mês e CSV |
| `js/unidades.js` | Cadastro das unidades e placa em PDF |
| `js/servicos-regras.js` | Regras puras (passos, prazo, visitas, conferência, painel), testadas em `tests/modulos.test.mjs` |
| `js/qr.js` | Gerador de QR próprio (sem biblioteca), testado com os exemplos da norma |
| `firestore.rules`, `storage.rules` | Quem faz cada passo; testes em `tests/regras-modulos.test.mjs` |
