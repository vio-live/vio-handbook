---
title: "Órdenes de prueba de Careless canceladas de punta a punta, y el token de Shopify en el log de prod"
date: 2026-10-24
participants: [angelo, miguel]
status: live
---

## Dos órdenes de prueba en prod, canceladas y verificadas — miguel

- Quién: miguel (Angelo puso las órdenes y pidió revisarlas y cancelarlas)
- Dónde: prod `vio-commerce-prod-sc`, micros `orders` / `shopcart` / `extensions`, Shopify de
  Careless (`dignitycollect.myshopify.com`, conexión 541), Vipps MSN **1179558** modo partner
- Cuándo: 2026-10-23 22:07–22:40 UTC (00:07–00:40 Oslo del 24)
- Contexto: la orden de prueba de punta a punta del go-live del lunes 26/10, la única cosa que
  ejercita checkout + webhook + analítica + captura en la unidad de Careless.

### Hecho

**Orden 4126** (22:07:10Z, 1 línea, 658,00 NOK) → Shopify **#554749CL** `18953017884924`.
Verificado contra la tienda, no contra nuestro log:

- `source_name = vio`. **Ya no dice `outshifter`**: el PR #41 de extensions entró a master a las
  21:55Z y los pods rodaron a las 22:07, el mismo minuto que la orden. Queda probado además que
  **Shopify sí respeta `source_name` al crear por REST**, que estaba apuntado como no confirmado.
- Línea de envío «Helthjem - til postkasse/dørmatte», 59,00 NOK, `source=Packrooster`,
  code `helthjem|2|#13435` — idéntico al de las órdenes nativas de Packrooster.
- Metafield `packrooster.shipping-service` presente y orden asignada a 360 Logistics.
- Enlace Shopify↔Vio completo (`note` + `vio_order_id` en `note_attributes`).

**Orden 4127** (22:21:32Z, **2 líneas**, 1.357,00 NOK) → Shopify **#554752CL** `18953041051900`.
Mismo resultado, y además cubre el camino multi-línea.

**Las dos canceladas por el camino de supplier** (`POST /<id>/cancel` con
`{"data":{"user":{"id":1327},"source":"dashboard"}}` desde dentro del pod de `orders`), 200 y `true`.
Los cuatro eslabones, medidos uno por uno:

| eslabón | 4126 | 4127 |
|---|---|---|
| Vio | ítem 4605 CANCELED | ítems 4606 y 4607 CANCELED |
| Shopify de Careless | `cancelled_at` 22:17:46Z, fulfillment_order `closed` | `cancelled_at` 22:33:09Z, `closed` |
| Vipps | `POST /cancel` 200 + webhook `CANCELLED` firmado, 658,00 NOK, psp 21584873773 | `POST /cancel` 200 + webhook `CANCELLED` |
| Analytics | `order_cancelled` aceptado al 1.er intento, 599 NOK, `full=true` | aceptado al 1.er intento, **1.298 NOK de 2 líneas**, `full=true` |

Tres cosas que conviene no malinterpretar al revisar esto:

1. **El dinero nunca se capturó**: fue *liberar la reserva*, no una devolución. En el portal de
   Vipps se ve la reserva desaparecida, no una línea de refund.
2. La reserva de 4126 era de **658** NOK y no de 599: el express añade el envío **después** de
   autorizar. Es el importe correcto y es el que Vipps liberó.
3. En Shopify la orden queda cancelada pero con `financial_status = paid` y `refunds: []`. Es
   cosmético — ese dinero nunca estuvo en Shopify. No leerlo como «cobrado».

La cancelación es **idempotente**: una segunda llamada 3 s después contestó
`{"ignored":true,"reason":"nothing reserved or captured is left"}` en lugar de reintentar.

### El camino de supplier es el único que sirve, y no es obvio

`cancelOrderByReseller` cancela en la tienda del **reseller** (`reseller.shopifyReseller` +
`order.channelId`). La 4126 es canal `Partner` con reseller **Aller 1330**, que no tiene Shopify:
por ese camino la orden **seguiría viva en la tienda de Careless** y 360 Logistics podría
despacharla igual. El que usa `order_item.supplier_shopify_order_id` es
`cancelOrderBySupplier`, o sea cancelar como **1327**.

### Pendiente

- `vio-orders-microservice` **#43 → master** y **#44 → develop**, sin mergear (ADR-0001).
- Lo de `users` + Datadog: **Angelo lo pospone al lunes después del go-live** (00:37 Oslo).

---

## El token de Shopify de Careless, en claro en el log de producción — miguel

- Quién: miguel (lo encontré al revisar el log de la cancelación; Angelo pidió borrar la línea)
- Dónde: prod `vio-commerce-prod-sc` — `orders` (una línea de depuración) y `users` (la fuente
  grande), más el transporte de logs a Datadog EU
- Cuándo: 2026-10-23 22:17–22:40 UTC
- Contexto: salió de paso al leer el log de la cancelación de la 4126.

### Lo que encontré

**`orders`:** quedaba un `console.log('*******', ecomUser)` en `cancelOrderBySupplier`
(`order.service.ts:965`). Ese objeto trae la `shopifyConnection` del vendedor, así que **cada
cancelación por supplier** escribía en claro `accessToken`, `refreshToken`, `expiresIn`,
`refreshTokenExpiresIn`, `url`, `channelHandle`, `locationId`, `carrierId`, `fulfillmentId`.
Al ser `console.log` **esquiva el logger del proyecto**, así que la redacción de `omitPrivate`
que ya existe nunca lo veía.

**`users` es la fuente grande y sigue abierta:** **1.125 y 1.220** apariciones de valores de token
(`shpat_`/`shpca_`/`shprt_`) en los logs de los dos pods vivos. Dos orígenes:

1. dos líneas `[DEBUG] [userService.saveShopifyExportConnection]` que imprimen la conexión entera;
2. el log de consultas de **TypeORM**, que imprime `-- PARAMETERS: [...]` en el
   `UPDATE shopify_connection` con el token dentro.

Ocurre en **cada refresco del token** de Shopify, así que purgar pods ahí compra minutos.

**No se puede apagar por configuración:** el nivel está fijo en el código — `level: 'debug'` en
`package-logger/src/logger.ts`, sin variable de entorno. Es cambio de código y ese paquete lo
comparten los 13 micros. `extensions` **ya lo hace bien** (sus logs muestran `shpca_***(38`,
prefijo y longitud): es el patrón a copiar.

### Hecho

- **Purgado de `orders`**: recreé los dos pods de uno en uno (`kubectl delete pod`, esperando
  `2/2 Running` entre uno y otro — **no** `rollout restart`, para no reclamar campos del
  Deployment y romper el siguiente `helm upgrade`). Conteo final **0** en los dos. Servicio
  nunca por debajo de un pod listo. Hubo que hacerlo **dos veces**, porque la cancelación de la
  4127 lo volvió a escribir.
- **PRs**: `vio-orders-microservice` **#43 → master** y **#44 → develop**. Una línea menos;
  `ecomUser` se sigue usando justo debajo. Sin mergear (ADR-0001).

### Alcance real: quién lo ve

- **Logs de pod**: los lee cualquiera que pueda pedir el kubeconfig. El clúster **no tiene
  integración con Entra ID** (`aadProfile: null`) y `disableLocalAccounts: false`, así que
  «Cluster User» **no** es acceso limitado: da credencial equivalente a admin. Hoy en prod:
  Angelo (Owner), `alan.v.simpson@hotmail.com` (**Owner**), `devmiguelopz@outlook.com`
  (Contributor) y tres service principals — uno de ellos `1c41fb59` (`sp-campaigns-ci`), que se
  creó para el CI de **un** repo y tiene Cluster User en **producción**, que no es lo documentado.
- **Datadog EU**: `package-logger` añade un transporte HTTP a `http-intake.logs.datadoghq.eu`
  cuando hay `DATADOG_API_KEY` y `APP_NAME`; las dos están puestas, el `Init transportDatadog`
  sale en el arranque, la clave valida 200 en EU (403 en US) y el intake responde 200.
  **Recrear pods no limpia nada de ahí.** No hay `DATADOG_APP_KEY` en el entorno, así que no se
  puede consultar, ni ver retención, ni saber quién tiene acceso a esa cuenta. Y ojo: un 200 del
  intake prueba que **acepta**, no que **indexe** — sin plan de Logs podría descartarlo, y eso no
  se distingue desde fuera.
- **La base**: `shopify_connection.access_token` está en claro en MySQL. Acceso estrecho
  (firewall cerrado, solo salida del AKS + credencial `dbadmin`), pero cuenta.

### Decisión de Angelo

- **No se rota nada** (24/10 00:20) y **el resto se toma el lunes después del go-live**
  (00:37): `users`, Datadog y el service principal de CI con acceso a prod.
