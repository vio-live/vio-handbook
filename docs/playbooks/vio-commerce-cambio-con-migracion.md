---
title: "Playbook: un cambio de Vio Commerce que necesita migración"
last-updated: 2026-09-03
owner: angelo
status: live
---

# Un cambio de Vio Commerce que necesita migración

Cómo llevar a QA/staging y a producción un cambio que toca el schema. Escrito el día
en que una migración con el nombre de columna equivocado tiró 700 mensajes cada 5 minutos
a la DLQ de `products` (journal
[2026-09-03](../journal/2026-09/2026-09-03-release-kernel-1.0.245-qliro.md)).

## Los entornos, sin eufemismos

| Rama | Cluster | Hostnames | Base MySQL |
|---|---|---|---|
| `develop` | `kubernetesqa` | `graph-ql-staging.vio.live` **y** `graph-ql-dev.vio.live` | `vio-ecom-db-staging` / `outshifter` |
| `pre-develop` | "staging" (`ACR_STAGING`) | — | — |
| `main` / `master` | `vio-commerce-prod` | producción | `vio-ecom-db-prod` |

Al 2026-09-03 el cluster de `pre-develop` **no existe** en la suscripción: hay dos clusters,
QA y prod. "Staging" es QA. **Mergear a `develop` es desplegar a staging.**

## El orden, que es lo único que importa

Un micro con un kernel que declara una columna que la base no tiene **se cae en el primer
query** (`Unknown column`). Los micros no corren migraciones al arrancar. Por eso:

1. **Kernel primero.** La rama de `package-database` con la migración **y** el cambio de
   entidad entra a `develop` por PR.
2. **Release del kernel** (ver ADR-0011): `change-version-packages.js pkg=all type=1` →
   `publish-packages.js pkg=all type=1` (una persona; publica los 7 con la nueva versión).
3. **Migración en la base del entorno, antes de cualquier deploy.** Desde el repo del kernel
   en `develop`, con `.env` (`TYPEORM_*` + `TYPEORM_DRIVER_EXTRA` con `ssl`; el ejemplo está
   en el repo) y **una migración por vez**:
   `DB_MIGRATION_FILE=<archivo>.ts yarn migration:execute`. Verificar columnas con una
   consulta a `information_schema`, no con el exit code.
4. **Micros**: bump de los pins a la nueva versión (los 11, siempre juntos) + el código que
   usa la columna, por PR, `yarn install && yarn build` en local contra el registro real
   antes de abrir el PR. Mergear → despliega.
5. **Verificar en runtime, no en la pipeline**: el Deploy no espera readiness. Pods `Running`
   con 0 reinicios, logs de arranque sin `error|Unknown column|Cannot find module`, y un
   smoke por el gateway (`Channel.GetProducts`, `Payment.GetAvailablePaymentMethods`).
   Mirar **especialmente el consumer de bus de `products`**: es el que une más tablas.

Para producción, los mismos 5 pasos con `main` y `vio-ecom-db-prod`, sin publicar de nuevo
el kernel (ya está).

## Reglas que evitan lo que ya pasó

- **Nombres de columna en snake_case.** El kernel usa `SnakeNamingStrategy`: la entidad
  `orderWebhookUrl` consulta `order_webhook_url`. La migración tiene que crear ese nombre,
  o la entidad llevar `@Column({ name: … })`. Compararlo a ojo antes de mergear el kernel.
- **`dist` se genera, no se edita.** El `dist` commiteado sale del `yarn build` del script de
  publicación. Un `dist` editado a mano (Qliro decía `kustom`) o desactualizado no se ve en
  el PR.
- **Rama viva, `develop` fresco.** Antes de correr cualquier script de release:
  `git checkout -B develop origin/develop` en los 8 repos. Un `develop` local viejo hizo que
  `publish-packages.js` no publicara nada y saliera con exit 0.
- **Ramas de kernel sin publicar → canary.** Si un micro necesita un cambio del kernel que
  todavía no está en `develop`, publicar canary (`type=2`) y apuntar el micro ahí. Las ramas
  de Walley y hardening no compilan justamente por saltarse esto.
- **Migración por archivo.** `runMigrations` sin `DB_MIGRATION_FILE` corre *todas* las
  pendientes; si la tabla `migrations` del entorno no coincide con `src/`, reaplica cosas.

## Lo que todavía es manual y podría no serlo

- Correr la migración (paso 3) depende de una persona con la contraseña de `dbadmin`.
  La salida limpia es un Job de Kubernetes en el deploy, o autenticación Entra en el
  servidor. Propuesta abierta en el journal del 2026-09-02.
- No hay CI en PRs: el merge es la primera compilación. Un workflow de `pull_request` con
  `yarn install && yarn build` en cada micro cerraría eso.
- No hay guardia automática de "las migraciones producen el schema que las entidades
  esperan". Un test en `package-database` que corra las migraciones en SQLite y compare con
  el schema builder de TypeORM habría atrapado el bug de hoy antes del merge.
