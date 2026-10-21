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

## Apps de Shopify y cierre (09:28 UTC)

- Apps de clientes (`custom/client-app`): Careless, Gladkokken y Makeupmekka ya con `refunds/create` y activo = repo;
  demo y `vio-client` desplegadas hoy (`vio-sync-3`). Comprobado con `shopify app config pull`.
- Apps públicas: versiones creadas sin publicar; el CLI pedía confirmar un borrado. Leído el resumen en una terminal
  simulada (cancelando con Ctrl-C): solo `events (removed)`, el módulo declarado vacío. Las publicó Angelo; activas con
  `refunds/create` y la privacidad intacta. Error mío por el camino: creí que faltaban los webhooks de privacidad (estaban
  en `[webhooks.privacy_compliance]`, que no leí); PR #126 revertido en #127 sin llegar a desplegar.
- Credenciales del `.env.test`: comparación hecha (Angelo).

## Cierre de la sesión (19–21/10)

Tres días, tres journals: [19/10 noche](./2026-10-19-analytics-avanzado-fase-a-b-noche.md) (ADR-0035 A y B a staging,
tarjetas de QA para Alan), [20/10](./2026-10-20-adr-0036-compensaciones-a-staging.md) (ADR-0036 de punta a punta, la clave
del pedido, la regresión de Stripe) y este (release a prod con Miguel, credenciales, apps de Shopify).

- **Prod al día**: 15 repos, kernel 1.0.280, migraciones, colector, variables; apps de Shopify publicadas.
- **Credenciales del `.env.test`**: Miguel hizo la comparación; Angelo decidió **no rotar nada** (AfterShip y Postmen sin
  uso, Vipps de test). El código que lee esas claves sigue desplegado (nota de Miguel en el canal, 21/10 08:58 UTC).
- **Feedback de Angelo** (20/10): tardaba demasiado en llevar cosas a staging y dejaba PRs a medias. Desde ahí: QA es
  para probar (tests + diff leído → merge y deploy), revisión independiente solo en dinero/auth/aislamiento y en
  paralelo, una ronda, y ningún PR abierto sin decisión al cerrar. Los PRs viejos (#73, #78, #110) se cerraron o
  anotaron ese mismo día.
- **Lecciones nuevas**: [propiedad sin `@Column` rompe el `addSelect`](../../lessons/propiedad-sin-column-rompe-el-addselect.md);
  notas en el playbook del kernel (cambio de un solo paquete) y en el de apps de Shopify (desplegar sin borrar).

## Next session

- Prueba real de ADR-0036 en prod (compra + cancelación) cuando haya surface y campaña en prod.
- Alan: las ocho tarjetas de QA del 20/10; repetir dos pestañas con Stripe tras #96.
- Seguimientos: durabilidad de las compensaciones (outbox/reconciliador), test de `addSelect` contra la metadata de
  TypeORM, `privacyMode` en `/v2/mobile/config`, `BAD_USER_INPUT` del gateway como 400, renovación de tokens del app de
  desarrollo de Shopify, SDK #88 y #78 aparcados.
