---
date: 2026-09-22
session: "Cómo llega una venta de Vio al sistema del comercio: estudio de plugins y PSP"
participants: [angelo, claude]
status: live
---

# Cómo llega una venta de Vio al sistema del comercio

## Goal

Angelo quiere comprobar de punta a punta el modelo de productos por feed de Google + cobro con
las credenciales del comercio. La pregunta: ¿la orden llega a su tienda, Woo o Shopify, sin
conectarla a Vio por plugin ni API? Antes de dársela a Alan como prueba pidió aprender cómo tiene
que funcionar. Para eso se leyeron el código de los plugins oficiales de cada PSP y su
documentación.

## Done

- **Estudio por PSP**: Nexi, Qliro, Kustom, Klarna Payments, Vipps, Adyen, Walley y Stripe, más
  Shopify. Leído el código de nuestro lado: webhook `order.paid`, carga por feed y credenciales del
  vendedor. El resultado, con enlaces a las líneas, está en
  [payments.md — Cómo llega la venta al sistema del vendedor](../../architecture/payments.md#cómo-llega-la-venta-al-sistema-del-vendedor).
- **Conclusión**:
  - Ningún plugin oficial crea una orden a partir de un pago que no inició. Kustom, Nexi y Walley
    tuvieron creación de respaldo y la quitaron.
  - Dar la URL del plugin del comercio resuelve la entrega del aviso, no el registro.
  - En Vipps, Adyen y Stripe el aviso le llega solo, porque sus webhooks son de la cuenta, pero su
    plugin lo descarta.
  - El único aviso con los ítems del comercio para cualquier PSP es nuestro `order.paid`. Del lado
    de la tienda hace falta un receptor.
- **Feed de Kondomeriet** (`kondomeriet.no/export/googleshopping.xml`): 2.754 productos y 627 con
  `item_group_id` (tallas). Solo 989 traen `mpn`, así que el SKU que manda `order.paid` mezcla
  `mpn` e `id`, y en las variantes no dice la talla. Su tienda corre en IIS, una plataforma propia
  de Microsoft, y muestra Klarna y Vipps.
- **Correcciones de docs**:
  - En payments.md: Vipps sí cae a la cuenta de Vio; la opción A solo está en develop; el SKU es
    el de producto; la ruta que descarta campos es `/users/settings/:id`.
  - En [vg-lyko-feed-to-checkout.md](../../architecture/vg-lyko-feed-to-checkout.md): nota fechada
    sobre la UI del webhook, la rama ya mergeada y BigCommerce.

- **Mapa de qué falta por método** para entregar la orden y opciones del alta de un método de
  pago: en la misma sección de payments.md. Lo más grave: cuatro PSP caen a la cuenta de Vio sin
  avisar, después del pago se descartan todos los avisos, no hay captura ni devolución para los
  cinco métodos nuevos, Vipps se queda sin capturar y Klarna manda las líneas sin SKU.

## Decisions

Ninguna tomada. Propuesta para Angelo: hacer de `order.paid` el contrato. Le faltan el `g:id` de
la variante, el total, la referencia de la PSP y reintentos durables. Al comercio se le da un
receptor pequeño en lugar de depender del plugin de su PSP.

## Blockers

- **Seguridad, en prod**, encontrado leyendo código y sin probar contra ningún entorno:
  - `PATCH /api/users/:id` no comprueba que quien llama sea el dueño.
  - El webhook público de Stripe completa órdenes sin verificar el evento.

  - El endpoint de devoluciones no tiene autenticación.
  - Marcar el envío no comprueba que quien llama sea el dueño de la orden.
  - No verificamos la firma del webhook de Vipps, y la de Nexi se salta si no hay autorización.

  Quedaron como tareas aparte para arreglarlas en su propia sesión.
- **Cuentas de prueba**: todas las que funcionan en QA son de Vio. Para ver que el dinero llega
  al comercio hace falta una cuenta de prueba a su nombre, por ejemplo una de Nexi creada para
  la prueba.

## Next session

1. OK de Angelo → tarjeta para Alan con la prueba en tres puntos:
   - que los webhooks de cuenta del comercio (Vipps, Adyen o Stripe) reciben nuestros pagos;
   - que el plugin los descarta, visto en su log;
   - el camino feed → compra → `order.paid` → receptor → orden en una Woo limpia, sin nuestro
     plugin.
2. Arreglar los dos pendientes de seguridad y publicarlos en prod.
