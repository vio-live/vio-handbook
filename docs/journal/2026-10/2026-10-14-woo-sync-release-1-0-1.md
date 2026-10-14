---
date: 2026-10-14
session: evening
participants: [angelo, claude]
status: live
---

# Session — 2026-10-14 — Vio Sync for WooCommerce 1.0.1 y 1.0.2 en wp.org

## Goal
Llevar a las tiendas el arreglo del precio de los productos variables (reporte de Alan,
[ADR-0032](../../decisions/0032-precio-de-productos-con-variantes.md)). Había que probar con
wp-env vio-woocommerce-sync #1, mergearlo y publicarlo en wp.org. Angelo: "Sigue con lo del
plugin de Woo y wp.org".

Después, verificar en el panel de Variations que una variación editada llega a Vio. No llegaba
bien, y Angelo pidió arreglarlo en la 1.0.2 y corregirle a Alan los pasos de prueba: "dale, ve
con la 1.0.2 y corrígele a Alan".

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

**Panel de Variations y 1.0.2:**
- **Verificación con 1.0.1**, en el navegador sobre el wp-env y con todas las llamadas a Vio
  interceptadas. Un mu-plugin temporal responde con un producto falso; el dev store está conectado
  a QA con una key real, así que nada podía salir. Resultado:
  - con **Save changes** no se manda nada;
  - con **Update** se manda el cambio **anterior**.
- **La causa:**
  - `WC_Meta_Box_Product_Data::save_variations()` guarda el padre antes que las variaciones;
  - el plugin sincronizaba en ese primer `woocommerce_update_product`, todavía con los datos viejos;
  - el candado `viosync_updating_<id>` de 5 s descartaba los guardados buenos, el de la misma
    petición y el del formulario que va justo después.
  - Pasaba desde antes de 1.0.1.
- **Alan:** comentario de corrección en su tarjeta. Con 1.0.1 solo vale el paso 2; los pasos 3,
  4 y 5 esperaban a 1.0.2.
- **Arreglo, vio-woocommerce-sync [#2](https://github.com/vio-live/vio-woocommerce-sync/pull/2):**
  - los hooks de guardado (también los de variación, que encolan su padre) solo encolan el producto;
  - `flush_pending()` lo sincroniza una vez en `shutdown` con prioridad 20, después del sync
    diferido de WooCommerce (prioridad 10);
  - sin candado.
  - Commits `4ada26f` (arreglo) y `0cc6874` (release).
- **Pruebas de 1.0.2:**
  - suite 24/24; `tests/ProductsTableTest.php` es nuevo, y con el código viejo fallan 3 de sus 4 tests;
  - en el panel real, con Save changes se manda un `PUT` con 80 al final;
  - con Update se manda un `PUT` con 70 y el submit del formulario solo hace un GET (diff vacío);
  - un producto simple editado por CLI manda su `PUT`;
  - Plugin Check 0/0 sobre el build desde git.
- **Publicado:** tag `1.0.2`, Action en verde en 39 s (run `38611111524`). La API de wp.org da
  1.0.2, y en el `tags/1.0.2` de SVN están `flush_pending()` y nada del candado.
- **Limpieza:** el probe, el usuario temporal y los productos de prueba están borrados; el clon
  quedó en `main` (`0cc6874`) y wp-env, apagado.

## Decisions
- **Quitar `Domain Path` en vez de añadir una carpeta `languages/` vacía al repo.** Una carpeta
  vacía no se puede commitear sin un archivo de relleno, que además se publicaría.
- **`Tested up to` se sube solo después de probar en esa versión**, no para callar el error de
  Plugin Check.
- **El auto-sync corre una vez por petición, al final**, y no en cada `woocommerce_update_product`.
  WooCommerce guarda el padre varias veces al guardar variaciones, y solo la última vez tiene los
  datos buenos. Un candado por tiempo no puede distinguir cuál es la buena.

## Blockers
- ~~Resuelto en 1.0.2~~ **Verificado después, en la misma sesión:** una variación editada desde el admin no llega bien a Vio. Con Save changes no se manda nada, y con Update se manda el cambio anterior. Viene de antes de 1.0.1: el plugin sincroniza en el primer guardado del padre, que WooCommerce hace antes que las variaciones, y un candado de 5 s descarta el guardado bueno. El detalle y el arreglo propuesto están en el pendiente 12 del handoff.

## Next session
- Alan prueba 1.0.2 en su tienda, con los pasos 3, 4 y 5 de su tarjeta.
- Las tiendas reciben 1.0.2 al actualizar el plugin. Los productos que ya estaban en 0 en QA los
  arregló el backfill de products #23. En prod hace falta el mismo backfill cuando products #23
  pase a prod (orden en ADR-0032).
