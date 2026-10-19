# Praxis

![Praxis: o quadro de pedidos no computador e o detalhe de um pedido no celular](docs/telas/capa.png)

O Praxis organiza as compras de um grupo de empresas, do pedido ao pagamento.
Alguém abre uma solicitação, o comprador reúne as cotações, o aprovador decide,
a compra é feita, a entrega é confirmada e o financeiro paga as parcelas. Cada
etapa tem responsável, prazo e histórico, e cada perfil vê só o que lhe cabe.

**Demonstração ao vivo:** [praxis-af618.web.app](https://praxis-af618.web.app). Na entrada, clique em **Acessar modo demo**.

[![Testes das regras](https://github.com/alyssom-fernandes/Praxis/actions/workflows/testes.yml/badge.svg)](https://github.com/alyssom-fernandes/Praxis/actions/workflows/testes.yml)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Firestore_·_Auth_·_Storage-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![Sem bundler](https://img.shields.io/badge/bundler-nenhum-555?style=flat-square)
![Tema](https://img.shields.io/badge/tema-claro_e_escuro-D2693F?style=flat-square)
![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-blue?style=flat-square)

Este README também está em [inglês](README.md).

## Em 30 segundos

1. Abra a [demonstração](https://praxis-af618.web.app) e clique em **Acessar modo demo**.
   Escolha quem você quer ser: uma pessoa por perfil (administrador, gestora, aprovador, compradora,
   financeiro ou solicitante), cada uma vendo e fazendo só o que o perfil dela permite. Dá para trocar
   a qualquer momento pela faixa no topo. São três empresas fictícias, com 34 pedidos em todas as etapas.
2. No quadro, abra o **PRX-0003** (em aprovação): compare as três cotações e aprove ou reprove com motivo.
3. Troque para o **Eduardo Lima** (financeiro) e abra o sino: o **PRX-0012** (comprado, pagamento antecipado) tem uma parcela vencida. Abra o pedido e registre o pagamento.
4. Em **Relatórios**, troque o período e exporte em PDF ou Excel, ou mande imprimir.
5. Troque de perfil (por exemplo, para a solicitante ou o aprovador) e veja a mesma operação pelos olhos de quem está em cada etapa.
6. Mexa à vontade: os dados de demonstração voltam ao original todo dia.

## Telas

Capturadas do modo demonstração.

| Quadro de pedidos, tema escuro | Detalhe do pedido, tema claro |
|---|---|
| ![Quadro com as colunas de status, do solicitado ao pago, no tema escuro](docs/telas/kanban-escuro.png) | ![Detalhe de um pedido em aprovação, com cotações, pessoas envolvidas e tempo por etapa, no tema claro](docs/telas/detalhe-claro.png) |
| **Relatórios, tema claro** | **Usuários e perfis, tema escuro** |
| ![Relatórios com indicadores, gasto mensal, status, categorias e próximas parcelas](docs/telas/relatorios-claro.png) | ![Lista de usuários com perfil, empresas e situação](docs/telas/usuarios-escuro.png) |
| **Entrada** | **O pedido em PDF** |
| ![Tela de entrada com o fluxo do pedido ilustrado e o acesso à demonstração](docs/telas/entrada-escuro.png) | ![Primeira página do PDF de um pedido, com dados, cotações, parcelas e histórico](docs/telas/pdf-pedido.png) |

| No celular, tema claro | No celular, tema escuro |
|---|---|
| <img src="docs/telas/celular-claro.png" alt="Detalhe de um pedido no celular, tema claro" width="260"> | <img src="docs/telas/celular-escuro.png" alt="Quadro de pedidos no celular, tema escuro" width="260"> |

---

## Funcionalidades

- **Quadro e lista.** Kanban com as sete etapas, total em reais por coluna, prazo em cada cartão e arrastar e soltar conforme o perfil. Na lista, filtros, ordenação, paginação e seleção em massa (exportar CSV ou cancelar com motivo).
- **Cotações.** Várias propostas por pedido, comparação lado a lado com a diferença para a menor, indicação da escolhida e cadastro de fornecedores sem duplicar nomes.
- **Aprovação rastreável.** Aprovar ou reprovar com motivo; pedido reprovado pode ser reaberto com justificativa, gerando um novo pedido vinculado ao original.
- **Compra, entrega e parcelas.** Execução da compra com fornecedor, valor final e parcelas; pagamento parcela a parcela com comprovante; a última parcela fecha o pedido.
- **Próximo passo sempre à vista.** Cada pedido diz quem precisa agir e o que falta, com o tempo gasto em cada etapa e o gargalo destacado.
- **Comentários com @menção, anexos e histórico completo** em uma linha do tempo única.
- **Relatórios.** Gasto, pedidos, economia nas cotações e parcelas a vencer, com comparação ao período anterior; gráficos por mês, status, categoria e empresa; exportação em PDF e Excel e versão para impressão. O aprovador vê só os dados operacionais.
- **Seis perfis** (supremo, gestor, aprovador, comprador, financeiro e solicitante), com as permissões validadas no servidor pelas regras do Firestore e do Storage: cada etapa do pedido só anda pelas mãos do perfil responsável. Matriz em [`docs/permissoes.md`](docs/permissoes.md).
- **Várias empresas.** Cada usuário trabalha só com os pedidos das empresas às quais pertence, e o gestor só vê e edita pessoas e empresas das dele; o supremo vê todas.
- **Notificações em tempo real** no app. As @menções saem do próprio app; as automáticas (aprovações, entregas, parcelas a vencer) vêm das Cloud Functions, com envio por e-mail via Resend quando a chave é configurada.
- **Paleta de comandos** (Ctrl+K), tour guiado, PWA instalável, tema claro e escuro e layout próprio para o celular.
- **Modo demonstração** com dados fictícios cujas datas acompanham o dia de hoje, recriados todo dia.

## Como um pedido anda

```mermaid
flowchart LR
  S[Solicitado] -->|comprador assume| C[Em cotação]
  C -->|cotação indicada| A[Em aprovação]
  A -->|aprova| P[Aprovado]
  A -->|reprova com motivo| R[Reprovado]
  P -->|compra executada| CO[Comprado]
  CO -->|entrega confirmada| E[Entregue]
  E -->|última parcela paga| G[Pago]
  R -.->|reaberto com justificativa| S
```

O pedido pode ser cancelado com motivo: pelo solicitante enquanto espera um comprador, e pelo gestor até a entrega. Quem abriu o pedido não o aprova nem o reprova (só o supremo pode), e as cotações e o recebimento ficam com o comprador que assumiu. As regras de cada transição estão em [`docs/fluxo-pedidos.md`](docs/fluxo-pedidos.md).

## Decisões técnicas

- **Sem framework e sem etapa de build.** O navegador carrega os ES Modules direto; a interface inteira sai de um sistema de *tokens* em CSS, com tema claro e escuro.
- **Segurança no servidor, não na tela.** O perfil e as empresas de cada usuário viajam no token (*custom claims*, definidos por uma Cloud Function). As regras do Firestore e do Storage conferem cada leitura e escrita: quem pode dar cada passo do pedido, que campos aquele passo pode mudar e a que empresas cada usuário chega. As regras têm testes automáticos no emulador (`npm run testar-regras`), rodados pelo GitHub Actions a cada envio.
- **Defesa em camadas no navegador.** Tudo o que os usuários escrevem é escapado antes de chegar à página, e o site envia uma política de segurança de conteúdo (CSP) sem scripts inline, mais cabeçalhos contra enquadramento e *sniffing*. As fontes são servidas pelo próprio site.
- **Sem corrida entre usuários.** Assumir um pedido e aprovar usam `runTransaction`: se duas pessoas clicam juntas, só uma vence. Toda mudança de status grava a entrada do histórico na mesma transação ou no mesmo lote, então o pedido nunca anda sem deixar registro.
- **Demonstração que não envelhece.** O seed guarda a data para a qual foi escrito e desloca todas as datas até o dia de hoje a cada recriação.
- **A demonstração pública roda no plano gratuito do Firebase.** Não tem Cloud Functions: a conta demo recebe o perfil pelas regras (pelo e-mail), a recriação diária roda no próprio app ([`js/demo-reset.js`](js/demo-reset.js)), em segundo plano, para o primeiro visitante do dia ver o quadro na hora, e os avisos do sino são de exemplo. *Custom claims*, notificações automáticas, e-mails e rotinas agendadas rodam nos emuladores ou no plano pago.
- **Uma conta demo que não alcança dados reais.** A senha dela vai no `js/config.js` público, então as regras dão a ela um perfil próprio, `demo`, que não vale como nenhum outro: só lê e grava registros marcados como demo (pedidos com ID `demo-…` e `isDemo == true`, as pessoas, empresas, categorias e fornecedores da demonstração) e arquivos de pedidos da demo. Ela nunca toca em usuários, empresas, categorias, pedidos ou arquivos reais, e nenhum pedido real vira pedido da demo.
- **Tudo verificável localmente.** Com os emuladores do Firebase, o app roda inteiro na máquina, sem tocar em dados reais.

Mais detalhes em [`docs/arquitetura.md`](docs/arquitetura.md).

## Como rodar

### Localmente, com os emuladores (sem conta no Firebase)

Requisitos: Node.js 20 ou superior e Java 11 ou superior (para o emulador do Firestore).

```bash
npm install
cd functions && npm install && cd ..
cp js/config.example.js js/config.js   # os valores de exemplo já servem para os emuladores
npm run emuladores                     # deixe rodando
```

Em outro terminal:

```bash
npm run seed      # 34 pedidos, 3 empresas e uma conta por perfil
npm run servir    # o app fica em http://localhost:8123
```

Para rodar os testes das regras de segurança (eles sobem e derrubam os próprios emuladores):

```bash
npm run testar-regras
```

Em `localhost` o app se conecta sozinho aos emuladores. Na entrada, use **Acessar modo demo**
ou entre com `supremo@`, `gestor@`, `aprovador@`, `comprador@`, `financeiro@` ou `solicitante@praxis.app`,
todos com a senha `demo1234`, para ver o sistema por cada perfil.

### No seu projeto Firebase

1. Crie um projeto com Firestore, Authentication (e-mail e senha), Storage e Cloud Functions.
2. Preencha `js/config.js` com as chaves do projeto e ajuste `.firebaserc`.
3. `npx firebase deploy`. As regras (`firestore.rules`, `storage.rules`) e os índices estão no repositório.

> **Não crie a conta demo (`demo@praxis.app`) num projeto com dados reais.** A senha dela vai no `js/config.js`, que o site entrega a todo visitante. As regras a mantêm longe dos dados reais, mas quem tiver a senha ainda consegue criar e alterar registros da demo. A conta demo só cabe num projeto feito para a demonstração pública.

## Estrutura

```
index.html            entrada única; carrega js/app.js como módulo
css/                  tokens → base → componentes → telas → temas
js/
  app.js              sessão, rotas (?tela=), barra lateral, navegação
  pedidos.js          quadro e lista, filtros, visões salvas, ações em massa
  pedido-detalhe.js   fluxo do pedido, cotações, parcelas, comentários, anexos, PDF
  relatorios.js       painel, gráficos e exportações
  config-*.js         usuários, cadastros e preferências
  demo-*.js           pessoas da demonstração e a recriação diária
functions/            gatilhos, rotinas agendadas e o seed da demonstração
scripts/              seed dos emuladores (npm run seed)
tests/                testes das regras do Firestore e do Storage (emulador)
docs/                 arquitetura, fluxo de pedidos e permissões
```

## Licença

MIT. Veja [`LICENSE`](LICENSE).

---

**AFN SYSTEMS** · por Alyssom Fernandes
