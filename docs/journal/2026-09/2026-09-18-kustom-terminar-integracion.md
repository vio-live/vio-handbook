---
date: 2026-09-18
session: "Kustom: terminar la integración con las credenciales de test, leyendo la doc cruda"
participants: [angelo, claude]
status: live
---

# Kustom: terminar la integración (y descubrir que nunca había funcionado)

## Goal

Angelo aparcó Adyen (estado en el [journal del 17/09](2026-09-17-adyen-analisis-e-implementacion.md))
y pidió terminar **Kustom** con las credenciales de test recién recibidas, mejorando con lo aprendido
de los otros proveedores. Mismas instrucciones que con Adyen: leer la documentación a fondo, plan,
preguntas si hacen falta, y adelante.

## Done

**Lectura.** 110 páginas en Markdown crudo (`docs.kustom.co/…/*.md`, `llms.txt`), los OpenAPI de
Checkout, Order Management y callbacks, y la guía "What a perfect Kustom integration looks like".
Tres lecturas en paralelo del código (backend, SDK, historial del handbook). Todo en
[`architecture/kustom.md`](../../architecture/kustom.md).

**Credenciales.** Válidas en el playground (404 con la clave buena, 401 con una mala; Kustom acepta la
key cruda como token Basic, `base64(user:key)` y `base64(:key)`). Guardadas en
`~/.config/vio/kustom-test.env` (600). **Pero el MID `PM00876249` no tiene ningún país configurado**:
`no configured currencies for order billing country` para NO, SE, DK, FI, GB y DE. No se pudo crear ni
una orden de prueba; queda en manos de Angelo (Portal de playground o soporte de Kustom).

**Lo que había** (implementado el 28/08 sobre el código legado de Klarna Checkout, nunca ejecutado
contra Kustom): importes sin redondear, moneda sin mayúsculas, push sin comprobar estado ni
duplicados y respondiendo 200 ante error, sin `acknowledge` ni `merchant_reference1`, lectura con el
`user_id` del cliente (fuga de datos del comprador), orden nunca actualizada ante un cambio de
carrito, widget en shadow DOM, sin usar `_klarnaCheckout`, y la rama de retorno del SDK
**inalcanzable** ([lección](../../lessons/una-rama-de-retorno-muerta-con-tests-en-verde.md)).

**Implementación**, ramas `feature/kustom-checkout` (pusheadas, PRs abiertos, **nada mergeado**: el
clasificador del modo auto bloqueó `gh pr merge`; ver Blockers):

| Repo | PR | Qué |
|---|---|---|
| vio-shopcart-microservice | [#33](https://github.com/vio-live/vio-shopcart-microservice/pull/33) | `kustom-lines`, `kustom-market`, conector con Order Management e idempotencia, `KustomService` (orden = foto, actualizar en su sitio, validación), un solo camino de completado con lock, seller desde el checkout. 266 tests (46 nuevos), `tsc` limpio |
| vio-base-api | [#12](https://github.com/vio-live/vio-base-api/pull/12) | relay del push con el estado real (5xx = reintento) y del callback de validación |
| graphql | [#13](https://github.com/vio-live/graphql/pull/13) | `KustomOrderDTO` normalizado, `SyncPaymentKustom`, `client`. DI verificada en runtime |
| vio-api-microservice | [#23](https://github.com/vio-live/vio-api-microservice/pull/23) (sobre Adyen #22) | `kustom-offer.ts`: interruptor + clave + market |
| vio-web-sdk | [#62](https://github.com/vio-live/vio-web-sdk/pull/62) (sobre Adyen #61) | **0.14.0**: light DOM, API JS del widget, sync en su sitio, recibo de Kustom, retorno alcanzable. 218 tests (12 nuevos) |
| vio-vev | [#42](https://github.com/vio-live/vev/pull/42) (sobre Adyen #41) | rebundle 0.14.0, guard del bundle pasado. Sin `vev deploy` |

Un test unitario atrapó un bug antes de salir: el IVA de las tarifas de envío salía ×100 (puntos base
tratados como porcentaje). Decisiones en [ADR-0020](../../decisions/0020-kustom-una-orden-por-checkout.md).

## Decisions

- [ADR-0020](../../decisions/0020-kustom-una-orden-por-checkout.md): una orden por checkout
  actualizada en su sitio; un solo camino de completado (retorno, push, barrido) con Order
  Management como verdad; validación fail-open dentro del widget; Kustom añade la línea de envío;
  seller desde el checkout; markets como Adyen (Noruega); sin fallback de plataforma.
- Angelo: las instrucciones son las de Adyen; el deploy a QA se haría como ayer salvo que diga lo
  contrario. Quedó **sin hacer** (ver Blockers).

## Blockers

- **El MID de playground no tiene países.** Sin NO/NOK activo, ninguna prueba contra Kustom.
- **Merges a `develop` bloqueados por el clasificador del modo auto** (`gh pr merge` denegado). Los
  hace Angelo desde la UI o da permiso. Orden: shopcart #33 → base-api #12 → graphql #13. api #23,
  SDK #62 y Vev #42 están apilados sobre los PRs de Adyen (api #22, SDK #61, Vev #41).
- **E2E en QA necesita**: la clave `kco_test_…` del seller de prueba pegada en el dashboard por
  Angelo (el agente no introduce claves en formularios), el interruptor `kustom` del canal, el canal
  vendiendo en NO, y el paquete sandbox de Vev (`npm run sandbox:on`).
- **El clon local de `vio-base-api` no puede hacer `fetch`** (`unpack-objects failed`, permisos
  intactos); la rama se creó sobre `feature/adyen-payment` local y se pushea igual. Disco de la
  laptop al 99 %.
- De paso: el CronJob del barrido está en shopcart [#32](https://github.com/vio-live/vio-shopcart-microservice/pull/32)
  (otra sesión, [journal](2026-09-18-reconcile-cronjob-qa.md)), sin mergear.

## Next session

Angelo (cierre del 18/09): *"continuamos mañana y probamos ambos"* — Adyen y Kustom, E2E en QA.
Antes de arrancar hacen falta, de su lado: NO/NOK en el MID de playground de Kustom, la credencial
de Adyen guardada con sus origins, la migración de `adyen` en QA, y los merges (ver Blockers).

1. Angelo: país/moneda en el Kustom Portal de playground (NO/NOK), métodos del MID.
2. Mergear en orden y verificar en QA (pods, logs, `POST /kustom/validation` con un cuerpo
   inventado → 200 fail-open; `POST /kustom/webhooks?order_id=<uuid falso>` → 200 `[accepted]`).
3. Página local con el snippet real (como el spike de Adyen): ¿light DOM ok? ¿re-inicializar tras
   cerrar y reabrir? ¿`_klarnaCheckout` expone `suspend/resume`?
4. E2E en el playground: tarjeta, 3DS, tarifa dentro del widget, cambio de carrito con el widget
   abierto, validación rechazada, push sin `acknowledge`, captura automática.
5. Al mergear: `architecture/kustom.md` de `draft` a `live`, briefs de `~/vio-commerce/briefs/`.
6. Después: captura/refund por API, Native Partner Onboarding API de Kustom.
