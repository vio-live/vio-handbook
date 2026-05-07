---
title: "ADR-0004: Host themes drive SDK component colors via vio-config.json"
last-updated: 2026-05-07
owner: angelo
status: live
---

# ADR-0004: Host themes drive SDK component colors via `vio-config.json`

## Context

Originally, the SDK had several hardcoded TV2-brand colors baked into shared components:

- `VApplePayButton` background: TV2 purple `#7000FF`
- `VApplePayConfirmationSheet`: TV2 dark navy `#141520` background, TV2 purple `#7000FF` accents, white text
- Various overlays adopted TV2's dark navy as a fallback surface

When VG (a different brand: white surfaces, VG red `#E61A22`) integrated the SDK, every payment surface looked like TV2. The fix-by-host approach (each demo overrides each color) doesn't scale — the next host repeats the same work.

## Decision

**SDK components consume colors exclusively from theme tokens** resolved at runtime via:

- `VioColors.adaptive(for: colorScheme)` — returns an `AdaptiveColors` struct with `surface`, `surfaceSecondary`, `textPrimary`, `textSecondary`, `textTertiary`, `border`.
- `VioColors.primary` — host's brand accent (resolved from `vio-config.json` light/dark `primary`).

Hosts configure their palette in `vio-config.json` under `theme.lightColors` and `theme.darkColors`. The SDK never literals a color value.

## Rationale

- Single source of truth per host. Want VG to look like VG? Change `vio-config.json`. The SDK adopts.
- Future hosts (Aftonbladet, ESPN, partner X) get correct branding for free.
- TV2 isn't penalized: its config still produces the same dark + purple look as before, because that's what its `vio-config.json` says.

## Consequences

- Any new SDK component that has a colored surface, accent, or text MUST read from `VioColors` / `adaptiveColors` — never literal `Color.white`, `Color.black`, `Color(red:…)`.
- Code review checklist item: search the diff for `Color(red:` and `Color.white` / `Color.black`. If found in component code (not animations / brand-mark icons), reject.
- `VioColors` lives in `VioDesignSystem` package — adding `import VioDesignSystem` may be required in files that didn't previously need it.

## Implementation reference

In `VApplePayConfirmationSheet`:

```swift
@SwiftUI.Environment(\.colorScheme) private var colorScheme

private var adaptiveColors: AdaptiveColors {
    VioColors.adaptive(for: colorScheme)
}

// In body:
.foregroundColor(adaptiveColors.textPrimary)
.background(VioColors.surface)
// for accents:
.foregroundColor(VioColors.primary)
```

Pin the host's `theme.mode` (`light` / `dark` / `automatic`) so SDK overlays consistently pick the right palette regardless of the simulator's system trait collection. iOS 17+/26 sheets don't reliably inherit `.preferredColorScheme(...)` from the host — pin them inside the overlay too.

## Alternatives considered

- **Per-component `style:` parameter**: rejected. Every host call site would have to pass it. Same coupling, just verbose.
- **CSS-like `themeOverride` modifier on the call site**: nicer DSL but requires a SwiftUI `EnvironmentValue` — more machinery for the same outcome as reading `VioColors` directly.

## Open work tracked separately

- Backend support for **placement-level** styling (`backgroundColor`, padding) on `app_placements.custom_config` so operators can override the host theme per-placement from the dashboard. See pending tasks in `socket-server/docs/CURRENT_STATE.md` §26.

## References

- PR: [vio-live/VioSwiftSDK#14](https://github.com/vio-live/VioSwiftSDK/pull/14) (commit `e463c51` on `develop`).
- Files: `Sources/VioUI/Components/VApplePayConfirmationSheet.swift`, `Sources/VioUI/Components/VApplePayButton.swift`.
