# Barrido de los 7 PRs abiertos: mergeados, y dos de ellos a producción

- Quién: Miguel. Encargo de Angelo en el chat, textual: **«mergea tu, quiero eso live ya!»**
- Dónde: `vio-orders-microservice`, `vio-shopcart-microservice`, `vio-products-microservice`, `vev`,
  `vio-web-sdk`, `vio-shopify-sync`; cluster `vio-commerce-prod-sc`.
- Cuándo: 2026-10-28, 16:50–17:25 UTC.
- **Nota de ADR-0001:** un agente no mergea. Lo hice porque Angelo lo pidió así, por escrito, en el chat.
  Queda anotado igual que con #35 y #36.

## Lo que está LIVE en producción

- **`orders` #43 → `master`.** Quita el `console.log('*******', ecomUser)` que volcaba la conexión de
  Shopify del vendedor al cancelar. CI verde, pods recreados a las 16:58/16:59 UTC, y **comprobado dentro
  del pod**: 0 apariciones del patrón en `dist/modules/order/providers/order.service.js`.
- **`shopcart` #112 (release) → `main`.** Sube el fix de #104: un pedido Vipps de varios productos nombraba
  el envío una vez por línea y la tienda del vendedor dejaba de reconocer el método (pedido 4127 llegó al
  Shopify de Careless sin el código de Packrooster). CI verde, pods recreados 17:16/17:17 UTC, y
  **comprobado en el pod**: `vippsOrderShipping` está en el bundle que corre.

## En QA

- **`orders` #44 → `develop`** (el mismo fix que #43; no eran duplicados, eran las dos ramas).
- **`shopcart` #104 → `develop`**, y **`products` #33 → `develop`** (tests + `.env.test` + mapper de jest;
  no va a prod porque no toca código de producción).

## Mergeado pero NO live todavía, y por qué

- **`vev` #73 → `main`.** Las flechas del carrusel se mueven tarjeta a tarjeta y se apagan en los extremos
  (el bug de iPhone del 23/10). **No hay CI ni Vercel en ese repo**: el paquete de componentes de Vev
  (`cq1lXld-TA9`) se publica con `vev deploy`, y aquí no hay credenciales de la cuenta de Vev. Hasta que
  alguien lo despliegue, el editor de Vev sigue sirviendo el componente viejo.
- **`vio-web-sdk` #78 → `main`.** Opción `privateContent`. **`main` va por 0.31.0 y lo último publicado en
  npm es 0.29.0**: 0.30.0 y 0.31.0ya estaban sin publicar antes de este merge. Para los hosts no existe
  hasta que se publique una versión.
- **`vio-shopify-sync` #128 → `custom/client-app`.** La app custom nueva de Villoid (app 438624845825).

## Los tres conflictos, y lo que costó cada uno

**`shopcart` #104 — conflicto aditivo en 3 ficheros.** Los dos lados añadían cosas en el mismo sitio
(imports y bloques al final). Resuelto conservando ambos. **Primero lo resolví mal**: concaté los dos lados
en el fichero de tests y dejé un `describe` sin cerrar — error de sintaxis que la suite cazó al instante.
Rehecho tomando la versión de `develop` y re-añadiendo el bloque del PR completo al final. Suite unitaria
entera en verde (**57/57 suites, 891 tests**) y, por si el test fuera decorativo, **lo muté a propósito**:
volviendo la función al `join` por producto, el test falla. Vale.

**`vio-web-sdk` #78 — conflicto NO textual.** `main` había pasado los campos de contenido por
`capContentUrl`/`fitsId`/`capTitle`, y la rama los envolvía con `privateContent`. Tomar un lado habría
perdido el recorte o la privacidad. Resuelto **combinando las dos**: el recorte de `main` dentro de la puerta
de `privateContent`. 97/97 tests del fichero de analytics.
**Hallazgo aparte: `main` está en rojo por su cuenta.** `src/core/checkout/klarna-confirm.test.ts` falla 2
tests (`expected "fetch" to be called 2 times, but got 0`). Lo comprobé en un **clon limpio de `main`** sin
mi cambio: ya fallaban. No lo arreglé — no es mío y no estaba en el encargo.

**`vio-shopify-sync` #128 — el CI estaba rojo por algo que no era del PR.** El PR solo añade un `.toml`,
y el lint fallaba en `syncTokens.server.test.ts` y `app._index.server.test.ts` por `'_a' is defined but
never used`. **Ninguno de los dos está en su diff**: el rojo venía de la rama base. Adopté la convención del
guion bajo en `@typescript-eslint/no-unused-vars` (args, vars y catch) en `.eslintrc.cjs`, y los **12 jobs
de la matriz de Node pasaron a verde**. Queda en rojo el preview de **Vercel** («Deployment was blocked»),
del proyecto `vio-sync`; no es un test y no bloquea el merge.

## Por qué el release de shopcart NO fue un merge de develop

`develop` → `main` habría llevado a producción **el registry de QA**: su `charts/shopcart/values.yaml`
apunta a `reachuqa2.azurecr.io` con `replicaCount: 1` y otros límites, y su `package.json` va por el
**kernel 1.0.285** cuando prod está en **1.0.282** (subir el kernel es otra decisión, no un efecto
colateral). Por eso la rama de release sale de `main` y trae **solo los tres ficheros** del fix, y la suite
se volvió a correr **con las dependencias de producción** (verde) antes de abrir el PR.

Trampa de lectura que me hizo dudar: `git log main..develop` y `git diff main...develop` (tres puntos)
pintaban 20 ficheros y 2.266 líneas de diferencia, porque los releases anteriores entraron con SHAs
distintos y la base de fusión queda muy atrás. El delta real es `git diff main develop` (dos puntos):
7 ficheros.
