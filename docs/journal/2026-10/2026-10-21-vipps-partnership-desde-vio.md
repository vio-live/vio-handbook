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
  - En QA el rol 1 lo tenían solo cuentas de prueba viejas (`test`, `testseller`, `outshifteras`,
    `shopifysupplier`, `reachuexport1`). **Con OK de Angelo, el rol 1 se le dio a su cuenta nueva
    `angelo@vio.live` (usuario 1337, `vio-admin`) el 21/10 a las 10:2x UTC.**
  - Para crear esa cuenta salió un bug: el alta con Google fallaba para toda cuenta nueva
    (`Field 'description' doesn't have a default value`) y dejaba el usuario en Firebase sin cuenta
    de Commerce, además de escribir el token de Google en los logs. El arreglo es
    [vio-users-microservice#26](https://github.com/vio-live/vio-users-microservice/pull/26), que espera
    el merge de Angelo. Mientras tanto, *Create an account* sí funciona.
  - En prod, según el handoff del 19/10
    ([prod sin publisher](../../handoff/2026-10-19-prod-no-hay-publisher-para-el-flow.md)),
    `user_role` estaba vacío: nadie es admin. Hace falta dar el rol 1 a la cuenta del equipo de
    Vio en la base de prod. No lo volví a comprobar.

## Después (21/10, mañana)

- **Nombre y logo de la brand en la lista.** Lo pidió Angelo. Cambios:
  - vio-api-microservice [#53](https://github.com/vio-live/vio-api-microservice/pull/53) aplica la
    regla de Collections y del micro de campañas: primero el `brand_profile.displayName` («My
    brand»), después la cuenta; y el logo.
  - webapp-vio-commerce [#74](https://github.com/vio-live/webapp-vio-commerce/pull/74) muestra el
    logo o la inicial.
  - Están mergeados con OK de Angelo y desplegados en QA y staging.
  - Al verificarlo en QA salió que 431 de 442 «logos» eran el `default-placeholder.png` del alta
    vieja. El arreglo, [#54](https://github.com/vio-live/vio-api-microservice/pull/54), está abierto.
  - En QA solo 2 brands tienen «My brand», y 416 de 456 cuentas de brand tienen el usuario como
    nombre de brand.
- **Alta con Google:** [vio-users-microservice#26](https://github.com/vio-live/vio-users-microservice/pull/26)
  está mergeado y desplegado en QA; el pod corre `withSignupDefaults`. Producción sigue con el bug
  hasta el próximo release.

> [claude, 2026-10-21 11:50 UTC] Angelo: «en QA, no en prod aún». Nada de producción por ahora: ni la
> fase 3 de Vipps, ni apagar `EMAIL_DELIVERY` en prod, ni el Admin de prod, ni el release de los PRs
> de hoy. La lista para Miguel queda preparada para cuando dé la orden. En QA no hay nada que hacer:
> `EMAIL_DELIVERY` no está puesto en orders, users, api ni shopcart (comprobado), las partner keys no
> funcionan en test y el Admin de Angelo ya está.

> [claude, 2026-10-21 14:25 UTC] **El MSN real de Careless no funciona contra el Vipps de test.** Lo
> pidió Angelo y lo probé sin imprimir ninguna clave, solo los códigos:
> - claves de test de QA con la unidad de test 545865: token 200 y ePayment 404 (referencia
>   inventada), o sea que puede cobrar;
> - claves de test de QA con el MSN real 1179558: token 200, pero ePayment **403 Forbidden**;
> - nuestras partner keys de prod contra `apitest.vipps.no`: `AADSTS700016`, porque la app no existe
>   en el tenant de test.
>
> Por eso, en QA todas las brands van con 545865. Careless (QA 1338) tenía asignado el 1179558
> desde las 14:10; lo cambié a 545865. El reparto real del dinero por brand solo se puede comprobar
> en producción. Alan tiene la tarjeta [HPKysebB](https://trello.com/c/HPKysebB): una brand nueva
> como segundo sponsor en la surface de Aller «Mote Livestill Hub» y la prueba de aislamiento.

> [claude, 2026-10-21 15:56 UTC] **Primer reporte de Alan en HPKysebB:** puso el MSN `545865` en
> «Organisation number» y la página lo rechazó (lo correcto). Se mejoró el mensaje:
> [webapp-vio-commerce#75](https://github.com/vio-live/webapp-vio-commerce/pull/75) (`7b0d9e0` en
> develop) avisa cuando el número parece un MSN y explica que va en el paso 2. Alan ya tiene la
> respuesta en la tarjeta. Vercel desplegó staging unos 10 minutos después del merge (va en cola
> detrás de la preview); el 403 de `vercel redeploy --target staging` era solo de ese redeploy
> manual, que sobraba. Verificado en staging (el texto nuevo está en el chunk de la página) y avisado
> a Alan a las 16:0x UTC.

> [claude, 2026-10-21 17:27 UTC] **Segundo reporte de Alan en HPKysebB** (17:12 UTC, con su cuenta del
> equipo de Vio):
> 1. Recargar `/settings/brand` daba el 404 de la app. Es un bug real y afecta a cualquier cuenta:
>    esa sección no estaba en las rutas que genera el export estático.
> 2. Settings › Brand decía «Couldn't load your brand.». Es correcto que no cargue: el micro de
>    campañas responde 403 a una cuenta `internal` (rol Admin), que no es una brand.
>
> Arreglo: [webapp-vio-commerce#77](https://github.com/vio-live/webapp-vio-commerce/pull/77)
> (`ec3b5e7`). Las rutas pasan a `src/lib/settings-paths.js`, con un test que cubre todas las
> secciones de la matriz. Con un 403, la página ahora dice «This account isn't a brand» en vez de
> mostrar un Retry inútil. Lo verifiqué en staging: `/settings/brand` sirve la página de Settings y
> el texto nuevo está publicado. A Alan le contesté su pregunta: una cuenta admin es del equipo de
> Vio, no una brand, y la brand va en una cuenta aparte.

> [claude, 2026-10-21 21:07 UTC] **Tercer reporte de Alan en HPKysebB (20:45 UTC). Es un bug de dinero.**
> Una devolución parcial en Shopify **antes de capturar** el pago de Vipps (orden 4596, brand 1340, partner
> 545865) no movía nada. Al capturar se habría cobrado la reserva entera, incluido lo que la tienda ya
> había devuelto. Causa: shopcart descartaba la devolución con «nothing captured yet: a reservation
> cannot be partly released», porque Vipps no libera una parte de una reserva.
>
> Arreglo:
> - [vio-shopcart-microservice#98](https://github.com/vio-live/vio-shopcart-microservice/pull/98): cubre
>   la captura al enviar.
> - [#99](https://github.com/vio-live/vio-shopcart-microservice/pull/99): cubre la captura a mano desde la
>   tarjeta, que es el modo que usa Alan («account»). La primera versión había supuesto la captura al
>   enviar sin mirar el modo de su brand.
>
> Con los dos, el total devuelto en la tienda se apunta en el pago (`SHOP_REFUND_BEFORE_CAPTURE`). Al
> capturar, Vio cobra solo lo que queda y libera lo devuelto (`SHOP_REFUND_NOT_CAPTURED`). Las
> devoluciones siguientes no lo vuelven a contar, y la tarjeta muestra el importe correcto que falta
> por capturar.
>
> Verificado en QA: reproduje la devolución de la 4596 llamando directamente a shopcart (no a orders,
> para no duplicar la compensación en analytics) y su tarjeta quedó en 52,90 por capturar de 87,80.
> **El bug sigue en prod hasta el próximo release.**

> [claude, 2026-10-21 22:35 UTC] **Cuarto reporte de Alan en HPKysebB (22:07 UTC). Es un bug de líneas, no de
> dinero.** Orden 4599 (brand 1340, captura al enviar). Alan devolvió en Shopify 1 de los 2 productos: Vio
> dejó los dos en *packing*. Al hacer fulfill del otro, Vio marcó los dos como *shipped*.
>
> Causas:
> - El relay de `refunds/create` de extensions solo mandaba importes a orders-ms `/:id/refunded-in-shop`.
>   La rama parcial no tocaba ninguna línea.
> - `saveTrackingNumber` completaba todos los items de la marca, también el devuelto.
>
> Arreglo:
> - [vio-extensions-microservice#30](https://github.com/vio-live/vio-extensions-microservice/pull/30):
>   `shopifyRefundedLines` manda `lines`, las unidades devueltas por producto Vio sumando todas las
>   devoluciones de la orden. El producto sale de la propiedad `productId` de nuestras líneas.
> - [vio-orders-microservice#40](https://github.com/vio-live/vio-orders-microservice/pull/40):
>   - una línea devuelta entera pasa a `REFUNDED` y se avisa al dashboard por socket;
>   - una devuelta en parte queda como estaba;
>   - sin `lines` (Woo) no cambia nada;
>   - al guardar el envío se saltan las líneas anuladas (`isVoidLine`).
>
> El dinero no cambia: lo cubren shopcart #98/#99. Tests: orders `test:unit` 586 en verde, y 1 fallo que
> ya existía en develop (`order-paid-buyer-ref`); extensions refund spec 20/20.
>
> **Pendiente:** el merge de los dos PRs, que el control de permisos no me dejó hacer sin revisión
> (está con Angelo), y verificar el deploy en QA. A Alan le avisé en la tarjeta que está arreglado pero
> aún no en QA, y que repita con una orden nueva. #39 se cerró y lo reemplaza #40: el primer commit
> llevaba atribución.
>
> Gotcha de tests en orders: correr `yarn test:unit` (`jest.unit.json`), no `npx jest`. La config por
> defecto pide la base y no mapea `@typespec`.

## Next session

- Con OK de Angelo: rol 1 a su cuenta de QA y prueba de punta a punta en staging (set up de una
  brand de prueba, asignar 545865, encender y apagar).
- Release de los cuatro PRs a prod junto con la fase 3 de Vipps. Después, Careless: set up desde la
  página, lookup de la org. 928540650 y asignar 1179558.
