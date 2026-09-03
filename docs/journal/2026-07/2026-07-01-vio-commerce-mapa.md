---
date: 2026-07-01
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-07-01 — Mapeo y documentación del backend Vio Commerce

## Goal
Angelo pidió documentar la infraestructura de **vio-commerce** (repos, cómo está
planteado, cómo funciona) tanto en el handbook como en la memoria del agente. Arrancamos
con 5 repos clonados a mano; el objetivo creció a mapear **todo el backend core**.

## Done
- **Clonados los 5 repos iniciales** + investigado su arquitectura real (no solo listar
  módulos): puertos, bootstrap NestJS, config, DB pool, comunicación inter-servicio, Helm.
- **Encontrados y clonados los repos faltantes** vía `gh repo list vio-live`: `graphql`,
  `vio-api-microservice`, `vio-orders-microservice`, `vio-users-microservice`,
  `vio-extensions-microservice`, `vio-tracking-microservice`, `vio-template-microservice`,
  `vio-middleware-microservice`. Backend commerce core = **completo** localmente.
- **Doc nuevo:** [`docs/architecture/vio-commerce.md`](../../architecture/vio-commerce.md)
  — linaje Outshifter→Reachu→Vio, strangler-fig (base-api monolito → microservicios),
  tabla de 11 microservicios + 2 gateways (REST `base-api` + GraphQL `vio-graphql`),
  kernel `@reachu/*`, comunicación HTTP service-to-service, deployment AKS/MySQL, gotchas.
- **Cross-links** desde `README.md` (índice) y `architecture/system-overview.md`.
- **Memoria del agente:** puntero de 1 línea en el `CLAUDE.md` global (respetando reglas
  de capas — el conocimiento durable queda acá, no duplicado).

## Decisions / hallazgos
- **`extensions` ≠ `payment-processors`.** Son dos repos/servicios distintos: extensions =
  conectores de canal (bigcommerce/magento/shopify/woo); payment-processors = pagos
  (stripe/klarna/vipps). Confunde porque el `package.json` de payment-processors se llama
  `vio-extensions-microservice` (forkeado del starter de extensions). **No confiar en el
  `name`, mirar los módulos.**
- **El kernel `@reachu/*` son repos** `package-config/database/definitions/logger/service/utils/testing`
  en `vio-live`, publicados a un registro npm privado (v1.0.212). No es caja negra.
- **Dos gateways:** `base-api` (Express REST legacy) y `graphql` (Apollo). Frontend nuevo
  debería ir por GraphQL; legacy sigue en base-api hasta terminar de migrar.
- **MySQL aquí, no Postgres** — ojo, el socket-server / resto de Vio backend usa Neon/Postgres.

## Blockers / open questions
- Para buildear cualquier microservicio local hace falta **auth al registro npm `@reachu`
  privado**. Pendiente documentar dónde vive ese token / `.npmrc` de CI.
- `extensions` vs `payment-processors` aparecen como **paths separados** en el routing de
  prod (`/extensions` y `/payment-processors`) — confirmar ambos desplegados.

## Next session
- **Bajar un nivel:** leer la lógica real de `shopcart/checkout` + `orders` para documentar
  los **flujos de negocio** (no solo la topología). Empezar por el flujo de checkout end-to-end.
- Considerar clonar/documentar `vio-infra-tf` (Terraform) para cerrar el loop infra↔código.

## Nota housekeeping
Al commitear se encontró un journal huérfano `docs/journal/2026-06/2026-06-11.md` (sesión
Kotlin-review del 2026-06-11) que nunca se había commiteado — se rescató en commit aparte.
