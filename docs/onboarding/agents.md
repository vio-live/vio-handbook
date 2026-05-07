---
title: "Onboarding — AI agents"
last-updated: 2026-05-07
owner: angelo
status: live
---

# Onboarding — for AI agents

You're a Claude (or other LLM) agent joining the Vio project. Your goal in the first 5 minutes is to know **where to look** for any question — not to memorize the platform.

## Read order (do this in sequence)

1. **This file** — you are here. Establishes the structure.
2. **[`../README.md`](../../README.md)** — the handbook hub. Tells you the difference between handbook docs and code-repo docs.
3. **[`../architecture/system-overview.md`](../architecture/system-overview.md)** — what each of the 3 repos does and how they fit together.
4. **`https://github.com/tipiodevelopment/socket-server/blob/develop/docs/CURRENT_STATE.md`** — the "live truth" (header is dated; sections numbered). This is what's happening *right now* on the platform.
5. **[`../decisions/`](../decisions/)** — skim the ADR titles. Read any that's relevant to the task at hand.

After step 5, you have enough context to ask the user a focused question instead of a vague one.

## What lives where (the 4 layers)

```
┌───────────────────────────────────────────────────────────────────────┐
│  Layer 1 — Per-instance memory (your own scratchpad, NOT shared)      │
│  ~/.claude/projects/.../memory/MEMORY.md + 5 topic files              │
│  Use to cache user preferences, current branch focus, etc.            │
│  DO NOT put platform knowledge here — it doesn't survive your         │
│  instance and other agents won't see it.                              │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  Layer 2 — vio-handbook (this repo, durable cross-repo knowledge)     │
│  Onboarding, architecture overview, ADRs, sprints (closed),           │
│  lessons, playbooks, glossary, roadmap. All in markdown.              │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  Layer 3 — Code-repo docs (live with code, drift-gated)               │
│  socket-server/docs/         ← API contract, schema, current state    │
│  VioSwiftSDK/Documentation/  ← runtime catalogs, retry policy         │
│  VioSwiftSDK/Q4-LN-HANDOFF.md ← in-flight sprint handoffs             │
└───────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  Layer 4 — Code itself (file headers, doc comments)                   │
│  Last resort. Confirm the docs match the code by reading the code     │
│  before asserting behaviour.                                          │
└───────────────────────────────────────────────────────────────────────┘
```

## When the user asks…

| User says | Look here first |
|---|---|
| "What's pending?" / "What was I doing?" | `socket-server/docs/CURRENT_STATE.md` header + latest § |
| "Why is X done that way?" | `vio-handbook/docs/decisions/` (search by topic) |
| "We hit this bug before?" | `vio-handbook/docs/lessons/` |
| "How do I add a sponsor / debug Apple Pay / rotate keys?" | `vio-handbook/docs/playbooks/` |
| "What's <some term>?" | `vio-handbook/docs/glossary.md` |
| "Continue this sprint" | The branch's `*-HANDOFF.md` in the relevant code repo (sprint files only move to `vio-handbook/docs/sprints/` when **closed**) |
| "Explain the cart-intent flow" | `socket-server/docs/CURRENT_STATE.md` (relevant §) → if not enough, `socket-server/server/routes.ts` directly |

## Operating rules (LOCKED — do not violate)

These appear in the user's global memory too, but you should know them by heart:

1. **No auto-merge.** Open the PR; the user merges it.
2. **VioSwiftSDK never→main.** Always `develop`.
3. **No v1 fallbacks.** v2 is the target.
4. **No hardcoded apiKeys.** Bootstrap from `/v2/mobile/config`.
5. **No force-push** on shared branches.
6. **No AI attribution** in commit messages (no `Co-Authored-By: Claude`).
7. **No new doc files** without justification (different *type* of doc, not duplicate content).
8. **`npm run check:docs-drift`** before merging anything in socket-server.

## What to do when in doubt

1. **Read code before asserting behaviour.** Memory and docs can be stale; code is current.
2. **Confirm with the user before destructive operations** (delete branch, rewrite history, drop table, change auth).
3. **Diagnose before fixing.** If a bug spans iOS + backend + commerce, instrument with logs first; don't guess-patch multiple layers simultaneously.
4. **Cite paths and line numbers** when you reference code: `Sources/VioUI/Managers/ApplePayManager.swift:175`.

## How to add a new ADR / lesson / playbook

When you discover something durable (a decision, a gotcha, a recurring op):

1. Decide the type:
   - **Decision (ADR)**: a deliberate choice with alternatives that someone might revisit ("we picked X over Y because Z").
   - **Lesson**: a thing we learned the hard way ("if you do X, Y breaks because Z — don't").
   - **Playbook**: a repeatable how-to ("to do X, follow these steps").
2. Pick the next number (for ADRs) or a kebab-case slug.
3. Use the template — see existing files for the shape. Always include frontmatter.
4. Open a PR (the user merges).

## Things you should NOT do

- Put platform knowledge in your per-instance memory (Layer 1) — it dies with you.
- Create files in random places — follow the structure.
- Edit ADRs after they're merged — write a new ADR that supersedes.
- Create sprint summaries in `docs/sprints/` while the sprint is in flight — that's what the code-repo `*-HANDOFF.md` is for.
