---
date: 2026-10-16
session: "front-commerce — slots: quién ocupa cada uno y de dónde viene la asignación (From page / Taken by)"
participants: [angelo, claude]
status: pr-open (follow-up #64)
---

# Session — 2026-10-16 — front-commerce: slots con origen y ocupante

## Goal
Feedback de Angelo probando el flujo de slots de punta a punta ([ADR-0034](../../decisions/0034-slots-en-web-y-vev-declaracion-por-pagina.md)
enmienda 3: la página declara sus componentes bajo una campaña, `source = 'page'`; el dashboard manda). En el dashboard no se veía
quién había asignado cada slot ni quién lo ocupaba, y el 409 del micro salía crudo.

## Done
- **PR [webapp #63](https://github.com/vio-live/webapp-vio-commerce/pull/63)** (`feat/slots-origen-y-ocupado` → `develop`, 2 commits
  `027ce4d` + `d6ef0da`, **sin mergear**; depende del PR hermano del micro, rama `feat/campana-declarada-por-la-pagina`).
- **Campaign detail › Slots** (`src/views/campaign-detail/index.jsx`): tag **"From page"** (Radix Tooltip: *The page declared this
  component under this campaign. Saving here makes it a dashboard assignment.*) cuando `campaign.slotAssignments[].source === 'page'`;
  *Taken by \<campaign\> until \<date|—\> (page|dashboard)* en gris para las asignaciones ajenas del slot
  (`GET /client-apps/:id/slots → assignments`); confirmación antes de guardar si una ventana pisa una asignación **de dashboard**
  ajena (*Some slots are taken in that window* · Back / Save anyway); 409 `SLOT_WINDOW_TAKEN` legible vía `campaignErrorOf` e inline
  en la tarjeta; tras guardar, `mutate` de la campaña **y** de los slots de la surface.
- **Surface detail › Slots** (`src/views/surface-detail/index.jsx`): agrupados por la página del `displayName` (último `" · "`; sin
  sufijo → "Other"; si nadie trae página, lista plana); por slot *\<campaign\> · until \<date|—\> · from page|dashboard* con link
  a la campaña, o *Default campaign*.
- Las dos listas pierden el sufijo de plataforma ("· Vev") cuando la surface corre en una sola (`showsPlatform`).
- **Libs:** `campaigns.js` → `source` en `slotAssignments` (`slotSourceOf`: sin el campo o con basura = `'dashboard'`), `windowsOverlap`,
  `takenBy`, `slotWindowConflicts`, textos para `SLOT_WINDOW_TAKEN` / `SLOT_NOT_IN_SURFACE`; `toSlotsBody` **no cambia**.
  `surfaces.js` → `assignments` en `fromSlot` (`fromSlotAssignment`; sin el campo = `[]`), `splitSlotPage`, `groupSlotsByPage`,
  `SLOT_OTHER_PAGE`, `showsPlatform`, `slotMeta`. Cabeceras con el contrato, marcado como "del PR hermano, sin verificar contra staging".
- **Tests:** 18 nuevos (11 de lib, 7 de vista en `test/campaigns/slots-views.test.jsx`). Suite 630/632: los 2 rojos (`payments-lib`
  Vipps, `qliro-shipping-config`) ya fallan en `develop`. Lint: los mismos 3 problemas preexistentes (`shell/index.jsx:280`,
  `combobox.jsx:31`). `next build` compila, typechequea y exporta.

## Decisions
- La confirmación solo salta contra asignaciones `dashboard` ajenas: las `page` ajenas el micro las retira al guardar (el dashboard
  manda), así que no se avisa. "Save anyway" existe porque el cálculo del cliente puede estar viejo; si el micro rechaza, el 409 se lee.
- "From page" sale de `campaign.slotAssignments` (lo más fresco tras guardar); "Taken by" de los `assignments` de la surface.
- Sin el micro nuevo nada rompe: sin `source` todo es `dashboard`, sin `assignments` todo es "Default campaign" y no hay tags.
- Sin atribución AI en commits ni en el PR (regla de Angelo; PR #61 del repo tampoco la lleva).

## Gotchas
- **Mocks de hooks en tests de vistas: devolver SIEMPRE el mismo objeto** (`mockReturnValue` con constantes). Un `jest.fn(() => ({
  channels: [] }))` crea un array nuevo por render y `ChannelsCard` de la surface (`useEffect(() => setPicked(initial), [initial])`)
  entra en bucle: jest se cuelga sin salida y deja workers huérfanos (hubo que `pkill -f jest`). Los tests existentes ya usaban
  `mockReturnValue`; el nuevo lo documenta en su cabecera.
- `next build` en un worktree nuevo falla en "Collecting page data" con `auth/invalid-api-key` si no está `.env.local` (Firebase):
  el compilado y el typecheck ya pasaron antes de eso; con el `.env.local` copiado exporta las 36 páginas.
- macOS no tiene `timeout`: `perl -e 'alarm shift; exec @ARGV' 120 npx jest …` sirve de watchdog.

## Blockers
- **Sin verificar contra staging** (solo jsdom): el contrato de `source`/`assignments` viene del PR hermano del micro, no de una
  respuesta real. Probar con el micro desplegado antes de mergear.

## Next
- Cuando el micro esté en QA: abrir una campaña con un slot declarado desde Vev y comprobar tag, "Taken by", la confirmación y el 409.
- Decidir si "Taken by" debe distinguir ventanas futuras (*from \<start\>*); hoy sigue el texto pedido.
- Worktree del PR: `/private/tmp/claude-501/-Users-angelo-vio-backend/9263fc57-ea87-4336-9d90-78f69733d041/scratchpad/webapp-slots`
  (registrado en el repo principal; `git worktree prune` cuando se limpie /tmp).

## Follow-up (misma tarde) — revisión de #63 y semántica nueva del PUT → [webapp #64](https://github.com/vio-live/webapp-vio-commerce/pull/64)

Angelo mergeó #63 antes de que cerrara la revisión; lo que faltaba va en `fix/slots-ocupado-sin-save-anyway` (`b394ffa`, PR #64 a
develop, **sin mergear**).

- **B1 — "Save anyway" era imposible:** el 409 `SLOT_WINDOW_TAKEN` no tiene override. Ahora el conflicto con una asignación de dashboard
  ajena **deshabilita Save**, pinta la fila en rojo y dice *Change the window, or free the slot from that campaign first.* Fuera el
  AlertDialog.
- **W1 — zona horaria:** `process.env.TZ = 'UTC'` al principio de `test/setup.js` (Node lo toma en caliente) y fixtures a mediodía; lo
  futuro en 2031 para no depender del día. Suite idéntica con `TZ=America/Santiago`: 637/639 en las dos.
- **W2 — rangos:** `windowLabel` → *from … to … / from … / until … / no end date*; en la surface, *Default campaign now* cuando todas las
  ventanas del slot son futuras (`isFutureWindow`).
- **W3:** `fromSlot.assignments = null` si el micro no lo manda; la surface no afirma nada en ese caso.
- **W4:** `mutateSlots()` también en 409/400; tocar un check o una ventana borra el error inline.
- **W5:** marcar un slot que otra campaña tiene desde la página → *Saving will take this slot from \<campaign\>; its page can no longer move it.*
- **Semántica nueva del `PUT /campaigns/:id/slots` (micro #16 follow-up):** gestiona SOLO las filas de dashboard; las `page` de la campaña
  se conservan salvo que `slots` liste el slot (pasa a dashboard) o vaya en `releaseSlotIds` (se borra). En el form, las filas de la
  página llevan `fromPage: true` y no viajan hasta que se les toca la ventana o se re-marcan (pierden la marca); desmarcarlas →
  `releaseSlotIds` + *Saving releases this slot from the page.* `toSlotsBody` mantiene `{ slots }` si no hay nada que soltar;
  `toSlotAssignments(initial, picked)` arma la lista. Tests byte a byte de las tres formas. La nota de W5 "saving converts From page
  slots…" quedó **sustituida** por *“From page” slots stay with the page. Changing a window makes it a dashboard assignment; unticking
  releases it.* y el tooltip por *… Change its window to make it a dashboard assignment; untick it to release it.*
- Nits: `SPONSOR_CHANNEL_ERRORS` → `CAMPAIGN_ERROR_CODES`; textos para `SLOT_DEPRECATED` e `INVALID_WINDOW`; el tag "From page" sigue al
  estado del form (desmarcada o tocada → sin tag; re-marcada = fila de dashboard, sin tag); sin `TooltipProvider` propio (lo da el
  AppShell; el test lo monta en el mock del shell); `showsPlatform(undefined)` → false; cabecera de `surfaces.js` dice que agrupar
  por `" · "` es una heurística.
- **Decidido distinto a lo pedido:** (1) los rangos llevan año (`dateLong`, "1 Dec 2031"), como el resto de fechas de campañas; (2) en
  el detalle de la campaña el rango va con separador (*Taken by X · until … (dashboard)*) para que "no end date" lea bien; (3) con la
  semántica nueva, re-marcar una fila "From page" NO devuelve el tag (pasa a dashboard al guardar).
- Orden de despliegue: **después del micro** — con el micro viejo, una fila "From page" sin tocar no se reenviaría y el reemplazo del
  set la borraría.
