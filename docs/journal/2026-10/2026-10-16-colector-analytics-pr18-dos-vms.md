---
date: 2026-10-16
session: "Desplegar vio-analytics main (477b56b, PR #18) en staging y prod"
participants: [angelo, miguel]
status: live
---

# Colector de analytics al PR #18 en las dos VMs (16/10)

Angelo, 15:01 OSL: desplegar `main` de `vio-analytics` (**477b56b**, PR #18,
*fix(stats): contar pedidos únicos*) en las dos VMs del colector. Cambia cómo se cuentan pedidos
y checkouts porque el SDK 0.23.1 reporta la compra una vez por campaña; conviene tenerlo antes de
que las páginas lleven el SDK nuevo.

## Hecho
- `477b56b2` es el HEAD de `main` (mergeado 12:54Z). Toca `src/stats.ts`, `src/privacy.ts`,
  `src/stats-definitions.ts`, tests y docs.
- **staging `129.151.196.99`** y **prod `82.70.54.151`**, mismo procedimiento:
  respaldo (`/home/ubuntu/vio-analytics-backup-20261016-150249.tgz`, con `src`, `dist`,
  `package.json`, `pnpm-lock.yaml`) → extraer el código → `pnpm install --prod=false` →
  `pnpm build` → `systemctl restart vio-analytics`.
- **Ninguna de las dos VMs tiene `.git`**: el código se copia, no se hace `pull`. Se desplegó con
  un tarball armado desde un clon local, **excluyendo `.env*`, `node_modules`, `dist` y `.git`**.
  Comprobado antes de subirlo que el paquete no llevaba ningún `.env`.

## Verificación
- `src/stats.ts` **c5ac362a** y `src/privacy.ts` **513ae3df** en las dos, iguales al commit
  objetivo; y el **mismo `dist/index.js` (dfbb1c90)** en ambas, así que corren exactamente lo mismo.
- `uptime_s` de 11-13 s tras el restart: prueba de que el proceso es el nuevo y no el viejo
  (`ready:true` por sí solo no lo probaría).
- `events.vio.live`, `events-staging.vio.live` y `events-dev.vio.live`: **200**.
- En los dos: `clickhouse.lastError: null`, `sinks.mixpanel.enabled: true` sin `lastError`,
  `auth.lastDirectoryError: null`, `tenancy.dropped` a cero. Cero líneas de error en el journal.

## Corrección a la premisa: prod SÍ necesitaba tocar el `.env`
Angelo dijo "sin migración ni cambios de `.env`". Es cierto en staging; **en prod no**.

`CAMPAIGNS_URL` es **obligatoria** en el esquema de config desde este código
(`src/config.ts:22`, `z.string().url(...)` **sin** `.optional()` ni `.default()`). Staging la
tenía (`https://api-staging.vio.live`); **prod NO la tenía**. Reiniciar con el código nuevo y sin
ella habría tumbado el colector de producción: la validación de config falla al arrancar.

Se comprobó **antes de desplegar**, extrayendo del esquema las variables sin defecto: solo son dos,
`CAMPAIGNS_URL` y `MIXPANEL_ENABLED`; la segunda ya estaba (`true`). `API_KEY_CACHE_FILE` **no**
hace falta: tiene `default("")`.

Añadido al `.env` de prod, con respaldo `.env.backup-pre-pr18-20261016-150249`:
```
CAMPAIGNS_URL=https://api.vio.live
```
Esto solo es posible **porque hoy mismo se cortó `api.vio.live` al micro de campañas**
(ver [2026-10-16-micro-campanas-en-prod-y-corte-dns](2026-10-16-micro-campanas-en-prod-y-corte-dns.md)).
El colector resuelve api-key → surface contra `GET /v2/mobile/surface` del micro; comprobado
**desde la propia VM** que esa URL responde 401 con una key falsa, o sea que la alcanza.

## No hecho (es el paso 6 completo, no esto)
El runbook pide además `API_KEY_CACHE_FILE=/opt/vio-analytics/.keycache.json` (caché de keys en
disco) y **quitar `DATABASE_URL`**, que sigue presente y sin uso. También apagar el espejo del
vio-backend viejo de esa VM (`ANALYTICS_EVENTS_URL`, `ANALYTICS_INTERNAL_TOKEN`). Nada de eso se
tocó: Angelo pidió solo el despliegue del código.

## Rollback
Parar el servicio, desempaquetar `/home/ubuntu/vio-analytics-backup-20261016-150249.tgz` sobre
`/opt/vio-analytics` y arrancar. En prod, además, restaurar `.env.backup-pre-pr18-...` si se
quiere volver al estado exacto (pero entonces hay que volver también al código viejo, porque el
nuevo no arranca sin `CAMPAIGNS_URL`).
