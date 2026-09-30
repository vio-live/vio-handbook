---
title: Respaldo de la base de producción (Vio Commerce)
last-updated: 2026-09-30
---

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
- **Cuándo:** `15 2 * * *` (02:15 UTC). La base pesa ~90 MB, el dump tarda segundos.
- **Qué hace:** `mariadb-dump --single-transaction --routines --triggers --events` de `outshifter`,
  gzip -9, y `PUT` al Blob REST API.
- **Destino:** `viodbbackupwe` / contenedor `mysql-prod`, **West Europe**, `Standard_GRS`, tier Cool.
- **Retención:** regla de ciclo de vida `expire-90d`, borra a los 90 días.
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

## Verificado de punta a punta (2026-09-30)

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

## Lo que sigue sin estar cubierto

**No hay HA.** Angelo lo descartó por ahora (30/09): son +178 USD/mes y duplicaría el coste del
servidor. Si se cae la zona 3 de Sweden Central, la base se cae con ella; estos dumps permiten
reconstruirla en otra región, no evitar el corte.
