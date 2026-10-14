---
title: "0030 — api-staging pasa por DNS al micro, sin migrar; Vio API y Commerce en hosts separados"
date: 2026-10-14
status: accepted
owner: angelo
deciders: [angelo]
amends: "0029 (staging: split por path en el nginx de Oracle; exportar VG/Lyko y Aller antes del corte)"
---

# 0030 — `api-staging` por DNS al micro, sin migrar; Vio API y Commerce separados

## Contexto

En la prueba de punta a punta del 14/10 ([playbook](../playbooks/e2e-campanas-commerce.md)),
una surface creada en el dashboard tiene su key en el micro de campañas (Commerce). Vev en
"Staging" le pide la config a `api-staging.vio.live`, que es vio-backend en Oracle, y responde
**401**. La ruta es la misma; lo que cambia es el servidor.

Se probaron dos salidas y Angelo las descartó:
- un entorno aparte en Vev ("Staging (Commerce campaigns)");
- un split en nginx con respaldo a vio-backend.

Su criterio: *"desconectar el dominio y conectarlo a lo nuevo"*, y *"me gusta lo de Commerce
separado por un lado y api por el otro"*.

## Decisión

1. **`api-staging.vio.live` pasa por DNS (Cloudflare) al micro de campañas en AKS QA**, igual que
   prod según ADR-0029. Sin split por path en Oracle y sin respaldo a vio-backend. Las rutas no
   portadas devuelven **410**.
2. **Sin migración.** Las surfaces, keys y campañas que viven en vio-backend staging (VG, Aller
   vieja, Lyko) no se pasan al micro. Quien las necesite las recrea en el dashboard y pega la key
   nueva; en la práctica, el loop de VG de Alan. Exportarlas a un fichero queda como respaldo
   opcional, no como requisito.
3. **Regla de hosts:**

   | Lado | Prod / staging | Qué sirve |
   |---|---|---|
   | **Vio API** | `api.vio.live` / `api-staging.vio.live` | micro de campañas y surfaces: `/v2/mobile/*` (config del SDK), `/api/client-apps`, `/api/campaigns`, `/api/sponsors`, `/api/auth/me` |
   | **Commerce** | `api-ecom(-staging).vio.live`, `graph-ql(-staging).vio.live` | catálogo, channels, carrito, checkout, pagos, órdenes |
   | **Analytics** | `events(-staging).vio.live` | eventos |

   `campaigns(-staging).vio.live` queda como nombre interno o técnico del servicio. Lo público es
   `api(-staging)`.
4. **Ni el SDK ni Vev cambian.** El default del SDK (`apiBase = api(-staging).vio.live`,
   `graphQLBase = graph-ql…`) ya es este mapa. La rama `feature/campaigns-staging-env` de Vev
   se descarta: nunca se pusheó; solo se desplegó en el sandbox personal.

## Consecuencias

- **El loop de VG de Alan se corta** hasta que recree su surface en el dashboard y pegue la key.
  Hay que avisarle antes del corte.
- **QA se apaga de noche y los fines de semana** ([qa-aks-scheduler](../infrastructure/qa-aks-scheduler.md)),
  y con el corte `api-staging` se apaga con QA. vio-backend en Oracle estaba siempre arriba.
  Si hace falta `api-staging` fuera de horario, hay que encender QA o cambiar el horario.
- **El colector `events-staging`** resuelve las keys contra la Postgres de vio-backend, así que
  las surface keys del micro **no atribuyen eventos** hasta portarlo. Pendiente aparte; no afecta
  órdenes.
- **El webapp** deriva `api-staging` para `reachu-qa` (`src/lib/vio.js`). Después del corte, el
  override `VIO_API_HOST` de Vercel sobra.
- **Rollback:** volver el registro de Cloudflare a la VM de Oracle.

El paso a paso está en
[micro-campanas-infra §9b](../handoff/micro-campanas-infra.md#9b-corte-de-api-staging-adr-0030).
