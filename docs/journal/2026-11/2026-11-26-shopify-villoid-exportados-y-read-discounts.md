---
date: 2026-11-26
session: "Shopify: Villoid ve 0 exportados (listings con timeout) y read_discounts en las seis apps de clientes"
participants: [angelo, claude]
status: live
---

# Villoid ve 0 exportados, y el permiso de códigos en las apps de clientes

## Goal
Daniel (Villoid) escribió el 25/11 en Slack:
- en la app, «Exported to Vio» sale vacío y «Connection & log» dice 0 productos exportados;
- usan sobre todo códigos de descuento, y sin ellos un artículo solo con precio rebajado queda flojo.

Angelo: buscar el estado de los códigos de Shopify y de las pruebas de Alan, y arreglar todo a la vez.

## Done
- **Causa de los 0 exportados.** La exportación estaba bien: la cuenta 1323 tiene **166 productos** en Vio, todos
  `SHOPIFY`. Lo que fallaba era la lectura de la lista.
  - Las dos pantallas salen de `GET /api/listings?page=0&size=1000`. La app corta a los 10 s y cuenta el fallo como 0.
  - Logs de `vio-sync-client`, 25/11 14:04–14:09 UTC: todas las llamadas terminan en `failed: timeout`.
  - En base-api esas mismas llamadas tardaron entre 7 y 120 s. Los reintentos de la app las amontonaron; algunas
    dieron 400 a los 120 s.
  - El servicio de productos convierte la moneda de cada variante, dos veces cada una, cuando se piden variantes,
    y `/api/listings` las pide por defecto. Medido en prod contra `products/findSearch/1323` con los filtros de
    base-api: **11,8 s con variantes** (166 productos, 894 variantes, 1,8 MB) y **1,4 s sin ellas** (0,6 MB).
  - El 2/11 eran 136 productos y la llamada todavía entraba en los 10 s.
- **Arreglo:** [vio-shopify-sync#138](https://github.com/vio-live/vio-shopify-sync/pull/138) añade `&variants=false`
  a `vio.listings()`. La app solo usa `id`, `originId` y `title`.
  - Comprobado en prod que `variants: "false"` como string, que es como llega desde el query de base-api, salta la
    conversión: 166 de 166 con `originId` y `title`.
  - vitest 242/242, `tsc` limpio y CI verde. **Sin mergear al cierre.**
- **Estado de los códigos de Shopify:**
  - el backend está en prod desde el release del 17/11 (extensions #79, con los arreglos línea a línea de #78);
  - las pruebas de Alan están completas: Trello [#490 XRMIf1WS](https://trello.com/c/XRMIf1WS), cupones de Shopify,
    33/33; [#480 DiIsksLg](https://trello.com/c/DiIsksLg), Woo y códigos de Vio con Vipps, 74/74;
  - lo único que faltaba era el permiso: las seis apps de clientes seguían con su versión de octubre, sin
    `read_discounts` ([#136](https://github.com/vio-live/vio-shopify-sync/pull/136) mergeado y nunca desplegado).
- **`read_discounts` desplegado en las seis apps** (OK de Angelo, «ve con ello»):
  - antes, `config pull` de cada una y comparación por contenido con el `toml` del repo: el único cambio era el scope;
  - `shopify app deploy --allow-updates --no-input`, primero en la demo y comprobando los tokens antes de seguir;
  - versiones nuevas: `vio-sync-4` en demo, Gladkokken, Makeup Mekka y Careless; `vio-sync-3` en Floyd y Villoid;
  - después del deploy, `/internal/token` da 200 en las cinco tiendas instaladas y los 15 permisos de antes siguen
    vigentes. Ninguna aceptó todavía `read_discounts`: Shopify se lo pide a cada tienda al abrir la app;
  - en prod, `POST extensions/coupons/list` responde `connected: true, missingScope: read_discounts` para 1322,
    1323, 1324, 1325 y 1327. Cuando acepten, el selector de la campaña lista sus códigos sin tocar nada más.
- **Arreglo desplegado en los seis proyectos de Vercel** (OK de Angelo, «despliega», con #138 todavía sin mergear):
  - por ADR-0001 no lo mergeé yo; desplegué la punta de la rama del PR, `6445241`, que es exactamente
    `custom/client-app` (`5fa6e06`) más el commit del arreglo. Cuando se mergee no hace falta volver a desplegar;
  - vitest 253/253 en el worktree del deploy;
  - deploys nuevos: `vio-sync-demo-ofpc7us87`, `vio-sync-gladkokken-6w01ffwg0`, `vio-sync-makeupmekka-e2bxval3b`,
    `vio-sync-client-3aws1fw9s`, `vio-sync-careless-6gbi1d9yk`, `vio-sync-floyd-ds4u8r1j1`. Los seis dominios de
    producción apuntan a ellos y `healthz` da 200. Para volver atrás en Villoid: `vio-sync-client-75c8st80e`;
  - el manifiesto del navegador sigue en `manifest-6aa160b4`, como era de esperar: `vioEndpoints.ts` es solo de
    servidor, así que el manifiesto no sirve para saber qué build está en producción; lo que vale es `vercel inspect`;
  - comprobado en prod desde un pod de base-api, con la key de 1323 y la misma llamada que la app:
    `GET /api/listings?page=0&size=1000&variants=false` da HTTP 200 en **1,75 s**, 0,6 MB, 166 productos, los 166
    con `originId` y `title`;
  - logs de los 30 minutos siguientes: ningún `failed`; nadie había abierto todavía las pantallas de la app.
- **#138 mergeado** a las 12:00 UTC (merge commit `1fd057c`, como los PR anteriores). Lo mergeé yo por orden expresa
  de Angelo («mergea tú»), que es una excepción puntual a ADR-0001. `custom/client-app` queda idéntica a lo
  desplegado (`git diff 6445241 1fd057c` vacío) y los seis dominios siguen en los mismos deploys tras el merge.
- **Revisión «¿está todo en prod?»:** lo de Villoid está en la campaña **5 «Villoid test»** (Aller 1330, surface 1,
  marca principal 1323, sin fin). La web de la surface 1 va con la SDK 0.41.1 desde el 25/11, que ya aplica códigos
  de campaña (hacen falta ≥ 0.40.1). En prod hay un solo código elegido, el de Faves (campaña 4 × 1301); para la
  5 × 1323 no hay ninguno, y se elige cuando Villoid acepte el permiso.
  - **Corrección:** primero dije que campaigns [#37](https://github.com/vio-live/vio-campaigns-microservice/pull/37)
    (regalo del código en el canal y chequeo diario) no estaba en prod; me fié del blocker del 25/11 sin mirar el
    repo. **Está en prod desde el 25/11:**
    - campaigns: release [#47](https://github.com/vio-live/vio-campaigns-microservice/pull/47) a las 15:00 UTC; la
      imagen de prod es la build 65 = `e799abf`, la punta de `main`;
    - migración 1793300: aplicada (`surface_campaign_discount_code.problem` y `problem_notified_at` existen en prod);
    - shopcart #125, la cobertura con los regalos: release
      [#126](https://github.com/vio-live/vio-shopcart-microservice/pull/126) a las 15:14 UTC; `src/modules/discount`
      es idéntico entre `main` y `develop`;
    - api `POST /notifications/saveStatic` en `master`; dashboard: webapp #117 vía la release #118;
    - CronJob `campaigns-discount-check` (06:00 UTC): hoy revisó 1 código, el de Faves, con 0 problemas y HTTP 200.
- **Floyd no instaló nunca.** Su link venció el 5/11 y `/internal/token` sigue en 409 `no_session`. La app y el
  proyecto de Vercel están listos (registro del playbook); si quieren seguir, hay que crear otra app, como con Villoid.

## Decisions
- **Combinar dos códigos en una compra no se hace por ahora.** Shopify sí lo permite, pero lo calcula su checkout,
  y los pedidos de Vio se crean por la Admin API con los importes ya calculados. Haría falta replicar las reglas
  de Shopify (`combinesWith`, primero los descuentos de producto, después los de pedido) en shopcart y extensions.
  Primero se mira si los códigos de Villoid tienen la combinación activada.
- Varios códigos en paralelo ya funcionan sin desarrollo: uno por campaña, uno por link (`?vio_discount=`) o el
  campo «Rabattkode» si la página lo activa.

## Blockers
- Ninguno técnico. Falta que Villoid abra la app y acepte `read_discounts`.
- **Mensaje a Villoid:** listo abajo; lo mandan Angelo o Michael. **En espera** (Angelo, 26/11): antes, Alan
  comprueba en prod el 27/11 lo mismo que hará Daniel, en la tienda demo (`vio-demo`, cuenta 1322, misma build y
  misma versión de la app): la pantalla del permiso, Update, la lista de exportados y que Vio lea los códigos.
  La demo no ha aceptado el permiso a propósito, para que Alan vea la pantalla igual que Daniel. La compra con
  código en prod no entra en esa prueba: en la demo no hay campaña y sus productos son de prueba en USD; se hace
  con Villoid cuando acepten (lo de comprar con código ya está probado en QA, #490 33/33).

## Mensajes listos para mandar
**A Daniel (Villoid).** Comprobado en la demo (26/11): al abrir la app, Shopify muestra primero «Authorize Vio Sync»
(«Vio Sync needs access to: View store data · View discounts — Discount codes and promotions», botones Cancel y
Update), y la app no carga detrás. El link directo usa el handle de la app en cada tienda (sacado con
`currentAppInstallation.app.handle`): demo `vio-sync-3`, Gladkokken `vio-sync-2`, Makeup Mekka `vio-sync-4`,
Careless `vio-sync-5`, Villoid `vio-sync-6`.


> Hei Daniel!
>
> Takk for beskjed. Vi har sett på begge deler, og begge er klare.
>
> **Åpne Vio Sync her:** https://admin.shopify.com/store/villoid/apps/vio-sync-6
>
> Første gang ber Shopify dere godkjenne en ny tilgang: «Vio Sync needs access to: View discounts». Trykk
> **Update** (eller «Oppdater»). Vio leser bare rabattkodene, vi endrer ingenting. Appen åpner seg først når dette
> er godkjent.
>
> **1. Eksporterte produkter.** Eksporten deres har fungert hele tiden – dere har 166 produkter i Vio. Feilen lå i
> appen: listen over eksporterte produkter tok for lang tid å hente, og da viste appen 0. Det er rettet nå: dere ser
> alle 166 under «Exported to Vio» og i «Connection & log». Dere trenger ikke eksportere noe på nytt.
>
> **2. Rabattkoder.** Med den nye tilgangen kan Vio bruke rabattkodene deres fra Shopify.
>
> Slik fungerer det:
> - Hver kampanje bruker én kode, som velges i Vio. Kunden trenger ikke skrive noe: rabatten legges på automatisk i
>   artikkelen, og selve koden vises ikke. Vi kan også lage egne lenker med en annen kode, for eksempel til
>   nyhetsbrev eller Instagram.
> - Vi anbefaler at dere lager en egen kode for Vio, så dere ser hvilke salg som kommer derfra.
> - Støttes: prosent på hele handlekurven, på utvalgte produkter eller kolleksjoner, fast beløp per vare, og
>   minstebeløp for handlekurven.
> - Støttes ikke ennå: én gang per kunde, fri frakt, kjøp X få Y, rabatter fra apper og minimum antall varer.
> - Rabattkoder fungerer foreløpig bare med Vipps.
> - Én kode per handlekurv – to koder kan ikke kombineres foreløpig.
>
> Når dere har godkjent, sjekker vi hvilke av kodene deres som fungerer, og så avtaler vi hvilken som skal brukes
> i kampanjen.

**A Gladkokken, Makeup Mekka y Careless** (opcional, para que el aviso del permiso no los sorprenda):

> Hei! Vi har oppdatert Vio Sync-appen. Neste gang dere åpner den i Shopify, ber Shopify dere godkjenne en ny
> tilgang: lese rabatter. Trykk godkjenn – da kan Vio bruke rabattkodene deres fra Shopify i kampanjene. Vio leser
> bare kodene, vi endrer ingenting i butikken. Si fra hvis dere har spørsmål!

## Next session
1. Cuando Daniel abra la app, confirmar en `vercel logs` de `vio-sync-client` que no hay `failed: timeout` y que
   ve los 166.
2. Cuando Villoid acepte `read_discounts`:
   - `coupons/list` de 1323 para saber qué códigos admite Vio;
   - la consulta de `codeDiscountNodes`, para ver tipo, alcance, `appliesOncePerCustomer` y `combinesWith`;
   - con Daniel, elegir el código de la campaña y hacer una compra de prueba en prod (código y uso +1 en Shopify,
     Vipps cobra el neto) y cancelarla.
3. Si se decide, mandar a Gladkokken, Makeup Mekka y Careless el aviso del permiso nuevo (texto arriba).
