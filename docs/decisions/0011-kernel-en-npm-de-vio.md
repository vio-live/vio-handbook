---
title: "ADR-0011: El kernel de Vio Commerce se publica en el npm de Vio"
last-updated: 2026-09-03
owner: angelo
status: live
---

# ADR-0011: El kernel de Vio Commerce se publica en el npm de Vio

## Context

Los 11 microservicios NestJS de Vio Commerce comparten un "kernel" de 7 paquetes
(`utils, config, logger, database, testing, definitions, service`; repos `package-*`) que
hasta el 2026-09-02 se publicaba en npm bajo el scope **`@reachu`**. Reachu ya no existe
como empresa y **nadie controla esa cuenta**: el único token válido vivía en la máquina de
Alan y en secretos de CI. Sin publicar no hay release del kernel, y sin release del kernel
no hay migraciones ni cambios de entidades para ningún servicio (Qliro, webhook de órdenes,
Walley…). El equipo dependía de una persona y de una cuenta muerta.

Complicación descubierta en el camino: Vio tiene **dos cuentas de npm** — `vio-`
(`angelo@tipio.no`, dueño de la org `vio-live`, publicó `@vio-live/web-sdk`) y `vio.live`
(sesión web de Angelo, sin paquetes). Paquetes privados bajo la org exigen plan Teams; un
plan Pro de usuario solo cubre el scope de ese usuario.

## Decision

1. **El kernel se publica como `@vio-/*`**, privado, desde la cuenta `vio-` con plan Pro.
   Versión de partida `1.0.244` (idéntica a la última de `@reachu`), después `1.0.245`.
2. **El flujo de release es el de Alan, sin cambios**: `vio-automatize`
   (`change-version-packages.js pkg=all type=1` → `publish-packages.js pkg=all type=1`,
   que hace install, build, commit "implement version X", push, tag y `npm publish`).
   Solo cambió el scope dentro de los scripts.
3. **Los 11 micros pinean todos la misma versión** del kernel y se cortan juntos.
4. **CI lee el registro con un token granular read-only** de `vio-` (`NPM_CONTENT_FILE`,
   línea completa de `.npmrc`).
5. `@reachu/sdk` **no** forma parte de esto: es el SDK JS legacy, público, superseded por
   `@vio-live/web-sdk`, y "ya no es nuestro" (Angelo, 2026-09-02).

## Rationale

- **Independencia**: publicar deja de depender de Alan y de una cuenta sin dueño.
- **Mínimo cambio**: conservar el flujo y el versionado en lockstep evita reaprender y
  reduce el riesgo del corte; lo único que cambió es un string en imports y package.json.
- **`@vio-` y no `@vio-live`** es una consecuencia de billing, no una preferencia: el Pro
  quedó en el usuario y la org sigue en Free. Se aceptó el nombre feo para no bloquear el
  release de Qliro. Las ramas `feat/vio-live-scope` de los 7 repos conservan la versión
  `@vio-live/*` lista por si se activa Teams en la org.

## Consequences

- Un release del kernel se hace desde cualquier máquina con el token de `vio-`: Claude
  prepara (`change-version`, bump de micros, PRs) y **`npm publish` lo ejecuta una
  persona**, porque el clasificador de auto-mode lo bloquea (igual que escribir secretos
  y pushear a ramas ajenas).
- Los `.env.test` del kernel (con claves reales, versionados) **ya no viajan en los
  tarballs** (`.npmignore` en los 7). Siguen en git → rotación pendiente.
- Todos los micros saltaron de kernels dispersos (1.0.237–1.0.242) a 1.0.244 en un solo
  corte, verificado en QA. Ese "todos juntos" es ahora la regla.
- `change-version-microservice.js` de `vio-automatize` quedó obsoleto (rutas
  `outshifter-*`); el bump de micros se hace con sed o hay que actualizarlo.
- Deuda aceptada: dos identidades npm (`@vio-live` público para el SDK web, `@vio-`
  privado para el kernel). Se resuelve activando Teams y renombrando, cuando se quiera.

## Alternatives considered

- **Teams en la org `vio-live` → `@vio-live/*`**: la opción correcta a largo plazo; se
  descartó *hoy* porque el pago cayó dos veces en la cuenta equivocada y Qliro no podía
  esperar. Sigue siendo la recomendación.
- **GitHub Packages** (privado, gratis): descartado por fricción — cada dev necesita un
  token de GitHub para instalar, y cambia el registro en 11 repos.
- **Público en npm**: descartado; el schema completo de Vio Commerce quedaría visible.
- **Rescatar la cuenta `@reachu`**: imposible, no hay dueño.

## References

- Journals: [`2026-09-02-kernel-reachu-a-vio-npm.md`](../journal/2026-09/2026-09-02-kernel-reachu-a-vio-npm.md),
  [`2026-09-03-release-kernel-1.0.245-qliro.md`](../journal/2026-09/2026-09-03-release-kernel-1.0.245-qliro.md).
- Plan que lo motivó: [`vg-lyko-feed-to-checkout.md`](../architecture/vg-lyko-feed-to-checkout.md).
- Relacionado: ADR-0001 (no auto-merge) — ver la excepción registrada en el journal del 2026-09-03.
