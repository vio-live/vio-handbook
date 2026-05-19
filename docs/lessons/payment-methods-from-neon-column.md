---
title: "Lesson: Sponsor payment methods come from sponsors.payment_methods (Neon column, no validation)"
last-updated: 2026-05-19
owner: angelo
status: live
---

# Payment methods come from `sponsors.payment_methods` (Neon, not validated)

## TL;DR

The buttons rendered in `SponsorCheckoutSection.methodActionButtons` (Apple Pay / Klarna / Card / Vipps / Google Pay) come from a Neon DB column that is **manually populated**, **synced from commerce**, and **not validated against anything**. You can put `"banana"` in there and the SDK will dutifully try to render a button for it.

## The full chain

```
Neon DB: sponsors.payment_methods  (json("payment_methods") $type<string[]>)
  ↓ storage.getSponsor()
backend: buildSponsorBlock() in routes.ts
  → commerce.paymentMethods = Array.isArray(sp.paymentMethods) ? sp.paymentMethods : []
  ↓ GET /v2/mobile/config response
iOS bootstrap: SdkBootstrapResponse.SponsorBlock.commerce.paymentMethods
  ↓ VioSponsor(bootstrap:) mapping
VioSponsor.CommerceBlock.paymentMethods: [String]
  ↓ SponsorCheckoutSection.availableMethods (normalises lowercase, strips _ / spaces,
                                              collapses stripelink → stripe)
  → ForEach → one button per method
```

## Zero validation

The `POST /api/campaign/payments/apikey/:apiKey` endpoint (`routes.ts:1044`) accepts any string array. Only check: `Array.isArray(paymentMethods)`. **Not checked** against:

- What the iOS `PaymentMethod` enum (`stripe / klarna / vipps`) plus `applepay` (special-cased in `handleSponsorCheckoutTap`) can actually route.
- What the sponsor's Commerce channel actually supports (via `PaymentQueries.GetAvailablePaymentMethods` on commerce GraphQL).

So you can ship a button that the SDK can't handle (`googlepay` falls through `handleSponsorCheckoutTap`'s `default: break` → tap is a no-op).

## Update endpoint = commerce's sync target

`POST /api/campaign/payments/apikey/:apiKey` (**no auth middleware** — it's the sync endpoint commerce calls).

- `apiKey` here = `sponsors.commerce_api_key`, NOT the client-app apiKey.
- Body: `{ "paymentMethods": [...] }` — full array replaces the column.
- Updates **all sponsors** whose `commerce_api_key` matches that apiKey (so if multiple sponsors share a commerce key, they all get the same methods).

## Local dev gotcha

Commerce calls this endpoint against `api-dev.vio.live`, **NOT** against local tunnels. If you activate a payment method in commerce's dashboard, **your local Neon (forked branch) doesn't get the update.** Replicate manually with `scripts/sync-payment-methods-local.ts` (added in `2d333ca`):

```bash
cd vio-backend/socket-server
npx tsx scripts/sync-payment-methods-local.ts
# Replicates a "clean" [apple_pay, klarna, stripe_link, vipps] array
# to every commerce sponsor's payment_methods via the local endpoint
```

## Verifying current state

```bash
npx tsx scripts/check-sponsor-payment-methods.ts
# Dumps every sponsor's payment_methods + flags methods the SDK can't route
# (e.g. ⚠️  unhandled-by-SDK: google_pay)
```

## Known junk to clean up (as of 2026-05-19)

All 4 commerce sponsors (Elkjøp #3, Torshov #4, XXL #7, Maxbo #8) had `google_pay` in their array — a button the SDK can't route. Cleaned in local Neon (`sync-payment-methods-local.ts` writes the clean array). The api-dev state and presumably production still have `google_pay` — needs the same sync. Either:

1. Remove `google_pay` from every commerce sponsor's `payment_methods` in the shared dev DB, or
2. Implement Google Pay in the iOS SDK (`PaymentMethod.googlePay` + `handleSponsorCheckoutTap` case + a launcher).

## Where the validation should live (future)

Backend should validate `paymentMethods` against (a) a known-good enum that matches the SDK's capabilities, plus (b) optionally the sponsor's Commerce channel's `GetAvailablePaymentMethods` response. Not done — flagged here so it doesn't get forgotten.

## Related diagnostic scripts (socket-server)

- `scripts/check-sponsor-payment-methods.ts` — dumps + flags unhandled methods.
- `scripts/check-sponsor-commerce-keys.ts` — commerce key suffix per sponsor + shared-key groups.
- `scripts/sync-payment-methods-local.ts` — POSTs clean array to local for all commerce sponsors.
- `scripts/check-sponsor-logos.ts` — bonus, for the SVG-logo lesson.

All committed in `2d333ca` + `a66672f` on socket-server `develop`.
