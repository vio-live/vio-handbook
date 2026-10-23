---
title: Respaldo de la base de producción (Vio Commerce)
last-updated: 2026-10-23
---

## Estado hoy (23/10/2026): funcionando

El CronJob **corre solo y está verificado**. Estuvo roto desde el día uno hasta el 23/10; el detalle
de por qué está en "Historia: por qué no corrió durante tres semanas", al final. Lo que vale hoy:

- `lastSuccessfulTime`: **2026-10-23 09:16:11Z**, `active: []`, `suspend: false`
- Último blob: `outshifter-20261023T091546Z.sql.gz`, **13.910.185 bytes**, confirmado en destino
- Pod **1/1** (sin sidecar de Istio), `upload HTTP 201`
- Dispara a las **02:15 UTC**, hora ya alcanzable: producción **no se apaga** desde el 12/10

## Por qué existe esto

Tras la mudanza a Sweden Central, la base de producción **no tiene ninguna protección regional**.
No es un ajuste que falte poner: Azure **no ofrece geo-backup de MySQL en Sweden Central**.

```
az mysql flexible-server update --geo-redundant-backup Enabled
ERROR: The region of the server does not support geo-restore feature.

capabilitySets swedencentral -> supportedGeoBackupRegions = []
```

En Noruega el geo-backup era una opción; acá no existe. Por eso el respaldo fuera de región se hace
a mano con un CronJob.

## Las dos capas

| Capa | Qué cubre | Qué NO cubre |
|---|---|---|
| Backup automático de Azure, **35 días** | borrado accidental, restore a un punto en el tiempo | que se caiga Sweden Central |
| **CronJob a West Europe**, 90 días | pérdida de la región entera | nada más: es la última línea |

## El CronJob

- **Dónde:** cluster `vio-commerce-prod-sc`, namespace `default`, `mysql-prod-offsite-backup`
- **No lo gestiona Helm** (sin `app.kubernetes.io/managed-by`, sin anotaciones de release): se puede
  editar con `kubectl patch` sin dejar deriva que revierta el siguiente `helm upgrade`. Es la
  excepción a [la regla de no parchear objetos de Helm](../lessons/kubectl-patch-rompe-el-siguiente-helm-upgrade.md).
- **Cuándo:** `15 2 * * *` (02:15 UTC). La base pesa ~90 MB, el dump tarda segundos.
  La hora es correcta **desde que producción dejó de apagarse de noche** (12/10). Si alguna vez se
  vuelve a apagar prod por las noches, hay que moverla: un CronJob no corre en un cluster `Stopped`
  y con `startingDeadlineSeconds: 3600` el disparo perdido **se descarta**, no se recupera.
- **Qué hace:** `mariadb-dump --single-transaction --routines --triggers --events` de `outshifter`,
  gzip -9, y `PUT` al Blob REST API.
- **Destino:** `viodbbackupwe` / contenedor `mysql-prod`, **West Europe**, `Standard_GRS`, tier Cool.
- **Retención:** regla de ciclo de vida `expire-90d` (cuenta en `rg-vio-databases`), `enabled: true`,
  `daysAfterModificationGreaterThan: 90`, filtro de prefijo `mysql-prod/`. Confirmada el 23/10.
- **Protecciones del pod:** `sidecar.istio.io/inject: "false"`, `activeDeadlineSeconds: 3600`,
  `backoffLimit: 2`, `concurrencyPolicy: Forbid`.
- **Coste:** despreciable. 6 MB por dump × 90 días ≈ 0,5 GB. Menos de 1 USD/mes.

### El pod sube con un SAS de sólo escritura

El CronJob **no tiene la clave de la cuenta de storage**. Usa un SAS de contenedor con permisos
`create` + `write` únicamente, sin `read` ni `delete`, con vencimiento **2028-09-30**.

Si alguien compromete el cluster, puede escribir un backup nuevo pero **no puede leer ni borrar los
que ya están**. Anotar el vencimiento: cuando caduque, el job empieza a fallar con 403.

Secreto de Kubernetes: `db-backup-creds` (`DB_PASSWORD`, `SAS`). Los valores no van en este repo.

### Se niega a subir un dump vacío

El script comprueba el tamaño antes de subir y aborta si baja de 1 KB. Un `mariadb-dump` que falla a
mitad devuelve 0 y sale por la salida estándar igual: sin este chequeo, el "backup" del día sería un
archivo vacío que nadie mira hasta que hace falta.

## Qué está verificado y hasta dónde

Del blob del **23/10** se comprobó el camino completo de escritura (dump, tamaño, `upload HTTP 201`,
y que el objeto existe en destino con el tamaño correcto), pero **no se descargó ni se contó su
contenido**. Para contenido verificado tabla por tabla, el bueno es el dump a mano del go-live:
`containerproductionsc/db-backups/prod-dump-golive-20261023.sql.gz`, **128/128 tablas**, MD5
comprobado. Los dos son del mismo día.

La verificación de contenido más completa de este CronJob sigue siendo la del 30/09:

### Verificado de punta a punta (2026-09-30)

No alcanza con que el job diga OK. Lo que se comprobó:

- job manual: `upload HTTP 201`
- el blob existe en destino: 6.078.944 bytes, `application/gzip`
- se descargó y `gzip -t` pasa
- **119 `CREATE TABLE` en el dump contra 119 tablas en la base viva** — coinciden
- 112 tablas con datos

## Para restaurar

Ojo con lo de siempre: el restore **exige `innodb_strict_mode=0`** o se pierden tablas en silencio
(la última vez dejó 106 de 119). Ver el doc del backup de Noruega.

```bash
gzip -dc outshifter-<STAMP>.sql.gz | mariadb -h <destino> -u dbadmin -p outshifter
```

## Cómo se comprueba que está vivo

**`lastScheduleTime` no sirve** y esto costó tres semanas de aprenderlo: el 13/10 estaba puesto y no
había un solo blob nuevo desde el 05/10. Azure dispara el job, el job falla, y el campo queda igual
de verde. Lo que hay que leer, en este orden:

```bash
# 1. lastSuccessfulTime (no lastScheduleTime) y que no haya jobs colgados
kubectl get cronjob mysql-prod-offsite-backup -n default \
  -o jsonpath='{.status.lastSuccessfulTime}{"  active="}{.status.active[*].name}{"\n"}'

# 2. la prueba de verdad: el listado del contenedor de destino
RG=rg-vio-databases
K=$(az storage account keys list -n viodbbackupwe -g $RG --query "[0].value" -o tsv)
az storage blob list --account-name viodbbackupwe --account-key "$K" --container-name mysql-prod \
  --query "[].{m:properties.lastModified,s:properties.contentLength,n:name}" -o tsv | sort | tail -5
```

**Para listar hace falta la clave de la cuenta.** Las dos vías obvias fallan y no es un permiso que
falte poner:

- `--auth-mode login` → `AuthorizationPermissionMismatch`: la identidad de Angelo administra la
  cuenta pero no tiene rol de **datos** (`Storage Blob Data Reader`) sobre ella.
- el SAS del secreto `db-backup-creds` → también `AuthorizationPermissionMismatch`, **a propósito**:
  es `create` + `write` sin `read` ni `delete` (ver más arriba). El pod no puede leer lo que sube.

## Historia: por qué no corrió durante tres semanas (05/10 → 23/10)

Se arregló el **23/10 09:16 UTC**. Hubo **tres** causas encadenadas, no dos, y la tercera es la que
hacía que el problema fuera permanente en vez de intermitente.

**1. La hora era inalcanzable (05/10 → 12/10).** Disparaba 02:15 UTC con el cluster apagado de noche.
Un CronJob no corre en un cluster `Stopped` y `startingDeadlineSeconds: 3600` descarta el disparo
perdido. **Dejó de aplicar el 12/10**, cuando producción se encendió para quedarse: el
`lastScheduleTime` del 13/10 es la prueba de que a partir de ahí sí disparaba.

**2. Istio le cortaba la salida.** El pod recibía sidecar y el `apk add` moría antes de empezar:

```
WARNING: fetching https://dl-cdn.alpinelinux.org/alpine/v3.20/main: Permission denied
ERROR: unable to select packages: curl (no such package)
```

Importante, porque la conclusión anterior de este doc (y de la lección) era más dura de lo necesario:
**el problema no era instalar paquetes en tiempo de ejecución, era Istio**. Con
`sidecar.istio.io/inject: "false"` el mismo `apk add` y el mismo script funcionan a la primera. Queda
como deuda hornear el cliente de MySQL en la imagen, para no depender de la red en cada corrida, pero
**no es la causa del fallo**.

**3. `Forbid` + un pod que no termina nunca = cron muerto para siempre.** Esta es la que convirtió un
fallo diario en una parada total. Al fallar el `apk add`, el contenedor `dump` salía con `exitCode 3`
pero el `istio-proxy` seguía `Running`: el pod quedaba **1/2** y el Job **nunca pasaba a `Failed`**.
Con `concurrencyPolicy: Forbid`, ese job colgado (`mysql-prod-offsite-backup-29864295`, del 13/10)
bloqueó **todas** las ejecuciones siguientes durante diez días, en silencio y sin un solo evento de
error. No había `activeDeadlineSeconds`, así que nada lo iba a matar nunca.

Lo aplicado el 23/10 (respaldo del objeto previo en `/tmp/backup-cronjob-pre-fix-20261023.yaml`):

```bash
kubectl delete job mysql-prod-offsite-backup-29864295 -n default
kubectl patch cronjob mysql-prod-offsite-backup -n default --type merge -p '{"spec":{"jobTemplate":{"spec":{
  "activeDeadlineSeconds":3600,"backoffLimit":2,
  "template":{"metadata":{"annotations":{"sidecar.istio.io/inject":"false"}}}}}}}'
kubectl create job -n default --from=cronjob/mysql-prod-offsite-backup prueba-backup-20261023
```

Verificación de esa corrida: pod **1/1**, `tamano 13910185 bytes`, `upload HTTP 201`, y el blob
confirmado desde fuera con la clave de la cuenta. El listado del destino confirma el hueco: 30/09
(x2), 05/10 y después nada hasta el 23/10.

**La lección que queda, más allá de este job:** un `activeDeadlineSeconds` no es una optimización.
Sin él, un cuelgue bajo `Forbid` no es un fallo que se reintenta, es una parada permanente que no
avisa.

Esto **no fue una decisión de arquitectura nueva** y por eso no tiene ADR: la convención ya existía y
los `*-reconcile` ya la seguían. El de backup era el único objeto desalineado. Barrido de los tres
CronJobs de producción, 23/10, ya todos alineados:

| CronJob (ns `default`) | sidecar | `activeDeadlineSeconds` | `concurrencyPolicy` | último éxito |
|---|---|---|---|---|
| `mysql-prod-offsite-backup` | `false` | 3600 | `Forbid` | 23/10 |
| `orders-reconcile` | `false` | 840 | `Forbid` | 23/10 |
| `shopcart-reconcile` | `false` | 540 | `Forbid` | 23/10 |

Al crear un CronJob de infra en este cluster: `sidecar.istio.io/inject: "false"` y un
`activeDeadlineSeconds` acorde a lo que tarda. No hay ninguno sin eso hoy.

## Lo que sigue sin estar cubierto

**No hay HA.** Angelo lo descartó por ahora (30/09): son +178 USD/mes y duplicaría el coste del
servidor. Si se cae la zona 3 de Sweden Central, la base se cae con ella; estos dumps permiten
reconstruirla en otra región, no evitar el corte.
