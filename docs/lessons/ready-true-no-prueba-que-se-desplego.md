---
title: "ready:true no prueba que la version nueva este corriendo — mirar uptime"
last-updated: 2026-10-15
---

# `ready:true` no prueba que se desplego: mirar `uptime_s`

**Sintoma.** Se da un despliegue por hecho porque el health responde bien:
`{"status":"ok","ready":true,"clickhouse":{"lastError":null}}`. Todo verde.

**Causa real.** Un health sano solo dice que *algo* atiende y que sus dependencias responden.
No dice **que version** atiende. El 15/10, el colector de staging daba `ready:true` con
`uptime_s: 1337817` — **15,5 dias**, o sea el proceso del 29/09. El despliegue pedido esa manana
no se habia hecho, y el health no lo delataba.

**Como se comprueba.** Dos senales, ninguna de ellas el health a secas:

```bash
# desde fuera: el uptime tiene que ser de segundos tras un restart
curl -s https://events-staging.vio.live/health | grep -o '"uptime_s":[0-9]*'

# en la maquina: la hora en que arranco la unit
systemctl show vio-analytics -p ActiveEnterTimestamp
```

Si la unit arranco antes de que empezaras, no desplegaste. En `/opt/vio-analytics` **no hay `.git`**
(el codigo se copia desde fuera), asi que `git log` en la VM no sirve para saber el commit: la
referencia es la hora del arranque contra la hora del `scp`.

**Vale para cualquier servicio con env obligatoria.** Si la version nueva exige una variable que
el `.env` no tiene (aqui `CAMPAIGNS_URL`, `z.string().url()` sin default), el proceso viejo sigue
contestando `ready:true` tranquilamente mientras el nuevo nunca arranco. El health verde es
justo lo que tapa el fallo.

Relacionado: `feedback_blob_reciente_no_prueba_cron_vivo`, `el-log-viejo-no-prueba-el-estado-actual`.
