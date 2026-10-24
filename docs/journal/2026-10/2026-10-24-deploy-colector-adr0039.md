## Colector de analytics a `2343c7b` (ADR-0039) en staging y prod — Miguel

- Quién: Miguel (me lo pidió claude en el handoff de coordinación; OK de Angelo «ok desplegamos»)
- Dónde: VM staging `129.151.196.99` y VM prod `82.70.54.151`, servicio `vio-analytics`;
  ClickHouse `vio_staging` y `vio_production` en `analytics.vio.live`
- Cuándo: 2026-10-24, 12:18–12:22 UTC
- Contexto: [ADR-0039](../decisions/0039-la-compra-la-confirma-commerce.md) — una orden pagada cuenta
  como compra aunque el navegador no mande `purchase` (el caso de la 4128). Va **antes** que la
  SDK 0.29.0 porque sin esto el colector rechaza `add_payment_info`.

### Hecho

Por tarball, que es como se despliega esto (`/opt/vio-analytics` no es un repo git):
clon limpio en `2343c7ba0534ca8d3912f0f71a072089955a5704` (merge del PR
[vio-analytics#33](https://github.com/vio-live/vio-analytics/pull/33)), `git archive` → 79 entradas,
`scp`, respaldo, `tar -xzf`, `pnpm install --prod=false`, `pnpm build`, `systemctl restart`.

| | staging | prod |
|---|---|---|
| respaldo | `~/vio-analytics-backup-20261024-121823.tgz` | `~/vio-analytics-backup-20261024-121932.tgz` |
| md5 `.env` antes/después | `de1d96e7…` sin cambio | `42c0965c…` sin cambio |
| md5 `dist/index.js` | `50a6c016…` → `bc0119d7…` | `50a6c016…` → `bc0119d7…` |

**Los dos bundles salen con el mismo md5 (`bc0119d7527f67797fad9c679cc3ebc2`)**: lo que corre en
prod es byte a byte lo que corre en staging.

Verificado en las dos: `/health` con `version 2343c7ba…`, `ready: true`, `lastError: null`,
Mixpanel `simplified`. Esquema al arrancar: `items.sponsor_id Array(UInt32)` creada en
`vio_staging` y en `vio_production`.

### Efecto medido en prod, inmediato

- **Panel de la surface de Aller (surface 1):** `purchases` 2 → **3**, `gmv` 0 → **599**,
  `purchases_net` **1**, `units` **1**, `begin_checkouts` **1**. La 4128 ya cuenta como compra.
  `charged 776` / `charged_gross 2673` / `orders_paid 3` / `orders_unattributed 1` sin cambio.
- **Panel de la marca (Careless 1327):** aparecen los KPIs nuevos `charged`, `chargedGross`,
  `ordersPaid`, `ordersUnattributed` — **los cuatro a 0**. Es lo esperado y el ADR lo dice: los
  `order_paid` ya guardados llevan `sponsor_id = 0` y no se corrigen reenviando (el `event_id` es
  determinista). El panel de la marca solo verá órdenes pagadas **después** de que
  [orders#45](https://github.com/vio-live/vio-orders-microservice/pull/45) llegue a prod; hoy está
  en `develop` (QA).

### Lo que hay que mirar: la lectura se volvió 4x más lenta en prod

`commerce-stats/overview?sponsor_id=1327`, tres tomas desde fuera:

- antes: 0,445 s · 0,213 s · 0,223 s
- después: 0,904 s · 0,796 s · 0,892 s

claude avisó de ~0,4 → ~0,66 s con 2M eventos. **Prod tiene tres órdenes y un puñado de eventos**, y
aun así pasa de ~0,22 s a ~0,85 s. Sub-segundo, así que no bloquea el lunes, pero el salto no es por
volumen: es coste fijo de las consultas nuevas. Lo dejo apuntado para claude.

- Pendiente: (1) orders#45 a prod — no lo toco yo, prod está congelada y el go-live lo lleva claude;
  (2) la SDK 0.29.0, que ya puede ir porque el colector acepta `add_payment_info`.

### Medido: la lentitud NO es la cantidad de datos

Angelo preguntó si el salto venía del volumen de analytics. No.

- `vio_production.events`: **81 filas, 10,75 KiB** → `overview` 0,80–0,90 s
- `vio_staging.events`: **1.816 filas** (22x más) → `overview` 0,92–1,17 s
- `/health` (no toca ClickHouse) → 0,13 s

22 veces más datos sólo añade ~0,15 s. El resto es **coste fijo por petición**:
`/v1/commerce-stats/overview` pasó de **2 consultas a ClickHouse a 4**
(`curRows`, `prevRows` + los dos nuevos `tillCur`/`tillPrev`, `commerce-stats.ts`), y las dos
viejas ahora leen de `eventsWithPaidOrders(...)` en vez de la tabla pelada, con su
`compensationJoin` encima.

Con los datos de prod eso son ~0,2 s por consulta contra `analytics.vio.live`, que está en otra
máquina. Crecerá con el volumen, pero hoy el suelo es la ida y vuelta, no el escaneo.
