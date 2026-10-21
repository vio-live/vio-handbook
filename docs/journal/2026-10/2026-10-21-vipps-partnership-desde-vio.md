---
date: 2026-10-21
session: "Vipps por la partnership, configurado por el equipo de Vio"
participants: [angelo, claude]
status: live
---

# El equipo de Vio arma el Vipps de una brand (partnership + MSN)

## Goal

Ya tenemos las partner keys de producción, verificadas el 21/10
([go-live](../../partners/vipps/go-live-produccion.md), fase 2). Pero las brands, como Careless, no
entran al dashboard de Vio, y el dashboard de Aller no tiene opciones de pago. Angelo pidió soportar
la configuración con el MSN desde nuestro lado. Asignar la unidad por port-forward
(`PATCH /paymentmethod/:id/vipps-sales-unit`) no escala.

## Done

- **Bug previo: guardar el formulario de Vipps borraba lo del servidor.**
  vio-api-microservice [#51](https://github.com/vio-live/vio-api-microservice/pull/51) (`0027e9e`):
  - Al guardar el formulario se perdían el MSN asignado y el secreto del webhook.
  - Además, un vendedor podía fijarse su propio MSN en modo partner.
  - Ahora `withVippsServerFields` conserva esos campos al crear, editar y verificar, en
    `providers/vipps-server-fields.ts`.
- **api-ms: endpoints internos de la partnership.**
  vio-api-microservice [#52](https://github.com/vio-live/vio-api-microservice/pull/52), en
  `/paymentmethod/vipps-partnership/...`:
  - lista de brands con su estado: `not-set-up`, `own-keys`, `waiting-sales-unit`, `switched-off`,
    `live`;
  - set up de la fila en modo partner, con Express, envío, captura y nº de organización. Devuelve
    409 `OWN_KEYS` si la brand cobra con claves propias;
  - lookup de las sales units de una organización con la Management API. Solo corre en producción y
    usa únicamente `VIPPS_PARTNER_*`;
  - asignación del MSN. En producción comprueba antes que la unidad sea de la organización de la
    brand (`SALES_UNIT_NOT_FOUND`, `ORG_NUMBER_MISSING`, `SALES_UNIT_NOT_OF_BRAND`). Después
    enciende el switch de Vipps de la cuenta.
- **base-api: rutas de admin.**
  vio-base-api [#48](https://github.com/vio-live/vio-base-api/pull/48):
  - `/api/admin/vipps/...`, con `verifyToken` + `verifyAdminUser`;
  - reenvía solo los ajustes de la partnership y nunca claves;
  - el status y el body de api-ms vuelven tal cual.
- **webapp: la página.**
  webapp-vio-commerce [#72](https://github.com/vio-live/webapp-vio-commerce/pull/72) (`1c5576c`):
  - **Vio team › Vipps partner** (`/vipps-partner`);
  - regla nueva `VIO_TEAM` en `src/lib/access.js`: solo cuentas `internal`. A diferencia del resto
    de secciones, queda **oculta sin cuenta de Vio**.
- **Verificado en QA:**
  - api-ms responde 455 brands, dos en vivo por partnership (Bohus 1322 y el demo de Aller 1289,
    ambos en la unidad de prueba NewCo 545865);
  - la lookup responde `available: false` (QA no tiene partner keys);
  - desde el pod de base-api, con su propio `.env`, el proxy llega a api-ms (200);
  - `/api/admin/vipps/*` sin token o con un token inválido → 401;
  - staging (`dashboard-staging.ecom.vio.live/vipps-partner`) redirige a login sin errores de
    consola.
  - Tests: api 13 + 6 nuevos, base-api 26 nuevos (564/564 en total), webapp 13 nuevos más la matriz.

## Decisions

- La página es solo del equipo de Vio. El webapp decide quién **ve** la entrada (tipo `internal`
  de `/auth/me`) y base-api decide quién **puede** (rol 1). La brand no ve ni toca nada de esto.
- Las devoluciones y cancelaciones quedan siempre encendidas en modo partner. Los valores por
  defecto de una primera unidad son Express encendido, envío fijo y captura *at shipment*.

## Blockers

- **Todavía no está en producción.** Los cuatro PRs entraron después del release a prod del 21/10
  ([runbook](../../handoff/2026-10-21-release-prod-analytics-y-atribucion.md)). Para Careless en prod
  hacen falta un release de api, base-api y webapp, y además la fase 3 de Miguel: partner keys
  en shopcart y api, `VIPPS_API_URL` de producción y el webhook de partner.
- **Quién la usa: una sola condición, el rol 1 (Admin) activo en la base de Commerce.** El
  webapp saca el tipo de cuenta del `/auth/me` del micro de campañas, y el micro da `internal` a
  quien tiene el rol 1 (`src/adapters/commerce/account-type.ts`). base-api pide ese mismo rol.
  - En QA el rol 1 solo lo tienen cuentas de prueba viejas (`test`, `testseller`, `outshifteras`,
    `shopifysupplier`, `reachuexport1`). Darle el rol 1 a la cuenta de Angelo es un cambio de
    permisos y espera su OK.
  - En prod, según el handoff del 19/10
    ([prod sin publisher](../../handoff/2026-10-19-prod-no-hay-publisher-para-el-flow.md)),
    `user_role` estaba vacío: nadie es admin. Hace falta dar el rol 1 a la cuenta del equipo de
    Vio en la base de prod. No lo volví a comprobar.

## Next session

- Con OK de Angelo: rol 1 a su cuenta de QA y prueba de punta a punta en staging (set up de una
  brand de prueba, asignar 545865, encender y apagar).
- Release de los cuatro PRs a prod junto con la fase 3 de Vipps. Después, Careless: set up desde la
  página, lookup de la org. 928540650 y asignar 1179558.
