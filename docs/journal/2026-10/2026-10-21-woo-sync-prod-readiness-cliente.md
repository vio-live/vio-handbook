---
date: 2026-10-21
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-10-21 — Vio Sync for WooCommerce: prod-readiness antes de que un cliente instale

## Goal
Angelo: un cliente va a instalar el plugin de Woo en **prod** hoy. Ponerse al día tras ~1 mes,
revisar qué cambió en el plugin y **probar que prod está en orden** para el install (foco en el
endpoint de currencies, que fue flaky en el pasado).

## Done
- **Catch-up del plugin (1.0.0 → 1.0.2, publicado en wp.org el 14/10):**
  - **1.0.1** — productos variables mandan el precio de su variación más barata
    (`Product_Mapper::price_from_variants()`; antes el padre sin precio propio caía como 0 en Vio).
    Ver [release 1.0.1/1.0.2](2026-10-14-woo-sync-release-1-0-1.md) y
    [ADR-0032](../../decisions/0032-precio-de-productos-con-variantes.md).
  - **1.0.2** — una variación editada desde el admin sincroniza su dato final: el auto-sync se
    **encola y corre una vez en `shutdown`** (prio 20, tras el sync diferido de WooCommerce), sin candado.
  - El diff `1.0.0..1.0.2` toca **solo** `class-product-mapper.php` + `class-products-table.php` (+ tests).
    Verificado que `class-api-client.php`, `class-store-status.php`, `class-ajax.php` y
    `class-config-page.php` **no cambiaron** → el flujo **connect / currency / auth / OAuth-callback /
    webhook es idéntico** al verificado en septiembre.
  - wp.org publica **1.0.2** = `vio-live/vio-woocommerce-sync` `main` @ `0cc6874` (el código revisado).
- **Prueba de prod en vivo** (`api-ecom.vio.live` → `135.116.206.152`, cluster `vio-commerce-prod-sc`):
  - `/api/currencies` ×6 → **6/6 HTTP 200**, estable (~0.1–0.46 s), sin cold-start raro; **11 monedas
    habilitadas** (EUR, USD, NOK, DKK, SEK, GBP, CAD, CZK, HUF, PLN, RON), shape correcto
    (`currency_code` + `enabled`). Endpoint **público** (no requiere key) → el dropdown del cliente
    carga siempre. Resuelta la vieja flakiness (`000`/`417`) del cluster.
  - Connect-flow sin auth → **401** en `/catalog/users/me`, `PUT /woo/config`, `/api/ecom-user`,
    `/api/product/validate-synced`, `/api/products/{id}` (arriba + auth aplicando).
  - Callback OAuth `POST /woo/auth/callback-supplier/` → **ruta viva** (500 solo por mi body vacío;
    el GET da 404, normal: es POST-only, lo llama WooCommerce con el payload completo).

## Decisions / notas para el install
- **Veredicto: listo para que el cliente instale en prod.** El código publicado es el revisado y el
  flujo que usa el cliente no cambió.
- **Checklist del cliente:** moneda de la tienda entre las 11; tienda en **HTTPS**; su firewall no
  debe bloquear el OAuth ni la salida a `api-ecom.vio.live`; Environment = **Production** (default) + su key.
- **Backfill `products #23` (ADR-0032):** solo aplica a tiendas que ya habían sincronizado en 0 con
  la 1.0.0 — **no** a un install fresco (1.0.2 manda el precio correcto desde el primer sync).

## Blockers / riesgo operativo
- **Prod se apagaba por costo.** `vio-commerce-prod-sc` estuvo **apagado del 05 al 16/10** (sin
  clientes reales). Miguel lo **encendió el 16/10** y removió el flag `PROD_DEBE_ESTAR_APAGADA` + el
  cron guardián, así que **no se apaga solo** — pero cuesta **~23 USD/día** y **Angelo decide el
  apagado** (ver [prod encendida y verificada](2026-10-16-prod-encendida-verificada.md)). **No apagar
  prod mientras el cliente esté conectado.** Hoy está arriba y verificada.

## Next session
- El cliente instala 1.0.2 desde wp.org y conecta en prod; confirmar la moneda de su tienda.
- Si el cliente traía productos sincronizados en 0 bajo 1.0.0, correr el backfill `products #23` en
  prod (orden en ADR-0032) — no aplica a un install fresco.
