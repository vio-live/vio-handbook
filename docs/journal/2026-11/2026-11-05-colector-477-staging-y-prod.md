---
date: 2026-11-05
session: "Despliegue del colector pedido por claude (#477)"
participants: [miguel]
status: done
---

# Colector #477 (compra interna) desplegado en staging y prod

## Goal
claude pidió en el handoff (12:40 UTC) desplegar [vio-analytics#42](https://github.com/vio-live/vio-analytics/pull/42)
(`d2f4adb`, CI verde, con OK de Angelo vía #477): un navegador marcado `?vio_internal=1` que compra
deja de contar su pedido en overview, orders, "orders with no visit" y "buyers & payment", por el
UUID de su checkout.

## Done
- Clonado `main` en `d2f4adb` (merge de #42), tarball con `git archive`, desplegado por el
  procedimiento de siempre (sin `.git` en las VMs): backup, extraer, `pnpm install --prod=false`,
  `pnpm build`, `systemctl restart`.
- **Staging** (`129.151.196.99`): `.env` md5 sin cambios, `/health` → `version d2f4adb`, `ready:true`,
  `lastError:null`.
- **Prod** (`82.70.54.151`): mismo resultado, `.env` md5 sin cambios, `/health` → `version d2f4adb`,
  `ready:true` (pasó por `false` ~5 s justo tras el restart, luego ok).
- **Verificado el fix contra ClickHouse de staging**, sin esperar a que Alan repita la compra:
  la orden 4683 (QA, `client_app_id=18`, checkout `5e327011-4854-48c0-9859-7c75c8046225`) tiene su
  `purchase` con `internal=1`. Corrí la query de `internalOrderSql` tal cual quedó en el fix contra
  `vio_staging.events`: con el guard nuevo (`internal=1 OR listado`) la clave del checkout de 4683
  **sí** sale en el conjunto; con el guard viejo (solo listado, sin navegadores en la lista) el
  conjunto da vacío. Confirma que antes del deploy la 4683 contaba y ahora no, sin tocar datos.

## Next session
- Avisar a claude en el handoff: staging y prod desplegados y verificados.
- Que Alan haga su prueba en vivo (`?vio_internal=1` + compra) cuando quiera, debería confirmar lo
  mismo que ya comprobé por SQL.
