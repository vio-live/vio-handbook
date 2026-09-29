---
title: Cambiar el origen del Front Door rompe las imágenes si no se copia el public-access del contenedor
last-updated: 2026-09-29
---

## Síntoma
Después de apuntar el Front Door (`container.vio.live`) al storage nuevo, **todas las imágenes
devuelven 404**, aunque los blobs existen en el storage nuevo y el ruteo del CDN funciona.

## Causa real
`azcopy` copia **blobs**, no copia el **nivel de acceso público del contenedor**. Los
contenedores creados en el destino quedan en `publicAccess: None` por defecto.

El Front Door lee del origen de forma **anónima**. Contra un contenedor privado, Azure Blob
responde **404, no 403** (a propósito: no revela si el blob existe). Así que el CDN devuelve 404
y parece "falta el archivo" cuando en realidad es "no tengo permiso".

En la migración de 2026-09-29 quedaron privados los 3 contenedores que servían assets
(`reachu-uploads-production`, `outshifter-uploads-production`, `others`), rompiendo ~46.000
URLs de imágenes del catálogo.

## Cómo se arregla
Replicar el `publicAccess` del origen, contenedor por contenedor — **nunca a ciegas sobre todos**:

```bash
az storage container set-permission --account-name <destino> --account-key <k> \
  -n <contenedor> --public-access blob
```

En Vio, sólo estos 3 son públicos. `env-file-microservices`, `cost-exports`,
`inventory-reports` y `db-backups` **deben quedar privados** — el primero tiene los `.env`.

## Cómo se evita (el error de método, que es lo importante)
La migración se había "verificado" pidiendo un blob **inexistente** por el CDN y comparándolo
con el storage: ambos devolvían el mismo `ResourceNotFound` de Azure, y se concluyó que el
ruteo estaba bien. **El ruteo estaba bien, pero esa prueba no podía distinguir un 404 por
"no existe" de un 404 por "contenedor privado": los dos casos se ven idénticos.**

**Regla: verificar un camino de lectura con un objeto que SÍ existe y comprobar `200` + tamaño
+ content-type. Un 404 esperado no prueba nada más que el ruteo.**
