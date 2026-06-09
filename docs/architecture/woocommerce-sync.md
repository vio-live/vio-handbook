---
title: "Vio WooCommerce Sync — architecture, structure & status"
last-updated: 2026-06-09
owner: angelo
status: live
---

# Vio WooCommerce Sync (`vio-woocommerce-sync`)

> Single source of truth for the **WooCommerce → Vio** product-sync plugin: what it is,
> how it's built, the dev environment it runs in, the current end-to-end state, and the
> **one thing that blocks it** (the backend must write the `product-id` back). New area as of
> 2026-06-09. For the iOS/Kotlin/Web SDKs and the platform as a whole, see
> [`system-overview`](./system-overview.md).

## TL;DR

- **What:** a **WordPress/WooCommerce plugin** that syncs a merchant's WooCommerce
  catalog (products, variants, prices, stock, images) into the Vio commerce platform.
  It is a **ground-up rewrite of the old `Reachu Export` plugin (v3.8)** rebranded to Vio.
- **State:** **v1.0.0**, code complete and merged to `main`. The **connection flow works
  end-to-end** in the dev store (Connect → REST key + order webhooks, currency loads,
  connection auto-detected). Products **queue correctly** into the backend, **but the column
  stays on "Sent"** — see [the blocker](#-the-blocker-the-product-id-never-comes-back).
- **License:** GPL-2.0-or-later (WordPress plugin convention).
- **Backend today:** the **Reachu** commerce REST API (`api.reachu.io` / `api-qa.reachu.io`).
  Designed to flip to Vio's own domain (`api-commerce.vio.live`) with **zero code change**.

## The two repos & how they relate

| Repo | Vis. | What | State (2026-06-09) |
|---|---|---|---|
| **`vio-live/vio-woocommerce-sync`** | private | the plugin itself (local clone: `/Users/angelo/Documents/GitHub/vio-woocommerce-sync`) | `main` @ `a3c01c6` — everything merged; history scrubbed of AI attribution |
| **`vio-live/woo-vio`** | private | the **dev environment** — `@wordpress/env` (WordPress + WooCommerce in Docker) that mounts and runs the plugin (local clone: `/Users/angelo/Documents/GitHub/woo-vio`) | `main` @ `b8bb02b` — pushed |

`woo-vio` is **only the harness**: it stands up WordPress + WooCommerce locally and mounts
the plugin (`../vio-woocommerce-sync`, relative path in `.wp-env.json`) so you can develop
and test in a live store. The shippable artifact is **`vio-woocommerce-sync`**.

> Both repos were moved from the personal `angelosv` account into the **`vio-live`** org.
> They are **still private** — making `vio-woocommerce-sync` public is a pending step (the
> history is already clean of AI attribution for that).

## ⛔ The blocker: the `product-id` never comes back

This is the single thing keeping the plugin from being "done". **Read this first.**

**How a sync is meant to work:**

1. User selects products → **Vio Sync** bulk action → `Sync::push_products()`.
2. Plugin `POST`s the batch to **`/api/products/create-sqs`** (an async queue). The API
   returns a **`messageId`**, which the plugin stores per product as meta **`vio-sqs-id`**.
   → the product column now shows **"Sent"**.
3. The **backend** dequeues the job, creates the product in Vio (confirmed: *it does* create
   them), and **must write the new Vio `product-id` back into the store** (meta
   **`vio-product-id`**, via the REST API key the plugin created on connect).
4. Once `vio-product-id` is set → the column flips to the **Synced** icon, and auto-update on
   save / delete-from-Vio start working (they look the product up by that id).

**What actually happens:** step 3 never lands a `product-id`, so every synced product is stuck
on **"Sent"** forever, and everything keyed on the remote id (auto-update, true remote delete)
can't act.

**Why the plugin can't paper over it:** I probed ~12 endpoints — the Reachu API exposes **no
filter** by `originId` / `sku` / `search`; `GET /api/products` returns the full ~9,353-product
catalog unfiltered. So the plugin **cannot poll** for "the product I just queued". The
write-back has to come from the backend.

**Handoff — what the backend (Alan / Miguel) needs to do.** Either:

- **(preferred)** after creating the product, **write the Vio `product-id` back** to the store
  via the WooCommerce REST API → meta `vio-product-id` on the matching post; **or**
- **expose a filter endpoint**, e.g. `GET /api/products?origin=WOOCOMMERCE&originId={postId}`,
  so the plugin can resolve the id itself.
- **Bonus:** the backend currently names the order webhooks **"Outshifter order.created/updated"**.
  Rename to **"Vio …"**. *Not blocking* — the plugin detects the connection by the delivery-URL
  host, not the name (see [Connection flow](#connection-flow)).

## Plugin structure

```
vio-woocommerce-sync/
├── vio-woocommerce-sync.php   # Bootstrap: header, constants, HPOS declare, requires, lifecycle hooks
├── includes/
│   ├── class-plugin.php          # Orchestrator: central constants (option/meta keys), init, activate/deactivate, cleanup
│   ├── class-api-client.php      # HTTP client: environment resolution, auth, one method per endpoint
│   ├── class-product-mapper.php  # WC_Product → Vio DTO  +  diffing (variants/images/price)
│   ├── class-sync.php            # Service: push (export) / update / delete-unlink
│   ├── class-settings.php        # WooCommerce settings tab (API key, environment, currency, connect/connected)
│   ├── class-products-table.php  # Product-list column, bulk actions, auto-sync on save/trash/delete
│   ├── class-ajax.php            # AJAX handlers (nonce + capability, NO wp_ajax_nopriv)
│   └── class-logger.php          # Wrapper over the WooCommerce logger
├── assets/{js,css,img}/          # products.js, settings.js, admin.css, icon.svg (placeholder)
├── readme.txt  ·  docs/CODE-AUDIT.md  ·  languages/
```

Namespace `Vio\WooSync`; class-per-file loaded by explicit `require_once` in the bootstrap
(no Composer — the old plugin's 5.9 MB `vendor/` was dead code and was dropped).

## Architecture (responsibilities)

- **`Plugin`** — central constants (`vio_*` options, `vio-*` meta keys, capability
  `manage_woocommerce`, webhook names), `init()` (guards WooCommerce active, loads textdomain,
  boots Settings/Products_Table/Ajax), and lifecycle (activate/deactivate + `cleanup()` that
  removes Vio webhooks & REST API keys — matched by managed name **or** by a delivery URL
  pointing at the configured backend host, so the backend-named "Outshifter" hooks are caught).
- **`Api_Client`** — environment-aware HTTP. See [Environments](#environments-prod--staging).
- **`Product_Mapper`** — `to_dto()` builds the product payload (images, variants, options,
  price/compareAt, inventory); `diff()` computes only the changed fields before an update;
  `get_remote_product_id()` reads the `vio-product-id` meta.
- **`Sync`** — business logic: `push_products()` (batch export via `create-sqs`),
  `update_product()` (auto-sync on save, no-op until a `product-id` exists),
  `delete_by_post()` (unlink — see [Delete / unsync](#delete--unsync-semantics)).
- **`Settings`** — the WooCommerce → Settings → **Vio** tab. Disconnected: API key +
  environment + currency fields and a **Connect store** button. Connected: a green success
  notice (account / currency / "REST API key created · Order webhooks active") and a
  **Disconnect** action; the fields hide. See [Connection flow](#connection-flow).
- **`Products_Table`** — sync-status column (Synced icon / **"Sent"** / empty), **Vio Sync** /
  **Delete from Vio** bulk actions, and auto-sync hooks (`woocommerce_update_product`,
  `woocommerce_new_product`, `wp_trash_post`, `before_delete_post`).
- **`Ajax`** — `vio_sync`, `vio_delete`, `vio_finish_sync`, `vio_save_settings`, `vio_logout`;
  **every** handler checks a nonce + `current_user_can()`, and none registers a `nopriv` variant.

## Connection flow

**Connect store** (settings tab) runs WooCommerce's OAuth at `/wc-auth/v1/authorize` with a
callback at `…/woo/auth/callback-supplier/`. On success the backend creates, in the store:

- **1 REST API key** described `Vio WooCommerce Sync` (so `cleanup()` can find & revoke it), and
- **2 order webhooks** (`order.created`, `order.updated`) pointing at the backend. The backend
  currently **names them "Outshifter order.*"** — cosmetic only.

`Settings::webhook_exists()` treats the store as connected if **any** webhook matches a managed
name **or** has a delivery-URL host equal to the configured backend host — so the connection is
detected regardless of the "Outshifter" naming, and regardless of Reachu-vs-Vio host.

> **HTTPS is required** for the OAuth round-trip and webhook delivery. Locally that's provided
> by the Cloudflare tunnel — see [Dev environment](#dev-environment-woo-vio--gotchas).

## Delete / unsync semantics

Refactored 2026-06-09 (`a3c01c6`) into one coherent path. `Sync::delete_by_post( $post_id,
$apiKey, bool $deleteRemote = true )`:

- deletes the **remote** product **only when its `vio-product-id` is known** and `$deleteRemote`;
- **always clears the local sync meta** (`vio-product-id`, `vio-sqs-id`, `vio-apikey`, `vio-uid`),
  so a **"Sent"-only** product (no remote id yet) can still be fully unlinked locally.

Call sites:

- **"Delete from Vio"** bulk action (`Ajax::delete`) — unlinks **every** selected post locally
  (incl. "Sent"-only) and batch-deletes the **known** remote ids in one `DELETE /api/products?ids=`.
- **Trash** (`wp_trash_post`) — unlinks from Vio but **keeps attachments**, so a trashed product
  can be restored.
- **Permanent delete** (`before_delete_post`) — unlinks from Vio and, for products **imported
  from Vio** (`vio-origin`), drops the Vio-owned images.

**Consequence of the blocker:** for "Sent"-only products, "Delete from Vio" clears the **local**
link but **cannot delete them in Vio** (their id is unknown). Once the backend writes
`product-id` back, remote deletion covers those too — no plugin change needed.

## Environments (prod / staging)

URLs are centralized and overridable so flipping from Reachu to Vio is frictionless.
`Api_Client::base_url()` resolves in cascade:

1. **Per-environment constant** in `wp-config.php` (zero code change):
   `define( 'VIO_WC_SYNC_API_URL_PRODUCTION', 'https://api-commerce.vio.live' );`
2. The `Api_Client::ENVIRONMENTS` map (one-line edit).
3. The `vio_wc_sync_api_base` filter.

| Environment | URL today (Reachu) |
|---|---|
| `production` (default) | `https://api.reachu.io` |
| `staging` | `https://api-qa.reachu.io` |

Active environment is chosen by: constant `VIO_WC_SYNC_ENV` → the `vio_environment` option
(selector in the settings tab) → default `production`.

> During this session **prod (`api.reachu.io`) was down** (HTTP 000), which is why the dev store
> runs against **staging** (`api-qa.reachu.io`) — that's where the currency list and connect flow
> were verified.

**Endpoints** (shared with the Reachu platform; confirmed identical for Vio):
`/api/products` (GET/PUT/DELETE + `create-sqs` POST + `?ids=` batch delete), `/api/currencies`,
`/catalog/users/me`, `/woo/config` (PUT), `/api/users/me/finish-sync` (PUT), plus WooCommerce
OAuth at `/wc-auth/v1/authorize` with callback `…/woo/auth/callback-supplier/`.

## Dev environment (`woo-vio`) — gotchas

- `@wordpress/env` + Docker. **`wp-env start` is unreliable** on recent Docker (29.x): it brings
  up only MySQL and aborts before WordPress. Workaround: `bin/bootstrap.sh` / `bin/dev.sh` drive
  `docker compose` directly against wp-env's generated config. Use `npm run setup` (first time,
  idempotent) then `npm start` / `npm stop`. Site: `http://localhost:8888` (admin / password).
- **HTTPS via Cloudflare tunnel** — the OAuth callback and webhooks need a public HTTPS origin.
  A **named** tunnel maps **`https://woo-dev.vio.live` → `localhost:8888`** (verified 200).
  Config: `~/.cloudflared/config-woo-dev-local.yml` (tunnel `f5bd2413…`). Two dev **mu-plugins**
  (in the wp-env WordPress volume, *not* in the repo) make it work behind the tunnel:
  `zzz-tunnel-proxy.php` (honor `X-Forwarded-Proto` so WP knows it's HTTPS) and
  `zzz-dev-memory.php` (raise `memory_limit`). Quick/trycloudflare tunnels gave 404 from this
  env (no edge propagation); use the named tunnel.
- WooCommerce 10.9 auto-installs marketing plugins (jetpack, klaviyo, pinterest, paypal, …) that
  inflate memory; the memory mu-plugin + deactivating PayPal fixed an OOM.

## Status (2026-06-09)

- ✅ Full rewrite landed and **merged to `main`**: 8-class modular plugin, HPOS, i18n, security
  hardened (nonce + capability, no `nopriv`, output escaping, `$wpdb->prepare`).
- ✅ Environments wired (Reachu prod/staging) and verified dynamic.
- ✅ **Connection flow works end-to-end** in the dev store: Connect → 1 REST key + 2 order
  webhooks, currency list loads (staging), connection auto-detected, Disconnect cleans up.
- ✅ **Cloudflare tunnel** `woo-dev.vio.live` → 200 (HTTPS for OAuth + webhooks).
- ✅ Delete / unsync flow refactored to one coherent path; product column shows **"Sent"**
  (was an endless "Syncing…").
- ✅ `php -l` clean on all files; activates with no fatals.
- ⛔ **Blocked on the backend:** products queue but the `product-id` never returns, so they stay
  on "Sent". See [the blocker](#-the-blocker-the-product-id-never-comes-back) — **owned by Alan**.

## Tech debt / pendientes

1. **Backend `product-id` write-back** (or a filter endpoint) — *the* blocker; Alan/backend.
2. **Rename backend webhooks** "Outshifter → Vio" (cosmetic).
3. **Real backend domain** — flip to `api-commerce.vio.live` once Vio exposes it (one constant / one line).
4. **Make `vio-woocommerce-sync` public** — repo is in `vio-live` but still private; history is already clean.
5. **Brand assets** — `assets/img/` is a placeholder `icon.svg`; needs real Vio icons.
6. **Brand URLs** — signup/docs/legal links still point at `reachu.io` / `vio.live` placeholder.
7. **system-overview** — add this area to [`system-overview`](./system-overview.md).
8. **`woo-vio` commit history** still carries some `Co-Authored-By` trailers; left as-is (stays private).

## Decisions

- **Full modular rewrite**, not a patch of the 1196-line monolith — the original mixed concerns,
  embedded HTML/CSS in PHP, and had real security holes (see `docs/CODE-AUDIT.md` in the repo).
- **Plugin and dev-environment are separate repos** (`vio-woocommerce-sync` vs `woo-vio`).
- **Dropped `vendor/`** (5.9 MB, Google Cloud/Firebase/Guzzle/…) — statically dead (0 imports, 0 refs).
- **URLs dynamic, Reachu today** — flip to Vio without touching code (constant in wp-config).
- **Clean Vio naming** — `VIO_WC_SYNC_*`, options `vio_*`, meta `vio-*`, text-domain `vio-woocommerce-sync`.
- **Connection detected by delivery-URL host**, not webhook name — robust to the backend's
  "Outshifter" naming and to the Reachu→Vio host flip.
- **Commits carry no AI attribution** (rule 6). `vio-woocommerce-sync` history was rewritten +
  force-pushed to remove earlier `Co-Authored-By` trailers before going public.

## Links

- Code audit (in the repo): https://github.com/vio-live/vio-woocommerce-sync/blob/main/docs/CODE-AUDIT.md
- Session journals: [`2026-06-09 — woo`](../journal/2026-06/2026-06-09-woo.md) (bootstrap),
  [`2026-06-09 — woo-2`](../journal/2026-06/2026-06-09-woo-2.md) (connect + sync flow + handoff)
- Plugin repo: https://github.com/vio-live/vio-woocommerce-sync
- Dev-env repo: https://github.com/vio-live/woo-vio
