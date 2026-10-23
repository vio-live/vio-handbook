---
title: La key que va en el host web es la de la SURFACE, no la del channel
date: 2026-10-23
author: miguel
---

# Síntoma

El host web (Replit de Aller) arranca el SDK con la api key del channel — la que sale al crear el
channel en el dashboard, y la que el checklist del go-live señalaba como «la que va en el Replit».
La página no carga nada de Vio. En el navegador, el bootstrap del SDK:

```
GET https://api.vio.live/v2/mobile/config?platform=web   ->  401 {"message":"Invalid API key"}
```

Parece una key caducada o mal copiada. No lo es.

# Causa real

Hay **dos** claves distintas y sirven a dos servicios distintos:

| Clave | Vive en | La valida | Sirve para |
|---|---|---|---|
| **Surface** | `surface.api_key` | `SurfaceKeyGuard` del micro de campañas | el bootstrap del SDK y las llamadas del CMS |
| **Channel** | `user_channel_api_key` | `graph-ql` | catálogo, carrito y checkout |

`api.vio.live` es **el micro de campañas entero** (`virtual-service-campaigns-prod` manda
`campaigns.vio.live` y `api.vio.live` al mismo servicio). Su guarda busca la clave en
`surface.api_key` y además exige `status = 'active'`; una key de channel ahí no existe y el 401 es
correcto.

Lo que despista: **el SDK recibe una sola `apiKey` en `Vio.init`**, así que es natural suponer que
es la del comercio. No lo es. Con la key de la surface, el bootstrap devuelve la del channel dentro
de la respuesta:

```json
"primarySponsor": { "id": 1327, "commerce": { "apiKey": "…", "channelId": "480",
                                              "paymentMethods": ["vipps"] } }
```

y el SDK la usa solo para hablar con `graph-ql`. O sea: **al host web se le pasa un secreto, no
dos**, y nunca es el del channel.

# Cómo se distingue en 10 segundos

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'https://api.vio.live/v2/mobile/config?platform=web' -H "X-Api-Key: $KEY"
```

`200` → es la key de la surface. `401 Invalid API key` → es otra cosa (probablemente la del
channel). `403 Surface is inactive` → es la correcta, pero la surface está apagada.

# Por qué importa

El error no aparece en ningún log nuestro como un fallo: el micro responde 401 y ya. Desde fuera se
ve como «la página no muestra productos», que es exactamente el mismo síntoma que un catálogo vacío
(`channel_user_products` a 0) o que un channel sin Vipps. Tres causas distintas, un solo síntoma: por
eso conviene empezar por el `curl` de arriba antes de tocar la base.

# Relacionado

- `el-catalogo-del-sdk-sale-de-channel-user-products.md` — la otra causa del mismo síntoma.
- `../handoff/2026-10-15-replit-y-demo-web-a-commerce.md` — prompt de producción.
