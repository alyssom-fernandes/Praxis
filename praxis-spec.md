# Praxis — Documento de Especificação Completo
> Versão 1.0 — Gerado em junho de 2026  
> Este documento é a fonte única de verdade para o desenvolvimento do Praxis. Toda decisão de implementação deve ser baseada aqui.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Stack e Arquitetura](#2-stack-e-arquitetura)
3. [Design System](#3-design-system)
4. [Estrutura de Arquivos](#4-estrutura-de-arquivos)
5. [Modelo de Dados — Firestore](#5-modelo-de-dados--firestore)
6. [Perfis e Permissões](#6-perfis-e-permissões)
7. [Fluxo de Pedido](#7-fluxo-de-pedido)
8. [Telas e Comportamentos](#8-telas-e-comportamentos)
9. [Notificações](#9-notificações)
10. [Cloud Functions](#10-cloud-functions)
11. [Multiempresa](#11-multiempresa)
12. [Login e Autenticação](#12-login-e-autenticação)
13. [Modo Demo](#13-modo-demo)
14. [Regras Técnicas Globais](#14-regras-técnicas-globais)
15. [O que não será implementado no MVP](#15-o-que-não-será-implementado-no-mvp)

---

## 1. Visão Geral

**Nome:** Praxis  
**Origem do nome:** Do grego — execução prática de um processo.  
**Tipo:** Sistema web SPA de gestão de compras corporativas.  
**Público-alvo:** Grupos empresariais com múltiplas unidades (CNPJs).  
**Caso de uso principal:** Controlar o ciclo completo de uma compra — da solicitação ao pagamento — com rastreabilidade, cotações e aprovações.

**Produto do portfólio de:** Alyssom Fernandes (AFN Systems)  
**Não é** uma ferramenta exclusiva do Grupo Zen. A identidade visual e o texto do sistema não devem referenciar nenhuma empresa específica.

---

## 2. Stack e Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JS (ES Modules) |
| Banco de dados | Firebase Firestore |
| Autenticação | Firebase Auth |
| Backend serverless | Firebase Cloud Functions (Node.js) |
| E-mail | Resend API (free tier: 3.000 e-mails/mês) |
| Hospedagem | Firebase Hosting |
| Export | SheetJS (Excel), jsPDF (PDF) |

### Roteamento
SPA com parâmetro `?tela=` na URL.

```
?tela=pedidos
?tela=detalhe&id={pedidoId}
?tela=relatorios
?tela=config-usuarios
?tela=config-geral
```

`app.js` lê o parâmetro e chama a função de render da tela correspondente.

### Módulos JS (ES Modules)
Todos os arquivos JS usam `import`/`export`. O `index.html` carrega apenas:
```html
<script type="module" src="js/app.js"></script>
```

### Padrões obrigatórios
- **Nunca usar** `alert()`, `confirm()` ou `prompt()` nativos — sempre `prxAlert()`, `prxConfirm()`, `prxToast()` de `ui.js`
- **Nunca hardcodar** strings de status, perfis ou categorias — sempre importar de `constants.js`
- **Nunca fazer** query Firestore sem filtro por `companyId` quando a coleção for de uma empresa
- **IDs sempre como string** — nunca coerção com `+` ou `parseInt`
- **Datas internamente** no formato `YYYY-MM-DD`

---

## 3. Design System

### Identidade Visual

**Logo wordmark:** `PR▲XIS` — o A é substituído pelo delta (Δ/triângulo sólido)  
**Marca do desenvolvedor:** AFN SYSTEMS / by Alyssom Fernandes  
**Fonte logo:** JetBrains Mono, weight 700  
**Fonte corpo:** Plus Jakarta Sans  

### Paleta de Cores — Dark Mode (padrão)

```css
/* tokens.css */
:root {
  /* Primária */
  --gold: #C8A96E;
  --gold-dim: rgba(200, 169, 110, 0.09);
  --gold-border: rgba(200, 169, 110, 0.25);
  --gold-glow: rgba(200, 169, 110, 0.22);

  /* Backgrounds */
  --bg: #060606;
  --card: #0C0C0C;
  --card2: #111111;
  --card3: #161616;

  /* Bordas */
  --border: rgba(255, 255, 255, 0.06);
  --line: #1A1A1A;

  /* Texto */
  --text: #F0EDE6;
  --text2: #C8C0B8;
  --text3: #8A8278;

  /* Semânticas */
  --green: #4EC08A;
  --red: #E05040;
  --blue: #5BA3E0;

  /* Bordas */
  --radius: 20px;
  --radius-card: 20px;
  --radius-sm: 10px;
  --radius-btn: 20px;
  --radius-input: 8px;
}
```

### Paleta — Light Mode

```css
.light {
  --bg: #EDE8DF;
  --card: rgba(255, 255, 255, 0.84);
  --card2: rgba(240, 240, 242, 0.95);
  --border: rgba(0, 0, 0, 0.08);
  --line: #e2e2e6;
  --text: #1A1714;
  --text2: #4A4642;
  --text3: #AFA398;
  --gold: #9A7030;
  --gold-dim: rgba(154, 112, 48, 0.1);
  --gold-border: rgba(154, 112, 48, 0.3);
  --gold-glow: rgba(154, 112, 48, 0.2);
}
```

### Marca AFN — Dark Mode
```css
--afn: #c44a5a;
--afn-stroke: rgba(196, 74, 90, 0.4);
--afn-sys: rgba(255, 255, 255, 0.28);
```

### Marca AFN — Light Mode
```css
--afn: #6b1f2a;
--afn-stroke: rgba(107, 31, 42, 0.4);
--afn-sys: #505050;
```

### Fundo com Estrelas (canvas)

Todo fundo usa um `<canvas>` com:
- **Nebulas âmbar:** 3 blobs radiais em posições assimétricas, opacidade ~0.05
- **Estrelas pequenas:** 240 pontos com tamanho e opacidade variados
- **Estrelas grandes:** 13 pontos com halo suave

No dark mode: estrelas brancas/âmbar  
No light mode: pontos escuros em tons de marrom/sepia, nebulas mais sutis  

A função `drawStars(canvas, theme)` deve ser reutilizável e chamada em todas as telas.

### Cards

Todos os cards seguem o mesmo padrão:

```css
.card {
  background: var(--card);
  border-radius: var(--radius-card);
  border: 1px solid var(--border);
  position: relative;
  overflow: hidden;
  transition: transform 0.26s ease, border-color 0.26s ease, box-shadow 0.26s ease;
}

/* Glow saindo de baixo — cor varia por contexto */
.card::before {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 50%;
  background: radial-gradient(ellipse 90% 70% at 50% 100%,
    rgba(200, 169, 110, 0.18) 0%,
    rgba(200, 169, 110, 0.05) 55%,
    transparent 80%);
  pointer-events: none;
  transition: height 0.26s ease;
}

/* Hover */
.card:hover {
  transform: translateY(-5px);
  border-color: var(--gold-border);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}
.card:hover::before {
  height: 70%;
}
```

**Exceção:** Cards de tabela (Usuários, Categorias, Empresas) não têm hover de levantamento — apenas highlight sutil por linha.

### Botões

```css
/* Primário — ouro com gradient */
.btn-primary {
  background: linear-gradient(135deg, #D4B474 0%, #C8A96E 50%, #B8924A 100%);
  border: none;
  border-radius: var(--radius-btn);
  color: #0A0A0A;
  font-weight: 700;
  transition: transform 0.22s ease, box-shadow 0.22s ease;
  box-shadow: 0 2px 12px rgba(200, 169, 110, 0.2),
              inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px var(--gold-glow),
              inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

/* Ghost — borda sutil ouro */
.btn-ghost {
  background: rgba(200, 169, 110, 0.05);
  border: 1px solid rgba(200, 169, 110, 0.25);
  color: var(--text3);
  transition: transform 0.22s ease, box-shadow 0.22s ease,
              border-color 0.22s ease, color 0.22s ease;
}
.btn-ghost:hover {
  transform: translateY(-3px);
  border-color: var(--gold-border);
  color: var(--gold);
  box-shadow: 0 8px 24px rgba(200, 169, 110, 0.12);
}

/* Secundário — borda neutra */
.btn-secondary {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text2);
}
.btn-secondary:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.18);
}
```

### Topbar

```
[Logo PR▲XIS] [Pedidos] [Relatórios]          [🔔] [☀/🌙] [⚙/✕] [Avatar]
```

- Modo configurações: "Pedidos" e "Relatórios" somem, entram as seções de config
- A engrenagem (⚙) vira X quando configurações estão abertas
- Sino e tema sempre visíveis
- Todos os ícones são SVG inline — zero emojis

---

## 4. Estrutura de Arquivos

```
praxis/
│
├── index.html
├── firebase.json
├── .firebaserc
├── firestore.rules
├── firestore.indexes.json
├── .gitignore
├── README.md
│
├── docs/
│   ├── arquitetura.md
│   ├── fluxo-pedidos.md
│   └── permissoes.md
│
├── assets/
│   ├── logo/
│   │   ├── praxis-logo.svg
│   │   ├── praxis-logo@1x.png
│   │   ├── praxis-logo@2x.png
│   │   ├── praxis-icon.svg
│   │   ├── praxis-icon-512.png
│   │   └── praxis-favicon.ico
│   └── demo/
│       └── seed.json
│
├── css/
│   ├── tokens.css
│   ├── base.css
│   ├── themes.css
│   ├── components.css
│   └── views.css
│
├── js/
│   ├── firebase.js
│   ├── app.js
│   ├── ui.js
│   ├── auth.js
│   ├── utils.js
│   ├── constants.js
│   ├── pedidos.js
│   ├── pedido-detalhe.js
│   ├── relatorios.js
│   ├── notificacoes.js
│   ├── config-usuarios.js
│   └── config-geral.js
│
└── functions/
    ├── package.json
    ├── index.js
    └── src/
        ├── triggers.js
        ├── scheduled.js
        ├── email.js
        └── utils.js
```

### Responsabilidades por arquivo JS

| Arquivo | Responsabilidade |
|---|---|
| `firebase.js` | Init Auth, Firestore, Functions |
| `app.js` | Auth state listener, roteamento `?tela=`, init global |
| `ui.js` | `prxAlert`, `prxConfirm`, `prxToast`, spinner, toggle de tema, helpers DOM |
| `auth.js` | Login, logout, esqueci senha, acesso demo, seleção de idioma |
| `utils.js` | formatCurrency (BRL), formatDate, debounce, sanitizeString, helpers puros |
| `constants.js` | STATUS, PERFIS, CATEGORIAS, EVENTOS_NOTIFICACAO |
| `pedidos.js` | Lista kanban + lista tabular, filtros, toggle de view, claim de comprador |
| `pedido-detalhe.js` | Detalhe completo: metadados, workflow, cotações, comentários, pagamentos |
| `relatorios.js` | Dashboard, métricas, gráfico de barras, parcelas, filtros, export |
| `notificacoes.js` | Dropdown in-app, badge, marcar lida, marcar todas |
| `config-usuarios.js` | CRUD usuários: perfil, empresas vinculadas, status |
| `config-geral.js` | Empresas, categorias, fornecedores, preferências gerais |

### constants.js — valores obrigatórios

```js
export const STATUS = {
  SOLICITADO:    'solicitado',
  AG_COTACAO:    'ag_cotacao',
  EM_APROVACAO:  'em_aprovacao',
  APROVADO:      'aprovado',
  COMPRADO:      'comprado',
  ENTREGUE:      'entregue',
  PAGO:          'pago',
  REPROVADO:     'reprovado',
  CANCELADO:     'cancelado',
}

export const PERFIS = {
  SUPREMO:    'supremo',
  GESTOR:     'gestor',
  APROVADOR:  'aprovador',
  COMPRADOR:  'comprador',
  FINANCEIRO: 'financeiro',
  SOLICITANTE:'solicitante',
}

export const MOTIVOS_REPROVACAO = [
  'Valor acima do orçamento',
  'Cotações insuficientes',
  'Justificativa inadequada',
  'Fornecedor não aprovado',
  'Outros',
]

export const MOTIVOS_CANCELAMENTO = [
  'Compra não necessária',
  'Fornecedor indisponível',
  'Erro no pedido',
  'Pedido duplicado',
  'Outros',
]

export const CATEGORIAS_PADRAO = [
  'Manutenção',
  'Escritório',
  'Operacional',
  'Alimentação',
  'Uniformes e EPIs',
  'Marketing',
  'TI',
  'Serviços',
]

export const EVENTOS = {
  PEDIDO_URGENTE:         'pedido_urgente',
  AG_COTACAO:             'ag_cotacao',
  COMPRADOR_ASSUMIU:      'comprador_assumiu',
  COTACOES_PRONTAS:       'cotacoes_prontas',
  PEDIDO_APROVADO:        'pedido_aprovado',
  PEDIDO_REPROVADO:       'pedido_reprovado',
  PEDIDO_CANCELADO:       'pedido_cancelado',
  PEDIDO_COMPRADO:        'pedido_comprado',
  PEDIDO_ENTREGUE:        'pedido_entregue',
  PARCELA_VENCENDO:       'parcela_vencendo',
  PARCELA_VENCIDA:        'parcela_vencida',
  MENCAO_COMENTARIO:      'mencao_comentario',
  PEDIDO_PARADO:          'pedido_parado',
  PEDIDO_ENTREGUE_SOLIC:  'pedido_entregue_solic',
}
```

---

## 5. Modelo de Dados — Firestore

### Coleções e documentos

```
/usuarios/{userId}
  - nome: string
  - email: string
  - perfil: PERFIS
  - empresas: string[]          // array de companyIds
  - ativo: boolean
  - criadoEm: timestamp
  - ultimoAcesso: timestamp

/empresas/{empresaId}
  - nome: string
  - cnpj: string
  - ativa: boolean
  - criadaEm: timestamp

/categorias/{categoriaId}
  - nome: string
  - cor: string                 // hex
  - tipo: 'padrao' | 'personalizada'
  - criadaEm: timestamp

/fornecedores/{fornecedorId}
  - nome: string                // normalizado para busca
  - nomeOriginal: string
  - cnpj: string                // opcional
  - criadoEm: timestamp
  - usos: number                // contador de pedidos

/pedidos/{pedidoId}
  - titulo: string
  - descricao: string           // observações do solicitante
  - empresaId: string
  - quantidade: number
  - unidade: string
  - dataNecessaria: string      // YYYY-MM-DD
  - valorEstimado: number       // opcional
  - centroCusto: string         // opcional
  - categoriaId: string
  - urgente: boolean
  - status: STATUS
  - solicitanteId: string
  - compradorId: string | null
  - compradorAssumiuEm: timestamp | null
  - aprovadorIds: string[]      // lista de aprovadores responsáveis
  - aprovadoPor: string | null  // userId de quem aprovou
  - aprovadoEm: timestamp | null
  - reprovadoPor: string | null
  - reprovadoEm: timestamp | null
  - motivoReprovacao: string | null
  - motivoReprovacaoOutros: string | null
  - canceladoPor: string | null
  - canceladoEm: timestamp | null
  - motivoCancelamento: string | null
  - motivoCancelamentoOutros: string | null
  - fornecedorId: string | null // preenchido ao comprar
  - valorFinal: number | null
  - condicaoPagamento: 'antecipado' | 'apos_recebimento' | null
  - dataCompra: string | null   // YYYY-MM-DD
  - dataEntrega: string | null  // YYYY-MM-DD
  - criadoEm: timestamp
  - atualizadoEm: timestamp

/pedidos/{pedidoId}/cotacoes/{cotacaoId}
  - fornecedorId: string
  - fornecedorNome: string       // desnormalizado para exibição
  - valor: number
  - prazoEntrega: string         // ex: "5 dias úteis"
  - condicoesComerciais: string  // frete, impostos, garantia
  - arquivoUrl: string           // Firebase Storage
  - arquivoNome: string
  - indicada: boolean            // preferida pelo comprador
  - criadaEm: timestamp
  - compradorId: string

/pedidos/{pedidoId}/comentarios/{comentarioId}
  - texto: string
  - autorId: string
  - autorNome: string            // desnormalizado
  - mencoes: string[]            // array de userIds mencionados
  - criadoEm: timestamp

/pedidos/{pedidoId}/parcelas/{parcelaId}
  - numero: number               // 1, 2, 3...
  - total: number                // total de parcelas
  - valor: number
  - vencimento: string           // YYYY-MM-DD
  - pago: boolean
  - pagoEm: timestamp | null
  - comprovante: string | null   // URL Firebase Storage

/pedidos/{pedidoId}/historico/{entradaId}
  - status: STATUS
  - autorId: string
  - autorNome: string
  - nota: string | null          // motivo ou observação
  - criadoEm: timestamp

/notificacoes/{userId}/items/{notifId}
  - evento: EVENTOS
  - lida: boolean
  - titulo: string
  - corpo: string
  - pedidoId: string | null
  - criadaEm: timestamp
```

### Regras de segurança (firestore.rules)

```
- Usuário só lê/escreve pedidos das empresas em que está vinculado
- Perfil é validado via Custom Claims no token de Auth (setado pela Cloud Function setUserClaims)
- Histórico e cotações: leitura permitida para todos com acesso ao pedido
- Cotações: escrita apenas por compradores
- Parcelas: escrita apenas por financeiro
- Notificações: leitura/escrita apenas pelo próprio usuário
```

### Índices obrigatórios (firestore.indexes.json)

```json
[
  { "collectionGroup": "pedidos", "fields": [
    { "fieldPath": "empresaId" },
    { "fieldPath": "status" },
    { "fieldPath": "criadoEm", "order": "DESCENDING" }
  ]},
  { "collectionGroup": "pedidos", "fields": [
    { "fieldPath": "empresaId" },
    { "fieldPath": "urgente" },
    { "fieldPath": "criadoEm", "order": "DESCENDING" }
  ]},
  { "collectionGroup": "parcelas", "fields": [
    { "fieldPath": "vencimento" },
    { "fieldPath": "pago" }
  ]}
]
```

---

## 6. Perfis e Permissões

### Definição dos perfis

| Perfil | Descrição |
|---|---|
| **Supremo** | Acesso total. Configura o sistema, gerencia todos os usuários e empresas. |
| **Gestor** | Visão completa e relatórios financeiros consolidados. Aprova pedidos. Cancela pedidos em qualquer etapa até Comprado. Libera claim travado. |
| **Aprovador** | Aprova pedidos das empresas que tem acesso. Vê cotações e histórico do pedido. Não acessa relatórios financeiros consolidados. |
| **Comprador** | Assume pedidos (claim), busca cotações, executa compras. |
| **Financeiro** | Visualiza pagamentos, parcelas e vencimentos. Confirma pagamentos e anexa comprovantes. Não aprova pedidos nem altera campos comerciais. |
| **Solicitante** | Abre pedidos. Acompanha status. Pode cancelar pedido próprio apenas no estado "Solicitado" (antes do claim). |

### Matriz de permissões por ação

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
| Cancelar pedido (qualquer etapa até Comprado) | ✅ | ✅ | — | — | — | — |
| Cancelar pedido próprio em Solicitado | ✅ | ✅ | — | — | — | ✅ |
| Comentar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver relatórios financeiros | ✅ | ✅ | — | — | ✅ | — |
| Gerenciar usuários | ✅ | ✅ | — | — | — | — |
| Gerenciar empresas | ✅ | ✅ | — | — | — | — |
| Gerenciar categorias | ✅ | ✅ | — | — | — | — |

---

## 7. Fluxo de Pedido

### Diagrama de estados

```
                    ┌─────────────┐
                    │  Solicitado │ ← estado inicial
                    └──────┬──────┘
                           │ Comprador faz claim (runTransaction)
                    ┌──────▼──────┐
                    │ Ag. cotação │
                    └──────┬──────┘
                           │ Comprador indica cotação preferida
                    ┌──────▼──────┐
                    │Em aprovação │
                    └──────┬──────┘
             ┌─────────────┼─────────────┐
             │ Aprovado    │             │ Reprovado (+ motivo)
      ┌──────▼──────┐      │      ┌──────▼──────┐
      │   Aprovado  │      │      │  Reprovado  │ ← terminal
      └──────┬──────┘      │      └─────────────┘
             │ Comprador executa compra
      ┌──────▼──────┐
      │   Comprado  │
      └──────┬──────┘
             │ Comprador ou Solicitante confirma recebimento
      ┌──────▼──────┐
      │   Entregue  │
      └──────┬──────┘
             │ Financeiro confirma pagamento total (ou última parcela)
      ┌──────▼──────┐
      │     Pago    │ ← terminal
      └─────────────┘

Cancelado (terminal) ← pode ocorrer de Solicitado até Comprado (com restrições por perfil)
```

### Regras de transição

| De | Para | Quem pode | Observações |
|---|---|---|---|
| Solicitado | Ag. cotação | Comprador, Gestor, Supremo | Via claim — `runTransaction` obrigatório |
| Ag. cotação | Em aprovação | Comprador, Gestor, Supremo | Requer ao menos 1 cotação e 1 indicada |
| Em aprovação | Aprovado | Aprovador, Gestor, Supremo | `runTransaction` obrigatório — primeiro a aprovar vence |
| Em aprovação | Reprovado | Aprovador, Gestor, Supremo | Motivo obrigatório (lista + texto livre se "Outros") |
| Aprovado | Comprado | Comprador, Gestor, Supremo | Preencher fornecedor, valor final, condição, parcelas |
| Comprado | Entregue | Comprador, Solicitante, Gestor, Supremo | Data de entrega real |
| Entregue | Pago | Financeiro, Gestor, Supremo | Após confirmar última parcela ou pagamento único |
| Qualquer | Cancelado | Ver matriz de permissões | Motivo obrigatório |

### Aprovação simultânea — runTransaction obrigatório

```js
// pedido-detalhe.js
async function aprovarPedido(pedidoId, aprovadorId, motivo) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'pedidos', pedidoId)
    const snap = await transaction.get(ref)
    
    if (snap.data().status !== STATUS.EM_APROVACAO) {
      throw new Error('Pedido já foi processado por outro aprovador.')
    }
    
    transaction.update(ref, {
      status: STATUS.APROVADO,
      aprovadoPor: aprovadorId,
      aprovadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    })
  })
  // Cloud Function onStatusChange dispara notificações para os demais aprovadores
}
```

### Claim do comprador — runTransaction obrigatório

```js
async function assumirPedido(pedidoId, compradorId) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, 'pedidos', pedidoId)
    const snap = await transaction.get(ref)
    
    if (snap.data().compradorId !== null) {
      throw new Error('Pedido já foi assumido por outro comprador.')
    }
    
    transaction.update(ref, {
      compradorId,
      compradorAssumiuEm: serverTimestamp(),
      status: STATUS.AG_COTACAO,
      atualizadoEm: serverTimestamp(),
    })
  })
}
```

### SLA de claim

- Se nenhum comprador assumir em **48h** → Cloud Function notifica o Gestor
- Se pedido urgente sem claim em **4h** → Cloud Function notifica o Gestor
- Gestor/Supremo podem clicar em **"Liberar pedido"** no detalhe para remover claim e devolver à fila

---

## 8. Telas e Comportamentos

### 8.1 Login

**Estrutura (baseada no FlowTrack):**
- Logo `PR▲XIS` + tagline acima do card (fora do card)
- Card com fundo semi-transparente, estrelas visíveis por trás
- Campo E-mail
- Campo Senha + link "Esqueci a senha" (texto simples right-aligned abaixo do input)
- Botão **Entrar** (ouro gradient, glow + lift no hover)
- Separador "ou"
- Botão **Acessar modo demo** (ghost, borda dourada sutil, glow + lift no hover)
- Marca AFN SYSTEMS / by Alyssom Fernandes (separada por linha, centralizada)

**Views dentro do card:**
1. `login` — formulário padrão
2. `demo-lang` — escolha de idioma (PT/EN) com pills de bandeira antes de entrar no demo
3. `forgot` — campo de e-mail para reset
4. `sent` — confirmação de e-mail enviado com ícone de envelope

**Idiomas:** PT-BR e EN. A seleção de idioma ocorre apenas no fluxo de demo.

---

### 8.2 Pedidos — Tela principal

**Topbar em modo Pedidos:**
```
[PR▲XIS] [Pedidos ativo] [Relatórios]   [🔔] [☀/🌙] [⚙] [Avatar]
```

**Barra de ações:**
- Filtros pill: Todos · Urgentes · Meus pedidos · Esta semana
- Toggle kanban/lista (ícones SVG)
- Botão **+ Novo pedido** (ouro, canto direito)

**Modo Kanban:**
- 7 colunas: Solicitado · Ag. cotação · Em aprovação · Aprovado · Comprado · Entregue · Pago
- Colunas de estados terminais (Reprovado, Cancelado) ficam ocultas por padrão, acessíveis por filtro
- Cards com: título, empresa (badge), badge de urgência se aplicável, avatar do responsável, valor se disponível, badge de status das cotações
- Cards seguem o design system completo (glow de baixo, hover sobe + border acende)

**Modo Lista:**
- Tabela: Pedido · Empresa · Solicitante · Valor est. · Status · Data
- Ponto vermelho para urgentes
- Hover suave por linha (sem levantar o card)

**Modal Novo Pedido:**
- Largura: 680px
- Campos: Título · Empresa (select) · Quantidade · Unidade (select) · Necessário até (date) · Valor estimado (opcional) · Centro de custo (opcional) · Categoria (chips clicáveis) · Urgente (toggle com ícone raio SVG) · Observações (textarea opcional)
- Botões: Cancelar · **Abrir pedido** (ouro)

---

### 8.3 Detalhe do Pedido

**Layout:** Coluna única com cards empilhados (Layout C aprovado)

**Card 1 — Informações do pedido**
- Breadcrumb: Pedidos / #0042
- Badges de urgência e status
- Título grande
- Grid de metadados: Empresa · Quantidade · Categoria · Necessário até · Valor estimado · Centro de custo · Data da compra (quando aplicável)
- Descrição/observações em caixa de texto
- Divisor
- **Pessoas envolvidas** (4 colunas):
  - Solicitante — com status "Criou o pedido"
  - Comprador — com status "Cotações anexadas" ou "Aguardando" ou botão "Assumir"
  - Aprovadores — lista com status individual (aprovado com horário / aguardando)
  - Financeiro — com status

- **Ações contextuais** (canto superior direito, variam por status e perfil):
  - Solicitado: Cancelar (se próprio)
  - Ag. cotação: Liberar pedido (Gestor/Supremo)
  - Em aprovação: Aprovar · Reprovar
  - Aprovado: Executar compra
  - Comprado: Confirmar entrega
  - Entregue: Confirmar pagamento (Financeiro)

**Card 2 — Cotações**
- Glow azul
- Lista de cotações: ícone de arquivo (PDF/JPG), nome do fornecedor, sub (arquivo + tamanho), valor à direita, badge "Indicada" ou "Aguardando"
- Botão "Adicionar cotação" (apenas para Comprador no estado correto)

**Card 3 e 4 — Comentários e Histórico (lado a lado)**

Comentários:
- Avatar + nome + hora + texto
- @menção em dourado
- Input com ícone de mensagem, clipe (anexo) e enviar

Histórico:
- Timeline com ponto colorido por tipo de evento
- "Aprovado por Maria G." com badge verde
- "Movido para Ag. cotação por João C."

---

### 8.4 Relatórios / Dashboard

**Topbar em modo Relatórios:**
```
[PR▲XIS] [Pedidos] [Relatórios ativo]   [🔔] [☀/🌙] [⚙] [Avatar]
```

**Filtros:**
- Período: Mês · Trimestre · Ano · Livre (date picker)
- Empresa: Todas · [por empresa] (select)

**Layout dos cards:**

Linha 1 (grid 1.7fr + 3×1fr):
- Card destaque (ouro): Total gasto no período
- Card verde: Total de pedidos
- Card vermelho: Aguardando aprovação (com badge "X urgentes")
- Card dourado: Parcelas a vencer

Linha 2 (grid 1.4fr + 1fr + 1fr):
- Gráfico de barras: Gasto por empresa
- Lista C1: Parcelas a vencer (nome, parcela, valor, badge hoje/3 dias/ok)
- Lista C2: Status dos pedidos (dot colorido + barra + contagem)

**Export:**
- Botões Excel e PDF no canto superior direito do conteúdo
- Export respeita filtros ativos

**Visibilidade:**
- Gestor e Supremo: tudo
- Aprovador: sem relatórios financeiros consolidados
- Financeiro: parcelas, vencimentos, valores
- Comprador/Solicitante: sem acesso à tela de relatórios

---

### 8.5 Configurações

**Comportamento da topbar:**
- Clicar em ⚙ → Pedidos e Relatórios somem, entram seções de config na nav
- Nav config: `Usuários · Empresas · Categorias · Geral`
- Engrenagem vira X para fechar
- Sino e tema sempre visíveis

**Usuários:**
- Tabela: Avatar + nome + e-mail · Perfil (badge colorido) · Empresas (tags) · Último acesso · Status (dot verde/cinza) · Ações (editar/remover)
- Filtros: Todos · Ativos · Inativos
- Busca por nome
- Botão "Novo usuário" (ouro)
- Sem efeito hover de levantar no card tabela — highlight sutil por linha

**Empresas:**
- Grid de cards 3 colunas
- Cada card: ícone SVG · badge Ativa/Inativa · nome · CNPJ formatado · contadores (usuários, pedidos)
- Cards com hover glow padrão do sistema
- Botão "Nova empresa" (ouro)

**Categorias:**
- Tabela: bolinha colorida · nome · uso (N pedidos) · tipo (Padrão/Personalizada badge) · ações
- Botão "Nova categoria" com seletor de cor
- Padrão: 8 categorias iniciais (não podem ser removidas, apenas editadas)

**Fornecedores (dentro de Geral ou aba separada):**
- Lista simples de fornecedores criados automaticamente
- Permite editar nome e CNPJ
- Merge manual de duplicatas (Gestor/Supremo)

**Geral:**
- Preferências do sistema (a definir na implementação)

---

### 8.6 Notificações

**Dropdown:**
- Abre ao clicar no sino
- Badge vermelho com contagem de não lidas
- Header: "Notificações" + "Marcar todas como lidas"
- Items: ícone colorido (gold/red/green/blue) + texto + tempo + ponto dourado se não lida
- Footer: "Ver todas as notificações"
- Glow dourado de baixo no dropdown

---

## 9. Notificações

### 14 eventos definidos

| # | Evento | Destinatários | Canal |
|---|---|---|---|
| 1 | Pedido urgente aberto | Gestor + Aprovadores | In-app + e-mail |
| 2 | Pedido disponível para claim (Ag. cotação) | Compradores | In-app + e-mail |
| 3 | Comprador assumiu o pedido | Solicitante | In-app |
| 4 | Cotações prontas para aprovação | Aprovadores | In-app + e-mail |
| 5 | Pedido aprovado | Solicitante + Comprador | In-app + e-mail |
| 6 | Pedido reprovado (+ motivo) | Solicitante + Comprador | In-app + e-mail |
| 7 | Pedido cancelado | Todos os envolvidos | In-app + e-mail |
| 8 | Pedido comprado | Financeiro + Gestor | In-app + e-mail |
| 9 | Pedido entregue | Financeiro | In-app |
| 10 | Pedido entregue | Solicitante | In-app |
| 11 | Parcela vencendo em 3 dias | Financeiro + Gestor | In-app + e-mail |
| 12 | Parcela vencida | Financeiro + Gestor | In-app + e-mail |
| 13 | @menção em comentário | Usuário mencionado | In-app + e-mail |
| 14 | Pedido parado há 48h sem ação | Gestor | In-app + e-mail |

### Templates de e-mail

Todos os e-mails via Resend seguem o mesmo template base:
- Header com logo PR▲XIS
- Corpo com texto do evento
- Botão CTA "Ver pedido" apontando para `?tela=detalhe&id={pedidoId}`
- Footer com marca AFN SYSTEMS

---

## 10. Cloud Functions

### triggers.js — Eventos Firestore/Auth

**`onPedidoStatusChange`**
- Trigger: `onDocumentUpdated('pedidos/{pedidoId}')`
- Detecta mudança no campo `status`
- Consulta os destinatários corretos por evento
- Cria documentos em `/notificacoes/{userId}/items/`
- Chama `email.js` para envio quando aplicável
- Notifica aprovadores perdedores quando status muda de `em_aprovacao` para `aprovado`

**`setUserClaims`**
- Trigger: `onDocumentWritten('usuarios/{userId}')`
- Lê `perfil` e `empresas` do documento
- Seta Custom Claims no Firebase Auth via `admin.auth().setCustomUserClaims()`
- Necessário para que as Firestore Rules validem perfil server-side

### scheduled.js — Tarefas agendadas

**`checkClaimTimeout`**
- Schedule: `every 1 hours`
- Busca pedidos em `solicitado` há mais de 48h sem `compradorId`
- Busca pedidos urgentes em `solicitado` há mais de 4h sem `compradorId`
- Cria notificação para Gestores das empresas afetadas

**`checkParcelasVencendo`**
- Schedule: `every 24 hours` (executa às 8h)
- Busca parcelas com `vencimento` = hoje + 3 dias e `pago: false`
- Cria notificações evento 11 para Financeiro e Gestor

**`checkParcelasVencidas`**
- Schedule: `every 24 hours` (executa às 8h)
- Busca parcelas com `vencimento` < hoje e `pago: false`
- Cria notificações evento 12

**`demoReset`**
- Schedule: `every sunday 03:00`
- Deleta todos os documentos das coleções de demo (filtradas por `isDemo: true`)
- Re-executa seed a partir de `assets/demo/seed.json`

### email.js — Integração Resend

```js
// Função principal
async function sendEmail({ to, evento, pedido, usuario })

// Templates por evento — retornam { subject, html }
function templatePedidoUrgente(pedido)
function templateCotacoesProntas(pedido)
function templatePedidoAprovado(pedido)
// ... etc
```

---

## 11. Multiempresa

### Regras
- Cada pedido tem `empresaId` obrigatório
- Usuário só vê pedidos das empresas em `usuario.empresas[]`
- Queries sempre incluem filtro `where('empresaId', 'in', usuario.empresas)`
- Se `usuario.empresas.length > 10`, quebrar em múltiplas queries e unir resultados
- Custom Claims incluem array de empresas para validação server-side nas Rules

### Validação no Firestore Rules

```
function userHasAccessToCompany(empresaId) {
  return empresaId in request.auth.token.empresas;
}

match /pedidos/{pedidoId} {
  allow read: if userHasAccessToCompany(resource.data.empresaId);
  allow create: if userHasAccessToCompany(request.resource.data.empresaId);
}
```

---

## 12. Login e Autenticação

### Firebase Auth
- Método: E-mail + senha
- Custom Claims: `{ perfil: string, empresas: string[] }` — setados pela Cloud Function

### Fluxo de autenticação
1. Usuário acessa → `app.js` verifica `onAuthStateChanged`
2. Se não logado → renderiza tela de login
3. Se logado → lê documento `/usuarios/{uid}` → armazena em memória → renderiza tela inicial

### Esqueci a senha
- Texto simples right-aligned abaixo do campo senha
- Chama `sendPasswordResetEmail` do Firebase Auth
- View `forgot` → view `sent` com confirmação

### Proteção de rotas
- Qualquer `?tela=` sem autenticação → redireciona para login
- Perfil sem permissão para a tela → redireciona para `?tela=pedidos`

---

## 13. Modo Demo

### Comportamento
- Clicar em "Acessar modo demo" → view `demo-lang` com seleção PT/EN
- Clicar em "Continuar" → `auth.js` faz login com conta demo pré-criada no Firebase
- Usuário demo tem perfil **Gestor** com acesso a todas as empresas demo
- Todos os dados demo têm campo `isDemo: true`

### Dados fictícios (`seed.json`)
- 3 empresas fictícias
- 6 usuários com perfis diferentes
- 20+ pedidos em estados variados
- Cotações, comentários, parcelas, histórico
- Sem CNPJs ou dados reais

### Reset semanal
- Cloud Function `demoReset` apaga e recria toda semana (domingo 3h)
- Usuário demo não pode alterar dados de configuração (usuários, empresas, categorias)

---

## 14. Regras Técnicas Globais

### Sem nativos de UI
```js
// ERRADO
alert('Erro!')
confirm('Tem certeza?')

// CORRETO
await prxAlert('Erro ao salvar pedido.')
const ok = await prxConfirm('Deseja cancelar este pedido?')
```

### Sem strings mágicas
```js
// ERRADO
if (pedido.status === 'em_aprovacao') {}

// CORRETO
import { STATUS } from './constants.js'
if (pedido.status === STATUS.EM_APROVACAO) {}
```

### Sem IDs numéricos
```js
// ERRADO
const id = +doc.id
const id = parseInt(doc.id)

// CORRETO
const id = doc.id // sempre string
```

### Formatação de dados
```js
// utils.js
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value)
}

export function formatDate(dateStr) {
  // recebe YYYY-MM-DD, retorna DD/MM/YYYY
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}
```

### Tema
- Classe `dark` ou `light` no `<html>`
- Toggle salvo em `localStorage`
- Padrão: dark
- Função `toggleTheme()` em `ui.js`

### Spinner/Loading
- `mostrarSpinner()` e `esconderSpinner()` em `ui.js`
- Ativado em toda operação async de escrita no Firestore

### Tratamento de erro global
- Todo erro de Firestore/Auth capturado com `try/catch`
- Exibido via `prxToast(mensagem, 'error')`
- Erros de transação concorrente → mensagem específica: "Este pedido já foi [aprovado/assumido] por outro usuário."

---

## 15. O que não será implementado no MVP

| Funcionalidade | Motivo do descarte |
|---|---|
| Aprovação por alçada monetária | Adiciona complexidade de configuração. MVP+1 |
| Múltiplos perfis por usuário | Workaround com usuários duplicados suficiente no escopo |
| Substituto automático de aprovador | Edge case. Gestor reatribui manualmente |
| Gestão de contratos | Módulo separado, fora de escopo |
| Avaliação de fornecedores | Fora de escopo |
| Relatórios de savings | Requer histórico. MVP+1 |
| Bundler (Vite/Parcel) | Mudaria a stack. Projeto usa ES Modules nativos |
| Testes automatizados | Fora de escopo para MVP |
| Projetos Firebase separados por CNPJ | Overkill para 5 empresas |
| Número fiscal (NF-e) e conta bancária | Integração contábil futura |
| Integração com ERPs | Fora de escopo |
| App mobile nativo | Responsividade via CSS suficiente |

---

*Fim do documento. Versão 1.0 — Praxis Specification.*
