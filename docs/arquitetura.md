# Praxis — Arquitetura

## Visão geral

Praxis é uma SPA em Vanilla JS (ES Modules nativos, sem bundler) sobre Firebase. O `index.html` carrega um único módulo de entrada (`js/app.js`), que escuta o estado de autenticação e roteia pela query string `?tela=`.

```
Browser (ES Modules)
  ├── js/app.js ............ auth listener + roteamento + moldura (barra lateral/rodapé)
  ├── js/<tela>.js ......... cada tela é um módulo com renderX() própria
  └── js/firebase.js ....... init do SDK + re-exports (Auth, Firestore, Storage, Functions)

Firebase
  ├── Firestore ............ dados (pedidos, usuarios, empresas, categorias, fornecedores)
  ├── Auth ................. e-mail/senha + Custom Claims { perfil, empresas[] } (plano Blaze)
  ├── Storage .............. arquivos de cotação e comprovantes de pagamento
  ├── Cloud Functions ...... triggers de notificação, claims, jobs agendados
  └── Hosting .............. estáticos (deploy via firebase deploy --only hosting)
```

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| **Sem bundler** | ES Modules nativos atendem o escopo; zero passo de build, deploy direto. |
| **Roteamento por `?tela=`** | Simples, indexável, sem dependência de History API ou router externo. |
| **Perfil e empresas no token ou no documento** | Com a function `setUserClaims` (plano Blaze), as regras usam as Custom Claims, sem leitura extra. Sem ela (plano gratuito), as regras do Firestore e do Storage leem `/usuarios/{uid}`: uma leitura a mais por avaliação, e mudar perfil ou empresas vale na hora. Usuário inativo fica sem perfil nos dois caminhos. |
| **Pessoas novas entram por convite** | O perfil precisa ter o ID igual ao UID da conta de login, que só existe depois que a conta é criada. O gestor grava `/convites/{e-mail}`; a pessoa cria a própria senha na entrada ("Primeiro acesso?") e confirma o e-mail pelo link do Firebase; no primeiro acesso, cria `/usuarios/{uid}` copiando o convite, num lote que também apaga o convite, e as regras conferem campo a campo, o prazo e o e-mail confirmado. |
| **Nada muda sem registro** | A edição do pedido, a cotação, o anexo e o comprovante gravam a entrada do histórico no mesmo lote, e as regras exigem que ela nasça junto (`exists()` antes, `existsAfter()` depois): a edição e o comprovante apontam para a entrada (`ultimaEdicaoId`, `comprovanteEventoId`); a cotação e o anexo usam o próprio ID nela. O arquivo vai antes ao Storage e é apagado se o lote falhar. |
| **Separação de funções** | Quem abre ou cota o pedido não o aprova nem reprova, e quem o aprova não registra a compra nem o pagamento. As regras impõem (Firestore e Storage), e as telas usam a mesma conferência (`impedimentoDeFuncao`, em `js/utils.js`) para esconder a ação e dizer por quê. |
| **O supremo segue as etapas, sem as travas** | O supremo é o usuário máximo, da equipe que mantém o sistema. Alcança todas as empresas e administra usuários, convites, empresas e cadastros. Nos pedidos, segue a ordem das etapas, grava com a entrada do histórico e assina com o próprio UID, mas fica livre da separação de funções (aprova o que abriu ou cotou, compra e paga o que aprovou) e da alçada (a aprovação dele vale para o pedido inteiro, em qualquer nível): `livre()` nas regras. |
| **Motivo e cotação conferidos nas regras** | Reprovar e cancelar exigem o motivo (em "Outros", também o texto) e a reabertura, a justificativa. O pedido só vai a "Em aprovação" apontando a cotação indicada (`cotacaoIndicadaId`), que já existia e sai do lote marcada; dali em diante as cotações não mudam, no Firestore nem no Storage. |
| **Arquivos isolados por empresa** | As regras do Storage leem no Firestore o pedido de cada arquivo (regra entre serviços) e só liberam para quem vê o pedido. O Storage lê no máximo dois documentos por avaliação: o pedido e, sem as claims, o perfil da pessoa. |
| **`runTransaction` no claim e na aprovação** | Dois compradores (ou dois aprovadores) simultâneos: o primeiro vence, o segundo recebe erro amigável. |
| **Dados desnormalizados** (`fornecedorNome`, `autorNome`) | Evita N+1 de leituras na renderização de listas. |
| **Tokens CSS** (`css/tokens.css`) | Dark mode padrão + override `.light` no `<html>`; troca de tema sem re-render. |
| **Constantes centralizadas** (`js/constants.js`) | Nenhuma string mágica de status/perfil no código; tudo importado. |
| **Estado compartilhado em `js/estado.js`** | A sessão e os ganchos que um módulo registra para outro (a navegação, a lista do quadro, a troca de pessoa da demo) ficam num módulo que não importa nenhum outro. Assim `ui.js` e as telas não formam ciclo com `app.js`, e nada passa por globais na janela. |
| **Todo texto de tela no dicionário** | A tela escreve por `t()` (`js/constants.js`, com os textos em `js/textos-pt.js` e `js/textos-en.js`, este baixado só por quem escolhe o inglês, antes da primeira tela; a de relatórios, também por `js/textos-relatorios.js`), e os rótulos de etapa, perfil, condição e motivo seguem o idioma da sessão. A nota que o sistema grava no histórico vai pela chave do dicionário; a antiga, gravada como texto, é traduzida na hora de mostrar. `tests/textos.test.mjs` confere a paridade pt/en (chaves e marcadores), se toda chave pedida existe e se algum módulo escreve texto fora do dicionário. |
| **Empresas da pessoa sempre como lista** | `empresasDoUsuario()` (`js/utils.js`) é o único leitor: o app grava a lista, que as consultas (`array-contains-any`) e as Functions esperam. |
| **IDs sempre string** | IDs do Firestore nunca passam por coerção numérica. |
| **Datas internas `YYYY-MM-DD`** | Comparação lexicográfica funciona; formatação só na borda da UI. |

## Modelo de dados (Firestore)

```
/usuarios/{uid}       nome, email, perfil, empresas[], ativo, convidadoPor (ID = UID da conta de login)
/convites/{email}     email, nome, perfil, empresas[], ativo, criadoPor, criadoPorNome, criadoEm,
                      expiraEm (até 60 dias; apagado quando a pessoa entra)
/empresas/{id}        nome, cnpj, ativa
/categorias/{id}      nome, cor, tipo (padrao|personalizada)
/fornecedores/{id}    nome (normalizado), nomeExibicao, cnpj, usos
/pedidos/{id}         titulo, empresaId, status, solicitanteId, compradorId,
                      valorEstimado, valorFinal, dataCompra, urgente, numeroPedido,
                      reabertoDe (ref), reabertoPara (ref), ultimaEdicaoId, ...
  /cotacoes/{id}      fornecedorId, fornecedorNome, valor, prazo, arquivo, indicada
  /comentarios/{id}   texto, autorId, mencoes[]
  /parcelas/{id}      numero, total, valor, vencimento, pago, comprovante, comprovanteEventoId
  /historico/{id}     status | tipo('cotacao'|'comprovante'|'edicao'|'anexo'),
                      autorId, nota, campo, valorAnterior, valorNovo, criadoEm
                      (cotação e anexo: o mesmo ID do documento)
  /anexos/{id}        nomeArquivo, storagePath, tamanho, contentType,
                      autorId, autorNome, criadoEm
/_meta/contadores     totalPedidos (contador atômico via runTransaction)
/notificacoes/{userId}/items/{id}   evento, titulo, corpo, pedidoId, lida
```

### Storage paths

```
pedidos/{pedidoId}/cotacoes/{cotacaoId}    arquivos de cotação (PDF/imagem)
pedidos/{pedidoId}/comprovantes/{parcelaId} comprovantes de pagamento
pedidos/{pedidoId}/anexos/{timestamp_nome}  anexos gerais (PDF/imagem/DOCX/XLSX)
```

Multiempresa: todo pedido tem `empresaId`; as consultas filtram por `where('empresaId', 'in', usuario.empresas)` (o solicitante, por `solicitanteId`). As regras exigem esse filtro, usando o array `empresas` do token: sem ele, só o supremo lista.

## Segurança

| Camada | Onde | O que faz |
|---|---|---|
| Regras do Firestore | `firestore.rules` | Cada passo do pedido só pelo perfil dono, mudando só os campos daquele passo; empresas isoladas; ninguém muda o próprio perfil; datas validadas. Detalhes em [`permissoes.md`](permissoes.md). |
| Regras do Storage | `storage.rules` | Arquivos só para quem vê o pedido, conferido no Firestore; cotação, comprovante e anexo pelo perfil de cada etapa, na empresa do pedido; anexo assinado com o UID de quem enviou. |
| Testes das regras | `tests/regras.test.mjs` | Emulador, a cada envio (GitHub Actions, `.github/workflows/testes.yml`). |
| Escape na tela | `js/utils.js` (`esc`, `formatDate`, `urlSegura`), `js/ui.js` | Todo texto gravado por usuários é escapado antes do `innerHTML`; links só `http(s)`; avisos e diálogos escapam por padrão. |
| Cabeçalhos | `firebase.json` | CSP sem script inline (o primeiro script fica em `js/inicio.js`), `frame-ancestors 'none'`, `nosniff`, Referrer-Policy e Permissions-Policy. |
| Fontes locais | `assets/fonts/`, `css/fontes.css` | Nenhuma requisição ao Google Fonts (nem repasse do IP do visitante). |
| Bibliotecas no próprio site | `vendor/`, `carregarBiblioteca()` em `js/ui.js` | jsPDF 2.5.1 e ExcelJS 4.4.0 copiados do npm sem alteração (os bytes batem com os do cdnjs), com a licença ao lado, e carregados só na primeira exportação. A CSP não libera o cdnjs. Depois do primeiro uso, o service worker guarda os arquivos, e a exportação funciona sem internet. |
| SDK do Firebase conferido | `index.html` (`modulepreload` com `integrity`) | O SDK vem do gstatic, na mesma versão do pacote `firebase` usado nos testes; o `integrity` de cada módulo é o hash do arquivo publicado no npm, e o navegador recusa um arquivo diferente. `tests/unidade.test.mjs` confere versão e hashes, então atualizar o SDK exige atualizar os dois. |

## Cloud Functions

| Função | Tipo | Papel |
|---|---|---|
| `setUserClaims` | trigger (write em `/usuarios`) | Sincroniza Custom Claims com o documento; limpa as de quem foi apagado ou desativado. Sem ela, as regras leem o documento. |
| `onPedidoCriado` | trigger (create em `/pedidos`) | Pedido aberto → avisa a fila de compra da empresa (comprador, gestor e supremo), menos quem abriu; o urgente também por e-mail. |
| `onPedidoAtualizado` | trigger (update em `/pedidos`) | Comprador assumiu ou devolveu o pedido (pela troca de `compradorId`, que muda junto com a etapa), urgência marcada depois de aberto e mudanças de etapa. |
| `checkClaimTimeout` | agendada (1h) | Pedido sem comprador há 48h (ou urgente há 4h) → avisa a gestão, uma vez por pedido e prazo. |
| `checkParcelasVencendo` | agendada (8h) | Parcela a vencer em até 3 dias → avisa financeiro e gestão, uma vez por parcela e vencimento. |
| `checkParcelasVencidas` | agendada (8h) | Parcela vencida → avisa financeiro e gestão, uma vez por parcela e vencimento. |
| `demoReset` | agendada (domingo 3h) | Versão antiga da renovação da demo, pelo servidor (exige o plano Blaze). |
| `triggerDemoSeed` | onCall | Renovação da demo sob demanda, pelo servidor (exige o plano Blaze). Só a conta demo ou um supremo, no máximo uma vez por dia. |

Os avisos seguem três regras, todas em funções puras testadas em
`tests/functions.test.mjs`, sem emulador:

- **Quem recebe e o texto** ficam em `functions/src/avisos.js`. O destinatário
  precisa alcançar a empresa do pedido e estar ativo; quem fez a ação não é
  avisado, e quem abriu ou cotou o pedido não é chamado para decidir (a mesma
  separação de funções das regras). Pedidos da demo não avisam ninguém.
  `aprovadorIds` fica reservado para a alçada por valor e hoje vem vazio.
- **Cada aviso sai uma vez só.** A chave é o ID do evento nos gatilhos e
  pedido + parcela + vencimento nas rotinas. A marca em `_avisos/{chave}`
  impede repetir o aviso na rodada seguinte; o ID da notificação,
  `{chave}__{uid}`, impede repetir para a mesma pessoa se a entrega for
  interrompida. O e-mail só sai junto com uma notificação nova. A marca leva
  `expiraEm`, para uma política de TTL do Firestore apagá-la depois.
- **As datas são as de São Paulo** (`functions/src/datas.js`): o servidor das
  Functions roda em UTC, e sem isso "hoje" virava o dia seguinte às 21h de
  Brasília.

O título e os motivos entram escapados no HTML do e-mail.

A demo publicada roda no plano gratuito e não depende dessas duas funções: a
renovação é feita pelo próprio app em `js/demo-reset.js`. No primeiro acesso do
dia à conta demo, em segundo plano, depois que o quadro já apareceu (e na hora,
no "Restaurar dados" da faixa), o app regrava `assets/demo/seed.json` por cima,
com as datas andando até hoje, e apaga o que os visitantes criaram. Uma trava
em `_meta/demo` evita duas renovações ao mesmo tempo, e as regras do Firestore
dão à conta demo o perfil `demo`, que só alcança os dados da demonstração.

## Funcionalidades avançadas (Estágio 4)

| Funcionalidade | Implementação |
|---|---|
| **PWA** | `manifest.json` (id, atalhos ?novo=pedido, ?novo=compra e Minha fila, capturas em `assets/telas/`) + `service-worker.js`: na instalação guarda a versão inteira (index, CSS com o `?v=`, todos os módulos de `js/`, fontes, ícones) num cache com o nome da versão, e o SDK do gstatic num cache próprio pela versão do SDK; os arquivos da versão saem sempre do cache dela (nunca misturam versões); a versão nova espera o toque em "Atualizar" (js/app.js) ou o app fechar. A lista e a versão (resumo do conteúdo) vêm de `scripts/gerar-sw.mjs`; `tests/pwa.test.mjs` falha se estiverem velhas. `vendor/`, os dados da demo e o SDK do Storage: rede primeiro, cópia sem internet. Firestore/Auth/Storage sem interceptação |
| **Entrada sem JavaScript** | A tela de entrada vem escrita no `index.html` (`scripts/gerar-entrada.mjs`, desenhada pelo próprio `renderLogin`); `js/entrada.js` só liga os eventos e carrega o Firebase sob demanda. CSS das telas do app (`css/telas.css`) fora da primeira pintura. Lighthouse 97 na entrada (ver docs/decisoes.md) |
| **Estado das telas** | Detalhe, pedidos e relatórios divididos em módulos de até 1.200 linhas, com o estado num objeto (`D`, `Q`, `R`) |
| **Abertura rápida** | Quem já entrou no aparelho abre com o perfil da cópia local (`carregarUsuario`, js/auth.js) e o quadro com empresas e categorias da cópia (`lerRapido`, js/firebase.js), sem esperar a rede; o servidor confere em seguida (perfil diferente redesenha a tela; conta desativada sai). Erro de rede na abertura nunca tira a conta (antes, sem internet, a falha levava à saída, que apagava a cópia local). Medido em `_build/medir-desempenho.mjs` (celular simulado, 4G lento, CPU 4x) |
| **Paginação** | Slice client-side de 20 em 20 após `_filtrarPedidos()`; cursor não é necessário pois o listener já carrega tudo |
| **Ações em massa** | `_selecionados` (`Set`); export gera CSV com BOM UTF-8; cancelamento em massa via `Promise.all` com `updateDoc` + historico |
| **Visões salvas** | `_viewsSalvas` em `localStorage` (chave `praxis_views_{uid}`); max 8; salva 10 estados de filtro + modo |
| **Anexos gerais** | Upload para `pedidos/{id}/anexos/`; doc em subcollection `anexos` e evento `{tipo:'anexo'}` no historico, no mesmo lote e com o mesmo ID |
| **Timeline SLA** | Deriva durações de `_historico` filtrando entradas com `h.status && (!h.tipo \|\| h.tipo === 'status')`; último segmento usa `Date.now()` se pedido não-terminal |
| **Reabertura** | `runTransaction` clona campos principais → novo pedido com `reabertoDe`; original recebe `reabertoPara` |
| **Command palette** | Lê a lista do quadro por `pedidosCarregados()` (`js/estado.js`), sem import circular; pedidos filtrados em tempo real |
| **Tour guiado** | `box-shadow` 9999px como spotlight; abre só pelo botão "Fazer o tour" (faixa da demo e Configurações › Geral) |

## Modo demo

- Entrada pelo botão "Acessar modo demo", com a escolha de quem ser: seis pessoas, uma por perfil (`js/demo-pessoas.js`). O login é sempre a mesma conta demo.
- Seed em `assets/demo/seed.json` (cópia idêntica em `functions/seed.json`, para as Functions): 3 empresas, 8 fornecedores, 34 pedidos com histórico, cotações, comentários e parcelas.
- A renovação (`js/demo-reset.js`) distribui os pedidos entre a solicitante, a gestora e três colegas, dá a cada pessoa um último acesso plausível e grava os avisos que as Cloud Functions mandariam (parcela vencida, cotações prontas, aprovação, entrega, @menções).
- Datas do seed são **relativas**: histórico e comentários usam `diasAtras`, parcelas podem usar `vencimentoDias`, e as datas fixas (necessidade, compra, entrega, vencimento) foram escritas para `_dataReferencia` e são deslocadas até o dia de hoje a cada reset. O dashboard sempre tem dados vivos.
- Localmente, `npm run seed` aplica o mesmo seed nos emuladores (`scripts/seed-emulator.js`), com uma conta de teste por perfil.
- Escrita de configuração bloqueada para o usuário demo no cliente.
- Envio de arquivos desligado na demo publicada (`DEMO_ENVIA_ARQUIVOS`, em `js/constants.js`): desde 03/02/2026 o Cloud Storage do Firebase exige o plano Blaze, e no plano gratuito todo envio volta 402 (`storage/quota-exceeded`). Na demo, a tela troca os campos de arquivo por um aviso e registra a cotação sem o arquivo; fora dela, esse erro vira o aviso "O envio de arquivos está indisponível neste ambiente."
