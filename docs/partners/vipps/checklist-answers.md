---
title: "ePayment API checklist — Vio's answers (to copy into the editable PDF)"
last-updated: 2026-10-06
owner: angelo
status: draft — references to be refreshed from a test payment ≤ 1 month old before sending
---

# ePayment API checklist — Vio's answers

Partner name: **Vio (Tipio AS)** · MSN (test): **358493**

## Endpoints — reference and date

| Endpoint | Reference | Date |
|---|---|---|
| Create payment | `VIO-86b436e3-6b85-4425-9b93-eb928ef176eb` | 2026-09-29 |
| Create payment with Express | `VIO-86b436e3-6b85-4425-9b93-eb928ef176eb` (Express, `shipping.fixedOptions`) | 2026-09-29 |
| Create payment with Profile sharing | same (`profile.scope: name address email phoneNumber`) | 2026-09-29 |
| Create payment with Minimum user age | not used | — |
| Get payment | `VIO-86b436e3-…` (status poll on return) | 2026-09-29 |
| Get payment event log | _pending: needs an approved test payment_ | |
| Cancel payment | _pending_ | |
| Full capture | _pending_ | |
| Partial capture | _pending_ | |
| Full refund | _pending_ | |
| Partial refund | _pending_ | |

## Quality assurance

- **Webhooks and polling**: all eight `epayments.payment.*.v1` events are registered per sales
  unit (and for all sales units under the partner in production), verified by signature and
  deduplicated; the shopper's return polls `GET /payments/{reference}` until a final state; a
  sweep re-reads every open payment every 10 minutes. The same idempotent handler completes the
  order whichever arrives first.
- **States/events**: CREATED (pending), AUTHORIZED (order), ABORTED / EXPIRED / TERMINATED (checkout
  closed), CANCELLED / CAPTURED / REFUNDED (recorded on the payment history, shown on the order).
- **Errors**: shopper — "Betalingen ble avbrutt eller feilet. Vennligst prøv igjen." on return;
  merchant — the Vipps reason on the order page (e.g. "Vipps: 0 left to capture on this payment");
  developer — `VippsApiError` with status, code, detail, trace id.
- **Logging**: example — `[VippsConnector.call] POST /epayment/v1/payments → 400 {"type":"…","title":"…","detail":"…","traceId":"…"} headers {Vipps-System-Name: Vio, …, Idempotency-Key: …} body {…}` (secrets masked).
- **HTTP headers**: `Vipps-System-Name: Vio` · `Vipps-System-Version: <shopcart version>` ·
  `Vipps-System-Plugin-Name: vio-commerce-shopcart` · `Vipps-System-Plugin-Version: <version>`.
- **Order details**: receipt via Order Management after the order: `orderLines` (name, id,
  quantity, totals with tax, `taxRate` in basis points, `productUrl`), shipping line,
  `bottomLine` (currency, `receiptNumber` = order id).
- **Customer interaction**: `customerInteraction: CUSTOMER_NOT_PRESENT` on every payment (online).
- **Operational updates**: _Angelo subscribes at status.vippsmobilepay.com_.

## Avoiding pitfalls

- **Reference**: `VIO-<checkout uuid>` (or the merchant's prefix + a short id), unique per sales
  unit, `^[a-zA-Z0-9-]{8,64}$`, searchable in both systems; a retry gets `-2`, `-3`.
- **Redirects**: the return URL carries the checkout id as a query parameter; the result is read
  from the API, not from a cookie or a session, so any browser or tab works.
- **Capture before expiry**: at payment or at shipment under Vio's control; on-account merchants
  are reminded on the order page that a reservation expires; nothing is captured above the
  reserved amount.
- **Cancel what will not be captured**: cancelled orders release the reservation (or refund);
  a paid reservation whose order could not be created is released after 24 h by the sweep.
- **Cross-border**: `allowedCountries` follows the merchant's shipping rates; payments in NOK.
- **Design guidelines**: Vipps MobilePay's button component is used on every surface.
- **Customer support**: the order page shows the Vipps money and the actions; the reference is
  shown everywhere; support works in Vio, not in the portal.

## Technical documentation

- How to apply / configure / FAQ: `merchant-guide.md` (to be published as the merchant page).
- Demo: https://vio-vipps-test.vercel.app + video.
