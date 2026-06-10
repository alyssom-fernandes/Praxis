# Praxis

> Corporate procurement management — from request to payment, with quotes, approvals and full traceability.

**Live demo:** [praxis-af618.web.app](https://praxis-af618.web.app) — click *"Acessar modo demo"* on the login screen (PT/EN available).

Praxis manages the complete lifecycle of a corporate purchase across multiple companies (CNPJs): an employee opens a request, a buyer claims it and attaches supplier quotes, an approver signs off, the buyer executes the purchase, delivery is confirmed and finance settles the installments. Every step is tracked, notified and auditable.

## Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JavaScript (native ES Modules, no bundler) |
| Database | Firebase Firestore |
| Auth | Firebase Auth with Custom Claims (role + companies validated server-side) |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Storage | Firebase Storage (quote files, payment receipts) |
| Hosting | Firebase Hosting |
| Export | SheetJS (Excel), jsPDF (PDF) |

No framework, no build step — the browser loads ES Modules directly. The entire UI is hand-built on a token-based design system (dark/light themes, CSS custom properties, inline SVG icons).

## Features

- **Kanban + list view** of orders across 7 workflow states, with filters (urgent, mine, this week)
- **Order workflow** with race-safe transitions — buyer claim and approval use Firestore `runTransaction`, so two simultaneous approvers can't both win
- **Quotes** — buyers attach supplier quotes (file upload, value, delivery time, commercial terms) and flag the preferred one
- **Structured suppliers** — autocomplete against the supplier registry; new names are created automatically and deduplicated by normalized name
- **Approvals** with structured rejection reasons; cancellation rules vary by role and state
- **Installments** — finance registers payment installments, attaches receipts and confirms payments; overdue and upcoming installments are surfaced on the dashboard
- **Role-based dashboard** — totals, spend per company, order status, upcoming installments; approvers see operational data only, never consolidated financials
- **Excel / PDF export** respecting the active filters
- **14 notification events** (in-app + e-mail) driven by Cloud Function triggers — claims, approvals, rejections, deliveries, due installments, @mentions, stale orders
- **Multi-company isolation** — every query is scoped to the user's companies, enforced both client-side and in Firestore Rules via Custom Claims
- **Demo mode** — one-click demo login (PT/EN) over a rich seeded dataset (33 orders with history, quotes, comments and installments), reset weekly by a scheduled function
- **Six roles** — Supremo, Gestor, Aprovador, Comprador, Financeiro, Solicitante — with a full permission matrix
- **Responsive** — mobile layout with horizontal kanban scroll, tables that collapse into cards and bottom-sheet modals

## Architecture

```
index.html            single entry point — loads js/app.js as an ES Module
css/                  tokens → base → components → views → themes (cascade order)
js/
  app.js              auth state, ?tela= routing, topbar/footer shells
  firebase.js         Firebase init + re-exported SDK functions
  constants.js        STATUS, PERFIS, events, kanban columns — no magic strings
  pedidos.js          kanban/list of orders + buyer claim
  pedido-detalhe.js   order detail: workflow actions, quotes, comments, installments
  relatorios.js       dashboard, charts, Excel/PDF export
  config-*.js         settings: users, registries (companies/categories/suppliers), system
functions/
  src/triggers.js     Firestore triggers — status-change notifications, custom claims
  src/scheduled.js    cron jobs — claim SLA, due installments, weekly demo reset
  seed.json           canonical demo dataset (33 orders, suppliers, companies)
```

Routing is a simple `?tela=` query parameter handled by `app.js`. State transitions that could race (claim, approval) go through `runTransaction`; everything else is plain Firestore writes guarded by a permission matrix mirrored in `firestore.rules`.

## Running locally

```bash
# 1. Clone and configure Firebase credentials
cp js/config.example.js js/config.js   # then fill in your Firebase project keys

# 2. Install function dependencies
cd functions && npm install && cd ..

# 3. Serve (any static server works — no build step)
firebase serve --only hosting
# or: npx http-server .

# 4. Deploy
firebase deploy
```

You'll need a Firebase project with Firestore, Auth (e-mail/password), Storage and Cloud Functions enabled. `firestore.rules` and `firestore.indexes.json` ship with the repo.

## Documentation

- [`docs/arquitetura.md`](docs/arquitetura.md) — technical decisions and data model
- [`docs/fluxo-pedidos.md`](docs/fluxo-pedidos.md) — order state machine and transition rules
- [`docs/permissoes.md`](docs/permissoes.md) — role permission matrix

---

**AFN SYSTEMS** · by Alyssom Fernandes
