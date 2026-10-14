---
date: 2026-10-14
session: "webapp: el publisher filtra por channel los métodos de pago de la brand (ADR-0031)"
participants: [angelo, claude, front-commerce]
status: live
---

# webapp: pagos de la brand filtrables por channel (UI de ADR-0031)

## Goal

Implementar en webapp-vio-commerce la UI de
[ADR-0031](../../decisions/0031-pagos-de-la-brand-filtrables-por-channel.md), aprobado por Angelo
el 14/10. Los métodos de pago son de la brand, y el publisher elige cuáles se ven en cada uno de
sus channels. Lo ofrecido en un channel es lo efectivo de la brand ∩ lo visible en el channel.

Antes de este cambio, en `origin/develop` (`dd1c77e`), el publisher veía en el detalle del channel
el texto "Payments, shipping and markets for checkout come from the brand", sin forma de elegir
métodos.

El backend se escribe en paralelo en la rama `feature/pagos-filtro-por-channel` de api y base-api:

- `GET /channel/:channelUserId/payment-methods` → por cada uno de los 11 métodos,
  `{ method, offeredByBrand, reason?, visible, effective }`;
- `POST /channel/update/settings/:id`, parcial, guarda la visibilidad.

Rama `feature/pagos-filtro-por-channel` (la misma de punta a punta), base `origin/develop`
`dd1c77e`. Worktree: `~/vio-commerce/worktrees/webapp-filtro`, sin upstream.

## Done

Un commit local, **`0b11a22`**, **sin push ni PR**:

- **`src/lib/channel-payments.js`** (nuevo). La cabecera tiene el contrato.
  - `useChannelPaymentMethods(id)`: el fetcher normaliza, así que el cache de SWR guarda filas en
    orden de pantalla (el de `ACCOUNT_SWITCHES`).
  - `setChannelMethodVisible(id, key, visible)`: un `POST update/settings` con un solo campo. Usa
    el `writeKey` de `PAYMENT_METHODS`, con `google_pay` y `apple_pay` en snake_case.
  - `channelPaymentSummary`, `nothingPayable`, `reasonText` y `withVisibility`.
  - `useChannelsPaymentMethods(channels)`: el fan-out de la lista. Un channel que falla queda en
    `null` y no se marca.
- **Detalle del channel del publisher** (`src/views/channel-detail/index.jsx`):
  - `ChannelPaymentsCard`, "Payment methods in this channel", va en `PublisherSettingsTab` entre
    Brand y API key;
  - los métodos que ofrece la brand tienen un check que guarda al instante con cambio optimista,
    y si falla vuelve atrás y avisa con un toast;
  - los que la brand no ofrece salen deshabilitados, con la razón;
  - el resumen dice "N of M shown to buyers";
  - si no queda ninguno visible, aparece un aviso `role="alert"`: "Nothing can be paid in this
    channel";
  - si falla el GET, la tarjeta dice que no pudo cargar y ofrece Retry;
  - el texto de la brand pasa a "The brand decides which payment methods exist; you choose which
    ones this channel shows."
- **Lista de channels del publisher** (`src/views/channels/index.jsx`): el badge "No payment
  method" en la card, cuando lo efectivo está vacío.
- **Tests:**
  - `test/channels/channel-payments-lib.test.js`, 9 tests;
  - `test/channels/channel-payments-views.test.jsx`, 10 tests: lo ofrecido y lo no ofrecido,
    `{vipps:false}`, `google_pay`, el rollback, el aviso (ninguno visible, el último que se
    desmarca y la brand que no ofrece ninguno), el error del GET, el texto nuevo y el badge de la
    lista.
- **Verificación:**
  - `npx jest`: 560 verdes y 2 rojos, los de `payments-lib` (Vipps) y `qliro-shipping-config`, que
    ya fallan en develop;
  - eslint limpio en lo tocado;
  - `next build` verde.
  - **Chrome real** (harness puppeteer contra `next dev`, base-api simulado con estado):
    - la lista marca solo el channel sin método;
    - desmarcar Vipps manda `{"vipps":false}` y el resumen pasa de 2 a 1 de 3;
    - un 500 en Klarna vuelve el check a su estado y muestra el toast;
    - al quedar 0 de 3 aparece el aviso, y la lista marca también ese channel;
    - el channel cuyo GET falla muestra Retry;
    - a 390 px no hay overflow;
    - no hubo errores de consola.

## Decisions

- **La capa de datos absorbe el contrato.** El ajuste al contrato final es de una línea: la ruta
  en `channelPaymentMethodsPath`, y la forma en `listOf`, que acepta un array, `{methods}`,
  `{paymentMethods}`, `{data}` u objeto por método. El nombre del método se casa sin mirar
  mayúsculas ni guiones bajos.
- **Sin `visible` se asume visible**, porque un channel nuevo muestra todos (ADR-0031 punto 5).
  Un método que la respuesta no trae no se inventa.
- **`reason` no tiene formato fijado.** Si menciona credential, charge o account, el texto es
  "turned on … but can't charge it yet". Si no, "The brand hasn't enabled X". El texto crudo del
  backend no se muestra.
- **Lo no ofrecido sale desmarcado y deshabilitado**, aunque su visibilidad guardada sea `true`.
  Un check marcado haría creer que el comprador lo ve.
- **Cambio optimista con estado local.** Al guardar, el cache de SWR toma el valor y revalida
  antes de soltar el estado local, así que no hay parpadeo.
- **Sin flag.** No se pidió. Mientras el endpoint no exista, la tarjeta del publisher muestra
  "Couldn't load…", y la lista no marca nada porque lo que no se sabe no se marca. Ver Blockers.
- **No se tocó la UI de la brand** (`SettingsTab`, `InheritedPaymentsCard`, `ACCOUNT_PAYMENTS`).

## Blockers / open questions

- **El contrato no está verificado contra un backend real**: está escrito sobre lo que pasó el
  coordinador. Hay que confirmar con la rama de api y base-api la ruta, la forma de la lista y
  los valores de `reason`.
- **El webapp no debería salir antes que base-api y api.** Sin el endpoint, el publisher ve un
  error en la tarjeta de pagos de cada channel. Si hace falta salir antes, la salida es un flag
  como el de `ACCOUNT_PAYMENTS`.
- **Costo del fan-out de la lista:** un GET por channel. Cada uno calcula `brandOfChannel` en api,
  y se suma al fan-out de `data/ids` que ya existía. Con pocos channels por publisher está bien.
  Si crece, conviene que `GET channel/user` traiga el efectivo.
- **El texto "Shipping and markets for checkout come from the brand" se mantuvo**, pero choca con
  el brief de api: con F2.3, `markets` sigue siendo del channel, y el publisher tiene la pestaña
  Markets. No lo cambié porque está fuera del alcance. Lo tiene que decidir Angelo.
- **`PaymentIcon` no tiene icono para Qliro, Walley ni Nexi** y muestra "?". Ya pasaba en
  `InheritedPaymentsCard`.

## Next session

- Cuando el backend esté en su rama: correr el harness contra base-api local o QA, ajustar
  `listOf` y `reasonText` si hace falta, y recién ahí push y PR (con OK de Angelo).
- Decidir el texto sobre markets en la tarjeta Brand del publisher.
