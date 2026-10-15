---
date: 2026-10-15
session: "webapp: CHANNEL_IN_USE explicado en la surface, channels del publisher en el detalle de la campaña, alta de surface con timeout"
participants: [angelo, claude, front-commerce]
status: live
---

# webapp: dos reportes de Alan del 14/10 (channel en uso y alta intermitente)

## Goal

Dos reportes de Alan del 14/10 probando Surfaces y Campañas contra el micro de campañas
(`CAMPAIGNS_V2`, `api-staging.vio.live`):

- **A.** Quitar un channel de una surface daba `CHANNEL_IN_USE` con el texto crudo del micro
  ("Channel 508 is used by campaign 5") y nada más. Lo que Alan no sabía: **un channel puede
  estar en varias surfaces a la vez** (no hace falta sacarlo de una para usarlo en otra), y el
  bloqueo protege a la campaña que lo usa.
- **B.** Crear una surface falló la primera vez y anduvo la segunda. No reproducible;
  probablemente un 5xx o un cuelgue transitorio del micro (otro agente lo endurece del lado del
  micro).

Rama `fix/channel-in-use-y-alta-de-surface` en webapp-vio-commerce, base `origin/develop`
`084e46f`. Worktree `~/vio-commerce/worktrees/webapp-channel-in-use`.

## Done

Un commit local, **sin push ni PR**: `663b483` `fix(surfaces): explicar CHANNEL_IN_USE y
endurecer el alta de surface`. 10 ficheros, +483/−25.

### A1. Aviso en la tarjeta Channels de la surface (`src/views/surface-detail/index.jsx`)

- `ChannelsCard.save`: si `channelInUseOf(e)` reconoce el 409, en vez del toast crudo se muestra
  `ChannelInUseNotice` dentro de la tarjeta (el `role="alert"` con `Warning` que ya usa el repo
  en `settings/sections/shipping.jsx` y `campaign-detail`):

  > **VG — Lyko beauty** is used by [the campaign «Autumn sale»](/campaigns/5). A channel can be
  > on several surfaces, so you don’t need to remove it here to use it elsewhere. To remove it,
  > change that campaign’s channel or delete the campaign.

- De dónde salen el nombre y el id: `details` del micro (`{ channelId, campaignId,
  campaignName }`, llega con el micro del 15/10); sin `details`, el id del mensaje
  (`campaign (\d+)`) y el nombre de `useCampaigns()` si ya cargó; si no, "the campaign #5" con el
  link igual. El nombre del channel sale de las filas de la tarjeta.
- **Los checks quedan como el usuario los dejó** (desmarcado): puede volver a marcarlo y guardar
  el resto, o "Discard" (que además limpia el aviso). El aviso se limpia al reintentar.
- Cualquier otro error sigue con el toast de `errorMessage(e)`.

### A2. `channelInUseOf` y `CHANNEL_IN_USE` en las libs

- `src/lib/surfaces.js`: `channelInUseOf(e)` → `{ channelId, campaignId, campaignName }` o
  `null`. Cabecera actualizada con la forma del 409 y el hecho de que un channel puede estar en
  varias surfaces.
- `src/lib/campaigns.js`: `CHANNEL_IN_USE` en `CAMPAIGN_ERROR_TEXT` ("That channel is used by a
  campaign — change the campaign’s channel or delete the campaign first.") para los demás sitios
  que usen `campaignErrorOf`.

### A3. El detalle de la campaña ofrece los channels del publisher (`src/views/campaign-detail/index.jsx`)

- Antes `V2Fields` se montaba sin `choicesFor`, así que el selector de channel de cada sponsor
  solo daba los que ya estaban en la surface. Ahora `DetailInner` pide `usePublisherChannels()`
  (GET `/channels` del micro) y `DetailsCard` pasa
  `choicesFor = sponsorChannelChoices(id, surfaceChannels, publisherChannels)`, como hace el alta
  (`views/campaigns/form.jsx`). Se puede cambiar la campaña a otro channel de la misma brand
  aunque no esté aún en la surface: el micro lo asigna solo en el PUT (mejora 1 del 14/10).
- **Gotcha que salió al hacerlo:** `missingSponsorChannels` resolvía la brand del channel elegido
  solo con los de la surface, así que elegir uno de fuera dejaba al sponsor como "sin channel" y
  **Save deshabilitado**. Nuevo helper `withPublisherChannels(surfaceChannels, publisherChannels)`
  en `src/lib/campaigns.js` (unión por id, surface primero) y `missing` se calcula con esa lista.
- Tras guardar con `channelIds` cambiado se llama `revalidateSurface(campaign.surfaceId)` (la
  lista de channels de la surface cambió del lado del micro).
- Si GET `/channels` falla: quedan los de la surface y lo avisa ("Couldn't load your other
  channels — only the ones on this surface are listed.").
- El texto del aviso de sponsor sin channel pasa de "…on this surface" a "Every sponsor needs
  its channel." y `noChannelText` manda a Channels cuando los del publisher cargaron.
- El primary sponsor y `SponsorsCard` (secundarios) no se tocaron: `POST /:id/secondary-sponsors`
  sigue exigiendo el channel en la surface.

### B. Alta de surface

- `src/lib/surfaces.js`: `createSurface` y `updateSurface` pasan `timeoutMs:
  SURFACE_WRITE_TIMEOUT_MS` (15 000) a `vioApi`, que ya lo soportaba. Un micro colgado cae en el
  504 "Vio did not answer in time" en vez de dejar el botón girando minutos.
- `src/lib/vio.js`: `vioUnreachable(e)` → 502/503/504 o fetch que no llegó ("Failed to fetch",
  "NetworkError…", "Load failed"). Un 500 o un 4xx **no** cuentan: ahí el micro sí contestó.
- `src/views/surfaces/index.jsx` `onCreate`: en el catch, **siempre** `mutate()` de la lista (por
  si el primer intento sí creó la surface) y, si `vioUnreachable(e)`, el toast dice "Vio didn’t
  answer. Check the list before trying again."; el resto, `errorMessage(e)` como antes. El modal
  queda abierto para reintentar.

### Tests

- `test/surfaces/surfaces-lib.test.js` (23): escrituras con `timeoutMs`, `channelInUseOf` con
  `details`, sin `details`, a medias y con otro code; `vioUnreachable` por status y por mensaje.
- `test/surfaces/surfaces-views.test.jsx` (17): renderiza `SurfaceDetail` y `Surfaces` enteros
  (AppShell, nav y flag mockeados). Aviso con `details`, sin `details` (nombre de la lista de
  campañas), sin nada (solo `#5`), y otro error → toast. Alta con 504, con `TypeError('Failed to
  fetch')` y con 400: `mutate()` llamado en los tres, texto correcto, modal abierto.
- `test/campaigns/campaign-on-surface.test.js`: `withPublisherChannels`, `missingSponsorChannels`
  con un channel de fuera, `CHANNEL_IN_USE` en `campaignErrorOf`.
- `test/campaigns/campaign-detail-channels.test.jsx` (nuevo, 3): el selector del detalle ofrece el
  channel de la brand que no está en la surface (y no los de otra brand), guarda
  `{ channelIds: [497] }` y revalida la surface; si GET `/channels` falla quedan los de la
  surface con aviso; un cambio de nombre no revalida la surface.
- `npx jest test/surfaces test/campaigns`: **96/96** (40 + 56). Suite completa: 597/599; los 2
  rojos (`test/payments/payments-lib.test.js` "Vipps manda sus cuatro credenciales" y
  `test/settings/qliro-shipping-config.test.js` "los que NO tienen fallback") **fallan igual en
  la base limpia `084e46f`** (comprobado con stash), no son de esta rama.
- `npx eslint` sobre los 10 ficheros tocados: limpio.

## Decisions

- El aviso de `CHANNEL_IN_USE` **no** resetea la selección: el usuario ve por qué no se guardó y
  decide (re-marcar y guardar el resto, o Discard). Es el mismo patrón que `serverError` en
  `campaign-detail`.
- `vioUnreachable` no incluye 500: un 500 es el micro contestando, y "Vio didn't answer" sería
  mentira. El `mutate()` del catch sí corre para cualquier error, que es barato.
- Para el detalle de la campaña se reutilizan `sponsorChannelChoices` y `V2Fields` del alta en
  vez de duplicar lógica; el único añadido de lib es `withPublisherChannels`.

## Blockers / open questions

- **No verificado contra el micro levantado ni en staging**: todo es jsdom. En particular falta
  ver en Chrome el 409 real con `details` (el micro lo manda desde el 15/10, otro agente) y el
  flujo A3 de punta a punta (PUT con un channel de fuera → la surface lo tiene después).
- `api-staging` tiene `/api/client-apps` y `/api/campaigns` en lista blanca de IP (nginx de
  Oracle): desde fuera no se puede probar.
- La rama no está pusheada; sin OK de Angelo no sale de la máquina (ADR-0015).

## Next session

- Con OK: push, PR a `develop`, probar en staging con el micro que ya devuelve `details`.
- Si el micro cambia la forma de `details`, solo se toca `channelInUseOf` (y su test).
