---
title: "Backup manual de la base de prod antes de la congelación de viernes"
date: 2026-10-23
participants: [miguel]
status: live
---

## Dump a mano de `outshifter` (prod) — miguel

- Quién: miguel, por heartbeat (checklist de `HEARTBEAT.md`, ítem "Viernes al cerrar: dump a mano
  de la base de prod con el estado bueno ya configurado")
- Dónde: `vio-commerce-prod-sc`, namespace `default`, CronJob `mysql-prod-offsite-backup`
- Cuándo: 2026-10-23, 18:58 UTC
- Contexto: viernes de congelación de prod antes del go-live de Careless+Aller (lunes 26/10). El
  estado bueno de la base (envíos de Careless, Vipps partner mode, conexión Aller 1327↔1330) se
  configuró el 22/10, antes del backup automático de esta mañana (09:16 UTC) — así que ya estaba
  cubierto, pero el checklist pide un segundo dump de cierre de todos modos.

## Hecho

`kubectl create job --from=cronjob/mysql-prod-offsite-backup manual-backup-golive-20261023 -n default`
(mismo spec probado esta mañana: pod efímero `mysql:8.0` con `sidecar.istio.io/inject:"false"`,
`mysqldump --single-transaction`, sube a blob por SAS). Terminó en ~25 s, `succeeded`.

- Blob: `outshifter-20261023T185821Z.sql.gz`, 14.402.442 bytes, `upload HTTP 201` →
  `viodbbackupwe/mysql-prod`. Job borrado tras confirmar logs.

## Hallazgo de paso: el CronJob no se ha disparado solo todavía

`kubectl describe cronjob mysql-prod-offsite-backup` muestra `Last Schedule Time: Tue, 13 Oct 2026`
— es decir, desde el arreglo del 23/10 (ver `project_backup_offsite_db_prod.md`), el único run que
existe es el que se creó a mano esa misma mañana (`kubectl create job --from=cronjob`, que NO
actualiza `Last Schedule Time` porque no lo dispara el controller de CronJob). La corrida de las
02:15 UTC de esta madrugada (23/10) no cuenta como prueba porque el arreglo entró ~09:16 UTC, horas
después. **El primer disparo real por calendario es esta noche a las 02:15 UTC (04:15 Oslo).**
Pendiente: revisar mañana que `Last Schedule Time` avance solo.

## Pendiente (no es mío, lo anoto para el checklist)

El otro ítem de "Viernes" en `HEARTBEAT.md` — avisar a quien pueda mergear de la congelación — no
lo ejecuté por heartbeat: es una comunicación saliente a terceros (no solo a Angelo), así que se lo
señalo a Angelo para confirmación en vez de enviarla sola.
