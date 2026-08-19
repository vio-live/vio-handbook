---
date: 2026-08-20
session: infra-audit-vio-commerce-prod
participants: [angelo, miguel]
status: open-questions-for-alan
---

# Audit de infra — 2026-08-20 — Miguel

> Pedido por Angelo: leer todo el handbook de infra + contrastar contra el estado real
> (Azure/AKS/DNS/Cloudflare) y ver qué falta de lo acordado. Angelo va a pasarle estas
> preguntas a Alan para que responda/actúe.

## Método

Se leyó `docs/infrastructure/*.md` completo + se verificó contra estado real: `az aks list`,
`az resource list`, `kubectl get pods/hpa/certificate/virtualservice/ingress`, `dig`, `curl -D`.
No se tomó nada de la documentación como verdad sin verificar en vivo.

## Hallazgos — documentación desactualizada (ya corregido en memoria del agente)

1. **`azure-overview.md` (última actualización 2026-07-02) dice `kubernetesqa` fue eliminado
   → FALSO.** Sigue `Running`, k8s 1.35.6, RG `qa`. Se prende/apaga a diario por cron. El ACR
   `reachuqa2` tampoco está inactivo — sigue con repos.
2. **`dashboard.ecom.vio.live` no corre en AKS.** El doc dice que es el deployment `webapp` en
   `vio-commerce-prod` — no existe ese pod en el cluster. Headers confirman que lo sirve
   **Vercel**. Migración no documentada.
3. **`docs/handoff/shopify-sync.md` tiene dominios viejos** (`shopify-sync.vio.live`,
   `shopify-sync-staging.vio.live`) — el dominio real hoy es `sync.vio.live` /
   `sync-staging.vio.live` (Vercel, confirmado por CNAME + headers). El rename fue por política
   de Shopify (no permiten "shopify" en el nombre de dominio de una app listada).

## Preguntas / acciones pendientes para Alan

1. **`sync-dev.vio.live` sin registro DNS** — `sync.vio.live` y `sync-staging.vio.live` sí
   resuelven (Vercel). Falta crear el DNS de dev. ¿Alan lo crea o ya está en Vercel esperando el
   CNAME?
2. **Microservicio `shopify-export` (AKS, `vio-commerce-prod`) — ¿sigue siendo necesario con
   dominio propio, o quedó obsoleto/reemplazado por la app `vio-shopify-sync` (Vercel,
   `sync.vio.live`)?** Son cosas distintas (`shopify-export` es un microservicio interno de Vio
   Commerce; `vio-shopify-sync` es la app embebida de Shopify). El pod corre sano (2/2 Running)
   pero:
   - Sin DNS externo (nunca tuvo — confirmado NXDOMAIN)
   - Sin `VirtualService`/`Gateway` de Istio
   - Certificado `domain-cert-shopify-exportprod` en `False` (nunca se emitió) desde hace 63 días
   - Este mismo gap ya se había detectado en el audit del 2026-07-03 y sigue sin resolver.
3. **`shopify-import`** — mismo problema de certificado (`domain-cert-shopify-importprod: False`),
   pero está marcado como **deprecado** en varios docs. ¿Confirmar que se puede limpiar
   (borrar cert + cualquier resto de config) sin romper nada?
4. **Certs ACME huérfanos** — pods `cm-acme-http-solver-*` de 63 días para `sales-channel.vio.live`
   y `shopify-seller.vio.live` (ambos dominios deprecados, sin DNS). Basura de un intento viejo
   de emisión de cert que nunca completó. ¿Limpiar?
5. **`msrvc-p.vio.live`** — existe un `VirtualService` de Istio con este hostname exacto, no
   documentado en ningún lado (los docs hablan de `msrvc.vio.live`, sin el `-p`). Sin DNS, no
   responde. ¿Qué es esto — config huérfana de un rename a medias, o algo que Alan sabe y no está
   documentado?
6. **No hay HPA (autoscaling) en ningún microservicio de `vio-commerce-prod`.** El plan del
   2026-06-09 (`vio-commerce-prod-plan.md`, Tarea 2) pedía "deploy + HPA autoscaling" como una
   sola tarea — el deploy se hizo, el autoscaling nunca se configuró. ¿Se prioriza ahora o se
   pospone?

## Confirmado como resuelto (el doc del plan nunca se actualizó, pero está hecho)

- DB nueva en Azure para Vio Commerce (bloqueante #1 del plan `vio-commerce-prod-plan.md`) — sí
  existe: `vio-ecom-db-prod` / `vio-ecom-db-staging` (Azure MySQL Flexible Server) en
  `rg-vio-databases`, separada de Hetzner.
- Redis migrado a Azure Managed Redis (`redus-vio-prod`/`staging`) — confirmado.
- IPs estáticas provisionadas según el plan (`aks-outbound-vio-prod`, `nginx-ingress-vio-prod`),
  aunque el ingress real es Istio, no nginx (el nombre es legado, no afecta funcionalidad).

## Siguiente paso

Angelo le va a pasar estas preguntas a Alan. Pendiente actualizar `azure-overview.md` y
`docs/handoff/shopify-sync.md` una vez se resuelvan los puntos 2, 3 y 5 (para no documentar algo
que puede volver a cambiar).
