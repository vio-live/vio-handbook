---
title: "0029 — Corte de prod por DNS con 410, key de surface como objetivo, tablas surface_* y una sola release del kernel"
date: 2026-10-13
status: accepted
owner: angelo
deciders: [angelo]
amends: "0028 (punto 5: corte por path en Oracle) y 0026/0027 (uso de las keys de channel)"
---

# 0029 — Corte por DNS, keys de surface, tablas `surface_*` y una release

## Context

Miguel revisó el plan contra el tráfico real
([plan, sección Miguel](../handoff/campanas-en-commerce-plan-de-ejecucion.md#miguel-2026-10-13)).
Sacó los `access.log` de las dos VMs de Oracle (15 días, 28/09 a 13/10, sin bots ni plantillas
del scraper) y encontró esto:

- **`api.vio.live` (prod) tuvo cero tráfico real de clientes.** `/v2/mobile/config` recibió cero
  peticiones.
- **En `api-staging`, el único endpoint vivo es `/v2/mobile/config`**, y todo el tráfico viene
  de desarrollo propio: el editor de Vev, `a-alan-local.vev.site`, localhost y Replit.
- **`/ws`, `/v1/engagement/*`, `/v2/tv/*`, `/v1/sdk/broadcast`, `/objects/*` y las demás no
  tienen tráfico real.** Lo poco que hay es la sesión de Alan.

Angelo respondió el 13/10: el corte se hace de inmediato, el micro va en AKS junto a los demás
y una surface mantiene N channels. Miguel ya cerró `api.vio.live` a una lista blanca, y también
el dashboard viejo de staging, dejando intacto el loop de Vev (journal 2026-10-13).

## Decision

1. **El corte de prod se hace por DNS, no por proxy.**
   - `api.vio.live` apunta al ingress de AKS (Cloudflare) y el micro responde todas las rutas.
   - Las rutas de vio-backend que no se portan responden **410 con un JSON explícito**: si
     algún cliente las usa, falla fuerte y nos enteramos.
   - Es igual de reversible (un registro de Cloudflare) y saca a la VM gratuita de Oracle del
     camino crítico.
   - **El split por path queda solo en staging** (nginx de Oracle), que es donde vive el loop
     de desarrollo de Vev.
   - Esto reemplaza el punto 5 de ADR-0028.
2. **Keys en el cliente.**
   - **Objetivo:** el cliente lleva **solo la key de surface**. Las keys de channel son de
     **catálogo en solo lectura**, se pueden rotar por channel sin tocar la app y **nunca sirven
     para checkout**.
   - **v1 sigue como hoy:** el checkout se hace con la key de channel, para no romper el
     web-sdk, Vev ni los SDKs.
   - **La migración es una fase propia del plan:** graphql, middleware y shopcart aceptan la
     key de surface en el checkout y resuelven del lado del servidor a qué channel y brand va
     cada carrito; después se actualizan los clientes y por último se les quita el checkout a
     las keys de channel.
3. **Las tablas nuevas usan la familia `surface_*`:** `surface`, `surface_platform`,
   `surface_channel`, `surface_slot`, `surface_campaign`, `surface_campaign_sponsor`,
   `surface_campaign_slot`, más `brand_profile`. No se reusan `campaign` ni `component`
   (liveshow), porque dos micros en kernels distintos sobre la misma base romperían el orden
   estricto que haría falta.
4. **Una sola release del kernel con migración.** Los cambios de F2.1 (encendidos y flag de
   cuenta de Vio en `UserSettings`, vendedor en el carrito, rol Publisher) y las tablas del micro
   (F3.2) van juntos. Primero se trabajan en una rama local de `package-database`, y no se
   publican ni se migran hasta revisarlos y tener las mediciones.
5. **Criterios del corte:**
   - Salir de F3 exige comparar `/v2/mobile/config` del micro con el de vio-backend para la
     campaña Lyko, abierta en el editor de Vev, **byte a byte**. Validarlo con "el tráfico
     real sigue andando" no sirve, porque ese tráfico no existe.
   - Antes del corte se **exportan a un fichero** las surfaces, keys y campañas de VG/Lyko y
     Aller, en vez de recrearlas de memoria.

## Consequences

- El micro necesita el catálogo de rutas retiradas en un solo lugar del código, con su 410.
- **Miguel:**
  - Gateway y TLS para `api.vio.live` en AKS (cert por DNS-01 de Cloudflare);
  - hosts `campaigns.vio.live` y `campaigns-staging.vio.live` (con alias `-dev`);
  - el split de staging en Oracle;
  - el reapunte de vio-analytics a MySQL, que es cambio de código y va con F2.3.
- **Las mediciones de prod** (F1) necesitan que Miguel agregue temporalmente la IP de quien
  las corre al firewall de la MySQL de prod, y la quite después.
- **La migración de keys a surface** se suma al plan como fase propia, después del corte.

## Alternatives considered

- **Split por path en Oracle** (ADR-0028): pone a una VM `E2.1.Micro` de 954 MB, que ya corre
  vio-backend, Postgres y el colector, en el camino crítico de todo el API de prod.
- **Split en Cloudflare:** es viable, pero innecesario si las rutas no portadas responden 410.
- **Solo key de surface desde v1:** obliga a cambiar el checkout en cinco componentes antes
  del corte.
- **Reusar `campaign`/`component`:** solo funciona con un orden estricto que alguien va a
  violar.
- **Dos releases del kernel:** cada release de los 7 paquetes con migración es cara; las
  migraciones no.
