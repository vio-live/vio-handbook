## Las dos vias de acceso a la data de produccion para un agente: re-verificadas — Miguel

- Quien: Miguel (Angelo pregunta el 04/11 11:25 "algo que hicimos sobre darle acceso a la data a un agente")
- Donde: ClickHouse de prod `analytics.vio.live` (`129.151.210.107`, `vio-clickhouse-1`) y colector
  de prod `events.vio.live` (VM `82.70.54.151`)
- Cuando: 2026-11-04, 11:30 UTC
- Contexto: se montaron el 28/10 para que claude leyera datos de prod desde su laptop sin alcanzar
  las DB. La nota de `TOOLS.md` decia que una de las dos estaba ROTA. Lo comprobe antes de contestar.

### Las dos vias, y para que sirve cada una

1. **`claude_ro`, usuario de ClickHouse (SQL crudo).** Para consultas libres sobre `vio_production`.
2. **`ANALYTICS_READ_TOKEN`, token HTTP del colector.** Para los endpoints de stats ya agregados
   (embudos, bundle del operador, layout-funnel), sin escribir SQL.

Las dos de **solo lectura** y las dos verificadas hoy.

### Verificacion (en vivo, no de memoria)

`claude_ro`:
- `SELECT count() FROM vio_production.events` -> **22.976**, 200
- `SHOW GRANTS` -> `GRANT SELECT ON vio_production.* TO claude_ro`
- `CREATE TABLE vio_production.zz_test` -> **497 ACCESS_DENIED**. No escribe.
- `vio_staging` -> ACCESS_DENIED. Solo ve produccion.

`ANALYTICS_READ_TOKEN` (cabecera `x-internal-token`, host `https://events.vio.live`):
- **200**: `/v1/stats/overview`, `/v1/stats/content`, `/v1/stats/operator/bundle?range=7d`,
  `/v1/stats/surface/layout-funnel`, `/v1/stats/campaigns/<id>/funnel`
- **404**: `/v1/stats` y `/v1/stats/commerce` pelados. **Las rutas estan anidadas**: un 404 ahi no
  significa que el token no valga. Es el gotcha que mas tiempo hace perder.
- **401** sin cabecera. **401 `missing api key`** en `POST /v1/events` con el token de lectura:
  el minimo privilegio del 16/10 sigue intacto, no puede inyectar eventos.

Colector en `47d9cb7c`, `ready:true`, `lastError: null`, Mixpanel `simplified` y reenviando.

### Correccion de documentacion

`TOOLS.md` tenia la seccion **"claude_ro: ROTO, pendiente de reiniciar el contenedor"**. Es **falsa**:
la correccion estaba en el journal del 29/10 pero nunca bajo a `TOOLS.md`, que es el fichero que leo
primero. Reescrita con el estado verificado, el porque del falso diagnostico (el bind mount del
compose no esta activo **y** el usuario funciona, porque entro por `docker cp` y ClickHouse recarga
`users.d` en caliente) y la regla: **un `SELECT` con la credencial cierra ese diagnostico en diez
segundos**. Anadida tambien la seccion del `ANALYTICS_READ_TOKEN` con las rutas que de verdad
responden.

Las credenciales de las dos vias viven en **`/Users/angelosepulveda/.vio/analytics-prod.env`** de la
laptop de Angelo (chmod 600). No estan en git.

- Pendiente: Angelo dira para que agente es. Si es un agente **distinto** de claude, lo correcto es
  **usuario y token nuevos**, no reutilizar los de claude: asi se puede revocar uno sin cegar al otro
  y el log de ClickHouse distingue quien consulto que. Montarlo son minutos.
