---
title: "Vio WooCommerce Sync — architecture, structure & status"
last-updated: 2026-06-09
owner: angelo
status: live
---

# Vio WooCommerce Sync (`vio-woocommerce-sync`)

> Single source of truth for the **WooCommerce → Vio** product-sync plugin: what it is,
> how it's built, the dev environment it runs in, and what's left. New area as of
> 2026-06-09. For the iOS/Kotlin/Web SDKs and the platform as a whole, see
> [`system-overview`](./system-overview.md).

## TL;DR

- **What:** a **WordPress/WooCommerce plugin** that syncs a merchant's WooCommerce
  catalog (products, variants, prices, stock, images) into the Vio commerce platform.
  It is a **ground-up rewrite of the old `Reachu Export` plugin (v3.8)** rebranded to Vio.
- **State:** **v1.0.0, not yet published** (distributed as a WP plugin, not npm). Functionally
  complete, points at the **Reachu** REST backend for now (prod + staging), verified loading
  in the dev environment. Real end-to-end sync against staging still pending.
- **License:** GPL-2.0-or-later (WordPress plugin convention).
- **Backend today:** the **Reachu** commerce REST API (`api.reachu.io` / `api-qa.reachu.io`).
  Designed to flip to Vio's own domain (`api-commerce.vio.live`) with **zero code change**.

## The two repos & how they relate

| Repo | Vis. | What | State (2026-06-09) |
|---|---|---|---|
| **`angelosv/vio-woocommerce-sync`** | private → **going public** | the plugin itself (local clone: `/Users/angelo/Documents/GitHub/vio-woocommerce-sync`) | `main` @ `0d2309d` — pushed; history scrubbed of AI attribution before going public |
| **`angelosv/woo-vio`** | private | the **dev environment** — `@wordpress/env` (WordPress + WooCommerce in Docker) that mounts and runs the plugin (local clone: `/Users/angelo/Documents/GitHub/woo-vio`) | `main` @ `d7f527d` — pushed |

`woo-vio` is **only the harness**: it stands up WordPress + WooCommerce locally and mounts
the plugin (`../vio-woocommerce-sync`, relative path in `.wp-env.json`) so you can develop
and test in a live store. The shippable artifact is **`vio-woocommerce-sync`**.

> ⏳ Both repos live under the personal `angelosv` account today. Consider moving
> `vio-woocommerce-sync` to the **`vio-live`** org (like `vio-live/vio-web-sdk`) before
> publishing, for consistency.

## Plugin structure

```
vio-woocommerce-sync/
├── vio-woocommerce-sync.php   # Bootstrap: header, constants, HPOS declare, requires, lifecycle hooks
├── includes/
│   ├── class-plugin.php          # Orchestrator: central constants (option/meta keys), init, activate/deactivate, cleanup
│   ├── class-api-client.php      # HTTP client: environment resolution, auth, one method per endpoint
│   ├── class-product-mapper.php  # WC_Product → Vio DTO  +  diffing (variants/images/price)
│   ├── class-sync.php            # Service: push (export) / update / delete
│   ├── class-settings.php        # WooCommerce settings tab (API key, environment, currency, connect)
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
  removes Vio webhooks & REST API keys).
- **`Api_Client`** — environment-aware HTTP. See [Environments](#environments-prod--staging).
- **`Product_Mapper`** — `to_dto()` builds the product payload (images, variants, options,
  price/compareAt, inventory); `diff()` computes only the changed fields before an update.
- **`Sync`** — business logic: `push_products()` (batch export via `create-sqs`),
  `update_product()` (auto-sync on save), `delete_by_post()`.
- **`Settings`** — the WooCommerce → Settings → **Vio** tab (API key, environment, currency),
  connect via WooCommerce OAuth, connected/disconnected states.
- **`Products_Table`** — sync-status column with icon, **Vio Sync** / **Delete from Vio** bulk
  actions, and auto-sync hooks (`woocommerce_update_product`, `woocommerce_new_product`,
  `wp_trash_post`, `before_delete_post`).
- **`Ajax`** — `vio_sync`, `vio_delete`, `vio_finish_sync`, `vio_save_settings`, `vio_logout`;
  **every** handler checks a nonce + `current_user_can()`, and none registers a `nopriv` variant.

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

**Endpoints** (shared with the Reachu platform; confirmed identical for Vio):
`/api/products` (GET/PUT/DELETE + `create-sqs` POST), `/api/currencies`, `/catalog/users/me`,
`/woo/config` (PUT), `/api/users/me/finish-sync` (PUT), plus WooCommerce OAuth at
`/wc-auth/v1/authorize` with callback `…/woo/auth/callback-supplier/`.

## Dev environment (`woo-vio`) — gotchas

- `@wordpress/env` + Docker. **`wp-env start` is unreliable** on recent Docker (29.x): it brings
  up only MySQL and aborts before WordPress. Workaround: `bin/bootstrap.sh` / `bin/dev.sh` drive
  `docker compose` directly against wp-env's generated config. Use `npm run setup` (first time,
  idempotent) then `npm start` / `npm stop`.
- WooCommerce 10.9 auto-installs marketing plugins (jetpack, klaviyo, pinterest, paypal, …) that
  inflate memory; a dev `mu-plugin` raises `memory_limit` and PayPal was deactivated.
- Site: `http://localhost:8888` (admin / password).

## Status (2026-06-09)

- ✅ Full rewrite landed: 8-class modular plugin, HPOS declared, i18n, security hardened
  (nonce + capability, no `nopriv`, output escaping, `$wpdb->prepare`).
- ✅ Environments wired (Reachu prod/staging) and verified dynamic
  (`production → api.reachu.io`, `staging → api-qa.reachu.io`, override → `api-commerce.vio.live`).
- ✅ `php -l` clean on all files; activates in `woo-vio` with no fatals.
- ⏳ No real end-to-end sync yet (needs a staging API key).

## Tech debt / pendientes

1. **Real backend domain** — flip to `api-commerce.vio.live` once Vio exposes it (one constant / one line).
2. **End-to-end test** — export a real product to `api-qa.reachu.io` (staging) with an API key; verify it lands.
3. **Brand assets** — `assets/img/` is a placeholder `icon.svg`; needs real Vio icons.
4. **Brand URLs** — signup/docs/legal links still point at `reachu.io`.
5. **Repo org** — move `vio-woocommerce-sync` to the `vio-live` org before publishing.
6. **system-overview** — add this new area to [`system-overview`](./system-overview.md) (that file is being edited in another in-flight session; don't clobber).
7. **`woo-vio` commit history** still carries `Co-Authored-By` trailers (violates the no-AI-attribution rule); left as-is by user decision since it stays private.

## Decisions

- **Full modular rewrite**, not a patch of the 1196-line monolith — the original mixed concerns,
  embedded HTML/CSS in PHP, and had real security holes (see `docs/CODE-AUDIT.md` in the repo).
- **Plugin and dev-environment are separate repos** (`vio-woocommerce-sync` vs `woo-vio`).
- **Dropped `vendor/`** (5.9 MB, Google Cloud/Firebase/Guzzle/…) — statically dead (0 imports, 0 refs).
- **URLs dynamic, Reachu today** — flip to Vio without touching code (constant in wp-config).
- **Clean Vio naming** — `VIO_WC_SYNC_*`, options `vio_*`, meta `vio-*`, text-domain `vio-woocommerce-sync`.
- **Commits carry no AI attribution** (rule 6). `vio-woocommerce-sync` history was rewritten +
  force-pushed to remove earlier `Co-Authored-By` trailers before going public.

## Links

- Code audit (in the repo): https://github.com/angelosv/vio-woocommerce-sync/blob/main/docs/CODE-AUDIT.md
- Session journal: [`2026-06-09 — woo`](../journal/2026-06/2026-06-09-woo.md)
- Plugin repo: https://github.com/angelosv/vio-woocommerce-sync
- Dev-env repo: https://github.com/angelosv/woo-vio
