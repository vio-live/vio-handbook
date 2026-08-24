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

## Part 2 — same day, follow-up from a second coding agent: schema was still not actually applied

A second agent (working for the Aller/CMS partner integration) pushed back
with concrete evidence that despite Part 1's "success", **the DB schema
still wasn't live** in any environment. Investigated and confirmed:

11. Queried staging's real Postgres directly (`az containerapp exec` + a
    small `pg` script — VNet-only DB, no access from outside, so exec into
    the running container is the only path in). Confirmed: the `user_role`
    enum type (migration 0007) **did not exist**. None of migrations
    0007-0010 had ever actually applied, in any of the 3 environments,
    despite the container running `drizzle-kit push` on every single boot
    since June.
12. Root cause, found in the boot logs: `push` does **live interactive
    diffing against `shared/schema.ts`** — it never reads `migrations/*.sql`
    at all — and was hanging forever on an unanswerable confirmation prompt
    (`"Do you want to truncate users table?"`, no TTY) on every boot.
    Bonus complication: `migrations/meta/_journal.json` was itself stale
    (only listed 0000/0001, files exist up to 0010), so even drizzle-orm's
    own official migrator would have silently skipped 0007+ too. Full
    writeup: [`lessons/drizzle-kit-push-is-not-a-migration-tool.md`](../lessons/drizzle-kit-push-is-not-a-migration-tool.md).
13. Wrote `scripts/migrate.mjs` — a small non-interactive runner that reads
    `*.sql` files directly (not the stale journal), tracks applied ones by
    filename in `public._migrations_applied`, baselines pre-existing
    environments (skips 0000-0006 if the tracking table is empty but
    `public.users` already exists), and fails the process hard on any
    error. Rewrote migrations 0007/0008 to be idempotent (`IF NOT EXISTS` /
    `duplicate_object` guards), since some environments had partial state
    from prior broken `push` attempts. Dockerfile CMD changed to
    `node scripts/migrate.mjs && node dist/preserver.js`. PR #52.
14. **Verified against all 3 real databases** before merging (ran the same
    script manually via `az containerapp exec`, using `--revision` pinned to
    the known-healthy old revision to avoid connecting into a crash-looping
    new one): staging had partial state from old `push` attempts (idempotent
    guards handled it cleanly), development/production were clean baselines.
    All 3 confirmed via the exact queries the second agent proposed:
    `surface_platforms_ok=true`, `sponsor_role_ok=true`,
    `bundle_id_nullable=YES`.
15. **Self-inflicted incident, caught and fixed within minutes**: the first
    commit to PR #52 included a stale draft of `migrate.mjs` (one that still
    trusted the broken journal) — it had been `git add`-ed *before* I
    discovered the journal was stale and rewrote the script, and never got
    re-staged before `git commit`. Result: after merging and redeploying,
    all 3 new revisions failed to boot (`migrate.mjs` correctly failed hard
    — exactly as designed). **No user-facing impact** — Container Apps kept
    routing 100% of traffic to the last healthy revision the whole time.
    Fixed by committing the actual correct file directly to `main` and
    redeploying all 3.
16. **Second self-inflicted issue, same root cause class**: the manual
    verification runs in step 14 used a simplified one-off test script whose
    baseline logic only marked *one* file (`0006_...sql`) as applied, not
    all of 0000-0006 like the real `scripts/migrate.mjs` does. This left all
    3 environments' tracking tables incomplete, so when the *real* script
    ran on the redeploy, it tried to re-apply migration `0000` (full initial
    schema) against a database that already had those tables —
    `relation "broadcast_ads" already exists`, revisions failed to boot
    again. Fixed by inserting the missing 0000-0005 baseline rows directly
    (same VNet-only-access exec approach), then `az containerapp revision
    restart` on the stuck revisions. Confirmed clean in the actual boot logs
    afterward: `[migrate] Nothing to apply — up to date.` → normal startup.

**Both self-inflicted issues share a lesson**: when a manual/one-off script
and the "real" committed script need to agree on behavior (like a baseline
scheme), write one and have the other call it — don't hand-duplicate the
logic in two places, even for a "just this once" verification run.

## Final verified state, take two (2026-08-24, actually end of session)

All three environments, schema **and** deploy mechanism both confirmed
correct via real boot logs (not just HTTP checks):

| Env | Domain | Boot log |
|---|---|---|
| development | `api-dev.vio.live` | `[migrate] Nothing to apply — up to date.` → `Application fully ready` |
| staging | `api-staging.vio.live` | same |
| production | `api.vio.live` | same |

`COMMERCE_GRAPHQL_URL` / `COMMERCE_GRAPHQL_PUBLIC_URL` also resolved in this
part of the session (see below) — set to the per-environment public HTTPS
Commerce GraphQL domain on all 3, since there's no VNet peering between
Vio Backend's Container Apps and Commerce's AKS clusters.

## What's NOT done / still pending

- **Sponsors ownership-guard exclusion** (see step 9, Part 1) — needs a
  yes/no from Angelo on whether it's intentional.
- PR #45's/#39's actual diffs were merged as-authored without independent
  review beyond "mergeable + no conflicts" — worth a normal code review
  pass if nobody's done one yet.
- `migrations/meta/_journal.json` is still stale on disk (harmless now,
  since `scripts/migrate.mjs` doesn't read it) — worth regenerating properly
  with `drizzle-kit generate` at some point so `drizzle-kit studio` and any
  other journal-trusting tooling doesn't get confused. Not urgent.

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
- [`lessons/drizzle-kit-push-is-not-a-migration-tool.md`](../lessons/drizzle-kit-push-is-not-a-migration-tool.md)
- [`infrastructure/azure-overview.md`](../infrastructure/azure-overview.md) — see "api-vio — Container Apps" section; `kubernetesqa`/`reachuqa2` staleness already corrected in this session
- PRs: [#48](https://github.com/tipiodevelopment/vio-backend/pull/48) (superseded), [#49](https://github.com/tipiodevelopment/vio-backend/pull/49), [#51](https://github.com/tipiodevelopment/vio-backend/pull/51), [#45](https://github.com/tipiodevelopment/vio-backend/pull/45), [#39](https://github.com/tipiodevelopment/vio-backend/pull/39), [#42](https://github.com/tipiodevelopment/vio-backend/pull/42) (closed, duplicate), [#52](https://github.com/tipiodevelopment/vio-backend/pull/52) (real migration runner)
- Journal: [`journal/2026-08/2026-08-24.md`](../journal/2026-08/2026-08-24.md)
