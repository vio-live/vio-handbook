---
date: 2026-09-07
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-09-07 · Pagos: Walley entero, fallback de Qliro y el E2E que destapó un bug

Cierra el arco de pagos que venía del 03 y 04-sep
([kernel 1.0.245](./2026-09-03-release-kernel-1.0.245-qliro.md)).

## Goal

Terminar lo que quedaba de métodos de pago: mergear el set de Walley, hacer que Qliro
funcione sin que cada seller tenga credenciales propias, y correr el E2E en sandbox que la
[tarjeta de Qliro](https://trello.com/c/Ops3pTuO) pedía desde el principio.

## Done

**Los tres defectos del API de métodos de pago** ([Trello](https://trello.com/c/NzFWNcUn)) —
api-ms [#9](https://github.com/vio-live/vio-api-microservice/pull/9), base-api
[#3](https://github.com/vio-live/vio-base-api/pull/3): `byuser` acepta `?all=1` y devuelve los
pausados con su flag, la lista vacía responde `200 []` en vez de 404, y
`/channel/available-payment-methods` dejó de estar tapada por `/channel/:id` (verificado con la
key de un canal: 400 → 200).

**Hardening de pagos** — api-ms [#10](https://github.com/vio-live/vio-api-microservice/pull/10),
shopcart [#4](https://github.com/vio-live/vio-shopcart-microservice/pull/4), payment-processors
[#3](https://github.com/vio-live/vio-payment-processors-microservice/pull/3). Cifrado
AES-256-GCM de credenciales, lecturas enmascaradas, reconciliación de pushes perdidos y
`providerShipping`. Mergeado tras revisión funcional: el cifrado es passthrough puro sin
`PAYMENT_SECRETS_KEY`, así que entra dormido y se activa cuando se cargue la clave.

**Qliro** — Fase B (el toggle por canal se persiste y el gate lo exige) y **fallback de
plataforma**: si el seller no tiene credenciales, se usan las del entorno, igual que Klarna.
Ver [`payments.md`](../../architecture/payments.md). Las credenciales sandbox quedaron cargadas
en el `.env.local` compartido y verificadas contra Qliro.

**Walley** — set completo mergeado y desplegado: shopcart
[#5](https://github.com/vio-live/vio-shopcart-microservice/pull/5), base-api
[#4](https://github.com/vio-live/vio-base-api/pull/4), api-ms
[#11](https://github.com/vio-live/vio-api-microservice/pull/11), graphql
[#3](https://github.com/vio-live/graphql/pull/3), webapp
[#5](https://github.com/vio-live/webapp-vio-commerce/pull/5) y el **SDK web**
[#29](https://github.com/vio-live/vio-web-sdk/pull/29), que no lo tenía. Publicado
`@vio-live/web-sdk@0.9.0` y rebundleado el snapshot de Vev
([vev #14](https://github.com/vio-live/vev/pull/14), `vev deploy` OK).

**E2E de Qliro en sandbox: verde.** Carrito → ítem → checkout → condiciones → `CreatePaymentQliro`
(OrderId 5557300, snippet de 4467 chars) → read-back. Corrió sobre el canal de Bohus, que **no
tiene credenciales propias**, así que probó también el fallback.

**Tests donde no había ninguno.** Estos repos no podían correr un test unitario: el
`setupFilesAfterEnv` por defecto registra hooks que llaman a `getConnection()` de TypeORM y
matan cualquier spec sin base. Se agregó `jest.unit.json` + `yarn test:unit` en shopcart y
api-ms, con 27 tests: resolución de credenciales de Qliro, el módulo de cifrado —que no tenía
ninguno— y la firma del conector.

## Decisions

- **Qliro lleva credencial de plataforma; Kustom y Walley no.** Decisión de Angelo: en
  desarrollo se usan las de test y si un seller pone las suyas, ganan las suyas. Consecuencia
  registrada en [`payments.md`](../../architecture/payments.md): el settlement sigue a la cuenta
  que se use, así que las credenciales del entorno deciden quién es merchant of record para los
  sellers sin las suyas.
- **`SDK_VERSION` se sincroniza con el `package.json`** en cada release del web SDK. Estaba en
  `0.5.1` con el paquete en 0.8.0, y esa constante viaja como `sdk_version` en cada evento de
  analytics.

## Blockers / open questions

- `PAYMENT_SECRETS_KEY` sin cargar: el cifrado está desplegado y dormido. Se activa poniéndola
  en el `.env.local` compartido y reconstruyendo los tres servicios.
- **Walley no tiene fallback de plataforma** ni credenciales de seller cargadas, así que su E2E
  sigue pendiente. Si se quiere el mismo trato que Qliro, es el mismo patrón.
- `/verify` de credenciales existe en api-ms pero **no está proxiado por base-api** ni lo llama
  el dashboard: pieza a medio conectar.

## Next session

- E2E de Walley, cuando haya un canal con credenciales.
- Rotar las claves de los `.env.test` del kernel, que siguen en git.
- Cerrar las tarjetas del feed que solo esperan verificación operativa.
