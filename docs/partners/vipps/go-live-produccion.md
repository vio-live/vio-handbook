---
title: "Vipps en producción — plan de salida"
last-updated: 2026-10-13
owner: angelo
status: plan — pendiente de partner keys y de cuatro decisiones de Angelo
---

# Vipps en producción — plan de salida

Vipps aprobó el checklist ePayment el 13/10 («ready to proceed into production»,
[journal](../../journal/2026-10/2026-10-13-vipps-checklist-aprobado.md)). Este documento es el orden
para encender Vipps en producción y sacar el primer comercio. Arquitectura y modos de credencial:
[`architecture/vipps.md`](../../architecture/vipps.md).

## Punto de partida (comprobado el 13/10 contra el cluster de producción)

- **El código de Vipps ya está en producción**: Miguel llevó `develop` a producción en los 14 repos
  el 12/10 ([journal](../../journal/2026-10/2026-10-12.md)). Cluster `vio-commerce-prod-sc` encendido,
  24/24 deployments, CronJob `shopcart-reconcile` corriendo (barrido vacío: no hay pagos abiertos).
- **Producción está en reposo**: 0 órdenes en las últimas 24 h.
- **Faltan en producción**: 3 commits de pagos en shopcart (devolución automática del duplicado de
  Stripe, `duplicate_of`; #84–#86) y 1 en graphql (`duplicate_of`, #23). El resto de la diferencia son
  las purgas de la clave de Datadog en `.env.test` (sin efecto en ejecución).
- **Configuración de Vipps en producción, hoy** (comprobado sin imprimir valores):

| Variable | shopcart | api | orders | users | Lo que debe ser |
|---|---|---|---|---|---|
| `VIPPS_API_URL` | `apitest.vipps.no` | igual | igual | igual | `https://api.vipps.no` |
| `VIPPS_PARTNER_CLIENT_ID` / `_SECRET` / `_SUBSCRIPTION_KEY` | no | no | no | no | las partner keys de producción |
| `VIPPS_PARTNER_WEBHOOK_SECRET` | no | — | — | — | el del registro del webhook de partner |
| `VIPPS_CLIENT_*` (plataforma) | sí | sí | sí | sí | decisión 2 |
| `EMAIL_DELIVERY` | no (kernel 1.0.267) | no | no | no | `on` |

`base-api` también lee `VIPPS_API_URL` (el conector legacy de Vipps v2): se cambia a la vez.
El verificador de claves de api-ms prueba los dos hosts, test y live, por su cuenta.

## Fase 0 — Dos riesgos vivos, independientes de Vipps (hacer ya)

1. **Los correos de producción están apagados desde el 12/10 13:18 UTC.** orders, users y api corren
   el kernel `@vio-/service` 1.0.268, que no envía nada si `EMAIL_DELIVERY` no está puesto (arranque:
   `[mailService] EMAIL_DELIVERY=off (unset → off)`). Sin órdenes desde entonces no se perdió ningún
   correo de compra, pero el primer comprador no recibiría confirmación, ni un usuario nuevo su
   correo de alta. Arreglo: `EMAIL_DELIVERY=on` en el Secret `env-sc-<servicio>` de orders, users, api y
   shopcart, la misma línea en el blob, recrear los pods (no hace falta reconstruir; ver
   [`playbooks/prod-power-on-demand.md`](../../playbooks/prod-power-on-demand.md)). Comprobar el arranque
   `EMAIL_DELIVERY=on` y enviar un correo real de prueba: la cuenta de Mailjet de QA quedó bloqueada el
   06/10 y no se sabe si la de producción está sana.
2. **El SDK 0.20.3 (paquete de Vev 0.325) pide `duplicate_of` y el gateway de producción no lo tiene.**
   Una página de Vev en entorno *Production* republicada sobre la 0.325 recibiría un error de GraphQL en
   `GetCheckout` y `GetVippsStatus`: la vuelta del pago diría que no pudo verificarlo (la orden se crea
   igual por el webhook). En los logs de producción no hay ninguna petición así todavía. Arreglo:
   llevar graphql #23 a producción (campo nuevo y opcional, sin riesgo).

## Fase 1 — El código que falta

Mismo método que el 12/10: un PR `develop → master|main` por repo, CI verde, y comprobar que el digest
del pod es el del `:latest` del registro. Ninguna migración.

1. **graphql** (#23) — primero, cierra el riesgo 2.
2. **shopcart** (#84–#86).
3. Las purgas de Datadog de los demás repos pueden ir en el mismo tren o esperar.

## Fase 2 — Partner keys (de Vipps a nosotros)

- Pedidas en el hilo de Michael con Vipps: partner keys de producción y acceso a la Management API
  (product orders), para dar de alta comercios con formulario prellenado.
- **Las claves nunca pasan por repos, handbook, Trello ni memoria**: van directas al blob y al Secret
  (Miguel).

## Fase 3 — Configuración de producción (Miguel)

1. En shopcart, api, orders, users y base-api: `VIPPS_API_URL=https://api.vipps.no`.
2. En shopcart: `VIPPS_PARTNER_CLIENT_ID`, `VIPPS_PARTNER_CLIENT_SECRET`, `VIPPS_PARTNER_SUBSCRIPTION_KEY`.
3. `VIPPS_CLIENT_*` según la decisión 2.
4. Secret + blob, recrear pods, comprobar que el `.env` montado tiene las líneas (contar, no imprimir).
5. **Registrar el webhook de partner** (cubre todas las unidades bajo el partner):
   port-forward al shopcart de producción y `POST /checkout/register/webhook/vipps` con
   `{ "scope": "partner" }`. Devuelve el secreto una sola vez: a `VIPPS_PARTNER_WEBHOOK_SECRET`, recrear
   shopcart. Comprobar con `GET /checkout/webhook/vipps?scope=partner` que hay **una** registración y que
   apunta a `api-ecom.vio.live`.

## Fase 4 — El primer comercio

1. **Angelo elige el comercio** (Vipps quiere revisar el primero en vivo).
2. **Alta de su unidad de venta bajo el partner**: product order por Management API o plantilla del
   portal de Vipps; el comercio firma con BankID; Vipps confirma y nos da el MSN. El alta desde el
   dashboard no está construida: el primero es a mano.
3. En el dashboard de producción, el comercio crea su Vipps en modo *Vipps through Vio*. Vio asigna el
   MSN: `PATCH api-ms /paymentmethod/:id/vipps-sales-unit` (interno, por port-forward).
4. Ajustes del comercio: Express encendido; envío fijo o dinámico; modo de captura (decisión 3);
   devolver y cancelar quedan siempre encendidos en modo partner.
5. Canal: método Vipps encendido, mercado con Noruega, términos de compra.
6. Página de Vev o Replit en entorno *Production* con la clave del canal de producción, republicada
   sobre la 0.325 o posterior.

## Fase 5 — Verificación con dinero real

Angelo, con su propio Vipps y un producto barato. Cada paso deja referencia `VIO-…` e id de orden en
el journal del día.

1. Pago normal desde la kasse → orden creada, recibo en la app de Vipps, webhook con `signed: true`
   en el log de shopcart, correo de confirmación recibido.
2. Express desde la ficha → dirección y envío en la app → importe = productos + envío elegido.
3. Captura (al enviar con tracking, o desde la card de la orden).
4. Devolución parcial y luego total desde la card.
5. Otra orden sin capturar, cancelada → reserva liberada en Vipps.
6. Si el comercio tiene tienda conectada (Shopify o Woo): la orden aparece allí y cancelar desde la
   tienda libera el pago. (Devolver desde Shopify necesita además el webhook `refunds/create`,
   vio-shopify-sync#110 + `shopify app deploy` de producción.)
7. Barrido de producción sin `unreadable` ni `errors`.

## Fase 6 — Aviso y vigilancia

- **Avisar a Vipps en el hilo de Michael**: primer comercio en vivo, su MSN y la fecha.
- Primera semana: errores `[VippsConnector]` en el log de shopcart, el resumen del barrido, y la
  [status page](https://status.vippsmobilepay.com/) (suscrita).

## Marcha atrás

- **Inmediata**: apagar Vipps en el canal desde el dashboard. No entra ningún pago nuevo; lo ya
  reservado se libera o se devuelve desde la card de cada orden.
- **Código**: relanzar el último run verde del servicio en la rama de producción (las imágenes llevan
  también el número de run).

## Decisiones de Angelo

1. El primer comercio.
2. **Claves de plataforma en producción** (`VIPPS_CLIENT_*`): hoy hay unas claves cargadas que no
   sabemos de qué unidad son. Con la URL de producción, un vendedor sin fila de Vipps caería en ellas.
   Recomendación: vaciarlas, para que en producción solo pague quien tenga su fila (partner u own).
3. Modo de captura del primer comercio: *at shipment* si su tienda manda tracking, *at payment* si
   no envía nada físico; nunca *on account* para el primero.
4. OK para la fase 0 (correos y graphql #23) ahora, antes de tener las partner keys.

## Quién hace qué

| Quién | Qué |
|---|---|
| Angelo | Decisiones 1–4; verificación con dinero real (fase 5) |
| Michael | Hilo con Vipps: partner keys, Management API, aviso del primer comercio |
| Miguel | Secrets y blob de producción, registro del webhook de partner (fases 0 y 3) |
| Claude | PRs a producción (fase 1, con OK), asignación del MSN, revisión de logs, journal |
