# TradeFlow — B2B Distribution & Sales Portal (web client)

> **From Customer Request to Fulfillment.**
> React 19 + TypeScript single-page application for the TradeFlow portal. All data, authentication and
> authorization come from the **TradeFlow API** (`../backend`). The browser holds no business data beyond
> the current session view, and every permission check in the UI is repeated on the server.

## Requirements

- Node.js 20+
- A running TradeFlow API (see `../backend/README.md`) — by default on `http://localhost:5180`

## Configuration

Copy `.env.example` to `.env.local` and adjust:

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | browser bundle (build time) | Base URL of the API. Default `/api/v1` (same origin). For a separate API host use its absolute URL, e.g. `https://api.example.com/api/v1`, and add the SPA origin to the API's `Cors:AllowedOrigins`. |
| `TRADEFLOW_API_PROXY_TARGET` | Vite dev server only | Where `npm run dev` proxies `/api` requests. Default `http://localhost:5180`. |

No API URL, key or credential is hard-coded in the source.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to the API)
npm run build      # type-check (tsc -b) + production build to dist/
npm run preview    # serve the production build locally
npm run lint       # oxlint
npm test           # Vitest: API client (token refresh, error mapping) + UI workflow helpers
```

Deploy `dist/` behind any static web server. Configure the server to return `index.html` for unknown
paths (client-side routing) and, preferably, to serve the SPA and `/api` from the same site so the
refresh-token cookie can stay `SameSite=Strict`.

## How the client talks to the API

| Concern | Implementation |
|---|---|
| HTTP client | `src/services/api/client.ts` — `fetch` wrapper, ProblemDetails → `ApiError`, `X-TradeFlow-Client` CSRF guard header, credentialed requests |
| Access token | Kept **in memory only** (never in localStorage). Sent as `Authorization: Bearer …` |
| Refresh token | HttpOnly, Secure cookie set by the API on `/api/v1/auth`. JavaScript cannot read it |
| 401 handling | One shared ("single-flight") call to `POST /auth/refresh`, then the original request is retried once. If refresh fails the session-expired handler signs the user out and returns them to `/login?next=…` |
| 403 handling | Shown as "You do not have permission…"; collections the user may not read are left empty rather than breaking the page |
| Session restore | On load the app calls `/auth/refresh` → `/auth/me`; a page refresh keeps the user signed in while the refresh cookie is valid |
| Data | `src/app/store.tsx` loads collections from the API, refreshes them after each action, every 60 s and when the window regains focus. Actions are async and return `{ ok, error }` |
| SAP data | `src/services/api/http.ts` (`/sap/...` endpoints). Each response carries `mode` (`mock`/`live`) and the UI labels its source |
| Files | Uploaded as `multipart/form-data`; downloads stream from `/documents/{id}/content` with the bearer token |
| Idempotency | Sales-request submission sends an `Idempotency-Key` header generated once per wizard, so a double click or retry never creates a second request |

`src/services/contracts.ts` still defines the service interfaces; `src/services/index.ts` binds them to the
HTTP implementation.

## Project structure

```
src/
  app/            router.tsx (lazy routes + guards), store.tsx (API-backed state, session, async actions)
  auth/           permissions.ts, roles.ts, authorize.ts (UI shaping only — the API is authoritative),
                  guards.tsx, passwordPolicy.ts (hint mirroring the server policy)
  services/       api/client.ts (HTTP + tokens), api/http.ts (service implementation), contracts.ts, index.ts
  data/           reference.ts (live reference registry filled from GET /reference), config.ts (UI defaults)
  workflow/       onboarding/approval helpers used for display (the server computes allowed actions)
  components/     layout, ui, forms, data-display, sap, orders, applications, customers
  pages/          public · dashboard · workspace · applications · customers · catalog · orders · approvals ·
                  finance · logistics · sap · communications · administration
  test/           Vitest suites and test-only fixtures
```

## Demo environment

When the API runs with `Demo:Enabled=true` (never allowed in Production), the sign-in page lists the seeded
demo accounts (e-mail addresses only). The demo password is **not** part of the client — it is the value the
API administrator configured in `Demo:Password`. Administrators can restore the demo data set from the
profile menu (*Reset demo data*). The SAP development simulator (Administration › Integration Monitor) is
available only when the API runs with `Sap:Mode=Mock` and the user holds `integration.retry`.

## Screens

Public: landing page · sign-in · forgot / reset password · customer registration · track application.
Workspace: permission-composed overview · my tasks · notifications · change password.
Customer portal: my profile · my applications · sales orders · deliveries with goods-received confirmation ·
SAP invoices, outstanding, aging, ledger and payments · payment advice · proforma requests.
Sales: catalogue with customer-specific price and availability · request wizard · requests · approvals.
Customer management: customers · visits & activities · territory performance.
Onboarding: applications dashboard · application detail with workflow actions, comments, revisions.
Fulfilment: shipments · collection readiness · documents. Communication: e-mail · follow-ups.
Administration: users · roles & permissions · authorization matrix · territories · workflow rules ·
integration monitor (+ SAP simulator in mock mode) · audit trail.

## Known limitations

- Taxes are not calculated by the portal; totals exclude tax and freight (shown as such). The SAP billing
  document is authoritative.
- Products without an uploaded image show a labelled illustration.
- No i18n / RTL.
- Earlier prototype documentation (browser-only mock behaviour) is kept for reference in
  `docs/prototype-history/`; it no longer describes how the application works.
