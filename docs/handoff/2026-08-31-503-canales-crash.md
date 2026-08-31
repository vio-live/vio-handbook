# Handoff — 503 al agregar productos a un canal (webapp + api-microservice + graphql)

**Fecha:** 2026-08-31 · **Estado:** **RESUELTO**. Los dos arreglos están mergeados en `develop` y desplegados; Angelo confirmó que su API key de canal volvió a funcionar.

> Se llegó acá persiguiendo un 503 al agregar productos a un canal. La causa resultó ser una cadena de tres bugs en tres repos distintos, ninguno de ellos en el sitio donde se veía el error. Vale la pena leerlo completo por eso.

---

## 1. El síntoma

En `dashboard-staging.ecom.vio.live`, al seleccionar varios productos publicados y darle *Add* en un canal: **entra un producto y el resto falla**. En consola:

```
POST /api/channel/multi-group/v2?page=1&size=1&variants=false  → 503
GET  /api/channel/user                                          → 503
GET  /api/request/user/1322                                     → 500
```

Ojo: fallan también endpoints que no tienen nada que ver con el alta. Eso es la pista de que **no es un timeout** sino que el microservicio entero se cae.

---

## 2. La cadena causal (verificada, no hipótesis)

### Eslabón 1 — el gateway devuelve 500 para cualquier error con `extensions.code`

`graphql/src/Infra/GraphQL/plugins/StatusErrorResponsePlugin.ts`

```ts
private readonly statusCodes = {
  [InvalidArgumentError.name]: httpStatus.BAD_REQUEST,
  [NotFoundError.name]:        httpStatus.NOT_FOUND,
  [UnauthorizedError.name]:    httpStatus.UNAUTHORIZED
}
private getStatusCode (code: string) {
  return this.statusCodes[code] ?? httpStatus.INTERNAL_SERVER_ERROR
}
```

Las claves del mapa son **nombres de clases de excepción**, pero se compara contra `extensions.code`. Todo código que no esté ahí (`UNAUTHENTICATED`, `GRAPHQL_VALIDATION_FAILED`, `BAD_USER_INPUT`…) cae en el `?? INTERNAL_SERVER_ERROR`.

**Verificación reproducible:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://graph-ql-dev.vio.live/graphql \
  -H 'Content-Type: application/json' -d '{"query":"{ CampoQueNoExiste }"}'
# → 500   (extensions.code = GRAPHQL_VALIDATION_FAILED)
```
Un typo en la query devuelve 500.

### Eslabón 2 — `getAuthChannel` está roto para casi toda key de canal

`graphql/src/Infra/Utils/Auth.ts`

```ts
if (apply && chanelId <= 0) channelIdGeneral = chanelId
if (apply && __channelUserId <= 0) channelId = __channelUserId
```

Comparaciones invertidas: solo asignan cuando el id es `<= 0`, o sea **nunca** para un canal real. `channelId` queda en 0 y tres líneas más abajo lanza `ApolloError('The user does not have an assigned channel', 'UNAUTHENTICATED')`.

Las únicas keys que funcionan son las de `idChannel` **9 (Api), 10 (Sdk) y 12**, porque entran por el bloque siguiente, que sí asigna bien.

Afecta a los **9 resolvers** que usan `getAuthChannel`: Cart (Query+Mutation), Checkout (Query+Mutation), Payment (Query+Mutation), Discounts, Product.Mutation, Product.objectType. Con una key de canal que no sea 9/10/12, **el SDK entero es inusable**.

Introducido en `f472301` (2026-04-22), con la creación del archivo. No es una regresión reciente.

### Eslabón 3 — ese 500 mata al api-microservice

`vio-api-microservice/src/modules/channel/providers/channel.service.ts`

Por **cada** producto insertado se dispara `RemoveProductsCache` contra el gateway con `.subscribe()` **sin handler de error**:

```ts
this._httpService.post(initialEndpoint, { query: mutation, variables: {} }, { headers })
  .subscribe();          // ← sin { error }
```

1. axios rechaza ante el 500.
2. En **rxjs 7**, el error de un observable sin handler se relanza diferido (`reportUnhandledError` → `setTimeout(() => { throw err })`).
3. `main.ts` **no registra** `process.on('uncaughtException')`.
4. → **el proceso muere**. Kubernetes lo levanta y, mientras tanto, todo el microservicio responde 503.

**Verificación reproducible** (mismas versiones del package.json: rxjs 7.4.0 + axios):
```js
const { defer } = require('rxjs'); const axios = require('axios');
defer(() => axios.post('https://graph-ql-dev.vio.live/graphql',
  { query: 'mutation RemoveProductsCache { Channel { RemoveProductsCache { success } } }', variables: {} },
  { headers: { Authorization: 'clave-que-ya-no-sirve' } })).subscribe();
setTimeout(() => console.log('sigo vivo'), 3000);
// → EXIT CODE 1; "sigo vivo" nunca se imprime
```

Eran **tres copias** del mismo bloque sin manejar el error: `createChannelGroup`, `createMultiChannelGroup` (v1) y `createMultiChannelGroupV2`; las dos últimas **dentro del bucle por producto**.

### Por qué el síntoma es "de a uno"

El `save()` del producto ocurre **antes** de la mutación. Entra uno → el pod se cae → el resto de la selección falla. El usuario reintenta, entra otro, se cae otra vez.

### Por qué no se reproducía en QA

La mutación solo se dispara si el canal tiene `userChannelApiKey.apiKey`. El canal de QA 491 tiene clave **y es `channel_id` 10 (Sdk)** — una de las tres que `getAuthChannel` sí resuelve. Su llamada devuelve `{"data":{"Channel":{"RemoveProductsCache":{"success":true}}}}` con HTTP 200, así que nunca crashea. Con un canal de otro tipo, 500 → crash.

---

## 3. Qué está hecho

### Ramas subidas, SIN mergear

| repo | rama | commit | contenido |
|---|---|---|---|
| `vio-live/graphql` | `agent/graphql/fix-getauthchannel-comparacion` | `c12ec91` | invierte las dos comparaciones a `> 0`. **`tsc --noEmit` limpio** |
| `vio-live/vio-api-microservice` | `agent/api/fix-removeproductscache-crash` | `e6f78df` | helper único con `subscribe({ error })` que loguea en vez de matar el proceso + la invalidación sale de los dos bucles (una sola llamada por operación). −99/+49. **Sin compilar**: el repo no tiene `node_modules` y las deps `@reachu/*` son privadas |

Tarjeta de Trello para Alan con todo el detalle y evidencia pedida: https://trello.com/c/FXqdV6Rf

### Ya en `develop` + `staging` del webapp (mitigaciones, no el arreglo)

| commit | qué |
|---|---|
| `60fe6c9` | debounce en las tres búsquedas que pegan al servidor (lista de productos, catálogo del canal, picker). Medido: 8 teclas eran **8 GET** a `/listings`, ahora **1**. Además `aria-label` en el input de la lista, que no tenía nombre accesible |
| `810facf` | alta al canal **por tandas de 20** con contador de avance y aviso de cuántos entraron si falla. Y **fix del "Remove from channel"**, que nunca funcionó (ver abajo) |
| `f83696a` | corrección de un número mal derivado en un comentario |

**Bug aparte, ya arreglado en el front:** `removeChannelItem` mandaba la palabra de `channelOrigin.type` (`'product'`, `'collection'`, `'collectionShared'`) pero el backend espera el **código** `'1'`/`'2'`/`'3'`; con la palabra responde siempre `417 "ChannelUser type action not found"`. Verificado lado a lado contra staging: `'product'` → 417, `'1'` → 200 `deleted successfully`. Mapeado en `src/lib/channels.js` (`REMOVE_TYPE_CODE`) + 10 tests.

---

## 3.bis. Desenlace (31/08, misma tarde)

| repo | commit | estado |
|---|---|---|
| `vio-api-microservice` | `e6f78df` | mergeado en `develop` por Alan, CI/CD verde 17:04 UTC |
| `graphql` | PR [#1](https://github.com/vio-live/graphql/pull/1) (`c12ec91`) | mergeado en `develop` 20:44 UTC, CI/CD verde |

Verificado tras el deploy del gateway: la key del canal QA 491 (`channel_id` 10, de las que ya funcionaban) sigue devolviendo 200 en `GetProducts` y `RemoveProductsCache` — sin regresión. Angelo confirmó que su key de canal de plataforma volvió a funcionar.

**No verificado empíricamente:** el caso de la key rota, porque no se pudo generar una equivalente en QA — las keys creadas a mano vía API no pasan el `verifyToken-graph` del middleware. La deducción desde el código es firme igualmente (ver eslabón 2).

Quedó abierto en tarjeta propia: [jrHu0dFd](https://trello.com/c/jrHu0dFd) — `StatusErrorResponsePlugin`. Y en rama sin mergear: `agent/api/red-de-seguridad-uncaught` (`fd16660`), el `process.on('uncaughtException')` del `main.ts`.

## 4. Lo que NO está verificado

- **El contador de reinicios del pod.** Es la confirmación directa del crash y no la pude obtener: el contexto de `kubectl` apunta al cluster de Azure (`kubernetesqa`), cuyo DNS ya no resuelve — parece que migraron a GKE (hay dos contextos `gke_tipio-staging-development_*`) — y los tokens de gcloud están caducados. Hace falta `gcloud auth login` y después `kubectl get pods` mirando RESTARTS antes/después de agregar >5 productos a un canal cuya key no sea 9/10/12.
- **Que el canal concreto de Angelo sea de los que fallan.** Encaja con todo, pero no entré a su cuenta a comprobarlo. El error `"The user does not have an assigned channel"` que reportó con su key es exactamente la firma del eslabón 2, así que es muy probable.

---

## 5. Decisiones pendientes (no las tomé)

1. **`StatusErrorResponsePlugin`**: está mal (todo error codificado → 500), pero arreglarlo cambia los status de **toda** la API y algún cliente puede depender de ellos. No lo toqué. Merece tarjeta propia.
2. **`main.ts` del api-microservice** no tiene red de seguridad para errores asíncronos sueltos. Un `process.on('uncaughtException')` que loguee evitaría que el próximo caso así tumbe el servicio entero. Cambia el comportamiento de caída de todo el microservicio.
3. **Orden de merge sugerido**: primero `graphql` (elimina el 500 de raíz para las keys de canal), después `api-microservice` (elimina la clase entera de fallo). Son independientes; el segundo protege aunque el gateway vuelva a devolver 5xx por cualquier otro motivo.

---

## 6. Datos medidos, por si sirven

| medición | valor |
|---|---|
| `channel/multi-group/v2`, altas nuevas | 5 items → 1064 ms · 20 items → 3148 ms → **~139 ms por producto** sobre ~370 ms de base |
| mismo endpoint, items que ya estaban | 20 items → 2224 ms · 200 items → 11 s |
| alta por tandas de 20 (200 items) | 15,5 s total, **ninguna petición supera 1,65 s** |
| búsqueda en el picker, antes | 8 teclas → 8 GET a `/listings` (+8 preflight OPTIONS) |
| búsqueda en el picker, ahora | 8 teclas → **1 GET**, con la palabra completa |

**Cuenta de QA usada:** `claude-qa-final-1787091680938@viotest.dev` — canal 491 "QA SDK Channel" (`channel_id` 10), con ~40 productos demo cargados durante estas pruebas. Contraseña fuera del repo: pedírsela a Angelo.
