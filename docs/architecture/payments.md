# Pagos en Vio Commerce — credenciales, activación y conectores

Cómo se decide **con qué cuenta se cobra** y **qué métodos ofrece cada
superficie**. Documentado al montar la pantalla de Payments del dashboard
(2026-08-28); todo verificado contra `api-ecom-staging`.

## Dos niveles, no confundirlos

| Nivel | Dónde vive | Qué decide | Quién lo edita |
|---|---|---|---|
| **Credencial** | tabla `payment_method` (una fila por proveedor y seller) | con qué cuenta se cobra | Settings → Payments |
| **Activación** | `channel_user_settings` (flags booleanos) | qué métodos ofrece ese canal | detalle del canal → Settings |

Un método solo llega al checkout si **ambos** están resueltos: hay
credencial utilizable (propia o de plataforma) **y** el canal lo tiene
encendido.

## Credenciales por seller (`payment_method`)

`options` es un **STRING JSON**. El campo `name` de dentro es lo que casan
los conectores — **el casing importa**:

| Proveedor | `name` | Campos | ¿Fallback a la cuenta de Vio? |
|---|---|---|---|
| Stripe | `STRIPE` | `publishKey`, `secretKey` | **Sí** |
| Klarna | `Klarna` | `apiKey` | **Sí** |
| Kustom | `Kustom` | `apiKey` (`kco_(test\|live)_api_…`), `autoCapture?`, `termsUrl?` | **No** — sin clave propia no se ofrece |
| Vipps | `VIPPS` | `clientId`, `clientSecret`, `subscriptionKey`, `merchantSerialNumber` | **No** |

- Apple Pay y Google Pay **corren sobre las claves Stripe del seller**
  (`apple-pay.service` / `google-pay.service` leen la fila `STRIPE`).
- Kustom conserva la superficie de Klarna Checkout (KCO v3) en sus
  hosts (`api.kustom.co` / `api.playground.kustom.co`); el entorno va
  codificado en la propia key. Conector:
  `vio-shopcart-microservice/src/modules/checkout/providers/kustomConnector.service.ts`.
- Vipps compara `name.toUpperCase()`; el resto compara exacto.

### API (base-api → api-ms `paymentMethod`)

```
GET    /api/paymentmethod/byuser   → [{ paymentMethod_id, active, options, userId }]
GET    /api/paymentmethod/:id
POST   /api/paymentmethod          { options: string, active: boolean }   (userId del token)
PATCH  /api/paymentmethod/:id      { options: string, active: boolean }
DELETE /api/paymentmethod/:id      (softDelete)
```

⚠️ **Gotchas verificados**:
- La lista vacía responde **404** con cuerpo `[]` (no 200). Normalizar en
  el cliente.
- El id viene como **`paymentMethod_id`**, no `id`.
- `getByUser` filtra `active = 1`: una fila desactivada **desaparece de la
  API y queda inalcanzable**. Por eso el dashboard no ofrece "pausar" —
  configurar, editar o quitar. (Pedido de cambio abierto.)

## Activación por canal (`channel_user_settings`)

Columnas booleanas: `stripePaymentIntent`, `stripePaymentLink`, `klarna`,
`vipps`, `googlePay`, `applePay` (+ `markets`, `purchaseConditions`,
`orderConfirmationEmail`, que no son de pago).

- Se escriben con `POST /api/channel/update/settings/:channelUserId`.
- `api-ms channel.service.getAvailablePaymentMethods(channelUserId)` las
  honra y devuelve la lista que consume el SDK vía graphql
  (`/channel/available-payment-methods/:channelUserId`, endpoint
  **interno** del microservicio; el de base-api sin id usa la API key del
  canal).
- ⚠️ **`kustom` NO existe como columna** (al 2026-08-28). `POST
  update/settings {"kustom":true}` responde **200 y lo ignora en
  silencio**. Hasta que exista, un seller puede guardar su credencial de
  Kustom pero no puede activarlo en ningún canal.

En el dashboard la lista de switches **se deriva de las claves que
devuelve el backend** (`methodsFor` en `src/lib/channels.js`), así que el
switch de Kustom aparecerá solo cuando la columna exista — sin tocar el
front.

## Resolución en el checkout (shopcart)

`checkout.service.getAvailablePaymentMethods` (nivel seller) mapea las
filas de `payment_method` a `{name}` y **añade a mano** Stripe, Stripe
payment link y Klarna si faltan — de ahí el fallback de esos tres. Kustom
y Vipps solo aparecen si el seller tiene su fila.

## Referencias

- Dashboard: `src/lib/payments.js` (contratos + helpers),
  `src/views/settings/sections/payments.jsx`,
  `src/views/settings/payment-icons.jsx`.
- Backend: `vio-api-microservice/src/modules/paymentMethod`,
  `vio-base-api/src/router/paymentMethodRouter.js`,
  `vio-shopcart-microservice/src/modules/checkout/providers/*`.
