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

---

## Continuación: fases 3, 4 y 5, y el SDK en producción

Angelo dijo "ve con todo". Las cinco fases del diseño están cerradas.

**Fase 3 — apariencia.** El tema del anfitrión llega a Qliro. Decisión de diseño: el mapeo
vive en el **servidor**, no en el SDK. Las reglas son testeables sin navegador, y el SDK no
necesita conocer los nombres de campo de Qliro, así que otro proveedor se puede vestir con
los mismos cuatro tokens. Todo lo que llega es **no confiable** — viene de una página web:
o parsea a una forma que Qliro documenta, o se descarta y Qliro se queda con su default.

Verificado leyendo el `styling` del snippet que sirve Qliro. Antes venía vacío; ahora:

```
primaryColor: "#C14A3B", callToActionColor: "#C14A3B",
callToActionHoverColor: "#92382D", backgroundColor: "#F1EEEE",
cornerRadius: 8, buttonCornerRadius: 1000
```

Es decir: `rgb()` parseado, hover derivado, `#ffe5e0` dessaturado al 10 % conservando la
claridad, `0.5rem`→8 y `9999px`→1000 (saturado al máximo, no rechazado).

**Fase 5 — validación y trazabilidad.** `MerchantProvidedMetadata` **sí** sobrevive la ida
y vuelta, a diferencia del `MetaData` por ítem: el checkout id y el cart id quedan sellados
en el pedido de Qliro. Y `MerchantOrderValidationUrl` permite rechazar un carrito que se
quedó sin stock mientras el cliente decidía.

⚠️ **Qliro da la orden por aprobada si no contestamos en 5 segundos.** De ahí dos
asimetrías deliberadas: la validación hace una comprobación barata sobre datos ya cargados
y no espera nada (una validación lenta no es estricta: es ninguna), y un llamante que no
podemos autenticar se **aprueba**, porque rechazar sólo le daría a cualquiera que alcance
el endpoint una forma de bloquear compras reales.

**Fase 4 — UI.** Selector de modo con campos condicionados. El toggle de refresco sólo
existe en `vio-methods` —Qliro prohíbe esa URL con Ingrid y nShift maneja la interacción
él mismo—, cambiar de modo no arrastra la configuración del anterior, y un seller
configurado antes de los modos abre en el que realmente corre. La UI **no** se verificó en
navegador: el dashboard exige login. Lo cubierto por tests es la lógica donde estaba el
riesgo.

**SDK y Vev.** `@vio-live/web-sdk` 0.10.0 construido y listo, pero **npm pidió una OTP por
navegador**: la publicación queda pendiente de Angelo. El bundle de Vev **no depende de
npm** —se arma con esbuild desde el código fuente—, así que el paquete `cq1lXld-TA9` ya
está desplegado con las fases 2 y 3 dentro.

### PRs de esta continuación

| Repo | PR |
|---|---|
| shopcart | [#18](https://github.com/vio-live/vio-shopcart-microservice/pull/18) fases 3+5 |
| base-api | [#6](https://github.com/vio-live/vio-base-api/pull/6) |
| graphql | [#5](https://github.com/vio-live/graphql/pull/5) |
| web-sdk | [#33](https://github.com/vio-live/vio-web-sdk/pull/33) |
| vev | [#16](https://github.com/vio-live/vev/pull/16) |
| webapp | [#9](https://github.com/vio-live/webapp-vio-commerce/pull/9) |

### Pendiente

- **`npm publish` del SDK 0.10.0** — pide OTP por navegador. Rama `release/0.10.0`.
- Pedir a merchant solutions de Qliro que habiliten nShift/Ingrid y definan la regla de
  `MerchantConstraintName`; hasta entonces esos dos modos no se pueden probar de verdad.
- E2E de Walley (no tiene fallback de plataforma; necesita un seller con credenciales).
