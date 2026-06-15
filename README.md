# Praxis

> Corporate procurement management — from request to payment, with quotes, approvals and full traceability.

**Live demo:** [praxis-af618.web.app](https://praxis-af618.web.app) — click *"Acessar modo demo"* on the login screen.

Praxis manages the complete lifecycle of a corporate purchase across multiple companies (CNPJs): an employee opens a request, a buyer claims it and attaches supplier quotes, an approver signs off, the buyer executes the purchase, delivery is confirmed and finance settles the installments. Every step is tracked, notified and auditable.

## Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5 + CSS3 + Vanilla JavaScript (native ES Modules, no bundler) |
| Database | Firebase Firestore |
| Auth | Firebase Auth with Custom Claims (role + companies validated server-side) |
| Backend | Firebase Cloud Functions (Node.js 22) |
| Storage | Firebase Storage (quotes, receipts, general attachments) |
| Hosting | Firebase Hosting |
| Export | jsPDF (PDF), native CSV with UTF-8 BOM (Excel-compatible) |
| Offline | Service Worker (cache-first for assets, network-first for CDN) |

No framework, no build step — the browser loads ES Modules directly. The entire UI is hand-built on a token-based design system (dark/light themes, CSS custom properties, inline SVG icons).

## Features

- **Kanban + list view** — drag & drop between status columns (HTML5 + touch), per-role transition rules, sortable list with filters and 20-per-page pagination
- **Bulk actions** — select multiple requests in list view, export as CSV (Excel-compatible) or cancel in bulk with motivo
- **Saved views** — save any filter + sort + view combination as a named pill; localStorage per user, max 8
- **Order workflow** with race-safe transitions — buyer claim and approval use Firestore `runTransaction`, so two simultaneous users can't both win
- **Quotes** — multiple supplier quotes per request, side-by-side comparison modal, savings indicator (highest quote minus selected)
- **Structured suppliers** — autocomplete against the supplier registry; new names are created and deduplicated automatically by normalized name
- **Approvals** with structured rejection reasons; rejected requests can be reopened with justification, creating a linked follow-up
- **Installments** — split payments with per-installment confirmation and receipt upload; last installment moves the request to Pago
- **General attachments** — attach PDFs, images, DOCX or XLSX to any request; visible in the unified activity feed
- **SLA timeline** — per-stage duration bar inside the request detail; bottleneck (longest stage) highlighted in gold
- **Role-based dashboard** — spend over time (line chart), spend by category (donut chart), total savings, upcoming installments; approvers see operational data only
- **PDF export** — individual request export as a formatted PDF with full history, quotes and installments
- **14 notification events** (in-app + e-mail) — claims, approvals, rejections, deliveries, due installments, @mentions, stale orders
- **Command palette** — Cmd/Ctrl+K for keyboard-driven navigation and actions
- **PWA** — installable from Chrome/Edge, service worker caches assets for offline access
- **Guided tour** — 5-step spotlight tour on first access, reactivatable from Settings → General
- **Multi-company isolation** — every query scoped to the user's companies, enforced in Firestore Rules via Custom Claims
- **Demo mode** — one-click login, 33-order seed, weekly auto-reset, welcome screen
- **Six roles** — Supremo, Gestor, Aprovador, Comprador, Financeiro, Solicitante — full permission matrix in [`docs/permissoes.md`](docs/permissoes.md)

## Architecture

```
index.html            single entry point — loads js/app.js as an ES Module
css/                  tokens → base → components → views → themes (cascade order)
js/
  app.js              auth state, ?tela= routing, topbar/footer shells
  firebase.js         Firebase init + re-exported SDK functions
  constants.js        STATUS, PERFIS, events, kanban columns — no magic strings
  pedidos.js          kanban/list, bulk actions, saved views, drag & drop
  pedido-detalhe.js   detail: workflow, quotes, comments, attachments, SLA timeline
  relatorios.js       dashboard, line/donut charts, PDF export
  config-*.js         settings: users, companies, categories, suppliers
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
