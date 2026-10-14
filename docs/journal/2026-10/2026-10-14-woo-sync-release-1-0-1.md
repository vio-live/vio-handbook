---
date: 2026-10-14
session: evening
participants: [angelo, claude]
status: live
---

# Session — 2026-10-14 — Vio Sync for WooCommerce 1.0.1 en wp.org

## Goal
Llevar a las tiendas el arreglo del precio de los productos variables (reporte de Alan,
[ADR-0032](../../decisions/0032-precio-de-productos-con-variantes.md)). Había que probar con
wp-env vio-woocommerce-sync #1, mergearlo y publicarlo en wp.org. Angelo: "Sigue con lo del
plugin de Woo y wp.org".

## Done
- **Tests en wp-env**, primero en WordPress 7.0 y después en 7.1.3, con WooCommerce 10.9 y PHP 8.3:
  - la suite completa da 20/20;
  - `ProductMapperTest` da 6/6, y con el mapper viejo fallan 4 de los 6, así que los tests cubren el bug;
  - la página de configuración renderiza sin avisos en `debug.log`;
  - los tests no dejan productos en la tienda.
- **Plugin Check** sobre el build con el nombre correcto dio 1 error y 1 warning, los dos ajenos
  al arreglo:
  - `Tested up to: 7.0 < 7.1`: salió WordPress 7.1. Actualicé el core del wp-env a 7.1.3,
    volví a correr la suite y después subí el valor.
  - `Domain Path: languages` sin carpeta: `languages/` era una carpeta vacía que nunca estuvo en
    git. Solo existía en el clon local, y por eso el check de 1.0.0 pasó, aunque el build
    publicado (que sale de git) nunca la tuvo. El plugin no trae `.mo` (las traducciones llegan
    por los language packs de wp.org), así que quité el header.
  - Resultado: **0/0**.
- **Release 1.0.1** (versión en los tres sitios más el changelog), en el mismo PR. Merge de #1
  con rebase (`main` es lineal): `b7b8a3c` (arreglo) y `2f7ae37` (release). El árbol de `main`
  es idéntico al del commit probado.
- **Tag `1.0.1`**: la Action de 10up quedó en verde en 30 s (run `38607801791`).
- **Verificado en wp.org:**
  - la API da `version 1.0.1`, `tested 7.1.3` y `last_updated 2026-10-14 5:34pm GMT`;
  - SVN `tags/1.0.1` tiene solo los archivos de runtime;
  - el `class-product-mapper.php` publicado tiene `price_from_variants()` y la guarda de `is_numeric`.
- **Limpieza:** el clon principal quedó en `main` (`2f7ae37`) y los contenedores de wp-env, apagados.
  `dami-wordpress-*` no se tocó.
- **Docs:**
  - [playbook de release](../../playbooks/wordpress-org-plugin-release.md): tabla de releases,
    build desde git, `Tested up to`, cómo correr los tests y verificación en wp.org;
  - [arquitectura del plugin](../../architecture/woocommerce-sync.md);
  - el [handoff](../../handoff/2026-10-14-campanas-handoff.md) y el plan.

## Decisions
- **Quitar `Domain Path` en vez de añadir una carpeta `languages/` vacía al repo.** Una carpeta
  vacía no se puede commitear sin un archivo de relleno, que además se publicaría.
- **`Tested up to` se sube solo después de probar en esa versión**, no para callar el error de
  Plugin Check.

## Blockers
- **Verificado después, en la misma sesión:** una variación editada desde el admin no llega bien a Vio. Con Save changes no se manda nada, y con Update se manda el cambio anterior. Viene de antes de 1.0.1: el plugin sincroniza en el primer guardado del padre, que WooCommerce hace antes que las variaciones, y un candado de 5 s descarta el guardado bueno. El detalle y el arreglo propuesto están en el pendiente 12 del handoff.
  dispara el auto-sync del padre. Es el pendiente 12 del handoff.

## Next session
- Las tiendas reciben 1.0.1 al actualizar el plugin. Los productos que ya estaban en 0 en QA los
  arregló el backfill de products #23. En prod hace falta el mismo backfill cuando products #23
  pase a prod (orden en ADR-0032).
