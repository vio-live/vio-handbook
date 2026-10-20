---
title: "«Deployment was blocked» en Vercel: casi siempre es membresía del team, no cuota"
last-updated: 2026-10-20
author: miguel
---

## Síntoma

GitHub marca el deploy con el estado literal **«Deployment was blocked»** y en Vercel el
deployment queda en `BLOCKED` con `buildSkipped: true`. El build nunca arranca, así que no hay log
que leer. El deploy anterior del mismo repo, la misma rama y el mismo autor había pasado.

## Causa real

En plan **Pro**, Vercel exige que **el autor del commit sea miembro del team** que contiene el
proyecto. Lo que lo disparó el 20/10 en `vio-commerce-webapp` / team `tipio-2`: alguien se creó una
cuenta de Vercel nueva ligada al **mismo login de GitHub** con el que se comitea, pidió acceso al
team y **se quedó sin confirmar**. Desde ese momento Vercel sí puede resolver al autor del commit
→ lo resuelve a ese usuario no confirmado → bloquea. Antes de que la cuenta existiera no había nada
que resolver y el deploy pasaba.

El dato que lo distingue de una cuota está en el propio deployment:

```bash
curl -s -H "Authorization: Bearer $VT" \
  "https://api.vercel.com/v13/deployments/<dpl_id>?teamId=<team_id>" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["readyState"], d.get("errorLink"))'
# BLOCKED https://vercel.com/docs/deployments/troubleshoot-project-collaboration#team-configuration
```

Ese `errorLink` **es el diagnóstico**: apunta a colaboración/membresía. Si fuese cuota o spend
limit, el team saldría con `blocked`/`softBlock` distintos de `null`.

## Cómo comprobarlo y arreglarlo

```bash
# 1) ¿El team está bloqueado o es Hobby? (descarta cuota/plan)
curl -s -H "Authorization: Bearer $VT" "https://api.vercel.com/v2/teams/<team_id>" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["billing"]["plan"], d["billing"]["status"], d["blocked"], d["softBlock"])'

# 2) ¿Hay un miembro sin confirmar con el login de git del autor?
curl -s -H "Authorization: Bearer $VT" "https://api.vercel.com/v2/teams/<team_id>/members?limit=20" \
  | python3 -c 'import json,sys
for m in json.load(sys.stdin)["members"]: print(m["username"], m["email"], m["role"], m["confirmed"], m.get("joinedFrom"))'
# confirmed: false + joinedFrom.origin: "nsnb-request-access" => esto es
```

**Comprobar la fecha del miembro, no solo su estado.** El `createdAt` del miembro es lo que fecha el
corte: el 20/10 el registro se creó a las 10:15:26Z y el primer BLOCKED fue a las 10:15. Si el
`createdAt` cae en el mismo minuto que el primer bloqueo, la causa está cerrada; si es viejo, busca
otra cosa. Contra la tentación de leerlo como «perdimos un acceso que teníamos»: es lo contrario,
**el acceso se pidió y quedó a medias**, y mientras no existía el usuario los mismos commits pasaban.

**Y mirar el coste antes de tocar nada:**

```bash
curl -s -H "Authorization: Bearer $VT" "https://api.vercel.com/v2/teams/<team_id>" \
  | python3 -c 'import json,sys; b=json.load(sys.stdin)["billing"]; print(b["invoiceItems"]["teamSeats"])'
# {"price": 2000, "quantity": 2, "highestQuantity": 1, ...}
# quantity > highestQuantity => el asiento de más es de este periodo, o sea recién añadido
```

**Arreglo definitivo (del dueño):** confirmar al miembro — **en Pro cada miembro confirmado es un
asiento facturable (~20 USD/mes)**, así que es decisión de quien paga — o borrar/desligar la cuenta
nueva y volver a comitear con la identidad que ya funcionaba (típicamente
`<id>+<login>@users.noreply.github.com`).

**Desbloqueo con el token del owner — OJO, NO es inocuo:** un redeploy lanzado con el token del
owner sí construye, porque el actor pasa a ser el owner. Pero en el caso del 20/10 **ese redeploy
confirmó la membresía pendiente**: el miembro pasó a `confirmed: true` y su `joinedFrom.origin` de
`nsnb-request-access` a **`nsnb-redeploy`**. Efecto colateral: **un asiento Pro facturable más**
(`teamSeats.quantity` 1 → 2, 20 → 40 USD/mes). Así que esto **no es un parche temporal mientras el
dueño decide: decide por él**. Si el objetivo era no pagar el asiento, hay que borrar/desligar la
cuenta primero y desbloquear después, no al revés.

```bash
curl -s -X POST -H "Authorization: Bearer $VT" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments?teamId=<team_id>&forceNew=1" \
  -d '{"name":"<proyecto>","deploymentId":"<dpl_bloqueado>","target":"<entorno>","meta":{"action":"redeploy"}}'
```

Comprobar después `aliasAssigned: true` y la lista `alias`: si el deployment no coge el alias del
entorno, el dominio sigue sirviendo el build viejo y parece que no hiciste nada.

## Cierre 20/10 18:30 UTC: el asiento se quitó y los deploys siguen pasando

Angelo pidió arreglarlo del todo. **Quitado el miembro `angelosv`** (uid `aVop9fC5tky0dPhHxtF5qoXH`,
`DELETE /v1/teams/<team>/members/<uid>` → 200).

Lo que lo hacía seguro, medido antes de borrar:
- **Los deploys no los dispara ese miembro.** Los 40 últimos tienen `creator: vio-live`
  (`angelo@reachu.io`, el owner): es la integración de GitHub instalada por el owner la que
  despliega, y el miembro solo servía para resolver el **autor del commit**.
- **51 deploys del webapp entre el 13 y el 19/10 salieron READY** con commits de autor `angelosv`
  y **sin** ese miembro en el team. Los 5 BLOCKED aparecen exactamente el 20/10, cuando el miembro
  se creó sin confirmar. O sea: el miembro era la causa, no el remedio.

Después de quitarlo:
- `teamSeats` vuelve a **quantity 1 y highestQuantity 1** (Vercel factura por el máximo del periodo,
  así que este periodo no cobra el segundo asiento): **40 → 20 USD/mes**.
- **Redeploy de comprobación** del mismo commit de `develop`
  (`dpl_H4XM1ZrtoFaFgPN4BdzELoAR7U8j`): `INITIALIZING` → `BUILDING` → **READY** en ~1m20s.
  No vuelve a salir BLOCKED sin el asiento.
- `alanvsimpson` **sigue en el team**: no toqué su acceso, eso es decisión de Angelo.

**Ojo para el futuro:** si alguien vuelve a pulsar "request access" en la UI de Vercel con una cuenta
que no es la del owner, se crea el miembro otra vez, los deploys de ese autor salen BLOCKED hasta
confirmarlo y el asiento vuelve a costar 20 USD. Para mirar el dashboard, entrar con la cuenta
**owner** (`angelo@reachu.io`), no con `angelo.sv@iqplus.no`.
