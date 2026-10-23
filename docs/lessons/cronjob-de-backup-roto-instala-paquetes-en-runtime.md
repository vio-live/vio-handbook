---
title: El CronJob de backup de la DB de prod no fallaba por el horario, fallaba por diseño
last-updated: 2026-10-23
---

## ARREGLADO el 23/10 — y el `apk add` no era el problema

Lo de abajo sigue siendo el diagnóstico correcto de **por qué fallaba**, pero la conclusión
("hay que hornear el cliente de MySQL en la imagen") era **más de lo necesario**. Medido el 23/10:
con `sidecar.istio.io/inject: "false"` en el pod del jobTemplate, el **`apk add` funciona**. El que
bloqueaba la salida era Istio; Alpine no tenía nada que ver.

Lo aplicado, sin tocar imagen ni script (el CronJob **no lo gestiona Helm**, así que un patch no
deja deriva):

```bash
kubectl delete job mysql-prod-offsite-backup-29864295 -n default   # el colgado
kubectl patch cronjob mysql-prod-offsite-backup -n default --type merge -p '{"spec":{"jobTemplate":{"spec":{
  "activeDeadlineSeconds":3600,"backoffLimit":2,
  "template":{"metadata":{"annotations":{"sidecar.istio.io/inject":"false"}}}}}}}'
```

Corrida real de verificación: pod **1/1**, `tamano 13910185 bytes`, `upload HTTP 201`, blob
`outshifter-20261023T091546Z.sql.gz` confirmado desde fuera en `viodbbackupwe/mysql-prod`.

### Las dos cosas que de verdad hacían daño

1. **`concurrencyPolicy: Forbid` + un job que no termina nunca = cron muerto para siempre.** El pod
   quedaba **1/2**: el contenedor `dump` salía con `exitCode 3`, pero el `istio-proxy` seguía
   `Running`, así que el Job nunca pasaba a `Failed`. Desde el 13/10 bloqueó **todas** las
   ejecuciones siguientes, en silencio. Por eso ahora lleva `activeDeadlineSeconds`: sin un límite
   de tiempo, un cuelgue no es un fallo, es una parada permanente.
2. **`lastScheduleTime` no dice que el backup exista.** El del 13/10 estaba puesto y no había ni un
   blob nuevo desde el 05/10. Lo que hay que leer es **`lastSuccessfulTime`** y, mejor, el listado
   del contenedor de destino.

Deuda que queda (no es fallo): hornear el cliente en la imagen, para no depender de la red en cada
corrida.

---

## Lo que creíamos
Que `mysql-prod-offsite-backup` nunca había corrido por una mezcla de "hora nocturna + Istio": se
programaba a las 02:15 y a esa hora el cluster de prod podía estar apagado.

## Lo que pasa de verdad
El 12/10 lo lancé a mano con el cluster encendido (`kubectl create job --from=cronjob/...`) y falló
igual, en segundos:

```
WARNING: fetching https://dl-cdn.alpinelinux.org/alpine/v3.20/main: Permission denied
ERROR: unable to select packages:
  curl (no such package)
  gzip (no such package)
  mariadb-client (no such package)
```

El contenedor es un Alpine pelado que hace `apk add curl gzip mariadb-client` **en tiempo de
ejecución**, y el sidecar de Istio le bloquea la salida a internet. **Nunca habría funcionado, a
ninguna hora, con el cluster encendido o apagado.** El horario era un síntoma que tapaba la causa.

## Cómo se saca un dump mientras esto siga roto
Pod efímero con el cliente ya dentro y **sin sidecar**:

```yaml
metadata:
  annotations:
    sidecar.istio.io/inject: "false"
spec:
  containers:
  - name: dump
    image: mysql:8.0        # trae mysqldump; no instala nada
```

Las credenciales salen del `.env` de prod del blob
(`containerproductionsc/env-file-microservices/<servicio>/.env`). **Ojo: los valores vienen entre
comillas dobles** — hay que quitarlas antes de meterlas en un secret, o el host llega con comillas y
la conexión falla.

Luego, desde fuera:
```bash
kubectl exec -n default <pod> -- bash -c 'mysqldump --ssl-mode=REQUIRED -h "$DB_HOST" \
  -u "$DB_USERNAME" -p"$DB_PASSWORD" --single-transaction --quick --routines --triggers \
  --events --set-gtid-purged=OFF --no-tablespaces "$DB_NAME" | gzip -6' > dump.sql.gz
```

## Cómo se comprueba que el dump sirve
No basta con que el fichero exista y pese algo:
1. `gzip -t` para la integridad del contenedor.
2. Contar `CREATE TABLE` y cruzarlo con `information_schema.tables` de la base real
   (el 12/10: 119 y 119).
3. Tras subirlo, comparar el **MD5 del blob con el local** (`properties.contentSettings.contentMd5`
   contra `openssl dgst -md5 -binary | base64`).

## Pendiente
Arreglar el CronJob: imagen con `mysqldump` horneado en vez de `apk add`, y `inject: false` o una
`ServiceEntry` que le permita la salida. Mientras no se haga, **el backup diario de prod no existe**,
solo los dumps a mano.
