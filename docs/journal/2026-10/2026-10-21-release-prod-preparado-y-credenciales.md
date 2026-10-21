---
date: 2026-10-21
session: "Preparar el release a prod de ADR-0034/35/36 con Miguel; credenciales del .env.test de extensions y logs sin tokens"
participants: [angelo, claude, miguel]
status: live
---

# Release a prod preparado y credenciales fuera de los logs

## Goal

Angelo (20/10 noche): *«prepara el paso a prod, lo coordinamos con Miguel, y tenemos que dejar las apps de Shopify
listas»*, y después *«haz del 1 al 4 y sube los cambios; después coordina con Miguel para que mientras estoy fuera
subáis a prod»*.

## Done

- **Runbook** [`2026-10-21-release-prod-analytics-y-atribucion.md`](../../handoff/2026-10-21-release-prod-analytics-y-atribucion.md)
  y **15 PRs de release** `develop → master/main`, todos MERGEABLE. Unificado con el plan de Miguel
  ([`2026-10-21-plan-de-subida-a-prod.md`](../../handoff/2026-10-21-plan-de-subida-a-prod.md)): orden con **orders antes
  que shopcart** y alcance completo (no solo 3 servicios).
- **Inventario de prod** (solo lectura): kernel 1.0.273 (campaigns 1.0.275), última migración `1792100000000`, 0
  órdenes desde el 16/10, colector del 16/10, backup externo colgado 7 días.
- **Script de prod corregido**: `m-cart-attribution-prod.js` leía `.env.local` (en prod el pod solo tiene `.env`).
- **Credenciales** (pasos 1–4 que pidió Angelo):
  1. `.env.test` de extensions con valores de mentira (extensions
     [#29](https://github.com/vio-live/vio-extensions-microservice/pull/29), develop).
  2. Comparación con prod por hash: **bloqueada para claude** por el control de seguridad (explorar credenciales);
     queda para Miguel con [`cmp-envtest-vs-prod.py`](../../handoff/assets/2026-10-21-prod/cmp-envtest-vs-prod.py),
     que solo imprime nombres.
  3. Rotar solo lo que coincida con prod: Miguel, según el resultado.
  4. No se reescribe el historial (repo privado).
- **Logs sin credenciales**: kernel **1.0.280** (`package-logger` [#10](https://github.com/vio-live/package-logger/pull/10),
  `redactSecrets` en los volcados INIT/FINISH de los 12 micros) publicado con `pkg=all` (merge con `[skip ci]` para no
  disparar el release de un solo paquete) y extensions #29 en `findProductById`/`findAllProducts`.
- **Shopify**: vio-shopify-sync #110 (`refunds/create` en `vio-sync` y `vio-sync-staging`) en master; los apps de clientes
  ya lo tenían. Falta el `shopify app deploy` de los dos (persona con CLI, paso 6).
- Mergeados de Miguel: `campaigns#22` (timeout de helm 15 min) y `google-merchant-feed#5` (nodejs22 antes del 30/10).
- Vercel: resuelto por Angelo (cuenta en el team).

## Decisions

- Un solo runbook; Miguel ejecuta pasos 1–4 y 6, claude el 5; verificación final juntos. La prueba de ADR-0036 con una
  compra y una cancelación reales en prod queda para Angelo (prod sin tráfico ni métodos de pago).
- `BUYER_REF_SECRET` de prod nuevo y para siempre (D2).

## Blockers / lecciones

- El workflow del kernel propaga a los micros la versión de `package-database`: un cambio en un solo paquete se
  publicaría pero no llegaría a nadie. Para eso: merge con `[skip ci]` + `pkg=all`.
- QA se apaga a las 23:00 UTC: los deploys de develop de la noche salen rojos (esperado).

## Next session

- Miguel: «pasos 1–4 hechos» en el canal → claude mergea el paso 5 → Miguel paso 6 → verificación juntos.
- Angelo: prueba real en prod; resultado de la comparación de credenciales; republicar páginas de prod en Vev.

## Ejecutado (21/10 08:00–09:06 UTC)

Miguel: punto de restauración (`pre-release-20261021`), las tres migraciones, variables (orders y shopcart; base-api ya
tenía las suyas) y colector `132887e` en `events.vio.live`, todo verificado. claude: los 15 PRs de release mergeados en
el orden del runbook, CI/CD en verde, pods 2/2 con kernel 1.0.280 y 0 errores de arranque; webapp en Vercel prod sin
bloqueo. Logs de prod: 0 credenciales en claro desde el deploy, 35 `[redacted]` en extensions. Pendiente: `shopify app
deploy` de los dos apps, comparación de credenciales y prueba real de ADR-0036 (prod sin surfaces ni campañas).
