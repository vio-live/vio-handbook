---
date: 2026-10-13
session: "webapp: Surfaces y Campañas del Publisher contra vio-backend (F4, primer corte)"
participants: [angelo, claude]
status: live
---

# webapp: Surfaces y Campañas del Publisher (F4, primer corte)

## Goal

Primer corte de F4 del [plan de ejecución](../../handoff/campanas-en-commerce-plan-de-ejecucion.md).
Se construyen las pantallas de **Surfaces** y **Campañas** del webapp contra el contrato **actual**
de vio-backend (`api-staging.vio.live`, cliente `vioApi`). Según
[ADR-0027](../../decisions/0027-servicio-de-campanas-contrato-y-slots.md), el micro de campañas
mantiene esas rutas, así que el front no cambia al cortar. Lo nuevo de ADR-0027 queda detrás de un
flag.

## Done

- Rama local **`feature/brand-publisher`** de webapp-vio-commerce, en el worktree
  `~/vio-commerce/worktrees/webapp-brand-publisher` (desde `origin/develop` `dfb2b41`). Tiene
  **4 commits y no tiene push ni PR**. Se le quitó el upstream `origin/develop` para que un
  `git push` pelado no vaya a develop.
  - `87e746f` **Capa de datos.** `src/lib/surfaces.js` y `src/lib/campaigns.js` documentan el
    contrato en la cabecera y mapean ida y vuelta. El estado de la campaña sale de un solo helper,
    `campaignStatus`. En `src/lib/vio.js` entran el flag `CAMPAIGNS_V2`, `VIO_ENABLED` y la
    normalización de errores `{ error }`.
  - `193be37` **Nav.** Grupo *Publishing* con Surfaces (`surfaces:manage`) y Campaigns
    (`campaigns:manage`). Se filtra con `navGroupsFor(account)` a partir de `/auth/me`.
    `FeatureGate` cubre la URL directa.
  - `ad12b1b` **Pantallas:**
    - `/surfaces`: lista y alta.
    - `/surfaces/:id`: editar, plataformas, API key (copiar y regenerar con confirmación), sus
      campañas y borrar.
    - `/campaigns`: lista con filtros de estado y surface, pausar o reanudar, y alta.
    - `/campaigns/:id`: editar básicos, pausar o reanudar, y sponsors secundarios.
    - Los detalles van por el catch-all.
  - `af2c39f` **Copy.** La cuenta "Channel" se llama **Publisher** en el switcher de
    login y signup. Es solo texto: no cambian `isChannel`, el claim ni el destino post-signup.
- **Tests:** 41 suites y 349 tests (antes 37 y 297). Solo siguen rojos los 2 conocidos de develop:
  `payments-lib.test.js:67` y `qliro-shipping-config.test.js:249`. Hay tests nuevos en
  `test/campaigns`, `test/surfaces` y `test/shell`:
  - una matriz que compara `campaignStatus` con el `isCampaignActive` del server;
  - los bodies con el flag y sin él;
  - los diálogos y el gate.
- **Lint** sin problemas nuevos (los 3 que hay son de develop). El **build** (`output: export`)
  pasa y exporta `/surfaces` y `/campaigns`.
- **Verificado en un Chrome real con un harness local**, sin tocar staging. La sesión de
  Firebase se inyecta en IndexedDB y base-api y vio-backend se interceptan con fixtures. Las 4
  vistas y los diálogos renderizan sin errores. El alta manda
  `POST /api/campaigns {"name":…,"clientAppId":12,"primarySponsorId":4}`, sin campos V2. Regenerar
  la key manda `{userId}` del dueño. Con `VIO_CAMPAIGNS_V2=true` aparecen channels, campaña por
  defecto, slots, markets y custom-web.

## Decisions

- **`/client-apps` y no `/client-apps/with-stats`.** with-stats carga todos los broadcasts de
  todos los tenants para stats (viewers, engagement) que no aplican. El nº de campañas por
  surface se deriva de `GET /campaigns`, que la vista ya pide. El micro no necesita portar
  with-stats para el webapp.
- **Precedencia del estado:** terminada > pausada > programada > activa. Las fronteras son las del
  server (`now >= start`, `now >= end`): "activa" en el front es lo mismo que activa en el server.
- **El sponsor primario es de solo lectura en el detalle.** El PUT de vio-backend exige que el
  sponsor sea del mismo tenant (`sponsor.userId === campaign.userId`), pero el POST acepta
  cualquiera del catálogo compartido. Con un sponsor compartido, editarlo daría 403.
- **PATCH, regenerate y DELETE de surface mandan el `userId` del dueño** que vino en el GET, no
  el del operador. Así una cuenta internal puede editar la surface de otro. El guard de ownership
  corre antes, así que no se abre nada.
- **Flag `VIO_CAMPAIGNS_V2`** (en `next.config.js → env`, apagado). Con el flag apagado, la UI no
  muestra los campos de ADR-0027 y las libs no los mandan. `custom-web` se ve deshabilitado, con
  el aviso "Arrives with the new campaigns service."
- **No se expuso borrar campañas** porque no estaba en el alcance. La ruta existe en vio-backend.

## Hallazgos del contrato de vio-backend (insumo para el micro, F3.4)

- 🔴 **`GET /api/sponsors` devuelve el `commerceApiKey` de todos los sponsors a cualquier tenant**,
  porque el catálogo es compartido. El front lo descarta al mapear, pero la respuesta lo trae.
  El micro no debería exponerlo.
- `PATCH /client-apps/:id` hace `updateClientApp(id, resto del body)` **sin whitelist**: un
  `apiKey` en el body lo pisaría. El front manda solo los campos editables.
- `POST /campaigns` hace `{...req.body}` a la tabla sin validar. Por eso los campos V2 no se
  mandan.
- `GET /campaigns` resuelve `sponsorName` solo con los sponsors del tenant. Con un sponsor de otro
  tenant sale undefined, y el front lo resuelve con `/sponsors`.
- `secondary-sponsors` responde los errores como `{ error }`, no como `{ message }`. `vioApi` los
  normaliza.
- `isPaused` es el string `'true'`/`'false'`. El micro lo va a tener boolean, y
  `isPausedValue` acepta los dos.
- `DELETE /client-apps/:id` borra en cascada las campañas de la surface. El diálogo de borrado lo
  avisa.

## Blockers / open questions

- **Staging sin verificar:** no hay push. Además, las cuentas QA documentadas son business y no
  tienen `surfaces:manage`. Para probar en staging hace falta una cuenta publisher (signup como
  "Publisher" en QA).
- **Prod:** `VIO_HOST` no se deriva en prod a propósito (`src/lib/vio.js`), así que la nav nueva no
  aparece ahí hasta que se configure `VIO_API_HOST`.
- **El signup de Publisher sigue mandando a `CHANNEL_DASHBOARD_URL`**, el dashboard viejo. Ahora
  que el webapp tiene Surfaces y Campañas, quizá deba quedarse en el webapp. Lo decide Angelo; no
  se tocó porque es lógica de signup.
- **AppShell manda a `/user-deactivated` a las cuentas sin `subscriptions`.** ADR-0028 exime a los
  publishers de la suscripción para sus keys. Si una cuenta publisher nace sin suscripción en
  Commerce, no entra al webapp. No está verificado.

## Next

- Con OK de Angelo: push y PR a develop, y verificar en staging con una cuenta publisher.
- **F4 resto:**
  - las vistas de solo lectura para business (`surfaces:read-footprint` y
    `campaigns:read-footprint`);
  - los Channels como grupos de productos (depende de F2);
  - Mi marca ya existe en Settings › Brand.
- **Al cortar al micro:** encender `VIO_CAMPAIGNS_V2` y revisar las cabeceras de
  `src/lib/surfaces.js` y `src/lib/campaigns.js`. Ahí está todo el contrato.
