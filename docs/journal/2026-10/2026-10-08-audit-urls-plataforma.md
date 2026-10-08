---
title: Audit de URLs de plataforma y sus consumidores
date: 2026-10-08
author: Miguel
tags: [audit, environments, sdk, dns]
---

# Audit de URLs de plataforma y sus consumidores (2026-10-08)

Continuacion de `2026-10-08-audit-entornos.md`. Angelo acoto el alcance de la
unificacion a las URLs de la plataforma (no tocar CI, ramas ni secretos por ahora).
Antes de mover un solo DNS hacia falta saber quien consume cada hostname.

`gh search code` no sirve para esto: indexa tan poco que solo devolvia
`vio-infra-tf`. El inventario se hizo clonando 19 repos y haciendo grep.

## Hallazgo bloqueante: el SDK de Swift apunta a no-prod en produccion

`VioSwiftSDK/Sources/VioCore/Configuration/VioConfiguration.swift:356-370`, en `main`:

```swift
case .development: return "https://graph-ql-dev.vio.live"
case .sandbox:     return "https://graph-ql-dev.vio.live"  // Sandbox uses same endpoint as development
case .production:  return "https://graph-ql-dev.vio.live"  // Same as development for now
```

Los tres entornos del SDK de iOS resuelven al cluster **no-prod**. Cualquier app
iOS configurada con `.production` esta pegandole a `kubernetesqa-sc`. El default
del inicializador es `.production` (linea 61), asi que es el camino por defecto.

Ademas, hardcodeados sin forma de configurarlos:

| Fichero | Host | Nota |
|---|---|---|
| `VioLiveUI/Components/DynamicComponentsService.swift:31` | `api-ecom-dev.vio.live` | sin fallback |
| `ModuleConfigurations.swift:517-518` | `api-staging.vio.live` | default de WS y REST |
| Kotlin `VioLiveUI/.../DynamicComponentsService.kt:17` | `api-ecom-dev.vio.live` | mismo caso |

El SDK de Kotlin si tiene `PRODUCTION -> graph-ql.vio.live` correcto (`VioConfiguration.kt:427-429`).

Consecuencia directa para la unificacion: **si se retiran los alias `-dev` sin
tocar los SDKs, el SDK de Swift deja de funcionar en los tres entornos a la vez**,
y los componentes dinamicos de Swift y Kotlin se caen en produccion.

## Nomenclatura de entornos: cuatro esquemas distintos

| SDK | Enum | No-prod resuelve a | Default |
|---|---|---|---|
| web-sdk | `development` / `testing` / `production` | api-staging + graph-ql-dev (ambos casos) | `development` |
| react-native | `development` / `testing` / `production` | dev: graph-ql-dev; testing: graph-ql-**staging** | `development` |
| Swift | `development` / `sandbox` / `production` | graph-ql-dev (los tres) | `production` |
| Kotlin | `DEVELOPMENT` / `SANDBOX` / `PRODUCTION` | graph-ql-dev | `PRODUCTION` |

`testing` en web y en react-native apuntan a hosts distintos. El comentario del
react-native (`configuration.ts:100`) ya documenta la contradiccion: el propio
`GET /v2/mobile/config` de staging devuelve `graph-ql-staging` mientras el SDK
usa `graph-ql-dev`.

## Consumidores por hostname (verificado por grep, 19 repos)

| Hostname | Consumidores |
|---|---|
| `graph-ql-dev.vio.live` | web-sdk (configuration + commerce), react-native, Swift (x3 entornos), Kotlin, vev, webapp (settings/rest.jsx), flutter README, vio-docs openapi.yaml |
| `graph-ql-staging.vio.live` | solo react-native (entorno `testing`) |
| `graph-ql.vio.live` | web-sdk, react-native, Kotlin PRODUCTION, flutter example |
| `api-ecom-dev.vio.live` | Swift DynamicComponents, Kotlin DynamicComponents, Kotlin network_security_config |
| `api-ecom-staging.vio.live` | woocommerce-sync (class-api-client.php), shopify-sync (.env.example, docs), webapp (README, scripts) |
| `api-ecom.vio.live` | woocommerce-sync, Kotlin network_security_config |
| `api-staging.vio.live` | web-sdk (vio.ts), webapp (lib/vio.js), vev, Swift ModuleConfigurations |
| `container.vio.live` / `container-staging` | 0 referencias en codigo (se consumen por URL devuelta en runtime) |
| `sync-staging.vio.live` | shopify-sync: `shopify.app.vio-sync-staging.toml` + docs de submission |
| `api-commerce.vio.live` | solo `vio-woocommerce-sync/docs/backend-integration.md` (reserva documentada) |

### Registrado fuera del codigo (no se puede cambiar con un PR)

- Webhook de Vipps QA -> `api-ecom-staging.vio.live/api/shopcart/checkout/vipps/webhook`
  (registro `c5cbaf08`, el secreto solo se ve al registrar).
- Webhook de Adyen TEST -> `api-ecom-staging.vio.live/adyen/webhooks/platform/<token>`.
- `shopify.app.vio-sync-staging.toml` -> URLs de la app en el Partner Dashboard de Shopify.
- Dominios de Vercel de los 4 proyectos `vio-sync-*` de las apps custom.

Mover cualquiera de estos cuatro exige re-registro del lado del tercero, y en el
caso de Vipps eso significa un secreto nuevo en la misma pasada.

## Propuesta para las URLs (sin tocar CI)

Un nombre por servicio y entorno, dos entornos:

```
prod:     api-ecom.vio.live        graph-ql.vio.live        dashboard.ecom.vio.live
staging:  api-ecom-staging.vio.live graph-ql-staging.vio.live dashboard-staging.ecom.vio.live
```

Orden de ejecucion, de menor a mayor riesgo:

1. **Arreglar el SDK de Swift** (`.production` -> `graph-ql.vio.live`, `.sandbox` ->
   `graph-ql-staging`) y los `DynamicComponentsService` de Swift y Kotlin para que
   tomen el host de la configuracion. Esto hay que hacerlo **antes** de tocar DNS.
2. Alinear el enum de entornos en los 4 SDKs a un solo vocabulario.
3. Repuntar los consumidores de `-dev` a `-staging` (son los del cuadro de arriba).
4. Retirar `api-ecom-dev` y `graph-ql-dev`: los VirtualServices, los Gateways, los
   2 certificados y los 3 registros `_acme-challenge`.
5. Decidir `dashboard-staging` y `sync-staging`, que hoy sirven el build de produccion.
6. Borrar los nombres muertos (`dashboard-dev.ecom`, `ws-dev`, `admin-panel-dev`,
   `vio-demo-qa`, `events-dev`, `events-staging`, 4 TXT `asuid`). No tocar `api-commerce`.

Los pasos 1 y 2 son cambios de SDK publicado: exigen release y que los clientes
actualicen. El paso 4 no se puede hacer antes de que esos releases esten fuera.

Nada ejecutado: inventario y propuesta. ADR-0001 aplica a los PRs del punto 1.
