---
date: 2026-10-21
session: "Sin campaña activa, la página web o de Vev sigue vendiendo"
participants: [angelo, claude]
status: live
---

# Sin campaña activa, la página sigue vendiendo (ADR-0037)

## Goal

Alan lo dejó como observación en la QA del 20/10, en la tarjeta «Estrés y casos raros»: con la
campaña por defecto terminada y la página todavía publicada, los bloques de Vio se quedaban en el
esqueleto gris para siempre, y `config` respondía `404 NO_ACTIVE_CAMPAIGN`. Angelo eligió que la
página siga vendiendo con los productos de la surface
([ADR-0037](../../decisions/0037-sin-campana-activa-la-pagina-web-sigue-vendiendo.md)).

## Done

- **Causa, confirmada en código y en la captura de Alan.** El micro respondía 404 y Vio Config no
  recibía sponsor; `useVioProduct` de Vev espera sin límite a tener sponsor.
- **vio-campaigns-microservice [#24](https://github.com/vio-live/vio-campaigns-microservice/pull/24)**
  (`715f1f0`):
  - para `web`, `custom-web` y `vev`, sin campaña activa, la config responde 200 con
    `campaign: null`, `campaigns: []`, `noActiveCampaign: true` y un sponsor por brand de los
    channels activos y de una sola brand de la surface;
  - nativos, TV o sin `platform` siguen con el 404;
  - 301/301 tests, 8 nuevos.
- **vio-web-sdk [#89](https://github.com/vio-live/vio-web-sdk/pull/89)** (`235cb87`):
  `Vio.attribution()` sin campaña toma el sponsor de `primarySponsor`, y el tipo admite
  `campaign: null`. Los 16 tests que fallan en `cart-manager.quantity`, `klarna-confirm` y
  `vio-cart.stepper.dom` fallan igual en `main` sin el cambio.
- **Verificado en QA** (07:31 UTC, pod nuevo con `configWithoutCampaign`). Con la surface 8 de
  Alan, que tiene un channel y ninguna campaña:
  - `platform=vev` y `web` → 200, `campaign: null` y sponsor 1333 con el channel 508 (Stripe y
    Vipps);
  - `platform=ios` → 404.
- Respuesta a Alan en su tarjeta, con los pasos para volver a probar. Basta con recargar la
  página; no hace falta republicar.

## Blockers

- ~~Release del SDK en npm (0.26.1)~~ **Publicada el 21/10 (~08:15 UTC)**, con el OK de Angelo
  ([#90](https://github.com/vio-live/vio-web-sdk/pull/90), `latest` = 0.26.1). El shasum
  `fbf1f29…` de npm coincide con el tarball que se construyó desde `main`.
  - El token de lectura de `~/.npmrc` no puede publicar en `@vio-live` (404 al hacer el PUT).
  - Hizo falta el `npm login` de Angelo y su verificación en dos pasos (`--auth-type=web`).

## Next session

- En producción, con la próxima release del micro de campañas.

## Staging al día con lo de ayer (21/10, 07:40–08:10 UTC)

- **Lo que estaba sin desplegar.** El bump automático del kernel a **1.0.280** entró en `develop`
  de todos los micros a las 23:28 UTC del 20/10, con QA ya apagado. Sus CI/CD fallaron en el paso
  Deploy (`kubernetes cluster unreachable`), aunque el build sí se hizo. Staging se quedó con las
  imágenes anteriores en 11 servicios: api, users, products, payment-processors, middleware,
  tracking, template, collection, extensions, orders y shopcart. Con ellos quedaba fuera también
  extensions #29, mergeado a las 23:21.
- **Lo que se hizo:** `gh run rerun --failed` de los 11 runs con QA ya encendido. Todos verdes, y
  los 11 pods recreados con `@vio-/database` 1.0.280 comprobado dentro de cada uno.
  - Sin `Unknown column`, `Cannot find module` ni `QueryFailedError` en el arranque.
  - `api-ecom-staging`, `dashboard-staging` y `api-staging/health` responden 200.
  - campaigns, base-api y graphql ya estaban al día.
- **Vev** sigue en la **0.336** (SDK 0.26.0, rebundle de ayer). El arreglo de SDK #89 no hace
  falta en Vev, porque Vev resuelve el sponsor por su cuenta; entra con el próximo rebundle.
- **Ojo para la próxima:** un merge a `develop` entre las 23:00 y las 06:00 UTC, o en fin de
  semana, no se despliega y no avisa: hay que relanzar el deploy al despertar QA.
