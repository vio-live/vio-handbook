---
title: "Un campo «ausente» que llega con valor de relleno burla el guarda `!= ''`"
date: 2026-11-09
author: miguel
status: live
---

## Síntoma

Un fallback escrito para cubrir «el campo no vino» no entra nunca, y el dato cae en un grupo inventado a
partir del valor de relleno. En el colector de analytics (`stats-paid-orders.ts`, #47): un pedido pagado
aparecía como un «artículo» aparte cuyo `content_id` era una URL, y el `LEFT JOIN` que debía resolver el id
real por (sesión, URL) no se usaba.

## Causa real

El guarda era `if(l_content_id != '', l_content_id, fallback)`. El productor del evento (la SDK web, en el
eco del `purchase` a la vuelta de Vipps) **no deja el campo vacío**: le pone la URL de la página, porque
dispara antes de que el host nombre el artículo. Un valor de relleno no vacío pasa el `!= ''` y gana.

## Cómo se arregla / se evita

- Definir «ausente» por los **valores reales que llegan**, no por el tipo: aquí, además de la cadena vacía,
  un `content_id` que sea una URL (`NOT startsWith(x, 'http')`, o que coincida con el `content_url`).
- Aplicar el mismo criterio **en las dos puntas**: el guarda del `if` y la subconsulta que calcula el
  fallback. Si una de las dos admite el relleno, el fallback puede devolverlo otra vez.
- Comprobarlo con un `GROUP BY` sobre el campo en una ventana real antes de dar el fallback por bueno:
  `SELECT startsWith(content_id,'http'), count() … GROUP BY 1` enseñó 4 casos contra 8.064 — raros, pero
  justo en el camino de los pedidos.
