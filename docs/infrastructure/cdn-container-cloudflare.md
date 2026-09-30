---
title: container.vio.live servido por Cloudflare (reemplazo de Azure Front Door)
last-updated: 2026-09-30
owner: miguel
---

# Qué cambió

Hasta el 2026-09-30, `container.vio.live` y `container-staging.vio.live` se servían por **Azure Front
Door** (perfil `prod-cdn`, **36,9 USD/mes**). Ahora van por **Cloudflare**, que ya pagábamos y ya servía
el DNS de la zona. Ahorro: **36,9 USD/mes**, sin cambiar una sola URL.

## Cómo funciona ahora

```
cliente -> Cloudflare (proxy naranja) -> containerproductionsc.blob.core.windows.net
```

El problema a resolver era el **header Host**: Cloudflare manda `Host: container.vio.live` al origen,
y Azure Blob no reconoce ese nombre. Hay dos formas de arreglarlo:

1. **Host Header Override** en Origin Rules de Cloudflare — *no sirve en plan Free*:
   `not entitled to use the HostHeader override`.
2. **Registrar el dominio como custom domain en la storage account** — es la que se usó, y es gratis.

Registro hecho con validación indirecta (`--use-subdomain true`), que no requiere cortar nada:

```bash
# los CNAME asverify.* quedan creados en Cloudflare, en gris (sin proxy)
az storage account update -g rg-vio-commerce-prod-sc -n containerproductionsc \
  --custom-domain container.vio.live --use-subdomain true
az storage account update -g qa -n containerqa2 \
  --custom-domain container-staging.vio.live --use-subdomain true
```

El modo SSL de la zona ya estaba en **Full**, así que Cloudflare habla HTTPS con el origen sin
validar la cadena. No hubo que tocar nada a nivel de zona.

## DNS

| Nombre | Destino | Proxy |
|---|---|---|
| `container.vio.live` | `containerproductionsc.blob.core.windows.net` | sí (naranja) |
| `container-staging.vio.live` | `containerqa2.blob.core.windows.net` | sí (naranja) |
| `asverify.container.vio.live` | `asverify.containerproductionsc.blob.core.windows.net` | no |
| `asverify.container-staging.vio.live` | `asverify.containerqa2.blob.core.windows.net` | no |

Los `asverify.*` se dejan puestos: si alguna vez hay que volver a registrar el custom domain, ya están.

## Reglas que hubo que replicar

Front Door no era un proxy pelado. Tenía lógica, y esto es lo que se trasladó:

**1. `imageResize` — redirect de imágenes con `?size=`**
Si la URI contiene `product-images`, `default-placeholder`, `products`, `collection` o `user-avatar`
**y** el query string contiene `size`, Front Door devolvía un **308** hacia el API, que es quien
redimensiona. Replicado como Redirect Rule de Cloudflare, con el mismo código 308:

- prod -> `https://api-ecom.vio.live` + la URI original
- staging -> `https://api-ecom-staging.vio.live` + la URI original

**2. `klarna` — cabeceras del iframe de pago (sólo staging)**
Sobre `klarna.html`: `Permissions-Policy: payment=*`, `X-Frame-Options: ALLOWALL`,
`Content-Security-Policy: frame-ancestors *; upgrade-insecure-requests;`,
`Access-Control-Allow-Origin: *`, `Cache-Control: no-store, no-cache, must-revalidate`.
Replicado como Response Header Transform Rule.

## Verificación (2026-09-30)

Se tomó línea base **contra Front Door antes de tocar nada**, y se comparó después forzando la
resolución a las IP de Cloudflare (`curl --resolve`), porque el resolver local seguía cacheado y daba
un falso "ya funciona" que en realidad salía por Front Door — se detecta por la cabecera `x-azure-ref`.

| Prueba | Antes (Front Door) | Después (Cloudflare) |
|---|---|---|
| imagen de producto | 200, **2.001.904** bytes, image/jpeg | 200, **2.001.904** bytes, image/jpeg |
| segunda imagen | 200, **1.722.530** bytes, image/jpeg | 200, **1.722.530** bytes, image/jpeg |
| `?size=200` | 308 -> api-ecom.vio.live | 308 -> api-ecom.vio.live |
| `/db-backups/x` (privado) | 404 | 404 |
| `/env-file-microservices/.env` | — | 404 |
| objeto inexistente | 404 | 404 |
| staging `countries.json` | 200, 87.342 bytes | 200, 87.342 bytes |
| staging `1-0.jpeg` | 200, 161.823 bytes | 200, 161.823 bytes |

Confirmado que sale por Cloudflare: `server: cloudflare` + `cf-ray`. Segunda pasada sobre la misma
imagen: `cf-cache-status: HIT`.

## Lo que quedó distinto, a propósito o no

- **Caché igualado (resuelto el mismo día).** Cloudflare Free cachea por extensión y `.json` no
  entra, así que al principio los JSON salían como `DYNAMIC` mientras Front Door cacheaba `/*`. La
  Cache Rule que lo iguala **no la puede crear el token de DNS** (`request is not authorized`):
  hace falta uno con permiso de Cache Rules, que Angelo generó. Con la regla puesta
  (`cache: true`, query string fuera de la clave, TTL del origen), `countries.json` pasa de `MISS` a
  `HIT`. El redirect de `?size=` sigue disparando antes que la caché, como debe.
- **`container.reachu.io` y `containerqa.reachu.io` mueren cuando se borre el Front Door.** Esa zona
  no está en nuestra cuenta de Cloudflare, así que no se pueden repuntar. Se verificó contra la base
  de producción antes de asumir que sobraban:

  | Consulta | Filas |
  |---|---|
  | `image.url` con `container.reachu.io` | **0** |
  | `image.url` con `container.vio.live` | 49.317 |
  | `image.url` apuntando al blob directo | 21 |
  | `image` total | 313.790 |
  | `user.avatar` con `reachu.io` | **4** |

  Los 4 avatares apuntan a `containerqa.reachu.io/outshifter-uploads-qa/default-placeholder.png`, un
  placeholder **de QA** en datos de producción: usuarios de prueba.

## Vuelta atrás

Mientras el perfil `prod-cdn` exista, revertir es cambiar el CNAME a
`prod-cdn-reachu-huakd5c2a4dmhnaj.z01.azurefd.net` y quitarle el proxy. Por eso **no se borró el
mismo día**: queda vivo 24 h como red de seguridad, y hay un job programado para el 01/10 a las 10:00
que verifica tráfico en cero y lo borra.

## Cuánto costaba, en detalle

Desglose por medidor de la semana 22-28/09, antes de migrar:

| Recurso | Medidor | USD/mes |
|---|---|---|
| `prod-cdn` | **Standard Base Fees** | **36,9** |
| storage | Standard Data Transfer Out | 1,6 |
| storage | Hot LRS Write Operations | 0,7 |

**El 100% del coste del Front Door era cuota fija.** Cero facturado por tráfico: estábamos pagando
la suscripción de un CDN que apenas movía datos. Por eso la migración se lleva la cifra entera y no
una parte.

El egress del blob (1,6 USD/mes) sigue existiendo con Cloudflare, porque alguien tiene que servir el
origen, y con la caché puesta debería bajar en vez de subir.
