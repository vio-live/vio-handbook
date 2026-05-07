# Vio Engineering Handbook

> **Purpose**: cross-repo durable knowledge for Vio. The kind of context that doesn't fit in a single code repo because it spans the platform, evolves with team decisions, or needs to outlive any one branch.
>
> If you read only one doc to start, read this one — it tells you where everything else lives.

---

## What lives here vs in code repos

| Type of doc | Where it goes | Why |
|---|---|---|
| **API contracts, schema, runtime behaviour, SDK component reference, per-repo setup** | In the relevant code repo (`socket-server/docs/`, `VioSwiftSDK/Documentation/`, etc.) | Drift gate: docs PR'd alongside the code change. Single source of truth for *how the code behaves today*. |
| **Onboarding, architecture overview, decisions (ADRs), sprint history, lessons learned, playbooks, glossary, roadmap** | Here, in `vio-handbook` | Cross-repo, survives branch deletions, designed to outlive any single sprint. The *why* and the *historical narrative*. |

If you're tempted to put a "how does cart-intent work?" doc here — it goes in `socket-server/docs/`. If you're tempted to put "why we picked WebSockets over SSE" here — yes, that's an ADR.

---

## Structure

```
vio-handbook/
├── README.md                              ← you are here
├── docs/
│   ├── onboarding/
│   │   ├── humans.md                      ← day 1 for a new dev
│   │   └── agents.md                      ← day 1 for a new AI agent
│   ├── architecture/
│   │   └── system-overview.md             ← 3 repos + how they fit together
│   ├── decisions/                         ← ADRs (one file per decision)
│   │   └── NNNN-short-slug.md
│   ├── sprints/                           ← sprint summaries (closed)
│   │   └── YYYY-MM-name.md
│   ├── lessons/                           ← post-mortems, gotchas, "what we learned"
│   │   └── short-slug.md
│   ├── playbooks/                         ← operational how-to guides
│   │   └── short-slug.md
│   ├── glossary.md                        ← canonical terms
│   └── roadmap.md                         ← 6-12 month direction
└── meetings/                              ← optional: retros, decision logs
```

---

## Conventions

### Every file starts with frontmatter

```markdown
---
title: "Short title"
last-updated: 2026-05-07
owner: angelo
status: live | superseded | draft
---
```

### File naming

- ADRs: `NNNN-kebab-case-slug.md` (zero-padded, never reused)
- Sprints: `YYYY-MM-short-slug.md`
- Lessons / playbooks: `kebab-case.md`

### ADRs are immutable

Once an ADR is merged, its content does not change. If a decision is reversed or evolved, write a **new** ADR that "supersedes" the old one with explicit reasoning. The old ADR's status changes from `live` → `superseded` and gains a `superseded-by: NNNN` field.

### Sprint docs are written at sprint close

In-flight sprint state lives in the **code repo's branch** (e.g. `VioSwiftSDK/Q4-L4-HANDOFF.md` while the branch is open). When the sprint closes (merged or formally abandoned), the handoff doc is rewritten as a retrospective and moved to `docs/sprints/` here, then deleted from the code repo.

### Quarterly cleanup

Every 3 months, sweep `docs/` for files not touched in 6+ months. Either:
- Refresh `last-updated` if still accurate, or
- Add `status: superseded` and link to its replacement, or
- Move to `archive/` (create the dir on first use)

---

## Linking convention

- Within this repo → relative paths: `[ADR-0003](./docs/decisions/0003-no-fullscreencover-with-sheet-on-ios26.md)`
- To code → absolute GitHub URLs (so they survive when the branch moves): `https://github.com/vio-live/VioSwiftSDK/blob/develop/Sources/VioUI/...`
- To the live state in another repo → relative URL into the GitHub repo: `https://github.com/tipiodevelopment/socket-server/blob/develop/docs/CURRENT_STATE.md`

---

## Where to go from here

- **New dev?** → [`docs/onboarding/humans.md`](./docs/onboarding/humans.md)
- **New AI agent?** → [`docs/onboarding/agents.md`](./docs/onboarding/agents.md)
- **Want the architecture in one read?** → [`docs/architecture/system-overview.md`](./docs/architecture/system-overview.md)
- **Looking for the *why* behind a rule or pattern?** → [`docs/decisions/`](./docs/decisions/)
- **Hit a weird bug and want to know if we've seen it?** → [`docs/lessons/`](./docs/lessons/)
- **Need to do an op (add sponsor, debug Apple Pay, rotate keys)?** → [`docs/playbooks/`](./docs/playbooks/)
- **What does "client_app" mean?** → [`docs/glossary.md`](./docs/glossary.md)
