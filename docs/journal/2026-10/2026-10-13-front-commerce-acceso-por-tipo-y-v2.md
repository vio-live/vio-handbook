---
date: 2026-10-13
session: "webapp: qué ve cada tipo de cuenta, getting started del publisher y UI V2 contra el micro"
participants: [angelo, claude]
status: live
---

# webapp: acceso por tipo de cuenta, getting started y UI V2 contra el micro

## Goal

Segunda tanda de F4 en la rama `feature/brand-publisher` del webapp (PR #50, que actualiza el
coordinador):

- **P1–P4 (Angelo, 13/10):**
  - restringir lo que ve cada tipo de cuenta;
  - eximir al publisher de la suscripción;
  - "Getting started" del publisher;
  - inventario y propuesta para sus pasos 1 y 2.
- **A–C:**
  - UI V2 contra el contrato del micro de campañas;
  - tolerar sus diferencias con vio-backend;
  - probarlo de punta a punta contra el micro.

## Done

Hay 4 commits locales sobre `af2c39f`, sin push, en el worktree
`~/vio-commerce/worktrees/webapp-brand-publisher`.

- **`705017c` Matriz de visibilidad (P1 y P2).**
  - `src/lib/access.js` tiene una sola función, `sectionsFor(account)`, que usan la nav, el
    guard de rutas del AppShell y el rail de Settings.
  - `accountType` se normaliza: `business→brand` y `seller→publisher`, así anda con vio-backend y
    con el micro. Sin cuenta de Vio, todo queda como hoy.
  - **URL directa a una sección ajena:** redirige a `/home` con un aviso.
  - **Exención del publisher:** el AppShell y `/user-deactivated` ya no lo mandan a reactivar si
    no tiene suscripción (ADR-0028).
  - **Header:** sin "Add product" ni "Upgrade" para quien no ve Products ni Plan.
  - Se fue `FeatureGate`.
- **`14e9687` Orders del publisher en solo lectura.**
  - Ni la lista ni el detalle tienen selección, aceptar, enviar, cancelar, tracking,
    devoluciones ni el panel de Vipps.
  - Su parte se muestra como "Your cut".
- **`3433b27` Getting started (P3).** Son 4 pasos, con link y estado sacado de:
  - `request/user`, `channel/user`, `/client-apps` y `/campaigns`;
  - el paso de surface ↔ channel queda "Coming soon · Arrives with the new campaigns service"
    sin el flag.
- **`c079a0a` UI V2 (A y B)**, contra `campaigns-microservice` `feature/app`.
  - **Surface:** channels asignados, slots de solo lectura, markets, custom-web y dominios.
  - **Campaña:** un channel por sponsor, campaña por defecto y slots con ventana.
  - **Sponsors:** el picker ofrece solo brands con un channel en la surface.
  - **Borrar surface:** con el micro da 409; el diálogo pide borrar las campañas antes. Borrar
    campaña ya está en el detalle.
- **Tests:** 46 suites y 433 tests; solo siguen rojos los 2 conocidos de develop. Lint sin
  problemas nuevos. Build OK.
- **Navegador (harness local):**
  - publisher sin suscripción entrando;
  - `/listings` y `/settings/billing` llevan a `/home` con el aviso;
  - orders en solo lectura;
  - Settings sin el grupo "Selling";
  - brand sin Channels ni Surfaces.
- **C, punta a punta contra el micro de verdad.** Compilé el micro a mi scratchpad (su repo
  quedó limpio) y lo levanté con su app real y los adaptadores en memoria. El
  `InMemoryCommerce` verifica tokens por string, así que el token falso del harness pasa la auth
  propia del micro sin Firebase. El flujo y lo que respondió el micro:
  1. `POST /client-apps`, con web + dominios y custom-web → 201;
  2. `PUT /client-apps/2/channels` con `[491,493]` → 200; el 493, de dos brands, queda marcado;
  3. manifest del SDK con la key de la surface → 200, y los slots aparecen;
  4. `POST /campaigns` con `{…, primarySponsorId: 500, channelIds: [491]}` → 201; el sponsor
     sale solo de las brands de la surface;
  5. `PUT /campaigns/1/slots` → 200;
  6. borrar la surface → el diálogo pide borrar la campaña;
  7. getting started con los 4 pasos hechos → la card desaparece.

  Hubo 0 errores de consola.

## Decisions

- **El shell espera `/auth/me` antes de montar la vista.** Si no, una sección ajena alcanzaba a
  pedir datos antes del redirect. `/auth/me` tiene un timeout de 8 s y, si Vio no contesta, el
  webapp queda como hoy.
- **El aviso de "sección no permitida" vive a nivel módulo.** El `ShellFallback` de los
  `dynamic()` monta su propio AppShell mientras baja el chunk; esa instancia consumía el
  `?blocked` y se desmontaba con el aviso. Lo encontré en el navegador; en jest no se veía.
- **Lo que vive en Vio pide además la feature** de `/auth/me`. Sin eso, el `viewer` de un
  tenant, tipado `seller`, vería Surfaces y recibiría 403.
- **En el alta V2, `isDefault` solo viaja si está marcado**: el micro deja por defecto la
  primera campaña de la surface.
- **Los slots se asignan en el detalle de la campaña** (`PUT /:id/slots` pide el id).

## Propuesta — pasos 1 y 2 del publisher (P4, sin implementar)

**Paso 1: pedir acceso al catálogo de una brand.**

- **Hoy existe:**
  - `/connections`: invitar por username, email o id (`validate-exist` → `POST request`, o
    `request/external` por correo), Incoming con Accept/Decline y Sent con Cancel;
  - la brand comparte colecciones con `request/share-multiple-collection`. collection crea
    `collection_shared` y replica cada producto como custom-product del receptor;
  - `collection/shared/me` solo muestra las de partners conectados.

  O sea: conexión + colecciones compartidas ya *son* el acceso al catálogo, y funciona.
- **Falta:**
  - descubrir brands: hay que conocer su username o email;
  - el tipo de cuenta del partner: la request no lo trae, y depende de F2.2;
  - que aceptar dé productos: después de aceptar, la brand tiene que ir a compartir
    colecciones, y si no lo hace el publisher queda trabado sin aviso;
  - verificar el límite `connections` del plan Free con el que nacen los publishers.
- **Propuesta v1, sin backend nuevo:**
  - para la brand, en Incoming, "Accept and share collections": `respondRequest` +
    `shareCollections`, que ya existen;
  - en Getting started, un sub-estado "connected, waiting for collections" cuando
    `shared/me` está vacío;
  - el directorio de brands queda para después.

**Paso 2: armar un channel con productos de una brand.**

- **Hoy existe:**
  - el alta de channel por token: `users/me/api-credentials` → `POST channel/user {channel_id,
    customName, apiToken}`;
  - el `AddProductsModal` con colecciones compartidas (`collection_shared_id`, con su owner) →
    `multi-group/v2` por tandas.

  Sirve tal cual.
- **Falta:**
  - **Tipo:** un channel sin tipo hoy da 500 en `/` y `/verifyToken` en develop, 401 en la rama
    de F2.0 y 401 en graph.
  - **Key:** la key es una por usuario y tipo (hasta F2.3). Dos channels "Vio" de un publisher
    comparten key, y el SDK caería en uno arbitrario.
  - **Una brand por channel:** nada la valida. El micro la exige recién al usarlo en una campaña
    (`CHANNEL_NOT_SINGLE_BRAND`).
  - **Productos sueltos:** el picker ofrece productos *propios*. Para un publisher, solo sirven
    las colecciones compartidas.
- **Propuesta v1:**
  - **"New channel" del publisher, sin tipos en la UI:**
    1. nombre;
    2. una brand conectada;
    3. sus colecciones compartidas.

    Por debajo: `createApiCredential` + `createChannel({ channelId: 10 /* Vio SDK, oculto */ })` +
    `addChannelItemsBatched` con `collection_shared_id`. Para el publisher se esconden el
    provider, el sync y el tab de pagos (cobra la brand; F2.7).
  - **Una brand por channel, en el front:** el picker filtra por owner y no deja mezclar. En el
    back, validarlo en api `createMultiChannelGroupV2` (ADR-0028) es tarea del agente de api.
  - **Hasta F2.3:** un solo channel "Vio" por publisher, con aviso. ⚠️ Eso deja **F2.3 en el
    camino crítico** para publishers con más de una brand (VG + Lyko + …).
  - **Verificar con el agente de middleware** que el tipo 10 esté en la matriz `allowAccess` de
    los micros que el SDK llama por REST. El camino de graph no la aplica.

## Blockers / open questions

- Las mismas del primer corte: staging en lista blanca, sin cuenta publisher de QA y prod sin
  `VIO_API_HOST`.
- Sin `VIO_API_HOST` (prod hoy), un publisher sin suscripción todavía va a `/user-deactivated`.
  Es lo pedido ("sin cuenta de Vio, como hoy"). Si hace falta, se podría usar como respaldo el
  claim `channel` de Firebase.
- La badge de estado de una orden `AUTHORIZE` dice "Action required" aun en solo lectura. Es
  menor y lo dejé así.
- El micro valida el sponsor como brand, pero no exige que tenga un channel en la surface.
  El front lo restringe; ¿lo debería exigir el micro también?

## Next

- El coordinador actualiza el PR #50.
- Si Angelo aprueba la propuesta de P4: el wizard "New channel" del publisher, "Accept and share
  collections", y las tareas para api (validar una brand por channel) y middleware (tipo 10).

## Addendum (tarde): cada sponsor con su channel (`f658c69`)

El micro (feature/typeorm `95bf21a`, "solo brands con Connection") exige que cada sponsor,
primario y secundarios, lleve elegido un channel de esa brand asignado a la surface. Si no, da
400:
- `SPONSOR_NOT_ON_SURFACE`;
- `SPONSOR_CHANNEL_REQUIRED` (el mensaje lista los posibles);
- `CHANNEL_NOT_OF_SPONSOR`.

Ya no existe `SPONSOR_HAS_CHANNEL`: quitar un secundario saca también su channel.

En el webapp, detrás de `VIO_CAMPAIGNS_V2`:
- el secundario se agrega con su `channelId`;
- no hay "sin channel";
- el alta y la edición no mandan mientras falte un channel (`missingSponsorChannels`);
- los errores se muestran con el texto del micro (`campaignErrorOf`).

Lo probé contra el micro compilado en `95bf21a`:
- con curl: los 3 códigos, con la forma `{message, code}`;
- en el navegador: `POST secondary-sponsors {sponsorId:501, channelId:492}` → 201 y `DELETE` → 200.

Con el flag apagado no cambia nada. Bug de paso: el auto-elegir del channel dependía de la
identidad del array y borraba la elección en cada render.

