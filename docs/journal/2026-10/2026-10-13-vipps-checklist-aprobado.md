---
date: 2026-10-13
session: "Vipps aprueba el checklist ePayment: listos para producción"
participants: [angelo, claude]
status: live
---

# Vipps aprueba el checklist ePayment

## Goal

Leer la respuesta del equipo de integración de Vipps al checklist enviado el 08/10 y decidir qué contestar.

## Done

- **Checklist aprobado**: «from technical perspective you are ready to proceed into production». La
  aprobación avisa al equipo de partners de Vipps, que puede contactar.
- Vipps pregunta si vamos con **merchant keys o partner keys**, pide que avisemos en el mismo hilo cuando
  el **primer cliente salga en producción** (lo revisan en vivo) y recuerda la status page (ya suscrita).
- El hilo es de Michael: preguntó a Vipps cómo iba la revisión, Vipps pidió un vídeo de la integración y
  Michael lo envió. La aprobación llega en respuesta a ese vídeo; la respuesta va en ese mismo hilo.

## Decisions

- Respuesta propuesta: **partner keys como modelo por defecto** (lo que ya construimos: unidad bajo el
  acuerdo de partner, partner keys + `Merchant-Serial-Number`, el comercio no ve claves ni MSN), y
  **merchant keys** para el comercio que ya tiene su propio acuerdo (modo own). Pedir partner keys de
  producción y acceso a la Management API (product orders) para el alta de comercios.

## Blockers

- Producción: release pendiente (prod va muy por detrás de QA), partner keys en el entorno
  (`VIPPS_PARTNER_*`), registrar el webhook de partner (`scope: 'partner'` → `VIPPS_PARTNER_WEBHOOK_SECRET`),
  `EMAIL_DELIVERY=on`, `PAYMENT_SECRETS_KEY` en prod. Elegir el primer comercio que sale en vivo.

## Plan de salida

Escrito en [`partners/vipps/go-live-produccion.md`](../../partners/vipps/go-live-produccion.md). Al
prepararlo, dos riesgos vivos en producción, comprobados en el cluster: **los correos están apagados
desde el 12/10 13:18 UTC** (kernel 1.0.268 sin `EMAIL_DELIVERY`; sin órdenes desde entonces, nada
perdido todavía) y **el SDK 0.20.3 pide `duplicate_of`, que el gateway de producción aún no tiene**
(graphql #23 sin subir). Además `VIPPS_API_URL` de producción apunta a `apitest.vipps.no` y no hay partner
keys ni webhook de partner.

## Next session

- Con las partner keys: plan de release a producción por servicio, y avisar a Vipps en el hilo cuando el
  primer comercio esté en vivo.
