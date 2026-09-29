---
title: Config retirada el 2026-09-29 (por si hay que restaurarla)
last-updated: 2026-09-29
---

Config que se retiró del cluster de Suecia por estar muerta. Se guarda íntegra acá para que
restaurarla sea copiar y pegar. Si algo de esto se echa en falta, aplicarlo tal cual.

## `msrvc-p.vio.live` — Gateway + VirtualService

Enrutado por path a los microservicios (`msrvc-p.vio.live/<servicio>`). Retirado porque:
**no tenía registro DNS**, el `tls-secret` que referenciaba **no existía**, cero referencias
en código fuera del handbook, y estaba marcado como pregunta abierta sin respuesta desde el
`2026-08-20-infra-audit.md` ("¿config huérfana de un rename a medias?").

```yaml
apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: gateway-reachu-prod-microservices
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
  - hosts:
    - msrvc-p-pre-develop.vio.live
    port:
      name: http
      number: 80
      protocol: HTTP
    tls:
      httpsRedirect: true
  - hosts:
    - msrvc-p.vio.live
    port:
      name: https
      number: 443
      protocol: HTTPS
    tls:
      credentialName: tls-secret
      mode: SIMPLE

---
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: virtual-service-reachu-prod-microservices
  namespace: istio-system
spec:
  gateways:
  - gateway-reachu-prod-microservices
  hosts:
  - msrvc-p.vio.live
  http:
  - match:
    - uri:
        exact: /payment-processors
    - uri:
        prefix: /payment-processors/
    rewrite:
      uri: /
    route:
    - destination:
        host: payment-processors.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /api
    - uri:
        prefix: /api/
    rewrite:
      uri: /
    route:
    - destination:
        host: api.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /collections
    - uri:
        prefix: /collections/
    rewrite:
      uri: /
    route:
    - destination:
        host: collections.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /orders
    - uri:
        prefix: /orders/
    rewrite:
      uri: /
    route:
    - destination:
        host: orders.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /users
    - uri:
        prefix: /users/
    rewrite:
      uri: /
    route:
    - destination:
        host: users.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /products
    - uri:
        prefix: /products/
    rewrite:
      uri: /
    route:
    - destination:
        host: products.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /extensions
    - uri:
        prefix: /extensions/
    rewrite:
      uri: /
    route:
    - destination:
        host: extensions.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /shopcart
    - uri:
        prefix: /shopcart/
    rewrite:
      uri: /
    route:
    - destination:
        host: shopcart.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /templates
    - uri:
        prefix: /templates/
    rewrite:
      uri: /
    route:
    - destination:
        host: templates.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /middleware
    - uri:
        prefix: /middleware/
    rewrite:
      uri: /
    route:
    - destination:
        host: middleware.default.svc.cluster.local
        port:
          number: 80
  - match:
    - uri:
        exact: /tracking
    - uri:
        prefix: /tracking/
    rewrite:
      uri: /
    route:
    - destination:
        host: tracking.default.svc.cluster.local
        port:
          number: 80

```
