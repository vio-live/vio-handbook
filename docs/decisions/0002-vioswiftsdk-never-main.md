---
title: "ADR-0002: VioSwiftSDK never merges to main"
last-updated: 2026-05-07
owner: angelo
status: live
---

# ADR-0002: VioSwiftSDK never merges to `main`

## Context

VioSwiftSDK is consumed as a Swift Package by host apps (Vg, Viaplay, tv2demo, future partners). Partners pin to `main` for stability. Active development happens on `develop`.

Mixing dev work into `main` would expose partners to half-baked features and break their CI on minor commits.

## Decision

**All VioSwiftSDK work goes to `develop`.** `main` only receives explicit release tags (manual cherry-pick or fast-forward of a tested commit), never PRs from feature branches.

## Rationale

- Partners pin SDK versions by tag (`v0.1.0-alpha`, etc.) on `main`.
- `develop` is the working integration branch — feature branches PR here.
- Releases happen via a deliberate tag-and-promote step, not via dev PRs.
- This protects partners from breaking changes that are merged to `develop` mid-sprint.

## Consequences

- Every PR in VioSwiftSDK has `base: develop` (never `main`).
- Releases are a separate ritual: cut a tag from `develop` after a sign-off, then fast-forward `main` to that tag.
- AI agents must verify `--base develop` when opening PRs in this repo (gh CLI defaults to the repo's default branch which is correct for VioSwiftSDK = `develop`, but worth double-checking).

## Alternatives considered

- **Trunk-based on `main`**: rejected because partners need a stable pin.
- **`release` branch as separate base**: more ceremony, no real benefit for the current team size.

## References

- Operating rule #2 in [`onboarding/humans.md`](../onboarding/humans.md).
- Compare: `tipiodevelopment/socket-server` is also `develop`-based but for a different reason (deploy = `develop`, no external consumers pin it).
- `vio-live/InteractiveAds-vio` is `main`-based (no `develop`) because it's small and partner-pinned.
