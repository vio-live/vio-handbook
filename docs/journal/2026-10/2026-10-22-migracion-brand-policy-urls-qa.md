---
title: Migracion brand_profile.terms_url / refund_policy_url en QA
last-updated: 2026-10-22
owner: Miguel
---

## Migracion `BrandProfilePolicyUrls1792500000000` corrida en QA — Miguel

- **Quien:** Miguel, a pedido de Angelo. Coordinado con el go-live del lunes 26/10 (item B7 del
  [checklist](../../handoff/2026-10-22-checklist-go-live.md)).
- **Donde:** MySQL de **QA** `outshifter` (`10.224.0.7`, IP privada), desde el pod
  `users-f9644b54b-2cwsp` del cluster `kubernetesqa-sc`. **Prod no se toco** (decision de Angelo:
  va despues del go-live).
- **Cuando:** jueves 2026-10-22, 15:39-15:41 Oslo.
- **Contexto:** dos columnas nuevas, aditivas y NULL, para que la ficha del producto del SDK enlace
  las condiciones de compra y la politica de devoluciones de cada marca
  («Du handler direkte hos {brand}.»). Migracion de package-database **#25**
  (`feat/brand-policy-urls`), que Angelo mergea despues de esta salida.
- **Script:** [`assets/2026-10-22-brand-policy-urls/m-brand-policy-urls-qa.js`](../../handoff/assets/2026-10-22-brand-policy-urls/m-brand-policy-urls-qa.js),
  pasado por stdin (`kubectl exec -i ... -- sh -c 'cd /usr/src/app && node'`).

### Comprobado antes de correr

- El `ALTER` del script es **byte a byte el mismo** que el de
  `src/migrations/1792500000000-brand-profile-policy-urls.ts` de la PR #25, y el `name` de la fila
  de `migrations` coincide con la clase (`BrandProfilePolicyUrls1792500000000`). Si no coincidiera,
  marcarla como aplicada dejaria QA divergida de lo que espera el codigo.
- `brand_profile` tiene **PRIMARY (unique) sobre `brand_user_id`**, asi que el
  `ON DUPLICATE KEY UPDATE` del upsert funciona y no puede duplicar filas. `created_at`/`updated_at`
  tienen default y `display_name` es nullable: el INSERT no necesita mas campos.
- **1338 es Careless en QA**, confirmado y unico: `@careless`, `brand_name Careless`,
  `organization_number 928540650` — el mismo org que la unidad de Vipps 1179558. La busqueda por
  username/name/brand_name/org no devuelve ningun otro candidato.

### Un fallo del script, corregido antes de correr

El script hacia `SELECT id, email FROM user`, y **la tabla `user` no tiene columna `email`**
(el correo vive en Firebase, no en la base). Tal cual, el script aplicaba el `ALTER` y la fila de
`migrations` y **se caia justo despues**, sin cargar los enlaces de Careless: quedaba a medias.

Cambiado por `SELECT id, username, brand_name, organization_number`, que ademas verifica mejor
(el org number se puede cruzar con Vipps). Es la unica desviacion; el SQL de la migracion no se
toco. **Corregido tambien en el asset del handbook y en la variante de prod**, que tenia el mismo
fallo — si no, el dia que se corra en prod se cae igual.

### Salida, 1a pasada

```
base outshifter | antes: columnas = 0/2 | fila migrations = 0
ALTER aplicado
fila migrations insertada
brand 1338: @careless | brand_name Careless | org 928540650
perfil: {"brand_user_id":1338,"display_name":null,"terms_url":"https://careless.no/policies/terms-of-service","refund_policy_url":"https://careless.no/policies/refund-policy"}
despues: [{"c":"refund_policy_url","t":"varchar(2048)"},{"c":"terms_url","t":"varchar(2048)"}] | migrations: ["BrandProfilePolicyUrls1792500000000","CartAttributionUtf8mb41792400000000"]
```

### Salida, 2a pasada (idempotencia comprobada de verdad)

```
base outshifter | antes: columnas = 2/2 | fila migrations = 1
brand 1338: @careless | brand_name Careless | org 928540650
perfil: {"brand_user_id":1338,"display_name":null,"terms_url":"https://careless.no/policies/terms-of-service","refund_policy_url":"https://careless.no/policies/refund-policy"}
despues: [{"c":"refund_policy_url","t":"varchar(2048)"},{"c":"terms_url","t":"varchar(2048)"}] | migrations: ["BrandProfilePolicyUrls1792500000000","CartAttributionUtf8mb41792400000000"]
```

Sin `ALTER`, sin segunda fila de `migrations`, sin pisar los enlaces.

### Estado final de la tabla

```
  1. created_at | datetime(6) | null=NO
  2. updated_at | datetime(6) | null=NO
  3. brand_user_id | int | null=NO
  4. display_name | varchar(255) | null=YES | utf8mb4_unicode_ci
  5. logo_url | varchar(2048) | null=YES | utf8mb4_unicode_ci
  6. avatar_url | varchar(2048) | null=YES | utf8mb4_unicode_ci
  7. primary_color | varchar(32) | null=YES | latin1_swedish_ci
  8. secondary_color | varchar(32) | null=YES | latin1_swedish_ci
  9. terms_url | varchar(2048) | null=YES | utf8mb4_unicode_ci
 10. refund_policy_url | varchar(2048) | null=YES | utf8mb4_unicode_ci

filas brand_profile: 4
  1289 | null | terms=null | refund=null
  1331 | null | terms=null | refund=null
  1338 | null | terms=https://careless.no/policies/terms-of-service | refund=https://careless.no/policies/refund-policy
  1340 | alan-test-supplier | terms=null | refund=null
filas migrations con ese name: 1
```

Columnas en la posicion que pide la migracion (9 y 10, detras de `secondary_color`), tipo y
collation correctos, y **solo** la fila de Careless modificada.

### Hecho

- `brand_profile` de QA con las dos columnas + fila de `migrations`.
- Enlaces de Careless (1338) cargados.
- Asset del handbook corregido (QA **y** prod) en el mismo commit.

### Pendiente

- **Prod, con orden obligatorio** (item B7b del checklist): la entidad lleva las columnas como
  `@Column` normal, asi que en cuanto un servicio de prod suba al kernel con #25, **toda** lectura
  de `brand_profile` pide las columnas nuevas y revienta con `Unknown column 'bp.terms_url'` si la
  base no esta migrada. Lo leen `api` (`vipps-partnership.service.ts` -> `brandLooksOf`, un
  `getMany()` sin lista de campos: es la pagina *Vio team > Vipps partner* que usamos para A2),
  `campaigns` (bloque de sponsor del bootstrap) y `collection` (`brand-of-collection`).
  Mergear #25 y desplegar QA no tiene riesgo. En prod: **migracion primero, kernel despues**.
- Estado de prod medido hoy, read-only: columnas **0/2**, fila de `migrations` **0**,
  `brand_profile` **0 filas**, y **1327 es Careless** (`@careless`, org 928540650) — el id que ya
  trae el script de prod es el correcto.
- Dato menor que puede morder en otra migracion: `primary_color` y `secondary_color` siguen en
  `latin1_swedish_ci` (de antes). Las columnas nuevas quedaron en `utf8mb4_unicode_ci`.
