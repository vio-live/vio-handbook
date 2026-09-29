---
title: "Varios merges seguidos al mismo servicio chocan en helm y el pod queda con una imagen que no es el head"
last-updated: 2026-09-30
owner: angelo
---

# Varios merges seguidos al mismo servicio chocan en helm y el pod queda con una imagen que no es el head

**Síntoma:** mergeaste tres PRs de shopcart con segundos de diferencia. Los tres workflows
arrancan a la vez; los tres `build` terminan bien, pero dos `deploy` fallan con
`Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress`. El único
`helm upgrade` que entró fue el del primer PR, y el pod que levantó **no lleva el código del
head de `develop`**. Nadie se entera: develop dice una cosa y el clúster corre otra.

**Por qué:** el workflow (`deploy.yml`, ver [cómo desplegar](../playbooks/commerce-deploy.md))
etiqueta la imagen `:latest` y el chart despliega `:latest` con `pullPolicy: Always`; el
deploy hace `helm upgrade` y luego `kubectl delete pod` para forzar el pull. Con tres builds en
paralelo, **`latest` es la del build que hizo `docker push` en último lugar, que no tiene por
qué ser el commit más nuevo** (el 2026-09-29 fue el PR del medio: #48 empujó a las 22:29:10,
#49 a las 22:29:06). Y helm solo admite una operación a la vez por release, así que los otros
dos deploys mueren sin tocar nada.

**Qué hacer:**

1. **Mergear un PR por servicio a la vez** y esperar a que su run termine (~6 min) antes del
   siguiente. Si son PRs apilados del mismo servicio, mejor aún: un solo merge del último.
2. Si ya pasó: relanzar el run **del commit head** de la rama, **completo**
   (`gh run rerun <run-id> -R vio-live/<repo>`), no solo el job fallido (`--failed`): el job
   de deploy por sí solo instalaría el `latest` que haya, que puede seguir sin ser el head.
   Antes, `helm history <release>` por si la release quedó en `pending-upgrade`
   (entonces `helm rollback` y después el rerun).
3. Comprobar con algo que solo exista en el head (una ruta nueva, una línea de log nueva), no
   con la edad del pod: el pod nuevo puede ser viejo por dentro.

**Cómo se vio:** [journal 2026-09-29/30 Vipps](../journal/2026-09/2026-09-29-vipps-partnership-express.md),
sección «Madrugada del 30/09».
