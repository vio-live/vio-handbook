---
title: "Lesson — Vio Commerce and Vio Backend never share infrastructure, even when it's tempting"
last-updated: 2026-08-24
owner: angelo
status: live
---

# Vio Commerce and Vio Backend never share infrastructure

Nearly repeated this mistake twice in one session (2026-08-24): once by an
old dead CI pipeline, once by me reading a stale doc.

## The trap

Vio Commerce (ex-Reachu) and Vio Backend (`vio-backend`, ex `socket-server`
— the engagement/dashboard product) are **two products, two separate
Azure footprints, by owner direction** ("backends stay separate", see
[ADR-0007](../decisions/0007-firebase-auth-single-idp.md)). But they:

- live in the **same Azure subscription**
- share a **naming convention** that sounds interchangeable ("qa", "staging")
- have historically had **CI pipelines and docs that pointed the wrong way**

So it's very easy to find a resource that *looks* like it could be Vio
Backend's — an AKS cluster called `kubernetesqa`, a resource group called
`qa` — and start building on it. It isn't Vio Backend's. It's Commerce's.

## How to tell them apart, for real

**Vio Backend's own, dedicated resources** (Terraform module
`socket-server-env` in `vio-live/vio-infra-tf`):

- Resource groups: `rg-api-vio-{development,staging,production}`
- Compute: **Container Apps** (`ca-api-vio-*`), never AKS
- Registry: `acrvioapi.azurecr.io`
- Postgres: `pg-api-vio-*.postgres.database.azure.com`
- Domains: `api-{dev,staging,}.vio.live`

**Vio Commerce's resources** (do not touch for a Vio Backend task):

- AKS clusters: `vio-commerce-prod` (prod), `kubernetesqa` (QA — RG `qa`)
- Registries: `reachuprod2.azurecr.io`, `reachuqa2.azurecr.io`
- Domains: `api-ecom*.vio.live`, `graph-ql*.vio.live`, `dashboard*.vio.live`

If you're about to `kubectl` anything, or reference `kubernetesqa` /
`reachuqa2` / `rg-vio-commerce-prod` for a Vio Backend task — **stop**. That
cluster's `default` namespace is full of Commerce microservices
(`base-api`, `graph-ql`, `products`, `users`, ...). Nothing belonging to Vio
Backend should ever land there.

## Concrete near-misses (2026-08-24)

1. `vio-backend`'s `develop` branch had a `deploy.yml` (Oct 2025–Mar 2026,
   long dead) that deployed to AKS `kubernetesqa` via ACR `reachuqa2` — an
   early, abandoned attempt that was never cleaned up. Someone debugging it
   cold would reasonably assume it's the real pipeline. **It wasn't** — the
   real one lives on `main`, targets Container Apps, and had been working
   the whole time.
2. Mid-investigation, an agent read `handoff/socket-server-infra-scope.md`
   — a 14-line, Fase-1-only stub that says "Deployment AKS" — and nearly
   recreated a Kubernetes Deployment for `socket-server` **inside
   `kubernetesqa`** using a Helm chart still sitting in the repo. Caught
   only because the human operator flagged it directly. The properly
   documented, current, dedicated infra
   ([`infrastructure/azure-overview.md`](../infrastructure/azure-overview.md),
   "api-vio — Container Apps" section) was one file away.

## Rule of thumb

- **Dead/stub docs and dead CI files don't get deleted on their own.**
  Their existence is not evidence they're current. Cross-check against
  `infrastructure/azure-overview.md` (kept "live") before trusting a
  handoff/scope doc that predates it.
- **If a resource name could belong to either product, verify by resource
  group, not by vibes.** `rg-api-vio-*` = Backend. Anything else
  Commerce-shaped (`qa`, `rg-vio-commerce-prod`, `prod-reachu`) = Commerce.
- When in doubt, ask before provisioning or deploying anything — the cost
  of a wrong guess here is mixing two products' infra together, which is
  explicitly the thing ADR-0007 exists to avoid.

## See also

- [`handoff/2026-08-24-vio-backend-recovery.md`](../handoff/2026-08-24-vio-backend-recovery.md) — full session this lesson came from
- [ADR-0007](../decisions/0007-firebase-auth-single-idp.md) — "backends stay separate"
- [`infrastructure/azure-overview.md`](../infrastructure/azure-overview.md) — the authoritative current-state map
