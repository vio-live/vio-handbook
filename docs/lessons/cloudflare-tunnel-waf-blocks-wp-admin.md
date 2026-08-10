---
title: "Lesson: the vio.live Cloudflare WAF blocks /wp-admin + /wp-login on the woo-dev tunnel — breaks WooCommerce OAuth connect"
last-updated: 2026-08-10
owner: angelo
status: live
---

# The vio.live Cloudflare WAF blocks `/wp-admin` + `/wp-login.php` on `woo-dev.vio.live`

## TL;DR

The WooCommerce dev site is exposed over the Cloudflare named tunnel `woo-dev.vio.live`
(zone `vio.live`). That zone has a **Custom WAF rule that Blocks `/wp-admin` and
`/wp-login.php`** (standard WordPress hardening) while leaving the REST API (`/wp-json`,
`/wc-auth`) **open**. The Vio "Connect" flow is a **browser OAuth** dance
(`/wc-auth/v1/authorize` → `wp-login.php` → back to `/wp-admin/…`), so it bounces through
the two blocked paths and **never completes → Vio never receives the REST keys → no order
webhook is created**. The endpoints Vio actually calls server-to-server are open; the block
is purely on the human login/admin pages. Fix = a Cloudflare **Skip scoped to
`http.host eq "woo-dev.vio.live"`** on that custom rule (a "Skip → All managed rules" rule
does **not** override a custom **Block**).

## Symptom

- Plugin shows `valid: true` but `connected: false`; the WooCommerce webhooks list is
  empty; `Store_Status::webhook_exists()` = false.
- `https://woo-dev.vio.live/wp-admin/` and `/wp-login.php` → **HTTP 403** with the
  Cloudflare "Sorry, you have been blocked / Attention Required" page.
- Homepage `/` → 200; `/wp-json/` → 200; `/wp-json/wc/v3/webhooks` → 401 (`woocommerce_rest`
  = reaches origin, just needs auth); `/wc-auth/v1/authorize` → 401. So **only** the
  admin/login pages are blocked.

## Why the obvious diagnosis is wrong

Two red herrings ate a lot of time:

1. **"It must be the REST path / bot detection blocking Vio."** No — the webhook-creation
   paths (`/wp-json/…`, `/wc-auth/…`) are **open** (200/401 = origin). The block is on the
   *browser* login/admin pages the OAuth flow redirects through.
2. **`siteurl` had been pointed at `localhost:8888`** (an earlier Cloudflare workaround) —
   Vio can't reach `localhost`, so first revert `siteurl`/`home` to
   `https://woo-dev.vio.live`. But that alone doesn't fix it; the WAF block does.

Map the block precisely instead of guessing — hit each path and read status + body:

```bash
for p in / /wp-admin/ /wp-login.php /wp-json/ /wp-json/wc/v3/webhooks /wc-auth/v1/authorize; do
  echo "$p -> $(curl -sS -o /dev/null -w '%{http_code}' --retry 3 "https://woo-dev.vio.live$p")"
done
# body of a 403 → "<title>Attention Required! | Cloudflare</title>" confirms the WAF, not WP.
```

## The fix (Cloudflare dashboard — needs zone access)

The block is a **Custom rule** (Security → WAF → Custom rules), not a Managed rule — that's
why it surgically hits `/wp-admin` + `/wp-login` and leaves REST open. A "Skip → All managed
rules" rule will **not** override it. Either:

- **(A, cleanest)** edit the blocking custom rule and append `and not (http.host eq "woo-dev.vio.live")`, or
- **(B)** add a Skip custom rule matching `http.host eq "woo-dev.vio.live"`, tick **"All
  remaining custom rules"** (not just managed), and move it to **first** in execution order.

After it applies (~30–60 s), `/wp-admin/` returns **302** (redirect to login) instead of
403. Then in the plugin: **Connect** → approve the WooCommerce authorize screen → Vio
creates `Vio order.created` + `Vio order.updated` webhooks (delivery URL `…/woo/webhooks`).

> The agent has only a tunnel-scoped `cert.pem`, **no Cloudflare API token with WAF scope** →
> this fix is done by the user in the dashboard, not via API.

## Rule

Exposing a WordPress site behind a shared corporate Cloudflare zone: the zone's
WordPress-hardening rules (block `wp-admin`/`wp-login`) will silently break any
**browser-OAuth** connector (WooCommerce `/wc-auth`, Jetpack, etc.) even though the REST API
is reachable. Add a **host-scoped Skip/exception** for the dev subdomain on the **custom**
rule. Diagnose by hitting each path and reading status + body, not by assuming which layer
blocks. Do **not** work around it by pointing `siteurl` at localhost or by spinning up a
non-Cloudflare tunnel.
