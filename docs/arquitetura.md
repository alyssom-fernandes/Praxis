# Praxis — Arquitetura

## Visão geral

Praxis é uma SPA em Vanilla JS (ES Modules nativos, sem bundler) sobre Firebase. O `index.html` carrega um único módulo de entrada (`js/app.js`), que escuta o estado de autenticação e roteia pela query string `?tela=`.

```
Browser (ES Modules)
  ├── js/app.js ............ auth listener + roteamento + shells (topbar/footer)
  ├── js/<tela>.js ......... cada tela é um módulo com renderX() própria
  └── js/firebase.js ....... init do SDK + re-exports (Auth, Firestore, Storage, Functions)

Firebase
  ├── Firestore ............ dados (pedidos, usuarios, empresas, categorias, fornecedores)
  ├── Auth ................. e-mail/senha + Custom Claims { perfil, empresas[] }
  ├── Storage .............. arquivos de cotação e comprovantes de pagamento
  ├── Cloud Functions ...... triggers de notificação, claims, jobs agendados
  └── Hosting .............. estáticos (deploy via firebase deploy --only hosting)
```

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| **Sem bundler** | ES Modules nativos atendem o escopo; zero passo de build, deploy direto. |
| **Roteamento por `?tela=`** | Simples, indexável, sem dependência de History API ou router externo. |
| **Custom Claims para perfil/empresas** | As Firestore Rules validam permissões server-side sem leitura extra de documento. Setadas pela function `setUserClaims` em todo write de `/usuarios/{id}`. |
| **`runTransaction` no claim e na aprovação** | Dois compradores (ou dois aprovadores) simultâneos: o primeiro vence, o segundo recebe erro amigável. |
| **Dados desnormalizados** (`fornecedorNome`, `autorNome`) | Evita N+1 de leituras na renderização de listas. |
| **Tokens CSS** (`css/tokens.css`) | Dark mode padrão + override `.light` no `<html>`; troca de tema sem re-render. |
| **Constantes centralizadas** (`js/constants.js`) | Nenhuma string mágica de status/perfil no código; tudo importado. |
| **IDs sempre string** | IDs do Firestore nunca passam por coerção numérica. |
| **Datas internas `YYYY-MM-DD`** | Comparação lexicográfica funciona; formatação só na borda da UI. |

## Modelo de dados (Firestore)

```
/usuarios/{id}        nome, email, perfil, empresas[], ativo
/empresas/{id}        nome, cnpj, ativa
/categorias/{id}      nome, cor, tipo (padrao|personalizada)
/fornecedores/{id}    nome (normalizado), nomeExibicao, cnpj, usos
/pedidos/{id}         titulo, empresaId, status, solicitanteId, compradorId,
                      valorEstimado, valorFinal, dataCompra, urgente, numeroPedido,
                      reabertoDe (ref), reabertoPara (ref), ...
  /cotacoes/{id}      fornecedorId, fornecedorNome, valor, prazo, arquivo, indicada
  /comentarios/{id}   texto, autorId, mencoes[]
  /parcelas/{id}      numero, total, valor, vencimento, pago, comprovante
  /historico/{id}     status | tipo('cotacao'|'comprovante'|'edicao'|'anexo'),
                      autorId, nota, campo, valorAnterior, valorNovo, criadoEm
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

Multiempresa: todo pedido tem `empresaId`; toda query filtra por `where('empresaId', 'in', usuario.empresas)`. As Rules repetem essa validação usando o array `empresas` do token.

## Cloud Functions

| Função | Tipo | Papel |
|---|---|---|
| `setUserClaims` | trigger (write em `/usuarios`) | Sincroniza Custom Claims com o documento. |
| `onPedidoStatusChange` | trigger (update em `/pedidos`) | Despacha notificações in-app/e-mail por transição de status. |
| `checkClaimTimeout` | agendada (1h) | Pedido sem comprador há 48h (ou urgente há 4h) → notifica gestores. |
| `checkParcelasVencendo` | agendada (8h) | Parcelas vencendo em ≤3 dias → notifica financeiro/gestor. |
| `checkParcelasVencidas` | agendada (8h) | Parcelas vencidas → notifica financeiro/gestor. |
| `demoReset` | agendada (domingo 3h) | Versão antiga da renovação da demo, pelo servidor (exige o plano Blaze). |
| `triggerDemoSeed` | onCall | Renovação da demo sob demanda, pelo servidor (exige o plano Blaze). |

A demo publicada roda no plano gratuito e não depende dessas duas funções: a
renovação é feita pelo próprio app em `js/demo-reset.js`. No primeiro acesso do
dia à conta demo (e no "Restaurar dados" da faixa), o app apaga o que a demo
criou e recria `assets/demo/seed.json` com as datas andando até hoje. Uma trava
em `_meta/demo` evita duas renovações ao mesmo tempo, e as regras do Firestore
(`eDemo()`) só deixam a conta demo apagar os pedidos dela.

## Funcionalidades avançadas (Estágio 4)

| Funcionalidade | Implementação |
|---|---|
| **PWA** | `manifest.json` + `service-worker.js` (cache-first assets, network-first CDN, network-only Firestore/Auth) |
| **Paginação** | Slice client-side de 20 em 20 após `_filtrarPedidos()`; cursor não é necessário pois o listener já carrega tudo |
| **Ações em massa** | `_selecionados` (`Set`); export gera CSV com BOM UTF-8; cancelamento em massa via `Promise.all` com `updateDoc` + historico |
| **Visões salvas** | `_viewsSalvas` em `localStorage` (chave `praxis_views_{uid}`); max 8; salva 10 estados de filtro + modo |
| **Anexos gerais** | Upload para `pedidos/{id}/anexos/`; doc em subcollection `anexos`; evento `{tipo:'anexo'}` no historico |
| **Timeline SLA** | Deriva durações de `_historico` filtrando entradas com `h.status && (!h.tipo \|\| h.tipo === 'status')`; último segmento usa `Date.now()` se pedido não-terminal |
| **Reabertura** | `runTransaction` clona campos principais → novo pedido com `reabertoDe`; original recebe `reabertoPara` |
| **Command palette** | `window.__getPedidos()` getter evita import circular; pedidos filtrados em tempo real |
| **Tour guiado** | `box-shadow` 9999px como spotlight; estado em `localStorage` (regular) / `sessionStorage` (demo) |

## Modo demo

- Login de um clique (PT/EN) com conta pré-criada.
- Seed canônico em `functions/seed.json`: 3 empresas, 8 fornecedores, 33 pedidos com histórico, cotações, comentários e parcelas.
- Datas do seed são **relativas**: histórico e comentários usam `diasAtras`, parcelas podem usar `vencimentoDias`, e as datas fixas (necessidade, compra, entrega, vencimento) foram escritas para `_dataReferencia` e são deslocadas até o dia de hoje a cada reset. O dashboard sempre tem dados vivos.
- Localmente, `npm run seed` aplica o mesmo seed nos emuladores (`_build/seed-emulator.js`), com uma conta de teste por perfil.
- Escrita de configuração bloqueada para o usuário demo no cliente.
