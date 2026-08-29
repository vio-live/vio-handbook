# 2026-08-29 — Review de la entrega de Alan: Kustom (tarjeta 7BeicFft)

Pedido de Angelo: revisar lo entregado **sin dar nada por sentado**. Cada
claim verificado contra git y contra staging en vivo.

## Claims vs evidencia

| claim de Alan | veredicto | evidencia |
|---|---|---|
| shopcart/base-api/graphql/api-micro → develop | ✅ | `merge-base --is-ancestor` de mis tips en `origin/develop` (05c711f4/55fe8e58/e784149d/332e8ab9) |
| payment-processors `klarna-per-seller-keys` → develop | ✅ | ídem (2a869513) |
| package-database mergeado | ✅ | columna `kustom` en develop + **migración propia de Alan** `1787935395366-kustom-channel-toggle` (f85716d) — schema por migración, no synchronize |
| kernel 1.0.242 + bump en micros | ✅ | kernel publicó 1.0.242 (después 1.0.243 con `content_hash`, de otro trabajo); shopcart/api/payment-processors pinnean `1.0.242`; base-api no usa `@reachu/database` (0 deps) — consistente |
| re-deploy | ✅ runtime probado en 3 de 5 | **graphql**: `CreatePaymentKustom` y `GetKustomOrder` responden en `graph-ql-staging` (piden args). **api-micro + DB**: `GetAvailablePaymentMethods` responde → la columna existe en MySQL (un `leftJoinAndSelect` con columna faltante daría 500) → la migración corrió. **base-api**: `POST api-ecom-staging.vio.live/kustom/webhooks?order_id=fake` → **200** (control legacy klarna → 400). **shopcart/payment-processors**: mergeados y pinneados; runtime no distinguible desde afuera (los errores `[object Object]` enmascaran; payment-processors es interno) — se confirma con la primera orden real |
| "Cambios en backend para activar Kustom" | ✅ y es la **Fase B completa** | `8ac762c` en api-micro: persiste `data.kustom`, lo lee del raw, lo agrega al sync remoto, lo expone en el listado de canales, y **endurece la oferta a `settings.kustom == true && seller-tiene-key`** — exactamente los pasos de la tarjeta. Bonus: arregló el typo pre-existente `stripePaymentInten` (el update de Stripe Intent nunca persistía) |
| test asignar credenciales | ⚪ plausible, no verificable | sin acceso a la MySQL de commerce staging desde acá |
| web-sdk PENDING | ✅ honesto | `6d67209` no está en `main` ni en `feat/external-content-attribution` |
| sin API key real → E2E pending | ✅ | consistente con todo lo anterior |

## Detalles señalados (menores)

1. El endurecimiento de Fase B aplica en la rama con settings; la rama
   default (canal SIN fila de settings) sigue ofreciendo Kustom por key sola
   — consistente con esa rama, que ya ofrece todo incondicionalmente.
2. El front ya estaba listo de antes (Angelo: `bc171b0` iconos + switch,
   `818da7a`) — Fase B no requiere nada más del webapp.
3. **Feedback de Alan aceptado**: en la tarjeta puse el kernel al final del
   orden de merge y debe ir SIEMPRE primero (cambio de modelo ⇒ nueva
   versión del package antes que los consumidores). Lección para próximas
   tarjetas multi-repo.

## Estado real post-entrega

Todo el backend de Kustom está **mergeado y vivo en staging**, con Fase B
incluida. Bloqueantes restantes: (1) key `kco_test_` real del cliente,
(2) prender el toggle `kustom` del canal piloto (default false), (3) E2E,
(4) merge + publish del web-sdk (`feature/kustom-payment`), (5) repo del
plugin Vev.
