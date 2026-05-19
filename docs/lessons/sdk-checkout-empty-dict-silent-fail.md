---
title: "Lesson: VioSwiftSDK CheckoutModule rejects empty-dict addresses silently"
last-updated: 2026-05-19
owner: angelo
status: live
---

# `CheckoutModule.update` rejects empty-dict addresses silently

## TL;DR

Passing `shippingAddress: [:]` or `billingAddress: [:]` (Swift empty dictionary) to `cartManager.updateCheckout(...)` looks like it does nothing — no Klarna webview opens, no Stripe sheet opens, the user taps "Card" three times. Root cause:

```swift
// VioCore/Sdk/Modules/CheckoutModule.swift:62-69
if let m = shipping_address, m.isEmpty {
    throw ValidationException("shipping_address cannot be empty", ...)
}
if let m = billing_address, m.isEmpty {
    throw ValidationException("billing_address cannot be empty", ...)
}
```

Client-side validator throws **before** the GraphQL call. The caller's `catch` logs via `VioLogger.error` — **which doesn't print to console in dev builds** — so the failure is invisible. The next iOS step never runs.

**Workaround**: send the smallest defensible non-empty dict. For a "we don't have user data yet" call, `["country": resolvedCountry]` works — country comes from the market (not user input), satisfies the validator, satisfies Vio Commerce's "must have address" check.

## How it shows up

- Tap "Card" / "Klarna" / "Vipps" in a sponsor section → nothing happens. The button doesn't even highlight.
- Device log shows the cart setup events (`createCheckout-SPONSOR`, `sdk-resolve` cache-hits) but no `updateCheckout-SPONSOR` print and no GraphQL `UpdateCheckout` POST.
- No error toast, no checkoutStep transition.

## Why the silent fail

Two compounding issues:

1. **`CheckoutModule.update` throws on `isEmpty`** — defensive, but with no doc that this happens. The Vio Commerce GraphQL backend itself accepts `{}` ([verified empirically](#) 2026-05-13 in `/tmp/test-minimal-address.ts`); the iOS validator is stricter than the backend.
2. **`VioLogger.error` is filtered out of console in default dev builds** (not stdout; uses `os_log` at error level which Xcode console suppresses by default). When the only signal is via `VioLogger`, the failure ghosts.

## Fix the silent-log problem permanently

When you're touching a code path that needs to be *visibly* debuggable, add a direct `print(...)` alongside the `VioLogger.error` — at least for the duration of the diagnostic. Several `🟣 [Q4-DIAG …]` prints in the codebase exist for exactly this reason — they survive because `os_log`'s default filtering doesn't catch `print`.

Pattern:

```swift
} catch {
    let msg = (error as? SdkException)?.description ?? error.localizedDescription
    print("🟣 [Q4-DIAG <component>] FAIL: \(msg)")   // ← survives console filtering
    VioLogger.error("<component> FAIL: \(msg)", component: "<Component>")
    return false
}
```

## Where we hit it

Path E experiment in the abandoned `feat/direct-payment-launch` sprint (2026-05-13). Tried to send Klarna `{shipping_address: {}, billing_address: {}}` based on a probe that confirmed Vio Commerce's GraphQL accepts empty objects. It did — but the SDK never let the request out. Diagnosed only because Apple Pay's existing `[Q4-DIAG]` `print(...)` calls were visible while the corresponding `VioLogger.debug` from `updateCheckout(forSponsor:)` was absent → "the function isn't even being entered, must be throwing before."

## Related

- Commit message of `feat/direct-payment-launch @ 936b116` has the full diagnosis.
- The probe that confirmed the backend accepts `{}`: `/tmp/test-minimal-address.ts` (2026-05-13).
