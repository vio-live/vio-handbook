---
title: "Lesson: Apple Pay needs Stripe Connect + merchant.live.vio whitelisted per sponsor"
last-updated: 2026-05-07
owner: angelo
status: live
---

# Apple Pay needs Stripe Connect + `merchant.live.vio` whitelisted per sponsor

## TL;DR

Multi-sponsor Apple Pay routes the charge through the sponsor's own Stripe Connect account so the money lands in the right place. For each sponsor in commerce, you need:

1. A Stripe Connect account linked to the sponsor's Reachu Commerce channel.
2. The Apple Pay merchant identifier `merchant.live.vio` whitelisted on that Stripe account.
3. Products listed in the channel's catalog (otherwise commerce returns nothing for the sponsor's `productIds`).

If any of these are missing, `applePayConfirm` returns a generic `[object Object]` 500 from commerce GraphQL — opaque enough that you'll spend hours debugging the iOS side before realizing the issue is sponsor-side commerce config.

## Why this exists

Q4 L3 (April 2026) introduced multi-sponsor cart: each sponsor in a campaign has its own Reachu cart, its own checkout, its own Apple Pay confirm. The whole point is that money lands on the sponsor's bank account, not pooled in a single platform account.

For Stripe to charge the sponsor's account on the user's behalf via Apple Pay, the sponsor's Stripe Connect setup needs to acknowledge `merchant.live.vio` as a permitted Apple Pay merchant (it's an out-of-band per-account whitelist).

## Symptoms when missing

- Apple Pay sheet appears, user authorizes, then the iOS app hangs or shows a generic "Payment failed" with no actionable detail.
- Backend / commerce log shows `applePayConfirm` returning a 500 with body `[object Object]` (the empty-object stringification is itself the symptom — a real error would have a message).
- TV2 (Elkjøp / XXL sponsors) works because Reachu set those up early. New sponsors (Maxbo / Weber for the May 2026 VG demo) needed the same setup before Apple Pay would complete.

## How to set up a new sponsor

This is **commerce-side / Reachu-side** work, not something we can do from the SDK or backend. Workflow:

1. Reachu creates the sponsor's commerce channel and provisions a Stripe Connect account for it.
2. The Stripe Connect account adds `merchant.live.vio` to its Apple Pay merchant whitelist (Stripe Dashboard → Account → Apple Pay).
3. Products are added to the sponsor's channel.
4. The `commerce_api_key` for that channel is stored in `sponsors.commerce_api_key` in our Neon DB (currently set manually by the Reachu integrator, not yet self-service from our dashboard).
5. Verify end-to-end via the SDK demo before declaring the sponsor "live".

## Verification

Before assuming a new sponsor's Apple Pay works:

```bash
# 1. Sponsor exists in our DB with a commerce_api_key
psql ... -c "select id, name, length(commerce_api_key) > 0 as has_key from sponsors where id = <sid>"

# 2. Sponsor's commerce channel returns products
curl -s -X POST https://graph-ql-dev.vio.live/graphql \
  -H "Authorization: <sponsor's commerce_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { Channel { GetProducts(shipping_country_code: \"NO\", currency: \"NOK\") { id title price { amount_incl_taxes } } } }"}'
```

If both pass and the iOS Apple Pay still fails with `[object Object]`, the missing piece is step 2 (Apple Pay whitelist on the sponsor's Stripe Connect). Ping Reachu.

## Status of known sponsors (as of 2026-05-07)

| Sponsor | id | commerce_api_key | Stripe Connect + merchant whitelist | Apple Pay tested |
|---|---|---|---|---|
| Elkjøp | 3 | `5HPHWJY-…-4TJT` | ✅ | ✅ TV2 demo |
| XXL | 7 | `KCXF10Y-…-SQ9S` | ✅ | ✅ Vg pre-multi-sponsor demos |
| Torshov Sport | 4 | `36EHG0M-…-HDZK3HS-` | ✅ (assumed — not retested) | ⏸ |
| SkiStar | 2 | (empty) | ❌ | — |
| "test name" | 5 | (empty) | ❌ | — |
| Elkjøp (dup) | 6 | (empty) | ❌ | — |
| Maxbo (renamed from Weber) | 8 | `8RN7B6J-…-T1ZT` | ✅ | ✅ Vg demo (May 2026) |

Visual-only sponsors (no commerce_api_key) deliberately skip Apple Pay paths — they show as logos / branding only.

## References

- Q4 L3 sprint that introduced per-sponsor Apple Pay: `socket-server/docs/CURRENT_STATE.md` §24.
- VG sprint that re-confirmed the requirement on the new Maxbo sponsor: [`sprints/2026-05-vg-advertorial-demo.md`](../sprints/2026-05-vg-advertorial-demo.md).
- iOS code: `Sources/VioUI/Managers/ApplePayManager.swift` (`applePayConfirm` call site, line ~411 as of `e463c51`).
