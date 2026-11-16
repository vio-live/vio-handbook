---
date: 2026-11-16
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 16/11

## Goal
Alan vuelve hoy. Angelo, 16/11: «ve con vev, cupón, que alan termine hoy con ello». La #480
[DiIsksLg](https://trello.com/c/DiIsksLg), códigos de descuento, se cierra hoy en Vev.

## Done
- **11:05 UTC, estado al volver:**
  - En Trello no hay ninguna acción de Alan desde el 13/11.
  - En QA, la última orden es del 12/11 a las 21:42.
  - El 13/11 hubo 4 carritos, todos antes de las 10:26 UTC.
  - QA está arriba.
  - Su página de Vev sigue caducada.
  - Su Woo (`woo-dev.vio.live`) da 530: el túnel está apagado.
  - La campaña 31 está sin código. Siguen `QAVIO15` (lo usa la 18) y `qa_vio10`.
- **11:17 UTC, la #480 reescrita para Vev**, con copia de seguridad de la descripción y las listas antes del cambio.
  - **Descripción nueva:** antes de empezar, cómo se prueba un código en Vev, el orden de hoy y los datos.
  - **Lista 2:** los tipos de cupón se prueban con `?vio_discount=CODE`, cada uno en una ventana privada. Cuando un código
    no entra, la página no dice nada (es así cuando nadie lo tecleó) y el motivo sale en Network, en `ApplyDiscount`.
  - **Lista 5:** marcada. Stripe sin código salió OK el 12/11. Klarna queda fuera porque la clave de plataforma de QA da
    401, y eso no tiene que ver con los códigos.
  - **Lista 10:** pasa de la campaña 18 y la página local a la campaña 31 y su página de Vev. Se quitó el caso de abrir
    la campaña 21, que en Vev no se puede.
- **#481:** las órdenes con la cuenta de Kustom de Boots están cerradas (Angelo: «no podemos seguir poniendo ninguna con
  esa cuenta»). «Boots test» se queda con nuestra cuenta y ya no se le devuelve la configuración de Boots
  (`payment_method` 22b909d1). Descripción y comentario actualizados.

## Decisions
- **La #480 se termina en Vev.** Vev no tiene el campo «Rabattkode», así que los casos de código tecleado pasan a
  `?vio_discount=`.
- **Con la cuenta de Kustom de Boots no se hace ninguna compra más.** Cualquier prueba va con nuestra cuenta.

## Blockers
- Nada nuestro por ahora. Falta que Alan republique su página y encienda su Woo.

## Next session
- Guardia mientras Alan trabaje. Cuando su Woo responda, comprobar que `qa20` vuelve a ser un 20 % y que `qa_gave` no
  está caducado.
