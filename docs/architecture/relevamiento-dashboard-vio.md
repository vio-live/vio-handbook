---
title: "Relevamiento del dashboard de Vio (vio-backend client/) — para unir los fronts en webapp-vio-commerce"
last-updated: 2026-09-16
owner: angelo
status: draft
---

# Relevamiento del dashboard de Vio

Angelo (2026-09-15): *"quiero mezclar los fronts, no el backend, para que todo
esté en vio-commerce"*. El front único sería `webapp-vio-commerce`
(`dashboard.ecom.vio.live`); `vio-backend` y base-api/microservicios siguen
siendo backends separados (modelo "espejo" de
[identidad-unificada-sponsor-business](identidad-unificada-sponsor-business.md)).

Este doc es el inventario de lo que hay hoy en `vio-backend/client/` para
decidir el alcance. Relevado sobre `main` @ `d7ba49e` (2026-09-16), leyendo
código — lo no determinado está marcado.

## Stacks (lo que hay que cruzar)

| | Dashboard de Vio (`vio-backend/client`) | Webapp de Commerce |
|---|---|---|
| Framework | React 18 + Vite, router Wouter | Next 15 (`output: 'export'`, estático) |
| Datos | TanStack Query | SWR |
| UI | Tailwind + shadcn/ui (Radix), Lucide | Tailwind 4 (resto no relevado aquí) |
| Login | Firebase (email/pass o Google) → `POST /api/auth/session` con `Bearer <idToken>` → **cookie httpOnly** propia; `GET /api/auth/me` al cargar; `DELETE /api/auth/session` al salir | Firebase → token en header `authorization` a base-api en cada request |
| Roles | `super_admin`, `admin`, `operator`, `viewer`, `sponsor` (`server/middleware/capabilities.ts`) | `isBusiness`/`isSupplier`/`isAdmin` en `User`; el dashboard distingue `brand`/`publisher` |

Si el proyecto de Firebase del dashboard de Vio (`VITE_FIREBASE_PROJECT_ID`)
es el mismo que el de Commerce **no está verificado** (es config de entorno);
[ADR-0007](../decisions/0007-firebase-auth-single-idp.md) dice que debería.

## Inventario de pantallas (21 rutas, 16.158 líneas en `pages/`)

Gate de cliente: `RequireAuth` = cualquier rol salvo `sponsor` (al sponsor lo
manda a `/my-brand`); `RequireSponsor` = solo `sponsor`. Los permisos finos los
aplica el servidor por capability. El menú (`AppLayout.tsx`) es igual para
todos salvo "Users" (solo `super_admin`).

### A. Cara de marca (rol `sponsor`)

| Ruta | Líneas | Qué hace | API |
|---|---|---|---|
| `/my-brand` | 283 | Perfil, uso y stats de SU sponsor (self-scoped en el server) | `GET /api/sponsor/me`, `/me/usage`, `/me/stats` |

### B. Operación (publisher / dueño de app / admin de tenant)

| Ruta | Líneas | Qué hace |
|---|---|---|
| `/` | 522 | Resumen: apps, campañas, broadcasts, canales |
| `/apps` · `/apps/:appId` | 460 · 1272 | "Surfaces": CRUD de apps, plataformas, regenerar api key, placements, componentes por app, campañas de la app |
| `/campaigns` · `/campaigns/new` · `/campaigns/:id` | 462 · 414 · 1515 | Campañas: listar/pausar, crear, detalle con pestañas Overview / Broadcasts / Components / Sponsors / Settings / Analytics (hijos grandes: `ComponentsTab` 2181, `SettingsTab` 788, `OverviewTab` 556) |
| `/broadcasts` · `/broadcasts/:id` | 802 · 2478 | Broadcasts con fixtures de Sportmonks; **consola en vivo**: encuestas, concursos, ads programados y shoppable, sponsor slots, chat/tweets, alineación, resultado (polling 10–60 s, sin WS) |
| `/sponsors` · `/sponsors/:id` | 566 · 226 | CRUD de sponsors (incluye `commerceApiKey`) y sus campañas |
| `/components` · `/components/:id` | 289 · 340 | Biblioteca de componentes (hijo `ComponentLibraryTab` 1558) |
| `/analytics` | 767 | Analytics global + drill por app/campaña/broadcast + "Vio Commerce" por app (proxy a vio-analytics) |

Usan también `/v2/commerce/sponsors/:id/catalog` (catálogo de commerce vía
vio-backend) en los pickers de productos.

### C. Administración interna

| Ruta | Líneas | Qué hace |
|---|---|---|
| `/users` | 454 | Alta/edición/baja de operadores + bandeja de marcas pendientes (`/api/pending-brands`). Solo `super_admin` |

### D. Legado — candidatos a borrar, no a migrar (~3.800 líneas)

Sin ningún enlace entrante en el cliente (grep):

| Ruta / archivo | Líneas | Evidencia |
|---|---|---|
| `/admin`, `/campaign/:id/admin` (`admin.tsx`) | 1150 | "WebSocket Event Server" manual, sin `AppLayout`, logo de Unsplash por defecto |
| `/campaign/:id/advanced` (`advanced-campaign.tsx`) | 2106 | Duplica lo de `ComponentsTab`/`OverviewTab` con los mismos endpoints |
| `/campaign/:id/dashboard` | — | Segunda ruta de `CampaignDashboard` |
| `/viewer`, `/campaign/:name/:id` | 330 · 237 | Visores públicos por WebSocket; `viewer` solo lo enlaza `admin` |
| `components/dashboard/EventsTab`, `ScheduledTab`, `components/scheduling/*` | — | No los importa nadie |

Otros restos: el buscador y la campana del header no tienen handler; la
pestaña Analytics de la campaña calcula sus números de la lista de broadcasts
en vez de usar `/api/analytics/campaigns/:id` (dos fuentes para lo mismo).

### E. Pública

`/docs` (1326 líneas): documentación estática del SDK. `/login`, 404.

## 🔴 Hallazgo de aislamiento entre tenants (verificado en `server/`)

Todo `/api` exige sesión, pero tres rutas toman el dueño de `?userId=` (lo
manda el cliente) **sin compararlo con el operador de la sesión**:

| Ruta | Efecto |
|---|---|
| `DELETE /api/client-apps/:id?userId=` | compara `app.userId` con el `userId` de la query → un operador con `apps:write` puede borrar la app de otro tenant pasando el id de su dueño |
| `GET /api/channels?userId=` | lista los canales de cualquier usuario |
| `GET /api/analytics/vio/*?userId=&clientAppId=` (`server/analytics-proxy.ts`, del trabajo de analytics F6) | cualquier operador logueado lee las stats de cualquier app si conoce el `userId` del dueño |

El resto de las lecturas ya usa `readScopeOwnerId(req.operator)`. Arreglo:
tomar el dueño de `req.operator` (como el resto) e ignorar `?userId`. Es
**prerrequisito** para exponer estas rutas a un front nuevo.

## Qué implica para el backend unir los fronts

1. **Llamadas desde otro origen**: `dashboard.ecom.vio.live` → `api*.vio.live`.
   O CORS con credenciales para la cookie actual, o aceptar el token de
   Firebase como `Bearer` en cada request (como base-api). A decidir.
2. **Mapeo de roles** Commerce (`isBusiness`, brand/publisher) ↔ Vio
   (`sponsor`, `admin`, `operator`…) y alta automática del usuario de Vio a
   partir del de Commerce (paso 2 del doc de identidad).
3. **Link sponsor ↔ business** por uid en vez de strings pegados (paso 1 del
   doc de identidad).
4. **Aislamiento**: arreglar las 3 rutas de arriba y revisar el resto de
   `/api` que el front nuevo vaya a usar.
5. **Pareo de entornos**: webapp staging ↔ `api-staging.vio.live`, prod ↔
   `api.vio.live`.

## Decisiones abiertas (Angelo)

1. Alcance: ¿qué grupos (A–C) pasan al webapp? ¿La consola en vivo de
   broadcasts (la pieza más grande) también?
2. ¿Quién gestiona qué? brand vs publisher en el webapp.
3. ¿El dashboard actual se apaga o queda como panel interno (C + soporte)?
4. ¿Se borra el legado (D) antes de migrar?
