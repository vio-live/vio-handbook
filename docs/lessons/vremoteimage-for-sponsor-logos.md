---
title: "Lesson: Use VRemoteImage (not AsyncImage) for sponsor logos — SVG handled"
last-updated: 2026-05-19
owner: angelo
status: live
---

# Use `VRemoteImage` (not `AsyncImage`) for sponsor logos

## TL;DR

Sponsor `logo_url` values are sometimes SVG (e.g. XXL #7's logo). SwiftUI's `AsyncImage` cannot decode SVG — the image silently fails and the section falls back to a text placeholder ("XXX" caja). The SDK already has a renderer for exactly this: **`VRemoteImage`** in `Sources/VioUI/Components/VRemoteImage.swift`.

`VRemoteImage` detects `.svg` URLs and routes them through a transparent `WKWebView` (WebKit decodes any valid SVG); other URLs go through `AsyncImage`. Used by `VProductCarousel` / `VProductSpotlight` headers since 2026-04-28.

**Don't reach for new dependencies** (SwiftDraw, SVGView, etc.) **or backend rasterization before checking what the SDK already exposes.** The XXL logo fix (2026-05-19, `e449a1b`) was one line — swap `AsyncImage` for `VRemoteImage` in `SponsorCheckoutSection.sponsorLogo`.

## API

```swift
VRemoteImage(
    urlString: String,
    height: CGFloat,
    alignment: HorizontalAlignment = .trailing
)
```

- `alignment`: `.leading | .trailing | .center` — controls justification inside the container (CSS flex for the SVG path).
- iOS-only path for SVG (WebKit). Non-iOS platforms return `EmptyView()` for SVG.

## Where to use

Any place that renders a remote image from a URL that **might** be SVG: sponsor logos, brand marks, vector illustrations served by the backend.

## Where NOT to use

- Product photos (always raster: PNG / JPEG / WebP) — `AsyncImage` or `LoadedImage` (the SDK's cached loader) is fine.
- Local SF Symbols — they're not URLs.

## Tradeoff

`VRemoteImage` instantiates a small `WKWebView` per SVG logo. For a multi-sponsor cart with 3–5 sections, that's 3–5 lightweight webviews while the cart is open — acceptable. If you ever end up rendering hundreds of SVG thumbnails (a product grid full of vector icons, say), revisit — that scale would warrant a snapshot + cache strategy.

## Why this lesson matters

Initial fix (commit `5a4be2a`) preferred `avatarUrl` over `logoUrl` when `logoUrl` was SVG, falling back to the always-raster avatar. That works but it's a workaround — XXL had a perfectly good vector logo we just weren't rendering. Better fix (`e449a1b`) renders the actual SVG. The reusable principle: **before working around an SDK limitation, search the SDK for the existing component that handles it.** Both `VProductCarousel.swift` and `VProductSpotlight.swift` headers already use `VRemoteImage` for the same reason; `SponsorCheckoutSection` was the outlier.

## Related

- Source: `Sources/VioUI/Components/VRemoteImage.swift` (commit history goes back to 2026-04-28 sprint).
- Fix: `e449a1b` on `feat/skip-ordersummary-after-address`.
- Diagnostic: `socket-server/scripts/check-sponsor-logos.ts` — dumps each sponsor's `logo_url` + `avatar_url` and flags SVG.
