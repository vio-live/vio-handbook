---
title: ACCOUNT_PAYMENTS=true en el dashboard de produccion
date: 2026-10-23
owner: Miguel
---

## `ACCOUNT_PAYMENTS=true` en el dashboard de prod — Miguel

- **Quien:** Miguel. Pedido de Angelo («habria que corregirlo, pero ya»), anotado por claude en el
  canal el 23/10 09:40 UTC. Angelo: Careless tiene que ver lo correcto, aunque de momento la cuenta
  la administremos nosotros.
- **Donde:** Vercel, proyecto `vio-commerce-webapp` (`prj_6zEYYVcW5UlboHVdhZP3t1wtdCrI`), entorno
  **Production**. Dominio `dashboard.ecom.vio.live`.
- **Cuando:** variable creada 23/10 **10:01:33 UTC**, redeploy creado **10:01:54**, READY
  **10:03:08**. Verificado de punta a punta a las 10:1x.
- **Contexto:** era la ultima variable **con efecto** que vivia solo en el entorno custom `staging`
  (var `kGw8u7Myk7RRooLp`). Con la bandera apagada el dashboard edita los pagos **por channel**;
  encendida, los pagos son **de la cuenta** y el channel los hereda en solo lectura (F2.7,
  ADR-0026 p.2 / ADR-0028 p.2).

### Hecho

1. `ACCOUNT_PAYMENTS = true` en target `production` (var `iH4dyH5Gvr4eXaKJ`, plain, 10:01:33 UTC).
2. Redeploy de Production **con el mismo commit** `a8f74d7` (`source: redeploy`, sin codigo nuevo):
   `dpl_2qcuTdK8yBbGoZLCBJ3eTR6BkPJh`, y es el que sirve `dashboard.ecom.vio.live` (alias
   confirmado por la API, no por el navegador).

### Verificacion (el bundle, con control negativo)

El flag no se puede comprobar buscando su nombre en el bundle: `next.config.js` lo inlinea y
`process.env.ACCOUNT_PAYMENTS === 'true'` se **plega a un booleano**, asi que el nombre desaparece.
Lo que hay que leer es el valor de la constante exportada.

- El dashboard es un export estatico con catch-all (`pages/[[...slug]]`), asi que las vistas van en
  chunks perezosos: hay que sacar el mapa de chunks del `webpack-*.js` y bajarlos todos (51), no
  solo los 19 del HTML.
- Modulo `account-payments` (chunk `1241.f7e540fef33bbab3.js`, reconocible por `ACCOUNT_SWITCHES`):
  `o.d(t,{...,EW:()=>n,...});...let n=!0` -> **`ACCOUNT_PAYMENTS === true`**.
- **Control negativo:** el deploy anterior del **mismo commit** (`dpl_Hz3187SQUR9C8GcYGNVxV2csuM9B`,
  08:23 UTC, antes de crear la variable) trae `let n=!1` en su chunk `1241.9bf76bf4ed7ba242.js`.
  Mismo codigo, distinto valor: lo que cambio fue la variable, no el build.

### La cadena de backend, comprobada en los pods que corren

No en el repo: dentro de los pods de prod.

- `base-api` (`base-api-86d4998988-rcw7l`): `dist/router/paymentMethodRouter.js` tiene **dos**
  `'/paymentmethod/account'` (GET y PUT) con `authentication` + `resolveAccountUser`, y
  `getAccountPayments` / `updateAccountPayments`. El proxy **no** resuelve local: llama al api con
  `API_MICROSERVICE_URL`.
- `api` (`api-77b9845bf5-n4r9g`): `dist/modules/paymentMethod/providers/account-payments.js` y la
  ruta `account/:userId` en su controlador.
- Cadena completa: webapp -> `api-ecom.vio.live/api/paymentmethod/account` -> api
  `/paymentmethod/account/:userId`.

**Lo que NO sirve para esto:** `curl` sin token al endpoint. `/api/paymentmethod/account` y
`/api/paymentmethod/accountxx` devuelven **los dos 401**: la autenticacion corre antes del routing,
asi que el codigo de estado no distingue si la ruta existe.

### Consecuencia operativa, para el lunes

Es solo UI: no cambia ningun dato ni lo que se cobra. Pero **el detalle del channel ya no edita
pagos**, los muestra heredados (`channel-detail/index.jsx:535`,
`ACCOUNT_PAYMENTS ? <InheritedPaymentsCard/> : <card editable>`).

- El interruptor `channel_user_settings.vipps` del channel 480 **sigue vigente y respetado** por el
  checkout (el api cruza los switches de la cuenta con la visibilidad del channel, B3b). Lo que se
  pierde es editarlo *desde el dashboard*.
- Si el lunes hay que tocar esa palanca, se toca por el endpoint interno o por base de datos, que es
  **como se monto el go-live de todas formas** — nunca se uso esa pantalla para esto.

### Pendiente

- Nada de esta tarea. Queda T2 (borrar las dos vacias de `staging`) y T1 (la comprobacion de paridad
  en CI), las dos despues del go-live, en
  [`../../infrastructure/paridad-de-variables-vercel-staging-vs-produccion.md`](../../infrastructure/paridad-de-variables-vercel-staging-vs-produccion.md).
