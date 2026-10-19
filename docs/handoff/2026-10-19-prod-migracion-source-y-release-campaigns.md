---
title: "Handoff — Prod: migración `source` de los slots y release del micro de campañas"
date: 2026-10-19
owner: miguel
decides: angelo
status: done
---

# Prod: migración `surface_campaign_slot.source` y release del micro de campañas

> **EJECUTADO el 2026-10-19 por Miguel, 10:45–11:10 UTC.** Migración aplicada y verificada
> (`migrations` id 176), #18 mergeado (`b8631a2`), deploy verde a la primera (run `39240914787`),
> pod `campaigns:22` sano con 0 `Unknown column`, smoke 401. Detalle y correcciones a este documento
> en el [journal](../journal/2026-10/2026-10-19-prod-migracion-source-release-campaigns.md).
> No hace falta volver a correr nada.

**Para Miguel.** Angelo pidió el 19/10 hacer en prod la migración de `source` antes del siguiente
release del micro de campañas, y que lo ejecutes tú. Son dos pasos en orden estricto: primero la
columna, después el merge a `main`. Lo que no toca prod ya está hecho (comprobación previa, backup,
PR de release abierto).

Contexto: [ADR-0034](../decisions/0034-slots-en-web-y-vev-declaracion-por-pagina.md) (slots en web
y Vev; la página puede declarar su campaña y cada asignación lleva `source = dashboard | page`),
journal [2026-10-16-slots-web-vev-replit](../journal/2026-10/2026-10-16-slots-web-vev-replit.md),
runbook anterior [2026-10-16-release-prod-commerce](./2026-10-16-release-prod-commerce.md).

## 1. Estado de partida (verificado 19/10, 10:30–11:00 UTC, solo lectura desde el pod de users de prod)

| Dato | Valor |
|---|---|
| Micro de campañas en prod | desplegado desde `main` @ `bda3f49`, kernel **1.0.273**, imagen `vioprodsc.azurecr.io/campaigns:18`, pod `Running` sin errores de base |
| Columna `source` en `surface_campaign_slot` | **no existe** |
| Tablas `surface*` | 8, presentes, todas a 0 filas (el handoff decía 3; corregido 19/10) |
| Filas en `surface_campaign_slot` | **0** (la tabla está vacía; el `ALTER` es instantáneo) |
| Última migración en `migrations` | `surfacePrivacyMode1792000000000` (la cadena está al día; solo falta esta) |
| Backup a demanda | `pre-slot-source-prod-20261019` en `vio-ecom-db-prod-sc` (RG **`rg-vio-databases`**, no `rg-vio-commerce-prod-sc`), 2026-10-19 10:33 UTC |
| `api.vio.live` | sigue en la VM de Oracle `82.70.54.151` (D2 no hecho; el micro de prod solo se alcanza dentro del clúster) |

Por qué el orden importa: el kernel **1.0.275** (el que trae `develop` del micro) mapea la columna
`source` en la entidad `SurfaceCampaignSlot`. Si el micro nuevo arranca sin la columna, todo lo que lea
`surface_campaign_slot` (la config del SDK incluida) responde 500. Al revés no hay riesgo: el micro
actual (1.0.273) no conoce la columna y la ignora.

## 2. Paso 1 — La migración

Es la migración `1792100000000-surface-campaign-slot-source` de `package-database`
(`develop`, publicada en el kernel 1.0.274/1.0.275). Hace una sola cosa:

```sql
ALTER TABLE `surface_campaign_slot` ADD `source` enum ('dashboard', 'page') NOT NULL DEFAULT 'dashboard';
```

Dos formas, elige la que usaste el 16/10:

**A. Flujo estándar del kernel** (si alcanzas la MySQL de prod desde donde corres `package-database`):
desde `package-database` en `develop`, con el `.env` de prod (`TYPEORM_*`,
`TYPEORM_DRIVER_EXTRA={"ssl":{"rejectUnauthorized":false}}`) y el token npm de la cuenta `vio-`:

```bash
DB_MIGRATION_FILE=1792100000000-surface-campaign-slot-source.ts yarn migration:execute
```

**B. Desde el pod de users de prod** (lo que hicimos en QA para esta misma migración y para la de
privacidad): el pod monta `/usr/src/app/.env` con la conexión y tiene `mysql2`. Guarda este script como
`m-slot-source-prod.js`; es idempotente (si la columna o la fila ya existen no hace nada) e imprime el
estado antes y después.

```js
require('dotenv').config({ path: '/usr/src/app/.env' });
const mysql = require('mysql2/promise');
const e = process.env;
(async () => {
  const c = await mysql.createConnection({
    host: e.DB_HOST || e.TYPEORM_HOST,
    port: Number(e.DB_PORT || 3306),
    user: e.DB_USERNAME || e.TYPEORM_USERNAME,
    password: e.DB_PASSWORD || e.TYPEORM_PASSWORD,
    database: e.DB_NAME || e.TYPEORM_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  const [[{ db }]] = await c.query('SELECT DATABASE() db');
  const [[{ n }]] = await c.query(
    "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='surface_campaign_slot' AND column_name='source'",
  );
  const [[{ m }]] = await c.query("SELECT COUNT(*) m FROM migrations WHERE name='SurfaceCampaignSlotSource1792100000000'");
  console.log(`base ${db} | antes: columna source = ${n} | fila migrations = ${m}`);
  if (n === 0) {
    await c.query("ALTER TABLE `surface_campaign_slot` ADD `source` enum ('dashboard', 'page') NOT NULL DEFAULT 'dashboard'");
    console.log('ALTER aplicado');
  }
  if (m === 0) {
    await c.query("INSERT INTO migrations (timestamp, name) VALUES (1792100000000, 'SurfaceCampaignSlotSource1792100000000')");
    console.log('fila migrations insertada');
  }
  const [col] = await c.query(
    "SELECT COLUMN_TYPE t, IS_NULLABLE nn, COLUMN_DEFAULT d FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='surface_campaign_slot' AND column_name='source'",
  );
  const [last] = await c.query('SELECT id, timestamp, name FROM migrations ORDER BY timestamp DESC LIMIT 2');
  console.log('después:', JSON.stringify(col), '| migrations:', JSON.stringify(last));
  await c.end();
})().catch((err) => {
  console.log('ERR', String(err.message).split('\n')[0]);
  process.exit(1);
});
```

```bash
CTX=vio-commerce-prod-sc
P=$(kubectl --context $CTX get pods -n default --field-selector=status.phase=Running -o name | grep -E 'pod/users-' | head -1 | cut -d/ -f2)
kubectl --context $CTX cp m-slot-source-prod.js default/$P:/usr/src/app/m-tmp-slot-source.js -c users
kubectl --context $CTX exec -n default $P -c users -- node /usr/src/app/m-tmp-slot-source.js
kubectl --context $CTX exec -n default $P -c users -- rm /usr/src/app/m-tmp-slot-source.js
```

Salida esperada: `antes: columna source = 0 | fila migrations = 0`, `ALTER aplicado`, `fila migrations
insertada`, y al final `{"t":"enum('dashboard','page')","nn":"NO","d":"dashboard"}` con
`SurfaceCampaignSlotSource1792100000000` como última migración. El aviso
`Warning: got packets out of order` es ruido del driver, no un error.

**Verificar con `information_schema`, no con el exit code** (regla del playbook
[commerce-db-migrations](../playbooks/commerce-db-migrations.md)):

```sql
SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'surface_campaign_slot' AND column_name = 'source';
SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 2;
```

## 3. Paso 2 — El release del micro

PR ya abierto: [vio-campaigns-microservice#18](https://github.com/vio-live/vio-campaigns-microservice/pull/18)
(`develop` → `main`, 13 commits). Lleva el bump del kernel a 1.0.275, `mode: merge` del manifest
([#15](https://github.com/vio-live/vio-campaigns-microservice/pull/15)), la campaña declarada por la
página con `source`, topes, lock por slot, `READ COMMITTED` y el `PUT` de slots que solo administra
filas del dashboard ([#16](https://github.com/vio-live/vio-campaigns-microservice/pull/16)) y el fix del
`TS4053` ([#17](https://github.com/vio-live/vio-campaigns-microservice/pull/17)). Todo esto lleva en
QA desde el 16/10 15:25 UTC sin errores.

1. **Solo con la columna ya verificada**, mergear #18. El push a `main` dispara `deploy.yml` hacia
   `vio-commerce-prod-sc` con `vioprodsc` y `values-prod.yaml`.
2. Si el job `deploy` sale rojo por el `helm --wait` (en QA el 16/10 expiró con "Pending termination: 1"
   aunque el pod nuevo ya estaba arriba), no es necesariamente un fallo: mirar
   `kubectl --context vio-commerce-prod-sc rollout status deploy/campaigns` y el pod nuevo. Subir el
   `--timeout` del helm en el workflow sigue pendiente de otro día.
3. Comprobar el pod nuevo (imagen `campaigns:19` o superior):
   ```bash
   kubectl --context vio-commerce-prod-sc get pods -l app.kubernetes.io/name=campaigns -o custom-columns=NAME:.metadata.name,READY:.status.containerStatuses[*].ready,IMAGE:.spec.containers[0].image,START:.status.startTime
   kubectl --context vio-commerce-prod-sc logs deploy/campaigns -c campaigns --since=10m | grep -E 'successfully started|Unknown column|ER_|QueryFailedError' 
   ```
   Tiene que aparecer `Nest application successfully started` y **ningún** `Unknown column 'source'`.

   Ojo con dos cosas que fallaron tal como estaban escritas: el selector es
   `app.kubernetes.io/name=campaigns` (**no** `app=campaigns`, que no devuelve nada), y en zsh hay que
   entrecomillar el `-o 'custom-columns=...[*]...'` o el glob lo come. El tag de la imagen fue **22**,
   no 19: el contador avanza con los builds de `develop`.
4. Smoke dentro del clúster (el micro de prod no tiene todavía host público):
   ```bash
   kubectl --context vio-commerce-prod-sc exec deploy/collections -- curl -s -o /dev/null -w '%{http_code}\n' -X POST http://campaigns/v2/mobile/components/manifest -H 'X-Api-Key: x' -H 'Content-Type: application/json' -d '{"platform":"web","locations":[]}'
   ```
   → `401`.

   **El 200 de `config` no es verificable en prod hoy** (comprobado 19/10): la auth es
   `SurfaceKeyGuard` contra `surface.api_key` y en prod las 8 tablas `surface*` están a 0 filas, así
   que no existe ninguna key y cualquier valor da 401. Un 401 confirma la capa de auth, **no** la
   consulta a `surface_campaign_slot`. El sustituto que sí concluye es diffear el esquema `surface*`
   de prod contra QA (donde 1.0.275 corre limpio desde el 16/10): 62 columnas, idénticas. Receta en
   el [playbook de migraciones](../playbooks/commerce-db-migrations.md).

## 4. Rollback

- **Código:** `helm --kube-context vio-commerce-prod-sc rollback campaigns` o revertir el merge en `main`.
  El micro anterior (1.0.273) convive con la columna sin problema.
- **Migración:** no se revierte de normal. Si hiciera falta de verdad:
  `ALTER TABLE surface_campaign_slot DROP COLUMN source;` y
  `DELETE FROM migrations WHERE name = 'SurfaceCampaignSlotSource1792100000000';`
  (solo con el micro en 1.0.273). El backup `pre-slot-source-prod-20261019` existe por si acaso.

## 5. Fuera de este handoff

- **D2** (Istio `Gateway`/`VirtualService`/`Certificate` para `api.vio.live` en prod y el A de Cloudflare
  a `135.116.206.152`): sigue como en el paso 5.4/5.5 del
  [runbook del 16/10](./2026-10-16-release-prod-commerce.md). Lo decide Angelo; sin eso, el SDK web y
  Vev en prod no llegan al micro.
- Colector de analytics (`main` @ `477b56b`, conteo por `order_id`): si no está desplegado aún en las VMs
  de staging y prod, va antes de que las páginas de prod lleven la SDK 0.24.0.
- `helm --timeout` del workflow de campañas y el CronJob de backup roto (`apk`) siguen pendientes.
