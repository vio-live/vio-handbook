---
title: "ePayment API checklist — Vio's answers (to copy into the editable PDF)"
last-updated: 2026-10-06
owner: angelo
status: complete — references from 2026-10-06, copied into the PDF the same day
---

# ePayment API checklist — Vio's answers

Partner name: **Vio (Tipio AS)** · MSN (test): **545865** (NewCo AS, the test sales unit Vipps opened for Vio as partner)

## Endpoints — reference and date

| Endpoint | Reference | Date |
|---|---|---|
| Create payment | `VIO-75eb28a5-d012-425d-9a72-f675b4e8e3cb` (P1, order 4447) | 2026-10-06 |
| Create payment with Express | `VIO-b41ffb12-7cf5-49bc-a9b3-a6ecb8311f48` (P4, `shipping.dynamicOptions`, created only — Express cannot be force-approved in test) | 2026-10-06 |
| Create payment with Profile sharing | P1 (`profile.scope: name address email phoneNumber` goes on every payment) | 2026-10-06 |
| Create payment with Minimum user age | not used | — |
| Get payment | P1 (status poll on return, the order page, the sweep) | 2026-10-06 |
| Get payment event log | P1 (`vippsEvents` on the order page: CREATED, AUTHORIZED, CAPTURED ×2, REFUNDED) | 2026-10-06 |
| Cancel payment | `VIO-7fe79ec2-69fa-4e58-97ab-7b5e89617659` (P2, order 4448, released from the order page) | 2026-10-06 |
| Full capture | `VIO-54973365-24f2-4c9e-a0e7-08755373c9b5` (P3, order 4449, 4999.00 in one capture) | 2026-10-06 |
| Partial capture | P1 (1000.00, then the remaining 3999.00) | 2026-10-06 |
| Full refund | P3 (4999.00 in one refund, from the order page with no amount) | 2026-10-06 |
| Partial refund | P1 (500.00 of 4999.00) | 2026-10-06 |

All four payments were made through Vio's own integration (GraphQL `CreatePaymentVipps` → shopcart) with the seller
(Bohus) in **partner mode**: Vio's keys for the test unit NewCo AS (MSN 545865) plus the seller's `Merchant-Serial-Number`,
approved with the Vipps test user (`4795111218`) through the test-only force-approve endpoint; the orders were created by
our webhook handler (platform registration on that unit, signature verified). P1's receipt is the Order Details example
(product name, 4999.00 incl. 25% VAT, receipt number = order id). An earlier set on the Tipio test unit 358493 (orders
4430–4433, same day) is superseded by this one.

A fifth payment, R5 `VIO-d24b7c66-85f0-4a78-83e5-97483bd93dc1` (order 4433), is the receipt example at Vipps
(product name, 4999.00 incl. 25% VAT, receipt number = order id). All five payments were made through Vio's own integration (GraphQL `CreatePaymentVipps` → shopcart)
on the test sales unit MSN 358493 and approved with the Vipps test user (`4795111218`) through the
test-only force-approve endpoint; the orders were created by our webhook handler.

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
  quantity, totals with tax, `taxPercentage` — one tax field, Vipps refuses both —, `productUrl`), shipping line,
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
