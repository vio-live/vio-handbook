---
date: 2026-11-05
session: vio-reel fase 2 — experiencias en el micro de campañas
participants: [angelo, claude]
status: live
---

## Goal

Arrancar [ADR-0042](../../decisions/0042-vio-reel-experiencias-gestionadas-desde-commerce.md): el reel
de Replit como experiencia gestionada desde Commerce, editable desde Replit y desde Vio, con vídeo en
Cloudflare Stream. Hoy, la fase 2 (entidad, API y subida).

## Done

- **Lectura del demo** `mote-livsstil-hub-vio.replit.app/demo/vio-reel`: el reproductor es de Replit
  (unos 45 KB de React); la SDK 0.37.7 pone sponsor, carrito, checkout, ficha y analítica. La config
  está en el código del artículo y los mp4 en el storage de Replit. Enseña tres productos de Faves bajo
  la campaña de Careless QA (los copié ayer al canal 513).
- **ADR-0042** escrito y aceptado por Angelo (`a169904`, `d3e0102`). Mux descartado: la analítica es
  nuestra. Angelo fijó dos cosas que la propuesta de Aller no decía: Aller edita en Replit y nosotros
  en Vio, sobre la misma experiencia; y el vídeo necesita infraestructura de verdad (trozos, calidades,
  CDN) → Cloudflare Stream.
- **Kernel** `package-database` [#31](https://github.com/vio-live/package-database/pull/31)
  (`f7583d0`): migración `1792900000000-surface-experience` (`surface.management_api_key` UNIQUE,
  `surface_experience`, `surface_experience_revision`, `surface_experience_media`), entidades,
  repositorios y enums. Nombres de FK los de TypeORM, para que el diff del micro quede limpio.
- **Micro de campañas** [#31](https://github.com/vio-live/vio-campaigns-microservice/pull/31)
  (`feat/vio-reel-experiencias`): dominio del documento (`src/domain/experience.ts`), puertos,
  adaptadores en memoria, TypeORM y Cloudflare Stream, guards de key de gestión, servicio y dos
  controllers (`/v2/experiences` con `X-Management-Key`, `/api/experiences` con Firebase), emisión y
  rotación de la key desde `/api/client-apps/:id/management-key`, README. Tests: 355 en memoria y 191
  contra MySQL 8 en Docker (migración real + adaptadores de producción). La suite de MySQL estaba
  atrás desde el 19/10 (faltaban `brand_profile.terms_url/refund_policy_url/highlights` y
  `surface_campaign.publisher_commission_pct`): corregida en el mismo PR.
- **Cómo se trabajó sin registro npm** (token local en 401): `node_modules` copiados del pod de
  campaigns de QA (`kubectl exec … tar | tar`) y el kernel compilado en local con esos mismos
  `node_modules` por symlink, con el `dist` copiado encima de `node_modules/@vio-/database` del micro.
  Sirve para type-check y tests; el pin de `package.json` se sube cuando salga la release.
- Handoff para Replit: [vio-reel-replit-modo-remoto](../../handoff/2026-11-05-vio-reel-replit-modo-remoto.md).
  Script de la migración en QA: `docs/handoff/assets/2026-11-05-vio-reel/m-surface-experience-qa.js`.

## Decisions

- Key de gestión **por surface**, no por publisher (el alcance de una experiencia es la surface).
- La revisión publicada congela título y sponsor además de los vídeos.
- Comprobación de productos al publicar contra el catálogo del sponsor en la surface (moneda NOK,
  mercado el primero de la surface); Commerce caído = 503, nunca un publish sin comprobar.
- Slot (`binding.slot`) se guarda desde ya; la SDK que lo use es la fase 7.

## Blockers / open questions

- **Migración en QA** antes de mergear el kernel (regla del 19/10: el freno no protege si se cancela un
  run). Escribir en la base de QA pide el OK explícito de Angelo.
- **Credenciales de Cloudflare Stream** (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`) en el
  `.env` de campaigns de QA (va horneado en la imagen: cambiar el blob y reconstruir).
- Angelo pidió que esto lo haga yo con mis agentes; Miguel solo donde yo no llego (release del kernel
  si falla el flujo por Actions, secretos).

## Next session

1. Con el OK: aplicar la migración en QA desde el pod de users, mergear el kernel con `[skip ci]`,
   `pkg=all`, disparar `kernel-published` a los 12 micros, subir el pin en el micro, mergear #31 y
   verificar en QA (`/v2/mobile/config` sigue vivo; crear una experiencia con la key de gestión de la
   surface 13 de Careless QA).
2. Fase 3: que Replit pase su bloque a modo remoto con el handoff de arriba.
3. Fase 4 en paralelo: `<vio-reel>` en la web SDK con `hls.js` bajo demanda.
