---
title: Producción apagada para ahorrar (30/09/2026) — estado y cómo volver
last-updated: 2026-09-30
owner: miguel
---

# Qué se apagó, y por qué

El 2026-09-30, **por decisión de Angelo**, se detuvieron el cluster de producción y su base de datos
para bajar el gasto mientras la empresa llega al lanzamiento. Ahorro: **~270 USD/mes**.

Se planteó antes que la alternativa de achicar a 2 nodos ahorraba ~62 sin cortar nada, y que el
apagado no es un cero porque siguen facturando ~112. Angelo eligió apagar igual, y es una decisión
razonable: la plataforma **no tiene ventas reales**.

| | |
|---|---|
| Órdenes últimas 24h | 0 |
| Órdenes últimos 7 días | 9, todas de `tes***@vio.live`, sin importe |
| Orden anterior | 19/08, de un miembro del equipo |

Lo que sí se pierde es la sincronización de catálogos (127 productos/día, 32 conexiones Shopify) y el
dashboard para 23 usuarios activos.

## Estado tras el apagado

```
vio-commerce-prod-sc   powerState: Stopped
vio-ecom-db-prod-sc    state: Stopped
```

**Caído:**

| Dominio | |
|---|---|
| `api-ecom.vio.live` | no responde |
| `graph-ql.vio.live` | no responde |

**Sigue en pie**, porque no depende del cluster:

| Dominio | Dónde vive |
|---|---|
| `container.vio.live` | Cloudflare -> storage. **Todas las imágenes siguen sirviéndose.** |
| `api.vio.live`, `events.vio.live` | Oracle |
| `www.vio.live`, `sync.vio.live`, `dashboard.ecom.vio.live` | Vercel (el dashboard carga, pero sin datos: su API está abajo) |

## Antes de apagar se sacó un backup

No se confió en el CronJob diario, porque **vive dentro del cluster y con el cluster apagado no
corre**. Se lanzó a mano y se verificó: `outshifter-20260930T124434Z.sql.gz`, 6.172.379 bytes, gzip
válido, **119 de 119 tablas**, en `viodbbackupwe` (West Europe).

Mientras esté todo apagado **no hay backups nuevos**. Tampoco hacen falta: la base está detenida y no
cambia nada.

## Cómo volver a encenderlo

```bash
# la base primero: si sube el cluster antes, los pods arrancan sin base y entran en CrashLoop
az mysql flexible-server start -g rg-vio-databases -n vio-ecom-db-prod-sc
az aks start -g rg-vio-commerce-prod-sc -n vio-commerce-prod-sc

# comprobar
az aks show -g rg-vio-commerce-prod-sc -n vio-commerce-prod-sc --query powerState.code -o tsv
curl -s -o /dev/null -w '%{http_code}\n' https://api-ecom.vio.live/     # debe dar 200
```

El orden importa por lo mismo que en el scheduler de QA.

## Dos cosas que hay que recordar

1. **Azure reenciende sola una MySQL Flexible detenida a los 30 días.** No son 7, como se dijo en un
   primer momento: el aviso del propio comando dice 30. Cae alrededor del **2026-10-30**. Hay un job
   programado para el 26/10 (`40228cbc`) que avisa a Angelo para que decida.
2. **Apagar no lleva el gasto a cero.** Siguen facturando ~112 USD/mes: discos, balanceador, IPs,
   Redis, el storage y el almacenamiento de la base. Si se quiere bajar más, hay que borrar, no
   apagar — y eso ya no es reversible con un comando.
