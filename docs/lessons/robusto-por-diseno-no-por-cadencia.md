---
title: "Lesson: robusto por diseño, no por cadencia"
last-updated: 2026-09-25
owner: angelo
status: live
---

# Lección — robusto por diseño, no por cadencia

## Qué nos costó

El 2026-09-24 Makeup Mekka instaló su app custom de Shopify. Su token venció a las 14:10 y
el cron que empuja la copia a Vio corrió a las 14:30: veinte minutos en los que cada webhook
de su tienda falló con 401 y Pub/Sub reentregó el mismo mensaje una y otra vez (una orden,
doce veces en un minuto). El arreglo obvio era acortar el cron y renovar el token antes de
que venciera. Se hizo, funcionó, y la respuesta honesta a "¿ya está resuelto de manera
robusta?" fue: **para operar sí; por diseño no** — seguía dependiendo de que un cron
corriera a tiempo.

Angelo: *"te dije que hiciéramos todo bien"*. Tenía razón, y la otra mitad (que el backend
le pida el token al dueño cuando lo necesita) quedó escrita esa misma tarde.

## La regla

**Si un sistema depende de que otro le empuje un dato a tiempo, es robusto por cadencia:
funciona mientras el cron corra.** Robusto por diseño es cuando el dato vive en un solo
lugar y quien lo necesita lo pide — y ante un fallo, lo vuelve a pedir y reintenta.

Corolarios:

- Acortar el cron reduce la ventana; no la elimina. Sirve como parche mientras se hace lo
  otro, no en lugar de lo otro.
- **Cuando el pedido es "arreglalo completamente", la mitad que depende de otro equipo
  también es tuya.** Escribirla y dejarla lista para review es distinto de "esto lo tiene que
  hacer X".
- Decir en qué punto está la robustez ("para operar / por diseño") es lo correcto; dejarlo
  ahí, no.

## Señales que aparecieron en el camino

- **Los reintentos inflan las métricas.** 577 `products/update` para 85 productos y 75
  `orders/fulfilled` para 11 órdenes no eran un ERP sincronizando stock: eran Pub/Sub
  reentregando mensajes que fallaban. Antes de explicar un volumen, comprobar que no haya
  errores debajo.
- **"Le dieron a dos productos" no es "exportaron".** Tildar es cliente; exportar es un
  POST. Reconstruirlo llevó una hora cruzando cuatro logs, y los de Vercel duran menos de un
  día: por eso el app ahora audita cada acción del merchant (`/internal/audit`).
- **`kubectl logs deploy/<svc>` lee una sola réplica.** El push que "faltaba" estaba en el
  otro pod. Recorrer los pods o mirar el gateway.

Detalle: [journal 2026-09-24](../journal/2026-09/2026-09-24-vio-sync-endpoint-token.md) ·
[playbook de apps custom](../playbooks/shopify-app-custom-por-cliente.md) ·
[con tokens que rotan, el refresh tiene un solo dueño](tokens-rotados-un-solo-dueno.md).
