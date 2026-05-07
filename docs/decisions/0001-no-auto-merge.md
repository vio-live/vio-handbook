---
title: "ADR-0001: No auto-merge"
last-updated: 2026-05-07
owner: angelo
status: live
---

# ADR-0001: No auto-merge

## Context

The team uses both human and AI pair programming. AI agents can open PRs autonomously and could, in principle, merge them too. We had to decide whether to allow that.

## Decision

**No auto-merge.** PRs are opened by anyone (human or AI), but merged only by a human via the GitHub UI.

## Rationale

- **Review is the only checkpoint that catches "wrong thing built right".** CI catches "right thing built wrong". Without a human review, an AI confidently shipping the wrong design hits production unimpeded.
- **History matters.** A human-merged PR has an explicit "I read this and approved it" signal. Auto-merged PRs don't.
- **Recovery is easier.** When something goes wrong, the question "who decided to ship this?" has an answer.

## Consequences

- AI agents must always stop after `git push -u origin <branch>` + opening the PR. They report the PR URL and wait.
- For trivial doc-only changes the friction is real but acceptable.
- If volume grows past one human reviewing all PRs, this ADR is the first thing to revisit (with a new ADR proposing a path — e.g. auto-merge for `docs/*` paths only after CI green).

## Alternatives considered

- **Auto-merge for docs only**: rejected for now because docs *are* the spec. Drift from a wrong-direction docs change is just as bad as a code change.
- **Auto-merge after CI green**: rejected because CI doesn't gate semantic correctness.

## References

- Operating rule #1 in [`onboarding/humans.md`](../onboarding/humans.md) and [`onboarding/agents.md`](../onboarding/agents.md).
