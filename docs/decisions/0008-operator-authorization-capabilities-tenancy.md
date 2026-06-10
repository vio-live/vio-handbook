---
title: "ADR-0008: Operator authorization — capability model + tenancy"
last-updated: 2026-06-10
owner: angelo
status: live
---

# ADR-0008: Operator authorization — capability model + tenancy

## Context

[ADR-0007](./0007-firebase-auth-single-idp.md) decided *authentication* (operators
sign in with the shared Commerce Firebase project; the backend verifies the ID
token). It left *authorization* — what a signed-in operator may do — as phases
F2/F3 without committing to a model. This ADR fixes that model.

The dashboard previously had no real authorization: a simulated session upserted
a `users` row and minted a JWT, with no roles. Owner direction (2026-06-10) for
the real model:

- `super_admin` (the Vio team): sees everything, can do anything.
- `admin`: **not** global — owns and manages its own apps + sponsors only (a
  tenant).
- `operator`: for now can **only create campaigns**; capabilities to grow "step
  by step".
- `viewer`: read-only, tied to a sponsor.
- Apps/data are **divided among different admins** (the concrete trigger: split
  the real partner apps — Viaplay, TV2, VG — each under its own admin).

## Decision

Authorization is **two orthogonal axes**, not a linear role hierarchy:

1. **Capabilities** — *what kind of action*. A `role → capabilities` matrix
   (`super_admin` / `admin` / `operator` / `viewer`). v1 is deliberately coarse
   and **extensible**: granting an ability is one line in the matrix. The `/api`
   gate checks the required capability per request, re-reading the role from the
   DB each time (so role changes and de-provisioning take effect immediately).

2. **Tenancy / owner scope** — *on whose data*. `admin` is a **tenant root** that
   owns its `client_apps` and `sponsors` (via `user_id`); `operator`/`viewer`
   belong to an admin via **`users.parent_admin_id`**; `super_admin` is global.
   List/read/write are scoped to the operator's owner set; create assigns
   ownership to the operator's tenant (super_admin may target a specific admin).

The **strict allowlist** (ADR-0007) gates *who* gets a session; this ADR gates
*what they can do* once in.

The full matrix, route→capability mapping, the gate flow, and the env wiring live
in the code repo — **single source of truth:
`socket-server/docs/AUTH_AND_PERMISSIONS.md`** — to avoid drift between this
decision record and the implementation. This ADR records the *why*; that doc
records the *what*.

## Rationale

- **Capabilities beat a role-level integer.** The owner explicitly wants to define
  each role's abilities incrementally ("paso a paso"). A capability matrix lets us
  grant `operator` one more verb without re-plumbing a hierarchy, and makes "what
  can this role do?" a single readable table.
- **admin-as-tenant, not admin-sees-all.** The product is multi-brand; each
  partner/brand admin must see only its apps. A global admin would leak tenants.
  super_admin remains the only global role.
- **Tenancy on `parent_admin_id` + existing `user_id`.** Ownership already lived
  on `client_apps`/`sponsors`/`campaigns` (`user_id`); we only needed the
  operator→tenant link. Minimal schema change (one nullable FK).
- **Scope by session, not a client param.** The old dashboard passed `?userId=`;
  the server now derives scope from the authenticated operator — closes a hole
  where a client could read any tenant by changing the param.
- **Re-read role per request.** The session cookie holds only the operator id;
  role/scope come from the DB each call, so there's no stale-permission window.

## Consequences

### Positive
- Adding/most-restricting a role's abilities is a one-line, low-risk change.
- Real multi-tenant isolation on the data the dashboard lists.
- No new runtime coupling; authz is pure DB-row + matrix lookups.

### Negative / known gaps (tracked, not done)
- **Per-resource `:id` ownership is incomplete.** Only `GET /api/client-apps/:id`
  checks owner. An admin with `campaigns:read` could read another tenant's
  campaign by guessing its id (the *list* is scoped, direct-by-id and campaign
  sub-routes are not yet). Next security task — an ownership middleware over
  `/api/campaigns/:id*`, `/api/sponsors/:id`, etc.
- `viewer` is tenant-scoped, not yet scoped to its single `sponsor_id`.
- The long tail of `/api` mutations defaults to `campaigns:write` (admin+), so
  `operator`/`viewer` get 403 there until each route is classified.

### Neutral
- The apiKey/SDK surface (`/v2`, `/v1`, plus three apiKey endpoints under `/api`)
  is a separate auth layer, untouched by this model (ADR-0007 §7 / the code doc).

## Alternatives considered

- **Linear role levels (`viewer<operator<admin<super_admin`).** Rejected: it
  forces "admin sees everything ≥ operator", which contradicts admin-as-tenant,
  and makes incremental per-role grants awkward. (This was the throwaway v1 in the
  first commit; replaced by the matrix.)
- **Per-resource ACLs / sharing.** Overkill for an internal team today; revisit if
  cross-tenant sharing becomes a requirement.
- **Roles as Firebase custom claims.** Rejected as the source of truth — claims are
  cached in the token (stale on change) and capped at 1KB. Roles live in our DB;
  re-read per request. (Claims may later carry coarse cross-product flags only.)

## See also

- [ADR-0007](./0007-firebase-auth-single-idp.md) — the authentication / IdP decision this builds on.
- `socket-server/docs/AUTH_AND_PERMISSIONS.md` — the implementation reference (matrix, gate, file map, decision log).
- Implementation: socket-server PR #41 (`server/middleware/capabilities.ts`, `authz.ts`, migrations `0007`/`0008`).
- Journal [`2026-06-10`](../journal/2026-06/2026-06-10.md) — the session this was built in.
