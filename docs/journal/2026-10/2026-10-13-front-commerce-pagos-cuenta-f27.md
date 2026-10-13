---
date: 2026-10-13
session: "webapp: pagos a nivel cuenta (F2.7) detrás de ACCOUNT_PAYMENTS"
participants: [angelo, claude]
status: live
---

# webapp: pagos a nivel cuenta (F2.7)

## Goal

F2.7 del [plan](../../handoff/campanas-en-commerce-plan-de-ejecucion.md): la brand cobra, así
que qué métodos ofrece el checkout pasa a ser de la **cuenta**. El contrato de api es el de F2.3
(journal [`2026-10-13-api-brand-publisher-f23`](2026-10-13-api-brand-publisher-f23.md)), con el
opt-in explícito de la cuenta de Vio de [ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md).

## Done

Commit local **`7468ebf`** en `feature/brand-publisher` del webapp, sin push. Todo va detrás
del flag nuevo **`ACCOUNT_PAYMENTS`** (`next.config.js → env`, apagado). Con el flag apagado,
todo sigue como hoy: api viejo sigue leyendo el channel.

- **`src/lib/account-payments.js`:**
  - mapea `{ switches, useVioAccount, ownCredential, effective }`;
  - el PUT es parcial y solo manda claves conocidas y booleanas;
  - define el estado de cada encendido (ofrecido / encendido sin quien lo cobre / apagado), quién
    cobra cada método (propia / cuenta de Vio / nadie) y la lista heredada del channel, con el
    aviso de markets de Kustom y Adyen (solo NO).
  - La forma exacta salió de `account-payments.ts` de la rama de api (`e2c8892`), porque el
    brief no la detalla.
- **Settings › Payments:**
  - card "Offered at checkout" con los 11 encendidos de la cuenta y lo que se ofrece;
  - badge por quién cobra;
  - opt-in "Use Vio's account" para los métodos con fallback sin credencial propia, con
    confirmación: "the money settles with Vio first";
  - el copy "por channel" (cabecera y "How this works") pasa a "de la cuenta".
- **Detalle del channel:**
  - sin switches de pago;
  - lista de solo lectura "Inherited from your account" → "Manage in Settings › Payments";
  - el aviso de markets de Kustom y Adyen. Un método ofrecido en la cuenta pero fuera de los
    markets del channel dice "Offered on your account, not on this channel".
- **"No payment method"** (banner del detalle, banner de la lista, badge de la card y tab
  "Needs attention") pasa a ser una condición de la cuenta.
- **El publisher** no cambia: su channel ya decía que los pagos son de la brand (P1).
- **Tests:** 50 suites y 479 tests. Solo siguen rojos los 2 conocidos de develop.
  - Libs nuevas: `test/payments/account-payments-lib.test.js`.
  - Vistas con el flag encendido y apagado: `test/payments/account-payments-views.test.jsx`.
  - Lint sin problemas nuevos. Build OK.
- **Navegador:** harness con `/paymentmethod/account` simulado con estado, que recalcula
  `effective` con las reglas de api, y `ACCOUNT_PAYMENTS=true`.
  - Cuenta sin nada ofrecido: banner en la lista y en el detalle, y la lista heredada con
    "not offered".
  - Al encender Stripe sale `PUT {switches:{stripePaymentIntent:true}}`. Al hacer opt-in de
    Klarna sale confirmación y después `PUT {useVioAccount:{klarna:true}}`.
  - El channel pasa a heredar Stripe y Klarna ofrecidos.
  - 0 errores de consola.

## Blockers / open questions

- **base-api F2.6:** el proxy `GET`/`PUT /api/paymentmethod/account` con el usuario de la sesión
  todavía no existe en ninguna rama. El flag no se puede encender antes.
- **El publisher** no ve qué métodos ofrece su channel, porque son de la brand y el endpoint es
  de la sesión. Si hace falta, sería `GET /channel/available-payment-methods/:id` expuesto por
  base-api.
- **Del lado de api, fuera de alcance:** `payment-readiness` (el verify) y
  `getChannelUserByUserId` siguen leyendo los encendidos del channel. La lista de Channels
  todavía recibe esos switches viejos; con el flag encendido el front ya no los usa.
