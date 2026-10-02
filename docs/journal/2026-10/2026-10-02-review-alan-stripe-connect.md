---
date: 2026-10-02
session: review-alan-stripe-connect-y-prod
participants: [angelo, claude]
status: live
---

# Review de los comentarios de Alan (30/09): Stripe Connect y migración de prod

## Goal

Angelo pidió revisar lo que Alan dejó en Trello el 30/09 («gran parte del día revisando Stripe…
levanto la mano por Android/iOS… seguí con lo de prod»), listarlo y decidir qué corregir.

## Done

- 30 acciones de Alan en el board desde el 30/09: comentarios con capturas en
  [Stripe Connect](https://trello.com/c/l1fQDCcE) y en
  [migración de prod](https://trello.com/c/qn0U7hz2); dos tarjetas movidas a Done; Vipps sin tocar.
- Contrastado con código, Azure y el journal de la sesión de Connect
  (`2026-09-29-stripe-connect.md`, tabla de hallazgos):
  - Payment link con cuenta de Vio → «tax code missing»: Managed Payments del sandbox; lo apaga
    Angelo en el Dashboard (pendiente).
  - Claves propias sin orden: preexistente; el barrido ya cubría Stripe (shopcart#51). **Hoy la
    orden nace al volver**: `GetCheckoutById` reconcilia un checkout de Stripe abierto con la
    clave del seller, una llamada por checkout cada 5 s
    ([shopcart#53](https://github.com/vio-live/vio-shopcart-microservice/pull/53)).
  - OAuth 400 al «conectar cuenta existente»: las capturas muestran que eligió cuentas creadas
    por Vio; Stripe no las vincula por OAuth. Mensaje claro en el 400
    ([api-ms#34](https://github.com/vio-live/vio-api-microservice/pull/34)) y aviso bajo el botón
    ([webapp#43](https://github.com/vio-live/webapp-vio-commerce/pull/43), staging en Vercel).
  - Cliente vacío de Stripe (auditoría del 28/09): el customer lleva email/nombre/teléfono
    (shopcart#53).
  - Android/iOS: sin evidencia; se le pide el error concreto.
- Los tres arreglos desplegados: shopcart#53 y api-ms#34 en QA (pods nuevos 10:30 y 10:32 UTC),
  webapp#43 en staging (Vercel). Comentario con el triage y la lista de re-pruebas dejado en la
  tarjeta de Alan.
- Prod (Miguel lo lleva): la regla `all` 0.0.0.0–255.255.255.255 que Alan puso en la MySQL de prod
  **sigue puesta** (`vio-ecom-db-prod-sc`, acceso público; servidor parado). Lo demás (istio label,
  DaemonSet prepull borrado, `shopcart-reconcile` «da error» = barrido con shopcart apagado,
  «products se caía» sin datos) queda en su tarjeta.
- Tarjetas a Done: «auditoría Klarna/Stripe» correcto; «URGENTE suscripciones» discutible
  (users-ms #10/#11 siguen revertidos; el commit que cita, 86bec0a, es del 11/09 y ya estaba en
  prod). Decisión de Angelo pendiente.
- Dato operativo: QA vive en Sweden Central desde el 01/10 (`kubernetesqa-sc`, ACR `vioqasc`); el
  contexto `kubernetesqa` ya no existe.

### Verificación en QA (Claude, 02/10 11:43 UTC — Alan no estaba)

- Bohus (canal 498) hoy solo ofrece Vipps, así que el payment link se pidió por GraphQL:
  `CreateCheckout` → `UpdateCheckout` (email, Stripe, condiciones, direcciones — sin direcciones
  shopcart cae con `first_name` de null) → `CreatePaymentStripe` → link de test creado, orden 4429.
  **El error de Managed Payments ya no aparece** (apagado en la cuenta de test).
- Pagado con la 4242 en el link: Stripe redirigió a la página (`http://localhost` lo acepta), la
  SDK mostró «Takk! Betalingen er bekreftet» a los ~4 s y el checkout quedó `SUCCESS`. Lo completó
  el **webhook** (`checkout.session.completed` → `processOrderPaidByCustomer` orden 4429); el
  camino «completar al leer» (shopcart#53) no tuvo que actuar porque la cuenta de Vio sí tiene
  webhook. El caso de claves propias queda para la re-prueba de Alan.

## Decisions

- **Todo se cierra en test antes de ir a prod** (Angelo, 02/10). Managed Payments apagado en la
  cuenta de Stripe de **test** el 02/10; la cuenta **live** se toca el día de la release (añadir a
  la lista de la release).
- Lo de prod no se toca desde esta sesión: Miguel.
- **Fuera del cierre en test, por ahora** (Angelo, 02/10): Walley (sin cuenta de test), Nexi
  (sin claves), Klarna (sin API keys de prueba) y Adyen (credencial en 401). Lo que sí cuenta:
  re-pruebas de Stripe Connect y la tarjeta de Vipps (Alan), claves/usuario MT y la tarjeta
  «URGENTE» (Angelo), la DB de prod y el gateway (Miguel).
- Reconciliar al leer, no un endpoint nuevo: sin cambios en SDK/graphql/base-api, mismo handler
  idempotente del webhook y del barrido.

## Blockers

- Managed Payments en la cuenta **live**: pendiente para la release.
- Alan sin evidencia de Android/iOS.

## Next session

- Alan re-prueba 2, 3 y 4 con los PR desplegados.
- «URGENTE suscripciones» **devuelta a Doing** (Angelo, 02/10): #10/#11 de users-ms siguen
  revertidos; Alan tiene que explicar el 401 y re-aplicarlos o descartarlos por escrito.
