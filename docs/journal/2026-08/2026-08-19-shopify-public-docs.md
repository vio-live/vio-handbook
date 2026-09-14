---
date: 2026-08-19
session: shopify-commerce-public-docs
participants: [angelo, claude]
status: live
---

# Session — 2026-08-19 — guía pública de Shopify en docs.vio.live, sesión cerrada hasta que responda Shopify

## Handbook desactualizado — encontrado por Angelo, no por el agente

Angelo reportó que el handoff de `shopify-sync.md` no reflejaba el cambio
de dominios (sin la palabra "shopify") ni el resto de lo documentado el
18-ago. Causa: el clon local de `vio-handbook` es **compartido entre
sesiones** — otra sesión (`docs/sponsor-role`) había dejado el working
directory apuntando a una rama sin ninguna de las actualizaciones, y
encima esa rama's version del archivo era la de **junio**, de antes incluso
del 11-ago (la actualización de esa fecha vivía únicamente en
`docs/platform-definition`, nunca mergeada a `main`).

Fix: en vez de mergear mi rama de trabajo (`docs/shopify-sync-submission`,
montada sobre `docs/platform-definition`, que hubiera arrastrado ~30
commits ajenos sin relación — Vev, analytics, WooCommerce), se armó una
rama limpia partiendo de `origin/main` con **solo** los 4 archivos
relevantes (el handoff, 2 journals, la lección), usando `git worktree` para
no interferir con el checkout compartido de la otra sesión. PR abierto:
[vio-handbook#6](https://github.com/vio-live/vio-handbook/pull/6) — **sin
mergear todavía**.

Confirmado en el camino: el propio "app store submission" generó otra
ronda de confusión — Angelo pensó que el agente se refería a un producto
llamado "Shopify Marketplace" separado, cuando era literalmente la
submission de Vio Sync al App Store que se venía haciendo toda la sesión
anterior. Aclarado sin incidente.

## Guía pública de Shopify en `docs.vio.live` — de "coming soon" a publicada

Angelo preguntó si había acceso al repo de la documentación pública
(**`vio-live/vio-docs`**, Nextra + Vercel, `docs.vio.live`) y pidió replicar
para Shopify lo que ya existía para WooCommerce
(`content/commerce/woocommerce.mdx`, guía completa y publicada tras la
aprobación en WordPress.org). `content/commerce/shopify.mdx` era un stub
"coming soon".

Escrita la guía completa seccion por sección espejando la estructura de la
de Woo, pero **sin copiar su contenido** — cada label/boton/texto se sacó
del código real de `vio-shopify-sync` (`app/routes/app._index.tsx`,
`app.additional.tsx`): "Connect to Vio", "Welcome to Vio Sync", "Export
selected (N)" / "Remove selected (N)", los filtros exactos (Status:
All statuses/Active/Draft/Archived; export: All products/Exported to
Vio/Not exported), la sección "Connection & log" con sus badges reales
(Connected, Reachable/Unreachable, Products exported).

Screenshots y video: no existen capturas reales todavía (igual que
faltaban varias en la guía de Woo) — mismo patrón de `<Callout>`
describiendo qué debe mostrar cada una, en vez de imagenes rotas.

**Publicada antes de la aprobación del App Store** — decisión consciente
de Angelo ("publícala, no hay problema") a pesar de que el primer paso de
la guía (buscar "Vio Sync" en el App Store) todavía no funciona para nadie
hasta que Shopify apruebe la submission del 18-ago. Mergeado directo a
`main` (patrón de este repo: push directo, sin PR, deploy automático de
Vercel) — verificado en vivo con polling hasta que el contenido nuevo
reemplazó al "coming soon" cacheado. URL:
[docs.vio.live/commerce/shopify](https://docs.vio.live/commerce/shopify).

## Cierre de sesión

Angelo pidió documentar todo y cerrar la sesión hasta que Shopify responda
la submission. Ver
[handoff/shopify-sync.md](../../handoff/shopify-sync.md) para el estado
consolidado y la lista completa de pendientes — no hay nada más accionable
de este lado hasta que llegue esa respuesta o Alan retome alguno de los
puntos marcados para él.
