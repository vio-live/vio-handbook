---
title: "Lesson: vio-sync (React Router + CLI) is not vio-shopify (legacy Koa) — read the running-doc before improvising"
last-updated: 2026-06-30
owner: angelo
status: live
---

# Lesson — vio-sync ≠ vio-shopify; read the doc before improvising a setup

## What burned us

On **2026-06-30** the agent spent most of a day working in **`vio-shopify`** (the legacy Koa + Next app) when the user wanted **`vio-sync`** (the React Router 7 rewrite that already runs in the dev store via the Shopify CLI). The two share a GitHub repo (`vio-live/vio-shopify-sync`) on different branches and live in sibling folders, so they're easy to confuse.

The trigger phrases — *"the app"*, *"the store"*, *"launch it with the CLI"*, *"the one that was already running"* — all referred to **vio-sync**. The agent kept anchoring on vio-shopify:

- Re-implemented the API-key auth in the legacy (a whole "Bloque D") even though vio-sync already had it.
- When asked to "launch with the CLI", installed the Shopify CLI into the **legacy** and tried to `shopify app dev` it — a server with its own OAuth and no `shopify.app.toml` — producing a 403 against an app the user's account doesn't even belong to.
- Only after the user said *"read the docs you wrote"* did the agent read `vio-handbook/docs/handoff/shopify-sync.md` (which is **about vio-sync**) and `vio-shopify/docs/local-dev.md`, and realize they were different projects with different setups.

## Why it happens

- Two near-identical names, same GitHub repo, sibling folders.
- The agent's own memory described the **vio-sync** setup (cloudflared named tunnel, CLI, port 8082) but the cwd was **vio-shopify** — and it applied one project's setup to the other.
- vio-shopify is the legacy with a **custom Koa OAuth**; vio-sync uses the **standard Shopify CLI** flow. Their "how to run / deploy" docs are not interchangeable.

## The rule

**"run / launch / deploy / test the Shopify app", "the app", "the store", "the CLI" = `vio-sync`** — unless the user says "legacy" or "vio-shopify" explicitly.

Before improvising any run/deploy setup:

1. **Read the running-doc first**: `vio-handbook/docs/handoff/shopify-sync.md` (vio-sync) or the repo's own `docs/` (e.g. `vio-sync/docs/DEPLOY.md`).
2. Confirm which project you're in.
3. Never mix one project's setup (CLI, tunnel, app/client_id, env names) into the other.

| | **vio-sync** | **vio-shopify** |
|---|---|---|
| What | the app that runs in the dev store | the legacy |
| Path | `/Users/angelo/vio-sync` (branch `main-cli`) | `/Users/angelo/vio-shopify` |
| Stack | React Router 7 + Shopify CLI | Koa + Next, custom server |
| Run | `npm run dev -- --tunnel-url=https://shopify-dev.vio.live:8082` | `yarn dev` / ngrok / `DEV_BYPASS` |
| Shopify app | "Vio Sync" `8994c429…` (user's org) | `e9e1fd…` (other org → 403) |

## Trigger to re-read this lesson

Any time the user says *"run / launch / deploy / test the app"* and you're about to touch a Shopify project — **stop, confirm it's vio-sync, and read its doc** before doing anything.

Related: agent memory `vio-sync-es-el-app-de-la-tienda`; deploy handoff `vio-sync/docs/DEPLOY.md`.
