---
date: 2026-11-09
session: Por qué el fallback por URL de #47 no rescata el pedido 4142 (el `content_id` trae la URL, no viene vacío)
participants: [angelo, claude, miguel]
status: live
---

## Qué se pidió

Angelo, por Discord: «hay algo para ti en handoff». El encargo de claude en el canal de coordinación
(`39c546d`, 10:38 CET) era desplegar `vio-analytics` `main` (`39c1edc`, PR #47) en staging y prod, con
una lectura de comprobación: `campaigns/4/content` del 5/11 debía quedar en **una** fila
(`content_id 192`, 8 pedidos, 2.946 NOK).

**El despliegue ya estaba hecho cuando llegué**: otra sesión mía lo hizo a las 09:55-09:57 UTC y dejó su
nota en el canal a las 11:01 (`88ddbaf`). Lo verifiqué por mi cuenta antes de dar nada por bueno (ver
abajo) y no repetí el despliegue. Esta entrada **no** duplica la suya: cierra la pregunta que dejó
abierta — *«no sé si el fallback por URL debería resolver a 192 o por qué no lo hace»*.

## Lo que verifiqué del despliegue (sin repetirlo)

- `/health` en las dos VMs: `version 39c1edc52189f5c50be370d613d9bfa684208a98`, `ready:true`,
  `clickhouse.lastError:null`.
- Árbol entero, no a medias (la trampa del 5/11): `src/` extraído 09:38, `dist/index.js` construido 09:57,
  proceso arrancado después. `.env` de prod con md5 `5d30e8166a6725047aace84f84acc2b0` — **el mismo** que
  dejó anotado el journal del 6/11, o sea intacto.
- Respaldos del árbol previo en su sitio: `/home/ubuntu/vio-analytics-backup-pre-39c1edc-*.tgz` en las dos.

## El resultado no es el esperado, y el motivo

`campaigns/4/content` del 5/11 sigue en **dos** filas: `192` → 7 pedidos / 2.220, y una huérfana cuyo
`content_id` es literalmente la URL → 1 pedido / 726 (el pedido **4142**). Mejoró — antes la segunda fila
eran 3 pedidos / kr 0 y había slots sin artículo, y eso sí lo arregló #47 — pero el pedido real no cae en
su artículo.

**La causa, leída en el código que corre** (`/opt/vio-analytics/src/stats-paid-orders.ts`, `sessionLinkSql`):

```sql
if(k.l_content_id != '', k.l_content_id, a.a_content_id) AS l_content_id
```

El fallback por URL sólo entra si `l_content_id` está **vacío**. Y el eco del 4142 no lo está: trae
`content_id = 'https://www.moteoglivsstil.no/skjonnhet/trender/16-skjonnhetsfavoritter-vi-ikke-far-nok-av'`
— la URL metida en el campo del id, porque la SDK lo dispara antes de que el host nombre el artículo.
Al no estar vacío, el `if` se lo queda y el `LEFT JOIN` de `articleIds` no se usa jamás.

**Los datos para resolverlo sí están.** Corrí a mano lo que haría el join:

```sql
SELECT session_id, argMin(content_id, ts)
FROM events FINAL
WHERE client_app_id=1 AND ts>='2026-11-04' AND ts<'2026-11-07'
  AND content_id!='' AND content_url!='' AND session_id='f5646557-…'
GROUP BY session_id, cutQueryStringAndFragment(content_url)
→ 192
```

Es decir: en cuanto el guarda deje pasar este caso, el 4142 cae en el 192 y la fila huérfana desaparece.

## Por qué el 4139 sí y el 4142 no

Completa el «checkout_id distinto» que anotó la otra sesión:

| pedido | checkout del `order_paid` | ¿`add_payment_info` con ese checkout? | evento de enlace que gana |
|---|---|---|---|
| 4139 | `5a1f0094-…` | **sí**, con `content_id 192` | el `add_payment_info` (`LINK_RANK` lo prefiere) |
| 4141 | `d9257c1b-…` | **sí**, con `content_id 192` | el `add_payment_info` |
| 4142 | `72d46429-…` | **no** (el de la sesión es de `d7b1df16-…`, otro checkout) | el eco, con la URL por id |

La causa primera es el `checkout_id` nuevo que genera la vuelta de Vipps en la segunda compra de la misma
sesión; el guarda del `!= ''` es el motivo de que el plan B no lo rescate.

## Escala

En los últimos 7 días sólo **4 eventos** traen la URL en `content_id`, frente a **8.064** con un id de
verdad. Es raro — pero cae justo en el camino de los pedidos, que es donde se nota.

## Propuesta dejada a claude (no toqué código)

Que el guarda trate como ausente un `content_id` que sea una URL, no sólo la cadena vacía
(`NOT startsWith(l_content_id, 'http')`, o comparar contra el propio `content_url`). Y el mismo filtro en
`articleIds`, que hoy sólo pide `content_id != ''`: un `argMin` cuyo evento más temprano fuese el eco
devolvería la URL otra vez. Aquí no pasa, pero es la misma trampa a un evento de distancia.

Es su código y el criterio de «qué cuenta como id ausente» es decisión suya.

## Controles (sin regresión)

- `campaigns/4/funnel` 5/11: 8 pedidos, 2.946 NOK, 403 sesiones — igual que antes.
- `stats/surface/overview?sponsor_id=1301&campaign_ids=4`: impresiones 3.231, 8 compras, 2.946.
- `commerce-stats/overview` (marca): views 3.231, clicks 69, netRevenue 2.946.
- `campaigns/4/slots`: 18 slots, **ninguno** sin artículo (antes dos).

## Lección

El fallback de un campo opcional tiene que decidir qué es «ausente» **en los datos reales**, no en el tipo:
aquí el campo nunca llega vacío, llega con un valor de relleno (la URL), y un guarda `!= ''` lo deja pasar
como si fuera bueno. Queda en
[lessons/campo-ausente-que-llega-con-valor-de-relleno.md](../../lessons/campo-ausente-que-llega-con-valor-de-relleno.md).
