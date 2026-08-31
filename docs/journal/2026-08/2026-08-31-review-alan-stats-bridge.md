# 2026-08-31 — Review contra código: ¿hizo Alan el puente de stats?

Review pedido por Angelo. Procedimiento: [playbook](../../playbooks/review-kotlin-ios-parity.md)
(adaptado: el scope acá es commerce/base-api, no Kotlin/TV) + la regla de
[verificar contra código](../../lessons/verify-alan-claims-against-code.md).

## Track A — Trello

- **Tarjeta del puente de stats** (`[backend][base-api] Puente de stats para
  el dashboard de Commerce`, creada 26-ago, https://trello.com/c/wyCxGARp):
  sigue en **To do**, asignada a Alan, **cero actividad suya** en 5 días
  (el único evento es el `pos` de creación). Ni comentario ni movimiento.
- **Discrepancia inversa**: la tarjeta "Feed de producto: el sync no respeta
  la cadencia y empuja el catálogo entero" sigue en **To do**, pero el
  código YA existe (products-ms `4782d8f`, 29-ago). Candidata a mover.
- Doing: Kustom (coherente con `8ac762c`), Vio Sync App Store.

## Track B — Lo que Alan SÍ hizo, verificado en código

| Commit | Repo | Qué es en realidad | Tarjeta |
|---|---|---|---|
| `0803c6e` + `4d281e1` (26-ago) | base-api | `feedController.ts` (+127), `productService.ts` (+93), router y cron — el feed gestionado completo | ✅ "Feed de producto: conexión gestionada" (Done, correcto) |
| `e6eda9c` (29-ago) | base-api | Lock distribuido REAL en el cron de re-arme: `SET LOCK:REARM_OVERDUE_FEEDS NX EX 3600` | parte de la cadencia |
| `4782d8f` (29-ago) | products-ms | Diffing por `contentHash` (`knownHashes`) + `scheduleNextFeedMessage` + contadores published/skipped | "el sync no respeta la cadencia…" — **card sin mover** |
| `8ac762c` (28-ago) | api-ms | fix kustom to update | Kustom (Doing, coherente) |
| varios (31-ago) | 5 repos | merges de develop + bump `@reachu` 1.0.241→1.0.243 | mantenimiento |

**Calidad**: el fix de cadencia ataca de verdad las dos mitades del problema
(no re-publica lo que no cambió; re-arma el próximo mensaje). El lock es el
patrón correcto para un cron diario.

Dos observaciones técnicas (menores, no bloquean):
1. El lock **falla abierto**: si Redis no responde, el `catch` loguea y el
   job **sigue ejecutando** — dos pods podrían solaparse justo cuando Redis
   está caído. Defendible (prefiere ejecutar a no ejecutar), pero conviene
   que sea una decisión consciente.
2. `forwardRef` circular entre `ProductService` ↔ `ProductBusConsumerService`
   — funciona, pero es olor de diseño para revisar si crece.

## Track C — El puente de stats: CERO código

Verificado, no asumido:
- `grep -liE "ANALYTICS_STATS_URL|commerce-stats|x-internal-token"` sobre
  **todas las ramas remotas** de base-api → sin coincidencias.
- Ninguna rama nueva suya desde el 26-ago (las recientes son de Angelo:
  feed-file-upload, walley, qliro, kustom, payment-credentials-hardening).
- Sus commits del período son feed/pagos/versiones — nada adyacente al puente.

**Lectura**: no es abandono, es prioridad. Estuvo metido en feed + pagos +
submit de Vio Sync. La tarjeta está intacta y sin acuse de recibo.

## Estado del lado nuestro (para cuando la tome)

`/v1/commerce-stats/*` está **vivo en dev/staging/prod** con las formas del
contrato congelado del webapp — el túnel tiene contra qué probar desde el
minuto uno. Falta que Angelo le pase `ANALYTICS_STATS_URL` +
`ANALYTICS_INTERNAL_TOKEN` por entorno (fuera de Trello).

## Otros frentes (fuera de scope pero chequeados)

- `AndroidTV-Vio` local sigue en `fc41d5b` (30-abr) — sin novedad desde el
  anchor. Los clones `/tmp/VioKotlinSDK`, `/tmp/VioKotlinDemo` y
  `/tmp/AndroidTV-Vio-Demo` **ya no existen** (se limpió `/tmp`): re-clonar
  con `gh repo clone` antes del próximo review de esos tracks.
- `vio-sync`: solo dependabot desde el 28-ago (último humano `aab3116`).
