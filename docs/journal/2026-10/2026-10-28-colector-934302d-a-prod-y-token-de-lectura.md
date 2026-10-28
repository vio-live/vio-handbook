# Colector `934302d` a staging y prod, token de solo lectura para claude, y variables de shopcart

- Quién: Miguel. Encargo de claude en el canal (`docs/handoff/2026-10-19-coordinacion-claude-miguel.md`),
  con el OK de Angelo por escrito ese mismo día y confirmado en el chat («lo llevo, borralo, pero junto contigo»).
- Dónde: VMs de analytics (staging `129.151.196.99`, prod `82.70.54.151`), cluster `vio-commerce-prod-sc`
  (Secret `env-sc-shopcart`), blob `containerqasc/env-file-microservices`.
- Cuándo: 2026-10-28, 11:40–12:00 UTC.

## El 2,4x de ayer no era de este arreglo: son +18 %

Ayer frené el #36 con una medida de 2,4x. Hoy, con el arreglo (`934302d`), **medí las dos versiones en el
mismo rato**, porque la comparación de ayer **no era replicable**: ni el handoff ni el journal apuntaron el
`client_app_id`, así que no había forma de repetir el experimento. Puse `7f45471`, medí; puse `934302d`, medí.
Misma VM, `client_app_id=14`, `sponsor_id=1340`, contra `localhost:5100` (sin TLS ni red), 6 pasadas por ruta.

Medianas:

- `surface/overview`: 0,805 s → 0,956 s (+19 %)
- `stats/content`: 0,472 s → 0,550 s (+17 %)
- `commerce-stats/overview`: 0,731 s → 0,866 s (+18 %)

Mi baseline de hoy coincide con la que citaba claude (0,86 / 0,47 / 0,74), así que el método es comparable, y
su +14 % local queda confirmado. **Lección de método: una medida sin sus parámetros apuntados no es una
medida reutilizable** — la de ayer me sirvió para frenar, pero no para comparar hoy.

## Desplegado en las dos, con el mismo bundle

`version 934302da4f09…` en staging y en prod, `ready true`, `lastError null`, mixpanel `simplified`, y
**`dist/index.js` con el mismo md5 en las dos** (`3caea8ff8b8be43ef139594630f4b21f`): lo que corre en prod es
byte a byte lo que probé en staging.

`.env` intacto en staging. En prod cambió a propósito (`42c0965c…` → `5d30e816…`): es la línea del token nuevo.
Respaldos: `.env.backup-pre-readtoken-claude-20261028-114533` y `~/vio-analytics-backup-20261028-114533-pre934302d.tgz`
(y en staging `~/vio-analytics-backup-20261028-114134-pre934302d.tgz`).

### Gotcha: `pnpm install` se cuelga en la VM de prod

La VM de prod tiene **954 MB de RAM** y ahí `pnpm install --prod=false` se quedó **10 minutos al 1 % de CPU**
sin avanzar (en staging va fino). Lo maté y corrí **solo `pnpm build`**, después de comprobar que entre
`7f45471` y `934302d` **no cambia ninguna dependencia**:
`git diff --stat 7f45471 934302d -- package.json pnpm-lock.yaml` sale vacío. Si no hay cambio de dependencias,
el install es opcional y el build con el `node_modules` que ya está es suficiente.

### La ingesta no queda probada hoy, y eso está bien

Tras el reinicio (11:52 UTC) `inserted` está a 0 porque **no ha entrado tráfico real**. El último evento es de
las **11:30:09 UTC, 22 minutos ANTES del reinicio**: el hueco empezó sin mí. ClickHouse de prod: **16.027 filas**.
No inyecté un evento de prueba para cerrar el hueco (criterio D2). Si por la tarde `inserted` sigue a 0 con
visitas reales, entonces sí es un fallo.

## Token de SOLO LECTURA para claude (prod)

Generado con `openssl rand -hex 32` y añadido a `INTERNAL_READ_TOKENS` del colector de prod (ahora hay 2; el de
base-api intacto, y rotar uno no toca al otro). **No le doy el full**: ese inyecta eventos.

- Vive en el portátil de Angelo: `~/.vio/analytics-prod.env`, permisos 600, variable `ANALYTICS_READ_TOKEN`.
  **El valor no está en ningún sitio de git.**
- Comprobado contra prod: lee (`/v1/stats/surface/overview` y `/v1/commerce-stats/overview`, 200) y **no borra**
  (`/v1/internal/events/delete-browsers` → 403, con el log del colector marcando `token:"read"`).
- Que no escribe es por código (`canWrite` de `internal-auth.ts` exige igualdad con el full), no por prueba:
  un POST válido que pasara **inyectaría un evento en prod**. Un POST vacío da 400 por schema, antes de la auth,
  así que ese 400 **no prueba nada** sobre permisos.
- Cabecera `x-internal-token`, no `Authorization: Bearer`.

**Pendiente de Angelo:** el usuario de ClickHouse de solo lectura que pidió claude. Es un permiso nuevo sobre la
base de prod; no lo creo por mi cuenta.

## Variables de analytics en shopcart

- **Prod:** `ANALYTICS_EVENTS_URL` y `ANALYTICS_INTERNAL_TOKEN` copiadas de `env-sc-orders` a `env-sc-shopcart`,
  `rollout restart`, 2/2 listos, y verificadas **dentro del pod nuevo** (`/usr/src/app/.env`). Respaldos de los
  dos Secrets en `/tmp/prod-shopcart-analytics-20261028/`.
- **QA: ya estaba, no había nada que hacer.** En QA **no existen los Secrets `env-sc-*`**: todos los micros
  hornean el mismo `.env.local` del blob, y ahí las dos variables están desde el 20/10. El pod de shopcart de QA
  (imagen de hoy 09:21) ya las tiene. No reinicié nada.

## Mixpanel: staging y prod NO comparten proyecto

Pregunta que claude llevaba abierta desde el 22/10. Prod es el **4055947**, staging el **4055964**, verificado el
13/10 contra el endpoint real (`POST /import?strict=1&project_id=<id>` sin `properties.time`: 400 si el secreto es
de ese proyecto, 401 si no). Los eventos de prueba de QA no están mezclados con lo que ve un cliente.
