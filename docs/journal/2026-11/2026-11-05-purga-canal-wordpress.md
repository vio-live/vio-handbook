---
date: 2026-11-05
session: Purga completa del canal WordPress — 4 PRs (Miguel)
participants: [angelo, miguel]
status: live
---

## Qué pidió Angelo

«lo de wordpress si puedes purgar. hazlo.. para desactivarlo completamente», después de haber
apagado el canal en producción y retirado su rama de `orders`
([journal anterior](2026-11-05-canal-wordpress-retirado.md)).

## Evidencia primero: no había nada vivo

Medido en **producción** el 05/11 antes de borrar una sola línea:

- `channel_user` del canal 7: **0 instalaciones**
- Órdenes por canal: **22, todas `Partner`**. Cero de WordPress, **nunca**
- `checkout_metadata` (la tabla del flujo viejo): **0 filas**
- Logs de los **4 pods de base-api**, 2 días: **0** llamadas a `createPayment`, `getPayment`,
  `receiveWebhook`, `/webhooks/v2/payments`, `receiveConsents`
- Logs de los **2 pods de payment-processors** + el de QA: ver el aviso de abajo

## Los 4 PRs, y EL ORDEN IMPORTA

Hay que mergear de arriba abajo: primero los consumidores, luego las rutas. Al revés deja a
`orders` llamando a rutas que ya no existen.

1. **[orders#52](https://github.com/vio-live/vio-orders-microservice/pull/52)** — la rama del canal
   en `order.service.ts`. −201 líneas, 9 referencias en 5 métodos. 604/604.
2. **[base-api#64](https://github.com/vio-live/vio-base-api/pull/64)** — **el productor**:
   `vippsService.receiveWebhook` creaba las órdenes con `channel: WORDPRESS`. Se va el subárbol
   entero (servicio, controller, router, middleware, conector, `types/vipps/`) y los validadores
   dejan de aceptar `'Wordpress'`. −538 líneas. 716/716.
3. **[payment-processors#21](https://github.com/vio-live/vio-payment-processors-microservice/pull/21)**
   — las rutas. El módulo Vipps de ese micro son **exactamente** las 3 legacy. −395 líneas. 60/60.
4. **[webapp#100](https://github.com/vio-live/webapp-vio-commerce/pull/100)** — el catálogo del
   dashboard. 965/965.

## El hallazgo que no estaba en el plan

**Apagar `channel.enabled` en la base NO basta.** `PROVIDER_GROUPS` de `src/lib/channels.js` es una
lista **a mano** en el front y **no se cruza con el `enabled`** que devuelve `GET /channels`. Sin el
PR #100 el dashboard seguiría ofreciendo «WordPress — Shoppable WordPress pages» como canal
conectable, y quien le diera a conectar se crearía un canal sin ningún código detrás.

Salió de un barrido `gh search code` por toda la organización **después** de dar los otros tres por
terminados. Lección: el inventario de un purgado se hace al final otra vez, no solo al principio.

## Lo que NO se purgó, y por qué

Tres cosas que parecían parte del lote y no lo son:

- **`payment-secrets.ts` → entrada `VIPPS`** (payment-processors). No es de este flujo: es el
  registro de qué campos de una credencial van cifrados con `PAYMENT_SECRETS_KEY`, y lo consumen
  los conectores de Klarna y Stripe. Quitarla rompería el descifrado de credenciales Vipps.
- **`ChannelName.WORDPRESS`** (kernel y base-api). Lo consumen otros micros y es el vocabulario con
  el que se leerían filas antiguas. Quitar el valor del enum rompe y no aporta.
- **`CheckoutMetadata` y su tabla** (base-api). Queda sin uso, pero borrar una entidad es decisión
  de esquema aparte. 0 filas en producción.
- **El icono de WordPress** en el webapp: se queda para que las filas antiguas (107 en QA) no caigan
  al avatar de letra.

Y `vippsPartnershipService` de base-api **no se toca**: es la asignación de unidades de venta del
partnership, viva desde el 22/10. Nombre parecido, cosa distinta.

## QA: pendiente a propósito

El canal 7 sigue `enabled=1` **en QA**, donde tiene **108 filas en `channel_user`, 107 activas**
(datos de prueba). Apagarlo ahora rompería entornos de prueba mientras el código todavía está.
**Se apaga cuando los 4 PRs estén mergeados y desplegados**, no antes.

## Aviso de método: un conteo de grep no es evidencia

El grep de los logs de `payment-processors` dio **6 coincidencias por pod** y parecía tráfico real a
las rutas que iba a borrar. No lo era: las 6 son líneas de arranque de Nest
(`[RouterExplorer] Mapped {/vipps/...} route`). **Ni una sola petición.** Si hubiera creído el
número sin leer las líneas, habría dejado el purgado a medias por un falso positivo — y si hubiera
sido al revés, habría borrado rutas vivas.

## Builds que ya estaban rotos (no son de estos cambios)

Comprobado con `git stash` en los dos casos, contra `develop` limpio:

- **base-api**: `yarn build` falla por tipos de `@azure/core-auth` dentro de `node_modules`. La
  comprobación real se hizo con `npx tsc --noEmit --skipLibCheck` → **0 errores**.
- **webapp**: `yarn build` falla por la clave de Firebase, que no está en local.

## APARCADO (Angelo, 05/11 15:10)

«ok, dejemos esto aparcado entonces». Los **4 PRs quedan abiertos sin mergear** y el canal 7 sigue
`enabled=1` en QA. Nada de esto urge: en producción el canal ya está apagado y nunca tuvo
instalaciones ni órdenes, así que el estado actual es seguro y estable indefinidamente.

Para retomarlo: mergear en el orden de la lista de arriba (consumidores antes que rutas) y apagar
el canal en QA al final.
