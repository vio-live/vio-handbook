---
title: Checklist de go-live Careless x Aller (lunes 26/10)
last-updated: 2026-10-22
owner: Miguel
status: en curso
---

# Checklist de go-live — lunes 26/10

Lista viva. El plan razonado y las mediciones estan en
[`2026-10-22-plan-go-live-careless-aller.md`](./2026-10-22-plan-go-live-careless-aller.md).
Aqui solo se marca. Cada linea tiene **dueno** y **criterio de hecho** (como se comprueba, no como
se siente).

Convencion: `[x]` hecho y verificado · `[~]` hecho pero sin verificar de punta a punta · `[ ]` abierto.

---

## A. Cadena critica del pago (en este orden, no se puede saltar)

- [x] **A1. Admin de equipo Vio en prod** — *Miguel*
  Hecho 22/10 15:1x. `user_role` id 707: `user_id=1328` (`vio`, Angelo), `role_id_role=1` (Admin),
  `active_user_role=1`. Era la **unica** fila de la tabla.
  Verificado en el codigo del pod: `resolveAccountType` pone `internal` primero, asi que el Admin
  **gana** sobre `is_business=1`; y `getAccountType` lee la base en cada peticion
  (`roleService.getActiveRoleIds`), **no** el claim de Firebase y **no** hay cache.
  Criterio: 1328 ve *Vio team* con `channels:manage`, `surfaces:manage`, `campaigns:manage`.
  Pendiente menor: **una segunda cuenta Admin** para no depender de una sola persona el lunes.

- [x] **A2. Careless en modo partnership + MSN 1179558** — *Miguel, 22/10 15:23*
  Hecho por los endpoints internos del micro `api` (los mismos que usa la pagina *Vio team > Vipps
  partner* a traves de base-api), no a mano en la base:
  `PUT /paymentmethod/vipps-partnership/accounts/1327` con `organizationNumber 928540650`,
  `express true`, `shippingMode fixed`, `captureMode account`; despues
  `POST /paymentmethod/vipps-partnership/accounts/1327/sales-unit` con `1179558`.
  Verificado:
  - `payment_method` tiene **1 fila** (antes 0): `cb45e3e9-f81b-4d22-8899-f2955af84f3e`,
    `user_id 1327`, `active 1`, `options.mode = "partner"`, `merchantSerialNumber 1179558`,
    `salesUnitName "Careless AS"`, `salesUnitOrgNumber 928540650`.
  - La respuesta del assign trae `verified: true`: el micro pregunto a la **Management API de
    produccion** y comprobo que la unidad existe bajo el partnership de Vio y que su numero de
    organizacion coincide con el de la marca (`salesUnitBelongs`). No es un dato tecleado.
  - `state: "live"`, `switchOn: true` (el assign enciende el switch de Vipps de la marca) y
    `useVioAccount: false` (ya **no** cae a la unidad de Vio).
  - `organization_number` de Careless, que estaba **null**, quedo en `928540650`.
  Eleccion de **`captureMode: account`** (Careless captura desde su propio portal de Vipps, como
  con sus ventas de siempre; decision de Angelo del 24/09) en vez del defecto de la pagina
  (`shipment`). Motivo: `shipment` captura cuando llega un **numero de seguimiento** a Vio
  (`orders` -> `saveTrackingNumber` -> `tellShopcartAboutVipps(..., 'shipped')`). Esa cadena
  existe en el codigo pero **no esta probada con Careless**, y si el tracking no llega el dinero
  se queda reservado sin cobrar. Se cambia con un `PUT` cuando se quiera automatizar.
  Lo que esto **no** prueba: que un comprador real pague. Eso es A3.

- [ ] **A3. Pago real de prueba en prod, importe minimo** — *Angelo, tras A2*
  Criterio: el cobro aparece en el portal de Vipps en la unidad **1179558** (NO en la de Vio), y el
  log de shopcart **no** dice `[vippsEvent] ... refused: signature mismatch`.
  Es el unico paso que no se puede fingir. Webhook de prod ya registrado (`e1de7656`).

- [ ] **A4. Devolucion de ese mismo pago** — *Angelo, tras A3*
  Criterio: la devolucion se ve en Vipps y llega `order_refunded` al colector.

---

## B. Cadena del contenido y la atribucion

- [x] **B1. Cuenta de Aller Media en prod** — *Angelo la creo 22/10 14:53Z; el rol lo puso Miguel 17:00*
  `user` **1329** `allermedia`, brand_name «Aller media», NO, activa. **Suscripcion ya resuelta**:
  `subscription` 631 `active` plan 1 — nacio con ella, no hace falta el rescate de
  `POST /api/users/create/subscription`.
  Le faltaba el **rol Publisher**: con `is_business = 1` y sin fila de rol resolvia a `brand`, **sin
  `channels:manage`**, o sea no podia crear su channel. Insertada `user_role` **708** (role 3).
  Verificado reproduciendo la consulta exacta del servicio: 1329 -> accountType **publisher**
  (`channels:manage`, `surfaces:manage`, `campaigns:manage`). Sin re-login: se lee de la base en
  cada peticion. Detalle en
  [`../journal/2026-10/2026-10-22-aller-1329-publisher.md`](../journal/2026-10/2026-10-22-aller-1329-publisher.md).

- [ ] **B2. Los 5 productos del articulo, en prod** — *Careless, desde su Shopify*
  «10 nyheter vi onsker oss na»: Cassia jakke, Hennie cardigan, Vilde genser, Sofie genser,
  Active pile fleece half-zip. Hoy solo esta la linea «Active».
  **CORREGIDO 22/10 16:55 (Angelo aviso de que la app de Shopify esta instalada): NO es un
  bloqueante de terceros.** La conexion esta viva (`shopify_connection` 541,
  `dignitycollect.myshopify.com`, NOK, token refrescado hoy) y su Shopify tiene **1.729 productos**.
  Los 5 del articulo **ya estan alli**, `ACTIVE`, publicados y con stock. En Vio solo hay **40**,
  todos importados el 16/10 y todos de la linea «Active»: la primera pagina alfabetica. Lo que falta
  es **importarlos de nuestro lado** (`POST /product/shopify/import` del micro `products`), no
  pedirle nada a Careless.
  **Espera OK de Angelo**: escribe en la base de prod. Recomendado importar solo los del articulo y
  sus colores con stock, no los 1.729. Excluir `Sofie genser - Lilla` y los dos Hennie sin publicar
  (stock 0). Detalle en
  [`../journal/2026-10/2026-10-22-careless-productos-no-es-bloqueante-de-terceros.md`](../journal/2026-10/2026-10-22-careless-productos-no-es-bloqueante-de-terceros.md).
  Criterio: los 5 con `active=1` en prod.

- [ ] **B3. Conexion Careless <-> Aller aceptada y channel creado** — *Angelo / equipo Vio, tras B1*
  Hoy en prod solo hay **3 `channel_user`**, todos de cuentas de prueba (1295 y 1300) y todos de
  tipo `GraphQl`. El de Aller hay que crearlo. Careless **no** tiene channel y es correcto: el
  channel es del publisher, no de la marca.
  **Tipo: `Sdk` (channel_id 10), NO `GraphQl` (12).** En QA los 10 channels con los que se probo el
  flujo son todos `Sdk` y todos con `vipps = 1`; los `GraphQl` tienen `vipps = 0`.
  Crearlo **desde el dashboard**, no a mano: el alta genera la api key (`user_channel_api_key`) y la
  fila de `channel_user_settings` que hace falta para B3b.

- [ ] **B3b. Encender el interruptor `vipps` del channel de Aller** — *equipo Vio, al crear B3*
  **Esto no estaba escrito en ningun sitio y se pasa por alto.** El checkout ofrece un metodo solo
  si coinciden **dos** cosas (`getAvailablePaymentMethods` -> `offeredPaymentMethods`): el switch de
  la **marca** (ya en `true`, A2) **y** la visibilidad del **channel**
  (`channel_user_settings.vipps = 1`). Hoy **ningun channel de prod** tiene `vipps = 1`, y la
  comprobacion de madurez del propio micro lo avisa: *"No channel offers Vipps yet. Turn it on in
  the channel's payment settings, or these keys stay unused."*
  Mirar tambien `channel_user_settings.markets`: tiene que cubrir Noruega (si esta vacio, no
  restringe).
  Criterio: `GET /channel/available-payment-methods/<channelUserId>` del channel de Aller devuelve
  Vipps en la lista. Si no sale, el boton no aparece y no hay compra, aunque el pago este perfecto.

- [ ] **B4. Productos publicados en el channel de Aller** — *equipo Vio, tras B2 y B3*
  `channel_user_products` de Careless esta a **0**: aunque el pago funcione, el lunes **no aparece
  nada en catalogo**. Hacen falta las filas + `product.active=1` (ya) + envio que cubra el pais (ya)
  + `channel_group` para que campanas y dashboard vean la marca.
  Criterio: los 5 productos salen en el catalogo del channel.

- [ ] **B5. Surface de Mote & Livsstil + campana con Careless de sponsor** — *tras B4*
  `surface`, `campaign` y `brand_profile` estan a **0** en prod. Comision por defecto 15 %.

- [ ] **B6. Replit de Aller en prod, con el SDK** — *Angelo*
  El `www.moteoglivsstil.no` publicado hoy **no tiene ni una referencia al SDK de Vio**.
  **Fijar la version**: npm esta en `@vio-live/web-sdk@0.27.0`, el prompt del 21/10 decia 0.26.1.
  La misma en Replit y en Vev, y una ya probada en QA — no estrenar version el lunes.
  Criterio: `Vio.analytics.start` con consentimiento y el colector dejando de estar a 0.


- [x] **B7. Migracion `BrandProfilePolicyUrls1792500000000` en QA** — *Miguel, 22/10 15:40*
  Dos columnas nuevas en `brand_profile` (`terms_url`, `refund_policy_url`), aditivas y NULL, para
  que la ficha del producto enlace condiciones y devoluciones de la marca. `ALTER` byte a byte igual
  al de package-database #25, fila de `migrations` insertada, y los enlaces de Careless (**1338** en
  QA, `@careless`, org 928540650) cargados con `COALESCE` (no pisa lo que ponga la marca).
  Verificado: columnas 9 y 10 justo detras de `secondary_color`, `varchar(2048)` nullable
  `utf8mb4_unicode_ci`; 2a pasada no repite nada; las otras 3 filas de `brand_profile` sin tocar.
  **Prod: NO corrida (decision de Angelo, va despues del go-live).** Salida completa y detalle en
  [`../journal/2026-10/2026-10-22-migracion-brand-policy-urls-qa.md`](../journal/2026-10/2026-10-22-migracion-brand-policy-urls-qa.md).

- [x] **B7c. Kernel #25 mergeado y desplegado en QA** — *Miguel, 22/10 16:35 (Angelo levanto ADR-0001)*
  Kernel **1.0.282** con los 7 paquetes alineados, 12/12 `kernel-bump` verdes, 12/12 `deploy.yml`
  verdes y 12/12 pods de QA corriendo `@vio-/database@1.0.282` **verificado dentro del contenedor**.
  El camino de lectura que B7b senala como riesgo esta ejercitado en QA:
  `GET /paymentmethod/vipps-partnership/accounts` da **200** con datos de `brand_profile`, y una
  sonda TypeORM con la misma `SnakeNamingStrategy` del kernel emite `terms_url` /
  `refund_policy_url` y devuelve los enlaces de Careless (1338). `Unknown column` = 0 en los 12 pods.
  **Produccion sin tocar** (sigue en `master`, columnas 0/2). Detalle en
  [`../journal/2026-10/2026-10-22-kernel-1-0-282-brand-policy-urls.md`](../journal/2026-10/2026-10-22-kernel-1-0-282-brand-policy-urls.md).

- [ ] **B7b. Orden obligatorio en prod: migracion ANTES del kernel** — *quien suba el release*
  **Esto puede tumbar la pagina de Vipps de prod.** La entidad lleva las dos columnas como
  `@Column` normal (sin `select: false`), asi que en cuanto un servicio de prod suba al kernel con
  #25, **cualquier lectura de `brand_profile` pide las columnas nuevas**. Si la base de prod no esta
  migrada: `Unknown column 'bp.terms_url'`. Lo leen tres servicios, y uno es el de A2:
  `api` (`vipps-partnership.service.ts`, `brandLooksOf` -> `getMany()` sin lista de campos, o sea
  todas las columnas), `campaigns` (`typeorm-brand-profile-repo`, bloque de sponsor del bootstrap) y
  `collection` (`brand-of-collection`).
  Mergear #25 y desplegar **QA** no tiene riesgo: QA ya esta migrada.
  Criterio: en prod se corre `m-brand-policy-urls-prod.js` **antes** de que `api`, `campaigns` o
  `collection` arranquen con el kernel nuevo. Con la congelacion del viernes esto no se cruza con el
  lunes, pero el orden hay que respetarlo cuando se levante.

---

## C. Red de seguridad (mio, no depende de nadie)

- [ ] **C1. Dump a mano de la base de prod, el viernes al cerrar** — *Miguel*
  Con el estado bueno ya configurado. El CronJob `mysql-prod-offsite-backup` sigue roto por diseno
  (instala paquetes en runtime y el sidecar de Istio le corta la salida), asi que **esto es la unica
  red** si hay que volver atras.
  Criterio: dump con MD5 verificado y conteo de tablas, subido al blob.

- [ ] **C2. Congelacion de prod desde el viernes por la tarde** — *todos*
  Nada a `develop` ni `master` de los repos de Commerce. Un deploy corta **~62 s de 503** aunque
  haya 4 replicas (medido). Si hay que tocar algo: `rollout restart`, no el pipeline.
  Ya confirmado por la sesion de `vio`: sin trabajo en curso que toque prod.

- [ ] **C3. Guion de verificacion del lunes, escrito y probado** — *Miguel*
  Los comandos exactos de la primera hora, listos para pegar, no improvisados.

- [ ] **C4. Avisar a Careless de que una devolucion en su Shopify mueve dinero en Vipps** — *Angelo*
  Pendiente desde el 16/10. El lunes ya es dinero real.

---

## D. Vigilancia del lunes, primera hora

- [ ] **D1.** Log de shopcart sin `[vippsEvent] ... refused: signature mismatch`
- [ ] **D2.** El `inserted` del colector dejando de ser 0
- [ ] **D3.** El cobro visible en la unidad **1179558** del portal de Vipps
- [ ] **D4.** Infra: 14/14 deployments y `api-ecom.vio.live` a 200

---

## E. Riesgos con accion, no solo anotados

- [ ] **E1. Envio de Careless en EUR con los productos en NOK.** Puede ser conversion correcta, pero
  **solo lo destapa un pago real** (A3), no un repaso visual. Si el cobro sale con el importe
  equivocado, es esto.
- [ ] **E2. Deriva de version del SDK** (0.27.0 vs 0.26.1). Lo cierra B6. Que **nadie** lo toque en
  paralelo o acabamos con dos versiones en produccion el dia del lanzamiento.
- [ ] **E3. QA apagado todo el fin de semana.** Lo que haya que probar en staging va el **viernes**.
- [ ] **E4. Prod sin apagar el fin de semana.** Ahorrar ~46 USD no compensa un arranque malo el lunes.

---

## F. Plan B, decidido de antemano

Si el **viernes por la tarde no hay un pago cobrado** en la unidad de Careless: salir el lunes
**sin compra** — contenido y analitica, que no mueven dinero — y activar el pago cuando este
probado. Un dia de ventas se recupera; un primer pago que falla delante de Aller y Careless, no.
