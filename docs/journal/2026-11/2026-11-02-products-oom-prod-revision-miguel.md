## Revisión de los reinicios OOM de `products` en prod — Miguel
- Quién: Miguel, a petición de claude en el handoff (02/11 12:20 UTC), por encargo de Angelo
- Dónde: `vio-commerce-prod-sc` (AKS, Sweden Central), deployment `products`, namespace `default`
- Cuándo: 2026-11-02, ~12:25-12:35 UTC
- Contexto: `products` se reiniciaba por «JavaScript heap out of memory» (exit 134) en prod: 17
  reinicios en `-kd99m`, 5 en `-h5mr6`. claude preparó el fix (menos logging + `NODE_OPTIONS`) y
  pidió que yo mirara memoria histórica y si Datadog rechaza/frena los envíos de logs.
- Hecho:
  - Confirmé el síntoma en vivo con `kubectl describe pod products-76b696fb69-kd99m`: exit 134,
    `limits.memory: 2Gi`, sin `NODE_OPTIONS`, 18 reinicios en el momento de mirar.
  - **Container Insights (addon `omsagent`) NO está habilitado en `vio-commerce-prod-sc`**
    (`addonProfiles` vacío en `az aks show`). No hay serie histórica de memoria por pod en Azure:
    no pude responder si la memoria sube gradual o a saltos, ni desde cuándo, más allá de lo que
    ya se ve en los restart counts y exit codes actuales.
  - **No tengo la Application Key de Datadog** en ningún Secret de k8s del cluster — solo la
    `DATADOG_API_KEY` (de escritura), que no sirve para consultar la API de métricas/logs. Miré
    ~1h de logs del pod `kd99m` (pre-fix) buscando 429/413/ECONNRESET del transporte HTTP: no
    encontré ninguno real (los que parecían 429/413 eran dígitos sueltos dentro de IDs de Shopify).
    Muestra corta y con menos tráfico que el pico que describió claude, así que no es concluyente
    en ningún sentido.
  - Mientras miraba esto, Angelo mergeó
    [products#45](https://github.com/vio-live/vio-products-microservice/pull/45) (12:21 UTC) y el
    CI/CD lo desplegó solo. Vi el rollout completo en vivo: `kubectl rollout status` terminó
    `successfully rolled out`, 2 pods nuevos `2/2 Running`, `NODE_OPTIONS=--max-old-space-size=1536`
    aplicado y los probes de #19 (15/15/6 liveness, 10/10/6 readiness) ya en el deployment de prod.
  - Revisé el diff de #45: el `NODE_OPTIONS` va en `charts/products/values.yaml` → `env` →
    plantilla `deployment.yaml`, no un `kubectl patch` manual (evita el problema de siempre:
    [[feedback_kubetl_patch_rompe_helm]]).
- Pendiente: nada de mi lado ahora. Si vuelve a acercarse al límite de 2Gi, mirar primero si el
  volumen de webhooks de Shopify creció antes de subir el heap más.
