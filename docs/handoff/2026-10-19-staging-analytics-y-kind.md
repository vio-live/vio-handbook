---
title: "Handoff — Staging (19/10 tarde): colector de analytics, migración kind, secreto de shopcart"
date: 2026-10-19
owner: miguel
decides: angelo
status: live
---

# Staging: lo que hace falta desplegar y configurar esta tarde

**Para Miguel.** Angelo pidió el 19/10 por la tarde que te encargues de la parte de staging del
programa de analytics por campaña ([contrato y estado](./2026-10-19-analytics-por-campana-y-slot.md)).
Son cuatro cosas independientes; el orden recomendado es el de abajo. Todo lo que no toca entornos
ya está hecho y con PR; aquí solo va lo que toca QA/staging.

## 1. Migración `surface_slot.kind` en la MySQL de QA (2 min, antes del punto 4)

Columna nueva aprobada por Angelo ([package-database#21](https://github.com/vio-live/package-database/pull/21)).
Si el kernel 1.0.276 llega al micro de campañas antes que la columna, el micro responde 500 al leer
slots; por eso va primero. Script idempotente (mismo `ALTER` que la migración, inserta la fila en
`migrations`), desde el pod de users de QA: [`assets/2026-10-19-staging/m-slot-kind-qa.js`](./assets/2026-10-19-staging/m-slot-kind-qa.js).

```bash
P=$(kubectl --context kubernetesqa-sc get pods -n default --field-selector=status.phase=Running -o name | grep -E 'pod/users-' | head -1 | cut -d/ -f2)
kubectl --context kubernetesqa-sc cp m-slot-kind-qa.js default/$P:/usr/src/app/m-tmp-slot-kind.js -c users
kubectl --context kubernetesqa-sc exec -n default $P -c users -- node /usr/src/app/m-tmp-slot-kind.js
kubectl --context kubernetesqa-sc exec -n default $P -c users -- rm /usr/src/app/m-tmp-slot-kind.js
```

Salida esperada: `antes: columna kind = 0 | fila migrations = 0`, `ALTER aplicado`, `fila migrations
insertada`, `después: [{"t":"varchar(32)","nn":"YES"}] | migrations: ["SurfaceSlotKind1792200000000", …]`.
(El aviso `got packets out of order` es ruido del driver.) Verificar con `information_schema`, no
con el exit code. El de prod ([`m-slot-kind-prod.js`](./assets/2026-10-19-staging/m-slot-kind-prod.js))
es para después, antes del siguiente release del micro a prod.

Cuando esté, avisa: Angelo o claude mergean el kernel y lanzan `pkg=all` (→ 1.0.276) y los bumps.

## 2. Colector de analytics en la VM de staging (`events-staging.vio.live`, 129.151.196.99)

PRs [vio-analytics#19](https://github.com/vio-live/vio-analytics/pull/19) y
[#20](https://github.com/vio-live/vio-analytics/pull/20) (el 20 incluye al 19). Están en revisión
independiente; en cuanto cierre se mergean a `main` y **te avisamos para desplegar `main`** como
siempre ([`DESPLIEGUE.md`](https://github.com/vio-live/vio-analytics/blob/main/docs/DESPLIEGUE.md)).
Qué traen: lecturas por campaña, por slot y por producto, desgloses por método de pago / dispositivo /
país / idioma, el feed `recent` arreglado (daba 500), y 17 columnas nuevas en `events` que el servicio
crea solo al arrancar (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`).

Comprobación tras el deploy (con la key de la surface 3 «Vev» de QA, la que usa Angelo):

```bash
curl -s "https://events-staging.vio.live/v1/stats/recent?minutes=600&limit=5" -H "X-Api-Key: $KEY" | head -c 600   # 200, no 500
curl -s "https://events-staging.vio.live/v1/stats/campaigns/9/slots?days=1" -H "X-Api-Key: $KEY" | head -c 800     # 3 slots card-… con impresiones
curl -s "https://events-staging.vio.live/v1/stats/campaigns/9/products?days=1" -H "X-Api-Key: $KEY" | head -c 600
curl -s "https://events-staging.vio.live/v1/stats/campaigns/9/breakdown?by=payment_method&days=1" -H "X-Api-Key: $KEY"  # vipps: 1 compra
```

En el log del servicio, al arrancar, no debe haber errores de `ALTER TABLE` (si ClickHouse no
acepta `AFTER` por algún motivo, lo vemos ahí). Las columnas: `SELECT name FROM system.columns WHERE
table='events' AND database='vio_staging' AND name IN ('buyer_id','device_type','country','language','tz')`.

## 3. Secreto `BUYER_REF_SECRET` para shopcart en QA

shopcart (PR en preparación, rama `feat/buyer-ref-para-analytics`) devuelve `buyer_ref` = HMAC-SHA256
del email del comprador con este secreto; analytics guarda solo ese hash. Sin la variable el campo
sale `''` y nada falla, pero sin ella no hay compradores únicos en analytics.

- Generar: `openssl rand -hex 32`.
- QA: añadir `BUYER_REF_SECRET=<valor>` al `.env.local` de shopcart en el blob (el que se hornea en la
  imagen) y redesplegar shopcart cuando se mergee su PR (el merge dispara el deploy; si el `.env.local`
  ya está en el blob, la imagen nueva lo lleva).
- Prod (después): mismo nombre en el Secret `env-sc-shopcart`. **Mismo valor en QA y prod no hace
  falta; distinto es mejor.** Guárdalo donde guardas los demás secretos; si se pierde, los
  compradores "cambian de identidad" (no se rompe nada, pero se pierde la continuidad).

## 4. Confirmar que base-api no sincroniza el esquema (QA y prod)

El puente de stats para el publisher (base-api, rama `feat/stats-por-surface-para-el-publisher`, en
revisión) lee `surface` y `surface_campaign` con dos entidades de proyección de solo lectura (pocas
columnas). Con `TYPEORM_SYNCHRONIZE=true` TypeORM intentaría "arreglar" esas tablas del kernel; con
`false` es inocuo. Confirmar en el `.env` de base-api de **QA y prod**: `TYPEORM_SYNCHRONIZE=false` y
`TYPEORM_MIGRATIONS_RUN=false` (o ausentes). Si estuviera en `true` en algún sitio, decirlo antes de
mergear ese PR (y de paso ya estaría rompiendo `user_settings`, que tiene el mismo patrón).

## Después de esto (no es tuyo, para que sepas qué viene)

- Kernel 1.0.276 → bumps a los 11 micros (redeploy automático en QA).
- Micro de campañas con `kind` en el manifest (rama `feat/kind-del-slot`) → develop → QA.
- base-api (puente publisher + endurecimiento del comodín `/stats/*`) → develop → QA.
- webapp (home con campañas activas, Performance por slot) → develop → staging en Vercel.
- gateway `graphql` con `buyer_ref` → develop → QA; SDK web 0.25.0 (publica Angelo) y Vev 0.333.
- Prod: todo lo anterior cuando esté verificado en staging, con las migraciones de `kind` y los
  `ALTER` del colector por delante.
