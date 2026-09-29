---
title: Migración de staging/QA a Sweden Central
last-updated: 2026-09-29
estado: listo para ejecutar, esperando el OK de Angelo
---

Plan para mover **staging/QA** de Norway East a Sweden Central, escrito **el mismo día** que se
migró producción y con las 20 cosas que salieron mal en esa migración ya incorporadas.

La diferencia con el corte de producción no es el procedimiento: es que **hoy todo lo que costó
tiempo fue descubrimiento**, y el descubrimiento ya está hecho. Este plan mueve casi todo a la
fase previa y deja una ventana corta y mecánica.

## Ventaja específica de staging: no hace falta ventana

Staging **se apaga solo**: `job-qa-aks-start` a las 06:00 y `job-qa-aks-stop` a las 23:00,
**lunes a viernes** (más `job-qa-mysql-start/stop` a las 05:55 y 23:15). Los fines de semana está
entero apagado — el coste lo confirma: 1,18 USD/día contra 18 en semana.

**Hacer el corte un sábado significa cero impacto en nadie.** Producción no tuvo ese lujo.

## Alcance

| Componente | Origen (Noruega) | Destino |
|---|---|---|
| Cluster AKS | `kubernetesqa` (RG `qa`, Norway East, 2× B2ms, autoescala 2-3) | `kubernetesqa-sc` (RG nuevo `rg-vio-qa-sc`) |
| MySQL | `vio-ecom-db-staging` (`Standard_B2s` Burstable, **Norway West**) | `vio-ecom-db-staging-sc` |
| Redis | `redus-vio-staging` (`Balanced_B0`, Norway West) | `redus-vio-staging-sc` |
| Storage | `containerqa2` | `containerqasc` |
| Registry | `reachuqa2` | `vioqasc` |
| Service Bus | `qa-product-processing2`, `qa-order-processing2` | `vio-qa-product-processing-sc`, `vio-qa-order-processing-sc` |
| Schedulers | `cae-qa-ops` + 4 jobs de Container Apps + `id-qa-aks-scheduler` | recrear apuntando al cluster nuevo |

**13 microservicios** en el namespace `default`, más Istio, Calico y cert-manager.

**Dominios afectados:** `api-ecom-staging`, `api-ecom-dev`, `graph-ql-staging`, `graph-ql-dev`
(los 4 en el mismo cluster). Hoy todos resuelven a `20.251.70.230`.

**Fuera de alcance, no tocar:** `vio-partner-mock*` (App Service, independientes),
`vio-load-testing`, `viopartnermockv2`, y los Insights asociados.

---

## Fase 0 — Prerrequisito que cambia todo (hacer YA, no en la ventana)

**Mergear los 13 PRs abiertos contra `develop`** (`fix/helm-image-desde-acr`). Sin esto, el CI/CD
de staging despliega un manifiesto con el registry **hardcodeado en el `values.yaml` del chart**
(`reachuqa2.azurecr.io`), y el cambio de registry no se sostiene: el primer deploy lo revierte.

Con los PRs mergeados, helm toma `$ACR/$APP_PREFIX` y el registry pasa a ser sólo un secreto.
**Esto convierte el paso más doloroso de hoy en un no-evento.**

Verificación: `grep 'set image.repository'` en el workflow de `develop` de los 13 repos.

---

## Fase 1 — Construir el destino (sin tocar nada vivo, días antes)

1. **RG y cluster.** `rg-vio-qa-sc` en Sweden Central; AKS `kubernetesqa-sc` con el mismo
   nodepool (`Standard_B2ms`, autoescala 2-3). Instalar Istio, Calico y cert-manager.
2. **MySQL y Redis.** `vio-ecom-db-staging-sc` (`Standard_B2s` Burstable) y `redus-vio-staging-sc`
   (`Balanced_B0`). **Replicar la config exacta**, no los defaults: en producción el Redis tenía
   `NoEviction` + RDB cada 12 h porque es un store, no un caché.
3. **Storage + registry.** `containerqasc` y `vioqasc` (Standard).
4. **Service Bus.** Los 2 namespaces con las colas replicando `lockDuration`,
   `maxDeliveryCount`, `maxSize` y `deadLetteringOnMessageExpiration` del origen, **comparados lado
   a lado antes de seguir**.

### 1b — Permisos, ANTES de borrar nada (esto rompió 3 veces hoy)

El service principal del CI/CD tenía permisos **scopeados al recurso del cluster viejo**, así que
**se borraron junto con el cluster**. Replicar de una vez, comparando hasta dar 0 faltantes:

- `AcrPull` + `AcrPush` en el registry nuevo -> copiar todas las asignaciones del viejo
- `Storage Blob Data Contributor` en el storage nuevo (el Dockerfile baja el `.env` con
  `--auth-mode login`, o sea RBAC de plano de datos: sin esto el **build** falla)
- `Azure Kubernetes Service Cluster User Role` en el cluster nuevo (sin esto falla
  `az aks get-credentials`)
- `AcrPull` a la identidad kubelet del cluster nuevo

Comparar origen y destino y exigir **0 diferencias** antes de continuar.

### 1c — Certificados: emitir ANTES del corte

QA ya tiene cert-manager con `Certificate` reales (`domain-cert-base-apiqa`,
`domain-cert-graph-qlqa`, con renovación al 05/12) — mejor punto de partida que producción, donde
los secrets se habían copiado crudos y **no se renovaban**.

En el cluster nuevo, **usar DNS-01 con Cloudflare, no HTTP-01**. En producción los issuers usaban
HTTP-01 con clase `nginx` mientras el tráfico entraba por **Istio**: nunca habría funcionado.
DNS-01 además **permite emitir el certificado antes de mover el DNS**, porque no necesita que el
dominio ya apunte al destino. Ese es el truco que hace la ventana corta.

Emitir a **nombres de secret nuevos** y sólo cambiar el Gateway cuando el `Certificate` esté
`Ready`. Así los certificados que funcionan nunca están en riesgo.

### 1d — Datos y configuración

5. **Copiar blobs con `azcopy` Y DESPUÉS replicar el `publicAccess` de cada contenedor.**
   `azcopy` **no copia el nivel de acceso público**, y el Front Door lee anónimo: en producción eso
   dejó ~46.000 imágenes en 404 durante una hora. Comparar contenedor por contenedor contra el
   origen y **no aplicar `blob` a ciegas a todos** (los que tienen `.env` deben quedar privados).
6. **Regenerar los `.env` del storage**, no sólo los Secrets de Kubernetes. El `Dockerfile`
   **hornea el `.env` en la imagen** al construir, así que un blob viejo se cuela en el próximo
   build aunque el cluster esté bien. Respaldar los blobs antes de sobrescribir.
7. **Migrar Redis** con el script de DUMP/RESTORE y verificar **clave por clave con SHA1**
   (`~/vio-migracion/corte/comparar-redis.py`). Enumerar hasta alcanzar `DBSIZE`: un solo `SCAN`
   contra Azure Managed Redis puede devolver menos claves de las que hay.
8. **Réplica de MySQL** hacia Suecia, y **dump verificado restaurándolo** antes del corte.
   Al restaurar hace falta **`SET GLOBAL innodb_strict_mode=0`**: la tabla `user` tiene 69 columnas,
   44 `VARCHAR(>=255)` en utf8mb4, y sin eso el restore deja **106 de 119 tablas terminando con
   código 0** — falla en silencio. Contar tablas y filas después, siempre.
9. **Locks y alertas** sobre lo nuevo: `CanNotDelete` en cluster, DB, Redis, storage, registry e
   IPs. Y alertas de la DB — producción no tenía **ninguna** y las 4 que existían vigilaban staging.

---

## Fase 2 — Ventana (un sábado, staging ya apagado)

Orden que importa, aprendido hoy:

1. Encender el cluster nuevo y desplegar los 13 servicios (imágenes importadas por digest desde
   `reachuqa2`, **verificando que el digest coincide**).
2. **Promover la réplica de MySQL** y comparar contra el origen: conteo exacto de filas por tabla
   y huella `COUNT(*)` + `SUM(id)`. Exigir **0 tablas con menos filas en el destino**.
3. Apuntar el DNS de los 4 dominios a la IP nueva (TTL 60).
4. **Recién ahora** verificar los servicios que se llaman a sí mismos por el dominio público.
   En producción `products` estaba en CrashLoopBackOff con 27 reinicios porque llamaba a
   `api-ecom.vio.live` al arrancar: **503 antes del DNS, 200 después**. No es un fallo, es orden de
   operaciones. **Estos servicios no se pueden validar antes del corte.**
5. Cambiar los Gateways a los certificados nuevos (ya emitidos en la fase 1c).
6. Recrear los 4 jobs de Container Apps apuntando al cluster nuevo, y **desactivar los viejos**.
   Si no, el scheduler viejo enciende un cluster que ya no sirve tráfico y factura.

## Fase 3 — Verificación (con la regla que hoy falló)

**Verificar cada camino de lectura con un objeto que EXISTE**, exigiendo `200` + tamaño +
`content-type`. Hoy "verifiqué" el storage pidiendo un blob **inexistente**: daba el mismo 404 que
un contenedor privado, así que la prueba no distinguía "no existe" de "no tengo permiso" y las
imágenes estuvieron caídas una hora sin que lo detectara.

- Los 4 dominios: `200` con cuerpo real, no sólo código
- Una imagen real por el CDN: `200` + bytes + `image/jpeg`
- Un blob privado (`env-file-microservices`): debe dar **404 a petición anónima**
- La DB **recibiendo escrituras**: comparar conteos con 30 minutos de diferencia. "Arriba" no es
  "funcionando"
- Logs de los 13 servicios: 0 `ECONNREFUSED`, `getaddrinfo`, `no healthy upstream` ni referencias
  a Noruega
- **Pods: esperar 60-90 s antes de medir.** Medir antes da falsos "no listos"
- Un deploy real por CI/CD de un servicio, no sólo `kubectl`

## Fase 4 — Desmantelar Noruega (no el mismo día)

1. **Service Bus: mirar `scheduledMessageCount`, no sólo la cola activa.** La aplicación programa
   mensajes con entrega futura, y los agendados antes del corte **se materializan solos a su hora**
   en el namespace viejo, sin consumidor. Mantener el namespace viejo hasta que llegue a 0.
   Para inspeccionar usar **peek puro**, no peek-lock: liberar el lock en bucle **incrementa el
   contador de entregas** y hoy mandé un mensaje a dead-letter yo mismo.
2. **Borrar el private endpoint huérfano antes del cluster.** `db-staging` reserva una IP en la
   subnet del cluster; con él presente, borrar el cluster falla con
   `InUseSubnetCannotBeDeleted`. Verificar que está `Disconnected` primero.
3. Apagar el cluster (`az aks stop`) unos días antes de borrarlo: **mismo ahorro de cómputo,
   conserva el rollback**.
4. **Borrar recurso por recurso, NUNCA por resource group.** `rg-vio-databases` tiene nombre de
   Noruega pero contiene la **DB de producción de Suecia**. Un barrido de RG se lleva producción.
5. Antes de borrar cualquier config que "no se usa": buscarla en el código y docs de **toda la
   organización**. Hoy tres cosas que parecían basura estaban **pendientes a propósito**
   (`api-commerce.vio.live` es la reserva del plugin de WooCommerce, la app de Villoid espera que
   el cliente instale). Guardar lo retirado en el handbook para que restaurar sea copiar y pegar.

## Fase 5 — CI/CD de staging

Los secretos son **por repo, no de organización**: 13 repos × los sufijos `_QA` y `_STAGING`.

| Secreto | Valor nuevo |
|---|---|
| `AZ_KUB_NAME_QA` / `_STAGING` | `kubernetesqa-sc` |
| `AZ_KUB_RG_QA` / `_STAGING` | `rg-vio-qa-sc` |
| `AZ_STORAGE_QA` / `_STAGING` | `containerqasc` |
| `ACR_QA` / `_STAGING` | `vioqasc.azurecr.io` |

`AZ_RG_*` **no se consume en ningún workflow** (0 usos reales): no tocarlo.

**Leer los workflows del remoto con `gh api`, no de clones locales.** Hoy un clon desactualizado
en `~` me hizo reportar que los workflows diferían entre repos. No diferían.

**Un fix de CI no está verificado hasta que corre.** Canario de **un** repo hasta el final,
verificar el estado real en el cluster, y sólo entonces replicar **por lotes** de 3 a 5. El
workflow termina con `kubectl delete pod -l ...`, que borra **todos** los pods del servicio a la
vez: 13 en paralelo es mucha rotación simultánea.

Y **no usar `kubectl set image` para mover el registry** si después va a desplegar helm: deja un
field manager `kubectl-set` dueño del campo `image` que rompe el server-side apply con
`conflict occurred while applying object`. Dejar que lo haga el pipeline, o limpiar la entrada de
`managedFields` (se ven con `kubectl get deploy --show-managed-fields -o json`).

---

## Reserva: para staging NO conviene

Dos razones independientes:

1. **No existen reservas para estos SKUs.** `Standard_B2ms` -> sin reservas en ninguna región.
   MySQL **Burstable** -> sin reservas (Azure sólo las ofrece para General Purpose y Memory
   Optimized). Verificado con `priceType eq 'Reservation'`.
2. **Aunque existieran, perderían dinero.** Staging corre **50,6% del tiempo** por el apagado
   nocturno; una reserva factura **24/7**. Con 35-38% de descuento pagaríamos el 62-65% de 24/7
   para usar el 50,6%.

El ahorro de staging es **mover la región** (~70 USD/mes), y el grande ya está hecho: el apagado
programado rinde más que cualquier reserva.

## Ahorro esperado del movimiento

Descuentos regionales reales (**no son un 25% plano**, ese fue mi error de hoy):
`B2ms` 18,5%, Redis `B0` 42,9%, MySQL General Purpose 39,6%.

| Componente | Hoy (medido) | En Suecia |
|---|---|---|
| Cluster QA | ~323/mes | ~263/mes |
| MySQL staging | ~62/mes | por confirmar (`B2s` no aparece en el catálogo de Suecia — **verificar el SKU destino antes de construir**) |
| Redis staging | ~23/mes | ~13/mes |

## Limpieza que se puede hacer ya, sin esperar la migración

- `domain-cert-app-dev-vio-live` (vence 06/10): **0 gateways lo referencian** y
  `dashboard-dev.ecom.vio.live` ya devuelve 000. Cert huérfano, borrable.
- `gateway-reachu-qa-microservices` sirve el host `20.251.70.230` (una IP, no un dominio): revisar
  si tiene sentido.
- `gateway-reachu-prod-graph-ql-qa` está **mal nombrado** (dice "prod", es QA). Renombrar cuando se
  reconstruya en Suecia.

## Estimación de tiempo

Producción llevó ~7 h con todo el descubrimiento incluido. Con este plan:
- Fase 0 y 1 (sin ventana, días antes): ~3 h de trabajo repartidas
- Fase 2 (ventana, sábado con staging apagado): **~45 min**
- Fase 3 (verificación): ~30 min
- Fase 4 (desmantelar, días después): ~30 min

Lo que hace la diferencia no es ir más rápido: es que **el descubrimiento ya está pagado** y que
los certificados y los permisos se resuelven antes de la ventana, no dentro.
