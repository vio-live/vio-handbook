---
title: Un SAS de contenedor hace fallar azcopy --list-of-files con 403, y un SAS de solo lectura produce un exito falso
last-updated: 2026-10-01
---

## Síntoma
`azcopy copy --list-of-files` se queda en `Scanning...` y no transfiere nada. En el log:

```
GET https://<cuenta>.blob.core.windows.net/<contenedor>?restype=container&...&sp=rcwl&sr=c
RESPONSE Status: 403 This request is not authorized to perform this operation.
<Code>AuthorizationFailure</Code>
```

Y `azcopy jobs show <id>` responde `no job with JobId ... exists`, porque el trabajo nunca arrancó.

## Causa real
Aislado con `curl`, el SAS **de contenedor** sí sirve para listar pero no para leer las propiedades
del contenedor:

```bash
# listar -> 200
curl "https://<cuenta>.blob.core.windows.net/<cont>?restype=container&comp=list&maxresults=1&$SAS"
# propiedades del contenedor -> 403
curl "https://<cuenta>.blob.core.windows.net/<cont>?restype=container&$SAS"
```

**Get Container Properties exige permisos de nivel cuenta.** `--recursive` no llama a esa operación;
`--list-of-files` sí, para resolver el destino. De ahí que la misma copia funcione con `--recursive` y
falle con `--list-of-files` usando el mismo SAS.

## Solución
SAS de **cuenta**, no de contenedor:

```bash
az storage account generate-sas --account-name <cuenta> --account-key "$KEY" \
  --services b --resource-types sco --permissions rwcl --expiry "$EXP" -o tsv
```

`--resource-types sco` (service, container, object) es lo que habilita la operación.

## El error encadenado que es peor que el 403
Reutilicé un archivo de SAS que había generado **para contar**, con permisos `rl` (sólo lectura), como
destino de una copia. El resultado:

```
Final Job Status: CompletedWithSkipped
Total Number of Bytes Transferred: 0
```

**Un SAS de sólo lectura en el destino no da error: da un éxito aparente.** Lo leí como "ya estaba
copiado" y seguí adelante. El 403 al menos grita; esto no.

## Reglas que saco
1. **No reutilizar tokens entre un paso de lectura y un paso de escritura.** Nombrar el archivo por su
   permiso (`sas-lectura-*`, `sas-escritura-*`) o regenerarlo en el propio paso.
2. **`Bytes Transferred: 0` con `CompletedWithSkipped` no es "ya estaba": es una pregunta.** Verificar
   contando el destino antes de darlo por hecho.
3. Comprobar el permiso del token antes de usarlo: `grep -o 'sp=[a-z]*'` sobre el SAS.

## Relacionado
- `lessons/mismo-cidr-permite-conservar-la-ip-privada-al-migrar.md`
