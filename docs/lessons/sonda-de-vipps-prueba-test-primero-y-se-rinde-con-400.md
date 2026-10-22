---
title: La sonda de credenciales de Vipps prueba test primero y se rinde con un 400
last-updated: 2026-10-22
owner: Miguel
---

## Sintoma

`POST /paymentmethod/verify` sobre una fila de Vipps en modo `partner` (produccion, claves
`VIPPS_PARTNER_*` buenas, unidad de venta asignada y comprobada) responde:

```json
{ "status": "unknown", "detail": "400" }
```

Parece que las claves estan mal. No lo estan.

## Causa real

`vipps-verify.ts` recorre `VIPPS_HOSTS` **en orden y con test primero**:

```ts
export const VIPPS_HOSTS = [
  { environment: 'test', host: 'https://apitest.vipps.no' },
  { environment: 'live', host: 'https://api.vipps.no' },
];
```

El bucle solo continua al siguiente host cuando el error es **401 o 403**; cualquier otro codigo
corta y devuelve `unknown` con ese codigo. Las claves de **partner no existen en el entorno de
test** de Vipps, y `apitest.vipps.no` contesta **400** al grant, no 401. Resultado: la sonda nunca
llega a probar produccion y una credencial buena se ve como `unknown`.

## Como se comprueba de verdad

Contra produccion, sin crear ningun pago ni mover dinero:

```bash
TOK=$(curl -s -X POST https://api.vipps.no/accesstoken/get \
  -H "client_id: $VIPPS_PARTNER_CLIENT_ID" \
  -H "client_secret: $VIPPS_PARTNER_CLIENT_SECRET" \
  -H "Ocp-Apim-Subscription-Key: $VIPPS_PARTNER_SUBSCRIPTION_KEY" \
  -H "Merchant-Serial-Number: <msn>" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s https://api.vipps.no/management/v1/sales-units/<msn> \
  -H "Authorization: Bearer $TOK" -H "Ocp-Apim-Subscription-Key: $VIPPS_PARTNER_SUBSCRIPTION_KEY"
```

Un 200 con el nombre y el `businessIdentifier` de la unidad prueba las tres credenciales juntas y
que la unidad esta bajo el partnership. El `assign` del micro hace exactamente esa llamada y por eso
su respuesta trae `verified: true` — **esa** es la senal que vale, no la de `/verify`.

## Arreglo (pendiente, no urgente)

Dos opciones, las dos de una linea:

- cuando `options.mode === 'partner'`, probar solo `live` (las claves de partner son de produccion
  por definicion), o
- continuar el bucle tambien con 400, que es lo que contesta un host al que esas claves no
  pertenecen.

No es bloqueante para cobrar: solo hace que la pagina del equipo Vio ensene "unknown" y asuste.
