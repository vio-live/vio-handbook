---
title: "Lesson — drizzle-kit push is not a migration tool, don't run it in CMD/CI"
last-updated: 2026-08-24
owner: angelo
status: live
---

# `drizzle-kit push` is not a migration tool

Found and fixed in `vio-backend` 2026-08-24 — cost a live schema drift that
went unnoticed for ~2.5 months. Applies to any Drizzle project.

## What `push` actually does

`drizzle-kit push` introspects the **live** database, diffs it against the
**current** `shared/schema.ts`, and interactively generates + applies ad-hoc
`ALTER`/`CREATE` statements to reconcile the difference. It is a dev-loop
tool — the equivalent of Prisma's `db push` — for rapid local prototyping
before you've committed to a migration history.

**It does not read or apply the versioned files in `migrations/*.sql` at
all.** Those files, and `push`, are two unrelated mechanisms that happen to
share a config file (`drizzle.config.ts`).

## Why this is dangerous in a container CMD or CI step

1. **It's interactive.** Any "risky" change (e.g. adding a `UNIQUE`
   constraint to a populated table) stops and asks y/n on stdin. A container
   boot or CI job has no TTY to answer — it just hangs, or (depending on the
   exact prompt library behavior) silently proceeds down some default path
   without actually applying the change.
2. **It exits 0 on connection/auth failure**, at least in the version pinned
   here (`drizzle-kit@0.31.4`) — a broken `DATABASE_URL` doesn't fail the
   step, it just does nothing and reports success.
3. **It's non-deterministic across boots.** Since it diffs live-vs-schema.ts
   fresh every time, what it decides to apply (and in what order) isn't
   fixed by the migration files — two environments that started from
   different states can end up applying things differently, or not at all.

Combined with a container CMD like `push && start-server` (`&&` = keep going
regardless), the practical effect is: schema changes silently don't land,
the server starts anyway on the old schema, and nothing in the logs makes
this obvious unless someone reads the exact "Pulling schema..." lines.

## The concrete incident

`vio-backend`'s Dockerfile ran `npx drizzle-kit push && node dist/preserver.js`.
Migrations 0007-0010 (Firebase auth, tenancy, sponsor role, surface
platforms) were committed 2026-06-10 through 2026-08-20. **None of them ever
applied** to any of the three real environments (development/staging/production)
until this was found and fixed 2026-08-24. Verified staging was stuck mid-way
through 0007, hung on:

```
You're about to add users_firebase_uid_unique unique constraint to the
table, which contains 1 items. Do you want to truncate users table?
```

with no TTY to answer it, forever, on every single boot since.

**Bonus complication found in the same repo**: `migrations/meta/_journal.json`
(the file `drizzle-kit generate` normally maintains, listing every migration
file + timestamp) was itself stale — it only had entries for `0000`/`0001`
even though migration files existed up to `0010`. Any *real* migration
runner that trusts this journal (including drizzle-orm's own official
`migrate()` from `drizzle-orm/node-postgres/migrator`) would have silently
skipped every migration past 0001 too. The fix (`scripts/migrate.mjs`) reads
`*.sql` files directly from the `migrations/` directory by filename instead
of trusting the journal.

## The fix, in shape (adapt per project)

- Use a real migration runner in CMD/CI — `drizzle-kit migrate` (or your own
  script) — **never `push`** outside a human's local dev loop.
- Track applied migrations in your own table if you can't trust the
  project's `_journal.json` — verify it's actually current first.
- Make the runner fail the container boot / CI job hard on any error. No
  `&&`-chaining past a migration step without checking its actual exit
  status and log content.
- If a database already has drift from historical `push` usage (very likely
  if this lesson applies to you), baseline your tracking table for the
  migrations that are already live before switching over — don't try to
  reapply the whole history from scratch. And write the still-pending
  migrations idempotently (`IF NOT EXISTS` / `duplicate_object` guards),
  since you can't fully trust what partial state `push` left behind.

## See also

- [`handoff/2026-08-24-vio-backend-recovery.md`](../handoff/2026-08-24-vio-backend-recovery.md)
- PR [tipiodevelopment/vio-backend#52](https://github.com/tipiodevelopment/vio-backend/pull/52) — `scripts/migrate.mjs`
