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

> [claude, 2026-10-22 06:50 UTC] **Seguimiento del reporte 4.** Alan mergeó él mismo
> [vio-extensions-microservice#30](https://github.com/vio-live/vio-extensions-microservice/pull/30)
> (21/10 22:43). Se desplegó en QA y verifiqué el pod: arrancó bien y lleva `shopifyRefundedLines`.
> [vio-orders-microservice#40](https://github.com/vio-live/vio-orders-microservice/pull/40) **sigue sin
> mergear**.
>
> A las 23:30 Alan repitió la prueba (órdenes 4601 y 4602) y reportó que «sigue el error». En la base de
> QA (solo lectura):
> - shopcart apuntó las dos devoluciones antes de la captura (`SHOP_REFUND_BEFORE_CAPTURE` 10000 y
>   24500);
> - los items siguen en `PROCESSING`, porque orders aún ignora `lines`.
>
> Se lo expliqué en la tarjeta. Las dos órdenes quedan así: no se puede reproducir su devolución sin el
> `refundId` de Shopify, porque los logs se perdieron al dormir QA y sin ese id la compensación de
> analytics saldría doble. Cuando #40 esté en QA, Alan repite con una orden nueva.
>
> Dato: QA arranca a las 06:30 UTC (`job-qa-sc-aks-start`, RG `rg-vio-qa-sc`; MySQL a las 06:25), no a
> las 06:00 como dice `infrastructure/qa-aks-scheduler.md`.

> [claude, 2026-10-22 08:35 UTC] **Reporte 4 cerrado en QA.** Mergeé
> [vio-orders-microservice#40](https://github.com/vio-live/vio-orders-microservice/pull/40) con el OK de
> Angelo (08:26). El deploy salió en verde (run 39747788529) y el pod nuevo arrancó limpio con
> `markLinesRefundedInShop` y la salvedad de `isVoidLine` al guardar el envío.
>
> Le avisé a Alan en HPKysebB que repita con una orden nueva: 2 productos, devolver 1 entero en Shopify,
> y hacer fulfill del otro. Hay dos casos extra: devolver los dos en devoluciones separadas, y devolver 1
> de 2 unidades del mismo producto.
>
> Falta su prueba de punta a punta. Cuando la haga, lo verifico en la base de QA en solo lectura.

> [claude, 2026-10-22 10:18 UTC] **Los arreglos de devoluciones, en prod.** Con el OK de Angelo
> («los cuatro ahora»): shopcart #100 (#98 y #99), orders #41 (#40) y extensions #31 (#30). Los runs
> salieron verdes y los pods de prod quedaron sanos con el código nuevo. Detalle en el documento de
> coordinación con Miguel.
>
> Decisiones de Angelo:
> - D1: no tocar `VIPPS_CLIENT_*` en prod;
> - D2: el modo de captura de Careless lo habla él con Careless;
> - D3: rol Admin en prod para Alan, que lo pone Miguel cuando Alan comente su email.
>
> A Alan se lo dije en la tarjeta de prod (djzHxncE).

> [claude, 2026-10-22 15:18 UTC] **Reporte 5 de Alan (HPKysebB, 15:02).**
> - ✅ Confirma de punta a punta en QA todos los casos de Shopify: cancelar, devolver todo, fulfill
>   de todo, devolver 1 o N productos y hacer fulfill del resto. Cada producto y la orden quedan con
>   su estado correcto. Con eso quedan validados orders #40 y extensions #30 (ya en prod).
> - ⚠️ Un fulfill con tracking (órdenes 4609–4612: UPS, FedEx, USPS, DHL) mostraba «Courier —».
>   - Causa: en la base, `order_tracking` tenía número y link pero `slug` null. `handleSaveTrackingNumber`
>     no mandaba el `tracking_company` de Shopify.
>   - Arreglo:
>     [vio-extensions-microservice#32](https://github.com/vio-live/vio-extensions-microservice/pull/32)
>     (`shopifyTrackingSlug`). Los couriers del dashboard van con su slug; los demás, con su nombre en
>     minúsculas.
>   - Mergeado, desplegado en QA (15:17) y verificado en el pod. A Alan le pedí repetirlo con una orden
>     nueva.
> - **No está en prod.** El cambio es de presentación (el courier del detalle de la orden), así que no
>   bloquea el go-live. Si se quiere en prod, tiene que entrar antes de la congelación del viernes.

> [claude, 2026-10-22 15:36 UTC] **Courier verificado con órdenes reales de Alan:** la 4613 se guardó con
> `slug` `ups` y la 4614 con `usps`, cada una con su número y su link (`order_tracking` 13181 y 13182,
> 15:30–15:31). Alan marcó completa la parte 1 de su tarjeta del go-live (0bh9T1z6): Shopify de la A
> a la Z, 8/8.

> [claude, 2026-10-22 16:57 UTC] **Pregunta de Alan (0bh9T1z6, 16:53):** «¿no se pueden dos sponsors en
> Vev? no deja mezclar productos».
> - Respuesta, verificada en el código: la campaña se elige **por página**. `vio-config.tsx` tiene
>   `campaignId` por página (ADR-0034, enmienda 3), así que un artículo no mezcla sponsors. La prueba va
>   con dos páginas, cada una con su campaña.
> - Su surface 14 («Vev Alan», publisher 1312 Aller) está bien. Tiene dos campañas activas: la 13
>   (sponsor 1340, por defecto, channel 514) y la 15 (sponsor 1331, creada a las 16:11, channel 515).
>   Casi todos los slots de sus páginas están en la 15 «From page».
> - Le pasé los pasos.

> [claude, 2026-10-22 17:52 UTC] **Reporte 6 de Alan (0bh9T1z6, 17:44): el plugin Vio Sync for
> WooCommerce, instalado de nuevo desde cero (Staging, NOK).** `woo_connection` 494 quedó con
> `currency` vacío y no sincroniza. Dos causas, verificadas en código, datos y logs de QA:
> 1. **Orden de los pasos.** `connect()` del plugin (`class-ajax.php` → `Store_Status::save_options`)
>    hace `PUT /woo/config` **antes** del OAuth de WooCommerce. `updateConfig` (extensions) escribe en
>    la conexión más reciente del usuario, que era la vieja 492 (NOK). Después, el callback del OAuth
>    crea la 494 (users `saveWooConnection`) y lee la moneda de la tienda (`getSettingCurrency`). Esa
>    lectura falló y la moneda quedó `""`. En una primera instalación sin conexión previa,
>    `updateConfig` hace `woo.currency` sobre `null` y la moneda solo depende de esa lectura. Los logs
>    de users de las 17:35 se perdieron: el pod se reinició a las 17:38.
> 2. **Ráfaga contra la tienda.** El consumidor de productos (`product.busConsumer` / `sqsConsumer`)
>    pide `woo/findProductById` producto por producto, en paralelo y con hasta 10 reintentos. A las
>    17:49–17:50 fueron ~14k y ~23k líneas de log por minuto contra `dev-test-supplier-alan.pantheonsite.io`.
>    La tienda (Pantheon detrás de Cloudflare) respondió 500 «error code: 1101». Sin credenciales
>    responde 401 desde QA y desde fuera, así que la tienda es alcanzable: lo que falla es la ráfaga.
>
> No está en el camino del lunes (Careless es Shopify). El plugin sí está en uso en prod: Miguel vio
> webhooks de `qkoreancosmetics.no`. Arreglos posibles: (a) users hereda la moneda de la conexión
> anterior de la misma tienda, o el plugin manda la moneda otra vez al volver del OAuth; (b) límite de
> concurrencia y reintentos con espera en el consumidor de productos de Woo. Pendiente de que Angelo
> decida el cuándo. Aparte: los logs de extensions imprimen las claves de la tienda (tarjeta J7E6j9dM).

> [claude, 2026-10-22 18:27 UTC] **La ráfaga de Woo no se agotaba: era un bucle sin fin, y está
> arreglado.**
> - Causa: el consumidor de productos (`product.busConsumer.service.ts`) volvía a encolar los productos
>   que habían fallado tal como habían llegado. El `retry` incrementado se quedaba en `refData`, así que
>   en cada pasada contaba `retry: 1` y el «se rinde a los 10» de `callSave` nunca saltaba. En los logs
>   todos los mensajes llevaban `"retry":1`.
> - Arreglo:
>   [vio-products-microservice#29](https://github.com/vio-live/vio-products-microservice/pull/29)
>   (`wooProductsToRetry`): reencola con `retry + 1`.
> - Mergeado y desplegado en QA (18:25). Verificado: el contador sube de 1 a 11 y se para. Las llamadas
>   a la tienda de Alan bajaron de 20.802 líneas/min (18:24) a 1.222 (18:26) y después a 0.
> - **Prod tiene el mismo bucle** y no está arreglado ahí: una tienda Woo real con la API caída se
>   reintentaría sin fin. Llevarlo a prod antes de la congelación del viernes lo decide Angelo.
> - Fuera de alcance: un producto que se rinde se sigue reportando `SUCCESS` al socket, y la ruta SQS
>   (`product.sqsConsumer`, no la de Azure) no tiene límite.
> - El tracker de Alan contaba la ráfaga como trabajo suyo (llevaba su `user 1331`). Ahora excluye esas
>   líneas, y las filas de 17:45–18:06 quedaron como `noise:woo-retry`.

> [claude, 2026-10-22 20:09 UTC] **Reporte 7 de Alan (0bh9T1z6, 20:02), en el camino del lunes:** Replit
> de Aller en staging (`mote-livsstil-hub-vio.replit.app`), Safari móvil, ventana normal. Después de
> pagar con Vipps, la vuelta mostraba «Handlekurven tilhører en annen Vio-surface. Fullfør eller tøm
> handlekurven først», también al recargar. En incógnito salía la confirmación.
> - **El pago funciona:** las órdenes 4621–4624 están en la surface 13 «Mote Livestill Hub», campaña 12,
>   seller 1338, Vipps, checkout `SUCCESS`.
> - **El mensaje es del código del propio Replit**, no del SDK ni del backend: está en su bundle
>   `index-*.js` y no en ningún repo nuestro. La app trabaja con varias surfaces (Aller en QA tiene la
>   3, la 13, la 14 y la 15). En una carga nueva lee la surface guardada en `localStorage`, y si no es
>   la de la página y la cesta tiene items, bloquea `Vio.init`. Al volver de Vipps la cesta todavía
>   tiene items, porque el SDK la vacía al procesar la vuelta. La guarda no deja arrancar el SDK y
>   queda en bucle. El SDK vuelve a la misma URL con `vio_payment`, `vio_method`, `vio_sponsor` y
>   `checkout_id` (`resolveHttpsReturnUrl`).
> - El arreglo es del Replit (es de Angelo, B6). Le pasé a Angelo un prompt para el agente de Replit.
>   Alan, mientras tanto, borra los datos del sitio o usa una ventana privada.

> [claude, 2026-10-22 20:37 UTC] **Alan 20:27:**
> - Observación, no bloqueante: en el móvil queda una pestaña en «Åpner Vipps …» por compra y la
>   confirmación sale en otra. Es lo esperado en iOS con la app de Vipps: `payment-redirect.ts` navega
>   en la misma pestaña, la app se abre antes de que la página salga y la vuelta llega en pestaña nueva.
>   Mejora para después del lunes: quitar el overlay al volver a la pestaña (`visibilitychange`).
> - Pregunta: ¿puede reinstalar el plugin de Woo? Sí: el bucle está arreglado (products #29). Le
>   avisé que desconecte antes, para no duplicar la conexión, y que la moneda vacía sigue pendiente
>   para después del lunes.

> [claude, 2026-10-22 21:27 UTC] **Woo, seguimiento (Alan 21:22):** la conexión 496 también quedó sin
> moneda. Era de esperar: el arreglo de la moneda no está hecho, va después del lunes.
> - Alan encontró en Datadog que `settings/general/woocommerce_currency` da 500 «error code: 1101», y
>   en una sola llamada.
> - Lo probé contra `dev-test-supplier-alan.pantheonsite.io/wp-json/wc/v3/...`, desde aquí y desde el
>   pod de extensions de QA. Sin auth y con una clave inventada (en query string y en basic) responde
>   **401 de WooCommerce**. Con la clave real (la de los logs) responde **500/1101**.
> - Conclusión: **la tienda falla dentro de su PHP** cuando la petición viene autenticada. No es Vio ni
>   la red. No usé su clave real. Le pedí a Alan un curl con su clave, el log de PHP de Pantheon y una
>   prueba con otra tienda Woo limpia.
> - El fallback de la moneda en users sigue siendo un arreglo válido, pero no le hace sincronizar a
>   esta tienda.

> [claude, 2026-10-22 21:38 UTC] **Woo: corrijo lo de las 21:27.** Alan probó con Postman y su clave el
> mismo GET de `woocommerce_currency`, y **le funcionó**. Lo que se sabe desde QA (extensions, conexión
> 496):
> - Los **POST** autenticados de Vio funcionan: `webhooks` → 201.
> - Los **GET** autenticados de Vio dan 500 «error code: 1101»: `webhooks`, `settings/general/woocommerce_currency`
>   y `products/{id}`, a las 21:08–21:20, justo al conectar y desconectar.
> - Desde el pod, los GET públicos y grandes funcionan (`/wp-json/` de 1,2 MB, Store API).
> - Con clave inventada, con el mismo cliente `@woocommerce/woocommerce-rest-api@1.0.1` y su
>   User-Agent, la respuesta es un 401 normal.
> - Falla solo «GET autenticado desde Vio». El 1101 lo devuelve el Worker de Cloudflare delante de
>   Pantheon. La causa no está identificada.
> - Alan pegó su consumer key y su secret en Trello. Le pedí que borre el comentario y revoque la clave.
> - Queda para después del lunes, con el fallback de la moneda. Para aislar: probar con otra tienda Woo
>   que no esté en Pantheon.

## Next session

- Con OK de Angelo: rol 1 a su cuenta de QA y prueba de punta a punta en staging (set up de una
  brand de prueba, asignar 545865, encender y apagar).
- Release de los cuatro PRs a prod junto con la fase 3 de Vipps. Después, Careless: set up desde la
  página, lookup de la org. 928540650 y asignar 1179558.
