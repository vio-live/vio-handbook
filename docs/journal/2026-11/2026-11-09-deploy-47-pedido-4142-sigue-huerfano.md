## Deploy colector #47 (`39c1edc`) a staging y prod — pedido 4142 sigue huérfano — Miguel
- Quién: Miguel, pedido por claude en la [coordinación](../../handoff/2026-10-19-coordinacion-claude-miguel.md)
- Dónde: vio-analytics, VMs Oracle staging (129.151.196.99) y prod (82.70.54.151)
- Cuándo: 2026-11-09, ~09:50-10:00 UTC
- Contexto: PR #47 (mergeado 09:38 UTC, CI verde) arregla que el `purchase` vacío de la vuelta de Vipps
  contara como fila propia del pedido en las lecturas agrupadas por artículo/slot. Deploy pedido por claude,
  mismo procedimiento que los dos anteriores (staging primero, prod después).

### Hecho
- Verificado antes de tocar nada: `gh pr view 47` → `MERGED`, `gh pr checks 47` → verde, `main` en `39c1edc`.
- Staging: backup `tar` de `/opt/vio-analytics` completo, `.env` preservado aparte, `git archive` de `39c1edc`
  extraído encima, `pnpm install --prod=false && pnpm build`, `systemctl restart`. `.env` md5 idéntico antes/después
  (`de1d96e...`). `/health` → `version 39c1edc...`, `clickhouse.lastError:null`. `journalctl` sin líneas de
  nivel warn/error en los 2 minutos tras el restart.
- Prod: mismo procedimiento. `.env` md5 idéntico (`5d30e8166...`). `/health` → `version 39c1edc...`. Sin
  warn/error en journalctl.
- Lectura de comprobación en prod, la que pedía el journal del 9/11 (`campaigns/4/content` y `/slots`,
  Faves 5/11): **no da lo esperado**.

### Lo que se ve
`campaigns/4/content?client_app_id=1&from=2026-11-05&to=2026-11-05`: dos filas, no una.
- `content_id 192`: 7 pedidos, gmv 2.220 (igual que antes del deploy).
- Fila huérfana (`content_id` = la URL completa): 1 pedido, gmv **726** (antes del deploy era 3 pedidos / kr 0).

`campaigns/4/slots` (mismo rango): `article-192-block-10` y `article-192-block-13` aparecen **dos veces** cada
uno — una vez con `content_id 192` (correcta, con su producto y su valor), otra vez huérfana con el mismo
producto y el mismo valor. Entre las dos filas de cada slot, el pedido 4142 (726 NOK, dos líneas: 421301/389 y
421264/337) queda repartido correctamente por producto, pero la mitad de las filas no tiene artículo.

Control: `campaigns/4/funnel` y `commerce-stats/overview` iguales al 6/11 (8 pedidos, 2.946 NOK, 403 sesiones) —
sin regresión en los números agregados, solo en el desglose por artículo/slot.

### Progreso real del fix
Las dos filas de **kr 0** que había antes (duplicados del eco sin dinero, el punto 1 del PR) **desaparecieron**.
Eso sí funciona: el eco vacío ya no cuenta como fila del pedido cuando el pedido tiene su `order_paid`. Lo que
no funciona es el punto 2+3 (enlazar la sesión y heredar el `content_id`) para el pedido 4142 en concreto.

### Por qué — datos crudos de ClickHouse (`vio_production.events`, campaign_id 4, 2026-11-05)

Pedidos `order_paid` del día (9 filas, el funnel de la campaña solo cuenta 8 — el 4133/416 no es de esta
campaña): 4134/208, 4135/149, 4136/104, 4137/337, 4138/599, 4139/299, 4141/524, **4142/726** (dos líneas:
421301/389 + 421264/337). 4134..4141 suman exactamente 2.220 = la fila `content_id 192`. El 4142 es el que
queda fuera.

La sesión del pedido 4142 (`f5646557-66ff-4417-a399-ae40256ff0fd`) hizo **dos compras seguidas**:

| evento | order_id | checkout_id | content_id | valor |
|---|---|---|---|---|
| add_payment_info | — | `d9257c1b-…` | 192 | 524 |
| order_paid | 4141 | `d9257c1b-…` | — | 524 |
| purchase (real) | 4141 | `d9257c1b-…` | 192 | 524 |
| add_payment_info | — | `d7b1df16-…` | 192 | 337 |
| order_paid | **4142** | **`72d46429-…`** | — | 726 |
| purchase (eco vacío) | 4142 | `72d46429-…` | (URL, sin id) | 0 |

El `checkout_id` del `add_payment_info` de la segunda compra (`d7b1df16-…`) **no es** el `checkout_id` que
terminan llevando el `order_paid` y el eco de esa misma compra (`72d46429-…`). El join de `sessionLinkSql` en
`src/stats-paid-orders.ts` enlaza por `checkout_id` exacto (`l.l_checkout = p.checkout_id`): para
`72d46429-…` el único evento de ese grupo es el eco (sin `content_id`), no hay ningún `add_payment_info` con
ese mismo `checkout_id`. De ahí en adelante no seguí la query (el fallback por URL/sesión, `a_url`/`a_session`,
debería en teoría encontrar el `content_id 192` de los demás eventos de la sesión con la misma URL — no sé por
qué no lo hace, o si el problema está en otro punto). Dejo los datos crudos, no un diagnóstico del SQL.

### Pendiente
Deploy queda hecho y verificado como se pidió; el hallazgo (checkout_id distinto entre `add_payment_info` y
`order_paid`/eco dentro de la misma sesión, en compras consecutivas) se lo paso a claude en la coordinación.
No reintenté nada ni toqué código — es su fix.
