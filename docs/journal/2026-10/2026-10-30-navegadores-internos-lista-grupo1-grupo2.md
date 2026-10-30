## Navegadores internos añadidos a la lista del colector (`internal_browsers`) — Miguel

- Quién: Miguel, a pedido de claude en el handoff (30/10, URGENTE, relay directo de Angelo:
  «pídeselo a Miguel ya»). No es un borrado: se deshace con `DELETE /v1/internal/internal-browsers`.
- Dónde: colector de analytics de producción (VM `82.70.54.151`), endpoint
  `POST /v1/internal/internal-browsers` (token full), tabla `internal_browsers` en ClickHouse
  (`claude_ro`, `vio_production`).
- Cuándo: 2026-10-30, ~17:30-17:40 CET (16:30-16:40 UTC)
- Para qué: que el dashboard de Commerce (Careless/Aller) deje de contar las pruebas internas y
  las de Replit como tráfico real.

## Grupo 1 — navegadores de prueba conocidos

Resueltos los 9 prefijos a id completo con `SELECT DISTINCT anon_id ... WHERE startsWith(anon_id, '<prefijo>')`:

- Encontrados y añadidos (3): `a-8d63c81e-55b2-4d3c-b0e1-5071a14efc67`,
  `a-72c342a7-c523-4664-b8c9-1409d18f6de9`, `a-fb176d5d-0d04-4131-8d3b-8984d64a0f24`.
  Los dos primeros son 2 de los 3 que se borraron el 29/10 (`delete-browsers`) y que volvieron a
  generar tráfico nuevo desde entonces — por eso reaparecen y hay que meterlos en la lista ahora
  en vez de volver a borrarlos.
- Sin eventos actuales, ninguno añadido (6): `a-617d26ae`, `a-7ab1f2e2`, `a-9ec5d4dc`, `a-d2ea7af4`,
  `a-2a42b0eb`, `a-497e65c0`. De estos, `a-9ec5d4dc` es el tercero de los borrados el 29/10 y no
  generó tráfico nuevo (correcto saltarlo, como decía el ticket). Los otros 5 (incluidos los de
  Michael y el segundo teléfono de Angelo) no tienen ninguna fila en `events` ni quitando el filtro
  de `client_app_id` — no hay nada que añadir para ellos, puede que el anon_id de esos navegadores
  haya rotado desde el 26/10.

`POST` con `note: "grupo1 pruebas internas Angelo/Michael/claude, 30/10"` → `{"added":3}`.

## Grupo 2 — navegadores de las páginas de prueba de Replit

Query: `anon_id` distintos con `domain(content_url) = 'mote-livsstil-hub-vio.replit.app'` desde
`2026-10-23`. Resultado: **20 navegadores** — por debajo del umbral de ~30 que pedía el ticket antes
de avisar. Comprobado también que ninguno de los 20 tiene visitas en `www.moteoglivsstil.no` (0
filas al cruzar los 20 ids contra ese dominio) — no pisan el artículo real, así que no se pierde
nada metiéndolos. No hizo falta escribir antes de actuar, los dos criterios de seguridad del ticket
quedaron dentro de rango.

`POST` con `note: "grupo2 pruebas replit mote-livsstil-hub-vio, 30/10"` → `{"added":20}`.

## Verificación final

- `GET /v1/internal/internal-browsers` (token full) → `count: 23` (3 + 20).
- Embudo de Careless (sponsor_id 1327, campaign_ids=2, 30/10 parcial hasta las 16:50 UTC):
  `clicked:2` ya coincide con el objetivo del ticket. El cierre del día completo lo comprueba claude,
  como pidió.

Avisado a claude en el handoff con el desglose de cada grupo.
