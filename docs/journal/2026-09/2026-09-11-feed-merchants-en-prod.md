---
date: 2026-09-11
session: multi-day (2026-09-04 → 2026-09-11)
participants: [angelo, claude]
status: live
---

# Session — 2026-09-04 → 2026-09-11 · el feed llega a prod con tres merchants, y lo que rompió en el camino

Continúa [`2026-09-03-feed-sync-improvements`](./2026-09-03-feed-sync-improvements.md).
Una semana sin journal: queda escrito de una vez, como índice. Los detalles viven en los
commits y en las tarjetas enlazadas.

## Goal

Que Kondomeriet, Nytelse y Boots sincronicen de verdad en producción, con categorías y
publicables. Al empezar, se creía que el feed ya estaba en prod: no lo estaba.

## Done

### 1. El feed de prod nunca había sincronizado

- **Función a prod**: parser SAX en streaming, `main` = `8c45e39` (PR #3, google-merchant-feed).
  Validada en Test antes: 32 corridas, cero OOM.
- Los request logs de Cloud Run mostraron que **`GoogleMerchantFeed-Prod` tuvo 16 requests en
  30 días, todas el 31-ago**. Test sí sincronizaba. Nota: `index.js` no tiene ni un
  `console.*`, así que para saber si corrió hay que mirar los request logs, no los de la función.
- **Mi diagnóstico estuvo mal.** Con 1 mensaje activo y 0 programados en la cola concluí que
  "nadie consume la cola" y le escribí a Alan que revisara `ENV_FILE_PROD`. El agente de front,
  con acceso al cluster, midió lo real: **products llevaba 4 días y medio en CrashLoopBackOff**
  (1230 reinicios, OOM del heap de V8 al procesar el feed), sin que ninguna alerta avisara.
  Lo resolvió Miguel: memoria, las **4 columnas de 6 que faltaban en prod** y el merge
  develop→master → [`2026-09-07-products-crashloop-oom-feed`](./2026-09-07-products-crashloop-oom-feed.md).
- La memoria aplicada a mano no estaba en el chart: el próximo deploy la revertía →
  [lección de Miguel](../../lessons/helm-pisa-memory-limit-manual.md). Alan lo cerró con
  `re generate chart` en `master` (1Gi/2Gi con `reachuprod2`). La trampa del registry por
  rama está en [`commerce-deploy`](../../playbooks/commerce-deploy.md).
- Por qué Test no sincronizaba el fin de semana: el **cluster de QA se apaga fuera de horario**
  (`az aks stop`, cron de la 01:00) → [`2026-09-07-check-cluster-qa-detenido`](./2026-09-07-check-cluster-qa-detenido.md).

### 2. La base rechazaba texto que el feed sí manda

- Kondomeriet: 15 productos perdidos por `Incorrect string value … for column 'description'`
  — invisibles de Word (U+F0B7, U+200B, U+2060). **La columna es `latin1_swedish_ci` en prod.**
- Guarda en products: `sanitizeFeedText` (`ebf493e`). Arreglo de fondo, migraciones de Alan:
  `description`, `title` (µ de "10µg", contenido real que la guarda no debe tocar), y después
  una auditoría por `information_schema` que convirtió 12 columnas `title`. Siguen en latin1
  las columnas que no se llaman `title` (`brand`, `tags`, opciones, `category.name`).

### 3. Boots

- Mandaron un TSV en un ZIP: **no es un feed, es un export de reporte de Merchant Center**. No
  hace falta soportar TSV.
- El feed real (`boots.no/media/amasty/feed/google.xml`) está **congelado desde el 18-mar** y
  **sus precios no traen moneda** (`<g:price>169.9</g:price>`). Arreglos en products (`1b2cb1f`):
  fallback a la moneda configurada del vendedor (sin columna nueva) y un aviso en el log cuando el
  `Last-Modified` pasa de 30 días.
- Sin `product_type`, ningún producto tenía categoría. **Categorías desde `google_product_category`**
  con la taxonomía de Google empaquetada en noruego e inglés (`22d0794` en la función, `94382bd`
  en products): 2.241 de 3.821 productos quedan categorizados, 61 IDs, todos resueltos.
- **Resultado en prod**: 3.821 productos en NOK, en draft, con categorías en noruego e imágenes
  espejadas a nuestro storage. El *Access denied* que vio Alan en las imágenes fue geográfico,
  de su lado; desde Noruega responden 200.

### 4. Resiliencia (`8001a1f`)

- **Vigilante del scheduler**: cada 15 min re-arma los feeds vencidos hace más de 20. Dos pods
  arrancan juntos en cada deploy, así que cada uno reserva el feed con un compare-and-set sobre
  `next_run_at`. Verificado en prod: re-armó el feed 4 cuando murió su cadena, y hay 3 mensajes
  programados para 3 feeds.
- **Reintento de fallidos en un feed congelado**: al agotar intentos se borran los validadores del
  feed; `knownHashes` hace que la re-descarga republique solo lo que falló.
- **HTML doble-escapado** (646 descripciones de Boots): se decodifica un nivel, y solo si no hay
  tags reales.

### 5. Categorías de feed: un bug mío en el árbol que ven todos

- Las raíces se llamaban **"Feed 1305" / "Feed 1306"**: el consumidor recibe `{ id }` del bus, y
  la raíz leía `user.brandName` de ese objeto. Además cada ruta estaba **repetida hasta 3 veces**:
  10 workers por pod creaban la misma categoría a la vez y nada en el schema lo impide. Arreglos
  (`94382bd`, `f3aac26`): la raíz sale de la cuenta, single-flight por pod, búsqueda que
  prefiere la más vieja.
- **Primera limpieza (SQL mío, corrido por Alan)**: la fusión anduvo bien, pero el script cerraba
  con dos `UPDATE` con **marcadores para completar a mano**. Alan renombró primero y después corrió
  el script entero, y quedaron raíces llamadas literalmente `<brand_name de user 1305>`. El código
  no las encontró y creó raíces nuevas. **Error de diseño mío** → [lección](../../lessons/script-para-otro-se-corre-tal-cual.md).
- **Boots duplicado** (5935/5936): dos pods crearon la raíz en el mismo instante, y el caché local
  de cada pod anulaba la búsqueda "la más vieja". Arreglo `d8bd585`: releer después de crear, y
  el pod que perdió la carrera borra su copia. El test reproduce la carrera (2 pods × 10 workers,
  200 rondas) y **con la lógica anterior falla con exactamente `[5935 'Boots', 5936 'Boots']`**.
- **Segunda limpieza**: procedimiento que se corre tal cual, valida el estado al empezar y el
  resultado antes del COMMIT, y aborta sin cambios si algo no cierra. **Probado contra MySQL 8.0.21**
  (la versión de prod) con el árbol real: 116 fusiones, 740→740 productos, segunda corrida sin
  cambios, fallo forzado a mitad que deshace todo. Entregado en [`aaOBZvZ8`](https://trello.com/c/aaOBZvZ8).
- Arquitectura actualizada: [`product-categories`](../../architecture/product-categories.md).

## Decisions

- **Moneda**: si el feed no la trae, se usa la del vendedor. Nunca pisa una que el feed declare.
- **Taxonomía**: gana el `product_type` del comercio; Google solo para feeds que no traen el suyo.
  Noruego para vendedores en NOK, inglés para el resto.
- **Un script que va a correr otro se corre tal cual**: sin marcadores, se autovalida y es
  idempotente (Angelo: "nunca asumir, nada").

## Blockers / open questions

- [`aaOBZvZ8`](https://trello.com/c/aaOBZvZ8) (Alan): promover `d8bd585`, correr la segunda
  limpieza y **reiniciar products** (el caché de categorías es un `Map` sin expiración).
- **Decisiones de Angelo**: índice único en `category (slug, father_id, name)` (cierra la carrera
  del todo, después de la limpieza); **clase de envío** (`Can't publish without shipping class` es
  lo que hoy impide publicar Boots; el feed trae `g:shipping`); **visibilidad** (las categorías de
  feed de cada vendedor aparecen en el selector de todos).
- Boots: pedirle que regenere el feed. Charset: auditar las columnas que no son `title`.
- El gate de migraciones del kernel compara solo `HEAD~1..HEAD`: un `workflow_dispatch` posterior
  deja pasar una migración sin frenar el bump. Avisado el 2026-09-04, sin tarjeta.

## Next session

- Verificar la evidencia de `aaOBZvZ8` en la tarjeta: la salida del procedimiento y la captura
  del selector.
- Según lo que decida Angelo: mapear `g:shipping` a una clase de envío y filtrar las categorías de
  feed por vendedor en el selector.
