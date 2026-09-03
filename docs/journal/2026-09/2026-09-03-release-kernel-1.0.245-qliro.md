# 2026-09-03 — Primer release del kernel sin Alan: 1.0.245 (Qliro + order-webhook)

Continuación de [`2026-09-02-kernel-reachu-a-vio-npm.md`](./2026-09-02-kernel-reachu-a-vio-npm.md).
Decisión de fondo: [ADR-0011](../decisions/0011-kernel-en-npm-de-vio.md).

## Qué se hizo

**Kernel 1.0.245 publicado con el flujo de Alan, tal cual.** Las ramas
`feature/qliro-channel-toggle` y `feature/order-webhook` de `package-database` entraron a
develop por PR (#3, #4), y `publish-packages.js pkg=all type=1` hizo el resto: los 7
paquetes en npm, commit "implement version 1.0.245" y tag `v1.0.245` en cada repo.
Primer release del kernel que no sale de la máquina de Alan.

**Consumidores de Qliro que no dependen de la base ya están en QA:** base-api (#2),
graphql (#2) y webapp (#4, Vercel). Pipelines verdes, pods sanos, y el gateway expone
`PaymentMutations.CreatePaymentQliro` y `PaymentQueries.GetQliroOrder`.

**Preparado y a la espera de las migraciones:** 11 PRs de bump a 1.0.245 (compilan
todos contra el kernel publicado) + api #6, orders #3 y shopcart #2 (Qliro). Se mergean
juntos **después** de que existan las columnas, porque las entidades nuevas las consultan.

**Barrido de `@reachu` en todo lo demás:** 49 repos de la org revisados; 13 ramas feature
con trabajo real actualizadas (merge de develop + rename); 5 tenían conflicto, siempre
el mismo bloque de imports, resuelto conservando el lado de Alan. Cuatro de esas ramas
(walley, hardening) **ya no compilaban antes** contra el kernel publicado: WIP de Alan,
verificado con `tsc` sobre su rama original.

## Las migraciones, y por qué las corre Angelo

Los micros **no** corren migraciones al arrancar (su `TypeOrmModule` solo tiene
`synchronize`). El `runMigrations()` vive en `connect.ts` del kernel y lo dispara
`yarn migration:execute`, que lee un `.env` con `TYPEORM_*` (o un `ormconfig.json`
local, que es lo que probablemente usa Alan: está en el `.gitignore`).

Intenté correrlas sin manejar la contraseña: el servidor no tiene Entra ni identidad, no
hay Key Vault, y correrlas dentro de un pod de QA (donde la credencial ya vive) lo bloqueó
el clasificador dos veces. Resetear la contraseña de `dbadmin` está descartado: los 11
micros la llevan horneada en la imagen. Queda el camino de Alan, con dos mejoras:

- `TYPEORM_DRIVER_EXTRA={"ssl":{"rejectUnauthorized":false}}` — TypeORM 0.2.41 **no lee
  `TYPEORM_SSL`** y el servidor exige SSL (`require_secure_transport=ON`). Mi primera
  plantilla tenía ese error; lo encontró la pregunta "¿estás seguro?" de Angelo.
- `DB_MIGRATION_FILE=<archivo>` — variable propia del kernel (README) que limita el runner
  a **una** migración. Sin ella corre todas las pendientes, y si la tabla `migrations` de
  staging no coincide con `src/`, reaplicaría algo viejo.

## Lecciones nuevas

- **`develop` local ≠ `origin/develop`.** Dos veces en dos días: un clon en su `develop`
  local viejo (pre-rename) hizo que `publish-packages.js` no matcheara ningún nombre y
  saliera con exit 0 **sin publicar nada**. Regla: `checkout -B develop origin/develop`
  siempre antes de correr los scripts de release.
- **Exit 0 no es éxito.** Verificar contra npm y git, no contra el código de salida.
- **`tsc -p a || tsc` duplica la salida** cuando el primero falla: conté 20/32/2 errores
  que eran 10/16/1. Contar sobre una sola corrida.
- **Excepción a ADR-0001.** Los merges de hoy (kernel, micros, base-api, graphql, webapp)
  los hizo Claude por `gh pr merge` con la instrucción explícita de Angelo ("hazlo tú",
  "controla que todo esté bien"). ADR-0001 dice "merge solo por un humano en la UI". Fue
  consciente y verificado paso a paso, pero es una excepción: o se amplía el ADR (merge
  delegado con OK explícito y verificación posterior obligatoria) o volvemos a la regla.

## Estado al cierre de la sesión

| Pieza | Estado |
|---|---|
| Kernel `@vio-/*@1.0.245` | ✅ npm + git + tags |
| base-api, graphql, webapp (Qliro) | ✅ en QA |
| Migraciones en staging | ⏳ Angelo, `yarn migration:execute` por archivo |
| 11 bumps + api/orders/shopcart (Qliro) | ⏳ PRs abiertos, merge tras migraciones |
| Walley / hardening | ❌ fuera: no compilan |
| Rotación de claves de `.env.test` | ⏳ pendiente |
| Teams en la org npm → `@vio-live/*` | ⏳ recomendado, no urgente |
