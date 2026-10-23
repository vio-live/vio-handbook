---
title: Una variable del webapp que solo está en el entorno «staging» de Vercel no llega a prod
date: 2026-10-22
author: claude
status: live
---

# Una variable del webapp que solo está en el entorno «staging» de Vercel no llega a prod

## Qué pasó

El 22/10, a tres días del go-live, el dashboard de prod falló dos veces por la misma razón. Las dos
veces, en staging todo funcionaba:

1. **`VIO_API_HOST`** (B8, Miguel): sin ella, el bundle salía con el host vacío y nunca llamaba a
   `/auth/me`. La navegación de prod no mostraba Surfaces ni Campaigns a ninguna cuenta.
2. **`VIO_CAMPAIGNS_V2`** (B5): sin ella, el formulario de campañas no cargaba los channels del
   publisher (`/channels`) y mandaba la campaña sin `channelIds`. El micro respondía
   `400 SPONSOR_NOT_ON_SURFACE` («This brand has no channel you can use here yet»), con los datos
   perfectos: channel activo, una sola brand y colección compartida viva.

## Por qué

En el proyecto `vio-commerce-webapp` de Vercel, esas variables cuelgan de un **entorno custom
llamado `staging`** (rama `develop`), no del target `preview` ni del `production`. `vercel env ls`
las lista con el entorno `staging`, y Production simplemente no las tiene.

Además, el webapp es un export estático: las variables se **hornean al compilar**
(`next.config.js` → `process.env.*`). Que la variable exista no basta: hace falta **redesplegar**
Production después de añadirla.

## Cómo no volver a caer

Antes de dar por bueno un flujo en prod que en staging funciona, compara las variables:

```bash
cd webapp-vio-commerce   # el repo del webapp, enlazado a vio-commerce-webapp
vercel env ls | grep -E "staging|Production"
```

Si una variable de comportamiento (`VIO_*`, `ACCOUNT_PAYMENTS`, etc.) sale con `staging` y no con
`Production`, el dashboard de prod corre otro código que el de staging. Para comprobar que quedó
encendida, mira el bundle publicado: el valor aparece inlineado. El 22/10, Miguel lo vio en el chunk
`5410`, que cambió en un solo carácter, de `p=!1` a `p=!0`.

## Lo que sigue abierto

`ACCOUNT_PAYMENTS=true` también está solo en `staging`. En prod está apagada a propósito (pagos por
channel, el modelo anterior), pero tiene que ser una decisión explícita, no un olvido.

> [claude, 2026-10-23] Decidido y hecho: Angelo pidió encender `ACCOUNT_PAYMENTS` en Production
> («ellos deberían ver lo correcto»). Miguel lo puso y redesplegó. Verificado en el bundle: el módulo
> de `account-payments.js` pasó a `let n=!0`. Ya no queda ninguna variable de comportamiento solo en
> `staging`.
