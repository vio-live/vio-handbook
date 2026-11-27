---
date: 2026-11-27
session: Informe diario de Boots — el primer envío del servidor cayó en spam
participants: [angelo, claude]
status: live
---

# 27/11: «no llegó el reporte de Boots» — llegó, pero a spam

## Goal
Angelo no recibió el informe diario de Boots (dag 2, 26/11), el primero que manda solo el servidor
(campaigns en prod, CronJob `campaigns-report-daily`, 06:00 UTC). Averiguar por qué.

## Done
- **El servidor lo mandó.** Job `campaigns-report-daily-29929320` completado a las 06:00 UTC:
  `{"checked":1,"sent":1,"skipped":0,"failed":0}`; log de campaigns: «campaign 8: report for 2026-11-26 sent to 2 + 0 cc».
- **Azure lo entregó.** Métrica `DeliveryStatusUpdate` del recurso `vio-communication` (`rg-vio-shared`): 2 «Delivered»
  en la hora de las 06:00 UTC, ningún rebote.
- **Gmail lo metió en spam.** En el buzón de Angelo (tipio.no, Google Workspace) está en «Søppelpost», recibido a las
  07:00:11 de Oslo, remitente `Vio <DoNotReply@<guid>.eu1.azurecomm.net>`, asunto «Boots × Mote Livsstil Hub – daglig
  rapport dag 2 (26.11.2026)», con el PDF adjunto. El de Michael no se ha visto; lo esperable es que esté igual.
- **Las cifras del PDF son correctas** (6 besøk, 24 visninger, 4 klikk, 2 handlekurv, 1 til kassen, 0 kjøp): coinciden con
  `pdf.py --campaign boots 2026-11-26` y con ClickHouse (6 navegadores reales; otros 22 eran visitas de prueba).
- PDF entregado a Angelo en el chat.

## Decisions
- Ninguna tomada. Propuesto a Angelo: mandar desde un dominio propio verificado en ACS (subdominio de `vio.live` con
  SPF y DKIM) en vez del dominio gestionado `azurecomm.net`, que es el de pruebas de Azure. Requiere DNS y cambiar el
  remitente en el `.env` de campaigns en prod: con su OK.

## Blockers / open questions
- «sent» en campaigns significa «ACS lo aceptó» (202); el servidor no consulta el estado de entrega y no puede saber
  si cae en spam. El dashboard dirá «Sist sendt» igualmente.
- El título sigue saliendo «Boots i Mote Livsstil Hub» (nombre de la surface 1 en Commerce); la decisión de renombrarla
  quedó pendiente el 26/11.
- En el PDF, «Visninger» (sección 3) cuenta bloques vistos (`component_impression`, 24) y la tabla por producto cuenta
  cada producto del bloque (suma 60); la nota al pie dice «produktkort sett». Etiquetas por alinear.
- **Corrección a las cifras del embudo del 26/11** (`2026-11-26-aller-500k-eksponeringer-embudo.md`): aquellas consultas
  solo quitaban la lista `internal_browsers`, no los eventos con `internal = 1` (visitas con `?vio_internal=1`). Con los
  dos filtros, el 25/11 queda en 907 vieron productos → 128 abrieron un producto → 11 al carrito → 11 a la kasse → 2
  compras (antes: 922 / 132 / 12 / 12 / 2). Las conclusiones no cambian. Para contar lectores reales en ClickHouse:
  `internal = 0 AND anon_id NOT IN (SELECT anon_id FROM vio_production.internal_browsers FINAL WHERE active = 1)`.

## Next session
- Con el OK de Angelo: dominio propio en ACS y remitente nuevo en prod; comprobar el envío del día siguiente en la
  bandeja de entrada.
