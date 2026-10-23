---
date: 2026-10-22
session: "Mixpanel para Aller: fuente del tráfico, identidad de usuario y los 4 boards"
participants: [angelo, claude]
status: live
---

# Mixpanel para Aller — agente de analytics

## Goal

Aller pidió entrar en Mixpanel a ver su data. Angelo aprobó **4 boards**, y por el camino preguntó
dos cosas que resultaron ser las importantes: si se trackea **de dónde viene el tráfico** (porque
Aller va a empujar tráfico al artículo) y por qué en Mixpanel **los eventos salen sueltos**.

## Done

- **Diseño de los 4 boards y la revisión completa**:
  [`docs/handoff/2026-10-22-mixpanel-boards-para-aller.md`](../../handoff/2026-10-22-mixpanel-boards-para-aller.md).
- **La fuente del tráfico ya viaja a Mixpanel** — vio-analytics#29. Estaba hecho de punta a punta
  menos el último salto: el SDK recuerda el aterrizaje de la sesión (`client-context.ts`, con el
  auto-referral descartado), el contrato acepta `referrer`/`utm_*`, ClickHouse tiene las columnas, las
  lecturas clasifican `utm > referrer > directo` y el dashboard lo enseña (`entry.jsx`) — pero
  `toMixpanelRow` **no copiaba el bloque `client`**. Ahora van `$referring_domain` y los `utm_*`; del
  referrer **solo el host** (la url entera se queda en ClickHouse: un tercero se lleva la dimensión,
  no la página), y un referrer del propio sitio no cuenta como fuente, igual que en `entrySql`.
- **Identidad de usuario y marca de los eventos de servidor** — vio-analytics#30. `is_server: true`
  siempre, y `$device_id`/`$user_id` detrás de `MIXPANEL_IDENTITY` (`off` por defecto).
- **Desplegado en las dos VMs por Miguel** (`c2fc1614`), ver su journal
  [`2026-10-22-colector-c2fc1614-mixpanel-fuente-y-is-server.md`](2026-10-22-colector-c2fc1614-mixpanel-fuente-y-is-server.md).
  Verificado también desde mi lado: staging con `uptime_s` bajo e ingiriendo y reenviando con
  `lastError: null`; prod sano y en `inserted: 0` por falta de tráfico.

## Hallazgos

- **En Mixpanel no hay perfiles de usuario, y no es un ajuste: nunca se construyeron.** El sink llama
  solo a `/import` (eventos), **nunca a `/engage`** (perfiles). Encima, la misma persona antes y
  después del login eran dos `distinct_id` sin unir, y todos los eventos de servidor de una surface
  comparten un `distinct_id` falso (`server:<app>`) que distorsiona cualquier cuenta de usuarios.
  Sin consentimiento, además, el `anon_id` vive solo en memoria y cada carga de página es un anónimo
  nuevo — eso es decisión de privacidad, no fallo.
- **El MCP de Mixpanel no conecta por una causa concreta**: `.mcp.json` tenía un header
  `Authorization` fijo, y el MCP oficial va por **OAuth** — tener ese header puesto **desactiva** el
  OAuth. Arreglo = borrar el bloque `headers`, firmar con `/mcp`, y un admin habilita MCP en la org.
  **No lo puedo editar yo** (el clasificador lo bloquea como automodificación). Con él conectado los
  boards se pueden *crear* desde aquí (`Create-Dashboard`).
- **Dentro de un proyecto de Mixpanel no hay aislamiento entre clientes**: todas las surfaces caen en
  uno, separadas solo por `client_app_id`, y un Consumer puede crear reports sobre todo. Dar acceso a
  Aller es darle la data de los demás. Recomendación: enseñarles el dashboard de Vio, que ya aísla.
- **Yo le pasé a Miguel una receta de deploy equivocada** (`git pull` en `/opt/vio-analytics`): la
  copié del playbook, que lo decía, sin comprobar que en las VMs no hay clon de git. Él lo detectó
  antes de tocar nada y desplegó por tarball, como siempre se hizo. Playbook corregido (`975a03a`).

## La ventana que se cierra el lunes

`MIXPANEL_IDENTITY=simplified` conviene **antes** del go-live del 26/10, no después. Si se enciende
cuando prod ya tiene eventos reales, el `distinct_id` canónico de los anónimos que ya entraron pasa a
`$device:<anon>` y **la historia de esos navegadores se parte** justo en la data de Aller. Hoy prod
está en `inserted: 0`: encenderlo ahora no parte nada. Si el proyecto usara el ID Merge original, las
propiedades simplemente se ignoran — o sea que el movimiento no tiene riesgo en ninguno de los dos
casos, y sí lo tiene esperar.

## La bandera pasa a estar encendida por defecto (mismo día, decisión de Angelo)

«Quiero hacerlo ya, nada de antes del lunes.» Hecho en
[vio-analytics#31](https://github.com/vio-live/vio-analytics/pull/31), `main` `76859ab`:
`MIXPANEL_IDENTITY` por defecto `simplified`. La decisión vive ahora en el código y no en una variable
que alguien tenga que acordarse de añadir en cada entorno nuevo — que es justo el fallo que deja los
eventos sueltos para siempre. `off` queda como freno de mano, sin redesplegar.

Tres tests de configuración, y uno por lo que más duele: un valor mal escrito (`MIXPANEL_IDENTITI=…`)
**revienta al arrancar** en vez de caerse a `off` en silencio, que nadie notaría hasta mirar los
perfiles meses después.

**Lo que falta son 30 segundos que no son míos**: no tengo SSH a las VMs de Oracle (el clasificador
bloquea incluso sondear si lo tengo). Dos caminos, los dos de Miguel:

1. **Sin deploy, funciona con el binario que ya está puesto (`c2fc1614`)**: añadir
   `MIXPANEL_IDENTITY=simplified` al `.env` de las dos VMs + `systemctl restart vio-analytics`.
2. **Con deploy**: desplegar `main` `76859ab`, que ya lo trae por defecto y no toca ningún `.env`.

## Next

- **Angelo**: el `.mcp.json`; y decidir si Aller entra al proyecto de Mixpanel o se queda con el
  dashboard de Vio. El paso 2 del perfilado (`/engage`, perfiles de verdad con país, idioma,
  dispositivo y primera visita, sin datos personales) necesita su decisión escrita.
- **Miguel**: encender la identidad **ya** (una de las dos vías de arriba); y confirmar que staging y prod **no comparten proyecto** de Mixpanel (si lo comparten, los
  eventos de prueba de QA están mezclados con lo que vería un cliente).
- **Yo, en cuanto conecte el MCP**: mirar qué hay en el proyecto (versión del ID Merge incluida) y
  montar los 4 boards sobre staging para que Angelo los corrija antes de que haya data real.

## Cierre (23/10 11:53 UTC): identidad encendida en las dos y `/health` que se explica solo

Tres cosas que salieron de la misma raíz y acabaron juntas:

- **vio-analytics#31** (`main` `76859ab`): `MIXPANEL_IDENTITY` pasa a `simplified` **por defecto**.
  Angelo: «quiero hacerlo ya, nada de antes del lunes». La decisión vive en el código, no en una
  variable que alguien tenga que acordarse de añadir en cada entorno nuevo.
- **vio-analytics#32** (`main` `82c4af0`): `/health` expone `version` (el commit, sustituido por
  `git archive` en el tarball vía `export-subst` — cero pasos extra para quien despliega) y
  `sinks.<vendor>.mode` (en Mixpanel, la identidad).
- **Desplegado por Miguel en las dos VMs** y verificado desde fuera: staging con `version`
  `82c4af0f1ac5…`, `identity: simplified` y **prueba funcional** (1 evento entrado → 1 reenviado a
  Mixpanel, `lastError: null`); prod igual, sin tráfico desde el arranque.

**La lección, que es la que me costó tres rondas:** ayer afirmé que el `.env` estaba puesto y la
bandera activa porque Miguel lo dijo dos veces, y no lo estaba — lo que faltaba era el reinicio, y la
configuración se lee solo al arrancar. Lo que lo detectó fue aritmética de `uptime_s` (tres medidas
apuntando al mismo arranque), y lo que lo hizo innecesario fue **exponer el dato en vez de deducirlo**.
Cuando verificar algo exige entrar en una máquina, la verificación no se hace: se supone. Ahora es un
`curl`:

```bash
curl -s https://events.vio.live/health | jq '{version, identity: .sinks.mixpanel.mode, uptime_s}'
```
