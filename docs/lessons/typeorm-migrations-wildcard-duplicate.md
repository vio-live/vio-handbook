---
title: "Lesson — never run migration:execute without DB_MIGRATION_FILE in package-database"
last-updated: 2026-09-03
owner: miguel
status: live
---

# Never run `migration:execute` without `DB_MIGRATION_FILE` in `package-database`

Found 2026-09-03 while syncing staging migrations.

## Symptom

Running the "obvious" command to apply everything pending:
```
yarn migration:execute
```
(no `DB_MIGRATION_FILE` set) fails immediately with:
```
Error: Duplicate migrations: InitialSchema1628474597284, RemoveMangopay1630077596132, ...
```
listing the same ~10 migration names, even on a fresh connection.

## Root cause

`src/migrations/index.ts` is a stale barrel file that manually re-exports only the first 10 migrations (from 2021-2022) and was never updated since. `connect.ts`'s default migrations glob (`src/migrations/*{.ts,.js}`) matches this file too, alongside every individual migration file — so those 10 classes get imported twice (once directly, once re-exported through `index.ts`), and TypeORM's duplicate-name check trips.

This file is *not* dead code, though — `src/index.ts` and `src/utils/index.ts` import `* as Migration from './migrations'`, i.e. this barrel is part of the package's public API (`@vio-/database`'s exported `Migration` namespace, consumed by `getMigrations()` in `utils/index.ts`). It can't just be deleted without checking who relies on that export.

## The fix

Always target one migration file explicitly:
```bash
DB_MIGRATION_FILE=<archivo>.ts yarn migration:execute
```

This bypasses the wildcard entirely (`connect.ts` uses `${baseDir}/migrations/${DB_MIGRATION_FILE}` instead of the glob when the env var is set), so `index.ts` is never touched.

Fixing `index.ts` itself (updating or removing the stale re-exports without breaking the public `Migration` API) is still open — deliberately left out of PR #5 as a separate, riskier change.

## See also

- [Playbook: Migraciones de DB — Vio Commerce](../playbooks/commerce-db-migrations.md)
- [Journal 2026-09-03](../journal/2026-09/2026-09-03-migraciones-staging-outshifter.md)
