---
title: "Infrastructure overview"
last-updated: 2026-06-04
owner: angelo
status: live
---

# Infrastructure overview

Single map of every external thing Vio depends on: GitHub, hosting, databases, third-party APIs, secrets locations. Update when something changes.

> **Secrets are NOT in this doc.** Only locations and rotation policy. Real values live in `.env` files (local), Cloudflare/Replit secrets (deployed), or 1Password (when we move there).

---

## GitHub

| Org | Repos | Purpose | Visibility |
|-----|-------|---------|------------|
| `vio-live` | `VioSwiftSDK`, `InteractiveAds-vio`, `vio-handbook` | iOS SDK, Apple TV SDK, this engineering handbook | All private |
| `tipiodevelopment` | `socket-server` | Backend + dashboard | Private |

**Access policy**: Angelo is admin on both orgs. AI agents (Claude) get repo-level invites with `Write` role per repo as needed. New human devs join the relevant org with `Member` role first, then per-repo write.

**Branch policies**:
- `socket-server` → `develop` is the default + deploy branch. No `main`.
- `VioSwiftSDK` → `develop` for active work. `main` is **release tags only** (partners pin to it). Never PR to `main`. See [ADR-0002](../decisions/0002-vioswiftsdk-never-main.md).
- `InteractiveAds-vio` → `main` is canon (no `develop`).
- `vio-handbook` → `main` is canon.

---

## Database — Azure PostgreSQL (api-vio)

> **Neon fue eliminado el 2026-06-02.** El backend usa Azure PostgreSQL Flexible Server en todos los entornos.

Tres servidores independientes, todos en VNet privada (sin acceso público). El driver es `pg` estándar en todos los entornos.

| Entorno | Host | SKU | RG |
|---------|------|-----|----|
| local | `localhost:5432` (Docker) | — | — |
| development | `pg-api-vio-development.postgres.database.azure.com` | B_Standard_B1ms | `rg-api-vio-development` |
| staging | `pg-api-vio-staging.postgres.database.azure.com` | B_Standard_B1ms | `rg-api-vio-staging` |
| production | `pg-api-vio-production.postgres.database.azure.com` | GP_Standard_D2s_v3 | `rg-api-vio-production` |

**Local**: `docker compose up -d` levanta PostgreSQL 16 en `localhost:5432`. `DATABASE_URL=postgresql://pgadmin:localpass@localhost:5432/socket_server`.

**Cloud**: `DATABASE_URL` inyectado como secreto en el Container App por Terraform. Sin acceso desde fuera de la VNet — operaciones de mantenimiento via Container App Job.

**Schema**: Drizzle ORM en `socket-server/shared/schema.ts`. Migraciones en `socket-server/migrations/`. Se aplican automáticamente al arrancar el contenedor.

Ver [`playbooks/socket-server-db.md`](../playbooks/socket-server-db.md) para snapshots, restores y scheduler.

---

## Deployed services

| URL | What | Source | Notes |
|-----|------|--------|-------|
| `https://api-dev.vio.live` | Backend (REST + WS) — development env | `socket-server/main` → `ca-api-vio-development` | Push a `main` autodeploya aquí. iOS demos apuntan aquí por defecto. |
| `wss://api-dev.vio.live` | WebSocket for cart_intent + placement events | Same as above | Used by SDK after `discoverCampaigns` |
| `https://api-staging.vio.live` | Backend — staging env (demo 24/7) | `workflow_dispatch` → `ca-api-vio-staging` | Snapshot `angelo-sepulveda-2026-06-03-1725.sql` restaurado. `vio-demo.vercel.app` apunta aquí. |
| `https://api.vio.live` | Backend — production | `workflow_dispatch` → `ca-api-vio-production` | Mismo código que staging/dev. Cutover de tráfico real pendiente. |
| `https://graph-ql-dev.vio.live` | Reachu Commerce GraphQL (dev) | Reachu (third-party) | Per-sponsor `Authorization` header. Cart, checkout, payment ops. |
| `https://graph-ql.vio.live` | Reachu Commerce GraphQL (prod) | Reachu | Not used yet — production cutover pending. |
| `https://api-local-angelo.vio.live` | Cloudflare tunnel to Angelo's local backend | Local dev | Per-machine. See "Tunnels" below. |
| `https://viopartnermockv2.azurewebsites.net` | Partner webhook mock | Vio infra | Receives outbound webhooks (cart_intent forwards to partner). |

---

## Cloudflare tunnels

`api-local-angelo.vio.live` exposes Angelo's local backend (`localhost:5001`) so iOS demos can hit it during development.

- Configured per-machine via `cloudflared` daemon.
- Not part of CI. Not part of partner setup.
- Goes down when Angelo's mac sleeps. iOS demos fall back to `api-dev.vio.live` if that's their config.

If a new dev wants their own tunnel: provision their subdomain (`api-local-<name>.vio.live`) on the Cloudflare side and they run `cloudflared` locally.

---

## Apple Developer

| Item | Value | Where it's used |
|------|-------|-----------------|
| Team ID | `U4R2B2U7E6` | All iOS demo targets in `VioSwiftSDK/Demo/*/.xcodeproj` build settings |
| Bundle IDs | `viodev.<host>` (e.g. `viodev.tv2demo`, `viodev.Vg`) | Per-host demo Info.plist |
| Apple Pay merchant identifier | `merchant.live.vio` (live) + `merchant.vio.development` (dev) | Per-host `*.entitlements`. Whitelisted on each sponsor's Stripe Connect account in Reachu commerce. |

Adding a new merchant id: Apple Developer Portal → Identifiers → Merchant IDs → register → list it in the host's `.entitlements` and in Xcode's Signing & Capabilities → ask Reachu to whitelist it on every sponsor's Stripe Connect.

---

## Third-party services

### Reachu Commerce

Storefront platform. Each sponsor has a "channel" with its own:
- Commerce API key (used as `Authorization` for GraphQL)
- Stripe Connect account
- Product catalog
- Markets (NO/NOK is the standard)

The key + channel are provisioned by Reachu (not self-service from our dashboard yet). We store the key in `sponsors.commerce_api_key`. See [`lessons/stripe-connect-per-sponsor.md`](../lessons/stripe-connect-per-sponsor.md).

### Stripe (via Stripe Connect)

Per-sponsor accounts, linked to each Reachu commerce channel. Apple Pay charges are routed to the sponsor's Stripe account so money lands on the sponsor's books.

### Apple Push Notification Service (APNs)

Used by `cart_intent` flow when the user's iOS app isn't open or actively connected via WS. Backend pushes via the campaign's `client_app` APNs cert.

### Azure Blob Storage

`containerqa2.blob.core.windows.net/vio/uploads/` — sponsor logos, campaign images, advertorial assets uploaded via the dashboard.

### Mixpanel

Analytics. Token in `vio-config.json` per host. EU endpoint (`api-eu.mixpanel.com`).

### Vev CDN

`cdn.vev.design/cdn-cgi/image/...` — the Maxbo/Schibsted advertorial image hosting platform. Used by the VG advertorial as direct AsyncImage URLs.

---

## Secrets locations (NOT the values — just where)

| Kind of secret | Where it lives |
|----------------|----------------|
| Backend `DATABASE_URL`, Reachu commerce URL, partner mock URL | `socket-server/.env` (local), Replit secrets (when deployed) |
| iOS host `apiKey` per demo | `Demo/<host>/<host>/Configuration/vio-config.json` (committed — these are public client app keys, not secrets) |
| Sponsor `commerce_api_key` | `sponsors.commerce_api_key` column on Neon develop branch (write-restricted) |
| Apple Developer signing identity | Angelo's Mac keychain (per-developer; not shared) |
| Apple Pay merchant cert | Reachu side, attached to each Stripe Connect account |
| Mixpanel project token | `vio-config.json` per host (semi-public, fine to commit) |
| Cloudflare tunnel credentials | Per-developer `~/.cloudflared/` |

**Rotation policy**: ad-hoc today. When we onboard a real partner, add a rotation runbook to `playbooks/`.

---

## Bus factor map (who knows what)

| System | Primary | Backup | Notes |
|--------|---------|--------|-------|
| Backend + dashboard | Angelo | — | Sole maintainer today. Adding Alan later. |
| iOS SDK | Angelo + AI agent | — | Specialized agent definition lives in `VioSwiftSDK/.claude/agents/swift-sdk-engineer.md`. |
| Apple TV SDK | Angelo | — | Cherry-pick scope. |
| Kotlin SDKs | Alan | Angelo (specs in `socket-server/docs/KOTLIN_*_SDK_SPEC.md`) | Specs are the contract; Alan implements. |
| Neon / DB | Angelo | — | |
| Reachu integration | Reachu (external) + Angelo | — | Sponsor onboarding requires Reachu side. |
| Apple Developer setup | Angelo | — | |

**Action when bus factor = 1**: write a playbook in `playbooks/` documenting how to do the thing. Recurring action item.

---

## See also

- [`docs/architecture/system-overview.md`](../architecture/system-overview.md) — how the pieces talk to each other.
- [`docs/playbooks/debug-apple-pay-flow.md`](../playbooks/debug-apple-pay-flow.md) — uses several of these services in concert.
- `socket-server/docs/CURRENT_STATE.md` — sprint-level live state.
