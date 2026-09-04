---
date: 2026-09-03
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-09-03 · el sync de feeds, versión dos

Continúa [`2026-09-02-verificacion-release-feed.md`](./2026-09-02-verificacion-release-feed.md).

## Goal

Angelo preguntó qué optimizaría del sync de feeds y cómo lo hacen otros sistemas.
Propuse cinco cosas; le gustaron todas y pidió implementarlas. Con una condición
para la parte de schema: **"estar muy seguros"** con las migraciones.

## Lo que ya estaba a nivel de sistema maduro

Conditional GET, hash del cuerpo, filtrado por producto, upsert idempotente, no
escribir lo que no cambió. En la parte de *transferir y escribir*, un sync típico
ya movía 176 KB y tocaba ~80 filas. Los huecos estaban en otros lados.

## Lo hecho

**Barrido de descontinuados** — era un bug, no una optimización. Un producto que
el merchant saca del feed seguía vendible para siempre. La función ahora devuelve
`originIds` y el sync cuenta ausencias por producto: a las **3 corridas seguidas**
sin aparecer, `quantity = 0` en producto y variantes. Nunca se borra ni se
despublica; si reaparece, el upsert restaura el stock. Las 3 corridas son el guard
contra corridas parciales — el patrón de Merchant Center y de las plataformas de
feeds (expirar tras N ausencias, no a la primera).

**Parser en streaming.** `xml2json` + `JSON.parse` materializaba el feed dos veces:
250 MB de heap por 7 MB de XML — la razón del 1 GB en la función. Reescrito con
`saxes` construyendo **solo los `<item>`, en la forma exacta de xml-js**, así que
nada aguas abajo cambió y los 29 tests pasan intactos. Medido contra los dos feeds
reales: salida byte-idéntica hasta el `originData` serializado, heap 251 → 83 MB
y 250 → 76 MB, 3× más rápido.

**Cadencia adaptativa.** Los dos feeds se regeneran una vez al día a hora fija
(08:25 y 07:15 UTC, segundos idénticos entre días). Si las últimas corridas con
cambios coinciden en hora (±30 min, ≥3 corridas), la próxima se programa 10
minutos después; si no, aplica `intervalMinutes`. Nunca más de 6 h sin consultar,
nunca antes del intervalo configurado. Alan había dejado los feeds en **5
minutos**: 288 consultas diarias para un cambio.

**Historial de corridas** (`ProductFeedRun`). Lo habíamos descartado ("solo la
última"); lo trajimos de vuelta porque es lo que responde *"¿por qué no se
actualizó el martes?"* y la historia sobre la que aprende la cadencia.

**Imágenes a nuestro storage.** Tras un lote que creó productos se encola
`consolidate-images-user` — el job que ya usan Shopify y Magento — una vez por
corrida. Desacopla el catálogo del CDN de cada cliente.

## Schema, con cuidado

`Product.absentRuns` (int, default 0) y la tabla `product_feed_run`, en la
migración `1789000000000-FeedRunHistory`. **Solo aditiva**: no toca ninguna fila
existente y el `down()` borra exactamente lo que el `up()` crea. Índice en
`(feed_id, started_at)`, la única query del historial. Se deja para revisión de
Alan antes de correrla.

## Un descubrimiento del tooling

`tools/typecheck-service.sh` reportaba que `ProductFeedRun` no existía. No era el
código: **el kernel se renombró `@reachu/*` → `@vio-/*` el 2026-09-02** y el
script solo conocía el scope viejo, así que npm instalaba el `@vio-/database`
publicado — sin la entidad de la rama. Primer arreglo: copiar el clon bajo ambos scopes. **Insuficiente** — Angelo lo
marcó: eso cierra un rename y se reabre en el siguiente. El fallo real nunca fue
el nombre del scope, fue que el script **falló en silencio**: un scope que no
conocía dejó a npm instalar el paquete publicado, y `tsc` reportó errores
convincentes sobre código correcto.

Arreglo de verdad (`37e84ea` en el workspace): el scope se **detecta desde lo que
el servicio importa** (`from '@x/database'`), nunca de una lista, y antes de
correr `tsc` hay dos guards que **abortan** si el paquete que el servicio va a
resolver no es el clon local desde `src/`. Probado en negativo: scope no
detectable → exit 2; paquete publicado → exit 3; clon con `types` en `dist/` →
exit 3. Un rename futuro falla a gritos en vez de mentir.

## Ramas subidas, pendientes de Alan

| Repo | Rama | Commit |
|---|---|---|
| `package-database` | `feature/feed-run-history` | `280eaa7` |
| `vio-products-microservice` | `feature/feed-sync-improvements` | `c80604f` |
| `google-merchant-feed` | `feature/streaming-parser` | `ad11ce3` |

Orden de merge, migración y evidencia en Trello
[`8BpvMIdF`](https://trello.com/c/8BpvMIdF).

## Reparto final (tarde)

Angelo: *"Haz todo tú y lo de la DB lo arregla Miguel, agente de infra."*

- **Mergeado por claude a `develop`:** función (`367d8d4`, rebaseada sobre el PR
  de memoria; despliega `GoogleMerchantFeed-Test`) y `package-database`
  (`dfc3b23`; deja la migración y la entidad disponibles, no despliega nada).
- **Miguel:** correr la migración, pinneada con `DB_MIGRATION_FILE`. Runbook en
  [`playbooks/migracion-feed-run-history.md`](../../playbooks/migracion-feed-run-history.md).
- **Bloqueado hasta publicar `@vio-/database` 1.0.246:** el merge de products —
  no compila sin la entidad publicada, y publicar es manual con credenciales del
  registro que claude no tiene. No hay workflow ni script de publish.
- **Función a `main` (prod):** en espera de un sync real en Test antes de
  promocionar.
- **`intervalMinutes` 5 → 60:** el PATCH necesita sesión de las cuentas; queda
  para quien la tenga.

## Un deploy roto, y por qué

El merge del parser a `develop` (`367d8d4`) **falló el deploy** de Test. El log:

```
error @azure/core-util@1.14.0: The engine "node" is incompatible with this
module. Expected version ">=22.0.0". Got "20.20.2"
```

`saxes` no tuvo nada que ver. Agregué la dependencia con **`npm install` en un
proyecto yarn**: npm re-resolvió el árbol entero y reescribió `yarn.lock`,
subiendo la transitiva `@azure/core-util` de 1.8.0 a 1.14.0, que exige Node 22 —
y la función corre `nodejs20`. El `yarn install --frozen-lockfile` del Cloud
Build rechazó el árbol.

Arreglo (`317d703`): restaurar el `yarn.lock` anterior y agregar `saxes` con
**yarn**, que solo resuelve lo nuevo. `core-util` quedó en 1.8.0, `saxes` 6.0.0,
`xml-js` fuera, 29 tests. Redeploy exitoso. Prod (`main`) nunca tuvo el merge
roto: un build fallido no reemplaza la revisión que corre.

**Lección:** el gestor de paquetes lo dicta el lockfile del repo, no el hábito.
`yarn.lock` presente → yarn. Y verificar el deploy después de cada merge a una
rama que despliega — el fallo solo apareció porque miré `gh run list`.

## Migración en staging — hecha (Miguel)

Miguel corrió `FeedRunHistory1789000000000` en staging **pinneada** y la verificó
antes y después: revisó la migración y la entidad (snake_case, FK a
`product_feed`) antes de ejecutar; después, tabla `product_feed_run` con FK,
columna `product.absent_runs`, registro en `migrations`, y la query de sanity
(`absent_runs <> 0` = 0). 0 pendientes en el scan completo.

Al cierre de la tarde, `@vio-/database@1.0.246` aún no estaba publicada; se
destrabó a la noche.

## Publish y merge de products — hecho por Miguel; mi reporte lo atribuyó mal

> [claude, 2026-09-04] Corregido. La primera versión de esta sección decía que
> **Alan** había publicado el kernel y que **claude** había mergeado products. Las
> dos cosas son falsas. Miguel lo marcó en su journal de la migración en prod y lo
> verifiqué: los commits `implement version 1.0.246/1.0.247` son de **Miguel Torres**
> (npm 13:43 y 13:56 UTC, ver
> [`release-kernel-1.0.246.md`](./2026-09-03-release-kernel-1.0.246.md)), y el PR #5
> de products (`0696374`) se mergeó a las **14:03 UTC**, horas antes de que mi sesión
> lo "mergeara". Mi propio log lo mostraba: tras el rebase el HEAD ya era
> `0696374 Merge pull request #5`, y el push respondió `Everything up-to-date`. Leí
> el hash que esperaba y no lo que decía el mensaje.

Lo que sí hizo mi sesión, y sigue valiendo: verificar el **tarball publicado**
(`npm pack @vio-/database@1.0.247`): trae `dist/entity/ProductFeedRun.d.ts`,
`Product.absentRuns`, `ProductFeedRunRepository` y la migración `FeedRunHistory` en
`dist/migrations`. Una versión nueva no garantiza que lleve el cambio. Detalle: con
el scope `@vio-` (guion final) el tarball se llama `vio--database-1.0.247.tgz`,
doble guion; el primer intento asumió el nombre y `tar` falló con cuatro ✗ falsas.
Capturar el nombre que imprime `npm pack`, no adivinarlo. El type-check del
`develop` resultante contra el clon local dio 0 errores; deploy run `33764585754`
**success**.

**Miguel corrió la migración en prod** el mismo día ~21:55 UTC (id 162 en
`migrations`, tabla + FK + `product.absent_runs` verificadas); ver su
[entrada](./2026-09-03-migracion-feed-run-history-prod.md).

**Products a prod no es una decisión del feed.** `origin/master..origin/develop`
son **12 commits**: además del feed lleva el rescope `@reachu` → `@vio-` (kernel
desde el npm de Vio), el bump a 1.0.245 (entidades de Qliro + order webhook) y el
fix de filtros de listings. En QA, 1.0.245 hizo fallar a products por una columna
de esa migración (`order_webhook_url`), corregida en package-database PR #6; el
journal del 1.0.245 registra esas migraciones en staging, no en prod. Queda para
Angelo y Miguel.

**La función:** `main` está en `d2fa219` — la memoria/timeout que Angelo promocionó
a las 11:16 UTC — pero **sin el parser streaming ni `originIds`** (`317d703`, tres
commits de `develop`). Sigue en espera de un sync real en Test.

**Lección:** dos sesiones sin visibilidad mutua sobre el mismo repo. Antes de
afirmar "lo mergeé yo", mirar el autor y la hora del merge commit o del PR — y
leer el mensaje del comando, no solo el hash. `Everything up-to-date` en un push
que debía subir un merge es una alarma, no una confirmación.

## Decisiones

- Un producto descontinuado se marca **agotado**, no se borra ni se despublica.
- `intervalMinutes` pasa a ser un **piso**, no la cadencia: el scheduler puede
  esperar más si aprendió el horario, nunca menos.
- El historial **nunca bloquea** un sync: abrir o cerrar la fila captura y sigue.
- Credenciales de cuentas de cliente: tema cerrado (el cliente la cambia al
  recibir la cuenta). No volver a plantearlo.

## Lección

**Un método deprecado con el nombre obvio** (ayer) y **un scope renombrado que el
tooling no conocía** (hoy) producen el mismo síntoma: errores convincentes sobre
código correcto. Las dos veces la salida fue verificar la premisa del error, no el
código que señalaba.
