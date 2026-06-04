---
title: "Onboarding — humans"
last-updated: 2026-06-04
owner: angelo
status: live
---

# Onboarding — for new developers

Welcome. This guide gets you from zero to "I can ship a PR" in about 30 minutes.

## 1. The 3 repos (10 min read)

Vio is split across 3 GitHub repos. They're related but each has its own branch policy.

| Repo | What it does | Default branch | Production branch |
|------|--------------|----------------|-------------------|
| [`tipiodevelopment/socket-server`](https://github.com/tipiodevelopment/socket-server) | Backend (Node + Express + Drizzle ORM) + dashboard frontend (React in `client/`). Serves `/v2/{tv,mobile,commerce,admin}/*` to the SDKs and `/api/*` to the dashboard. | `main` | `main` → deploys to development. Use `workflow_dispatch` for staging/production. |
| [`vio-live/VioSwiftSDK`](https://github.com/vio-live/VioSwiftSDK) | iOS SDK (Swift Package Manager). Modules: `VioCore`, `VioUI`, `VioDesignSystem`, `VioNetwork`, `VioComplete`. Plus host app demos in `Demo/` (Vg, Viaplay, tv2demo). | `develop` | `develop` — never merge to `main` (releases only). |
| [`vio-live/InteractiveAds-vio`](https://github.com/vio-live/InteractiveAds-vio) | Apple TV SDK (`VioTV` product) + tvOS demo. | `main` | `main` |

Read [`docs/architecture/system-overview.md`](../architecture/system-overview.md) for how they fit together.

## 2. Operating rules (5 min read)

These are LOCKED. Don't argue with them in PR comments — open an ADR if you want to revisit:

1. **No auto-merge.** Open PR, wait for review, merge from GitHub UI.
2. **VioSwiftSDK never→main.** All work goes to `develop`. `main` is releases only.
3. **No v1 fallbacks.** v2 endpoints are the only target. Direct cut, no shim layers.
4. **No hardcoded apiKeys.** Sponsor commerce keys come from `/v2/mobile/config` bootstrap; never inlined in client code.
5. **No force-push** on shared branches. If another session pushed on top of yours, branch off `develop` and re-PR.
6. **No AI attribution** in commits. Don't add `Co-Authored-By: Claude` lines.
7. **No new doc files** without a clear reason. Update an existing doc first; new file requires it being a different *type* of doc (decision vs lesson vs playbook).
8. **Merge-to-develop checklist + `npm run check:docs-drift` gate** for socket-server. If the script reports drift, fix the docs/postman before merging.

## 3. Local setup (10 min)

### Backend (`socket-server`)

```bash
git clone git@github.com:tipiodevelopment/socket-server.git
cd socket-server
yarn install
cp .env.local.example .env
# Set DATABASE_URL=postgresql://pgadmin:localpass@localhost:5432/socket_server
# Ask Angelo for AZURE_STORAGE_CONNECTION_STRING (saapivio storage account)
docker compose up -d   # starts PostgreSQL 16 on localhost:5432
yarn db:snapshot:pull  # loads latest demo data from Azure Blob
yarn dev               # boots on :5001
```

Full step-by-step: [`docs/playbooks/socket-server-local-dev.md`](../playbooks/socket-server-local-dev.md)

Tunnel: Angelo runs `api-local-angelo.vio.live` via Cloudflare so the iOS demos can hit local. If you're running your own backend, skip the tunnel and point demos at `https://api-dev.vio.live`.

### iOS SDK (`VioSwiftSDK`)

```bash
git clone git@github.com:vio-live/VioSwiftSDK.git
cd VioSwiftSDK
open VioSwiftSDK.xcworkspace   # NOT a single .xcodeproj — they conflict resolving the local SPM package
```

Pick the demo scheme (Vg / Viaplay / tv2demo / tv2demo-appletv) from the scheme picker. Cmd+R.

### Apple TV SDK (`InteractiveAds-vio`)

Lives at `~/Documents/GitHub/InteractiveAds-vio`. Symlinked into `VioSwiftSDK/Demo/tv2demo-appletv` so it shows up inside the iOS workspace.

## 4. The "live truth" doc

[`socket-server/docs/CURRENT_STATE.md`](https://github.com/tipiodevelopment/socket-server/blob/develop/docs/CURRENT_STATE.md) is the single source of truth for "what's the state of the platform right now". Header is dated. Sections are numbered (latest = highest §N). When you finish a sprint, you write a new §.

## 5. Branch + PR workflow

- Branch off `main` (socket-server and InteractiveAds-vio) or `develop` (VioSwiftSDK): `feat/short-slug` / `fix/short-slug` / `chore/short-slug` / `docs/short-slug`.
- Conventional commits: `feat(scope): summary` — scope is the area touched.
- PR title same format. Body: Summary + Test plan (markdown checklist).
- For socket-server: run `npm run check:docs-drift` before pushing. CI doesn't gate yet but is mandatory by convention.
- Squash merge from GitHub UI. Merge commit message keeps `(#NN)` suffix.

## 6. Where to look when stuck

| Situation | Look here |
|---|---|
| "Why does the rule say X?" | [`docs/decisions/`](../decisions/) |
| "We've seen this bug before, right?" | [`docs/lessons/`](../lessons/) |
| "How do I do <op>?" | [`docs/playbooks/`](../playbooks/) |
| "What's the current sprint state?" | `socket-server/docs/CURRENT_STATE.md` |
| "What does <term> mean?" | [`docs/glossary.md`](../glossary.md) |
| "Is there a stuck branch I should know about?" | `socket-server/docs/CURRENT_STATE.md` header + § referenced |

## 7. People

Right now (2026-06-04): Angelo (lead) + Miguel (AI agent / infra) + Claude (AI pair programmer). Alan does Kotlin SDKs in parallel — see Kotlin specs in `socket-server/docs/KOTLIN_*_SDK_SPEC.md`.
