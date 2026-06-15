# Praxis

> Gestão de compras corporativas — do pedido ao pagamento, com cotações, aprovações e rastreabilidade completa.

**Demo ao vivo:** [praxis-af618.web.app](https://praxis-af618.web.app) — clique em *"Acessar modo demo"* na tela de login.

O Praxis gerencia o ciclo de vida completo de uma compra corporativa em múltiplas empresas (CNPJs): um colaborador abre um pedido, um comprador reivindica e anexa cotações de fornecedores, um aprovador autoriza, o comprador executa a compra, a entrega é confirmada e o financeiro quita as parcelas. Cada etapa é rastreada, notificada e auditável.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript Vanilla (ES Modules nativos, sem bundler) |
| Banco de dados | Firebase Firestore |
| Autenticação | Firebase Auth com Custom Claims (perfil + empresas validados no servidor) |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Armazenamento | Firebase Storage (cotações, comprovantes, anexos gerais) |
| Hospedagem | Firebase Hosting |
| Exportação | jsPDF (PDF), CSV nativo com BOM UTF-8 (compatível com Excel) |
| Offline | Service Worker (cache-first para assets, network-first para CDN) |

Sem framework, sem etapa de build — o navegador carrega os ES Modules diretamente. Toda a interface é construída sobre um sistema de design baseado em tokens (temas claro/escuro, CSS custom properties, ícones SVG inline).

## Funcionalidades

- **Kanban + visualização em lista** — arrastar e soltar entre colunas de status (HTML5 + touch), regras de transição por perfil, lista ordenável com filtros e paginação de 20 itens por página
- **Ações em massa** — selecionar múltiplos pedidos na lista, exportar como CSV (compatível com Excel) ou cancelar em lote com motivo
- **Visões salvas** — salvar qualquer combinação de filtro + ordenação + visualização como um pill nomeado; localStorage por usuário, máximo 8
- **Fluxo de pedidos com transações seguras** — claim e aprovação usam `runTransaction` do Firestore para evitar conflitos de concorrência
- **Cotações** — múltiplas cotações de fornecedores por pedido, modal de comparação lado a lado, indicador de economia (maior cotação menos a selecionada)
- **Fornecedores estruturados** — autocomplete contra o cadastro de fornecedores; novos nomes são criados e deduplicados automaticamente por nome normalizado
- **Aprovações** com motivos de reprovação estruturados; pedidos reprovados podem ser reabertos com justificativa, criando um novo pedido vinculado
- **Parcelas** — pagamentos parcelados com confirmação individual e upload de comprovante; a última parcela move o pedido para Pago
- **Anexos gerais** — anexar PDFs, imagens, DOCX ou XLSX a qualquer pedido; visível no feed unificado de atividades
- **Timeline de SLA** — barra de duração por etapa no detalhe do pedido; o gargalo (etapa mais longa) destacado em dourado
- **Dashboard por perfil** — gasto ao longo do tempo (gráfico de linha), gasto por categoria (gráfico donut), economia total, parcelas a vencer; aprovadores veem apenas dados operacionais
- **Exportação PDF** — exportação individual do pedido como PDF formatado com histórico completo, cotações e parcelas
- **14 eventos de notificação** (in-app + e-mail) — claims, aprovações, reprovações, entregas, parcelas vencendo, @menções, pedidos parados
- **Paleta de comandos** — Cmd/Ctrl+K para navegação e ações via teclado
- **PWA** — instalável pelo Chrome/Edge, service worker faz cache dos assets para acesso offline
- **Tour guiado** — tour de 5 passos em destaque no primeiro acesso, reativável em Configurações → Geral
- **Isolamento multi-empresa** — cada consulta restrita às empresas do usuário, aplicado nas Firestore Rules via Custom Claims
- **Modo demo** — login com um clique, seed com 33 pedidos, reset semanal automático, tela de boas-vindas
- **Seis perfis** — Supremo, Gestor, Aprovador, Comprador, Financeiro, Solicitante — matriz completa de permissões em [`docs/permissoes.md`](docs/permissoes.md)

## Arquitetura

```
index.html            ponto de entrada único — carrega js/app.js como ES Module
css/                  tokens → base → components → views → themes (ordem de cascata)
js/
  app.js              estado de auth, roteamento ?tela=, shells de topbar/footer
  firebase.js         inicialização do Firebase + funções re-exportadas do SDK
  constants.js        STATUS, PERFIS, eventos, colunas do kanban — sem strings mágicas
  pedidos.js          kanban/lista, ações em massa, visões salvas, arrastar e soltar
  pedido-detalhe.js   detalhe: fluxo, cotações, comentários, anexos, timeline de SLA
  relatorios.js       dashboard, gráficos linha/donut, exportação PDF
  config-*.js         configurações: usuários, empresas, categorias, fornecedores
functions/
  src/triggers.js     triggers do Firestore — notificações de mudança de status, custom claims
  src/scheduled.js    cron jobs — SLA de claim, parcelas vencendo, reset semanal do demo
  seed.json           dataset canônico do demo (33 pedidos, fornecedores, empresas)
```

O roteamento é um simples parâmetro de query `?tela=` gerenciado pelo `app.js`. Transições que poderiam causar conflito (claim, aprovação) usam `runTransaction`; todo o resto são escritas simples no Firestore protegidas por uma matriz de permissões espelhada em `firestore.rules`.

## Rodando localmente

```bash
# 1. Clone e configure as credenciais do Firebase
cp js/config.example.js js/config.js   # preencha com as chaves do seu projeto Firebase

# 2. Instale as dependências das functions
cd functions && npm install && cd ..

# 3. Servir (qualquer servidor estático funciona — sem etapa de build)
firebase serve --only hosting
# ou: npx http-server .

# 4. Deploy
firebase deploy
```

Você precisará de um projeto Firebase com Firestore, Auth (e-mail/senha), Storage e Cloud Functions habilitados. `firestore.rules` e `firestore.indexes.json` estão incluídos no repositório.

## Documentação

- [`docs/arquitetura.md`](docs/arquitetura.md) — decisões técnicas e modelo de dados
- [`docs/fluxo-pedidos.md`](docs/fluxo-pedidos.md) — máquina de estados dos pedidos e regras de transição
- [`docs/permissoes.md`](docs/permissoes.md) — matriz de permissões por perfil

---

**AFN SYSTEMS** · por Alyssom Fernandes
