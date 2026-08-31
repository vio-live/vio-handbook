---
date: 2026-08-31
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-08-31 · feed: review de Alan, subida a staging, y upload por archivo

Continuación de [`2026-08-26-google-merchant-feed.md`](./2026-08-26-google-merchant-feed.md).

## Goal

Revisar lo que entregó Alan del feed gestionado, subir a staging lo que faltaba,
y agregar la posibilidad de importar un catálogo desde un **archivo** y no sólo
desde una URL.

## Review de la entrega de Alan

Alan cerró casi todo lo pedido y funciona: el scheduler ahora arranca
(`createProductFeed` y `rearmOverdueFeeds` encolan el mensaje programado), el lock
de Redis está bien planteado (`SET NX EX 3600`, atómico y con TTL), el payload ya
manda sólo `{ id }` del usuario, y `contentHash` quedó completo — columna,
migración, `v1.0.243`, y el mapa se arma con un `select` acotado.

**Tres cosas que no cerraban:**

1. **Sus dos ramas de optimización no estaban mergeadas.** Products armaba
   `knownHashes` y se lo mandaba a una Cloud Function que no leía ese parámetro
   ni estampaba `contentHash` — así que el `find` con `contentHash: Not(IsNull())`
   devolvía vacío siempre y todo el Nivel A era un no-op.
2. **La Cloud Function se queda sin memoria.** El deploy no setea `--memory` ni
   `--timeout`, así que quedan los defaults de 256 MB y 60 s. Medido con el feed
   real: **386 MB de RSS, 261 MB de heap**, y sólo 402 ms de CPU. Probablemente
   explica el import parcial de ~600 productos que Alan estaba viendo. **Sigue
   sin arreglar** — es de Alan, en [`JaNGo19Y`](https://trello.com/c/JaNGo19Y).
3. **El lock de Redis falla abierto**: si Redis no está o el `set` tira error, el
   job corre igual, sin lock, en todos los pods. También pendiente.

## El bug que sólo apareció al mergear

Al integrar el Nivel A (la función publica sólo lo cambiado) con el Nivel B (el
consumer no escribe lo que no cambió), **los dos se anulaban**:

El hash se persiste dentro de `applyFeedUpdate`, que es exactamente lo que el
corte del Nivel B saltea. Un producto sin cambios nunca guardaba su
`contentHash`, nunca entraba en `knownHashes`, y se republicaba en cada corrida.
La optimización que debía frenarlo era la razón por la que nunca tenía la chance.

Arreglado en `be864c1` escribiendo sólo esa columna en el camino del skip, y sólo
mientras difiera. Simulado sobre el catálogo real con 2 400 productos ya
importados sin hash: corrida 1 publica 2 400 y no escribe ningún producto,
corrida 2 publica 0.

**Vale como lección general:** dos optimizaciones correctas por separado pueden
cancelarse. Ninguna de las dos ramas tenía el bug; apareció en el merge.

## Import por archivo

Un cliente puede no tener el feed publicado, o querer mandarnos un export para
arrancar. El backend **ya aceptaba un archivo**, pero lo inlineaba: el XML viajaba
como cuerpo JSON a la Cloud Function, contra su techo de **10 MB**. Medido, 7,2 MB
de XML son 7,4 MB de body — Kondomeriet entraba con 26% de margen.

Ahora el archivo se guarda en Azure Blob y se le pasa la **URL** a la función, que
la descarga como cualquier feed hospedado. Desaparece el techo, se reutiliza el
camino ya probado, y queda el archivo para reprocesar. El link es un SAS de sólo
lectura que expira en una hora. Si no hay blob storage configurado, cae al
comportamiento inline anterior.

Además `multer()` estaba **sin ningún límite** en una ruta abierta a cualquier
usuario autenticado. Ahora: un archivo, 32 MiB, y un 413 que dice el tamaño.
Centralizado en `src/middlewares/feedUpload.js`. Probado con requests reales, 9
casos incluido el límite exacto.

**Decisión:** un archivo subido **no crea un `ProductFeed`** — no hay URL que
re-consultar. Pero los productos igual quedan con `origin: 'NATIVE'` y `originId`
= el `g:id` del merchant, así que si el cliente después da la URL, la conexión
gestionada hace upsert sobre los mismos productos en vez de duplicar. El camino
"mandame un export, después conectamos el feed" funciona solo.

El front quedó verificado en el navegador montando el componente en una página
aislada, sin usar credenciales: estado inicial, archivo elegido con nombre y
tamaño, Remove, el guard de tipo, y el input oculto con `tabIndex=-1` y
`aria-hidden`.

## Subido a staging

**Staging es `develop`**, no `pre-develop`. El workflow confunde: `develop` usa los
secrets `*_QA` pero `APP_NAME_DEV`, y `pre-develop` usa `*_STAGING` pero
`APP_NAME_PRE`. `pre-develop` está 6 y 9 commits atrás y no se usa.

| Repo | `develop` | Qué lleva |
|---|---|---|
| `google-merchant-feed` | `a7a3895` | Nivel A — publica sólo lo cambiado |
| `vio-products-microservice` | `be864c1` | Nivel B + el fix de integración |
| `vio-base-api` | `651aced` | upload a blob + límite de multer |
| `webapp-vio-commerce` | `d4b6b35` | UI del archivo (`staging` también adelantada) |

## Decisiones

- **El hash lo calcula la Cloud Function, no products.** Dos implementaciones
  divergen y el filtro deja de matchear en silencio.
- **Staging = `develop`** para los servicios de commerce. `pre-develop` no se usa.
- **`vio-base-api` no tiene rama `pre-develop`** aunque su workflow la contemple.
  No la creamos.
- Las contraseñas de las cuentas de cliente **no van en la tarjeta de Trello**.
  Alan dejó una de staging; se lo marcamos para las de producción.

## Blockers / open questions

- **La memoria de la Cloud Function sigue sin arreglar.** Es lo que más importa:
  hasta que no suba de 256 MB, un catálogo grande falla igual, venga de URL o de
  archivo.
- El lock de Redis sigue fallando abierto.
- **Sin verificar:** que `AZURE_SERVICE_CONTAINER_CONNECTION_STRING` y
  `AZURE_BUCKET` estén en cada entorno, y que la función pueda descargar el SAS.
  Si falta, la subida cae al modo inline en silencio y vuelve el techo de 10 MB.
- Faltan las cuentas de Kondomeriet y Nytelse y la carga en producción — de Alan,
  en [`6KuGKjRB`](https://trello.com/c/6KuGKjRB).

## Next session

- Esperar a Alan: memoria de la función, lock de Redis, cuentas y carga en prod.
- Después, las pantallas del dashboard según el diseño. La 04 (revisión agrupada
  por categoría) es la que hace falta apenas se carguen los feeds.
