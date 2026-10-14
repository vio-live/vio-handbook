---
date: 2026-10-14
session: evening
participants: [angelo, claude]
status: live
---

# Session — 2026-10-14 — vio-web-sdk: la carrera del bootstrap al cambiar de clave

## Goal
Cerrar el pendiente 3 del [handoff](../../handoff/2026-10-14-campanas-handoff.md): un
`bootstrap()` en vuelo de una clave reemplazada pisaba el de la clave nueva. Angelo: "dale con
todo! hasta el build y lo pruebo, pero merges y todo".

## Done
- **El problema, leído en el código** (`src/core/client.ts` de vio-web-sdk):
  - `init()` vaciaba la caché pero no anulaba el `bootstrap()` en vuelo;
  - al volver, ese bootstrap escribía la configuración de la clave vieja en la caché;
  - si fallaba, activaba la espera de 5 s también para la clave nueva;
  - su `finally` vaciaba el hueco de la petición nueva.
- **Por qué pasa en Vev:** `resolveApiKey()` prioriza la clave guardada en el navegador
  (`vio.apiKey` en `localStorage`) sobre la de la página. Los componentes arrancan con esa clave, y
  Vio Config la cambia después por la de la página.
- **Lo que podía salir:**
  - cards "no disponible", porque Vev reintenta 8 × 300 ms (2,4 s), menos que la espera de 5 s;
  - sponsors equivocados, o "Sponsor X not found";
  - o un cliente de commerce que se queda toda la sesión con la clave del canal de la otra key,
    con pedidos y métodos de pago del canal equivocado (ADR-0031).
- **Arreglo, vio-web-sdk [#79](https://github.com/vio-live/vio-web-sdk/pull/79), 0.20.4:**
  - `init()` sube un contador de generación;
  - una respuesta solo entra en la caché si su generación sigue siendo la actual;
  - una respuesta o un fallo viejo no tocan la caché ni la espera, y quien esperaba recibe el
    bootstrap actual;
  - `finally` solo vacía su propio hueco.
- **Tests:**
  - `client.bootstrap.test.ts` cubre la clave vieja respondiendo la última, la primera y con
    fallo, y la regresión de que un fallo de la clave actual sigue activando la espera;
  - con el código anterior fallan los tres primeros;
  - suite completa: 42 archivos y 329 tests; `tsc` y `tsup` limpios.
- **Rebundle en Vev, [#62](https://github.com/vio-live/vev/pull/62):**
  - antes del cambio, el `vio-sdk/index.js` de `main` era idéntico al build de vio-web-sdk `main`
    (604.390 bytes), así que el diff trae solo la versión y el `bootstrap()` nuevo;
  - `vev build` termina bien, en el worktree y en el clon principal (`8e1ab69`), y el `.vev/build`
    lleva el arreglo.
- Los dos PRs están mergeados y el árbol de `main` es el probado en los dos repos.

## Decisions
- **Contador de generación en vez de cancelar la petición.** La petición vieja puede terminar;
  lo que importa es que su respuesta no entre. Quien la esperaba recibe la configuración actual,
  así que nadie se queda colgado ni recibe datos de otra clave.
- **El fallo de la clave actual sigue activando la espera de 5 s.** Para eso existe; solo deja
  de afectar a otra clave.

## Blockers
- `tsc` en vio-vev da un TS2322 nuevo además de los dos `'100%'` conocidos: `kind="tertiary"` en
  `vio-config.tsx:705` no es un `SilkeButtonKind`. Ya estaba en `main` antes de este cambio, y
  `@vev/silke` va en `latest`. No rompe el build.

## Next session
- **Desplegado (15/10):** con el OK de Angelo ("despliégalo al compartido"), `vev deploy` del compartido
  `cq1lXld-TA9` → **0.327**, actual. Rollback: `vev restore` a la 0.326. Las páginas ya publicadas cogen
  el arreglo al republicarlas.
- **Cómo verlo en el editor:**
  - cambia la clave en Vio Config: los productos de la nueva salen sin recargar y sin
    `bootstrap recently failed` en la consola;
  - o deja una clave inválida en `localStorage.vio.apiKey`, limita la red en DevTools y recarga:
    las cards cargan con la clave de la página.
- **npm:** 0.20.4 no está publicado; para Vev no hace falta, porque Vev compila la librería desde
  su código.
