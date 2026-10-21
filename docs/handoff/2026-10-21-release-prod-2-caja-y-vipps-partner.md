---
title: "Release a prod del 21/10, segunda tanda: la caja, el barrido, Vipps partnership y alta con Google"
date: 2026-10-21
owner: angelo
author: claude
status: live
---

# Release a prod del 21/10, segunda tanda

Angelo (21/10, tarde): «ve preparando para enviar todo a prod. Lo que Miguel tenga que hacer me lo dices, pero
después tú te encargas de todo». Primera tanda de hoy:
[release del 21/10](./2026-10-21-release-prod-analytics-y-atribucion.md). Canal con Miguel:
[coordinación](./2026-10-19-coordinacion-claude-miguel.md).

## 1. Qué entra

Todo lo que se mergeó a `develop` después de la primera tanda. Kernel sin cambios (1.0.280) y sin migraciones.

| Repo | PR de release | Qué trae |
|---|---|---|
| vio-api-microservice | [#55](https://github.com/vio-live/vio-api-microservice/pull/55) | #51–#54: Vipps partnership desde Vio, la fila de Vipps conserva webhook y unidad |
| vio-base-api | [#49](https://github.com/vio-live/vio-base-api/pull/49) | #48: proxy admin de la partnership |
| vio-users-microservice | [#27](https://github.com/vio-live/vio-users-microservice/pull/27) | #26: el alta con Google ya no falla |
| vio-orders-microservice | [#38](https://github.com/vio-live/vio-orders-microservice/pull/38) | #33–#36: `order_paid` (ADR-0038), el barrido y su CronJob |
| vio-campaigns-microservice | [#26](https://github.com/vio-live/vio-campaigns-microservice/pull/26) | #25: toda campaña nace con el 15 % del publisher |
| webapp-vio-commerce | [#76](https://github.com/vio-live/webapp-vio-commerce/pull/76) | #72–#75: página Vio team › Vipps partner y la caja en el home |
| google-merchant-feed | [#6](https://github.com/vio-live/google-merchant-feed/pull/6) | runtime nodejs22: Google retira nodejs20 el 30/10 |

- **Orders va por una rama de release.** `master` tiene su propio chart: 2 réplicas, registry `vioprodsc` y más
  recursos. El PR de develop chocaba en el chart (#37, cerrado). #38 es develop con master mergeado: `values.yaml` de
  prod más el bloque `reconcile`, y el `.tgz` reempaquetado con eso y los templates de develop. Comprobado
  extrayéndolo.
- **El colector ya está al día en prod** (`67501a2`, Miguel, 11:00 UTC): `order_paid` y `/v1/internal/seen` existen.
- **El CronJob del barrido** llama a orders dentro del cluster, sin credenciales propias. Usa la imagen
  `curlimages/curl:8.22.0` de Docker Hub, que en QA baja sin problema.

## 2. Decisiones de Angelo

| # | Decisión | Recomendación |
|---|---|---|
| D1 | Claves de plataforma `VIPPS_CLIENT_*` de prod (decisión 2 del [go-live de Vipps](../partners/vipps/go-live-produccion.md)). Nadie sabe de qué unidad son; con la URL real, un vendedor sin fila propia cobraría con ellas | **Vaciarlas**: en prod solo cobra quien tiene su fila |
| D2 | Modo de captura de Careless | *At shipment* si su tienda manda tracking; *at payment* si no |
| D3 | Rol de admin en prod para la cuenta del equipo de Vio. La página Vipps partner lo exige. `user_role` de prod está vacío | Sí, solo a esa cuenta. El publisher sigue esperando al plugin |

## 3. Paso 1 — Miguel (antes de los merges)

1. **Correos apagados en prod** (Angelo, 21/10: «los mails siempre apagados»): quitar `EMAIL_DELIVERY=on` de
   orders, users y api. Secret y blob, recrear pods, comprobar que la línea ya no está (contar, no imprimir).
2. **Vipps, fase 3** del [go-live](../partners/vipps/go-live-produccion.md#fase-3--configuración-de-producción-miguel):
   - probar las partner keys contra `https://api.vipps.no/accesstoken/get` y mirar solo el código (200);
   - `VIPPS_API_URL=https://api.vipps.no` en shopcart, api, payment-processors, base-api, orders y users;
   - `VIPPS_PARTNER_CLIENT_ID`, `VIPPS_PARTNER_CLIENT_SECRET` y `VIPPS_PARTNER_SUBSCRIPTION_KEY` en shopcart y api;
   - `VIPPS_CLIENT_*` según D1;
   - recrear pods y contar las líneas en el `.env` montado.
3. **Webhook de partner:** port-forward a `deploy/shopcart` de prod (puerto 8000), `POST
   /checkout/register/webhook/vipps` con `{"scope":"partner"}`. El secreto que devuelve, una sola vez, va a
   `VIPPS_PARTNER_WEBHOOK_SECRET` de shopcart; recrear shopcart. `GET /checkout/webhook/vipps?scope=partner` tiene que
   dar una sola registración apuntando a `api-ecom.vio.live`.
4. **Antes de cambiar la URL:** mirar qué brands de prod tienen Vipps activo y con qué MSN. Hoy prod apunta a
   `apitest.vipps.no` con el MSN de test 225388: una fila con un MSN de test deja de cobrar con la URL real.
5. **Si D3 es sí:** rol 1 en `user_role` de prod a la cuenta que diga Angelo.
6. Avisar en el canal.

## 4. Paso 2 — claude: datos en QA (hecho)

- Comisión por defecto en las campañas que ya existían:
  [`m-commission-default.js`](./assets/2026-10-21-prod-2/m-commission-default.js), idempotente, con `DRY_RUN=1`.
  **QA, 21/10:** 9 campañas de NULL a 15, la 12 ya tenía 15; quedan 10 con 15.

## 5. Paso 3 — claude: código a prod

Cuando Miguel avise. Orden, con unos 2 minutos entre merges y verificación de cada pod (kernel 1.0.280, sin errores
de arranque):

1. api #55 → base-api #49 → users #27 → orders #38 → campaigns #26.
2. webapp #76 al final (Vercel `master`).
3. google-merchant-feed #6 (independiente).

## 6. Paso 4 — claude: después de los merges

1. **Comisión en prod:** el mismo script, primero `DRY_RUN=1`. Prod no tiene campañas todavía: lo normal es 0 filas.
2. **CronJob en prod:** `kubectl get cronjob` lista `orders-reconcile`; la primera vuelta sale `Completed` con
   `http_status=200` en su log.
3. **Correos:** con orders, users y api recreados, una línea `[mailService] … skipped` en lugar de un envío.
4. **Página Vipps partner** en el dashboard de prod: carga para la cuenta admin (si D3).

## 7. Paso 5 — Careless en prod (claude con Angelo)

Con la fase 3 hecha y D2 decidida, desde Vio team › Vipps partner:

1. Elegir Careless → *Set up* con el nº de organización 928540650, Express encendido, envío y captura según D2.
2. *Find its sales units in Vipps* → tiene que salir «Careless AS», MSN 1179558.
3. *Assign* → la página comprueba con la Management API que la unidad es de esa organización y enciende Vipps.
4. Prueba con dinero real: Angelo (fase 5 del go-live).

## 8. Rollback

- **Código:** revertir el merge en la rama de prod del repo; el push vuelve a desplegar la versión anterior.
- **Variables:** Miguel restaura el Secret anterior y recrea los pods.
- **Comisión:** el script solo cambió filas en NULL; volver atrás es poner NULL en esas mismas ids (QA: 2–5 y 7–11).

## 9. Fuera de este release

- El publisher de prod y la prueba del flujo: esperan al plugin (Angelo, 21/10).
- Replit: en QA. Vev no necesita rebundle por la SDK 0.26.1.
