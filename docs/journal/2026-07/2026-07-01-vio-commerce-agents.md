---
date: 2026-07-01
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-07-01 — Estructura de agentes vio-commerce + deep-dive de los 13 servicios

Segunda sesión del día (la primera: `2026-07-01.md`, mapeo inicial). Angelo pidió montar una
**estructura de agentes-experto por microservicio** para poder apoyarse en ellos, con control
del código, y documentar todo en el handbook.

## Goal
- Workspace `~/vio-commerce/` con un agente-experto por servicio (read+write, scopeado a 1 repo).
- Poblarlos con conocimiento real: deep-dive de los 13 servicios → un brief profundo por servicio.
- Que agentes + orquestador escriban journal en el handbook y sigan la regla de no-push-sin-OK.

## Done
- **Workspace `~/vio-commerce/`** (git local): `README`, `CONVENTIONS`, `ORCHESTRATION`,
  `FINDINGS`, `.claude/agents/` (13 agentes `svc-*`), `briefs/` (13 briefs, ~3.300 líneas),
  `repos/` (symlinks a los repos reales) y `handbook/` (symlink al vio-handbook).
- **Deep-dive en paralelo:** 13 agentes leyeron a fondo cada repo y escribieron su brief.
- **Journaling rule** incorporada a `CONVENTIONS.md`, `ORCHESTRATION.md` y a cada agente:
  si hacen algo sustantivo escriben entry en `docs/journal/`, con naming anti-colisión
  (`AAAA-MM-DD-<svc>-<slug>`), y **nunca push/PR sin OK** (ADR-0001).
- **Doc de arquitectura corregido** (`architecture/vio-commerce.md`, PR #5) con los hallazgos.

## Decisions / hallazgos que corrigen el mapa
- **Bus híbrido, no todo HTTP:** `orders` y `products` consumen **Azure Service Bus** (con
  restos de AWS SQS muerto). Antes el doc decía "no hay message bus".
- **BD MySQL compartida, NO database-per-service:** entities/repos en `@reachu/database`,
  schema canónico (~54 entities) + migraciones en `base-api`.
- **Roles mal supuestos, corregidos:** `tracking` = proxy de analítica a **Mixpanel** (no
  envíos); `middleware` = **gate de auth central** forward-auth (no proxy); `template` =
  motor de mapeo de integraciones con plantillas JSON en **S3**.
- **Pagos:** los **inicia `shopcart`** + confirma por webhook; `payment-processors` solo
  hace capture/cancel/refund post-auth (no inicia, no tiene webhooks).
- **Dominio = marketplace/dropshipping** (reseller vende, supplier surte, fee `OUTSHIFTER_FEE`).
- **Drift de versión del kernel `@reachu/*`:** 1.0.212 (mayoría) / 1.0.219 (extensions) / 1.0.227 (api).

## Blockers / riesgos (detalle en `~/vio-commerce/FINDINGS.md`)
- **Secretos commiteados** (`.env.test` con claves reales + Firebase private key) en varios
  repos → **rotar**.
- **Webhooks de pago sin verificación de firma** (shopcart, users Stripe).
- **`graphql` reintenta mutaciones no idempotentes** (`axios-retry retryCondition: () => true`)
  → riesgo de doble-cobro.
- **Tax/VAT inconsistente** (25% Klarna / 0% Vipps / dos métodos de cálculo) y **moneda base
  divergente** (products NOK vs orders EUR).
- **3 bugs localizados** con archivo:línea (shopcart checkout.service.ts:1609; template
  data-mapping.service.ts:625; extensions regex import Woo con `ˆ` U+02C6).

## Next session
- Trabajo de **investigación** (lo que viene) — usar los agentes `svc-*` y documentar
  hallazgos aquí en el journal + en los briefs.
- Pendiente decisión de Angelo: ¿subir `~/vio-commerce` a un repo `vio-live` o dejarlo local?
- Traer el kernel `@reachu/database` (repo `package-database`) para auditar el schema canónico real.
