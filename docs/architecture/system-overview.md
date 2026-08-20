---
title: "System overview — 3 repos, how they fit"
last-updated: 2026-06-09
owner: angelo
status: live
---

# System overview

Vio is a multi-tenant SaaS that lets media partners (TV2, Viaplay, VG, etc.) embed real-time interactive engagement (polls, contests, shoppable ads, multi-sponsor commerce) into their consumer apps and Apple TV apps.

This doc maps the platform across the 3 repos, the data model, and the runtime flows. It's the map you need before reading any sprint doc.

---

## The 3 repos

```
┌──────────────────────────────────┐    ┌──────────────────────────────────┐
│  tipiodevelopment/socket-server  │    │      vio-live/VioSwiftSDK         │
│  ──────────────────────────────  │    │  ──────────────────────────────  │
│  Backend (Node + Express)        │    │  iOS SDK + host app demos        │
│  Dashboard (React, in client/)   │    │  Modules: VioCore, VioUI,        │
│  Drizzle ORM → Azure PostgreSQL  │    │           VioDesignSystem,       │
│                                  │    │           VioNetwork,            │
│  Endpoints:                      │    │           VioComplete            │
│  - /v2/mobile/* (iOS SDK)        │    │  Demos: Vg, Viaplay, tv2demo,    │
│  - /v2/tv/* (Apple TV SDK)       │    │         tv2demo-appletv (link)   │
│  - /v2/commerce/* (storefronts)  │    │                                  │
│  - /v2/admin/* (operator tools)  │    │  Branch policy: develop only.    │
│  - /api/* (dashboard, session)   │    │  main = release tags only.       │
│                                  │    │                                  │
│  Branch policy: main is deploy.  │    └──────────────────────────────────┘
│  Deploy: api-dev.vio.live        │                  │
│                                  │                  │ (consumes)
│  Drift gate: check:docs-drift    │                  │
└──────────────────────────────────┘                  │
              │                                       │
              │ (the SDKs talk to)                    │
              │                                       ▼
              │                    ┌──────────────────────────────────┐
              │                    │   vio-live/InteractiveAds-vio    │
              │                    │  ──────────────────────────────  │
              │                    │   Apple TV SDK (VioTV product)   │
              │                    │   tvOS demo                      │
              │                    │                                  │
              │                    │   Branch policy: main is canon.  │
              │                    └──────────────────────────────────┘
              │
              ▼
        Reachu Commerce GraphQL (graph-ql-dev.vio.live)
        Stripe / Klarna / Vipps / PayPal (per sponsor)
        Apple Push (push notifications)
        Cloudflare R2 / Azure Blob (media)
```

---

## Analytics (2026-08-20 — pieza transversal nueva)

Todas las superficies (web/Vev/Replit, iOS, tvOS, Android, Android TV) y el
propio backend (vía outbox) reportan eventos a un **colector independiente**
(`vio-live/vio-analytics` → `events-{dev,staging}.vio.live` / `events.vio.live`),
que guarda el crudo en **ClickHouse propio** (VM `vm-clickhouse-vio`) y
reenvía una copia opcional a Mixpanel. Los dashboards leen vía el proxy
`/api/analytics/vio/*` de este backend (authz de operador). Los SDKs jamás
hablan con vendors. Contrato cerrado v1: `vio-analytics/docs/EVENTS_CONTRACT.md`.

---

## Data model (the things to know)

The DB lives in Azure PostgreSQL Flexible Server (3 environments: production, staging, development). All in private VNet — no public access. See [`docs/infrastructure/overview.md`](../infrastructure/overview.md) for host names.

### Top-level tables

| Table | Role |
|---|---|
| `client_apps` | A "host app" — TV2, Viaplay, VG. Has an `api_key` the SDK uses to authenticate. |
| `campaigns` | A campaign for a client_app. Has a `primary_sponsor_id` and a many-to-many to sponsors via `campaign_sponsors`. |
| `sponsors` | The brand (Elkjøp, XXL, Maxbo, Weber). Each has a `commerce_api_key` for its Reachu Commerce channel and per-sponsor branding (logo, colors). |
| `campaign_sponsors` | Junction: which sponsors participate in which campaigns, with `role` (full / commerce / visual). |
| `broadcasts` | A live event (or evergreen container) inside a campaign. Has a `broadcast_id` (string) as PK. |
| `app_placements` | "Slot library" — what kinds of placements an operator can put on a client_app. Per-app, `location_id` + `component_id` (template slug). |
| `campaign_components` | Bound instance — "this campaign uses placement X with these productIds, this sponsor". The thing the SDK actually renders. |
| `app_component_locations` | The slot locations the SDK has declared via `POST /v2/mobile/components/manifest`. Operator dashboard reads this to know which slots a client_app exposes. |

### The placement system in 1 paragraph

A `client_app` declares slots (via `app_component_locations` which the SDK uploads at boot). Operators in the dashboard create `app_placements` (e.g. "Home — Top carousel" using `product-carousel-template`). For each campaign, operators bind a `campaign_component` to a placement (with productIds, sponsor, scheduling). At runtime, the SDK queries `/v2/mobile/campaigns/:id/components`, gets the active component instances, and renders them via `VProductCarousel(componentId:)` / `VProductStore(locationId:)` / etc.

### Multi-sponsor cart in 1 paragraph

A campaign can have multiple sponsors. Each sponsor has its own commerce key → its own Reachu cart. The iOS SDK keeps `cartsBySponsor: [Int: SponsorCart]` so adding a product to sponsor A's cart doesn't touch sponsor B's. Apple Pay routes through the per-sponsor SDK so the charge lands on the sponsor's Stripe Connect account. See ADR-0004 (per-sponsor commerce routing) and Q4 L3 sprint summary for the full design.

### Operator auth & permissions in 1 paragraph

Dashboard **operators** (distinct from SDK end-users) sign in with the **shared Commerce Firebase project** — one identity pool for both products; the backend verifies the ID token offline (no coupling to Commerce). Authorization is two axes: a **capability matrix** (`super_admin` / `admin` / `operator` / `viewer`) and **tenancy** — `admin` is a tenant root that owns its apps + sponsors; `operator`/`viewer` belong to an admin (`users.parent_admin_id`); `super_admin` is global. A single `/api` gate checks capability + session per request. This is a **separate layer** from SDK apiKey auth (`/v2`,`/v1`). See [ADR-0007](../decisions/0007-firebase-auth-single-idp.md) (IdP), [ADR-0008](../decisions/0008-operator-authorization-capabilities-tenancy.md) (authz model), and `socket-server/docs/AUTH_AND_PERMISSIONS.md` (implementation).

---

## Runtime flows (skim)

### Cold-start bootstrap (iOS SDK)

```
App launch
  → ConfigurationLoader.loadConfiguration()           (reads vio-config.json)
  → CampaignManager.shared.userId = "<user id>"      (host app sets)
  → <Host>PlacementRegistration.registerAll()        (declares slot locations)
  → on first View appear → discoverCampaigns()
    → GET /v2/mobile/config?apiKey=<host's apiKey>   (returns campaign + sponsors + commerce keys)
    → POST /v2/mobile/components/manifest            (uploads slot manifest)
    → GET /v2/mobile/campaigns/:id/components        (gets active component instances)
    → WS connect to wss://api-dev.vio.live/ws/<id>?userId=<user>
    → identify + subscribe(modules)
```

### Apple Pay flow (single product, single sponsor)

```
User taps Apple Pay button (VApplePayButton)
  → ApplePayManager.pay(product, sponsorId, cartManager)
    → cartManager.ensurePaymentRuntimeReady()
      → (skip bootstrap if already applied — see ADR-0006 / lesson ios26-deadlock)
      → ensureCartIDForCheckout()
    → cartManager.addProduct(product, sponsorId: sid)
      → sponsorSdk.cart.addItem(...)                 (Reachu commerce, sponsor's key)
    → cart.getById → createCheckout → applePayInit  (Reachu commerce)
    → Apple Pay sheet (PassKit) — user authorizes
    → Stripe tokenization
    → applePayConfirm                                (sponsor's Stripe Connect)
    → confirmation sheet (theme-driven via VioColors.adaptive)
```

### Cart-intent flow (Apple TV → mobile companion)

```
Apple TV dispatches a shoppable ad (POST /v2/tv/cart-intent)
  → backend resolves sponsor's commerce key per-sponsor (no global fallback)
  → push to APNs for the registered iOS device with the same userId
  → iOS SDK receives push or WS event → CartIntentEvent
  → host app shows overlay → user taps "Add to cart" → normal cart flow
```

---

## Where to dig deeper

| Topic | Doc |
|---|---|
| **Vio Web SDK** (Lit web components, npm `@vio-live/web-sdk`) | [`architecture/web-sdk.md`](./web-sdk.md) |
| **Vio Analytics** (colector propio + ClickHouse; TODOS los SDKs y el backend reportan ahí) | [`architecture/vio-analytics.md`](./vio-analytics.md) + [ADR-0009](../decisions/0009-analytics-independent-collector-closed-contract.md)/[0010](../decisions/0010-clickhouse-oss-self-hosted.md) + [playbook](../playbooks/operate-vio-analytics.md) |
| **Vio WooCommerce Sync** (WordPress plugin → catalog sync) | [`architecture/woocommerce-sync.md`](./woocommerce-sync.md) |
| Detailed API contract (every endpoint) | `socket-server/docs/API_V2_CONTRACT.md` |
| Schema (every table + columns) | `socket-server/docs/DB_AND_ENDPOINTS.md` |
| Multi-sponsor architecture (deep) | `socket-server/docs/multi-sponsor-architecture.md` |
| Placement system epic + status | `socket-server/docs/TASK_PLACEMENTS.md` |
| iOS runtime flow (request catalog, retry policy) | `VioSwiftSDK/Documentation/RUNTIME_*.md` |
| Operator-side authoring | `socket-server/docs/SHOPPABLE_AD_AUTHORING.md` |
| Operator auth, roles, capabilities, tenancy | [ADR-0007](../decisions/0007-firebase-auth-single-idp.md) + [ADR-0008](../decisions/0008-operator-authorization-capabilities-tenancy.md) + `socket-server/docs/AUTH_AND_PERMISSIONS.md` |
| What's the platform doing right now? | `socket-server/docs/CURRENT_STATE.md` |
