## Colector de analytics a c2fc1614 (#29 fuente del tráfico + #30 is_server) en staging y producción — Miguel

- Quién: Miguel, pedido por Claude (sesión de analytics).
- Dónde: VMs `129.151.196.99` (staging) y `82.70.54.151` (producción), `/opt/vio-analytics`.
  **ClickHouse sin tocar** (ningún fichero de migración en los dos PRs).
- Cuándo: 22/10/2026, 20:30–20:32 Oslo.

### Lo que verifiqué antes de desplegar

- #29 (`3ac4dc79`) y #30 (`c2fc1614`) mergeados; `main` está en **c2fc1614**.
- Ficheros tocados: #29 → `src/rows.ts` + test. #30 → `.env.example`, `src/config.ts`,
  `src/contract/analytics-schema.ts`, `src/rows.ts`, `src/sinks/mixpanel.ts`, test.
  **Nada de ClickHouse, ninguna migración** — la afirmación se sostiene.
- El cambio del contrato es **aditivo**: solo exporta `isServerEvent`. No añade campo obligatorio,
  así que no puede rechazar eventos que antes entraban.
- `MIXPANEL_IDENTITY: z.enum(["off","simplified"]).default("off")` en `src/config.ts`: el defecto es
  `off`, no hace falta tocar ninguna variable.

### Corrección al procedimiento: en las VMs NO hay clon de git

La receta decía `cd /opt/vio-analytics && git pull && pnpm install …`. **En ninguna de las dos VMs
existe `/opt/vio-analytics/.git`.** El despliegue se ha venido haciendo por **tarball**: en el home
siguen los de las veces anteriores (`vio-analytics-67501a2.tar.gz`, `vio-analytics-e288ce2.tar.gz`).
Un `git pull` ahí habría dado `fatal: not a git repository`.

Hice el equivalente, con la misma forma que los anteriores (73 entradas, estructura plana):

1. Clon limpio y `git archive --format=tar.gz HEAD` en **c2fc1614**.
2. En cada VM: respaldo (`~/vio-analytics-backup-20261022-183059.tgz` staging,
   `…-183153.tgz` prod; ~428 KB, sin `node_modules` ni `dist`).
3. `tar -xzf` sobre `/opt/vio-analytics`, `pnpm install --prod=false`, `pnpm build`,
   `sudo systemctl restart vio-analytics`.

### Verificado

- **`.env` intacto en las dos**: mismo md5 antes y después (`c8419f3d` staging, `210ae64d` prod).
  `MIXPANEL_IDENTITY` **no aparece** en ninguno de los dos: corren con el defecto `off`.
- El código nuevo está en el `dist` que se ejecuta, no solo en el fuente: `referring_domain` e
  `is_server` presentes en `dist/index.js`.
- **El bundle es byte a byte el mismo en las dos VMs**: md5 `127501d715f7c6f476ee65f9460c0629`.
- **Staging con prueba de vida real**: `uptime_s 19` tras el reinicio y, en el minuto siguiente,
  **2 eventos entrados y 2 reenviados a Mixpanel** (`inserted 2`, `forwarded 2`), `lastError null`,
  dos POST `/v1/events` con 202 en el log. Eso es lo que prueba que la versión nueva ingiere y
  reenvía.
- **Producción**: `status ok`, `uptime_s 20`, `lastError null`, y en el arranque
  `[sink:mixpanel] enabled` + `[clickhouse] schema ready (vio_production.events)`.
  `ActiveEnterTimestamp` 18:32:04 UTC.

### Lo que NO hice, a propósito

Producción sigue con `inserted: 0` porque **no tiene tráfico todavía**: no hay prueba de vida propia.
**No inyecté un evento de prueba** para no ensuciar el criterio D1/D2 del go-live, que es justamente
«el `inserted` del colector dejando de ser 0» el lunes. La garantía que sí tengo es que el binario
que corre en prod es el mismo byte a byte que el que acabo de ver ingerir y reenviar en staging.
