---
title: "0025 — Campañas y surfaces se reconstruyen en Commerce; vio-backend se retira"
date: 2026-10-13
status: accepted
owner: angelo
deciders: [angelo]
---

# 0025 — Campañas y surfaces se reconstruyen en Commerce; vio-backend se retira

## Context

Hasta hoy la línea era tener **dos backends pares**. El 2026-09-15 se decidió unir solo los
fronts ([relevamiento-dashboard-vio](../architecture/relevamiento-dashboard-vio.md)) y se
recomendó el modelo «espejo» para enlazar sponsor y business
([identidad-unificada-sponsor-business](../architecture/identidad-unificada-sponsor-business.md)).
El 2026-09-25 se descartó colgar vio-backend de la MySQL de Commerce
([vio-backend-estado-y-limpieza](../architecture/vio-backend-estado-y-limpieza.md)). El costo
era portar 37 tablas, 70 `.returning()` y los arrays de Postgres, y además acoplaba a
Commerce, que tiene clientes pagando.

El audit del 2026-10-13
([campanas-y-surfaces-en-commerce](../architecture/campanas-y-surfaces-en-commerce.md))
cambió la cuenta:

- **De vio-backend se usa muy poco.** Ninguna surface pega a producción (`api.vio.live`), y
  la base de prod tiene unas 600 filas de prueba. El único endpoint con uso real es
  `GET /v2/mobile/config`, en staging, y lo llaman VG en Vev y la web de Aller.
- **El modelo tiene errores de definición.** El estado de campaña se calcula en 5 sitios
  con bordes distintos. La marca está repetida en 3 tablas. Los booleanos se guardan como
  texto. La programación de placements está rota de punta a punta. La tenancy se valida
  contra el body y no contra la sesión. Y hay fugas entre surfaces en el camino del SDK.
- **El enlace con Commerce es sucio.** El SDK maneja dos keys (la de la surface y la
  `commerceApiKey` del sponsor, pegada a mano). Commerce le empuja los métodos de pago
  por HTTP, y vio-analytics lee el Postgres de vio-backend para mapear canal → sponsor.
- **Commerce ya tiene un `Campaign`/`Component` de liveshow que no sirve como base.** La
  campaña es un `streamId` del channel del seller, y lo único que lo llama es el overlay
  de Kotlin contra el host de dev.

Reconstruir el dominio con unas 9 tablas nuevas cuesta mucho menos que portar las 37.

## Decision

1. **Campañas y surfaces se reconstruyen dentro de Vio Commerce, no se portan.** Van en
   un **microservicio nuevo** (`vio-campaigns-microservice`), hecho con NestJS sobre el
   kernel `@vio-/database` y la MySQL compartida. El webapp lo consume a través de base-api,
   igual que el resto.
2. **Se retira todo lo que no se usa.** En Commerce: el `Campaign`/`Component` de liveshow
   (en `api`, en base-api y sus tablas) y la propagación de métodos de pago a
   `VIO_BACKEND_URL`. Después del corte, vio-backend entero, incluido su dashboard
   `client/`.
3. **Se avanza poco a poco, por tipo de surface.** Primero las surfaces web (web, Vev,
   custom web). Los placements se mantienen como concepto, pero entran después: antes hay
   otras cosas que arreglar.
4. **Objetivo: una sola key por surface.** Hoy el SDK maneja dos keys porque eran dos
   sistemas aparte. El diseño de cómo Commerce resuelve el sponsor de cada carrito a
   partir de la key de la surface queda abierto. Como restricción, no se usa el
   `ChannelUser` del publisher como surface, porque eso convertiría al publisher en
   reseller por accidente.

## Consequences

- Esto reemplaza el modelo «espejo» y la nota del 2026-09-25. La unión ya no es solo de
  fronts: los backends también se unen.
- Hay que cambiar `package-database` (entidades nuevas y retiro de las de liveshow), y
  eso implica un release del kernel con los 7 paquetes juntos, como siempre.
- Al servicio de `users` le toca persistir el tipo de cuenta (hoy el seller solo existe como
  claim de Firebase) y devolver `accountType`/`features`, que hoy calcula vio-backend.
- El webapp deja de usar `vioApi`/`VIO_API_HOST` y pasa a `api()` contra base-api.
- vio-analytics deja de leer el Postgres de vio-backend. Los ids de campañas y surfaces
  cambian, y se acepta: prod tiene 0 filas en ClickHouse y staging unas 3.600.
- Los SDKs, Vev y el web-sdk cambian de host. `/v2/mobile/config` tiene que conservar la
  forma de su respuesta mientras el web-sdk la consuma.
- Las campañas de las surfaces quedan atadas a que Commerce prod esté encendido. Hoy eso
  no corta nada, porque no hay surfaces en producción.

## Alternatives considered

- **Un módulo dentro de `api`.** Es más rápido y no necesita infra nueva. Pero `api` corre
  con una réplica, cada deploy borra el pod entero, tiene 21k líneas y es el camino de venta
  de los canales. La lectura del SDK no debería caerse por un cambio en channels.
- **Extender el `Campaign`/`Component` de liveshow.** El modelo no calza: no tiene
  surface, sponsor, fechas ni placements.
- **Mantener el modelo espejo.** Deja las dos keys, la propagación por HTTP y el acople
  de analytics al Postgres, que es justo lo que se quiere arreglar.
- **Portar vio-backend tal cual a MySQL.** Arrastraría los errores de definición y 28
  tablas que nadie usa.
