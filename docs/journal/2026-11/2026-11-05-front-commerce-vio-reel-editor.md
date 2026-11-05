---
date: 2026-11-05
session: evening
participants: [angelo, claude]
status: live
---

# Session — 2026-11-05 — front-commerce: editor completo de una experiencia (ADR-0042, fase 5)

## Goal
La página propia del editor de una experiencia de Vio Reel en `webapp-vio-commerce`:
`/campaigns/:campaignId/experiences/:experienceId`, con vídeos (subida directa a Cloudflare o URL),
productos del catálogo del sponsor con imagen sustituida y punto focal, cues en el tiempo del
reproductor, theme, preview del borrador resuelto, publish, historial con rollback. Sigue a la
fase 5 mínima de la tarde (`2026-11-05-front-commerce-vio-reel-dashboard.md`). Worktree
`~/vio-commerce/worktrees/webapp-vio-reel`, rama `feat/vio-reel-dashboard` sobre `origin/develop`
dc195b8. **Sin commit ni push**: Angelo revisa y commitea. Único gate: `canManageExperiences`
(internal); nada de flags de entorno.

## Done
- **`src/lib/experiences.js`** (ampliada; cabecera con el contrato completo del micro):
  `fromExperience` ahora lleva `draft` (listas garantizadas), `media` (`fromMedia`) y `revisions`
  (`null` si la respuesta no las trae; nuevas primero). Nuevo: `useExperience`,
  `useExperienceRevisions`, `updateExperienceDraft` (`PUT …/draft`, `If-Match`, solo los campos que
  se pasan, `draft` normalizado), `rollbackExperience` (`If-Match` + `{ revision }`),
  `previewExperience`, `createMedia` (`upload` → devuelve `upload.url`; `url`), `listMedia`,
  `getMedia`, `deleteMedia`, `uploadToProvider` (XHR multipart `file`, sin cabeceras, progreso 0..1),
  `waitForMedia` (sondeo cada 5 s, 3 min; `timedOut`). Validación en el front con los límites del
  micro: `normalizeDraft`, `draftErrors` (paths como `details.path`), `VIDEO_ID_RE`, `LIMITS`,
  `THEME_TOKENS`, `isThemeName/Value`, `slugifyVideoId`. Helpers de vista: `cueTime`,
  `activeCueProductId`, `isHlsUrl`, `mediaUsedElsewhere`, `sponsorChannelOf`, `fromCatalogProduct`,
  `previewProductOf`, `experienceErrorOf`, `isMediaInUse`.
- **`src/views/experience-editor/`** (nueva): `index.jsx` (página: cabecera con Back, título
  editable, `Draft`/`Published · rN`, `vN`, `Unsaved`, History, Preview, Save draft, Publish;
  estado del formulario con línea base; subidas; publish; rollback; guardas de salida),
  `videos.jsx` (lista ordenable ↑/↓, id/título, badge de media, Upload video con barra, Paste URL
  con `FormDialog`, quitar con `AlertDialog` y opción de borrar el archivo), `selected.jsx`
  (reproductor, picker de productos del channel del sponsor, fila por producto con imagen
  sustituida y focal por sliders o clic, cues con «Add cue at current time» y resaltado «In video
  now»), `theme.jsx` (plegable, 5 tokens, el resto del theme se conserva), `preview.jsx` (diálogo
  con el documento resuelto: vídeo + tarjetas + «I videoen nå»), `player.jsx` (`<video controls
  playsinline>`; HLS con hls.js 1.5.17 del CDN cargado una sola vez si el navegador no lo reproduce
  nativo).
- `pages/[[...slug]].jsx`: rama `/campaigns/\d+/experiences/\d+` ANTES de `/campaigns/\d+`.
- `src/views/campaign-detail/experiences.jsx`: el título de cada fila abre el editor; la nota
  «The full editor … is coming» pasa a «Open an experience to edit…».
- Tests: `test/experiences/experiences-lib.test.js` (33), `experience-editor.test.jsx` (10, nuevo),
  `experiences-card.test.jsx` (10). `npx jest test/experiences test/campaigns test/surfaces
  test/access`: 17 suites / 272 verdes. `npx jest` completo: 99 suites / 997 tests, 995 verdes; las
  2 rojas (`payments-lib` Vipps, `qliro-shipping-config`) son las de siempre, idénticas a develop.
  ESLint limpio sobre lo tocado.

## Decisions
- **Channel del sponsor** (`sponsorChannelOf`): de `campaign.channelIds` (`useCampaign`), el que en
  `useSurfaceChannelList(exp.surfaceId, true)` tiene `brandId === exp.sponsorId`. Solo la lista de
  la surface (el micro asigna a la surface los channels de la campaña al guardar); no se pide
  `GET /channels` del publisher. Si la campaña tiene un solo channel y no se conoce su brand, se
  asume ese. Sin channel: aviso y sin picker. `enabled = true` explícito porque las experiencias
  solo existen con el micro detrás de las rutas.
- **Productos**: la misma capa que `/channels/:id` — `useChannelItems(channelId, { page: 1,
  size: 25, search: { mode: 'productTitle', value } })` de `src/lib/channels.js` (base-api
  `channel/user/bychannelUserId/:id`), con `useDebounced`/`PickSearch` de `views/products/pick-row`.
  Precio con `money(amount, currencyCode)` (`price.amount`, como pinta channel-detail), nunca
  `publicPrice`. Los productos vistos se recuerdan en `known` (id → producto) para nombrar los que
  ya están en el borrador y para completar la preview.
- **Guardado explícito**: `dirty` = formulario ≠ línea base (lo último que coincide con el micro).
  409 `EXPERIENCE_STALE` → toast «changed elsewhere; reloaded», `mutate()`, el formulario se
  mantiene con «Unsaved» y un aviso de que guardar pisa la otra versión. Si el micro cambia de
  versión sin cambios locales, el formulario se recarga solo.
- **Preview y Publish actúan sobre el borrador GUARDADO** (`GET /preview` y `POST /publish` son del
  servidor): con cambios sin guardar quedan deshabilitados con la pista «Save the draft first».
- **Borrar la media al quitar un vídeo se difiere al Save**: hasta guardar, el borrador del micro la
  sigue usando y `DELETE` daría 409 `MEDIA_IN_USE`. Queda en `pendingDeletes` y se borra tras el PUT
  si el borrador guardado ya no la referencia; un 409 se ignora.
- **Media local vs servidor** (`mediaOf`): manda la lectura más avanzada (`ready` > `error` >
  `pending`). Primero olvidaba la local tras `mutate()` y, si el hook aún no traía la media, la fila
  caía a «No video» (lo cazó el test del sondeo).
- Subidas: el job se indexa por `m<mediaId>` en cuanto existe la media (antes `v<videoId>`), así
  sobrevive a renombrar el id del vídeo. Si la subida pasa pero el sondeo agota 3 min, la fila dice
  «still processing after 3 minutes; reload later».
- `<vio-reel>` de la SDK publicada: NO se integra (el webapp no depende de `@vio-live/web-sdk`);
  queda anotado en `preview.jsx` y `player.jsx` para sustituir el reproductor simple.
- Guardas de salida: `beforeunload` + `Router.events` `routeChangeStart` con `window.confirm` (una
  sola mecánica para Back, sidebar y pestaña); no había precedente de `beforeunload` en el repo.
- Forma de `videos[].products[]` en el documento resuelto de la preview: no está escrita;
  `previewProductOf` es tolerante y completa con `known`. Hay que ajustarla contra staging.

## Blockers / open questions
- Nada verificado contra staging con el navegador (ni el micro, ni la subida a Cloudflare, ni HLS):
  todo contra el contrato del coordinador y jsdom. Lo primero a mirar en QA: `upload.url` acepta
  el POST multipart sin cabeceras desde el navegador (CORS), y la forma de `products[]` del preview.
- Queda un aviso «not wrapped in act» en el test de Upload (microtareas entre el XHR falso y la
  primera lectura con timers falsos); no falla nada.
- History/Restore no tiene test de vista (Radix DropdownMenu en jsdom); la lib sí cubre el rollback.
- El id de vídeo sigue al título solo mientras coincida con el slug del título anterior; editado a
  mano, se queda.

## Next
- Angelo revisa el diff y commitea en `feat/vio-reel-dashboard`; smoke en QA con una experiencia
  real: subir un mp4 corto, ver `pending → ready`, añadir producto y cue, Save, Preview, Publish,
  Restore.
- Cuando la SDK publique `<vio-reel>`, cambiar `preview.jsx` al componente real.
