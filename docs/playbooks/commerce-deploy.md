---
title: "Cómo desplegar — Vio Commerce (microservicios + base-api + graph-ql)"
last-updated: 2026-09-03
owner: miguel
status: live
---

# Cómo desplegar — Vio Commerce

Verificado en vivo 2026-09-03 leyendo `.github/workflows/deploy.yml` de los repos + estado real de los clusters. Para el mapa de servicios/módulos ver [`architecture/vio-commerce.md`](../architecture/vio-commerce.md); para URLs por entorno ver [`infrastructure/environments-and-endpoints.md`](../infrastructure/environments-and-endpoints.md).

## El flujo, en una frase

**Push a una rama → GitHub Actions build+push a ACR → `helm upgrade` al AKS del entorno. Automático, sin aprobación humana, sin excepción.**

## Paso a paso

1. Trabajás sobre `develop` (o una feature branch que mergeás a `develop` por PR).
2. Al hacer push/merge a `develop`, el workflow `deploy.yml` del repo del servicio corre solo:
   - `docker build` de la imagen, tag `:${{ run_number }}` y `:latest`
   - `docker push` a `reachuqa2.azurecr.io/<APP_PREFIX>`
   - `helm upgrade --install <APP_PREFIX> ./charts/<APP_PREFIX>-0.1.0.tgz` contra el AKS `kubernetesqa`
   - `kubectl delete pod -l app.kubernetes.io/instance=<APP_PREFIX>` (fuerza que los pods nuevos levanten con la imagen recién pusheada)
3. Eso es "QA" — que hoy **es lo mismo que staging y que dev** (ver nota de abajo). No hay paso intermedio de aprobación.
4. Cuando el cambio está listo para prod: merge a `master`. Mismo workflow, mismo mecanismo, pero apunta a `reachuprod2.azurecr.io` + cluster `vio-commerce-prod`.

**No hay `pre-develop` en uso real hoy.** El workflow lo soporta (mapea a secrets `_STAGING` separados), pero nadie pushea ahí — confirmado revisando el historial de runs de varios repos. Si algún día se activa, dejaría de ser cierto que QA=staging=dev.

## Qué NO hay

- No hay gate de aprobación manual entre push y deploy — un push a `develop` o `master` despliega solo.
- No hay ambiente de pre-prod real distinto de QA hoy (ver arriba).
- No hay rollback automático — si algo rompe, es `helm rollback <APP_PREFIX>` a mano contra el cluster correspondiente, o revertir el commit y dejar que el pipeline redeploye.
- No hay tests bloqueantes en el pipeline (no vi step de `test`/`jest` en `deploy.yml` — el build no falla si los tests fallan, porque ni se corren).

## Desplegar manualmente (si el pipeline no sirve, ej. debugging)

```bash
az acr login --name reachuqa2   # o reachuprod2 para prod
docker build -t reachuqa2.azurecr.io/<servicio>:debug .
docker push reachuqa2.azurecr.io/<servicio>:debug

az aks get-credentials --resource-group qa --name kubernetesqa --overwrite-existing
kubectl set image deployment/<servicio> <servicio>=reachuqa2.azurecr.io/<servicio>:debug -n default
```

## Kernel compartido (`@vio-/*`) — no se "despliega", se publica

Los paquetes `package-*` (`config`, `database`, `logger`, `utils`, `service`, `definitions`, `testing`) no corren en un cluster — se publican a npm (`registry.npmjs.org`, scope `@vio-`) y cada microservicio los consume como dependencia. Bump de versión + publish, después cada microservicio actualiza su `package.json` y sigue el flujo normal de deploy de arriba.

## Migraciones de DB

Separadas del deploy de código — no las corre el pipeline. Ver [`playbooks/commerce-db-migrations.md`](./commerce-db-migrations.md). Los microservicios NO corren `runMigrations()` al arrancar (su `TypeOrmModule` solo tiene `synchronize`), así que un deploy de código nunca aplica schema — hay que correr las migraciones a mano, aparte, antes o después según si el código nuevo depende de la columna.

## Gotchas conocidos (ver `lessons/`)

- [SnakeNamingStrategy vs migración raw SQL](../lessons/raw-sql-migration-column-name-must-match-naming-strategy.md) — una migración mal escrita puede tumbar un servicio en producción sin que el deploy de código tenga la culpa.
- `shopify-import` está deployado y corriendo en prod hoy pese a que otra doc vieja decía que estaba deprecado — confirmar con el equipo antes de asumir cualquiera de las dos cosas.
