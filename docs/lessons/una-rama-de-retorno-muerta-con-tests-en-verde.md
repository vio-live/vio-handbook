---
title: "Una rama de retorno muerta con los tests en verde"
last-updated: 2026-09-18
owner: angelo
---

# Una rama de retorno muerta con los tests en verde

**Qué pasó (18/09).** El retorno de Kustom en `vio-checkout` (`?order_id=…&payment_processor=KUSTOM`)
estaba detrás de un `if (!vioPayment && !checkoutId) return` que corta todo lo que no lleve
`vio_payment` ni `checkout_id`. La URL de confirmación de Kustom no llevaba ninguno de los dos, así
que la rama **nunca se ejecutaba**: tras pagar, el comprador volvía al artículo y no pasaba nada.
El test que la cubría ("no crea una orden nueva mientras lee la pagada") sólo afirmaba un
**negativo** — que no se llamara a `mount` — y un negativo se cumple igual cuando no corre nada.

**La regla.** Un test de un camino de retorno tiene que afirmar algo que **sólo** pasa si el camino
corrió: el recibo en pantalla, la lectura llamada con los parámetros de la URL, la URL limpia. Si
todas las aserciones son "no se llamó a X", el test no distingue "funciona" de "no existe".

**Y la otra.** Toda detección de retorno de un proveedor va **antes** del corte genérico por
parámetros, y con los parámetros que ESE proveedor manda de verdad (Kustom: `order_id` +
`payment_processor`; Adyen: `vio_payment`; Nexi: `paymentId`). Si el corte genérico crece, cada
proveedor necesita su test positivo.

Ver [journal 2026-09-18](../journal/2026-09/2026-09-18-kustom-terminar-integracion.md).
