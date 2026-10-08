---
title: "Vipps MobilePay ePayment — Vio's integration (solution description for the checklist)"
last-updated: 2026-10-08
owner: angelo
audience: Vipps MobilePay developer review (English)
---

# Vio Commerce × Vipps MobilePay ePayment — solution description

**Partner:** NewCo AS (Vio Commerce), Norway. **Product:** shoppable media — products sold inside articles,
video pages, Vev pages and apps; the merchant's catalogue and orders stay in the merchant's shop
(Shopify, WooCommerce) or in Vio. **Vio acts as a platform**: one integration, many merchants
(sales units). Test sales unit used for this checklist: the one named in the checklist (MSN 545865, NewCo AS, unless Angelo decides otherwise — see `checklist-answers.md`).

## Architecture

- `shopcart` (NestJS) owns the Vipps integration: payment creation, status, webhooks, capture /
  refund / cancel, receipts. `base-api` is the public edge (relays the webhook with its raw body
  and signature headers; exposes the dashboard routes). `graphql` exposes `InitPaymentVipps` and
  `GetVippsStatus` to the web SDK. `orders` creates the merchant order and tells `shopcart` when
  it ships or is cancelled.
- **Credentials per merchant**: *own* (the merchant's keys), *partner* (Vio's partner keys +
  the merchant's MSN, assigned when Vipps confirms the sales unit), or Vio's own sales unit.
- **Payment creation** (`POST /epayment/v1/payments`): `WALLET`, `WEB_REDIRECT`,
  `customerInteraction: CUSTOMER_NOT_PRESENT`, `paymentDescription` with the shop and order,
  `reference` `VIO-<checkout uuid>` (unique per sales unit, `^[a-zA-Z0-9-]{8,64}$`), `metadata`
  (checkout, cart, seller), `profile.scope` `name address email phoneNumber`, and for Express
  `shipping.fixedOptions` (the merchant's rates, brand/type mapped) or
  `shipping.dynamicOptions` (callback URL + token) with `allowedCountries`. In Express the amount
  is the goods only; Vipps adds the delivery option the shopper picks.
- **Completion — one path**: webhook, shopper return, status poll and a 10-minute sweep all call
  the same handler under a database lock; it reads the payment (`GET /payments/{reference}`),
  acts only on `AUTHORIZED`, creates the order once (idempotent), writes the shopper's details
  from `userDetails` / `shippingDetails`, sends the receipt (`POST /order-management/v2/ecom/receipts/{reference}`),
  and captures at once if the merchant chose capture-at-payment.
- **Webhooks**: all eight `epayments.payment.*.v1` events, signature verified (HMAC-SHA256 over
  `POST\n{path}\n{date};{host};{content-sha256}`, current and previous secret), deduplicated by
  event id; `authorized` completes, `aborted/expired/terminated/cancelled` close the checkout,
  `captured/refunded/cancelled` are recorded on the payment's history.
- **Polling**: the SDK polls `GetVippsStatus` on return; the sweep reconciles every open
  payment every 10 minutes (lost webhooks, closed tabs).
- **Capture**: at payment, at shipment (tracking number or order completion from the merchant's
  shop or the dashboard) or by hand from the order page; always ≤ what is reserved.
- **Refund / cancel**: order cancelled → release the reservation or refund the captured amount;
  partial refund from the order page; a paid reservation whose order could not be created after
  24 h is released automatically and the failure logged.
- **Errors**: Vipps' error body is surfaced as `VippsApiError` (status, code, detail, trace id);
  the shopper sees a plain message ("Betalingen ble avbrutt eller feilet. Vennligst prøv igjen."),
  the merchant sees the reason in the dashboard; every failing call is logged on one line with
  endpoint, Vipps' error body (type, title, detail, traceId), the request headers (bearer token and
  subscription key masked) and the request body.
- **Headers** on every request: `Vipps-System-Name: Vio`, `Vipps-System-Version: 4.0.1` (the shopcart
  release), `Vipps-System-Plugin-Name: vio-commerce-shopcart`, `Vipps-System-Plugin-Version: 4.0.1`,
  plus an `Idempotency-Key` on create / capture / refund / cancel.
- **Branding**: Vipps MobilePay's own button component (`<vipps-mobilepay-button>`, from
  `cdn.vippsmobilepay.com`) on the product, the cart and the checkout.
- **Support**: the order page shows the payment as Vipps sees it (reserved / captured /
  refunded / released, reference, events) with the actions; support never needs the portal.

## Demo

- Test page (Aller Media's Mote & Livsstil, Vio web SDK):
  https://mote-livsstil-hub-vio.replit.app/skjonnhet/guider/vio-test-shoppable-favoritter — open a
  product and tap the Vipps "buy now" button (Express), or pay with Vipps from the cart, with the
  Vipps test user.
