---
date: 2026-09-07
session: "Qliro — Fase 2 (sincronización con el widget) y tres defectos encontrados verificando"
participants: [angelo, claude]
status: live
---

# Qliro: la Fase 2, y tres cosas que estaban mal desde antes

**Objetivo.** Cerrar la Fase 2 del diseño de
[`qliro-configuraciones.md`](../../architecture/qliro-configuraciones.md): que nuestro
lado del pedido siga al cliente mientras está dentro del widget de Qliro.

Se cerró. Pero lo que más valor tuvo fueron **tres defectos preexistentes** que
aparecieron al verificar, no al escribir.

## Decisión: cuando el cliente elige envío dentro de Qliro, manda Qliro

Angelo decidió que la elección del widget es la verdad. Leyendo la documentación
resultó que eso **ya era cierto donde más importa**: Qliro *crea la línea de envío
desde el método que eligió el cliente* al completarse la compra, y `paymentQliroOk`
ya lee la línea `Type: 'Shipping'`. La Fase 2 quedó por lo tanto más acotada de lo
que suponía el diseño: mantener el carrito al día mientras el cliente sigue adentro.

## Los tres defectos

### 1. Qliro no devuelve nuestro `MetaData` → producto equivocado en la orden

Verificado contra la sandbox: un pedido creado con
`MetaData: {productId, variantId, variantTitle}` vuelve con `MetaData: null` en
todas sus líneas. Y `paymentQliroOk` mapeaba la compra con
`findOneOrFail(meta.productId)`.

En TypeORM 0.2.41 eso **no lanza** con `undefined`: `EntityManager.findOne` sólo
trata el argumento como id si es string/number/Date; con `undefined` no aplica
ningún `WHERE` y termina en `SELECT … LIMIT 1`. **Toda compra completada con Qliro
habría creado la orden contra un producto arbitrario, en silencio.**

Arreglado en [shopcart#13](https://github.com/vio-live/vio-shopcart-microservice/pull/13):
la identidad viaja en el `MerchantReference` de la línea (`productId` o
`productId|variantId`), el único campo por ítem que sobrevive la ida y vuelta.

Lección: [`qliro-no-devuelve-metadata.md`](../../lessons/qliro-no-devuelve-metadata.md).

### 2. La línea de envío declaraba 2501 % de IVA

El carrito reporta el IVA como **porcentaje** (`tax_rate: 25`); el armado del payload
lo trataba como fracción. El ex-IVA de toda línea de envío salía `199 / (25+1)` = 7,65
en vez de `199 / 1,25` = 159,20.

Al cliente siempre se le cobró bien el total, y los productos siempre estuvieron bien
—derivan el ex-IVA de `tax_amount`—. Pero **el desglose es sobre lo que Qliro liquida
y declara IVA**. Anterior a la Fase 1.

Arreglado en [shopcart#17](https://github.com/vio-live/vio-shopcart-microservice/pull/17).
Un matiz que salió de los tests: **ausente no es exento**; `Number(null)` vale 0 y
dejarlo pasar declararía 0 % sobre una línea gravada.

### 3. La URL de callback iba a salir sin autenticar

Qliro documenta que a `MerchantOrderAvailableShippingMethodsUrl` **no le manda
credenciales**, y que la URL misma debe llevar el dato de auth y caducar. La Fase 1
ya emitía esa URL con sólo un `checkout_id`.

Ahora va firmada: HMAC sobre checkout id + expiración, con clave el propio API secret
del seller —ya es un secreto compartido con sus pedidos, y rotarlo en Qliro invalida
las URLs viejas sin provisionar nada—. Vence a las 48 h, que es lo que Qliro conserva
un pedido. Sin token la URL **no se registra**.

## Lo que entrega la Fase 2

- `PUT /Orders/{id}` y `syncOrder`, con `MerchantUpdateVersion` como token de
  comparación. **No se comparan totales**: en los modos donde Qliro es dueño del
  importe del envío, nuestro total y el suyo difieren legítimamente, y comparar
  totales dejaría al cliente bloqueado en un checkout que sí está al día.
- El callback de envíos, que la Fase 1 registraba y nadie contestaba. Cotiza desde
  nuestro carrito, no desde el body sin autenticar. Responde en ~350 ms contra un
  presupuesto de 5 s.
- El protocolo `q1` completo en el SDK: `q1Ready` antes de inyectar el snippet,
  todos los listeners, y `lock`/`onOrderUpdated`/`unlock`.

Dos bugs propios que encontraron los tests del SDK, ambos reales en producción:
un eco de `onOrderUpdated` que llegara antes de la respuesta del servidor se perdía
—y Qliro puede mandarlo apenas aterriza el PUT—, y un eco temprano se daba por bueno
sin poder saber si era el nuestro.

## Verificación

Todo contra QA, después de cada merge:

- E2E de Qliro verde (pedido 5557544, total 848).
- `SyncPaymentQliro` devuelve un `update_version` distinto por llamada.
- Callback firmado: 200 en 358 ms con la tarifa correcta.
- Callback sin firmar, con token inventado, expirado, sin checkout id, con checkout
  inexistente: **los cinco** responden el mismo 400 sin filtrar cuál falló.
- Pedido nuevo: envío `inc=199 exVat=159.2` → 25 %.

Un cuarto defecto fue mío y lo encontró el deploy, no los tests: armé el contexto de
sincronización desde una consulta directa a la entidad, y `priceData`/`priceDataExtra`
los materializa `GetCheckoutById(_, true)`. Arreglado en
[shopcart#16](https://github.com/vio-live/vio-shopcart-microservice/pull/16).

## PRs

| Repo | PR |
|---|---|
| shopcart | [#13](https://github.com/vio-live/vio-shopcart-microservice/pull/13) mapeo · [#15](https://github.com/vio-live/vio-shopcart-microservice/pull/15) Fase 2 · [#16](https://github.com/vio-live/vio-shopcart-microservice/pull/16) contexto · [#17](https://github.com/vio-live/vio-shopcart-microservice/pull/17) IVA |
| base-api | [#5](https://github.com/vio-live/vio-base-api/pull/5) |
| graphql | [#4](https://github.com/vio-live/graphql/pull/4) |
| web-sdk | [#32](https://github.com/vio-live/vio-web-sdk/pull/32) |

## Siguiente sesión

- **La mitad de navegador todavía no llega a producción**: falta publicar el SDK y
  rebundlear Vev. Hasta entonces los listeners `q1` viven sólo en `main` del SDK.
- Fases 3 (apariencia), 4 (UI de configuración) y 5 (validación y trazabilidad).
- La tarjeta de E2E manual de Alan ([QYJRBZ5D](https://trello.com/c/QYJRBZ5D)) ahora
  puede llegar hasta el final: el defecto que la habría cortado en el último paso
  está arreglado.
