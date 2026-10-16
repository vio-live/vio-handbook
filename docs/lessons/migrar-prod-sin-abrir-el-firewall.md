---
title: "Correr migraciones contra la MySQL de prod sin abrir el firewall"
date: 2026-10-16
tags: [mysql, migraciones, typeorm, kubernetes, firewall, istio]
---

## Problema
La MySQL de prod (`vio-ecom-db-prod-sc`) solo admite **una** IP: la de salida del AKS
(`aks-prod-outbound`, 4.223.89.241). Desde la laptop no se alcanza. Pero las migraciones de
TypeORM quieren correr desde `package-database`, con su `node_modules` y su `.env`, no desde un pod.

La tentacion es anadir tu IP a la regla del firewall "solo un rato". No hace falta.

## Receta
Un pod que hace de proxy TCP, mas `port-forward` encima. La salida del pod usa la IP del cluster,
que es justo la que el firewall admite.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: miguel-dbproxy
  namespace: default
  annotations:
    sidecar.istio.io/inject: "false"   # IMPRESCINDIBLE: con sidecar da connection refused
spec:
  restartPolicy: Never
  containers:
  - name: socat
    image: alpine/socat:1.8.0.0
    args: ["-d","-d","TCP-LISTEN:3306,fork,reuseaddr","TCP:vio-ecom-db-prod-sc.mysql.database.azure.com:3306"]
```

```bash
kubectl wait --for=condition=Ready pod/miguel-dbproxy -n default --timeout=180s
nohup kubectl port-forward -n default pod/miguel-dbproxy 13306:3306 > /tmp/pf.log 2>&1 &
# TYPEORM_HOST=127.0.0.1  TYPEORM_PORT=13306
```

Comprobar que el tunel llega a la base **de verdad** antes de migrar, con algo que identifique al
servidor, no solo "conecta":

```sql
SELECT @@hostname, COUNT(*) FROM migrations;
```

Al terminar: matar el `port-forward`, **borrar el pod** y borrar el `.env` temporal con la
contrasena. Dejar el proxy vivo es dejar un camino abierto a la base de prod.

## Gotchas
- **`sidecar.istio.io/inject: "false"`** o el sidecar intercepta y el destino sano da
  `connection refused`.
- `TYPEORM_MIGRATIONS_RUN=false` y `TYPEORM_SYNCHRONIZE=false` en el `.env`, o algo corre solo.
- `TYPEORM_DRIVER_EXTRA={"ssl":{"rejectUnauthorized":false}}` y `PROCESS_ENV=development` (este
  ultimo decide si TypeORM busca en `src/` o en `dist/`).
- Una a una con `DB_MIGRATION_FILE=<fichero>.ts yarn migration:execute`.
- **El exit code de `migration:execute` no prueba nada**: salio `Done` sin loguear la migracion y
  habia corrido igual. Verificar siempre contra `information_schema` (la tabla, la columna, el
  tipo) y que la fila este en `migrations`.

## Antes de correr
Contar lo que falta **por timestamp**, no por nombre: en `migrations` el nombre es el de la clase
(`brandPublisher1791899686000`) y en disco el del fichero (`1791899686000-brand-publisher.ts`).
Y cuidado con el regex: nombres como `prod100820261786408386473` llevan una fecha pegada al
timestamp, asi que `.*[^0-9]([0-9]{13})$` **no matchea** y se pierden filas silenciosamente
(a mi me dio "173 faltan" cuando eran 4). Usar `.*([0-9]{13})$`, y comparar los dos conteos:
si salen menos timestamps que filas, el regex esta fallando.

## Relacionado
- `docs/journal/2026-10/2026-10-16-release-prod-pasos-1-4.md`
- `docs/playbooks/commerce-db-migrations.md`
