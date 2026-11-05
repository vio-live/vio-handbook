---
date: 2026-11-05
session: Canal WordPress apagado en prod y retirado de orders; PR #39 de analytics mergeado (Miguel)
participants: [angelo, miguel]
status: live
---

## Qué pidió Angelo

«ve con ellos» sobre dos puntos del inventario de pendientes: cerrar el PR #39 de `vio-analytics` y
apagar el canal WordPress retirando su rama (decisión del 22/10, ver
[journal](../2026-10/2026-10-22-canal-wordpress-descartado.md)).

## 1. vio-analytics #39 — mergeado

`docs: deploy playbook debe usar git archive, no rm -rf .git && tar`. Solo docs, CI en verde.
Mergeado en squash: **`1efb8b9`**, rama borrada.

El cambio importa más de lo que parece: el método documentado hacía `rm -rf .git` **sobre el clon
local del que despliegas**, y además rompía `export-subst`, que es lo que mete el commit real en
`build-info.ts`. Con el método viejo el `/health` del colector decía `version:"dev"`.

## 2. Canal WordPress

### Apagado en producción (hecho)

`UPDATE channel SET enabled=0 WHERE id=7` desde el pod de users, **con comprobación previa dentro
del mismo script**: aborta si `channel_user` tiene alguna fila para el canal 7. Dio 0, así que siguió.
1 fila afectada. Estado antes y después registrados en la salida.

- **Prod**: canal 7 con **0 instalaciones**. Apagado.
- **QA: NO tocado.** Allí el canal 7 tiene **108 filas en `channel_user`, 107 activas** (datos de
  prueba). Apagarlo allí rompería entornos de prueba sin ganar nada; se apagará cuando el código
  salga, no antes.

### Retirada del código: PR [orders#52](https://github.com/vio-live/vio-orders-microservice/pull/52)

`order.service.ts`, **-201 líneas**. Eran **9** referencias al canal, no la única que decía el
journal del 22/10 (ese solo había visto `cancelOrderFunctions.wordpress`):

1. `cancelOrderInShop`: bloque `if (channel === WORDPRESS)` con las llamadas directas a
   `klarna/stripe/vipps cancelPayment`, **más dos guardas `!== WORDPRESS`** que excluían al canal
   del camino normal.
2. `cancelOrderSupplier`: cancelación por ítem de Stripe + la guarda del aviso.
3. `processOrderCompleted`: ramas de captura total de Klarna y de Vipps.
4. `processOrderPartial`: **el método entero**, su cuerpo era solo la captura parcial de Vipps de
   WordPress. Con él se va su única llamada y el `else` que la envolvía.
5. `deleteItemOrder`: refund por ítem de Stripe y la guarda `!fromWordpress`.
6. Dos `const paymentId` que quedaban sin uso.

Las guardas negadas se sustituyen por la condición **sin** el canal: para cualquier canal vivo ya
eran ciertas, así que no cambia el comportamiento de nadie.

### Lo que NO se retiró, y por qué importa

El plan decía «y detrás las rutas Vipps legacy de `payment-processors`». **Medido: no se pueden
retirar en bloque.**

- `/stripe/cancelPayment` → **consumidor vivo**: `tellPaymentServiceAboutStripe`, el camino de
  cancelación/refund desde la tienda del 15/10, con test que lo afirma. Retirarla rompe producción.
- `/klarna/cancelPayment` → sigue en el camino de Klarna.
- Solo las **tres de Vipps** (`capturePayment`, `captureFullPayment`, `cancelPayment`) quedan sin
  consumidor conocido en `orders` — lo que confirma la medición del 22/10.

Y antes de tocarlas hay que mirar **`base-api`**: `src/service/vippsService.ts` crea órdenes con
`channel: ChannelName.WORDPRESS` (webhook Vipps viejo, distinto del actual de shopcart). Ese es el
**productor** de órdenes en ese canal. Retirar las rutas sin retirar el productor dejaría un camino
que crea órdenes que luego nadie puede cobrar ni cancelar. PR aparte.

## Verificación

- `yarn build` OK; `yarn test:unit` **604/604** (eran 606: se van los 2 tests de este canal).
- `npx eslint` sobre el fichero: **salida idéntica a `develop`**. Comparé antes/después y mi primera
  versión introducía 2 avisos nuevos (`paymentId` sin usar); los corregí hasta dejarlo igual.

## Lección de método

El primer intento de la edición la hice contando llaves con un script, y se llevó **776 líneas** de
un tajo: los `${...}` de las plantillas y las llaves dentro de cadenas rompen el conteo. Lo tiré con
`git checkout --` y lo rehíce por **rangos de línea verificados uno a uno** antes de cortar. Si un
borrado automático devuelve un tamaño que no cuadra con lo que esperabas, no es un detalle: es que
el algoritmo está mal.
