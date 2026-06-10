---
title: "ADR-0007: Commerce's Firebase Auth becomes the single cross-product IdP"
last-updated: 2026-06-10
owner: angelo
status: draft
---

# ADR-0007: Commerce's Firebase Auth becomes the single cross-product IdP

## Context

Vio is two products on two stacks:

- **Vio engagement** — `socket-server` (Express backend + React dashboard in one repo/process).
- **Vio Commerce** (ex-Reachu) — its own infrastructure and backend, with **Firebase Auth already live** for signup/signin. Staging front: `https://webapp-dev.vio.live/` against Firebase project `reachu-qa`.

Owner direction (2026-06-10): **backends stay separate** — no service merging. Frontends should converge: first share signup/signin, eventually evaluate a unified UI. Both fronts will live under `.vio.live` whatever their final names.

What the Vio dashboard has today is not auth: a **simulated session** — the operator types any id, it's stored as `reachu_simulated_user_id` in localStorage, `POST /api/users/ensure` upserts the user row and mints a 7-day JWT. The `users` table has **no password column**. The deprecated `users.reachu_user_id` column is the residue of a previous hand-rolled identity link between the two products.

Verified facts (2026-06-10, spike):

- `reachu-qa` accepts email/password signup via the public Identity Toolkit REST API.
- Its **authorized domains do not include any `vio.live` domain** (`localhost`, `reachu-qa.firebaseapp.com`, `reachu.io`, …). Email/password works from any origin (plain REST); Google/Facebook popup/redirect will need our domains added.
- The Commerce web bundle already uses `signInWithCustomToken` — the token-handoff pattern is not foreign to that codebase.
- A Firebase ID token issued by `reachu-qa` verifies offline in socket-server with ~80 lines of middleware (PR [tipiodevelopment/socket-server#40](https://github.com/tipiodevelopment/socket-server/pull/40)), end-to-end tested.

## Decision

1. **The Commerce Firebase project (per environment) is the single identity provider for both products.** QA/staging: `reachu-qa`. Production: the Commerce production project (id pending confirmation).
2. **Each backend verifies ID tokens independently** — RS256 signature against Google's public JWKS, `issuer`/`audience` bound to the project id. Pure crypto, no service account, no runtime call to Firebase or to each other. Identity is shared by verifying the same tokens, **not** by coupling services.
3. **The Vio dashboard replaces the simulated session with Firebase sign-in** (same providers Commerce exposes). `users` gains a `firebase_uid` column; the legacy `reachu_user_id` path retires with it. **Roles/permissions stay per-product in each product's DB.** Firebase custom claims only for coarse cross-product flags (1KB limit, cached in tokens).
4. **Cross-front jump (SSO) uses the one-time-code handoff**: front A asks its backend for a single-use short-TTL code → redirect to front B → B exchanges the code for a Firebase custom token → `signInWithCustomToken()`. Works across any domains, explicit, revocable. A shared session cookie on the `.vio.live` apex is a possible later optimization, **not** the foundation.
5. **Rollout in phases**, each shippable alone:
   - **F1 (done, PR #40)**: verification middleware + `GET /api/auth/me` + spike login page. Nothing depends on it.
   - **F2**: `users.firebase_uid` migration; `UserContext.login` swaps to Firebase; `/user-session` simulated flow retires.
   - **F3**: dashboard `/api/*` routes require the verified identity (operator authz from the `users` row).
   - **F4**: SSO handoff endpoints on both sides (requires a service account for custom-token minting + Commerce-side coordination).

## Rationale

- **Reuse the IdP that already works.** Commerce's user base and flows are live; making Vio a consumer costs ~one middleware, making anything else the IdP costs a migration.
- **Verification is offline.** Google JWKS verification adds zero runtime dependency between products — consistent with "backends stay separate".
- **Vio side is greenfield.** No passwords to migrate; the simulated session has no users to preserve. Cheapest possible adoption window — it only gets more expensive after real operator accounts exist.
- **The handoff is domain-agnostic.** Whatever the fronts end up being called under `.vio.live` (or elsewhere), one-time codes keep working; an apex cookie would not survive a domain split.

## Consequences

### Positive

- One account for both products; "log in once, jump fronts" becomes possible (F4).
- The dashboard gets real authentication — today it is effectively open to anyone who can reach it and type an id.
- No new runtime coupling between backends; either product can deploy/fail independently.
- Sets up the future unified frontend: identity is solved before any UI merge is attempted.

### Negative

- Vio depends on a Firebase project administered on the Commerce side: adding authorized domains, creating service accounts, provider config all require console access there. Mitigation: get Angelo/Vio admin access to the project, document in `infrastructure/overview.md`.
- Deeper Firebase lock-in. Mitigated: ID tokens are standard OIDC JWTs; the verification middleware would survive a move to any OIDC IdP with two constant changes (issuer/JWKS URL).
- Local dev now needs either a real QA account or the Firebase Auth emulator (the simulated-session ergonomics are lost in F2). Mitigation: document a test account or wire the emulator before F2 ships.

### Neutral

- `POST /api/auth/token` (apiKey → JWT for client apps / SDK surface) is a different concern (app auth, not operator auth) and is untouched by this ADR.

## Alternatives considered

### A — A new neutral IdP (GCP Identity Platform tenants, Auth0, Cognito)

Rejected for now. It migrates the *working* Commerce user base for zero user-visible value, and adds a third party to administer. Revisit only if multi-tenancy requirements (partner-managed operator pools) outgrow plain Firebase Auth.

### B — Vio rolls its own username/password auth

Rejected. Produces exactly the "two accounts" state this effort exists to avoid, and we'd own password storage/reset/2FA for no benefit.

### C — Merge the backends

Rejected by owner direction: services stay separate. Identity sharing does not require it (see Decision §2).

### D — Apex session cookie on `.vio.live` as the primary mechanism

Deferred. Ties identity to a single apex domain, adds CSRF surface across products, and is harder to roll back than code handoff. Reconsider as an optimization once both fronts are stable under `.vio.live` and F4 is proven.

## See also

- Spike PR: [tipiodevelopment/socket-server#40](https://github.com/tipiodevelopment/socket-server/pull/40) — middleware (`server/middleware/firebase-auth.ts`), `GET /api/auth/me`, `/firebase-login` page, 8 unit tests + live E2E vs `reachu-qa`.
- `socket-server/client/src/contexts/UserContext.tsx` — the simulated session F2 replaces.
- [`infrastructure/overview.md`](../infrastructure/overview.md) — deployed services; add the Firebase project + console access there when F2 lands.
- [ADR-0001](./0001-no-auto-merge.md) — PR/merge discipline this work follows.
