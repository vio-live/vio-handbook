---
title: "Onboarding — AI agents"
last-updated: 2026-09-03
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

1. **No auto-merge in code repos.** Open the PR; the user merges it. **Exception — the handbook:** documentation is pushed directly to `main`, always, in the same session ([ADR-0012](../decisions/0012-agentes-pushean-documentacion-al-handbook.md)). A journal entry left as a local commit is a rule violation, not caution.
2. **VioSwiftSDK never→main.** Always `develop`.
3. **No v1 fallbacks.** v2 is the target.
4. **No hardcoded apiKeys.** Bootstrap from `/v2/mobile/config`.
5. **No force-push** on shared branches.
6. **No AI attribution** in commit messages (no `Co-Authored-By: Claude`).
7. **No new doc files** without justification (different *type* of doc, not duplicate content).
8. **`npm run check:docs-drift`** before merging anything in socket-server.
9. **Fetch first.** At session start run `git fetch` in the code repo and `git pull --rebase` in the handbook, so you know where things stand and what the others did. Pull again right before pushing to the handbook.
10. **Document every substantive session with `/documentar`.** It updates your per-instance memory *and* writes the handbook entry, then pushes. See below.

## What to do when in doubt

1. **Read code before asserting behaviour.** Memory and docs can be stale; code is current.
2. **Confirm with the user before destructive operations** (delete branch, rewrite history, drop table, change auth).
3. **Diagnose before fixing.** If a bug spans iOS + backend + commerce, instrument with logs first; don't guess-patch multiple layers simultaneously.
4. **Cite paths and line numbers** when you reference code: `Sources/VioUI/Managers/ApplePayManager.swift:175`.

## `/documentar` — closing a session

Global Claude Code skill (`~/.claude/skills/documentar/`), available in every project. Run it at the end of any substantive session, or when the user says "documentá" / "guardá esto". It does, in order:

1. `git pull --rebase` on the handbook (and `git fetch` on the current code repo).
2. **Memory (Layer 1):** save what is per-instance only — user preferences, corrections, current focus, anchors. Never platform knowledge.
3. **Handbook (Layer 2):** pick the doc type (journal entry always; lesson / playbook / ADR when the session produced one), follow [`journal/README.md`](../journal/README.md) for format and authorship, use `date +%F` for the date, and the anti-collision filename `YYYY-MM-DD-<svc|topic>-<slug>.md`.
4. Commit (imperative subject, no AI attribution) and **push to `origin/main`**. Report the commit URL.

Code repos are untouched by this command; they stay under ADR-0001.

## How to add a new ADR / lesson / playbook

When you discover something durable (a decision, a gotcha, a recurring op):

1. Decide the type:
   - **Decision (ADR)**: a deliberate choice with alternatives that someone might revisit ("we picked X over Y because Z").
   - **Lesson**: a thing we learned the hard way ("if you do X, Y breaks because Z — don't").
   - **Playbook**: a repeatable how-to ("to do X, follow these steps").
2. Pick the next number (for ADRs) or a kebab-case slug.
3. Use the template — see existing files for the shape. Always include frontmatter.
4. Commit and push to `main` ([ADR-0012](../decisions/0012-agentes-pushean-documentacion-al-handbook.md)). No PR needed for docs.

## Things you should NOT do

- Put platform knowledge in your per-instance memory (Layer 1) — it dies with you.
- Create files in random places — follow the structure.
- Edit ADRs after they're merged — write a new ADR that supersedes.
- Create sprint summaries in `docs/sprints/` while the sprint is in flight — that's what the code-repo `*-HANDOFF.md` is for.
