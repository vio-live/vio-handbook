---
title: Backup offsite de prod arreglado, y la identidad de Mixpanel confirmada viva
last-updated: 2026-10-23
owner: Miguel
---

## Backup offsite de prod: arreglado y corriendo — Miguel, 23/10 09:05-09:17 UTC

- Quien: Miguel. Lo detecto claude y me lo paso por el canal de coordinacion (23/10 09:20 UTC);
  el arreglo en prod lo hice yo.
- Donde: AKS `vio-commerce-prod`, namespace `default`, CronJob `mysql-prod-offsite-backup`.
  Destino: cuenta de storage `viodbbackupwe`, contenedor `mysql-prod` (West Europe).
- Cuando: 23/10, el dia de la congelacion previa al go-live del lunes 26/10.
- Contexto: el backup automatico de la base de prod **no corria desde el 13/10 y en realidad nunca
  corrio solo**. Estaba en pausa por decision de Angelo del 12/10 («dejalo por ahora»), pero
  entrar al fin de semana del lanzamiento sin backup automatico no se sostiene, y el arreglo
  resulto ser de bajo riesgo: el CronJob no sirve trafico de usuario.
- Hecho:
  - Respaldo del objeto en `/tmp/backup-cronjob-pre-fix-20261023.yaml` (5.589 bytes).
  - Borrado el job `mysql-prod-offsite-backup-29864295`, colgado desde el 13/10. Con
    `concurrencyPolicy: Forbid` bloqueaba todas las ejecuciones siguientes.
  - Patch al CronJob (**no lo gestiona Helm**: sin `app.kubernetes.io/managed-by` ni anotaciones de
    release, asi que no deja deriva): `sidecar.istio.io/inject: "false"` en el pod del jobTemplate,
    `activeDeadlineSeconds: 3600` y `backoffLimit: 2`.
  - **Imagen y script sin tocar.** La leccion previa y el punto 3 de claude decian que habia que
    quitar el `apk add`; medido hoy, con el sidecar fuera **funciona**. El bloqueo era Istio.
  - Verificado con una corrida real (`kubectl create job --from=cronjob/...`): pod **1/1**,
    `tamano 13910185 bytes`, `upload HTTP 201`. Confirmado **desde fuera** con la clave de la
    cuenta: `outshifter-20261023T091546Z.sql.gz`, 13.910.185 bytes, 23/10 09:16.
    `lastSuccessfulTime` = 23/10 09:16:11Z, `active: []`. Job de prueba borrado.
  - El listado del contenedor confirma el «nunca corrio solo»: 30/09 (x2), 05/10 y el de hoy. Nada
    entre el 05/10 y el 23/10.
- Pendiente: hornear el cliente de MySQL en la imagen (deuda, no fallo). El `az storage blob list`
  con `--auth-mode login` no sirve aqui: mi identidad no tiene rol de Blob Data y el SAS del secret
  es de escritura, no de listado — hay que usar la clave de la cuenta.

## `MIXPANEL_IDENTITY`: estaba activa, el reinicio no hacia falta — Miguel, 23/10 09:20 UTC

- Contexto: claude reporto (23/10 09:11 UTC) que el colector no habia reiniciado y que por tanto la
  identidad seguia apagada, con tres medidas de `uptime_s` apuntando al mismo arranque. Angelo lo
  habia pedido «ya» (22/10).
- Hecho: corri su comprobacion tal cual en las dos VMs. `ActiveEnterTimestamp` 22/10 19:48:41 UTC
  (prod) y 19:47:40 UTC (staging); grep de `MIXPANEL_IDENTITY=simplified` en el
  `/proc/<MainPID>/environ` del proceso vivo = **1** en las dos.
- La aritmetica de uptime era correcta; el supuesto no. El `.env` se escribio **antes** de ese
  arranque, en la misma pasada del deploy de `c2fc1614`: el proceso nacio con la identidad puesta.
- Prueba que lo zanja sin SSH (export de Mixpanel, solo lectura, **sin inyectar nada en prod**): de
  los 30 eventos de prod, los 30 traen `$device_id`. **Cero anonimos sin identidad**, asi que no hay
  historia que se corte el lunes.
- Decidido: **no reiniciar y no desplegar `76859ab`**. Dia de congelacion, riesgo sin ganancia.
