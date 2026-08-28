# 2026-08-26/28 — Webapp Commerce a producción, tiempo real y conexión de tienda

Cierre del arco de `webapp-vio-commerce`: la migración salió a producción,
volvió el tiempo real y el flujo de conectar la tienda propia quedó usable.
(Trabajo del 25 al 28 de agosto; el 24 quedó documentado en
`2026-08-24-webapp.md`.)

## 1. Auditoría de pulido antes de prod

Un barrido sistemático de las 11 vistas (subagente por patrones + QA propio
en viewport móvil) sacó cosas que el QA por feature no veía:

- **Bug de datos**: las clases de envío se guardaban siempre con
  `currencyCode: 'EUR'`. Un seller noruego escribía 79 y persistía 79 EUR.
- Tres pantallas seguían con el ternario `=== 'EUR' ? '€' : código`.
- **Errores tragados**: catálogo de canal, Activity y Settings mostraban
  "no hay nada" o giraban para siempre cuando el backend fallaba (el patrón
  era destructurar `data`/`isLoading` sin `error`).
- **Móvil**: las tablas son grids de columnas fijas y a 390px las celdas se
  **encimaban** (la cabecera se leía "PRSCODULPCOTE"). Nuevo `TableScroll`.
- Listas sin orden estable (canales y conexiones saltaban entre
  revalidaciones de SWR), estado vacío que mentía en cuentas nuevas.
- **Accesibilidad**: ningún botón mostraba foco de teclado — `outline-none`
  de `buttonVariants` ganaba a la regla global (las utilidades de Tailwind
  van sin layer). Y las etiquetas de Settings no estaban asociadas al input.

También se unificó el formato en un solo sitio (`src/lib/format.js`):
fechas día-mes (`17 Aug`), números con separadores fijos (había
`toLocaleString()` sin locale = formato del SO de cada usuario) y dinero
**siempre por código de moneda** — el dashboard mostraba `$696.4K` mientras
el chip del topbar decía EUR.

## 2. Producción

- **Webapp** `develop→master` con OK explícito: 41 commits (`e00206b`), el
  release más grande del repo. Prod venía del 19-ago.
- **Microservicios**: `vio-api-microservice` `cc116f3` (notificación
  `REQUEST_RECEIVED` al crear una solicitud) y `vio-products-microservice`
  `d3ae10d` (trío del listado + hotfix `createDemos`).
- ⚠️ **Lección**: en los repos de microservicios `master` **diverge** de
  `develop` a propósito (lleva fixes propios de prod: redis, SSL de BD).
  `push develop:master` lo rechaza Git — hay que **mergear develop en
  master**, como se hizo siempre. Los merges salieron limpios y solo
  tocaron los archivos de los fixes.
- Tras cada deploy hay ~30s de 503 mientras reinicia el pod: reintentar
  antes de diagnosticar.
- Antes de promover se quitó un `AVATAR_PLACEHOLDER` que apuntaba al
  contenedor de **staging** (404 en prod).

## 3. El tiempo real estaba ahí y no lo usábamos

Al retirar el legacy se fue `socket.io-client` — lo consumían las sagas.
Pero **el servidor sigue vivo** (`{API_HOST}/socket.io`, socket.io v4, solo
transporte websocket) y el backend nunca dejó de emitir.

Contratos (base-api `userService.userSocket`):
- Los eventos llevan el userId **en el nombre**: `${event}/${userId}`.
- El payload viene **envuelto**: `{ event, data: { status, data } }` — el
  `status` está en `payload.data.status` (costó un ciclo de QA).
- Útiles: `connection-ecom-user/:id` (`waiting`|`success` al conectar la
  tienda), `users/:id/notifications/new`, `new-order/:id`,
  `accepted-request/:id`, `received-request/:id`, `new-channel/:id`,
  `product-publish/:id`, `subscription-update/:id`.

Se reintrodujo con una capa mínima (`src/lib/socket.js`: una conexión por
sesión + `useSocketEvent`). Truco de QA: se puede disparar cualquier evento
con `POST /api/users/socket/:userId {data:{event,data}}`.

## 4. Conectar la tienda propia (supplier)

El flujo estaba roto de tres formas y las tres se arreglaron:

1. **La API key se creaba y no se veía**: el `POST` la devuelve, pero
   `GET /ecom-user` sigue vacío hasta que una tienda conecta. Como el
   backend no la vuelve a exponer, cada key generada era **irrecuperable**.
2. **No había estado de espera** (el legacy sí lo tenía): ahora
   "Waiting for your <plataforma> store to connect…", persistido en
   localStorage (24h) y resuelto por socket o por polling de respaldo.
3. **No se elegía la plataforma**: el backend ya aceptaba
   `options.ecom` (`SHOPIFY|WOOCOMMERCE|MAGENTO`) en `createApiCredential`
   — al pasarlo crea el `ecom-user` al vuelo y **la credencial pasa a venir
   en `/ecom-user`**, dejando de perderse. Ahora se elige antes de generar,
   con el logo y las instrucciones de esa plataforma.

Pendiente de backend (tarjeta a Alan): persistir una **notificación** al
conectar (el socket es efímero: si no tienes el dashboard abierto no te
enteras) y guardar `ecomName` con la plataforma elegida (hoy va dentro de
`name` y el GET no lo devuelve).

## Estado al cierre

Prod: dashboard `3be4aaf`, api-ms `cc116f3`, products-ms `d3ae10d`.
146 tests, build limpio, smoke de prod verde.

En To do de Alan (con etiquetas y evidencia pedida): corroborar el release
con su tienda real · PRs #3 y #4 de notificaciones · notificación
persistente + `ecomName` · reactivar la suite de request y meter jest al
CI · (Backlog) cascade de orders.
