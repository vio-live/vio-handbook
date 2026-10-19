---
date: 2026-10-19
session: prod-source-migration
participants: [angelo, claude]
status: live
---

# Session — 2026-10-19 — Prod: migración `source` de los slots y release del micro de campañas

## Goal

Retomar el programa de slots tras el viernes: cerrar la publicación de la SDK web 0.24.0, dar status y
preparar en prod la migración de `surface_campaign_slot.source` antes del siguiente release del micro de
campañas. Angelo decidió que la ejecución en prod la hace Miguel.

## Done

- **SDK web 0.24.0 ya estaba en npm**: el `npm publish` del lunes devolvió `E403 cannot publish over
  0.24.0` (el E404 anterior era sesión caducada, no un fallo de publicación). Vev 0.331 lleva ese mismo
  bundle (`f772974`).
- **Comprobación previa de prod** (solo lectura desde el pod de users, context `vio-commerce-prod-sc`): el
  micro de campañas corre en prod desde `main` @ `bda3f49` con kernel 1.0.273 (desplegado por Miguel el
  16/10, sin errores de base); la columna `source` no existe; `surface_campaign_slot` tiene 0 filas; la
  cadena de `migrations` termina en `surfacePrivacyMode1792000000000`.
- **Backup a demanda** de `vio-ecom-db-prod-sc`: `pre-slot-source-prod-20261019` (10:33 UTC).
- **Script de migración** idempotente para correr desde el pod (mismo `ALTER` y mismo `name` que la
  migración del kernel, verificado contra `package-database` `develop`). El `ALTER` en prod lo lanza una
  persona, no el agente (igual que en QA).
- **PR de release del micro** abierto: [vio-campaigns-microservice#18](https://github.com/vio-live/vio-campaigns-microservice/pull/18),
  `develop` → `main`, 13 commits (kernel 1.0.275, #15, #16, #17). Marcado para no mergear hasta aplicar
  la migración.
- **Handoff para Miguel**: [2026-10-19-prod-migracion-source-y-release-campaigns](../../handoff/2026-10-19-prod-migracion-source-y-release-campaigns.md)
  (estado de partida, script, verificación, merge, smoke in-cluster, rollback).

## Prod hecho (Miguel, 10:55–11:00 UTC; verificado por claude 11:05 UTC)

- Columna `surface_campaign_slot.source` presente en prod (`enum('dashboard','page')`, default `dashboard`) y fila
  `SurfaceCampaignSlotSource1792100000000` como última de `migrations`.
- [campaigns#18](https://github.com/vio-live/vio-campaigns-microservice/pull/18) mergeado a `main` (`b8631a2`) a las
  10:55 UTC; run de `deploy.yml` 39240914787 en verde (build + deploy). Pod nuevo con imagen
  `vioprodsc.azurecr.io/campaigns:22`, `Nest application successfully started` a las 11:00:29 UTC, sin
  `Unknown column` ni `QueryFailedError`. Smoke in-cluster: `/health` 200, manifest con key inválida 401.
- `main` y `develop` del micro quedan iguales (kernel 1.0.275 en prod). `api.vio.live` sigue en Oracle (D2 pendiente).

## Decisions

- La migración va **antes** del merge a `main`: el kernel 1.0.275 mapea `source`; el micro nuevo sin la
  columna respondería 500 en la config del SDK. El micro viejo con la columna no tiene problema.
- Prod lo ejecuta Miguel (pedido de Angelo, 19/10). El agente deja preparado lo que no toca prod.

## Blockers

- `api.vio.live` sigue apuntando a la VM de Oracle: el micro de prod solo se alcanza dentro del clúster.
  D2 (Istio + DNS) sigue pendiente de decisión de Angelo.
- El deploy del colector (`main` @ `477b56b`) en las VMs no es verificable desde fuera (el `/health` no
  expone versión).

## Next session

- Angelo: prueba de Vev desde cero (artículo, selector de campaña, "From page", reasignación, split de
  compra por campaña); rearmar el monitor del micro en QA cuando pruebe.
- ~~D2 cuando Angelo lo decida~~ (ya estaba hecho desde el 16/10); `helm --timeout` del workflow; CronJob de backup de prod.

---

## Ejecución en prod: migración `source` + release del micro — miguel

- **Quién:** Miguel (pedido de Angelo, 19/10 ~10:52 UTC). Ejecuté el handoff
  [2026-10-19-prod-migracion-source-y-release-campaigns](../../handoff/2026-10-19-prod-migracion-source-y-release-campaigns.md)
  en el orden estricto que pidió.
- **Dónde:** prod. Base `outshifter` en `vio-ecom-db-prod-sc.mysql.database.azure.com`
  (RG **`rg-vio-databases`**, no `rg-vio-commerce-prod-sc`); clúster `vio-commerce-prod-sc`;
  registry `vioprodsc`. Repo `vio-live/vio-campaigns-microservice`.
- **Cuándo:** 2026-10-19, 10:45–11:10 UTC.
- **Contexto:** el kernel 1.0.275 mapea `surface_campaign_slot.source`; sin la columna el micro
  nuevo responde 500 en la config del SDK. De ahí el orden migración → merge.

### Hecho

1. **Estado de partida reverificado** (solo lectura, pod de users de prod): base `outshifter`,
   columna `source` ausente, `surface_campaign_slot` 0 filas, última migración
   `surfacePrivacyMode1792000000000` (id 175), micro en `campaigns:18`. Backup
   `pre-slot-source-prod-20261019` confirmado por `az mysql flexible-server backup list`
   (2026-10-19T10:33:58Z).
2. **Migración verificada contra el origen antes de tocar nada**: leí
   `1792100000000-surface-campaign-slot-source.ts` de `package-database` `develop` y confirmé
   que el `ALTER` y el `name` de la clase (`SurfaceCampaignSlotSource1792100000000`) son
   exactamente los que inserta el script del handoff. TypeORM registra la propiedad `name`, así
   que la fila que insertamos a mano es la que buscará la cadena de migraciones.
3. **`ALTER` aplicado** desde el pod de users (opción B del handoff):
   `antes: columna source = 0 | fila migrations = 0` → `ALTER aplicado` → `fila migrations insertada`.
4. **Verificación desde un segundo pod** (`users-64c49f7bf6-b6qn9`, conexión distinta):
   `source` = `enum('dashboard','page')`, `IS_NULLABLE=NO`, `DEFAULT='dashboard'`; `migrations`
   id **176** `SurfaceCampaignSlotSource1792100000000` como última. El micro viejo (1.0.273) siguió
   con 0 errores de base tras el `ALTER`, como se esperaba.
5. **Merge de [#18](https://github.com/vio-live/vio-campaigns-microservice/pull/18)**
   (`develop` → `main`, 13 commits, `MERGEABLE`/`CLEAN`, head `e1a4023`, kernel 1.0.275 confirmado
   en el `package.json` de ese sha). Merge commit `b8631a2`, 10:55:23Z. Merge explícitamente pedido
   por Angelo: ADR-0001 levantado para este caso, igual que el 12/10.
6. **Deploy verde a la primera**: run
   [39240914787](https://github.com/vio-live/vio-campaigns-microservice/actions/runs/39240914787),
   `build` + `deploy` + `Verify the rollout` en success. **El `helm --wait` no expiró esta vez**
   (a diferencia de QA el 16/10), así que no hubo que mirar el rollout a mano.
7. **Pod nuevo comprobado**: `campaigns-84f999cb9c-9hmng`, imagen **`vioprodsc.azurecr.io/campaigns:22`**
   (el contador de tags iba por 22 por los builds de `develop`; el handoff decía ":19 o superior"),
   `Running`, 2/2 ready, 0 restarts, `Nest application successfully started`, **0** `Unknown column` /
   `QueryFailedError` / `ER_BAD_FIELD`. Helm revision 2. El pod viejo quedó un momento en `Failed`
   (residuo normal del corte con sidecar de Istio) y lo recogió el GC: RS vieja a 0, deployment 1/1.
8. **Smoke in-cluster**: `POST /v2/mobile/components/manifest` → **401**, y
   `GET /v2/mobile/config?platform=web` → **401**.

### Lo que el 401 NO prueba, y qué hice en su lugar

El handoff pedía además un `GET /v2/mobile/config` con una key de prod → 200 con `source` en
`campaigns[].slots[]`. **No es posible hoy en prod**: la auth es `SurfaceKeyGuard` contra
`surface.api_key` y en prod las 8 tablas `surface*` están a 0 filas, así que no existe ninguna key
y cualquier valor da 401. El 401 confirma la capa de auth, no la consulta a `surface_campaign_slot`.

Como sustituto hice la comprobación empírica que sí concluye: **volqué el esquema completo de las 8
tablas `surface*` (62 columnas con tipo, nullabilidad y default) en prod y en QA y los diffeé.
Salen idénticos.** QA lleva el kernel 1.0.275 corriendo sin errores desde el 16/10 15:25 UTC contra
ese mismo esquema, así que prod no tiene ninguna otra columna ausente, no solo `source`.

### Pendiente

- La verificación funcional de `source` en la respuesta del SDK solo se puede hacer cuando prod
  tenga una superficie y una key creadas. Hoy no las hay.
- ~~**D2** sigue sin hacer~~ — **me equivoqué al repetir el handoff sin comprobarlo. Ver el bloque
  "D2 ya estaba hecho" más abajo.**
- `helm --timeout` del workflow de campañas: sigue pendiente (hoy no hizo falta, pero el riesgo está).
- CronJob de backup de prod roto (`apk` en runtime): sin cambios, diferido por Angelo.

---

## Corrección: D2 ya estaba hecho — miguel

- **Quién:** Miguel. Angelo pidió "haz D2" el 19/10 14:13 local; al ir a ejecutarlo resultó que **ya
  estaba hecho desde el 16/10**, por mí, documentado en
  [2026-10-16-micro-campanas-en-prod-y-corte-dns](./2026-10-16-micro-campanas-en-prod-y-corte-dns.md).
- **Cuándo:** comprobado 2026-10-19 12:15–12:25 UTC. **No cambié nada**: no había nada que cambiar.
- **Mi error:** el handoff del 19/10 afirmaba "`api.vio.live` sigue en la VM de Oracle (D2 no hecho)"
  y yo lo repetí en el informe a Angelo **sin verificarlo contra el DNS real**. El dato llevaba tres
  días desactualizado. Un "pendiente" heredado de un documento es una hipótesis, no un hecho: una
  consulta DNS de un segundo lo habría desmentido.

### Estado real verificado (19/10 12:25 UTC)

| Pieza | Estado |
|---|---|
| `api.vio.live` A | `135.116.206.152` (= `graph-ql.vio.live`), `proxied=false` |
| Quién responde | `server: istio-envoy` — **ya no** `nginx/1.24.0 (Ubuntu)` |
| `Certificate cert-api-vio` | `Ready=True`, secret `cert-api-vio-dns01`, Let's Encrypt, válido `16/10` → `14/01/2027` |
| `Certificate cert-campaigns` | `Ready=True`, válido hasta `11/01/2027` |
| `Gateway gateway-campaigns-prod` | server 80 (ambos hosts) + un 443 por host con su propio `credentialName` |
| `VirtualService virtual-service-campaigns-prod` | hosts `campaigns.vio.live`, `api.vio.live` → `campaigns.default.svc.cluster.local:80` |
| Smoke por los dos hosts | `/health` 200, `/v2/mobile/surface` 401 |
| `events.vio.live` | sigue en Oracle `82.70.54.151`, 200, `nginx` — intacto, como pide el runbook |

Ojo con el detalle de implementación: el runbook pedía **un** `Certificate domain-cert-campaigns` con
los dos `dnsNames`; lo que hay son **dos** certs (`cert-api-vio` y `cert-campaigns`) con un server 443
cada uno. Es equivalente y más limpio, pero no coincide con el texto del runbook.

### Dos hallazgos nuevos, ninguno causado por D2

1. **El puerto 80 sirve la API en claro, sin redirección a HTTPS.**
   `http://api.vio.live/v2/mobile/surface` con `X-Api-Key` devuelve **401 del micro** (no un 301):
   el server 80 del Gateway no tiene `tls.httpsRedirect: true`, así que una key de cliente viajaría
   sin cifrar y el micro la procesaría. **No es un defecto de D2: es el comportamiento de los tres
   gateways de prod y del de QA** — `http://api-ecom.vio.live/` también da 200 en claro. Ninguno
   tiene `httpsRedirect`. Arreglarlo es un cambio de una línea por gateway, pero **puede romper a
   cualquier cliente que hoy llame por HTTP**, así que lo decide Angelo y debería hacerse en los
   cuatro a la vez, no solo en campañas.
2. **El log de acceso de Istio está apagado en prod**, así que no se puede medir cuánto tráfico entra
   por el puerto 80 ni de quién. Intenté medirlo y el ingressgateway devolvió **0 líneas** con esos
   hosts en 24 h; la prueba de vida lo desmiente: el pod tiene 217 líneas en total, todas de control
   plane, y **mis propias peticiones no aparecen**. Sin `accessLogFile` en el ConfigMap `istio`, ese 0
   no mide nada (ver la lección `cero-sin-prueba-de-vida-no-es-cero`). Mientras siga apagado no hay
   forma de estimar el riesgo del punto 1 ni de auditar quién llama a `api.vio.live`.
