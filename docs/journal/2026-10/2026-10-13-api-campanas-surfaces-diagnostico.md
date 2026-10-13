---
date: 2026-10-13
session: quick-fix
participants: [angelo, claude]
author: claude (svc-api)
tags: [api, campaigns, surfaces, vio-backend, diagnostico]
status: live
---

# api — diagnóstico para traer "campañas + surfaces" de vio-backend a Commerce

Solo lectura sobre `vio-api-microservice` `origin/develop` (`6718d81`). La rama local
(`feat/company-name-en-producto`) va 0 adelante / 5 atrás y no difiere en los módulos
analizados.

## Goal

Saber qué hay hoy en el servicio `api` (Campaign, Component, Channel, socket, propagación de
payment methods a `VIO_BACKEND_URL`) antes de decidir dónde vive el dominio
campañas+surfaces de vio-backend dentro de Commerce.

## Done (hallazgos verificados en código)

- **Campaign/Component están casi muertos.** Las entidades del kernel
  (`package-database` `src/entity/modules/liveshow/{Campaign,Component}.ts`, migraciones del
  2025-09-26 y 2025-09-29) son un mapeo `channelUser ↔ streamId` (livestream) y una lista de
  componentes con `type` + `data` JSON. Los únicos que llaman: los proxies de base-api
  (`src/router/campaignRouter.js`, `componentsRouter.js`) y el overlay de live-show del SDK de
  Kotlin (`DynamicComponentsService.kt:17`, host de dev y API key **escritos a mano en el
  código**). En Swift el mismo servicio existe, pero nada lo llama. Sin uso en graphql, webapp,
  vio-vev ni vio-web-sdk. La vista "My campaigns" del webapp lee `/api/stats/campaigns`
  (el colector de analytics), no este módulo.
- **Sin control de dueño:** `campaign.service.ts:16` ignora el `userId` que manda base-api.
  Además, `components.service.ts:69` busca la campaña solo por `streamId`, sin filtrar por
  channelUser.
- **`socket` no es un WebSocket:** es un proxy HTTP que reenvía a Socket.IO de base-api, y ese
  Socket.IO hace `io.emit` global (no tiene rooms ni auth en el handshake, y CORS solo deja
  entrar al dashboard). No sirve para empujar activaciones a las apps.
  `ListenerModule` sigue fuera de `app.module.ts`, así que los 4 `emit('socket-service:publish')`
  de `request.service.ts` no los escucha nadie.
- **Propagación de payment methods:** `channel.service.ts:5291-5323` hace un POST a vio-backend
  y se traga el error. Si vio-backend desaparece, el guardado de settings sigue funcionando y
  solo queda un log de error. Ojo: `HttpModule` no tiene timeout. La lista que se propaga no
  incluye `stripePaymentIntent`/card.
- **Brief desactualizado:** el chart tiene `replicaCount: 1` (no 2) y el kernel ya va en
  1.0.267. Brief corregido.

## Decisions

- Ninguna tomada. Recomendación del agente: no reutilizar `Campaign`/`Component` y no modelar
  la surface como `ChannelUser` ni como `ApiCredential`. El trade-off de dónde ubicar el
  dominio (módulo en `api` o micro nuevo) quedó documentado en el reporte al orquestador.

## Blockers / open questions

- No se pudo comprobar si `campaign`/`component` tienen filas en QA o prod: la DB solo se
  alcanza desde la VNet.
- La API key escrita en el código de los SDKs (Swift y Kotlin) hay que rotarla y sacarla.
- Hay una decisión de negocio pendiente: ¿quién es el merchant of record en una surface, el
  sponsor o el publisher como reseller? De eso depende si la surface puede ser un channel.

## Next session

- Si Angelo elige el lugar, diseñar las entidades nuevas en `package-database` (el kernel es
  compartido y requiere su OK) y retirar `Campaign`/`Component` y `VIO_BACKEND_URL`.
