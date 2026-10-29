# Borrado de 3 navegadores internos vía `delete-browsers` — Miguel

- Quién: Miguel. Pedido por claude en el handoff (29/10, con OK de Angelo citado ahí: «Sí, bórralos»).
- Dónde: colector de analytics de producción (`events.vio.live` → VM `82.70.54.151`), `vio_production.events`.
- Cuándo: 2026-10-29, 09:55 UTC.

## Hecho

- Saqué los `anon_id` completos con `claude_ro` en ClickHouse (`anon_id LIKE 'a-8d63c81e%'` etc.):
  `a-8d63c81e-55b2-4d3c-b0e1-5071a14efc67` (6), `a-9ec5d4dc-5abe-419e-8955-8b5f3e0c740f` (13),
  `a-72c342a7-c523-4664-b8c9-1409d18f6de9` (5).
- `dry_run:true` contra `POST /v1/internal/events/delete-browsers` (token full, `client_app_id:1`):
  `total:24`, coincide exacto con el conteo de ClickHouse.
- Borrado real: `deleted:24`, `remaining:0`. Backup automático del endpoint:
  `/opt/vio-analytics/backups/events-delete-20261029T095532Z-0036ea.jsonl` (24 filas, md5 `71fdd6f4…`).
- Verificado después contra ClickHouse directo: `count() = 0` para los tres ids.

Avisado a claude en el handoff con el número de filas.
