---
title: Los webhooks declarados por el app no salen en webhookSubscriptions
last-updated: 2026-10-22
owner: miguel
---

## Sintoma

`GET /admin/api/2024-04/webhooks.json` devuelve `0`, y GraphQL
`webhookSubscriptions(first:50)` tambien `0`, en **las cuatro** tiendas Shopify conectadas a
produccion. Conclusion inmediata (y equivocada): «nadie le va a avisar a Vio de nada; la cadena
envio -> captura no existe».

## Causa real

Esas dos consultas listan **solo** las suscripciones creadas **por la Admin API**. Esta familia de
apps no crea ninguna: las **declara el propio app** en su config
(`shopify.app.vio-sync.toml`, bloque `[[webhooks.subscriptions]]`) y Shopify las registra al
desplegar la config, entregandolas **por Pub/Sub** (`uri = "pubsub://<proyecto>:<topic>"`).
Las declarativas no aparecen en esa consulta.

Dos consecuencias que se suelen deducir mal:

- **`write_webhooks` no hace falta.** Solo se necesita para registrar por API. Un webhook declarado
  en la config no se pide por API, asi que su ausencia en los scopes **no prueba** que no haya
  webhooks. Tampoco obliga al comercio a volver a aprobar la app.
- El comentario del codigo que dice «app custom, lo declara el app»
  (`extensions/src/modules/shopify/providers/shopify.service.ts:2270`) no describe una carencia:
  describe el diseno.

## Como comprobarlo de verdad

No se pregunta a la tienda: se mira si **llegan** los mensajes y de quien.

1. El consumidor esta vivo y recibiendo:
   `kubectl logs -l app=extensions -c extensions --since=3h | grep -c "Received message"`
   (y `.env` del pod: `SHOPIFY_GCP_PUBSUB_SUPPLIER_SUBSCRIPTION_TOPIC`).
2. **De que tienda viene cada mensaje**: sacar ids de recurso de los cuerpos que se loguean y
   pedirlos con el token de cada conexion. `200` = es de esa tienda, `404` = no.
   Asi se confirma que una tienda concreta esta entregando, sin preguntarle a Shopify.
3. Un topic declarado en el **mismo** bloque `[[webhooks.subscriptions]]` que otro que si llega
   esta registrado igual: se registran juntos.
4. **Comprobar que no hay otro entorno en la misma suscripcion.** Pub/Sub reparte: dos consumidores
   en la misma suscripcion se llevan la mitad de los mensajes cada uno y el que no reconoce la
   tienda hace `ack` y los tira. Mirar el nombre de suscripcion de cada entorno, no solo el proyecto.

## Regla

Un recuento de `0` en una consulta **no prueba** la ausencia del mecanismo: prueba que el mecanismo
no es el que estas consultando. Antes de rediseñar algo porque «no existe», buscar el camino
alternativo en la config del app, no solo en la API del recurso.
