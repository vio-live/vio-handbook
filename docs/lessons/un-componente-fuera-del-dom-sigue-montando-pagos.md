---
title: "Un componente fuera del DOM sigue actualizando, y montando pagos"
last-updated: 2026-09-22
owner: angelo
---

# Un componente fuera del DOM sigue actualizando, y montando pagos

**Qué pasó (22/09).** Escribiendo los tests del checkout "método primero", uno se colgaba
*después* de terminar su cuerpo, con el worker de vitest al 165 % de CPU. Se instrumentó `updated()`
sin restaurarlo al final del test. `<vio-checkout>` ya estaba fuera del DOM (`isConnected=false`) y
seguía actualizando sin parar:

1. su `disconnectedCallback` desmonta Klarna, Nexi y Adyen, y eso cambia estado;
2. Lit **sigue actualizando un elemento desconectado**, así que `updated()` corre otra vez;
3. `updated()` llama a `mountKlarnaIfNeeded()` y compañía, que crean una **sesión de pago nueva**
   (una llamada al backend) para un checkout que ya nadie ve.

En el test, además, el montaje real de Klarna fallaba al instante, y cada intento asignaba
`klarnaCategories = []`. Un array nuevo es un cambio para Lit aunque esté vacío igual que el
anterior, así que cada intento programaba el siguiente. Era un bucle de microtareas, que no deja
correr los timers: el timeout del test nunca llega a dispararse.

**Las reglas.**

- Todo efecto con costo en `updated()` (sesiones de pago, fetch, widgets de terceros) comprueba
  `isConnected`. `connectedCallback` pide un update, para montar de nuevo si el elemento vuelve.
- No reasignar un `@state` de array u objeto con un valor "igual pero nuevo" en caminos que se
  repiten (reintentos, unmount): si ya está vacío, no se toca.
- Un test que se cuelga *después* de su cuerpo tiene algo vivo tras el teardown. Hay que
  instrumentar `updated()` sin restaurarlo e imprimir `isConnected` y las claves que cambian.
- Los mocks de fallo dejan de responder tras N llamadas (una promesa que nunca resuelve). Así una
  regresión hace fallar el test en vez de colgar el worker.

Ver el [journal del 22/09](../journal/2026-09/2026-09-22-revision-daily-alan-qa-pagos.md) y
[vio-web-sdk #64](https://github.com/vio-live/vio-web-sdk/pull/64).
