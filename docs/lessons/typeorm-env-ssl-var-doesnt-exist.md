---
title: "Lesson — TYPEORM_SSL isn't a real env var in typeorm 0.2.x"
last-updated: 2026-09-03
owner: miguel
status: live
---

# `TYPEORM_SSL` isn't a real env var in typeorm 0.2.x

Found in `package-database` 2026-09-03 while syncing staging migrations.

## Symptom

Connecting to Azure MySQL Flexible Server with the exact `.env` the repo's own `.env.migrations.example` tells you to use fails:

```
Error: Connections using insecure transport are prohibited while --require_secure_transport=ON.
```

Even though the `.env` has:
```
TYPEORM_SSL={"rejectUnauthorized":false}
```

## Root cause

TypeORM's env-based config reader (`ConnectionOptionsEnvReader`, used by `getConnectionOptions()`) does not parse `TYPEORM_SSL` at all in this version (`typeorm@0.2.41`). It only JSON-parses `TYPEORM_DRIVER_EXTRA` (and a couple of other specific keys like `TYPEORM_CACHE_OPTIONS`). `TYPEORM_SSL` is silently ignored — the connection goes out with no SSL negotiated, which Azure rejects.

The MySQL driver builds its connection options as `{ ssl: options.ssl, ...extra }`, with `extra` spread last (highest precedence) — so anything under `TYPEORM_DRIVER_EXTRA` wins.

## The fix

Use `TYPEORM_DRIVER_EXTRA`, not `TYPEORM_SSL`:
```
TYPEORM_DRIVER_EXTRA={"ssl":{"rejectUnauthorized":false}}
```

Fixed in `package-database` PR #5 (`.env.migrations.example`).

## See also

- [Playbook: Migraciones de DB — Vio Commerce](../playbooks/commerce-db-migrations.md)
- [Journal 2026-09-03](../journal/2026-09/2026-09-03-migraciones-staging-outshifter.md)
