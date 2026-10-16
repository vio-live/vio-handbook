---
date: 2026-10-16
session: "Migracion surface_campaign_slot.source en QA"
participants: [angelo, miguel]
status: live
---

# `surface_campaign_slot.source` en QA (16/10)

Angelo pidio aplicar en QA la migracion del kernel del PR #20 de `package-database`
(publicada como 1.0.274). **Prod no**: va con el proximo release del micro de campanas.

## Hecho
- Clon de `package-database` en `develop` @ **`f1ceab6`** ("implement version 1.0.274").
- Migracion `1792100000000-surface-campaign-slot-source.ts`: un solo
  `ALTER TABLE surface_campaign_slot ADD source enum('dashboard','page') NOT NULL DEFAULT 'dashboard'`.
  Aditiva y con default, como decia Angelo.
- Backup a demanda **`pre-slot-source-20261016`** (13:57:44 UTC) verificado que existe **antes** de
  tocar nada. Lo habia lanzado Angelo.
- Acceso: igual que en prod, **pod `socat` con `sidecar.istio.io/inject:"false"` + port-forward**,
  sin abrir el firewall (que se cerro esta misma tarde). Pod y tunel borrados al terminar.

## Estado antes / despues
| | antes | despues |
|---|---|---|
| columna `source` | no existe | `enum('dashboard','page')`, default `dashboard`, `NOT NULL` |
| fila en `migrations` | no esta | `SurfaceCampaignSlotSource1792100000000` |
| total migraciones | 221 | **222** |

`surface_campaign_slot` tiene **0 filas** en QA, asi que el DEFAULT no reescribio nada.

## Comprobado que prod NO se toco
Angelo fue explicito. Verificado **desde un pod de prod**: la columna `source` **no existe** y la
fila de la migracion **no esta** en `migrations` de produccion.

## QA sigue sano
14/14 deployments, sin errores de base en users, api, base-api, campaigns ni products.

## Lo que sigue (de Angelo)
El `pkg=all` del kernel (1.0.275) y el bump del micro de campanas.

## Nota al margen
El `DB_HOST` de QA es **`10.224.0.7`**, el private endpoint, no el FQDN. Afina lo anotado al
cerrar el firewall: mas servicios de los que crei entran por la IP privada. No cambia la
conclusion (el cierre no afecto a nadie), pero el reparto FQDN/IP privada no es el que supuse.
