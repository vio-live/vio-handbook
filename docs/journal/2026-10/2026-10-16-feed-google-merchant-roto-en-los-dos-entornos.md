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

## ARREGLADO (16/10 ~14:44 UTC)

Angelo corrio el script en su maquina. Las dos Cloud Functions actualizadas y **comprobadas por el
propio script**:
- `googlemerchantfeed-test` (revision 00015) -> `vio-qa-product-processing-sc`
- `googlemerchantfeed-prod` (revision 00013) -> `vio-product-processing-sc`

### Dos intentos: por que fallo el primero
El primer `aplicar` dio:
`ERROR: (gcloud.functions.deploy) Invalid value for [--source]: Provided source directory does not
have file [package.json]`.
**`gcloud functions deploy` quiere resubir el CODIGO**, y en la maquina de Angelo no esta el
fuente. No llego a tocar nada, asi que las funciones quedaron intactas.

**La forma correcta en gen2:** una funcion gen2 **es** un servicio de Cloud Run por debajo, asi que
se cambia la variable con `gcloud run services update <servicio> --update-env-vars`, que **no toca
el codigo**. El nombre del servicio se saca de `serviceConfig.service`. El script corregido lo
resuelve solo y verifica el resultado al final.

### Verificacion
**QA — concluyente**, se ve el antes y el despues en el mismo log:
```
14:38:28 feedId:1 -> 14:38:37 ERROR ENOTFOUND -> reprograma
14:43:38 feedId:1 -> 14:43:45 ERROR ENOTFOUND -> reprograma
14:48:46 feedId:1 -> 14:48:57 reprograma        <- SIN error
```
El cambio fue ~14:44. Cero errores de `servicebus` desde entonces.

**PROD — el feed esta procesando de verdad.** En **10 minutos** de log retenido (19.820 lineas):
**0** errores de `servicebus`, **0** de `syncProductFeed`. Y lo positivo: **442 de las ultimas 500
lineas** son `imagesConsolidate`/`getBuffer` descargando imagenes de `cdn.kondomeriet.no`,
`review-images.judgeme.com` y `cdn.shopify.com`. Antes el ciclo moria a los 7 segundos; ahora hace
el trabajo real, por eso el ciclo dura mas y no se ve un "Scheduled next feed" cada 5 minutos.
Colas sin mensajes en dead-letter en ninguno de los dos entornos.

### Gotcha para la proxima
**El pod de `products` genera tantisimo log que `--tail=60000` solo cubre 2 minutos.** Buscar con
`--since=20m` o un tail grande **no sirve** y da un falso "no hay nada". Para pillar un evento
periodico ahi: `kubectl logs -f ... | grep -m<N>`, que bloquea hasta que ocurre. Y **"0 errores" no
vale como prueba si no se comprueba que la ventana del log cubre el periodo** que se quiere medir.

### Queda abierto, ajeno a esto
Las dos funciones corren **Node.js 20**, que Google **decomisiona el 30/10/2026**: a partir de esa
fecha no se podran redesplegar. Hay que subirlas de version antes.
