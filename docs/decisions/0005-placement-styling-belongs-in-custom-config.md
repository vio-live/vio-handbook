---
title: "ADR-0005: Placement-level visual styling belongs in custom_config (operator-driven)"
last-updated: 2026-05-07
owner: angelo
status: draft
---

# ADR-0005: Placement-level visual styling belongs in `custom_config` (operator-driven)

> Status: **draft** — decision is taken in principle, but the schema + SDK consumption are not yet implemented. Tracked as a pending backend epic.

## Context

ADR-0004 establishes that **host-app theme** drives SDK component colors. That's the right granularity for the brand — VG vs TV2 vs Viaplay each have their own palette across the entire app.

But there's a finer granularity that came up during the VG demo: a **specific placement** (a `VProductStore` block embedded in the burgundy news feed) needed a contrasting **white surface** so it visually breaks from the surrounding content. The host theme is "VG burgundy"; the placement wants to opt out and be white.

Today, the only way to achieve this is host-side: wrap the placement in a `.background(Color.white).padding(...)` in the host's view code. That works but:

- Couples visual treatment to the host build — operators can't change it.
- Doesn't scale: the next placement that wants its own background needs another host edit.
- Misses the operator's expectation that "I configure a placement, including its appearance, from the dashboard".

## Decision (in principle)

**Add optional visual styling fields to `app_placements.custom_config` (and possibly `campaign_components.custom_config` for instance overrides).** SDK component renderers (`VProductStore`, `VProductCarousel`, `VProductSpotlight`, `VProductBanner`, `VOfferBanner`) read those fields and apply them as the outermost wrapper around their content.

Proposed shape (TypeScript-ish):

```ts
type PlacementStyling = {
  backgroundColor?: string;        // hex, with or without alpha
  cornerRadius?: number;           // 0-32, in pt
  padding?: { horizontal?: number; vertical?: number };
  marginTop?: number;              // outer spacing above
  marginBottom?: number;           // outer spacing below
};
```

## Rationale

- **Operator-driven**: the dashboard's placement editor gets an "Appearance" accordion. Designer + product can iterate without an iOS build.
- **Per-placement, not per-host**: the host theme stays the high-level brand. Specific blocks can opt-out for emphasis (e.g. an in-feed Annonsørinnhold + shop block needs to read as "this is sponsored / different from surrounding content").
- **Backwards compatible**: nullable fields → existing placements without styling render as today.
- **Cross-platform**: the same JSON works for iOS, Kotlin (when it lands), and any future renderer.

## Consequences

- Schema migration on `app_placements.custom_config` — current JSONB shape has typed validators (productIds, displayType, columns); add the styling subtree with its own validator.
- Backend: `GET /v2/mobile/campaigns/:id/components` already returns `custom_config`; just need to surface the new fields.
- Dashboard: new "Appearance" UI in the placement editor.
- iOS SDK: each component reads `config.styling?.backgroundColor` etc. and applies as a wrapper.
- Vg demo migration: remove the host-level `.background(Color.white).padding(.vertical, 20).padding(.horizontal, 16)` around `VProductStore(locationId: "home_store")` once backend + SDK support is live. There's a `// TODO (backend)` comment in `Demo/Vg/Vg/Views/NewsView.swift` flagging the spot.

## Open questions

- Do we need light/dark variants per placement, or single `backgroundColor` is enough? (Default: single, simplest. Add variants only if a host needs both.)
- Validation: hex format check on `backgroundColor` (regex `^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`)?
- iOS edge cases: when the placement is inside a card with its own bg, does the placement bg override or layer? (Default: outermost wrapper takes precedence; the component itself draws on top.)

## Alternatives considered

- **Host-only styling (status quo)**: rejected — see "Context".
- **Theme variants in `vio-config.json`**: rejected — that's host-wide; placements need finer.
- **A separate `placement_styling` table**: rejected — overkill, custom_config is already the right home.

## References

- Pending epic in `socket-server/docs/CURRENT_STATE.md` §26 ("Out of scope this PR").
- Vg's host-side workaround: `VioSwiftSDK/Demo/Vg/Vg/Views/NewsView.swift` (search for `// TODO (backend)`).
