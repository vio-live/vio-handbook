---
date: 2026-11-05
session: afternoon
participants: [angelo, claude]
status: live
---

# Session — 2026-11-05 — front-commerce: Vio Reel en el dashboard (ADR-0042, fase 5 mínima)

## Goal
Dos piezas en `webapp-vio-commerce` para que el equipo de Vio pueda operar experiencias de
Vio Reel desde el dashboard sin esperar al editor completo: la **Management key** de la
surface (la key del CMS del publisher) y la tarjeta **Experiences** del detalle de la campaña
(lista, alta con título, publish, delete). Trabajo en el worktree
`~/vio-commerce/worktrees/webapp-vio-reel`, rama `feat/vio-reel-dashboard` desde
`origin/develop` 7c60a21. Sin commit ni push: Angelo revisa y commitea.

## Done
- `src/lib/experiences.js` (nuevo): cabecera con el contrato del micro (`GET /experiences?campaignId=`,
  `POST /experiences`, `POST /experiences/:id/publish` con `If-Match: <version>`, `DELETE`),
  `fromExperience`, `byExperienceNewest`, `useExperiences(campaignId, enabled)`,
  `createExperience`, `publishExperience`, `deleteExperience`, `isExperienceStale`.
- `src/lib/surfaces.js`: `managementApiKey` en `fromSurface`, `issueManagementKey` /
  `revokeManagementKey` (`POST`/`DELETE /client-apps/:id/management-key`) y el contrato en la
  cabecera.
- `src/lib/access.js`: `canManageExperiences(account)` = `accountTypeOf(account) === 'internal'`.
  Es el ÚNICO gate; para abrirlo al publisher se cambia solo ese helper.
- `src/views/surface-detail/index.jsx`: `ManagementKeyCard` (exportada) debajo de `ApiKeyCard`:
  Generate / copiar / Rotate (`window.confirm`) / Revoke (`window.confirm`); `useAccess()` en
  `DetailInner` para el gate.
- `src/views/campaign-detail/experiences.jsx` (nuevo): `ExperiencesCard` con `SettingsCard`,
  diálogo "New experience" (solo título, `FormDialog` + react-hook-form + zod), filas con
  `StatusBadge` (Draft / Published · r{n}), "Updated {dateLong} · N videos", Publish y Delete.
  409 `EXPERIENCE_STALE` → toast "The experience changed elsewhere; reloaded" + `mutate()`;
  400 del publish → `message` del micro tal cual. Enganchada después de `SlotsCard` en
  `#campaign-settings`; la tarjeta decide sola si la cuenta la ve.
- Tests: `test/experiences/experiences-lib.test.js` (14), `test/experiences/experiences-card.test.jsx`
  (9), `test/surfaces/management-key-card.test.jsx` (5), más casos en `surfaces-lib.test.js` y
  `access-matrix.test.js`. Suite completa en verde; eslint limpio sobre lo tocado.

## Decisions
- ADR-0042 (fase 5 mínima). Dos ajustes de alcance de Angelo durante la sesión:
  1. **Sin flag de entorno** (`VIO_EXPERIENCES` / `EXPERIENCES_V1` no existen): solo el gate por
     tipo de cuenta.
  2. **Sin código defensivo para prod**: la tarjeta no se oculta con 404 de la lista; un error
     de carga se muestra como en las tarjetas vecinas. Esto no va a `main` hasta que el micro
     tenga las rutas en prod.
- Rotate/Revoke usan `window.confirm` (pedido explícito), a diferencia de `ApiKeyCard` que usa
  `AlertDialog`. Si se quiere paridad visual, es un cambio local a `ManagementKeyCard`.
- Fecha de la fila con `dateLong` (lo que usan las tarjetas vecinas de este detalle), no `dateTime`.

## Blockers / open questions
- Contrato del micro verificado SOLO contra la forma de respuesta que pasó el coordinador, no
  contra staging con el navegador (las cabeceras de las libs lo dicen).
- El ADR-0042 documenta `/v2/experiences` (la puerta del CMS con `X-Management-Key`); el
  dashboard usa `/experiences` detrás de `vioApi` (`/api`). Son dos puertas distintas, queda
  anotado en la cabecera de `experiences.js`.
- "Draft changed after publish" no se puede saber desde la lista: la vista no lo afirma.

## Next session
- Angelo revisa el diff del worktree y commitea; probar en staging con una cuenta `internal`
  contra el micro de QA (crear → publish vacío debe dar 400 `EXPERIENCE_EMPTY`; rotar la key).
- Editor completo (vídeos, productos, cues) y apertura al publisher (solo `canManageExperiences`).
