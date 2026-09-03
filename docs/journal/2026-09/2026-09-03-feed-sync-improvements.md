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
