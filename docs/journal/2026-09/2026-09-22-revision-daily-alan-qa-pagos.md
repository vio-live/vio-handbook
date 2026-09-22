---
date: 2026-09-22
session: "Revisión del daily de Alan del 21/09 contra Trello, código y prod"
participants: [angelo, claude]
status: live
---

# Revisión del daily de Alan (21/09): QA de pagos y limpieza de Trello

## Goal

Angelo pidió analizar lo que Alan dejó en su daily y en las tarjetas: QA de métodos de pago
([oLxB1uL3](https://trello.com/c/oLxB1uL3)), app custom de Villoid, test de Woo en prod y cinco
tarjetas pasadas a Done en la "limpieza". Cada afirmación se contrastó con la tarjeta (checklist,
comentarios, adjuntos), con el código o con prod ([lección](../../lessons/verify-alan-claims-against-code.md)).

## Done

| Tarjeta | Lo que dice Alan | Verificado | Veredicto |
|---|---|---|---|
| QA pagos [#409](https://trello.com/c/oLxB1uL3) (Doing) | Nexi y Qliro "todo perfect"; Vipps falla con varios métodos | Nexi 7/7 + 7/8 propios, Qliro 7/7 (tildados en el mismo minuto). Sin tabla de números ni referencias ni ids de orden ("Entregar" 0/4, "Revisión en Commerce" 0/7); 2 capturas | Probable, **sin la evidencia que pide la tarjeta** |
| Vipps con varios métodos | "Da error porque no muestra input de email" | **Confirmado en código**: con un canal cuyos métodos recogen todos la dirección (Nexi + Qliro + Vipps) no hay formulario, y el botón de Vipps exigía el email antes de seleccionar el método; el campo solo existe con Vipps seleccionado. No es regresión de Adyen/Kustom (check del 10/08, formulario oculto desde el 08/09) | **Bug real, arreglado en local** (ver abajo) |
| Nexi con varios métodos | "Hay que volver a llenar el formulario del widget" | Confirmado en código: con un método que necesita nuestro formulario (Klarna, Adyen, Stripe) el paso 1 sale antes de elegir; al elegir Nexi se oculta y Nexi pide todo otra vez. shopcart le pasa como mucho el email (`merchantHandlesConsumerData: false`) | UX a decidir (Angelo) |
| Suscripciones URGENTE [#405](https://trello.com/c/WJ7SPrQJ) → Done | "Testeado, todo OK" | El arreglo ([users-ms #10](https://github.com/vio-live/vio-users-microservice/pull/10)) sigue **abierto**, 0 reviews, sin actividad desde el 14/09; ningún commit de self-heal en middleware; checklist 0/5; sin comentario al cerrar | **No sostenido** |
| Costos Azure [#394](https://trello.com/c/BiGqMoI0) → Done | "Se completan puntos faltantes" | Pasada a Done a las 18:06, **después** de la [verificación de Miguel](2026-09-21-verificacion-avances-alan-semana-38.md) (14:50) que desmintió varios puntos (Redis prod sigue con HA, BD prod sin HA, autoscaler min=3); QA ya no usa E2as_v5 desde el 18/09 | **Contradicho** por la verificación |
| Categorías de feed [#400](https://trello.com/c/hTu1aQ1K) → Done | "En prod todo ok" | Árbol de prod leído hoy (`/api/categories`): 26 raíces sin duplicados, raíces de vendedor con nombre (Boots, Kondomeriet, Nytelse), ningún "Feed 1305/1306", protector solar en `Boots > Helse og skjønnhet > Personlig pleie > Kosmetikk > Hudpleie > Solbeskyttelse` | **Correcto**; falta la evidencia pedida (0/3) |
| Boots [#398](https://trello.com/c/a4XA1byC) → Done | "Todo ok en prod" | Lo de Vio sí (import, NOK, categorías). Quedan sin hacer "¿se pueden publicar?" y los tres pedidos a Boots, entre ellos el bloqueante (feed congelado desde marzo); el feed no se pudo consultar desde aquí (DNS). Un comentario del 09/09 tiene **una contraseña de prod en claro** | Cerrada con pendientes; **rotar esa contraseña** |
| Filtro por Source [#383](https://trello.com/c/aDpy7Sba) → Done | "Testeado, todo OK" | Fix en QA desde el 03/09; sin comentario ni captura de la prueba | Creíble, sin evidencia |
| Villoid [#410](https://trello.com/c/phMU2DP0) | Probado de punta a punta | 10 capturas, observaciones concretas. Ya recogido en el [journal de vio-sync de hoy](2026-09-22-vio-sync-suspension-y-app-demo.md); las observaciones siguen sin tarjeta | Bien documentado |
| Woo en prod | Instalación, API key, conexión y sync OK | Sin tarjeta ni evidencia | Sin verificar |

Patrón: cinco tarjetas pasaron a Done entre las 18:06 y las 18:14 del 21/09 con checklists
incompletos y sin comentario de cierre. De esas cinco, una se sostiene (#400), una es creíble
(#383), una deja pendientes fuera (#398) y dos no se sostienen (#405, #394).

La página de Vev `a-vio-dev.vev.site/bohus-demo` sirve hoy el SDK **0.14.0** (Adyen + Kustom):
si Alan probó después del deploy de las 16:55 del 21/09, Nexi y Qliro pasaron sobre el SDK nuevo.

**Arreglo de Vipps** (`vio-web-sdk`, rama `fix/vipps-email-multi-method`, commit `462e7f2`,
**sin pushear**): el primer clic en Vipps selecciona el método y muestra su campo de email; el
botón de pagar lo pide. Test DOM que reproduce el caso de Alan (falla sin el arreglo); suite
220/220, `tsc` limpio.

## Decisions

Ninguna tomada. Pendientes de Angelo: flujo del paso 1 con métodos mezclados (preguntar el método
primero, o precargar el widget de Nexi); qué hacer con #405 y #394.

## Blockers

- Actualizaciones de Trello (reabrir #405, comentar #394/#409, tarjetas para los pedidos a Boots y
  para "órdenes no llegan si el proveedor es el vendedor") esperan el OK de Angelo.
- Contraseña de prod en claro en un comentario de #398.

## Next session

1. OK de Angelo → PR del arreglo de Vipps, merge, rebundle, `vev deploy`, y que Alan lo repita.
2. Alan: tabla de números y referencias por compra en #409; completar Walley, Klarna, Stripe,
   Apple Pay; la frase cortada "cuando agrego Klarna es…".
