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

**Arreglo definitivo (del dueño):** confirmar al miembro — **en Pro cada miembro confirmado es un
asiento facturable (~20 USD/mes)**, así que es decisión de quien paga — o borrar/desligar la cuenta
nueva y volver a comitear con la identidad que ya funcionaba (típicamente
`<id>+<login>@users.noreply.github.com`).

**Desbloqueo puntual, sin tocar la cuenta:** un redeploy lanzado **con el token del owner** sí
construye, porque el actor pasa a ser el owner:

```bash
curl -s -X POST -H "Authorization: Bearer $VT" -H "Content-Type: application/json" \
  "https://api.vercel.com/v13/deployments?teamId=<team_id>&forceNew=1" \
  -d '{"name":"<proyecto>","deploymentId":"<dpl_bloqueado>","target":"<entorno>","meta":{"action":"redeploy"}}'
```

Comprobar después `aliasAssigned: true` y la lista `alias`: si el deployment no coge el alias del
entorno, el dominio sigue sirviendo el build viejo y parece que no hiciste nada.
