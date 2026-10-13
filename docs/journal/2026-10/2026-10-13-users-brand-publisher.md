---
date: 2026-10-13
session: afternoon
participants: [angelo, claude, svc-users]
status: live
---

# Session — 2026-10-13 — users: tipo de cuenta Publisher guardado, `accountType`/`features` en `/me` y backfill (F2.2)

## Goal

Hacer F2.2 del [plan de campañas en Commerce](../../handoff/campanas-en-commerce-plan-de-ejecucion.md)
en vio-users-microservice ([ADR-0026](../../decisions/0026-brand-publisher-channel-surface.md),
[ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md),
[cuentas-y-capacidades](../../architecture/cuentas-y-capacidades.md), "Vigente desde 2026-10-13").
Hasta hoy el Publisher, que se registra como "Channel", existía solo como claim de Firebase.

## Done

- **Rama local `feature/brand-publisher`** en vio-users-microservice, desde `origin/develop`
  (`6f4b1c9`). Worktree: `~/vio-commerce/worktrees/users-brand-publisher`. **No tiene push ni
  PR**, y se le quitó el upstream para que un `git push` pelado no vaya a develop.
  - `a39cacc` **Kernel.** Sube los `@vio-/*` al set que publicó la release de
    package-database#17: database y service 1.0.269, definitions y testing 1.0.268. config,
    logger y utils siguen en 1.0.267. `yarn.lock` **no está regenerado** (ver Blockers).
  - `d8bec60` **Alta y `/me`.**
    - **Alta** (`doSave`): si el form trae `isChannel`, se crea el `UserRole` con
      `StaticData.RoleId.Publisher`. Va en la misma transacción que el usuario, antes de crear
      la identidad en Firebase y de escribir el claim, así que si el claim falla el rol igual
      queda. Si la fila del rol no existe (falta la migración), lo loguea y el alta sigue; el
      claim `channel` queda para el backfill.
    - **`GET /:id`**, que base-api expone como `/api/users/me`, suma `accountType` y
      `features`. Los demás campos no cambian. El tipo se calcula en `findById`, antes de
      `transformUserMe`, porque esa función borra `isBusiness` e `isSupplier` de la respuesta.
    - Helper puro `src/modules/user/helpers/account-type.ts` y
      `RoleService.getActiveRoleIds`, que trae los roles activos en una sola consulta.
  - `5a08d68` **Backfill.** `POST /admin/backfill-publisher-roles`, con un `AdminGuard` nuevo
    (Firebase ID token y rol 1).
    - Recorre todas las identidades de Firebase, de a 1000 (como `listPendingSignups` de
      vio-backend). A las que tienen el claim `channel`, `isChannel` o
      `product: 'broadcast'` les crea el rol 3.
    - **Es dry-run por defecto.** Solo escribe con `{ "data": { "dryRun": false } }`.
    - **Es idempotente.** No inserta si ya hay una fila con el rol 3, y no reactiva un rol
      desactivado a mano (lo lista en `inactivePublisherRole`).
    - **No toca las cuentas que también son business** (claim `business`, `isBusiness` o rol
      supplier): las lista en `conflicts`, con el motivo. Las identidades sin fila en `user`
      van a `notInDb`.
    - Sin la fila del rol, la corrida real da 409. Además, no corre dos veces a la vez en el
      mismo pod.
- **Tests:** 60 unitarios en 6 suites, sin DB (`yarn test:unit`), 28 de ellos nuevos: el
  cálculo del tipo y las features, el alta como Publisher (incluido el claim que falla y la
  falta de la fila del rol), el backfill (dry-run, idempotencia, conflictos, errores) y el
  guard. `tsc` está limpio, salvo el error de `mockRequest` en `user.service.spec.ts`, que ya
  estaba en develop. `nest build` y ESLint (errores) también pasan.
  - El token npm local da 401, así que estas pruebas se corrieron contra un `node_modules`
    armado a mano en el worktree (está gitignoreado): symlinks al `node_modules` del clon
    principal, más `@vio-/database` copiado del `dist` del worktree del kernel, cuyo `src` es
    idéntico al tag `v1.0.269`. **No se probó contra QA**: las migraciones de QA todavía no
    se corrieron.

## Decisions

Tomadas en el código; Angelo puede objetarlas.

1. **Regla del tipo:**
   - el rol 1 da `internal`;
   - el rol 3 da `publisher`;
   - el rol 2 o `isBusiness` dan `brand`.

   Si hay choque, gana internal y después publisher, y queda un `warn` en el log. Sin ninguna
   señal en la base, `accountType` es `null` y `features` es `[]`. En `/me` **los claims no
   cuentan** (ADR-0008); el backfill es el que los pasa a la base.
2. **Las features son las mismas que hoy** dan vio-backend (`ROLE_FEATURES`) y el micro de
   campañas, con los mismos strings y listas. El webapp gatea por ellas y el micro las
   reexpone tal cual.
   - ⚠️ La matriz vigente dice "Brand ❌ Channels" y "Surfaces/Campaigns ❌ (después)". Aun así,
     brand conserva `channels:manage`, `surfaces:read-footprint` y `campaigns:read-footprint`,
     para no esconderles los channels a las brands que hoy los tienen (Lyko, Aller) antes de
     la migración.
   - Para cambiarlo basta con tocar una constante (`FEATURES_BY_ACCOUNT_TYPE`). **Lo decide
     Angelo.**
3. **En el alta, `isChannel` junto con `isBusiness` da igual el rol Publisher**, con un `warn`.
   El signup manda uno o el otro, nunca los dos. En cambio, el backfill **no** asigna el rol a
   esas cuentas: el dato viejo es ambiguo y se revisa a mano.
4. **El backfill es un endpoint y no un script.** Así no hace falta un entrypoint nuevo en la
   imagen. Se llama directo al micro, porque base-api no lo expone, con el ID token de un
   admin.
5. **Kernel:** se suben los 4 paquetes que publicó la release, no solo database.
   `service@1.0.269` pinea `database@1.0.269`, así que subir solo database dejaba dos copias
   de `@vio-/database` en el árbol.

## Blockers / open questions

- **El token npm de `~/.npmrc` da 401** (`npm whoami`). Por eso no se pudo correr
  `yarn install` ni regenerar `yarn.lock`. Antes del PR hay que hacerlo con acceso al
  registro.
- **Versiones mezcladas del kernel.** La release de #17 corrió con `pkg=database`, no con
  `pkg=all`, así que los 7 paquetes no quedaron en la misma versión. El `kernel-bump.yml` de
  los micros pone **todos** los `@vio-/*` a una sola versión, y con esta release no instalaría
  (`@vio-/config@1.0.269` no existe). ¿Se republica con `pkg=all`, o los micros fijan el set
  mezclado, como hace esta rama?
- La decisión 2 (features de brand contra la matriz).

## Next session

- **Orden:**
  1. Correr la migración en el entorno (lo hace Miguel).
  2. Regenerar `yarn.lock` y abrir el PR de users, con el OK de Angelo.
  3. Desplegar.
  4. Correr el backfill en dry-run, revisar `conflicts`, `notInDb` e `inactivePublisherRole`.
  5. Correr el backfill con `dryRun: false`.
  6. Recién ahí, el micro de campañas lee `accountType` de users y borra su
     `account-type.ts`, y el middleware exime a los publishers por el rol 3.
- **Cómo correr el backfill** (con un pod concreto, para que el lock en memoria sirva):

  ```bash
  # 8000 es el targetPort del chart de users
  kubectl port-forward pod/<pod-de-users> 8003:8000
  curl -X POST http://localhost:8003/users/admin/backfill-publisher-roles \
    -H "authorization: Bearer <ID token de un admin>" \
    -H 'content-type: application/json' -d '{"data":{"dryRun":true}}'
  ```

  `BASE_PATH` es `users`, así que puede que el prefijo sea `/users`. Hay que confirmarlo con
  el `.env` del entorno.
