---
title: "0034 — Slots en web y Vev: cada página declara los suyos (merge), y el slot elige la campaña del bloque"
date: 2026-10-16
status: accepted
deciders: [angelo]
author: claude
supersedes: null
related: [0027]
---

# 0034 — Slots en web y Vev: declaración acumulativa por página

## Contexto

ADR-0027 definió el slot como un **nombre de sitio** que declara cada plataforma y al que el
dashboard asigna una campaña con fechas; lo que ningún slot nombra lo llena la campaña por
defecto. El micro y el dashboard lo implementan desde el 13/10 (`POST
/v2/mobile/components/manifest`, `GET /client-apps/:id/slots`, `PUT /campaigns/:id/slots`,
`campaigns[].slots[]` en la config). **Nadie declara slots todavía**: el SDK web solo tiene el
tipo y el bloque de Vev no tiene campo. En QA la tabla `surface_slot` está vacía y el tester ve
una sección «Slots» que nunca se llena (Alan, daily del 16/10).

El manifest heredado de vio-backend tiene semántica de **reemplazo** por plataforma: los slots
que no vienen se deprecan. Vale para una app nativa, que declara todo de una vez. En web y Vev
una surface tiene **varias páginas** y cada una conoce solo sus propios bloques: la portada
daría de baja los slots de la ficha de producto y viceversa.

## Decisión

1. **El manifest acepta `mode: 'merge'`.** Con `merge` el micro inserta o actualiza los slots
   declarados y **no depreca** ninguno. Sin `mode` (o `replace`) se comporta como hasta ahora.
   Los SDKs nativos siguen con `replace`; el SDK web y Vev declaran siempre con `merge`.
   La limpieza de un slot que ya no existe en ninguna página es una acción del dashboard
   (pendiente), no del SDK.
2. **Quién declara y cuándo.** Cada bloque de Vio con slot (atributo `vio-slot` en los
   elementos del SDK; campo «Slot» del bloque en Vev) se registra al montarse; el SDK manda
   **una** declaración por carga de página, después del primer bootstrap, y la **omite si ese
   mismo conjunto ya se declaró desde ese navegador en las últimas 24 h**. Así el editor de Vev
   declara el slot en cuanto el diseñador lo escribe, y los visitantes no bombardean al micro.
   `Vio.declareSlots()` queda público para declarar a mano (con `force`).
3. **La plataforma la dice el host.** `Vio.init({ platform: 'web' | 'custom-web' | 'vev' })`,
   por defecto `web`; el mismo valor va en la declaración y en `GET /v2/mobile/config?platform=`.
4. **Qué cambia un slot en el bloque.** El bloque con slot usa la campaña que tenga ese slot
   **asignado y vigente** (`campaigns[].slots[]` solo trae ventanas abiertas); si no hay, la
   campaña por defecto. En Vev «la campaña» del bloque es su **sponsor**: el bloque toma el
   `primarySponsor` de esa campaña para pedir productos y para la atribución (`campaign_id` y
   `sponsor_id` de los eventos), en lugar del sponsor activo de la página. Si ese sponsor no está
   entre los de la key conectada, el bloque sigue con el de la página y lo dice en consola.
5. **Nombre del atributo.** `slot` es un atributo nativo de HTML (shadow DOM). En los elementos
   del SDK el atributo es **`vio-slot`** (propiedad `vioSlot`); en Vev el campo se llama «Slot».

## Enmienda (2026-10-16, tarde) — el nombre no se le pide al editor

Angelo, al leer el flujo: pedirle un nombre a quien edita en Vev o en Replit es un problema; el
identificador lo generamos nosotros, y así además queda trazable en analytics sin que nadie haga
nada. Donde hay desarrolladores (SDK web/React, móviles) el componente reutilizable se registra
con el id que ellos pongan, como estaba planteado.

Queda así:

- **Todo bloque de Vio se registra solo**, siempre. El id es el que ponga el host en `vio-slot`
  si lo pone; si no, uno **generado y estable**: en Vev, la clave del bloque (no cambia al
  republicar) con el tipo delante; en web, tipo + posición + ruta de la página. El nombre
  legible (`vio-slot-name`, campo «Nombre» en Vev) es opcional; si falta, el SDK pone uno
  («Carousel 1 · /sport»; en Vev, el título del bloque).
- **El campo «Slot» de Vev deja de ser obligatorio y pasa a ser agrupación opcional**: varios
  bloques con el mismo valor son un solo sitio en el dashboard.
- **El dashboard ve el inventario real** de la página: cada bloque con su nombre, y asigna
  campaña bloque a bloque o por grupo. `location_id` de analytics es ese mismo id: cada
  componente es trazable desde el primer día.
- **Coste aceptado**: más filas por surface (una por bloque) y entradas huérfanas cuando el
  diseñador borra un bloque, hasta que exista la baja desde el dashboard o la baja por página
  (tipo + página en el manifest: segunda vuelta, con migración del kernel).

Los puntos 1, 3 y 5 de la decisión original no cambian.

## Enmienda 2 (2026-10-16, tarde) — una campaña por componente, de punta a punta

Angelo: en una misma página o carrito pueden convivir varias campañas, incluso de la misma marca,
y en Vev y Replit puede haber varias campañas con artículos distintos; cada evento, venta,
transacción y pedido tiene que quedar con su campaña. Y la solución tiene que ser la misma para
el SDK web, Vev y Replit.

- **Un solo helper de atribución, `Vio.attribution(slot)`**: devuelve campaña (la del slot
  asignado y vigente, si no la por defecto), su sponsor, el slot efectivo y el artículo
  (`contentId`/`contentTitle`). Los elementos del SDK, los bloques de Vev y las páginas de Replit
  lo usan igual, para los eventos y para marcar el carrito.
- **Scope heredable en vez de nombre por bloque.** El id automático es
  `${scope}-${tipo}-${n}`; el scope lo pone el host una sola vez (`data-vio-scope` en el `body`
  o en un contenedor; en Vev, la página). Una página de Vev (= un artículo) y una página de
  artículo en Replit (`<body data-vio-scope="article-123" data-vio-scope-name="Título">`) tienen
  así slots propios sin nombrar nada; una plantilla que quiera slots compartidos entre artículos
  no pone scope.
- **El artículo va en los eventos, no en el slot**: `content_id`/`content_title`, resueltos
  solos (init → `?vio_content` → meta → canónica → ruta).
- **El carrito recuerda el origen de cada línea** (campaña, slot, artículo, cantidad por
  origen) y **la compra y el inicio de checkout se emiten una vez por campaña presente en el
  carrito**, con sus líneas y su importe y el mismo id de transacción. Las estadísticas por
  campaña salen exactas sin tocar colector ni ClickHouse. Un carrito con una sola campaña se
  comporta como hoy.
- **Fuera de esta vuelta**: la campaña en el pedido de Commerce (shopcart → orden; migración del
  kernel) y las reglas de campaña por contenido para plantillas que comparten slots.

## Consecuencias

- Micro: un cambio pequeño y compatible (`mode`), PR aparte. SDK web 0.23.0: `platform` en
  `init`, `declareSlots`, `registerSlot`, `campaignForSlot`, `resolveSlotCampaign`, `slot` en el
  contexto de analytics y precedencia en `resolveCampaignId` (explícito → slot → sponsor →
  default). Vev 0.330: campo «Slot» en card, carrusel y grid.
- Un slot declarado desde una página de prueba queda en la surface hasta que alguien lo
  depreque desde el dashboard: aceptable hoy; la acción de dashboard es la deuda que deja este
  ADR.
- Los slots sin plataforma (manifest viejo de los SDKs nativos) siguen valiendo para todas.

## Alternativas descartadas

- **Manifest por página** (un identificador de página y deprecación dentro de él): más
  correcto, pero exige un modelo nuevo en el micro y en el dashboard para algo que hoy no
  duele. Se puede añadir encima de `merge` sin romper nada.
- **Declarar solo desde el editor de Vev**: dejaría fuera a web y custom web (Replit, clientes
  con su propia página), que no tienen editor.
