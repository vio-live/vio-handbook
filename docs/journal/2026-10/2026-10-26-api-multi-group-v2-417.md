---
title: "api: multi-group/v2 respondía 417 después de guardar el item"
date: 2026-10-26
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-10-26 (api, multi-group/v2 417)

## Goal
Prod, 12:00 UTC: `POST /channel/multi-group/v2` con `{ user_id: 1330, channel_id: 10, channel_user_id: 482, data: [{ collection_shared_id: '927UL4Z6k' }] }` respondió 417 "Cannot read properties of undefined (reading 'id')", pero la fila de `channel_group` quedó creada. Más errores `[cacheService.remove] key is required`, también en el borrado de item (200).

## Done
- Causa: `createMultiChannelGroupV2` pedía la respuesta con `getChannelUserByIdV2(data.user, …)`; base-api manda `user_id` y ningún `user`. `buildChannelUserByIdV2` lee `user.id` en la consulta de `channelInfo` (`src/modules/channel/providers/channel.service.ts:1164` en develop = master), así que lanzaba **después** del insert, del hook `channel-process/collections/update` y de todas las invalidaciones. El 417 lo pone el catch del controller.
- `key is required`: `manageCacheChannelUser` llamado sin key (desde `deleteCacheChannelUser` y `GET /channel-user/:id/cache/keys`) escribía `[undefined]` → Redis guarda `[null]` en `USER_CHANNEL_ID_<id>_KEYS` → cada invalidación posterior hacía `remove(null)`. Es ruido, no rompe nada, pero sale en cada alta y borrado de ese channel.
- El log decía `createChannelGroup` porque la metadata del controller de multi-group/v2 estaba copiada de `group`.
- Arreglo en `fix/multi-group-v2-417` (commit `d6de0a5`), PR [vio-api-microservice#70](https://github.com/vio-live/vio-api-microservice/pull/70) a develop. Sin merge ni deploy.
  - La respuesta se pide para `{ id: data.user_id }`; `buildChannelUserByIdV2` recibe `Pick<Entity.User, 'id'>`.
  - `manageCacheChannelUser` sin key sólo lee; se saltan los `null` ya guardados.
  - Metadata y log del controller con su nombre real.
- Test nuevo `multi-group-v2-user-id.unit.spec.ts` con el body exacto de prod: falla contra el código anterior con el mismo TypeError y pasa con el fix (alta, hook de colecciones, key V2, registro de keys, `RemoveProductsCache` con la API key). `test:unit` 321/322; el que falla (Stripe Connect OAuth) y los errores de tipos de paymentMethod ya fallaban en develop. `nest build` OK.

## Decisions
- La identidad del usuario para la respuesta sale de `user_id`, igual que la búsqueda del channel y la key de cache. No se acepta `data.user` como alternativa: base-api no lo manda y dos fuentes de verdad para el mismo usuario es lo que causó el fallo.

## Blockers / open questions
- No verifiqué en el código de base-api si alguna vez mandó `user` (el `data.user` viene del squash de abril). El test anterior (`multi-group-v2-without-page`, #66) lo daba por hecho; ya no.

## Next session
- Merge de #70 a develop y prueba en QA.
- Prod: `master` y `develop` no difieren en `src/`; el commit se aplica limpio sobre master (cherry-pick a una rama `-master`).
