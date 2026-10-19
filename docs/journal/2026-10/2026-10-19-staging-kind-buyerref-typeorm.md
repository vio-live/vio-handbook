---
date: 2026-10-19
session: staging-kind-buyerref-typeorm
participants: [angelo, miguel]
status: live
---

# Staging (19/10 tarde) — migración `kind`, `BUYER_REF_SECRET` y los flags de TypeORM

Ejecución de [el handoff de staging](../../handoff/2026-10-19-staging-analytics-y-kind.md).
Tres de los cuatro puntos cerrados; el 2 (colector) espera que mergeen los PRs.

- **Quién:** Miguel.
- **Dónde:** MySQL de QA (`outshifter` por IP privada `10.224.0.7`), blob `containerqasc`,
  clústeres `kubernetesqa-sc` y `vio-commerce-prod-sc`.
- **Cuándo:** 19/10 15:00–15:15 UTC.

## 1. Migración `surface_slot.kind` en QA — HECHA

Verifiqué la migración **contra el origen antes de aplicarla**: leí
[package-database#21](https://github.com/vio-live/package-database/pull/21) (`feat/surface-slot-kind`
@ `1f8c5c8`) y confirmé que el `ALTER` y la propiedad `name` de la clase
(`SurfaceSlotKind1792200000000`) son exactamente los del script del handoff.

Estado previo: `kind` ausente, `surface_slot` con **4** filas (el handoff decía 3), cadena de
`migrations` al día terminando en `SurfaceCampaignSlotSource1792100000000` (id 234).

Resultado: `ALTER aplicado` + `fila migrations insertada`. Verificado con `information_schema` en una
conexión nueva: `kind varchar(32)` NULL, colocada tras `display_name`; fila `migrations` **id 235**
`SurfaceSlotKind1792200000000` como última.

**Vía libre para publicar el kernel 1.0.276.**

## 2. Colector de analytics — a la espera

PRs [vio-analytics#19](https://github.com/vio-live/vio-analytics/pull/19) y
[#20](https://github.com/vio-live/vio-analytics/pull/20) siguen en revisión. Nada que hacer hasta que
entren en `main`; cuando avisen, despliego y corro los curls del handoff.

## 3. `BUYER_REF_SECRET` en QA — HECHO

- Generado con `openssl rand -hex 32` (64 hex). Valor en el `TOOLS.md` de Miguel.
- Cargado en el blob `containerqasc` / `env-file-microservices` / **`.env.local`** (el único de la
  raíz, que es el que leen los micros NestJS de QA; no hay `shopcart/.env`).
- Respaldo previo: `.env.local.backup-pre-buyerref-20261019-150850` (15414 bytes). El fichero pasó de
  15414 a 15762 bytes.
- **Verificado releyendo el blob**, no el fichero local: `cmp` idéntico, la variable presente con el
  valor exacto y 64 caracteres.
- **El pod de shopcart que corre ahora NO lo tiene**, y es lo correcto: en QA shopcart lee el
  `.env.local` **horneado en la imagen** y no monta Secret de k8s, así que el valor entra cuando su PR
  `feat/buyer-ref-para-analytics` se mergee y reconstruya la imagen.
- Producción queda sin generar. Cuando toque: mismo nombre, **valor distinto**, y allí va en el
  **Secret `env-sc-shopcart`**, porque en prod el Secret tapa el `.env` horneado.

## 4. Flags de TypeORM en base-api — CONFIRMADO, los dos entornos seguros

No me quedé en el "o ausentes" del handoff: comprobé qué hace el código cuando la variable falta.

| | QA | Prod |
|---|---|---|
| Fichero que lee el pod | `/usr/src/app/.env` horneado (10194 B) | `/usr/src/app/.env` desde el Secret `env-sc-base-api` (9949 B) |
| `TYPEORM_SYNCHRONIZE` | `false` (línea 154) | `false` (línea 160) |
| `TYPEORM_MIGRATIONS_RUN` | **ausente** | **ausente** |

Por qué ausente es seguro, verificado y no supuesto:

1. base-api **no usa el kernel**: lleva `typeorm@0.2.36` directo, y esas dos variables son la
   convención propia de TypeORM, no código de la app.
2. `dist/config/database.js` hace `getConnectionOptions()` y después `createConnection({...options,
   entities, subscribers, migrations, namingStrategy, timezone, ssl})`: **no sobreescribe
   `synchronize` ni `migrationsRun`**, así que los dos salen de las variables. No hay `ormconfig`.
3. En `ConnectionOptionsEnvReader.js` (líneas 35 y 37) los dos pasan por `OrmUtils.toBoolean(...)`, y
   lo ejecuté **dentro del contenedor de prod con su propio TypeORM**:
   `toBoolean(undefined) → false`, `toBoolean("false") → false`, `toBoolean("true") → true`.

Conclusión: `synchronize=false` y `migrationsRun=false` efectivos en QA y en prod. **Se puede mergear
el puente de stats del publisher sin tocar nada.** Y `user_settings` no está en riesgo por esto.

## Nota de método

El script de QA del handoff ya venía con la ruta correcta (`/usr/src/app/.env.local`, que en QA es
distinta de la de prod). La diferencia está en
[la lección de esta mañana](../../lessons/el-env-del-pod-no-se-llama-igual-en-prod-y-qa.md).
Ojo igualmente: **base-api en QA usa `.env`, no `.env.local`** — la regla no es "QA siempre
`.env.local`", es "mirar el contenedor".
