---
date: 2026-10-13
session: afternoon
participants: [angelo, claude]
author: claude (agente de código del micro)
tags: [campaigns, surfaces, microservice, F3]
status: live
---

# Micro de campañas — el código (F3.3–3.6)

## Goal

Escribir la app de `vio-campaigns-microservice` mientras Miguel crea el repo y la infra
([micro-campanas-infra](../../handoff/micro-campanas-infra.md)), según ADR-0025 a 0029.

## Done

- **Repo git local** en `~/vio-commerce/worktrees/campaigns-microservice`, sin remote:
  - `develop` (`57d87e0`): el esqueleto Nest copiado de collection, con el kernel `@vio-/*`
    1.0.267.
  - `feature/app` (`8b2afe8`, `39ef209`, `9ecf0ff`): la app, los tests y el README.
- **Verificación:** 117 tests en 9 suites, `tsc --noEmit` limpio y `yarn build` OK.
  Claude volvió a correr tests y tsc al recibir el trabajo.
- **Estructura:**
  - `src/domain` tiene las reglas puras:
    - el estado de campaña en una sola función, con ventana `[inicio, fin)`;
    - la elección de la campaña por defecto;
    - una brand por channel;
    - ownership, keys ASCII y fechas UTC estrictas.
  - `src/ports` define los repos de las tablas nuevas y de Commerce. Los `create`/`update`
    reciben también los hijos, para que el adaptador TypeORM los guarde en una sola
    transacción.
  - `src/adapters/memory` sirve las tablas nuevas mientras no estén en el kernel.
  - `src/adapters/commerce` usa lo que ya existe: Firebase del kernel, `User`/`UserRole`,
    `ChannelUser`/`ChannelGroup`, y los métodos de pago de api por HTTP con cache de 60 s.
- **Rutas compatibles con vio-backend:**
  - `/api/auth/me`;
  - `/api/client-apps…`;
  - `/api/campaigns…`, con secundarios y `toggle-pause`;
  - `/api/sponsors`, `/api/sponsor/me`;
  - `/v2/mobile/config`, `/v2/mobile/campaigns/:id/components`, `/v2/mobile/components/manifest`;
  - `/v2/web/brands`;
  - `/health`.
- **Rutas nuevas:** `GET/PUT /api/client-apps/:id/channels`, `GET /api/client-apps/:id/slots` y
  `PUT /api/campaigns/:id/slots`.
- **410 para lo retirado:** las rutas de vio-backend que no se portan responden 410 con
  `{error:'gone', route, message}`. La lista está en un solo archivo,
  `src/http/retired-routes.ts`. `with-stats` también da 410.
- **Contrato:**
  - `/v2/mobile/config` del caso Lyko es **idéntica byte a byte** a la de vio-backend; solo
    agrega `campaigns[]` al final.
  - `/v2/web/brands` y `/api/sponsor/me` también son idénticos.
  - El resto se compara por forma, y las claves retiradas a propósito están listadas en
    `src/modules/presenters.ts`.
- **Infra pedida por Miguel:**
  - puerto 8000 y `/health` sin auth;
  - CORS `*` en `/v2/*` y la lista de `CAMPAIGNS_DASHBOARD_ORIGINS` en `/api/*`;
  - el `.env` se lee desde `/usr/src/app/.env`.
  
  Variables nuevas: `COMMERCE_GRAPHQL_PUBLIC_URL`, `CAMPAIGNS_DASHBOARD_ORIGINS` y
  `SDK_WEBSOCKET_BASE_URL` (opcional). Reusa `API_MICROSERVICE_URL`.
- **`/api/sponsors` no expone keys**: es una diferencia deliberada con vio-backend, que filtraba
  el `commerceApiKey` de todos los sponsors.
- **Tablas:** la propuesta para el kernel se le pasó al agente de `package-database`, que las
  suma a la rama de F2.1. Se agrega `surface_campaign_channel`, que no estaba en ADR-0029.

## Decisions (tomadas en el código; Angelo puede objetarlas)

1. **Config sin campaña activa: 404 `NO_ACTIVE_CAMPAIGN`.** vio-backend devolvía la primera
   aunque estuviera terminada, que es un bug del audit. Si la campaña por defecto no está
   activa, se usa la activa que empezó más recientemente.
2. **Tipo de cuenta:** `accountType` vale `brand`, `publisher` o `internal`, y `role` se mapea al
   valor viejo. El webapp gatea por `features`, así que no se rompe nada (verificado). Hasta
   F2.2 el tipo se deriva de `UserRole`, con los claims de respaldo.
3. **Brand de un channel:** se deriva de `ChannelGroup`. No está verificado contra datos. Sería
   mejor que api guarde la brand del channel al validar "una brand por channel".
4. **Key del sponsor:** sale solo de los channels de la campaña. Si no hay, `commerce: null`.
5. **Borrar una surface con campañas da 409.** vio-backend las borraba en cascada. El diálogo del
   webapp (#50) avisa de una cascada, y hay que ajustarlo.
6. **Cualquier brand puede ser sponsor, sin exigir Connection.** Pendiente de Angelo.
7. **`components`** devuelve `[]` más los slots de la campaña; los placements vienen después.
8. **`isPaused` pasa a boolean** en `/api/campaigns`. El webapp ya acepta los dos.
9. **Métodos de pago:** si api falla, la config sale con `[]`, cacheado 10 s.
10. ⚠️ **El adaptador de producción sirve las tablas nuevas en memoria**, por pod, con un warning
    al arrancar. Sirve para probar la infra; **no se despliega con usuarios antes de enchufar
    TypeORM**.
11. No se monta el `expressLogger` del kernel, porque loguea headers con keys. Se sacó Swagger.
12. **Imágenes `/objects/...` de vio-backend:** dejan de andar (410). En la migración hay que
    pasarlas a URLs absolutas.
13. **QA:** con `PROCESS_ENV=local`, el `.env.local` horneado en la imagen pisa al Secret
    montado. Está anotado en el README para Miguel.

## Next

- Miguel crea el repo; después Claude sube `develop` y abre el PR de `feature/app`.
- Kernel: sumar las tablas `surface_*` a la rama de F2.1, y después el adaptador TypeORM
  (cuatro pasos en el README del micro).
- Webapp #50: manejar el 409 al borrar una surface.
