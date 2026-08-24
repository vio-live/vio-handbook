---
title: "Handoff — vio-backend staging incident: full recovery and branch reconciliation"
last-updated: 2026-08-24
owner: angelo
status: live
---

# vio-backend staging incident — full recovery (2026-08-24)

> Session write-up, kept deliberately long. Purpose: nobody (human or agent)
> should have to re-derive this investigation from scratch, and the mistake
> in the "What went wrong on my end" section should never repeat.

## Trigger

Angelo forwarded 5 questions from a coding agent blocked on `vio-backend`
(repo `tipiodevelopment/vio-backend`, formerly `socket-server`) staging
deploy: wrong `DATABASE_URL` secret (still Neon), ACR login UNAUTHORIZED,
migration step reporting green on failure, unclear schema state since
2026-06-02, and unclear env vars in "the AKS deployment."

## What was actually wrong (five independent problems, discovered in order)

1. **`develop`'s `deploy.yml` used the wrong secret.** The migration step read
   `secrets.DATABASE_URL` (still Neon) instead of `secrets.DATABASE_URL_STAGING`
   (the real Azure Postgres, already provisioned since 2026-08-10).

2. **ACR `reachuqa2` had admin auth disabled**, so the user/pass login step
   always failed regardless of credential value.

3. **`drizzle-kit push` (0.31.4) exits 0 even when the DB connection/auth
   fails** — the migration step never failed the job, so a broken migration
   went unnoticed.

4. **The real mistake — conflating Vio Commerce's infra with Vio Backend's
   own.** `develop`'s `deploy.yml` targeted AKS cluster `kubernetesqa` /
   resource group `qa` — which is **Vio Commerce's own QA cluster**, not
   Vio Backend's. Its `default` namespace is full of Commerce microservices
   (`base-api`, `graph-ql`, `products`, etc.); nothing there belongs to Vio
   Backend. This pipeline dated from Oct 2025–Mar 2026 and had been dead
   since before June — the `socket-server` Kubernetes Deployment it targeted
   didn't even exist anymore (the cluster was rebuilt around 2026-07-09 for
   Commerce's own purposes and Vio Backend's resource was never recreated
   there). I started "fixing" this pipeline and even planned to recreate the
   Deployment inside `kubernetesqa` before Angelo caught it: **"no mezcles,
   vio commerce... se supone que teniamos un grupo de recursos para el
   backend nuestro."** See [the lesson](../lessons/dont-mix-vio-commerce-and-vio-backend-infra.md).

5. **`main` and `develop` had diverged 21 commits each, since `988262d`,
   never reconciled.** `develop` had ADR-0007/0008 (Firebase auth, operator
   capabilities/tenancy, migrations 0007–0010). `main` had the *entire*
   infra migration away from AKS: rename to `vio-backend`, OIDC login,
   deploy to Container Apps in Vio Backend's own resource groups
   (`rg-api-vio-{development,staging,production}`), ACR migrated to
   `acrvioapi.azurecr.io`, Postgres driver fix, storage migration. The
   branch with the *correct, working* pipeline had **zero** Firebase auth
   code — `firebase-admin.ts` didn't exist on `main` at all. The env vars
   set earlier in the session (`FIREBASE_PROJECT_ID`, `ADMIN_EMAILS`) were
   inert until this was fixed.

## Vio Backend's real, dedicated infrastructure (for the record)

Independent of AKS entirely. Terraform module `socket-server-env` in
`vio-live/vio-infra-tf`.

| RG | Container App | Postgres | Domain |
|---|---|---|---|
| `rg-api-vio-development` | `ca-api-vio-development` | `pg-api-vio-development` | `api-dev.vio.live` |
| `rg-api-vio-staging` | `ca-api-vio-staging` | `pg-api-vio-staging` | `api-staging.vio.live` |
| `rg-api-vio-production` | `ca-api-vio-production` | `pg-api-vio-production` | `api.vio.live` |

ACR: `acrvioapi.azurecr.io`. CI: `.github/workflows/deploy.yml` on `main`
(push → auto-deploy `development`; `workflow_dispatch` → any environment).
OIDC login (`AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID`), no
static ACR credentials. Migrations run automatically on container startup —
there is no separate CI migration step on this pipeline.

## Actions taken, in order

1. Opened PR #48 fixing `develop`'s dead AKS workflow (secret name, ACR
   login method, hard-fail migrations) — **superseded**, see below.
2. Found the real `main`-branch OIDC/Container Apps pipeline; confirmed
   `development` auto-deploys on push but `staging`/`production` need
   manual `workflow_dispatch` and hadn't been triggered since before the
   `vio-backend` rename.
3. Closed PR #48, opened and merged PR #49 (delete the dead `develop`
   workflow entirely, so nobody reads it and assumes it's live again).
4. Triggered `workflow_dispatch environment=staging` → confirmed healthy,
   but running code from `main`, which had **no** Firebase auth.
5. Set `FIREBASE_PROJECT_ID` (`reachu-qa` for dev/staging, `reachu-prod`
   for production) and `ADMIN_EMAILS=angelo@tipio.no` on all 3 Container
   Apps — additive `az containerapp update --set-env-vars`, confirmed
   `provisioningState: Succeeded` on each.
6. Angelo provided both Firebase Admin service account JSON keys
   (`reachu-qa`, `reachu-prod`). Added `FIREBASE_SERVICE_ACCOUNT_JSON_B64`
   support in `firebase-admin.ts` (Container Apps has no file mounts, so
   the existing `FIREBASE_SERVICE_ACCOUNT_PATH` path-based loading doesn't
   work there — PATH still works for local dev). Loaded both keys as
   Container App **secrets** (base64), never committed, never logged in
   plaintext, temp files shredded after use.
7. Discovered the `main`/`develop` divergence (problem 5 above). Merged
   `develop` → `main` (PR #51): 4 conflicts resolved —
   - `deploy.yml`: kept `main`'s OIDC version (`develop`'s was already deleted in #49)
   - `.gitignore`: union of both sides
   - `yarn.lock`/`package-lock.json`: regenerated from merged `package.json` rather than hand-resolved
   - Verified before commit: `yarn build` clean; `yarn run check` (tsc) — 26 pre-existing errors, **identical set** confirmed on `main` alone and `develop` alone via isolated `git worktree` checks, so the merge introduced zero new type errors; `yarn test` — 70 failures, all `AggregateError` from no local Postgres in the sandbox (not merge-related), 98 non-DB tests passed.
8. Merged PR #51, then #45 (analytics dashboard proxy) and #39 (env var
   docs) — both clean against the new `main`.
9. Closed PR #42 (per-resource tenant ownership guard) — **duplicate**, the
   same ADR-0008 gap-closure had already landed via #46 (merged as part of
   #51). The already-merged version is newer and *deliberately* excludes
   `sponsors` from the ownership check ("interim toward the Brand-tenant
   model"); PR #42's older version still enforced it. Merging #42 would
   have been a design downgrade, not a clean merge. **Flagged for Angelo to
   confirm this was an intentional decision, not a regression.**
10. Deployed the reconciled `main` to all three environments
    (`workflow_dispatch` staging + production; development auto-deployed on
    the merge pushes). Verified `HTTP 200` on `/api/status` **and**
    `/api/auth/me` (the Firebase token-verification endpoint — didn't exist
    in the previously-running code) on all three.

## Final verified state (2026-08-24, end of session)

All three environments run the same commit (`b7e84a0`, post-merge `main`),
image `acrvioapi.azurecr.io/vio-backend:{env}-b7e84a0...`:

| Env | Domain | Revision | Verified |
|---|---|---|---|
| development | `api-dev.vio.live` | `ca-api-vio-development--0000011`+ | 200 `/api/status`, 200 `/api/auth/me` |
| staging | `api-staging.vio.live` | `ca-api-vio-staging--0000012` | 200 `/api/status`, 200 `/api/auth/me` |
| production | `api.vio.live` | `ca-api-vio-production--0000005` | 200 `/api/status`, 200 `/api/auth/me` |

Firebase auth is live end-to-end for the first time in production.

## What's NOT done / still pending

- **`COMMERCE_GRAPHQL_URL` / `COMMERCE_GRAPHQL_PUBLIC_URL`** were never set
  on any of the 3 Container Apps — I flagged uncertainty about internal vs.
  public routing and Angelo didn't confirm before we moved to the branch
  merge. Still missing.
- **Sponsors ownership-guard exclusion** (see step 9) — needs a yes/no from
  Angelo on whether it's intentional.
- **`azure-overview.md`** (this handbook) currently states *"Clusters
  anteriores eliminados: `kubernetesqa` (RG `qa`) ya no existen"* — this is
  **stale**. `kubernetesqa` was recreated (~2026-07-09) and is very much
  alive as Vio Commerce's QA cluster. This doc's wrong claim directly fed
  the mistake in step 4 above. **Needs a correction pass** — not done in
  this session, flagging so it doesn't mislead the next person/agent.
- PR #45's/#39's actual diffs were merged as-authored without independent
  review beyond "mergeable + no conflicts" — worth a normal code review
  pass if nobody's done one yet.
- No environment-specific `COMMERCE_GRAPHQL_*` wiring means any feature
  depending on the Commerce catalog from the dashboard is presumably still
  non-functional in all 3 environments.

## What went wrong on my end (read this before touching Vio Backend infra)

Early in this session I nearly repeated a Commerce/Backend mixing mistake
myself: I read an old, incomplete scope doc
(`handoff/socket-server-infra-scope.md`, a 14-line Fase-1-only stub) that
said "Deployment AKS" and took it as the current design, then started
recreating a Kubernetes Deployment for `socket-server` **inside
`kubernetesqa`** — Vio Commerce's own QA cluster — using a Helm chart found
in the repo. Angelo caught it: *"no mezcles, vio commerce... se supone que
teniamos un grupo de recursos para el backend nuestro."* The correct,
dedicated, already-built infrastructure (`rg-api-vio-*`, Container Apps) was
sitting right there in `azure-overview.md`, better documented and more
current than the stub I'd anchored on. Full writeup:
[`lessons/dont-mix-vio-commerce-and-vio-backend-infra.md`](../lessons/dont-mix-vio-commerce-and-vio-backend-infra.md).

## See also

- [ADR-0007](../decisions/0007-firebase-auth-single-idp.md), [ADR-0008](../decisions/0008-operator-authorization-capabilities-tenancy.md)
- [`lessons/dont-mix-vio-commerce-and-vio-backend-infra.md`](../lessons/dont-mix-vio-commerce-and-vio-backend-infra.md)
- [`infrastructure/azure-overview.md`](../infrastructure/azure-overview.md) — see "api-vio — Container Apps" section (needs the `kubernetesqa` correction noted above)
- PRs: [#48](https://github.com/tipiodevelopment/vio-backend/pull/48) (superseded), [#49](https://github.com/tipiodevelopment/vio-backend/pull/49), [#51](https://github.com/tipiodevelopment/vio-backend/pull/51), [#45](https://github.com/tipiodevelopment/vio-backend/pull/45), [#39](https://github.com/tipiodevelopment/vio-backend/pull/39), [#42](https://github.com/tipiodevelopment/vio-backend/pull/42) (closed, duplicate)
- Journal: [`journal/2026-08/2026-08-24.md`](../journal/2026-08/2026-08-24.md)
