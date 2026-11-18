---
title: "Caché en el borde (Cloudflare) para las dos primeras llamadas del SDK"
date: 2026-11-18
author: claude
status: live
audience: Miguel (Cloudflare), Angelo (OK de prod), agente de Vev/SDK
---

# Caché en el borde para el arranque del SDK

**Para qué:** en un pico (artículo de VG en Black Week) todos los lectores piden lo mismo al abrir la
página: la config de la surface y los productos del canal. Hoy las dos llamadas van hasta el AKS
(`server: istio-envoy`, sin CDN delante). Con esto, Cloudflare las sirve desde el PoP del lector y el
origen ve una petición por URL cada 60 s.

## 1. Qué está hecho en el origen (QA desde hoy)

| Llamada | Servicio | PR (develop → QA) | Cacheable solo si |
|---|---|---|---|
| `GET /v2/mobile/config` | vio-campaigns-microservice | [#38](https://github.com/vio-live/vio-campaigns-microservice/pull/38) (`2bac99c`) | 200 y la key de la surface en `?apiKey=` (sin `X-Api-Key`, o el mismo valor) |
| `Channel { GetProductsByIds … }` | graphql | [#45](https://github.com/vio-live/graphql/pull/45) (`2087269`) | **GET** con la key del canal en `?apiKey=`, query de catálogo de la lista, sin error y con respuesta no vacía |

**Verificado en QA el 18/11** (pods nuevos tras el deploy de develop, curl directo al origen, sin
Cloudflare): config con `?apiKey=` → 200 `public, max-age=0, s-maxage=60, stale-while-revalidate=300` y
el 304 con lo mismo; key solo en cabecera, keys distintas, sin key, key mala y 404 sin campaña →
`private, no-store`; `/v2/mobile/surface` sin cambios. GraphQL GET simple con `?apiKey=` → 200 `public,
s-maxage=60, stale-while-revalidate=300`, `access-control-allow-origin: *`; el POST de siempre → 200
`no-store`; GET con key solo en cabecera → `no-store`; key mala → 401 `no-store`; mutación por GET →
rechazada, `no-store`; `Payment` por GET con `?apiKey=` → 401 (la key de la URL no vale ahí); `CreateCart`
por POST → 200 `no-store` (funciona como antes).

Cabeceras que pone el origen:

- Config cacheable: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`,
  `Vary: X-Api-Key`, y el `ETag` de siempre (el navegador revalida, el CDN guarda 60 s).
- Productos cacheables: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, `Vary: Authorization`.
- **Todo lo demás:** `no-store` (`private, no-store` en la config). Eso incluye la key solo en la
  cabecera, dos keys distintas (cabecera y URL), cualquier error (401/403/404 sin campaña/5xx), los
  POST (lo que hace el SDK hoy), mutaciones, carrito, checkout, pagos y descuentos, cualquier otro campo
  de `Channel`, una lectura con `customerSessionId` y una lista vacía (los servicios de producto se tragan
  un fallo de api y devuelven `[]`: eso no se guarda).

Queries de GraphQL que se pueden cachear (todas bajo `Channel`, sin fragments en los dos primeros
niveles): `Products`, `GetProducts`, `ProductsPagination`, `GetProduct`, `GetProductsByIds`,
`GetProductBySKUs`, `GetProductByBarcodes`, `GetProductsByCategory`, `GetProductsByCategories`,
`GetCategories`. El gateway solo acepta la key en la URL para estas, y solo en GET; para lo demás sigue
haciendo falta `Authorization`. Funciona también con APQ (persisted queries) por GET.

**Por qué la key tiene que ir en la URL:** Cloudflare ignora `Vary` (salvo para imágenes), así que la
clave de caché es la URL. Si la key fuera solo en la cabecera, dos surfaces o dos canales compartirían
entrada. Por eso esas respuestas son `no-store`.

## 2. Configuración de Cloudflare (la hace Miguel; claude no toca Cloudflare ni DNS)

La zona `vio.live` ya está en Cloudflare (NS `grant`/`ophelia`). Los cuatro registros están hoy en
**DNS only** (nube gris) y apuntan al origen: `api.vio.live` y `graph-ql.vio.live` → `135.116.206.152`
(prod); `api-staging.vio.live` y `graph-ql-staging.vio.live` → `74.158.41.166` (QA).

### 2.0 Antes de pasar a proxied

1. **SSL/TLS → Full (strict).** El origen ya tiene certificados de Let's Encrypt válidos para cada host
   (cert-manager). Con Flexible habría bucles de redirección o HTTP sin cifrar al origen.
2. **Renovación del certificado:** si el `ClusterIssuer` usa HTTP-01, la petición a
   `/.well-known/acme-challenge/*` tiene que llegar al origen por el puerto 80 sin redirección. Comprobarlo
   (o pasar a DNS-01 con token de Cloudflare) antes de la próxima renovación (`graph-ql.vio.live` caduca el
   28/12).
3. **Seguridad sin desafíos en estos hosts:** las apps de iOS/Android, Vev y Replit no resuelven un
   challenge. Una regla WAF **Skip** para `http.host in {"api.vio.live" "graph-ql.vio.live"
   "api-staging.vio.live" "graph-ql-staging.vio.live"}` que salte Bot Fight Mode / Super Bot Fight Mode,
   Browser Integrity Check y Security Level. Sin Rocket Loader, sin Email Obfuscation, sin Always Online.
4. **TTL del DNS a 60–300 s** un rato antes, para que el rollback sea rápido.
5. **Límites del proxy que hay que tener en cuenta:** 100 s de timeout al origen (error 524; el gateway
   permite hasta 10 min, revisar si alguna mutación tarda más), 100 MB de body (Free/Pro), WebSockets
   pasan (el `webSocketBase` de la config es `wss://api…`). El origen verá IPs de Cloudflare: la IP del
   cliente viaja en `CF-Connecting-IP` y `X-Forwarded-For`.

### 2.1 Cache Rules (Caching → Cache Rules), en este orden

En Cloudflare, si varias reglas casan, **gana la última**: primero el bypass general, después las dos
de caché.

**Regla 1 — `vio-api-bypass` (todo lo demás no se guarda)**

```
(http.host in {"api.vio.live" "graph-ql.vio.live" "api-staging.vio.live" "graph-ql-staging.vio.live"})
```
→ **Bypass cache**.

**Regla 2 — `vio-sdk-config-edge`**

```
(http.host in {"api.vio.live" "api-staging.vio.live"}
 and http.request.method eq "GET"
 and http.request.uri.path eq "/v2/mobile/config"
 and any(http.request.uri.args.names[*] eq "apiKey"))
```
→ **Eligible for cache**
- Edge TTL: **Use cache-control header if present, bypass cache if not** (respeta `s-maxage` y los `no-store`).
- Browser TTL: **Respect origin** (manda `max-age=0`: el navegador revalida con ETag).
- Cache key → Query string: **Include only** `apiKey`, `platform`. Host incluido (por defecto). Sin
  cabeceras ni cookies en la clave.
- Serve stale content while revalidating: activado (honra `stale-while-revalidate=300`).
- Respect strong ETags: activado.

**Regla 3 — `vio-catalog-graphql-edge`**

```
(http.host in {"graph-ql.vio.live" "graph-ql-staging.vio.live"}
 and http.request.method eq "GET"
 and any(http.request.uri.args.names[*] eq "apiKey")
 and (any(http.request.uri.args.names[*] eq "query") or any(http.request.uri.args.names[*] eq "extensions")))
```
→ **Eligible for cache**
- Edge TTL: **Use cache-control header if present, bypass cache if not**.
- Browser TTL: **Respect origin**.
- Cache key → Query string: **Include all** (query, variables, operationName, extensions y apiKey
  cambian la respuesta).
- Serve stale while revalidating: activado.

No hace falta una regla para POST: Cloudflare nunca guarda un POST. Y aunque una de estas reglas casara
con algo que no debe, el origen manda `no-store` y la regla dice «bypass si no hay cache-control» →
no se guarda.

### 2.2 Despliegue por fases

1. **QA primero**: nube naranja en `api-staging.vio.live` y `graph-ql-staging.vio.live`, las tres reglas.
   Comprobar con los curl de §3 (`cf-cache-status: MISS` y luego `HIT`, `age` sube; en lo que no se
   cachea, `BYPASS` o `DYNAMIC`). Que Alan o quien esté pase una compra de prueba en QA (carrito y
   checkout son POST y no cambian).
2. **Prod**, solo cuando los dos PRs de release estén mergeados y desplegados (§4, pide OK de Angelo):
   nube naranja en `api.vio.live` y `graph-ql.vio.live`. Sin release, prod no manda `s-maxage` y no se
   cachea nada, pero pasaría igual por el proxy (latencia, timeouts y WAF de arriba).
3. Mirar en Cloudflare Analytics → Caching el ratio de HIT de `/v2/mobile/config` y de `graph-ql` GET, y
   en el origen los 5xx/524.

### 2.3 Rollback

- **Rápido:** desactivar las reglas 2 y 3 (todo pasa a bypass) o volver a nube gris en el registro
  (Cloudflare deja de estar en medio; tarda lo que el TTL del DNS).
- **Contenido malo cacheado:** Caching → Purge → por URL o por prefijo/host (`api.vio.live/v2/mobile/config`,
  `graph-ql.vio.live/`). Como mucho vive 60 s + 300 s de stale.
- En el origen: revertir el PR (las respuestas vuelven a no llevar `s-maxage` → la regla 2/3 no guarda nada).

## 3. Comprobación con curl

Las keys de surface y de canal son públicas (están en las páginas), pero aun así no las pegues en
canales; sácalas de la config. `K` = key de la surface, `CK` = key del canal
(`primarySponsor.commerce.apiKey` de la config).

```bash
# Config: cacheable con la key en la URL; la segunda vez, HIT
curl -s -o /dev/null -D - "https://api-staging.vio.live/v2/mobile/config?apiKey=$K&platform=vev" \
  | grep -iE '^(HTTP|cache-control|vary|etag|cf-cache-status|age)'
# Key solo en la cabecera: private, no-store (y en Cloudflare BYPASS/DYNAMIC)
curl -s -o /dev/null -D - -H "X-Api-Key: $K" "https://api-staging.vio.live/v2/mobile/config" | grep -iE '^(HTTP|cache-control|cf-cache-status)'

# Productos por GET (petición simple, sin cabeceras): public
Q='query GetProductsByIds($productIds:[Int!],$useCache:Boolean!){Channel{GetProductsByIds(product_ids:$productIds,useCache:$useCache){id title}}}'
curl -s -o /dev/null -D - -G "https://graph-ql-staging.vio.live/" \
  --data-urlencode "query=$Q" --data-urlencode 'variables={"productIds":[411995],"useCache":true}' \
  --data-urlencode "apiKey=$CK" | grep -iE '^(HTTP|cache-control|vary|cf-cache-status|age)'
# El POST de siempre: igual que antes, no-store
curl -s -o /dev/null -D - -X POST "https://graph-ql-staging.vio.live/" -H "content-type: application/json" \
  -H "Authorization: $CK" -d "{\"query\":\"$Q\",\"variables\":{\"productIds\":[411995],\"useCache\":true}}" | grep -iE '^(HTTP|cache-control)'
```

## 4. Prod: lo que falta y quién

1. **Angelo:** OK para mergear los PRs de release (preparados, sin mergear). Llevan **solo** este cambio,
   cherry-pick sobre la rama de prod (no arrastran lo demás que hay en develop):
   [vio-campaigns-microservice#39](https://github.com/vio-live/vio-campaigns-microservice/pull/39) → `main`
   y [graphql#46](https://github.com/vio-live/graphql/pull/46) → `master`. Tests en verde en las dos ramas.
2. Desplegar (el merge dispara el deploy) y repetir §3 contra `api.vio.live` / `graph-ql.vio.live`.
3. **Miguel:** §2 en prod.
4. **SDK/Vev:** que pidan las dos llamadas como en §5. Sin eso, Cloudflare no guarda nada aunque esté todo
   lo anterior.

## 5. Qué tienen que cambiar el SDK web y los bloques de Vev (no lo cambia este trabajo)

Lo hace quien lleva el SDK / los bloques de Vev. Los SDKs de iOS y Kotlin ya mandan `?apiKey=` en la config.

**Config** (`VioApi.bootstrap`, `src/core/api/vio.ts`):
- `GET {apiBase}/v2/mobile/config?apiKey=<surfaceKey>&platform=<platform>` **sin** cabecera `X-API-Key`.
  `Accept: application/json` puede quedarse (es una cabecera simple).
- Bonus: sin `X-API-Key` la petición deja de necesitar preflight CORS (ver
  [lección del preflight](../lessons/web-sdk-cors-preflight-x-api-key.md)): una ida y vuelta menos por lector.
- Orden de parámetros fijo (`apiKey` y luego `platform`); nada más en la URL (ni timestamps ni cache-busters).
- El resto de llamadas `/v2/*` (manifest, surface, experiences, catálogo de sponsor) no cambian.

**Productos** (`createCommerceClient`, `src/core/api/commerce.ts`; hoy `graphql-request` hace POST con
`Authorization`):
- Para las lecturas de catálogo (`GET_PRODUCTS_BY_IDS`, `GET_PRODUCT_SELLER`, `GET_PRODUCT_SHIPPING*`):
  `GET {commerceGraphQL}/?query=<q>&variables=<json>&operationName=<op>&apiKey=<channelKey>`, **sin
  ninguna cabecera propia** (ni `Authorization`, ni `X-API-Key`, ni `Content-Type`, ni
  `apollo-require-preflight`): tiene que ser una petición simple, porque un preflight por lector no lo
  sirve el CDN.
- `variables` serializado siempre igual (mismas claves, mismo orden, sin espacios) y sin
  `customerSessionId`: si cambia un carácter, es otra entrada de caché.
- La query puede ir entera (la URL queda en ~1–2 KB, muy por debajo del límite) o como APQ
  (`extensions={"persistedQuery":{"version":1,"sha256Hash":"…"}}`; si contesta `PERSISTED_QUERY_NOT_FOUND`,
  repetir con `query` + `extensions`). La query entera es lo más simple.
- Si el GET falla (red, 4xx/5xx), volver al POST de siempre.
- Carrito, checkout, pagos, descuentos y cualquier mutación: **POST como hoy**, con `Authorization` y
  `X-API-Key`.
- Activarlo cuando prod tenga los dos PRs (§4); en QA ya funciona.

**Bloques de Vev:** si llaman a la config o a GraphQL por su cuenta (no a través del SDK), mismo cambio.
Si usan el SDK, basta con subir de versión cuando se publique.

## 6. Notas

- La key en la URL aparece en logs de acceso (Cloudflare, istio). Las dos keys ya son públicas (la de la
  surface está en la página y la del canal sale en la config), así que no es un secreto nuevo.
- `/v2/experiences/:id` ya manda `public, max-age=60` con la key en la cabecera: **no** meterlo en una
  regla de caché de Cloudflare tal cual (mezclaría surfaces). La regla 1 lo deja en bypass.
- El `s-maxage` es 60 s: un cambio de campaña o de precio tarda como mucho 60 s (+ hasta 300 s de stale
  mientras revalida) en verse. Si hace falta que algo salga ya, purgar por URL.
