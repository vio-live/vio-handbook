# 2026-09-02 — El kernel de Vio Commerce sale de `@reachu` y entra a npm de Vio

**Resultado.** Los 7 paquetes del kernel (`utils, config, logger, database, testing,
definitions, service`) están publicados como **`@vio-/*@1.0.244`**, privados, en la cuenta
de npm de Vio. Los 11 microservicios consumen desde ahí, mergeados a `develop` y
desplegados en el cluster QA (`kubernetesqa`), que es el que sirve
`graph-ql-staging.vio.live` **y** `graph-ql-dev.vio.live` (mismo gateway, dos hostnames).
Pods Running con 0 reinicios, `Channel.GetProducts` responde con la key del canal de Bohus.
Ya no dependemos de la cuenta `@reachu`, que nadie controla porque Reachu no existe.

## Por qué el scope es `@vio-` y no `@vio-live`

Vio tiene **dos cuentas de npm**, y costó una tarde darse cuenta:

| Cuenta | Qué es | Plan |
|---|---|---|
| `vio-` (`angelo@tipio.no`) | El token de la laptop de Angelo. Dueño de la org `vio-live`. Publicó `@vio-live/web-sdk`. | **Pro** (activado hoy, como cuenta personal) |
| `vio.live` | La sesión web de Angelo en Chrome. 0 paquetes, 0 orgs. | Un primer Pro cayó acá por error |

Paquetes privados bajo `@vio-live/*` exigen **Teams en la org**, que sigue en Free → `402`.
Un Pro de usuario solo cubre el scope del usuario, y el usuario se llama `vio-`, así que el
kernel quedó como `@vio-/database`. Feo, pero funcional. Las ramas `feat/vio-live-scope`
de los 7 `package-*` tienen todo listo para volver a `@vio-live/*` si un día se activa Teams.

## Cómo se hizo (el flujo de Alan, sin Alan)

1. **Kernel**: clones de los 7, rename `@reachu/`→`@vio-/` en src/dist/package.json,
   rebuild, dry-run de tarballs, publish en orden de dependencias
   (utils → config → logger → database → testing → definitions → service).
2. **`vio-automatize`**: sus scripts (`publish-packages.js`, `change-version-*.js`) ahora
   apuntan a `@vio-/`. Rama `feat/vio-user-scope`.
3. **Micros**: 11 worktrees desde `origin/develop`, rename en `src/` + `test/` + `package.json`.
   Los micros pineaban kernels **viejos** (`1.0.237`–`1.0.242`) y bajo el scope nuevo solo
   existe `1.0.244`: se subieron todos, que es lo que hace `change-version-microservice
   micro=all` tras cada release. Los 11 compilan en local contra el registro real.
4. **CI**: `NPM_CONTENT_FILE` en los 11 repos → token granular *read-only* de `vio-`,
   formato de línea completa (`//registry.npmjs.org/:_authToken=…`, el Dockerfile lo vuelca
   literal a `.npmrc`). Lo seteó Angelo con `gh secret set`.
5. **Corte**: 11 PRs a `develop`, canario `template` primero, después el resto. Las 11
   pipelines en verde (build + deploy).

## Cosas que se aprendieron y conviene no olvidar

- **Todos los `package-*` tienen `.env.test` versionado con claves reales** (Mailjet, ODA,
  Vipps, Stripe test, Mixpanel). Viajaba dentro de los tarballs privados de Alan. Ahora hay
  `.npmignore`; las claves siguen en el historial de git → **pendiente de rotación**.
- La pipeline `deploy.yml` corre **solo en push** a `develop` (→ QA), `pre-develop` (→
  staging) y `main` (→ prod). Un PR no dispara nada: mergear **es** desplegar.
- El paso Deploy hace `helm upgrade` + `kubectl delete pod` y **no espera readiness**: una
  pipeline verde no prueba que el servicio arrancó. Hay que mirar pods y logs.
- `middleware` no tiene script `build`; CI usa `build:integration`.
- 6 de 11 micros tienen `yarn.lock` **gitignoreado** (api, extensions, orders, shopcart,
  template, tracking). Setup previo de Alan; coherente con el `yarn install` sin
  `--frozen-lockfile` del Dockerfile.
- El rojo de `products` en develop del 01/09 era el DNS del cluster QA que no resolvió esa
  noche, no un problema de código. Hoy resuelve.
- `@vio-/config` y `@vio-/service` **fallan al importar** sin `FIREBASE_PRIVATE_KEY`; es
  diseño (config lee env al cargar), no empaquetado.

## Pendientes

- Rotar las claves de los `.env.test`.
- Decidir si se activa Teams en la org `vio-live` para volver a `@vio-live/*`, y cancelar
  el Pro que quedó en `vio.live` si sigue cobrando.
- Mergear `feat/vio-user-scope` en la rama canónica de los 7 `package-*` y de
  `vio-automatize` (hoy la publicación salió de ramas feature).
- Las ramas de Qliro de Alan siguen sin mergear (ver
  [`vg-lyko-feed-to-checkout.md`](../../architecture/vg-lyko-feed-to-checkout.md)), y las
  migraciones del kernel esperan la contraseña de `dbadmin` de `vio-ecom-db-staging`.

→ Continúa en [`2026-09-03-release-kernel-1.0.245-qliro.md`](./2026-09-03-release-kernel-1.0.245-qliro.md) y [ADR-0011](../../decisions/0011-kernel-en-npm-de-vio.md).
