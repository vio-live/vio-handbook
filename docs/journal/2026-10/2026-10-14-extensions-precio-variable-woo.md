---
date: 2026-10-14
session: afternoon
participants: [angelo, claude]
status: live
---

# Session — 2026-10-14 — svc-extensions: productos variables de Woo llegan a Vio con precio 0

## Goal
Reporte de Alan en QA: un producto variable de WooCommerce llega a Vio con `price_amount = 0`
(las variantes sí traen su precio; 301 productos WOOCOMMERCE y 10 MAGENTO así en QA;
ejemplo: producto 411959, cuenta 1331, variantes de 110 y 120 NOK). Rama común
`fix/precio-desde-variantes`. Angelo aprobó el arreglo el 14/10.

## Done
- **extensions no es el camino del 0** (verificado en `origin/develop` 61e4a27):
  - `bulkImportProducts` (`/woo/import-products`) usa `sale_price || regular_price || price`
    (`src/modules/woo/providers/woo.service.ts:2234-2235`). En un variable, `price` es el
    mínimo activo de las variaciones, así que no queda en 0.
  - El import por CSV cae a `variants[0].price` (`src/modules/woo/utils/index.ts:49-54`).
  - El webhook de Woo solo procesa `order.updated` (`woo.service.ts:900-910`).
  - Otro agente confirmó el camino real: plugin WordPress **Vio Sync for WooCommerce**
    (`vio-woocommerce-sync`) → `POST /api/products/create-sqs` en base-api → bus → products-ms.
    Updates: `PUT /api/products/{id}` con un diff.
- **Causa** (`vio-woocommerce-sync`, `includes/class-product-mapper.php` en `origin/main` 0e317ad):
  - `to_dto()` (`:63-70`) arma `price.amount` con el `get_regular_price()`/`get_sale_price()`
    del padre. En un variable vienen vacíos y llegan a Vio como 0. Las variaciones se mapean
    bien (`:213-224`).
  - `diff()` → `main_price_changed()` (`:368-372`): `isset('')` es true, así que el update
    manda `amount: ''` y vuelve a poner en 0 un producto que tenga precio.
- **Propuesta lista como patch** (no aplicada en el repo del plugin, ver Decisions):
  - `to_dto()`: si `is_type('variable')`, `amount` y `compareAt` salen de la variación más
    barata (`price_from_variants()` nuevo), mapeados igual que las variantes (amount = precio
    activo, compareAt = regular si está en oferta). Los simples no cambian.
  - `main_price_changed()`: un `amount` no numérico nunca cuenta como cambio.
  - `tests/ProductMapperTest.php`: test de integración con objetos reales de WC (variable
    110/120 → 110; en oferta → 90/120; simple sin cambios; diff).
  - Verificado con un arnés aislado en PHP 8.3 (contenedor `wordpress:7.1.0-php8.3-apache`,
    `--network none`): `origin/main` reproduce el bug (3 FAIL), con el patch pasa 10/10.
    `php -l` limpio. El `ProductMapperTest.php` **no se corrió** porque necesita el wp-env con
    WooCommerce.
  - `git apply --check` limpio sobre `origin/main` 0e317ad.

## Decisions
- **svc-extensions no escribe en `vio-woocommerce-sync`**. `CONVENTIONS.md` § Lane: un agente
  solo toca su repo y le reporta el cambio al orquestador. Se entregó el patch
  (`git format-patch`) para que lo aplique el orquestador o Angelo con `git am`.
- El precio del producto variable sale del precio **activo** más bajo, con el compareAt de esa
  misma variación. No se usa el "mínimo de los regulares". Motivo: coherencia con cómo el mapper
  arma cada variante y con la red de seguridad de products-ms (mínimo de las variantes). Sin
  ofertas, las dos reglas dan lo mismo (110/120 → 110).
- No se tocó nada en extensions. El worktree y la rama `fix/precio-desde-variantes` de
  extensions se crearon vacíos y se borraron.

## Blockers / open questions
- Hay que confirmar con products-ms que su regla (precio = mínimo de las variantes) usa el
  mismo criterio (`price.amount` activo). Si no, el plugin y products-ms pueden discrepar
  cuando hay ofertas.
- Los 301 productos ya en 0 en QA solo se arreglan cuando el merchant vuelve a guardar en Woo
  (el diff manda 0 → 110). Hace falta la regla o un backfill en products-ms.
- No verificado: si editar solo el precio de una variación (AJAX del panel Variations) dispara
  `woocommerce_update_product` del padre, que es el hook del auto-sync.
- El fix llega a las tiendas solo con un release del plugin en wp.org
  (`docs/playbooks/wordpress-org-plugin-release.md`). No se hizo.
- En extensions (fuera del camino de QA): `bulkImportProducts` usa `sale_price` aunque la oferta
  esté programada a futuro y no mapea `compareAt`; el CSV usa `variants[0]` y no el mínimo.

## Next session
- El orquestador o Angelo aplican el patch en `vio-woocommerce-sync` (rama
  `fix/precio-desde-variantes` desde `origin/main`; ese repo no tiene `develop`) y corren
  `phpunit` en el wp-env.

> [claude, 2026-10-14] Hecho: el patch fue a vio-woocommerce-sync #1, se probó en wp-env (WordPress 7.1.3, 20/20) y se publicó en wp.org como **1.0.1**. Ver [el journal del release](./2026-10-14-woo-sync-release-1-0-1.md). Sigue abierto el punto del AJAX del panel Variations (en el handoff, pendiente 12).
