---
title: "ADR-0009: Analytics — independent collector, closed contract, swappable vendors"
last-updated: 2026-08-20
owner: angelo
status: live
---

# ADR-0009: Analytics — independent collector, closed contract, swappable vendors

## Context

Vio needed platform-wide telemetry (impressions, clicks, commerce funnel,
attribution) across every surface: web SDK (embedded in Vev, Replit or custom
sites), iOS/tvOS, Android/Android TV, and server-side truths only the backend
sees (shoppable-ad activations, TV cart intents). Requirements set by Angelo
(2026-08-19): multi-channel, scalable, **independent from the other systems**,
consumable by both dashboards (Vio operator console + commerce webapp) with
per-user-type scoping, impressions first-class, and **Mixpanel usable now but
replaceable later**.

The pre-existing state was the anti-pattern: the native SDKs talked to
Mixpanel directly (SDK-embedded vendor), meaning vendor lock-in in shipped
binaries and no raw data ownership.

## Decision

1. **One collector service, its own repo** — `vio-live/vio-analytics`
   (Fastify 5 · TS strict · Zod · pnpm · Vitest · Biome · Node 22). NOT a
   folder inside vio-backend: the only argument for colocating (shared
   types) was weak — every other SDK consumer lives in another repo and
   re-declares the contract anyway, and the backend only needs to build
   JSON (the collector validates everything at ingest). Own repo = own
   deploy cycle, own deps/lockfile, own failure domain.
2. **Closed contract v1** (`src/contract/analytics-schema.ts` +
   `docs/EVENTS_CONTRACT.md` in the collector repo — the executable Zod is
   the source of truth): 17 event names (7 commerce GA4-compatible, 6
   engagement, 2 session, 2 server-only), snake_case wire, additive-only
   evolution (server deploys before clients; breaking → `/v2/events`).
   Unknown names are rejected at the edge — noise cannot enter.
3. **Clients never talk to vendors.** Every surface POSTs to
   `/v1/events`. Vendors are `VendorSink` implementations behind the
   collector (Mixpanel today): flag-gated, async, allowed to fail without
   blocking ingestion. Removing/swapping a vendor = a server-side change
   with zero client releases; backfill for a new vendor reads ClickHouse.
4. **ClickHouse is the system of record** (raw, ours, 2-year TTL; one wide
   table per environment database, `ReplacingMergeTree` keyed so retried
   `event_id`s dedupe). Postgres stores **no** events — the collector only
   reads `client_apps` for api-key auth (60s TTL cache).
5. **Tenant is never client-claimed**: `client_app_id` is resolved
   server-side from the api key. The one exception is the internal-token
   path (`X-Internal-Token`), for callers that did their own authz: the
   vio-backend outbox mirror (write) and the dashboard stats proxy (read).
6. **Identity model on events**: `surface` (platform) + `host` (where
   embedded: vev/replit/custom) are separate axes; `anon_id` (persistent,
   random, no PII) + `session_id` (rolling 30 min) always; opaque
   `external_user_id` only via explicit `identify()` — **PII (emails)
   never reaches the collector**.
7. **Anti-double-count**: clients only report what the server can't see
   (votes/participations are server truth); `ad_activation`/`cart_intent`
   arrive only via the backend's transactional outbox with
   `surface:'server'` — unforgeable by clients (schema-enforced).
8. **Impression rule fixed in the contract** so numbers are comparable
   across platforms: ≥50% visible for ≥1s, once per (session, component),
   scroll-back never re-counts.
9. **Dashboards read through their own backends** (e.g. vio-backend's
   `/api/analytics/vio/*` proxy): the backend does operator authz
   (ADR-0007/0008 world) and calls `/v1/stats/*` with the internal token
   naming the resolved tenant. The collector stays ignorant of Vio's
   operator/role model — consuming an API is not coupling to it.

## Alternatives considered

- **Mixpanel/vendor SDKs in clients** (status quo): vendor lock-in shipped
  in binaries, no raw ownership, per-event pricing forever. Rejected.
- **Managed ingestion (Tinybird/RudderStack)**: dies on custom api-key auth
  against our Postgres and on raw-data ownership. Rejected.
- **Collector inside vio-backend** (`analytics-server/`, the original plan):
  built first, then discarded same-day for the standalone repo (see
  Context of repo choice above).
- **NestJS** (org convention in commerce): DI/decorator overhead buys
  nothing on a hot ingest path; platform side maintains plain TS. Fastify.

## Consequences

- Adding an event name is a **contract decision** (edit Zod + doc, deploy
  collector first, then SDKs) — friction is deliberate.
- Each new surface implements the same mechanics natively (see the
  per-platform table in `EVENTS_CONTRACT.md`); the wire never changes.
- The read-side (`/v1/stats/*`) is the single query surface for both
  dashboards; direct ClickHouse access stays operational/ad-hoc only.
- Everything downstream (live ops, sponsor reports, A/B, frequency capping,
  partner exports) becomes possible because the raw data is ours.
