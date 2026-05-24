---
title: "Playbook: Review Kotlin/TV progress vs iOS parity"
last-updated: 2026-05-07
owner: angelo
status: live
---

# Playbook — Review Kotlin/TV progress vs iOS parity

> **When to run this**: the user asks "revisa avances", "qué hizo Alan?", "status de las tarjetas", or any variant. The agent's scope is bounded: Kotlin SDK + Android TV SDK + Trello task management for Alan. iOS-side reviews and backend reviews are out of scope.

## Outcome of a review

After a review the user gets:

1. **3 tracks reported separately** (never mixed):
   - **Track A — Trello state**: cards in each list + movements by Alan + movements by us.
   - **Track B — Alan's commits**: SHAs, files touched, which cards each commit really covers.
   - **Track C — Our changes**: cards moved/edited/created, scripts run, decisions registered.
2. **A journal entry** in [`docs/journal/YYYY-MM/`](../journal/) of this handbook (one per review session).
3. **Open questions surfaced** for cards Alan claimed but the code doesn't show, or code that has no card.

## The 4 repos in scope

All under `vio-live` org:

| Repo | Visibility | Local clone path | Role |
|---|---|---|---|
| `VioKotlinSDK` | public | `/tmp/VioKotlinSDK` | Mobile SDK (Kotlin) |
| `VioKotlinDemo` | private | `/tmp/VioKotlinDemo` | Mobile demos: TV2DemoApp, ViaplayDemoApp, VGDemoApp, LiveShoppingDemo, VioDemoApp, VioDemoSdk |
| `AndroidTV-Vio` | private | `/Users/angelo/Documents/GitHub/AndroidTV-Vio` | Android TV SDK |
| `AndroidTV-Vio-Demo` | private | `/tmp/AndroidTV-Vio-Demo` | Android TV demo |

If a `/tmp/...` clone is missing (clean slate), re-clone with `gh repo clone vio-live/<repo>`.

## Step 1 — Fetch + diff vs anchors

Maintain an anchor SHA per repo (last commit reviewed). On each new review, diff `<anchor>..HEAD` to see what's new.

```bash
cd /tmp/VioKotlinSDK && git fetch --all --prune
git log <anchor>..HEAD --pretty=format:"%h %ai %s" --stat
```

Repeat for the other 3 repos.

**Where the anchors live**: in the agent's per-instance memory (`~/.claude/CLAUDE.md` or the agent's `MEMORY.md` topic file). They drift fast (one row per review), so they don't belong in this durable handbook. The handbook only documents *the procedure*, not the live state.

## Step 2 — Read the actual diffs, NOT just greps by card name

Alan's commit messages are uninformative ("avances", "avances version estable"). The diff is the source of truth.

When Alan says "I worked on card X":

- ❌ **Don't** grep for the exact name from the card title. He may have renamed classes/functions.
- ❌ **Don't** assume the card scope matches what he committed. He may have done something adjacent.
- ❌ **Don't** mark the card Done because his daily message lists it. Verify in code.

✅ **Do**:
1. `git show <sha> --stat` to see modified files.
2. Read the modified files completely or the per-file diff (`git show <sha> -- <file>`).
3. Grep by **broad patterns** first (`capability|feature|enabled` instead of `BroadcastCapabilities`).
4. If a card cites a specific endpoint (`/v2/mobile/broadcasts/:id/capabilities`), grep for the path AND for plausible method names (`fetchCapabilities`, `getBroadcastFeatures`, etc.).

## Step 3 — Cross-check Alan's daily message vs reality

Alan's pattern: lists 5 cards in his daily, but only 2 are actually completed in code, 1 is partial (different scope from spec), 2 are untouched.

For each card he mentioned:

- If the code matches the card spec → mark Done with SHA citation.
- If the code is partial → comment on the card describing exactly what's done and what's missing.
- If the code doesn't show changes → comment asking for clarification ("no veo cambios para esta card — ¿la hiciste en otro lado o queda pendiente?").
- **Don't move to Done by his word alone** — see [`lessons/verify-alan-claims-against-code.md`](../lessons/verify-alan-claims-against-code.md).

## Step 4 — Identify code without a card (bonus work)

Alan sometimes commits work that isn't in any card (refactors, prep for future features, fixes). When you see this:

- Document it in the journal entry under "Bonus work (no card)".
- Decide with the user: create a Done card to record it, or just note it.

## Step 5 — Surface gaps in the iOS↔Kotlin parity

The agent's job is parity tracking. After every review, ask:

- What did iOS ship recently (last 1–2 weeks of `develop`) that Kotlin doesn't have yet?
- Should new cards be created for that gap?
- Are there cards in Kotlin's queue that iOS already abandoned (drift in the other direction)?

If yes → propose new cards for the user's approval (don't auto-create).

## Step 6 — Write the journal entry

One file per review session at `docs/journal/YYYY-MM/YYYY-MM-DD.md` (or `-N.md` for multiple sessions same day, e.g. when the day already has a journal entry for a different topic).

Use the journal template:

```markdown
---
date: YYYY-MM-DD
session: kotlin-review
participants: [angelo, claude]
status: live
---

# Session — YYYY-MM-DD — Kotlin/TV review

## Anchors before review
- VioKotlinSDK: `<sha>` (date)
- VioKotlinDemo: `<sha>` (date)
- AndroidTV-Vio: `<sha>` (date)
- AndroidTV-Vio-Demo: `<sha>` (date)

## Track A — Trello state
- Counts per list, movements in last 24h, separated by member.

## Track B — Alan's commits
- One subsection per commit with SHA + files + which card it covers.
- Discrepancies: cards mentioned in daily but no code match.

## Track C — Our changes
- Cards moved/edited/created, scripts run, decisions registered.

## Open questions / pending
- Cards waiting on user decision.

## Anchors after review (update for next session)
- VioKotlinSDK: `<new-sha>`
- ...
```

## Step 7 — Update Trello (with user approval)

The agent uses the Bash + Python pattern with `TRELLO_API_KEY + TRELLO_TOKEN` from `/Users/angelo/trello-mcp-server/.env`. Common operations:

- **Move card**: `PUT /cards/{shortLink}` with `idList=<targetListId>`.
- **Add comment**: `POST /cards/{shortLink}/actions/comments` with `text=...`.
- **Reorder**: `PUT /cards/{shortLink}` with `pos=<number>`.

Trello board "Dev" IDs:

| List | ID |
|---|---|
| Backlog | `6964ed5eeb630c1ed6fcccb0` |
| To do | `6964ed62b23b70bbd5c89432` |
| Doing | `6964ed646e48737f0130e775` |
| Done | `6964ed66c5545f6ef2fe9131` |

Alan member id: `61768b4c162543101dce04fc`. Board id: `6964ea21570279f07def7786`.

**Don't auto-merge to Done**: when in doubt list the findings to the user and ask for confirmation. See [ADR-0001](../decisions/0001-no-auto-merge.md).

## Anti-patterns (LOCKED — burned us before)

- ❌ **Stopping at Trello** — Alan's daily/movement is not source of truth. Code is.
- ❌ **Greping only by card name** — Alan renames things; broad patterns first.
- ❌ **Trusting commit messages** — "avances version estable" carries zero info.
- ❌ **Mixing tracks in the report** — the user explicitly asked for A/B/C separated.
- ❌ **Marking Done by daily mention** — verify or ask.

## Companion lesson

When a card claim doesn't match the code, see [`lessons/verify-alan-claims-against-code.md`](../lessons/verify-alan-claims-against-code.md) for the recurring pattern and how to handle it.
