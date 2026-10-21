---
title: "Vipps en producción — plan de salida"
last-updated: 2026-10-19
owner: angelo
status: plan — primer comercio firmado (Careless, MSN 1179558); partner keys por localizar; pendiente de las decisiones de Angelo
---

# Vipps en producción — plan de salida

Vipps aprobó el checklist ePayment el 13/10 («ready to proceed into production»,
[journal](../../journal/2026-10/2026-10-13-vipps-checklist-aprobado.md)). Este documento es el orden
para encender Vipps en producción y sacar el primer comercio. Arquitectura y modos de credencial:
[`architecture/vipps.md`](../../architecture/vipps.md).

> **19/10, estado real (cruzado con la release del 16/10):**
>
> - **Fases 0 y 1 hechas el 16/10** por la release completa
>   ([journal](../../journal/2026-10/2026-10-16-release-prod-pasos-1-4.md)): `develop` entero está en
>   producción, graphql #23 incluido, y `EMAIL_DELIVERY=on` en orders, users y api, comprobado en los
>   pods.
> - **Las claves de plataforma de producción** (`VIPPS_CLIENT_*`) son de una **unidad de test**,
>   MSN 225388, sobre `apitest.vipps.no`. Vipps nunca ha cobrado de verdad en producción.
>   `VIPPS_WEBHOOK_SECRET` está vacío.
> - **Las claves que pasó Angelo el 16/10 se dieron por inválidas, y conviene reprobarlas.** Los dos
>   motivos dados no se sostienen:
>   - el formato `…Q~…` del `client_secret` es el normal en Vipps: la unidad de test NewCo 545865,
>     que funciona, tiene un secreto con esa misma forma;
>   - que el MSN venga vacío es lo esperable en unas **partner keys**, que no pertenecen a ninguna
>     unidad de venta.
>
>   El `AADSTS7000215` sí dice que el secreto no casa con el `client_id` en ese host. Hay que repetir
>   la prueba en los dos hosts, descartando espacios o caracteres perdidos al copiar. Están en el
>   `TOOLS.md` de Miguel.
> - El camino «For developers → Production → Show keys» del handoff del 16/10 es el del portal de
>   **comercio**, que da las claves de una unidad propia. Angelo no tiene ninguna activa (solo IQPLUS
>   AS, desactivada). El partner portal no muestra claves.
>
> **16/10 (lo que se creyó entonces):** Vipps entregó las partner keys de producción (fase 2 hecha). Correcciones al plan,
> comprobadas contra el código: las partner keys van también en **api** (fase 3), `VIPPS_API_URL` lo
> lee también **payment-processors**, y la fase 1 ya no puede ser «develop entero»: graphql y
> shopcart avanzaron desde el 13/10. El cluster de producción está **apagado** (`Stopped`).

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

Quién lee de verdad las variables de Vipps (comprobado en `develop` el 16/10):

- **shopcart**: todo el flujo ePayment, Express y webhooks; `VIPPS_PARTNER_*` y
  `VIPPS_PARTNER_WEBHOOK_SECRET`.
- **api**: `VIPPS_PARTNER_*` para comprobar la fila de un vendedor en modo partner
  (`paymentMethod.service.ts`, el probe de *verify*). Sin ellas cae a `VIPPS_CLIENT_*`. Su
  verificador de claves propias prueba test y live por su cuenta (`VIPPS_HOSTS`).
- **payment-processors** y **base-api**: `VIPPS_API_URL` y `VIPPS_CLIENT_*` para el conector
  legacy `ecomm/v2`. orders solo lo usa en pedidos de canal WordPress; el resto de Vipps va por
  shopcart.
- **orders** y **users** tienen las líneas en su `.env`, pero su código no las lee. Cambiarlas allí
  no hace daño y deja los cuatro ficheros iguales.

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

Mismo método que el 12/10: PR a `master|main`, CI verde, y comprobar que el digest del pod es el
del `:latest` del registro. Ninguna migración.

**Corregido el 16/10.** Ya no vale llevar `develop` entero:

1. **graphql**: llevar **solo #23**, con un `cherry-pick` de `2a2d643` sobre `master` en una rama
   de hotfix. `develop` trae además #24–#26, y #25 y #26 cambian cómo decide la auth. Eso va en la
   próxima release completa, no colado en la de Vipps. #23 es imprescindible: la página del primer
   comercio irá sobre el paquete de Vev actual (0.329), que pide `duplicate_of`.
2. **shopcart**: **no hace falta para Vipps**. #84 es la devolución del duplicado de **Stripe** y
   #85/#86 son el motivo del duplicado. La guarda de un pago por carrito ya está en producción
   desde el 12/10. Además `develop` trae desde el 13/10 la F2 de brand-publisher (#87–#91, kernel
   1.0.270–1.0.273, `Cart.seller`). Va en la próxima release completa.
3. Las purgas de Datadog esperan a esa misma release.

## Fase 2 — Partner keys (de Vipps a nosotros) — POR LOCALIZAR

> **21/10, leída la documentación oficial de Vipps.** Fuentes:
> [partner keys](https://developer.vippsmobilepay.com/docs/partner/partner-keys/),
> [partner checklist](https://developer.vippsmobilepay.com/docs/partner/partner-checklist/),
> [standard](https://developer.vippsmobilepay.com/docs/APIs/access-token-api/standard-authentication/)
> y [specialized authentication](https://developer.vippsmobilepay.com/docs/APIs/access-token-api/specialized-authentication/).
>
> - **No se sacan del portal.** El correo de bienvenida trae solo las claves de la unidad de test
>   (NewCo 545865). Tras aprobar el checklist, *partner@vippsmobilepay.com* manda «la información
>   que falta»; ahí vienen las partner keys de producción. Si se pierden, se piden al partner
>   manager (Fredrik Rogne) o a partner@.
> - **Solo funcionan en producción** (en test no hay funcionalidad de partner), y **la cabecera
>   `Merchant-Serial-Number` es obligatoria** en cada llamada.
> - **ePayment** usa la autenticación estándar: `POST https://api.vipps.no/accesstoken/get` con
>   `client_id`, `client_secret` y `Ocp-Apim-Subscription-Key`.
> - La **Report API** y la **Sales API** usan claves de contabilidad y la autenticación
>   especializada: `POST https://api.vipps.no/miami/v1/token`, Basic `client_id:client_secret`,
>   `grant_type=client_credentials` y **sin** subscription key. Es otro juego de claves.
> - **Nuestra propia unidad de producción no hace falta.** El partner hace todo en test, y en
>   producción opera con las unidades de sus comercios (Careless, MSN 1179558).
> - Siguiente paso: reprobar las claves del 16/10 con la autenticación estándar y el MSN de
>   Careless. Si da `AADSTS7000215` otra vez, pedir a Fredrik o a partner@ que las reenvíen por un
>   canal seguro.

- **19/10 (corrige al 16/10):** el partner portal **no muestra las partner keys**. Solo tiene
  *Product Orders*, *Product Order Templates*, *Sales Units*, *Prices* y *Developers* (webhooks),
  según la [documentación del portal](https://developer.vippsmobilepay.com/docs/partner/partner-portal/).
  Las claves (`client_id`, `client_secret`, `Ocp-Apim-Subscription-Key`) llegan en el **correo de
  bienvenida** del partnership o las manda el equipo de partners
  ([partner keys](https://developer.vippsmobilepay.com/docs/partner/partner-keys/)). Con partner keys
  la cabecera `Merchant-Serial-Number` es obligatoria en cada llamada (shopcart ya la manda).
- Lo que sí había el 16/10 era la **alta del primer comercio** (fase 4).
- Falta confirmar si llegó también el acceso a la Management API.
- Pedidas en el hilo de Michael con Vipps: partner keys de producción y acceso a la Management API
  (product orders), para dar de alta comercios con formulario prellenado.
- **Las claves nunca pasan por repos, handbook, Trello ni memoria**: van directas al blob y al Secret
  (Miguel).

## Fase 3 — Configuración de producción (Miguel)

0. **Probar las claves antes de cargarlas.** `POST https://api.vipps.no/accesstoken/get` con las
   tres cabeceras. Mirar solo el código HTTP; no se imprime ni el token ni las claves. Un 200 confirma
   que son de producción y están vivas. Encender el cluster (`prod-power.sh commerce start`,
   ~10–15 min) solo cuando haga falta: lo pide Angelo.
1. En shopcart, api, payment-processors y base-api (y, por igualar, orders y users):
   `VIPPS_API_URL=https://api.vipps.no`.
2. **En shopcart y en api**: `VIPPS_PARTNER_CLIENT_ID`, `VIPPS_PARTNER_CLIENT_SECRET`,
   `VIPPS_PARTNER_SUBSCRIPTION_KEY`.
3. `VIPPS_CLIENT_*` según la decisión 2.
4. Secret + blob, recrear pods, comprobar que el `.env` montado tiene las líneas (contar, no imprimir).
5. **Registrar el webhook de partner** (cubre todas las unidades bajo el partner):
   port-forward al shopcart de producción (`deploy/shopcart`, la app escucha en el **8000**) y,
   tras inventariar, `POST /checkout/register/webhook/vipps` con
   `{ "scope": "partner" }`. Devuelve el secreto una sola vez: a `VIPPS_PARTNER_WEBHOOK_SECRET`, recrear
   shopcart. Comprobar con `GET /checkout/webhook/vipps?scope=partner` que hay **una** registración y que
   apunta a `api-ecom.vio.live`.

## Fase 4 — El primer comercio

1. **El primero es Careless AS** (org. 928540650), según el portal del 19/10. Vipps quiere revisar
   el primero en vivo.
2. **Alta de su unidad de venta bajo el partner: HECHA.** Product order `d596c4a0-a191-4967-b650-2da1eb99be8c`
   desde la plantilla `e082e35f-6593-43e1-ae3e-a9f860e74abf`, sin prellenar. Unidad «Careless AS»,
   **MSN 1179558**. El alta desde el dashboard no está construida: los siguientes comercios usan su
   plantilla.

   Lo que muestra el partner portal (revisado el 19/10):
   - El product order está `Completed` y la unidad `Active` desde el 16/10.
   - La unidad tiene *Payment allowed*, captura `ReserveCapture` (reserva y luego captura: sirve
     para *at shipment* y *at payment*), *Partial capture*, *Late capture* y tarjeta.
   - Tiene *Login* apagado, y no hace falta: el Express de ePayment no lo exige
     ([Express](https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/features/express/)).
   - Hay plantillas preparadas para cuatro comercios más, que aún no han firmado: Beauty Rebels,
     Gladkokken, Makeup Mekka y QKC.
   - Hay dos paquetes de precio, P1 (2,99 % + 1 NOK) y P3 (1,99 % + 1 NOK).
   - *Developers → Webhooks* está vacío: todavía no hay webhook de partner (fase 3).
   - Partner Manager: Fredrik Rogne. Contacto principal y técnico: Michael. Las partner keys, que
     llegan por correo, las tendrá Michael.
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
4. OK para la fase 0 (correos y graphql #23).
5. **(16/10) Quién carga las partner keys**: Miguel, que guarda los secretos de prod, o Claude
   desde un fichero local fuera de los repos que Angelo deja y luego se borra. Nunca por chat,
   Trello ni el handbook.

## Quién hace qué

| Quién | Qué |
|---|---|
| Angelo | Decisiones 1–4; verificación con dinero real (fase 5) |
| Michael | Hilo con Vipps: partner keys, Management API, aviso del primer comercio |
| Miguel | Secrets y blob de producción, registro del webhook de partner (fases 0 y 3) |
| Claude | PRs a producción (fase 1, con OK), asignación del MSN, revisión de logs, journal |
