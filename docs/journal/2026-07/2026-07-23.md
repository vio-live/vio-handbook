---
date: 2026-07-23
session: vev-closeout
participants: [angelo, claude]
status: live
---

# Session — 2026-07-23 — Vev: cierre, gaps y backlog (+ raíz del bug de precios)

> Sesión de cierre del demo de Vev. Documentado el estado, lo que falta para darlo por listo, y
> el backlog. De rebote, una **review del backend de Alan** (a petición de Angelo) encontró la
> **raíz del bug de precios EUR/NOK** que arrastrábamos. Estado y listas en
> [`architecture/vio-vev-integration.md §7`](../../architecture/vio-vev-integration.md).

## Qué se hizo

1. **Se decidió quedarnos con lo nuestro, no con el reachu-demo de Alan.** `vio-live/vev` `main` es
   la versión nativa (7 bloques); el reachu-demo de Alan queda solo como backup en la rama
   `alan-reachu-demo` (no se borra, no se usa).

2. **Cierre documentado (§7):**
   - **Estado:** 7 bloques funcionando end-to-end (catálogo → card/carousel/grid → detalle con
     variantes → carrito → checkout → Apple Pay/Klarna).
   - **Gaps para cerrar (must-have):** #1 precios de variantes EUR/NOK (backend), #2 decidir Vipps,
     #3 confirmar Klarna en el sponsor, #4 Apple Pay en el dominio final, #5 rotar `sk_test_`,
     #6 empaquetado del SDK (snapshot vendored vs versionado).
   - **Backlog:** Tier 1 (migrar cart/checkout a UI propia; SDK versionado), Tier 2 (Vipps real,
     multi-sponsor, slot overlay, "Fra" real, swatches), Tier 3 (analytics, lazy-load, a11y, tests).

3. **Review del backend de Alan (v1.0.237)** — pedida por Angelo aunque backend está fuera de mi
   scope bounded. 3 subagentes en paralelo, read-only. Resumen:
   - `@InjectRepository` (7 servicios): correcto y uniforme (des-apila decoradores). Ojo:
     `users`/`template` tienen servicios sin decorar (preexistente) → smoke-boot.
   - Paquetes: dedup de TypeORM completo (typeorm → `peerDependencies 0.2.41`, v1.0.237 en los 7;
     los 11 consumidores ya pinnean 1.0.237 en develop). Redis Cluster: fix en
     `package-service/src/cache/redis/index.ts` (ops por-key en modo clúster, flag
     `CACHE_USE_CLUSTER`) — completo.
   - Fixes 24/25 ("conexión incorrecta" = registro de integración equivocado, no DataSource):
     `shopcart`/`products` OK; `api` incompleto (path bulk sin ordenar); **`extensions` el que
     gatearía** — arregló Woo pero Magento (7 sitios) y Shopify (1) tienen el mismo anti-patrón
     `findOne` sin `where:` → podrían devolver la conexión de otro tenant.
   - 🎯 **Raíz del bug EUR/NOK:** `products/…/product.service.ts:686-688` hace default a
     `EUR` cuando falta `price.currencyCode` (mercado base NOK). Es el origen del `3310` que veíamos.

## Estado de repos

- `vio-live/vev` `main` = nuestro Vev (7 bloques) · `alan-reachu-demo` = backup.
- `vio-web-sdk` `main` = cambios mergeados (`fddf16b`), rebundle en vio-vev al día.
- Handbook: §7 nuevo + este journal.

## Pendientes (dueños)

- **Alan/backend:** fix EUR/NOK (product.service.ts:686-688); completar `extensions`
  (Magento/Shopify); ordenar path bulk en `api`; smoke-boot `users`/`template`; resolver billing
  CI/CD de `vio-live` (staging no tiene las imágenes nuevas).
- **Angelo:** decidir Vipps; rotar `sk_test_`; decidir empaquetado del SDK; Apple Pay dominio final.
