---
title: "Lesson: verify Alan's daily claims against code, not Trello"
last-updated: 2026-05-07
owner: angelo
status: live
---

# Lesson — verify Alan's daily claims against code

## What burned us

Three days in a row (2026-05-05, 2026-05-06, 2026-05-07) the agent reported "Alan's progress" by reading **Alan's daily Slack message + Trello card movements** without verifying the code. The user had to manually check the repos each time and correct the agent.

Concrete example (2026-05-06 review):

Alan's daily listed 5 cards as advanced:
1. M8 — VioPlacementRegistry
2. M9 — CampaignManager fetch components
3. M10 — BroadcastCapabilities
4. M12 — Confirmation sheet sponsor logo
5. TV8 — VioCommerceService.fetchProduct per-call

Reality after reading the code:

| Card | Claim | Reality |
|---|---|---|
| M8 | done | ✅ Done — `VioPlacementRegistry.kt` + uploader + exposed in `VioCore.kt` |
| M9 | done | ✅ Done — `fetchAndApplyCampaignComponentsIfPossible()` + `(id, locationId)` dedupe |
| M10 | done | ❌ Untouched — zero matches for `BroadcastCapabilities` or the endpoint |
| M12 | done | 🟡 Partial — propagated `sponsorLogoUrl` in placement composables (carousel, spotlight, store, banner) but **not** in confirmation sheet (which is what the card actually asks for) |
| TV8 | done | ❌ Untouched — `AndroidTV-Vio` had zero commits since 30-apr; the `VioCommerceService.kt:21` stub still says "no implementado en este cut" |

Bonus: a `registerComponentSponsor` function was added to `VioConfiguration.kt:226-262` that wasn't in any card — pure precursor work for Q4 multi-sponsor cart.

**If the agent had moved 5 cards to Done by Alan's word**, the board would lie about platform state. Two real cards (M10, TV8) would silently disappear from the queue. The user caught it and corrected, but it cost trust each time.

## Why it happens

Alan's daily messages are written quickly at end-of-day. He often:

- Mentions cards he *thought about* or *touched tangentially* — not strictly cards he completed.
- Confuses cards across repos (mobile vs TV) — TV8 belongs to `AndroidTV-Vio` but mobile commits are listed.
- Renames classes/functions during the implementation (so the card title doesn't match the code symbol).
- Does adjacent work that doesn't fit the card spec exactly (placement composables in M12 instead of the confirmation sheet).
- Commits work that has no card at all (refactors, prep work).

Commit messages are also uninformative: "avances", "avances version estable" — they carry zero information about what was actually accomplished.

## The rule

**The code is the source of truth. The Trello board is bookkeeping. Alan's daily is a hint.**

When a card is mentioned in Alan's daily:

1. Read the diff of the relevant commits in the relevant repo.
2. Verify the code matches the card's stated spec — not just the card's keyword.
3. If it matches → move to Done with SHA citation.
4. If partial → leave in Doing/To do, comment with what's done vs what's missing.
5. If untouched → leave it, comment asking for clarification.

For commits that don't map to any card → document them in the journal under "Bonus work (no card)" and decide with the user whether to retroactively create a Done card.

## How to inspect the code (procedure)

See the playbook: [`playbooks/review-kotlin-ios-parity.md`](../playbooks/review-kotlin-ios-parity.md), Steps 1–3 specifically.

Key technique: **broad-pattern grep first**. If the card says `BroadcastCapabilities`, grep for `capability|feature|enabled|hasShoppable|hasEngagement` — Alan may have used a synonym. Then read the modified files completely; greping is a hint, not a verdict.

## The cost of skipping verification

- The board misrepresents platform state.
- Real gaps stay hidden under a Done label.
- Sprint planning is built on lies.
- Trust between agent and user erodes (this exact pattern is what triggered this lesson).

## Trigger to re-read this lesson

Any time the agent is tempted to:

- Mark a card Done because Alan said so.
- Report progress without having read at least one code diff.
- Skip a repo because "Alan probably didn't touch it" (he may have, or may have lied; verify).

The whole `review-kotlin-ios-parity` playbook exists to enforce this. Don't skip steps.
