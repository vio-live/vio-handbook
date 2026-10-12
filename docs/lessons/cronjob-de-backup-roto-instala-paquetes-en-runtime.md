---
title: El CronJob de backup de la DB de prod no fallaba por el horario, fallaba por diseño
last-updated: 2026-10-12
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
