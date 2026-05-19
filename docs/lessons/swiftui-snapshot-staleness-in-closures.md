---
title: "Lesson: SwiftUI value-snapshot staleness in onTap closures — pass params, don't re-read"
last-updated: 2026-05-19
owner: angelo
status: live
---

# SwiftUI value-snapshot staleness in onTap closures

## TL;DR

When a SwiftUI view captures a value-typed model in a button's action closure and *also* mutates the source-of-truth in `cartManager` from the same button, the closure's captured copy is **the pre-mutation snapshot**. If the closure then re-reads a property off that captured value, it gets stale data.

**Fix**: pass the relevant fields *into* the closure as parameters, don't re-read from the captured snapshot. Or re-fetch from the `@Published` source-of-truth by id at handler entry.

## The bug we hit (multi-sponsor method tap, 2026-05-19)

```swift
// SponsorCheckoutSection.methodActionButton — broken pattern
Button {
    cartManager.setSelectedPaymentMethod(method, forSponsor: sponsorCart.sponsorId)  // ① mutate source of truth
    onCheckoutTapped()                                                              // ② call closure with no arg
}

// VCheckoutOverlay — broken consumer
SponsorCheckoutSection(
    sponsorCart: sponsorCart,
    onCheckoutTapped: { handleSponsorCheckoutTap(sponsorCart) }  // sponsorCart captured at render time
)

// handleSponsorCheckoutTap
guard let raw = sponsorCart.selectedPaymentMethod else { return }  // reads STALE snapshot
```

`sponsorCart` is a SwiftUI value (`CartManager.SponsorCart` is a struct). The closure captured it at render time. The button's `setSelectedPaymentMethod` writes to `cartManager.cartsBySponsor[id]`, but the captured `sponsorCart` is its own copy — it has the pre-mutation `selectedPaymentMethod`.

Symptoms:

- **First tap**: stale value is `nil` (or whatever the user previously tapped) → `guard else return` fires (no-op) or wrong method fires.
- **Second tap**: by now SwiftUI has re-rendered with the new `cartsBySponsor`, so the closure captures the fresh `sponsorCart` → works.
- **Card → Apple Pay**: if the stale value was `"apple_pay"` (from an earlier tap), tapping "Card" fired Apple Pay because `handleSponsorCheckoutTap` read the stale `"apple_pay"`.

## Fix pattern

```swift
// Pass the tapped method through the closure
public let onCheckoutTapped: (String) -> Void

Button {
    cartManager.setSelectedPaymentMethod(method, forSponsor: sponsorCart.sponsorId)
    onCheckoutTapped(method)  // pass it explicitly
}

// Parent: re-fetch the sponsor cart fresh by id (id is stable)
SponsorCheckoutSection(
    sponsorCart: sponsorCart,
    onCheckoutTapped: { tappedMethod in
        handleSponsorCheckoutTap(
            sponsorId: sponsorCart.sponsorId,
            method: tappedMethod
        )
    }
)

private func handleSponsorCheckoutTap(sponsorId: Int, method: String) {
    guard let sponsorCart = cartManager.cartsBySponsor[sponsorId] else { return }
    // ... use the fresh sponsorCart + the passed-in method
}
```

`sponsorId` (the dict key) is the only safe thing to read from the stale snapshot — it's immutable. Everything else: re-fetch from the `@Published` source of truth, or pass as parameter.

## General rule

In SwiftUI, **closures attached to button actions capture values by their render-time copy**. Combining "mutate the model" + "re-read from a captured value" in the same closure is a footgun. Either:

- Pass the data forward as a parameter (preferred — explicit, no re-read needed), or
- Always re-fetch from the source by stable id at handler entry.

The hint that you're in this trap: "I need to tap twice for it to work" or "tapping X fires the action for Y".

## Where else this could lurk

- `VApplePayButton.onPaymentComplete` — uses similar capture; not currently observed buggy, but if the closure ever reads `sponsorCart.<mutated-field>` we have the same issue.
- Any future `SponsorCheckoutSection` action that mutates `cartManager` and then signals up — pass params, don't re-read.

## Related

- `feat/skip-ordersummary-after-address @ ff21b05` commit message has the full diagnosis with logs.
