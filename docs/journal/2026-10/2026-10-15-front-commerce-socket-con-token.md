---
date: 2026-10-15
session: "webapp: el socket manda el token de la sesión en el handshake"
participants: [angelo, claude, front-commerce]
status: live
---

# webapp: socket.io autenticado (token de Firebase en el handshake)

## Goal

base-api (otro agente, en paralelo) pasa a exigir en el handshake de socket.io
`auth: { token }` con el token de Firebase —el mismo valor que hoy va en la cabecera
`authorization` de la API— y a emitir los eventos solo al usuario dueño, por rooms. Sin
token responde `connect_error` con `unauthorized`. Los nombres de los eventos no cambian.
Hasta hoy `src/lib/socket.js` abría el socket **sin autenticación**.

Rama `fix/socket-con-token` en webapp-vio-commerce, base `origin/develop` `049187a`.
Worktree `~/vio-commerce/worktrees/webapp-logo`.

## Done

Un commit local, **sin push ni PR**: `007c1f5` `feat(socket): autenticar el handshake con
el token de la sesión`. 5 ficheros, +281/−18.

- **`src/lib/api.js`:** `authToken({ fresh })` exportada: la única fuente del token del front
  (ID token de Firebase tras `authReady()`, sin "Bearer"). `authHeader()` la usa; el socket
  también. `fresh` fuerza `getIdToken(true)`.
- **`src/lib/auth.js`:** `isSignedOut()`: true solo cuando Firebase **ya resolvió** y no hay
  usuario. Durante la restauración inicial devuelve false (no se sabe todavía).
- **`src/lib/socket.js`:**
  - `getSocket()` pasa `auth` como **función**; socket.io-client 4.8.3 la llama en `onopen`
    de cada (re)conexión (`build/esm/socket.js:405`), así que el token se renueva solo. Sin
    host o con `isSignedOut()` devuelve `null`, como antes sin host.
  - `connect_error`: si `socket.active` sigue true es una caída de transporte y socket.io
    reintenta solo; si no, el servidor rechazó el handshake: con sesión se reconecta a mano
    con espera 1 s → 10 s (doblando) y pidiendo token fresco; sin sesión, `closeSocket()` y
    listo. `console.warn` con el mensaje del error, nunca el token.
  - `closeSocket()` además limpia el timer de reintento y el contador.
  - Cabecera reescrita: hay rooms en el servidor, los nombres se mantienen, y el gotcha del
    rechazo.
- **`test/lib/socket-con-token.test.js`** (6 tests, mockeando `socket.io-client` y
  `@/firebase`): mismo token que la cabecera `authorization` de `api()`; sin sesión no abre;
  `closeSocket` resetea y la cuenta siguiente conecta con su token; rechazo con sesión viva →
  `connect()` a mano al 1 s y luego a los 2 s, con `getIdToken(true)` y vuelta a `false`
  tras `connect`; caída de transporte → no se toca; rechazo sin sesión → `close()` y ninguna
  reconexión ni apertura posterior.
- `test/plan/subscription-events.test.js`: comentario "no hay rooms" corregido.

Verificación: `npx eslint` limpio sobre lo tocado; `npx jest` 58/60 suites verdes. Las dos
que fallan (`test/payments/payments-lib.test.js` "Vipps manda sus cuatro credenciales" y
`test/settings/qliro-shipping-config.test.js` "los que NO tienen fallback siguen sin él")
**ya fallan en `origin/develop` `049187a` limpio** (comprobado en un worktree temporal con el
mismo `node_modules`); no son de este cambio.

## Decisions

- **La premisa "deja que socket.io reintente tras `unauthorized`" no se cumple.** Verificado
  en `socket.io-client@4.8.3`: ante `CONNECT_ERROR` el cliente hace `destroy()` (quita las
  subs → `active === false`) y el manager se cierra con `skipReconnect = true`
  (`socket.js:502-507`, `manager.js:243-251,280-284`). Es la receta oficial de v4: con
  `!socket.active` hay que llamar `socket.connect()` a mano. Por eso el reintento manual con
  espera creciente, y con token forzado (el cacheado es el que acaban de rechazar).
- **Una sola fuente del token** (`authToken()`), en vez de duplicar `authReady()` +
  `getIdToken()` en `socket.js`: si cambia la fuente de sesión, cambia en un sitio y el socket
  manda lo mismo que la cabecera por construcción (el test lo asegura).
- **"Sin sesión" se decide con `isSignedOut()`, no con `auth.currentUser` a secas:** durante
  la restauración inicial `currentUser` es null aunque haya sesión; en ese estado se abre el
  socket y `auth` espera `authReady()` (el `connectTimeout` del servidor es de 45 s, sobra).
  En la práctica `useSocketEvent` recibe nombre solo con `me.id`, que ya exige sesión, pero
  así no depende de ese orden.

## Blockers / open questions

- **Contrato del servidor sin ver:** no leí el código de base-api (lane ajeno). Asumido lo
  que dice el encargo: `auth.token` = valor crudo de la cabecera `authorization` (sin
  "Bearer"), rechazo con `err.message === 'unauthorized'`. Si base-api distingue otros
  mensajes (p. ej. token caducado vs. inválido) el cliente los trata igual: cualquier
  rechazo del handshake con sesión viva reintenta con token fresco.
- **No probado contra staging:** hace falta que base-api despliegue el handshake. Smoke
  pendiente: entrar, ver `connect` en la pestaña WS con el `auth` en el CONNECT packet,
  disparar `POST /api/users/socket/:userId` y ver llegar el evento; cerrar sesión y entrar
  con otra cuenta → el CONNECT lleva el token nuevo.
- Reintento manual sin tope: con sesión viva y servidor que rechaza siempre, un intento cada
  10 s por pestaña (con `getIdToken(true)` cada vez). Aceptable como "discreto"; si molesta,
  tope de N intentos.
- Push, PR y merge: pendientes de OK de Angelo.

## Next session

- Cuando base-api esté en staging: smoke del camino (conexión de tienda, campana, cambio de
  plan) y verificar el payload `auth` en el handshake.
- Cambio de usuario sin `logout()`: la impersonación de admin (`/login-token?token=…`,
  `loginWithCustomToken` en `src/views/auth/actions.js:72`) firma con otro usuario sin
  llamar a `closeSocket()`. Normalmente es una carga de página nueva (el singleton nace
  vacío, así que el primer socket ya lleva el token del impersonado). Si llegara por
  navegación client-side con un socket abierto, ese socket seguiría con la sesión anterior
  hasta recargar. No verificado; si pasa, llamar `closeSocket()` ahí también.
