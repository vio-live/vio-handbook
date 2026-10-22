---
title: Audit de los flujos del lanzamiento del lunes 26/10 y plan de control
last-updated: 2026-10-23
owner: Miguel
status: entregado — acciones pendientes de decision
---

# Audit de los flujos del lanzamiento y como controlarlo

Pedido de Angelo la noche del 22 al 23/10: auditar **todos los flujos** del lanzamiento y pensar
**como controlar** que vaya bien. Medido contra produccion viva antes de apagarla, mas lectura de
codigo. Lo que no pude medir lo digo.

---

## 0. La conclusion de una linea

**Este sistema no se cae: miente.** En una sola noche encontre **ocho** fallos que no producen
ningun error visible, y en cinco de ellos el sintoma acusaba a un componente inocente. El plan de
control no puede basarse en «no hay errores en los logs»: tiene que basarse en **afirmaciones
positivas de punta a punta**.

Los ocho, por si hace falta convencer a alguien:

| Lo que fallaba | Lo que parecia |
|---|---|
| Faltaba `VIO_API_HOST` en Vercel | «la cuenta de Aller no tiene permisos» (se borro y recreo la cuenta) |
| Faltaba `VIO_CAMPAIGNS_V2` en Vercel | `SPONSOR_NOT_ON_SURFACE`, o sea «la surface esta mal» |
| `channel_user_products` vacio | catalogo vacio, **sin un solo error en ningun log** |
| `channel_user_products.description` en latin1 | `api` muriendo con exit 1 al publicar |
| Webhook de Vipps de ambito partner | `{"webhooks":[]}` si preguntas con la MSN del comercio |
| Webhooks de Shopify declarados por el app | `webhookSubscriptions` devuelve 0 |
| `all-items` del api fallando | graph-ql devuelve `products: 0`, se traga el error |
| Clave de surface no resuelta aun | eventos sin `utm_*` y sin Mixpanel, en silencio |

---

## 1. Los flujos, y donde se rompe cada uno sin avisar

### F1. Escaparate -> catalogo
`Replit (SDK 0.28.0)` -> `graph-ql.vio.live/graphql` -> `api` -> MySQL

- Credencial en `authorization: <api key del channel>` **en crudo, sin Bearer**. `x-api-key` es la
  clave de la **surface** y solo sirve para atribucion.
- **Se rompe en silencio si** `channel_user_products` esta vacio (-> catalogo vacio) o si `all-items`
  falla (-> graph-ql devuelve `[]` igual).
- Estado 23/10: **verificado**, 14 productos, 7 tallas, dos metodos de envio.

### F2. Carrito y checkout
`Cart.CreateCart` -> `AddItem` -> `Checkout.CreateCheckout` -> `Payment.GetAvailablePaymentMethods`

- El metodo de pago sale de **dos** condiciones: switch de la **marca** (`payment_method.options`)
  **y** visibilidad del **channel** (`channel_user_settings.vipps`). Y el *brand* del channel se
  resuelve por los **duenos de los productos publicados**: channel vacio => brand = el publisher =>
  lista vacia aunque el switch este en 1.
- Estado 23/10: **verificado**. Carrito con una Cassia: `subtotal 1499 NOK`, paises `["NO"]`.
  Checkout `ACTIVE`, `available_payment_methods ["Vipps"]`, `totals {total 1499, taxes 299.8}`.
- **Riesgo de presentacion, no de cobro:** `price.amount` viene **sin IVA** (1199,20 donde Careless
  cobra 1499). El carrito y el checkout usan el que incluye IVA. Si el escaparate pinta `amount`, la
  marca aparece un 20 % mas barata que en su web. Hay que pintar `amount_incl_taxes`.

### F3. Pago con Vipps
`shopcart` -> `api.vipps.no` (unidad 1179558) -> webhook -> `shopcart`

- Verificado contra Vipps **hoy**, y sobrevive el fin de semana porque vive en Vipps, no en nuestro
  cluster: webhook `e1de7656-76e2-4871-b23b-2c54119bc7b3` ->
  `https://api-ecom.vio.live/api/shopcart/checkout/vipps/webhook`, con los 8 eventos de ePayment.
  Unidad **1179558** «Careless AS», org `928540650`, `paymentAllowed true`,
  `captureType ReserveCapture`, `partialCapture` y `lateCapture` si.
- **Trampa al verificarlo:** el listado de webhooks solo lo ensena **sin** la cabecera
  `Merchant-Serial-Number`. Con la MSN del comercio devuelve `[]` y parece que no hay nada.
- Red de seguridad **que ya existe y corre**: CronJob `shopcart-reconcile` cada 10 min
  (`POST /checkout/payments/reconcile?minMinutes=15&lookbackDays=7`). Un pago que se quede a medias
  se recupera solo en <=10 min.

### F4. Orden -> Shopify -> 3PL -> captura
`shopcart` -> `extensions` -> Shopify de Careless -> 360 Logistics -> tracking -> captura

- La captura es `shipment`: se cobra **al enviar**. Depende de que vuelva el tracking a Vio.
- **El eslabon que falla en silencio:** el enlace de vuelta Shopify->Vio es un metafield que se
  escribe en un PUT **posterior** al alta. Si ese PUT falla, la orden entra, el 3PL la despacha y la
  reserva **no se captura nunca**, sin que nadie se entere.
- Plan B manual e idempotente: `POST /checkout/payment/vipps/order/<vioOrderId>/shipped`.
- Guion de comprobacion: `../playbooks/scripts/verificar-orden-careless.sh`.
- **Esta cadena nunca ha corrido en produccion.** Es lo unico de todo el lanzamiento sin un solo
  ensayo real.

### F5. Atribucion y analitica
`SDK` -> `events.vio.live` (VM `82.70.54.151`) -> ClickHouse `analytics.vio.live` + Mixpanel EU

- `vio_production.events` esta a **0 filas**. Normal: nunca hubo trafico.
- Red de seguridad **que ya existe y corre**: CronJob `orders-reconcile` cada 15 min
  (`POST /analytics/reconcile?days=2&limit=500`): un `order_paid` perdido se recupera solo.
- **Se rompe en silencio si** la clave de la surface no esta resuelta: el colector trata como
  `minimal` toda clave desconocida **o con la entrada caducada** (TTL 60 s), y `minimal` quita los
  `utm_*`, la pantalla, la zona horaria, descarta `buyer_id` y **no reenvia a Mixpanel**.
  Ver `2026-10-23-consentimiento-y-privacy-mode.md` (T2, mio).
- El consentimiento **no corta eventos**: `requireConsent` por defecto es `false`. Si el colector
  queda a 0 no es consentimiento, es que `start()` no corrio.

### F6. Campanas y surfaces
`dashboard` (Vercel) -> `api.vio.live` (micro campaigns) -> MySQL

- `VIO_CAMPAIGNS_V2=true` puesto en Production y verificado en el bundle (23/10 00:12).
- `surface 1` «Mote Livsstil Hub», publisher 1330, `status active`, `markets []`,
  `privacy_mode standard`. **`surface_channel (1, 480)` ya existe.** Campanas: **0**.
- Pendiente: que Angelo cree la campana. Criterio: `POST /api/campaigns` -> 201.

---

## 2. Infraestructura: lo que hay que mejorar, por gravedad

### G1 — ALTO. Un solo pod en la puerta de entrada

`istio-ingressgateway` tiene **1 replica**. Por ahi entran los cuatro dominios:
`api-ecom.vio.live`, `graph-ql.vio.live`, `api.vio.live`, `campaigns.vio.live`. Si ese pod se va
(desalojo, mantenimiento del nodo, OOM), **cae todo a la vez**: catalogo, checkout, webhook de Vipps
y dashboard. Hay HPA (1-5, 80 % de CPU) pero parte de 1, y el HPA reacciona **despues** del
problema, no antes. Tampoco tiene PDB, asi que una operacion de nodo se lo lleva sin reemplazo.

**Arreglo:** subir a **2 replicas minimo** y ponerle un `PodDisruptionBudget` de `minAvailable: 1`.
Es un cambio de un valor, sin riesgo, y es lo mas rentable de toda esta lista.

### G2 — ALTO. `graph-ql` no tiene limites de recursos

Es la puerta del SDK — el servicio mas critico del lunes — y es el **unico** de los 14 sin
`requests` ni `limits`. Eso lo deja en clase **BestEffort**: ante presion de memoria en el nodo,
kubelet lo mata **primero**, antes que cualquier otro. Los otros 13 tienen `200m/1` de CPU y
`256Mi/512Mi` de memoria.

**Arreglo:** darle requests/limits como los demas (o mas, siendo la puerta del SDK).

### G3 — MEDIO. Ningun servicio de aplicacion tiene HPA ni PDB

Los HPA que hay son solo de `istio`. Los 14 micros corren con replicas fijas (`graph-ql` 2,
`base-api` 4, `middleware` 3, `tracking` 3, el resto 1-2). Y ningun PDB: ya medi que **un deploy
borra todos los pods de un servicio a la vez y corta ~62 s con 503** aunque haya 4 replicas.

**Para el lunes:** no tocar nada por el pipeline. Si hay que reiniciar algo, `rollout restart`.
**Despues:** HPA al menos en `graph-ql`, `api` y `shopcart`, y PDB en todos.

### G4 — MEDIO. Todas las imagenes son `:latest`

13 de 14 deployments corren `<servicio>:latest` (la excepcion es `campaigns:35`). No se puede saber
que version corre, no se puede volver atras con precision, y **si un pod se recrea puede traer codigo
distinto al que validaste**. Es el peor acompanante posible de una congelacion: la congelacion
asume que lo que corre no cambia, y con `:latest` eso no esta garantizado.

**Para el lunes:** no mergear nada (ya decidido). **Despues:** etiquetar por version o digest.

### G5 — MEDIO. La base no tiene alta disponibilidad ni geo-backup

`vio-ecom-db-prod-sc` (`rg-vio-databases`): `Standard_D2ds_v4`, GeneralPurpose, 2 vCPU, 20 GB,
**HA deshabilitada**, **geo-backup deshabilitado** (Sweden Central no lo soporta para MySQL),
retencion 35 dias. Instancia unica: un fallo de zona se arregla restaurando de backup, con el
tiempo de parada que eso implica.

Diferido por coste, con criterio. Lo que **si** hay que saber el lunes: **el CronJob de backup
offsite esta roto por diseno** (instala paquetes en runtime y el sidecar de Istio le corta la
salida; ultimo exito hace 9 dias). La unica red son los dumps a mano. **Hice uno esta noche**:
`prod-dump-golive-20261023.sql.gz`, 128/128 tablas, MD5 verificado.

### G6 — MEDIO. La analitica entera depende de tres maquinas de 1 GB sin redundancia

- Colector de prod: VM `82.70.54.151`, 2 nucleos, **954 MB de RAM** (490 libres), swap 2 GB.
- Colector de staging: `129.151.196.99`, igual.
- **ClickHouse: un unico host `129.151.210.107`** que sirve `vio_production`, `vio_staging` **y**
  `vio_development`. 40,8 GB libres de 47,4. Uptime 23 dias.

O sea: **staging y produccion comparten el almacen de analitica**. Una prueba de carga en staging
puede afectar a los datos de produccion, y ese host no tiene replica. No es critico para vender
(el comercio no depende de ClickHouse), pero si para medir el lanzamiento — que es justamente el
objetivo del piloto con Aller.

**Para el lunes:** nada. **Despues:** separar prod de staging, o al menos vigilar memoria.

### G7 — BAJO. Lo que esta bien y conviene no romper

- **14/14 deployments** con todas sus replicas listas.
- **Certificados** renovados y con margen: `api-ecom` y `graph-ql` hasta el **28/12**, `api.vio.live`
  hasta el **14/01**, `campaigns` hasta el **11/01**. Renuevan solos por DNS-01.
- 4 nodos de 4 vCPU y 16 GB, carga baja.
- Firewall de la base cerrado (solo la salida del AKS).
- Las **dos redes de seguridad** (`shopcart-reconcile`, `orders-reconcile`) corren y su ultimo exito
  fue de hace minutos.

---

## 3. Plan de control del lunes

### Antes de abrir (primera hora)

1. `ANALYTICS_READ_TOKEN=<el de solo lectura> bash docs/playbooks/scripts/verificacion-golive-lunes.sh --con-db`
   Tiene que dar **0 MAL**.
2. **Afirmaciones positivas de punta a punta** (esto es lo que no cubre el guion todavia, y lo que
   de verdad distingue «funciona» de «no hay errores»):
   - catalogo: `GetProducts` con la api key del channel devuelve **14**
   - pago: `GetAvailablePaymentMethods` devuelve **Vipps**
   - precio: el primer producto trae `amount_incl_taxes` **1499** (no 1199,20)
   - webhook: el listado de Vipps **sin** cabecera de MSN ensena `e1de7656`
3. Mirar que `istio-ingressgateway` tenga al menos 1 pod listo y, si se aplico G1, 2.

### Durante el dia, en este orden de probabilidad

1. **La primera orden real.** Es lo unico sin ensayo. Con el guion
   `verificar-orden-careless.sh`: que el alta no falle por el titulo de la talla, que el
   `fulfillment_order` quede en **360 Logistics**, y que aparezca el metafield
   `outshifter-qa.outshifter-order-id` (si falta, la captura **no ocurrira nunca** y hay que usar el
   plan B manual).
2. **Firma del webhook:** que en el log de `shopcart` **no** aparezca
   `[vippsEvent] ... refused: signature mismatch`.
3. **El cobro en el portal de Vipps bajo la unidad 1179558**, no bajo la de Vio.
4. **El colector dejando de ser 0** (`inserted` en `/health`). Si a los 10 minutos de trafico sigue
   a 0, `Vio.analytics.start` no corrio.
5. **Mixpanel recibiendo** (`sinks.mixpanel.forwarded` > 0). Si llega a ClickHouse pero no a
   Mixpanel, es la clave de surface tratada como `minimal`: esperar un minuto y volver a mirar.

### Lo que NO hay que hacer el lunes

- Ningun merge, ningun deploy por el pipeline (~62 s de 503 por servicio).
- No tocar `ACCOUNT_PAYMENTS`: encenderla **quita de la interfaz los interruptores de pago por
  channel**, justo la palanca que harias servir si algo falla.
- No reiniciar `istio-ingressgateway` mientras tenga 1 sola replica.

---

## 4. Acciones propuestas, para que Angelo decida

| # | Accion | Riesgo de hacerlo | Cuando |
|---|---|---|---|
| G1 | `istio-ingressgateway` a 2 replicas + PDB `minAvailable: 1` | muy bajo, es un valor | **antes del lunes** |
| G2 | requests/limits a `graph-ql` | bajo, pero **recrea sus pods** | **antes del lunes**, con margen |
| T2 | que el colector no degrade a `minimal` una surface ya resuelta | bajo, toca la ruta de atribucion | hoy viernes |
| A | anadir al guion las 4 afirmaciones positivas de arriba | ninguno, es solo lectura | hoy viernes |
| G3 | HPA + PDB en los servicios de aplicacion | medio, cambia charts | despues del lunes |
| G4 | imagenes por version/digest en vez de `:latest` | medio, toca CI de 13 repos | despues del lunes |
| G5 | HA en la base | coste | cuando haya caja |
| G6 | separar ClickHouse de prod y staging | medio | despues del lunes |

G1 y G2 son los dos unicos que de verdad cambian la probabilidad de que el lunes salga bien. Los dos
tocan el cluster, que **ahora esta apagado**: entran cuando se encienda, y G2 conviene con margen
porque recrea los pods de `graph-ql`.
