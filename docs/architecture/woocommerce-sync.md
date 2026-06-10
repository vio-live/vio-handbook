---
title: "Vio WooCommerce Sync — architecture, structure & status"
last-updated: 2026-06-10
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
- **State (2026-06-10):** **v1.0.0**, **public** and on `main` (`00bee82`). A **dedicated Vio admin
  page** (top-level menu) replaces the settings tab; the **connect/disconnect lifecycle works
  end-to-end** (one-step Connect → OAuth; disconnect tears down **both** sides — local *and* the
  backend credential). Products **now arrive** at the backend; the column flips to **Synced** once
  the backend writes the `product-id` back — see [the blocker](#-the-blocker-the-product-id-never-comes-back).
- **License:** GPL-2.0-or-later (WordPress plugin convention).
- **Backend today:** the **Reachu** commerce REST API (`api.reachu.io` / `api-qa.reachu.io`).
  Designed to flip to Vio's own domain (`api-commerce.vio.live`) with **zero code change**.

## The two repos & how they relate

| Repo | Vis. | What | State (2026-06-10) |
|---|---|---|---|
| **`vio-live/vio-woocommerce-sync`** | **public** | the plugin itself (local clone: `/Users/angelo/Documents/GitHub/vio-woocommerce-sync`) | `main` @ `00bee82` — public; history clean of AI attribution |
| **`vio-live/woo-vio`** | private | the **dev environment** — `@wordpress/env` (WordPress + WooCommerce in Docker) that mounts and runs the plugin (local clone: `/Users/angelo/Documents/GitHub/woo-vio`) | `main` @ `b8bb02b` — pushed |

`woo-vio` is **only the harness**: it stands up WordPress + WooCommerce locally and mounts
the plugin (`../vio-woocommerce-sync`, relative path in `.wp-env.json`) so you can develop
and test in a live store. The shippable artifact is **`vio-woocommerce-sync`**.

> Both repos live in the **`vio-live`** org. **`vio-woocommerce-sync` is now public** (2026-06-10;
> history audited — no secrets, no AI attribution). `woo-vio` (the dev harness) stays private.

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

**What actually happens (as of 2026-06-10):** products **now reach the backend**, but step 3 still
doesn't land a `product-id`, so the column stays on **"Sent"** and everything keyed on the remote id
(auto-update, true remote delete) can't act yet. **Alan owns this** (product sync + orders).

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
│   ├── class-api-client.php      # HTTP client: env resolution, auth, all paths in an EP_* constants block, find_woo_connection()
│   ├── class-product-mapper.php  # WC_Product → Vio DTO  +  diffing (variants/images/price)
│   ├── class-sync.php            # Service: push (export) / update / delete-unlink
│   ├── class-config-page.php     # Top-level "Vio" admin page (Connection / Settings / Sync overview / Logs) — render
│   ├── class-store-status.php    # Data/service layer: connection state, stats, eligible ids, save, diagnostics, logs, helpers
│   ├── class-products-table.php  # Product-list column, bulk actions, auto-sync on save/trash/delete
│   ├── class-ajax.php            # AJAX handlers (nonce + capability, NO wp_ajax_nopriv)
│   └── class-logger.php          # Wrapper over the WooCommerce logger (+ recent() for the Logs panel)
├── assets/{js,css,img}/          # config.{js,css} (the page), products.js, admin.css, icon.svg (placeholder)
├── tests/                        # PHPUnit integration suite (StoreStatusTest + bootstrap) · phpunit.xml.dist
├── readme.txt  ·  docs/{CODE-AUDIT,backend-integration}.md  ·  languages/
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
- **`Config_Page`** — the top-level **Vio** admin page (`admin.php?page=vio`): four sections —
  Connection, Settings, Sync overview, Logs. Render/presentation only; reads from `Store_Status`.
  (Replaced the old WooCommerce settings tab, removed 2026-06-10.)
- **`Store_Status`** — the page's data/service layer (no HTML): `connection_state()` /
  `health_payload()` / `connection_message()` (401-vs-network), `stats()`, `pending_product_ids()`,
  `save_options()`, diagnostics, logs, and the `webhook_exists()` / `currency_options()` helpers.
- **`Products_Table`** — sync-status column (Synced icon / **"Sent"** / empty), **Vio Sync** /
  **Delete from Vio** bulk actions, and auto-sync hooks (`woocommerce_update_product`,
  `woocommerce_new_product`, `wp_trash_post`, `before_delete_post`).
- **`Ajax`** — `vio_connect`, `vio_save_config`, `vio_health`, `vio_stats`, `vio_pending_ids`,
  `vio_logs`, `vio_sync`, `vio_delete`, `vio_finish_sync`, `vio_logout`; **every** handler checks a
  nonce + `current_user_can()`, and none registers a `nopriv` variant.

## Connection flow

**Connect** (Vio page, **one step**): the Settings button saves + validates the API key, then jumps
to WooCommerce's OAuth at `/wc-auth/v1/authorize` (callback `…/woo/auth/callback-supplier/`) with an
explicit `return_url` of `admin.php?page=vio` — deriving it from the AJAX request URL was the "blank
**0** page after approval" bug. On success the backend creates, in the store:

- **1 REST API key** described `Vio WooCommerce Sync` (so `cleanup()` can find & revoke it), and
- **2 order webhooks** (`order.created`, `order.updated`) pointing at the backend. The backend
  currently **names them "Outshifter order.*"** — cosmetic only.

`Store_Status::webhook_exists()` treats the store as connected if **any** webhook matches a managed
name **or** has a delivery-URL host equal to the configured backend host — robust to the "Outshifter"
naming and the Reachu→Vio host flip.

**Disconnect** (`Ajax::logout()`) tears down **both** sides, best-effort, while the key is still valid:

1. **Backend** — `Api_Client::find_woo_connection()` reads `GET /api/ecom-user`, matches this store by
   `connection.url` host, and `DELETE`s the credential at `/api/users/api-credential/` with
   `{ fullDelete, id: apiCredential.id, ecomUser: { id: <entry id> } }`.
   ⚠️ **`ecomUser.id` is the `/api/ecom-user` entry's own `id`** (e.g. `199`) — **not** the account id
   from `/catalog/users/me` (e.g. `1289`), which the backend rejects with **HTTP 417**.
2. **Store** — `Plugin::cleanup()` deletes the WC REST key + Vio webhooks; the local options are cleared.

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
3. **Real backend domain** — flip to `api-commerce.vio.live` once Vio exposes it (one constant / one line). **Alan will set the definitive URLs.**
4. **Brand assets** — `assets/img/icon.svg` is a placeholder; the menu icon is a placeholder white mark; needs the real Vio logo SVG.
5. **Brand URLs** — signup/docs/legal links still placeholder.
6. **Prune dead CSS** — the removed settings tab left unused classes in `admin.css`.
7. **Live e2e disconnect test** — confirm the credential teardown through the UI button (fix is in + tested).
8. **system-overview** — add this area to [`system-overview`](./system-overview.md).

**Done since 2026-06-09:** ✅ dedicated Vio admin page · ✅ one-step connect + two-sided disconnect ·
✅ removed the WC settings tab · ✅ 13 PHPUnit tests · ✅ `docs/backend-integration.md` ·
✅ **made the repo public** · ✅ shipped to `main` (`00bee82`).

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
- **(2026-06-10) Top-level Vio menu, not a WC settings tab** — Vio is its own product surface; the
  tab was removed and its helpers moved into `Store_Status`.
- **(2026-06-10) Page split** `Config_Page` (view) + `Store_Status` (logic) for testability.
- **(2026-06-10) Disconnect resolves the credential itself** via `/api/ecom-user` — no backend change.
- **(2026-06-10) `filemtime` asset versioning** so edits bust the browser cache automatically.

## Links

- Code audit (in the repo): https://github.com/vio-live/vio-woocommerce-sync/blob/main/docs/CODE-AUDIT.md
- Session journals: [`2026-06-09 — woo`](../journal/2026-06/2026-06-09-woo.md) (bootstrap),
  [`2026-06-09 — woo-2`](../journal/2026-06/2026-06-09-woo-2.md) (connect + sync flow + handoff),
  [`2026-06-10 — woo`](../journal/2026-06/2026-06-10-woo.md) (admin page + connect/disconnect + public)
- Backend integration contract (in the repo): https://github.com/vio-live/vio-woocommerce-sync/blob/main/docs/backend-integration.md
- Plugin repo: https://github.com/vio-live/vio-woocommerce-sync
- Dev-env repo: https://github.com/vio-live/woo-vio
