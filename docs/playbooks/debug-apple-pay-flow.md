---
title: "Playbook: Debug an Apple Pay flow that hangs / fails"
last-updated: 2026-05-07
owner: angelo
status: live
---

# Debug an Apple Pay flow that hangs / fails

## When to use this playbook

You tap Apple Pay in a Vio host app demo (Vg, Viaplay, TV2) and one of:

- The Apple Pay sheet never appears.
- The Apple Pay sheet appears but cancels with no detail.
- The flow runs, returns to the app, but no confirmation or no order.
- 60 seconds later, `nw_read_request_report Receive failed with error "Operation timed out"` appears in the console.

## Diagnostic order (do this top-to-bottom)

### 1. Capture the full log from tap to failure

Filter the Xcode console for these prefixes:

```
[VApplePayButton]    → button tap entry
[ApplePayManager]    → flow orchestration
[GraphQLHTTPClient]  → network ops
[CartModule]         → cart state mutations
[CartManager]        → SDK credentials, syncs
[PaymentModule]      → Stripe/payment intent ops
🟣 [Q4-DIAG]         → multi-sponsor diagnostic
```

Paste the log into your investigation. The presence/absence of each line tells you where the flow halted.

### 2. Identify the halt point

Walk down the expected sequence. The first MISSING line is the suspect.

| Expected log line | If missing, look at... |
|---|---|
| `[VApplePayButton] initiatePayment tapped` | The button was disabled (out of stock?) or the tap didn't register. |
| `[ApplePayManager] step 1: about to addProduct` (if instrumented) | The `Task { await pay() }` didn't fire. Actor isolation or suspended task. |
| `POST /graphql [mutation AddItem]` `Response status: 200` | Network request didn't fire — likely commerce credentials missing. Check `cartManager.sdk.apiKey`. |
| `[ApplePayManager] step 2: addProduct returned` (if instrumented) | **Classic iOS 26 nested-modal hang** — see [`lessons/ios26-nested-modal-deadlock.md`](../lessons/ios26-nested-modal-deadlock.md). Check the modal stack depth. |
| `POST /graphql [query GetCart]` | `cart.getById` — likely the cartId from sync was empty (server returned cart with no `cartId` field). |
| `POST /graphql [mutation CreateCheckout]` | Cart was empty server-side (already paid? cart.delete'd?) — check sponsor cart state. |
| `POST /graphql [mutation CreatePaymentApplePay]` (applePayInit) | Stripe key not extracted from response — check `extractStripeKeyFromApplePayInit`. |
| Apple Pay system sheet appears | Merchant identifier validation failed — see step 4. |
| `POST /graphql [...applePayConfirm]` `Response status: 200` | Apple Pay sheet was authorized but confirm failed — see step 5. |
| Confirmation sheet appears | Sheet swap to confirmation didn't fire — check `paymentResult` change handler. |

### 3. If the halt is at "addProduct returns but step 2 never logs"

You're hitting the **iOS 26 nested-modal deadlock**. Read [`lessons/ios26-nested-modal-deadlock.md`](../lessons/ios26-nested-modal-deadlock.md). Fix:

- Check the modal stack at the moment of tap. Is `.fullScreenCover` nested with `.sheet`?
- Refactor to one of: in-place view swap, single `.sheet` layer, or `NavigationStack`.

### 4. If the halt is at "Apple Pay system sheet doesn't appear"

Likely entitlements / merchant configuration:

- **Capability**: Xcode → target → Signing & Capabilities. Does "Apple Pay" appear with the merchant id `merchant.live.vio`? If not, add it (the `Vg.entitlements` content alone isn't enough — Xcode tracks the capability separately).
- **CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION = YES** in build settings. Without this, the merchant id is stripped from the signed binary.
- **Test card in Wallet**: simulator → Settings → Wallet → Add card (or use a real device).

### 5. If the halt is at "applePayConfirm" returning `[object Object]` 500

Sponsor's commerce-side setup is incomplete. Read [`lessons/stripe-connect-per-sponsor.md`](../lessons/stripe-connect-per-sponsor.md). The fix is on Reachu's side, not ours:

- Stripe Connect account linked to the sponsor's commerce channel.
- `merchant.live.vio` whitelisted on that Stripe account.
- Products listed in the channel's catalog.

Verify the sponsor's commerce key returns products via the curl in that lesson. If yes, the only missing piece is the Apple Pay whitelist.

### 6. If you're seeing `[object Object]` in your iOS error message

That's the GraphQL response body being naively stringified. The actual error is in the response body — check the backend log or curl the endpoint manually with the failing inputs.

## Common patterns

### Pattern A: New sponsor, Apple Pay never works

→ commerce-side setup. See lesson + step 5 above.

### Pattern B: Sponsor worked yesterday, broken today

→ likely cart_id stale, persisted in UserDefaults from a prior session. Wipe simulator (Device → Erase All Content and Settings) + reinstall.

### Pattern C: Works on TV2, fails on Vg with same SDK

→ host setup difference. Compare `vio-config.json`, `*.entitlements`, `xcodeproj` build settings, `App.init` setup (userId + placement registration). VG sprint May 2026 found 2 missing items: `CODE_SIGN_ALLOW_ENTITLEMENTS_MODIFICATION` and the modal-stack pattern.

### Pattern D: Works on dev, fails on prod (no tunnel)

→ check that the production backend serves the same Neon branch the dashboard wrote to. Drift between `api-dev.vio.live` (dev) and prod is real.

## Tools

### Curl the commerce GraphQL directly

```bash
# Get sponsor's commerce_api_key from the DB:
# psql -c "select commerce_api_key from sponsors where id = <sid>"

# List products
curl -s -X POST https://graph-ql-dev.vio.live/graphql \
  -H "Authorization: <key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { Channel { GetProducts(shipping_country_code: \"NO\", currency: \"NOK\") { id title } } }"}'

# Get a cart by id
curl -s -X POST https://graph-ql-dev.vio.live/graphql \
  -H "Authorization: <key>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query GetCart($id: String!) { Cart { GetById(cart_id: $id) { cartId currency line_items { id quantity } } } }","variables":{"id":"<cart-id>"}}'
```

### Inspect a campaign's full setup

```bash
cd ~/vio-backend/socket-server
NODE_ENV=development npx tsx scripts/inspect-vg-campaign.ts
# Targets the develop Neon branch. Edit the script to scope to a different campaign.
```

### Repoint the iOS demo at local backend (for live debugging)

In `Demo/<host>/<host>/Configuration/vio-config.json`, the `campaigns` block:

```json
{
  "devRestAPIBaseURL": "https://api-local-angelo.vio.live",
  "devWsBaseURL": "wss://api-local-angelo.vio.live"
}
```

When `environment: "development"`, the SDK uses these. Switch back to `https://api-dev.vio.live` when you're done debugging — the deployed dev backend is more stable than a Cloudflare tunnel.

## References

- [`lessons/ios26-nested-modal-deadlock.md`](../lessons/ios26-nested-modal-deadlock.md)
- [`lessons/stripe-connect-per-sponsor.md`](../lessons/stripe-connect-per-sponsor.md)
- [ADR-0003](../decisions/0003-no-fullscreencover-with-sheet-on-ios26.md)
- [VG sprint 2026-05](../sprints/2026-05-vg-advertorial-demo.md) — full diagnostic timeline.
