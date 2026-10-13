---
title: "Sesión de infra del 13/10 (y madrugada del 14) — Miguel"
last-updated: 2026-10-14
owner: miguel
status: live
---

# Sesión de infra del 13/10 — Miguel

Día largo con el equipo de agentes trabajando en paralelo sobre el plan de campañas. Este doc es
el **handoff**: qué cambió, cómo quedó verificado y de qué depende lo que falta. El detalle de
cada cosa está en el [journal del 13/10](../journal/2026-10/2026-10-13.md) (siete entradas) y el
[del 14](../journal/2026-10/2026-10-14.md); acá no se repite.

## Lo que cambió, en una tabla

| # | Qué | Dónde | Estado |
|---|---|---|---|
| 1 | **Mixpanel activado** en el colector de analytics de producción | VM `82.70.54.151` | fan-out verificado end-to-end |
| 2 | **`api.vio.live` cerrado** a lista blanca y el dashboard viejo de staging también | nginx de las dos VMs de Oracle | 403 JSON con `X-Vio-Reason` |
| 3 | **Seis deploys de F0** seguidos y verificados; un build rojo re-lanzado | users, api, base-api | el fix de seguridad da 401 en prod y QA |
| 4 | **Revisión del PR del kernel** + las 4 consultas en QA **y prod** | `package-database#17` | comentada en el PR |
| 5 | **Micro de campañas: repo, chart, pipeline, 25 secrets, DNS, certs, Istio** | `vio-campaigns-microservice` + los 2 clusters | **vivo en QA** |
| 6 | **Las 3 migraciones del kernel en QA** + release `pkg=all` 1.0.270 + bump de los 11 | `kubernetesqa-sc` | 11/11 bumps y deploys verdes |
| 7 | **PR #50 del webapp mergeado** y el dominio de staging desclavado | Vercel | staging sirve el commit del merge |
| 8 | **QA en alto esta noche**, a pedido de Angelo | jobs de Container Apps | con restauración programada |

## Estado verificado al cierre (00:45 del 14/10)

Comprobado con `curl` y `kubectl`, no de memoria:

```
campaigns-staging.vio.live/health               200 {"status":"ok"}
campaigns-staging.vio.live/v2/mobile/config     401  (su propia auth)
campaigns-staging.vio.live/v1/engagement/config 410  (ruta retirada)
api-ecom-staging.vio.live/health-check          200
dashboard-staging.ecom.vio.live                 200  (commit 8ac55e6)
api-ecom.vio.live/health-check                  200  (producción intacta)
```

14/14 deployments de QA completos. El pod de campaigns lleva 5 h sin reinicios con la imagen
`campaigns:6`, desplegada por el pipeline **sin intervención mía**, que es la señal de que la
infra quedó andando sola.

## Lo que falta, y de qué depende cada cosa

| Pendiente | Espera a | Quién |
|---|---|---|
| Cerrar la regla `all` del firewall de la MySQL de QA | OK de Angelo (hoy la usé para las migraciones) | Miguel |
| Los **7 PRs** del dispatch del kernel, para sumar el micro | ya se puede: el `package.json` existe | Miguel |
| `env-sc-campaigns` en producción | que el micro llegue a `main` | Miguel |
| Espejo server-side de analytics (`ANALYTICS_*` en vio-backend) | decisión: el colector de prod sigue sin recibir eventos | Angelo |
| Encender `VIO_CAMPAIGNS_V2` y `ACCOUNT_PAYMENTS` | que el micro tenga TypeORM y que api F2.3 + base-api 2.6 estén en QA | front |
| Mover `api.vio.live` al ingress de AKS en el corte | que el micro esté listo (ya no hace falta proxy desde Oracle) | Miguel |

## Lecciones nuevas de hoy

- [Las réplicas no evitan el corte del deploy](../lessons/las-replicas-no-evitan-el-corte-del-deploy.md)
  — medí **62 s de 503 en producción** con 4 réplicas, porque el pipeline borra todos los pods.
- [El kernel tiene dependencias que no declara](../lessons/el-kernel-tiene-dependencias-que-no-declara.md)
  — el micro nuevo es el canario.
- [A qué proyecto de Mixpanel pertenece un secreto](../lessons/a-que-proyecto-de-mixpanel-pertenece-un-secreto.md)
  — un 200 no prueba que sea el proyecto correcto.

## Documentación que corregí (incluida mía)

Vale la pena listarlo porque el patrón se repite: **un doc que describe el estado de ayer hace
perder una hora hoy.**

- `environments-and-endpoints`: nombres de cluster y ACR de Noruega, IPs viejas, y `msrvc-p.vio.live`
  listado como entrada por path **cuando ya no existe** (0 registros en Cloudflare, ningún Gateway).
- `qa-aks-scheduler`: decía "suspender el job" para pausar el horario, y eso **no existe** en
  Container Apps. Ahora lleva la receta real.
- `micro-campanas-infra`: los storages del `.env` que figuraban eran los de Noruega, y los valores
  de los secrets "se copian de collection" — imposible, un GitHub Secret no se lee.
- `levantar-colector-analytics-prod`: seguía diciendo "hoy no hay colector".
- **Mía, del 12/10:** verifiqué que `dashboard-staging` y prod servían deployments distintos y lo
  di por bueno. Era cierto y engañoso: staging servía un deployment **fijo** de develop, no el
  último. Un "son distintos" no prueba "sigue a la rama".

## Dos errores propios, por si sirven

- **Backticks en un `git commit -m`** con comillas dobles: la shell **ejecutó** lo que había dentro,
  y uno de esos fragmentos era un `kubectl delete pod` con el contexto de **producción**. No borró
  nada solo porque el comando exige nombre o selector. Desde ahora, mensajes con backticks por
  fichero (`-F`).
- **Compactar el índice de memoria cortando por frase**: el corte se tropezó con los decimales y
  dejó 24 entradas mutiladas, y al restaurarlas desde el `description` de cada fichero pisé seis
  punteros de "superada". Las dos cosas corregidas; la segunda era la peligrosa, porque una
  entrada superada que parece vigente te hace trabajar sobre información vieja.
