---
title: "Engineering journal"
last-updated: 2026-05-07
owner: angelo
status: live
---

# Engineering journal

Day-by-day log of what we did, what we decided, what's pending. The fast read for "what's been happening lately" without digging through commits or sprint summaries.

## Why this exists vs other docs

| Doc type | Granularity | Lifetime |
|----------|-------------|----------|
| **Journal** (this) | Per-session / per-day | Forever (chronological log) |
| **Sprint summary** | Per-sprint, written at close | Forever (in `sprints/`) |
| **ADR** | Per-decision | Forever, immutable once merged |
| **Lesson** | Per-gotcha | Forever |
| **Playbook** | Per-recurring-op | Forever, updated as ops evolve |
| **Code-repo `CURRENT_STATE.md`** | Live, sprint-level, dated header | Refreshed every sprint |
| **In-flight `*-HANDOFF.md`** | Per-active-branch | Lives in branch; rewritten + moved to `sprints/` at close |

The journal sits between the live state (which captures *now*) and sprint summaries (which capture *the arc*). It's the **chronological diary** — useful when somebody asks "what happened on May 6?" or "what did we do this week?".

## Format

One file per session. Filename: `YYYY-MM-DD.md` (or `YYYY-MM-DD-N.md` if multiple distinct sessions same day).

Inside each file:

```markdown
---
date: YYYY-MM-DD
session: morning | afternoon | full-day | quick-fix
participants: [angelo, claude]
status: live
---

# Session — YYYY-MM-DD

## Goal
What we set out to do.

## Done
- Bullet 1 (link to PR/commit)
- Bullet 2

## Decisions
- ADR-NNNN: link

## Blockers / open questions
- ...

## Next session
- What to pick up.
```

## Folder structure

```
journal/
├── README.md (this)
├── 2026-05/
│   ├── 2026-05-06.md
│   └── 2026-05-07.md
└── 2026-06/   (created on first session in June)
```

## Rules

- **Write at session close**, not mid-session. The summary needs hindsight to be useful.
- **Link to PRs / commits / ADRs / sprint docs** — the journal is an *index*, not the source.
- **Don't duplicate** sprint summaries here. If a sprint closes and warrants a sprint doc, write the sprint doc and link it from the journal entry.
- **Quarterly cleanup**: months older than 12 months may be moved to `journal/archive/`. Don't delete — chronology has value.
