# 2026-08-29 — Hardening de pagos: reconciliación, verify y cifrado

Salió de la conversación de consideraciones post-Qliro. Angelo pidió los tres
accionables implementados ya ("implementalos ya!"). Cinco ramas pusheadas,
tarjeta de Alan: https://trello.com/c/HbUeQGCL

## 1. Reconciliación de pushes perdidos (shopcart `dd51d2d`)

La orden Commerce de los métodos embebidos nace de un push del PSP; un push
perdido (deploy en vuelo, host caído) deja un cliente que pagó sin orden.
`POST /checkout/payments/reconcile` barre checkouts Kustom/Qliro con
`origin_payment_id` que nunca llegaron a SUCCESS (ventana
minMinutes..lookbackDays), pregunta al PSP la verdad y corre los MISMOS
ok-handlers idempotentes del push. Detalle: el handler de Kustom asume
completitud (el push KCO solo dispara al completar) → el barrido chequea
`checkout_complete` antes; el de Qliro chequea adentro. Cablear scheduler
externo ~10 min (sin @nestjs/schedule en el repo; mismo rig que
`/cart/expired/all-inactive`).

## 2. Verify de credenciales (api-micro `8ab70ba`, base-api `7c87967`, webapp `53d4394`)

`POST /paymentmethod/verify`: sondea al PSP SIN crear nada — pide una orden
inexistente y clasifica el error (401/403=invalid, 404=valid, resto=unknown).
Implementado para Qliro (firma con el secret contra el host del flag sandbox
— valida también el flag), Kustom (Basic contra el host del prefijo de la
key) y Stripe (GET /v1/account). El front bloquea SOLO ante rechazo
definitivo; unknown guarda con aviso (misma regla que el verify de commerce
keys en Vio). Klarna/Vipps sin sonda aún (documentado).

## 3. Cifrado at-rest + write-only (api-micro + decrypt en 3 repos)

- Helper `payment-secrets` (AES-256-GCM, `PAYMENT_SECRETS_KEY` 32B base64,
  formato `enc:v1:iv:tag:ct`) **passthrough en ambas direcciones** sin key y
  con valores legacy en plano → el orden de rollout (código → key →
  reencrypt) no puede romper pagos. Copias sincronizadas en shopcart,
  api-micro y payment-processors (candidato a kernel).
- Campos secretos por provider: STRIPE.secretKey, Klarna.apiKey,
  Kustom.apiKey, Qliro.apiSecret, VIPPS.clientSecret+subscriptionKey.
- **Write-only**: getById/byuser devuelven `••••last4` — los secretos ya no
  viajan al browser; un valor enmascarado en update significa "sin cambios"
  (merge server-side del valor guardado). El front saltea el pattern-check
  para valores enmascarados.
- `POST /paymentmethod/reencrypt-all` (INTERNO, sin proxy base-api) migra
  las filas existentes una vez provisionada la key. Idempotente.
- decrypt aplicado en TODOS los lectores mapeados: connectors
  Kustom/Qliro/Klarna (shopcart), getStripe (shopcart), vipps.service
  (shopcart), getStripeApiKeys (api-micro), authFor (payment-processors).

## Ramas

| repo | rama | commit | base |
|---|---|---|---|
| shopcart | `feature/payment-hardening` | `dd51d2d` | sobre feature/qliro-payment |
| payment-processors | `feature/payment-secrets-hardening` | `0cbefe3` | develop |
| api-micro | `feature/payment-credentials-hardening` | `8ab70ba` | sobre feature/qliro-payment |
| base-api | `feature/payment-credentials-hardening` | `7c87967` | sobre feature/qliro-payment |
| webapp | `feature/payment-credentials-hardening` | `53d4394` | sobre feature/qliro-payment |

Nota de proceso: un amend en la rama del webapp terminó en push -f sobre la
propia rama recién creada (sin trabajo ajeno encima) — va contra la regla
locked igual; próxima vez, fixup commit.
