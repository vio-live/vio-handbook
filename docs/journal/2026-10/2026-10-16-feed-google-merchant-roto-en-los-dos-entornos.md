---
date: 2026-10-16
session: "Diagnostico: el feed de Google Merchant esta roto en QA y en prod"
participants: [angelo, miguel]
status: live
---

# El feed de Google Merchant esta roto en los dos entornos (16/10)

Angelo: *"lo arreglas?"* sobre el fallo de `products` en QA que aparecio al verificar el cierre
del firewall. **Diagnosticado hasta el final; no se puede arreglar desde aqui** — el cambio va en
GCP, no en nuestra infra. Abajo esta exactamente que tocar.

## Sintoma
`products` loguea cada ~5 minutos, en **QA y en PROD**:
```
syncProductFeed error for feed N: Request failed with status code 400 -
  "Error 0: MessagingError: ENOTFOUND: getaddrinfo ENOTFOUND <namespace>.servicebus.windows.net"
```
- **QA**: `qa-product-processing2.servicebus.windows.net`, feed 1. 72 fallos en 6 h.
- **PROD**: `production-product-processing2.servicebus.windows.net`, feeds **1 y 2**.

Se reprograma solo cada 5 minutos (6 reprogramaciones en 30 min en QA), asi que **reintenta
indefinidamente** sin avanzar.

## Lo que NO es
- **No es el cierre del firewall**: en QA ya pasaba a las 07:32Z, seis horas antes.
- **No es el Service Bus de `products`**: funciona. En el log se ve
  `ProductBusConsumerService :: Received message with action: process-google-merchant-feed-scheduler`
  justo antes del error — recibe de la cola sin problema.
- **No es la config de k8s ni del `.env`**: el `AZURE_SERVICE_BUS_PRODUCT_CONNECTION_STRING` de QA
  apunta correctamente a `vio-qa-product-processing-sc` y la cola
  `qa-product-processing2.fifo` **existe** en ese namespace. Ningun `.env` de ningun servicio tiene
  el namespace malo como host.

## Lo que es
El `400` lo devuelve **otra cosa**, no un micro nuestro. `syncProductFeed`
(`product.service.js`, ~L4441) llama a una **Cloud Function de Google**:
`FUNCTION_CLOUD_GOOGLE_MERCHANT_FEED`.

| Entorno | Funcion | Busca el namespace | Existe? |
|---|---|---|---|
| QA | `https://europe-north1-reachu-functions.cloudfunctions.net/GoogleMerchantFeed-Test` | `qa-product-processing2` | **NO** |
| PROD | `https://europe-north1-reachu-functions.cloudfunctions.net/GoogleMerchantFeed-Prod` | `production-product-processing2` | **NO** |

Los namespaces que existen hoy son los de **Suecia**: `vio-qa-product-processing-sc`,
`vio-qa-order-processing-sc`, `vio-product-processing-sc`, `vio-order-processing-sc`.

**Las dos Cloud Functions se quedaron con las cadenas de conexion de Noruega cuando se hizo la
mudanza.** Es el ultimo resto de Noruega que seguia vivo, y esta fuera de Azure, por eso no
aparecio en el desmantelamiento.

## Por que no lo arreglo yo
La configuracion vive en **GCP, proyecto `reachu-functions`** (region `europe-north1`). En esta
maquina **no hay `gcloud` ni credenciales de GCP**, y el unico service account que tenemos en los
`.env` (`GCP_CLIENT_EMAIL`) es de **`tipio-staging-development`**, otro proyecto, y es para Pub/Sub.

## Que hay que cambiar (para quien tenga acceso)
En cada una de las dos funciones, la variable de entorno con la cadena del Service Bus:
- `GoogleMerchantFeed-Test` -> `Endpoint=sb://vio-qa-product-processing-sc.servicebus.windows.net/;...`
- `GoogleMerchantFeed-Prod` -> `Endpoint=sb://vio-product-processing-sc.servicebus.windows.net/;...`

Las claves (`SharedAccessKey`) se sacan de los namespaces nuevos con
`az servicebus namespace authorization-rule keys list`. Los nombres de cola **no cambian**
(`qa-product-processing2.fifo` y `production-product-processing2.fifo` existen en los namespaces
nuevos con el mismo nombre; el `2` del nombre despista pero es correcto).

Despues: mirar que desaparezca el error en `products` de los dos entornos y que el feed avance.

## Impacto mientras tanto
El feed de Google Merchant **no se sincroniza** en ninguno de los dos entornos: 1 feed en QA y
**2 en produccion**. No afecta al resto del producto (es el consumidor del scheduler el que se
corta), pero reintenta cada 5 minutos para siempre.
