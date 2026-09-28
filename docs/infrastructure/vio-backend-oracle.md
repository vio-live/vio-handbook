---
title: "Vio Backend en Oracle Cloud Always Free"
last-updated: 2026-09-28
owner: miguel
status: live
---

# Vio Backend en Oracle Cloud Always Free

Reemplaza el entorno `rg-api-vio-production` de Azure, desmantelado el 2026-09-25.
Costo: **0 USD/mes** (Always Free), contra los ~49 USD/mes que costaba en Azure.

## La máquina

| | |
|---|---|
| Tenancy / región | `vio-backend` / `eu-stockholm-1` (home region) |
| Instancia | `vio-backend-amd`, shape `VM.Standard.E2.1.Micro` |
| IP pública | `82.70.54.151` |
| SO | Ubuntu 24.04.5 LTS x86_64 |
| CPU / RAM / disco | AMD EPYC 7551, 2 vCPU burst (1/8 OCPU), 954 MB, 48 GB |
| Swap | 2 GB en `/swapfile`, `vm.swappiness=10` |
| SSH | `ssh -i ~/.ssh/vio_oracle ubuntu@82.70.54.151` |

**Por qué AMD y no ARM:** el shape ARM `VM.Standard.A1.Flex` (4 OCPU / 24 GB, también
Always Free) **no tiene capacidad** en Estocolmo — 288 intentos entre el 26 y el 28/09, cero
éxitos, 145 de ellos `Out of host capacity`. La quota estaba bien (`standard-a1-core-count` = 41):
falta host físico. Always Free sólo se crea en la home region de la tenancy, así que cambiar
de región no es opción. `E2.1.Micro` es el otro pool del Always Free y entró al primer intento.
El cron `oracle-arm-capacity-retry` sigue corriendo como camino de mejora.

## Dominios

`api.vio.live` y `events.vio.live` — registros **A** en Cloudflare apuntando a `82.70.54.151`,
TTL 300, **DNS-only (sin proxy naranja)**. Sin proxy porque el certificado lo emite Let's Encrypt
en la propia máquina y así el WebSocket va directo, sin el timeout del edge de Cloudflare.

TLS: Let's Encrypt vía `certbot --nginx`, ambos dominios en un solo certificado, renovación
automática por `certbot.timer` (probada con `--dry-run`). Redirect 80 -> 443 activo.

## Software

- **nginx** como reverse proxy a `127.0.0.1:5000`. La config de WebSocket es lo importante:
  `proxy_http_version 1.1` + el `map $http_upgrade $connection_upgrade` + `proxy_read_timeout 3600s`
  y `proxy_buffering off`. Sin eso las conexiones por campaña se cortan.
- **Node 22** (NodeSource). App en `/opt/vio-backend`, build con `npm run build`
  (vite + esbuild), arranque `node dist/preserver.js`.
- **systemd** `vio-backend.service`: `Restart=always`, `RestartSec=5`,
  `NODE_OPTIONS=--max-old-space-size=512`, env desde `/opt/vio-backend/.env` (modo 600).
- **PostgreSQL 16.15** local, la misma versión del dump. Base `socket_server`, rol `vio`.
  Tuning para 954 MB: `shared_buffers=128MB`, `effective_cache_size=384MB`, `work_mem=4MB`,
  `maintenance_work_mem=32MB`, `max_connections=40`.

## Firewall: son DOS capas

Esto es lo que más cuesta la primera vez. Hay que abrir las dos:

1. **Security list de la VCN** (lado Oracle) — ya tenía 22/80/443 desde 0.0.0.0/0.
2. **iptables del host** — las imágenes Ubuntu de Oracle traen una regla
   `REJECT ... icmp-host-prohibited` al final de `INPUT` y **sólo el 22 abierto**. Hay que
   insertar los ACCEPT de 80/443 *antes* de ese REJECT y persistir con `netfilter-persistent`.

Con el security list abierto pero iptables cerrado, el síntoma es un `curl` que devuelve 000
sin más pistas.

## Consumo real

Con el servicio corriendo: **408 MB de 954 usados**, Node con RSS de ~128 MB, swap sin tocar.
La preocupación por el 1 GB resultó infundada para esta carga. La base es diminuta
(38 tablas, ~600 filas). Queda libre la **segunda instancia `E2.1.Micro`** del Always Free
si alguna vez hace falta separar Postgres.

## Restauración de la base

Dump del 2026-09-25 (`socket_server.sql.gz`, 44 KB) restaurado y verificado: 38 tablas,
users 12, broadcasts 18, polls 39, chat_messages 37, cart_intents 85,
shoppable_ad_activations 107 — coincide exactamente con los conteos verificados antes de
desmantelar Azure.

Dos cosas que hubo que arreglar:

1. **La versión de Postgres importa.** El dump es de `pg_dump` 16 y no restaura en 17
   (`SET transaction_timeout` no existe en 16). Ubuntu 24.04 trae 16.15, la misma del origen.
2. **Ownership.** Restaurar con `sudo -u postgres psql` deja las tablas con dueño `postgres`,
   y `scripts/migrate.mjs` falla con `must be owner of table sponsors`. Hay que reasignar
   tablas, secuencias, tipos enum y el schema al rol de la app.

Migraciones: se aplicó `0011_sponsor_commerce_user_uid` (el esquema de prod estaba una
migración atrás del código). Con esa pendiente, el scheduler tiraba
`column sponsors.commerce_user_uid does not exist` en loop, aunque el server levantaba igual.

## Verificado

- `https://api.vio.live/health` y `https://events.vio.live/health` -> 200
- Redirect HTTP -> HTTPS (301), certificado válido hasta 2026-12-27
- **WebSocket sobre TLS**: `wss://events.vio.live/ws/1` conecta, el server loguea
  `Client connected to campaign 1`, y la conexión se sostiene 25 s sin cortes. El routing por
  campaña desde el path funciona.
- **Reinicio completo probado**: tras `systemctl reboot`, los tres servicios levantan solos,
  el swap se remonta, las reglas de iptables persisten y todos los endpoints vuelven a 200.

## Gotcha: las VITE_* son de build, no de runtime

Vite **incrusta** las variables con prefijo `VITE_` en el bundle del cliente al compilar.
Ponerlas en el `.env` que lee systemd no sirve de nada: hay que tenerlas presentes **antes**
de `npm run build`. Si faltan, la app levanta bien y el server responde 200, pero la pantalla
de login muestra *"Missing client config. Set VITE_FIREBASE_API_KEY..."*.

En el pipeline de Azure iban como `build-args` del Dockerfile desde secrets de GitHub
(`FIREBASE_WEB_API_KEY_PROD`, `FIREBASE_WEB_AUTH_DOMAIN_PROD`). Acá van en
`/opt/vio-backend/.env`, que funciona para las dos cosas porque `vite.config.ts` define
`envDir` como la raíz del repo — el mismo archivo que usa systemd.

    VITE_FIREBASE_API_KEY=AIza...        # config web, publica (viaja en el bundle)
    VITE_FIREBASE_AUTH_DOMAIN=reachu-prod.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=reachu-prod

**Tras cambiarlas hay que reconstruir**, no sólo reiniciar. Para verificar que quedaron dentro:

    curl -s https://api.vio.live/ | grep -oE '/assets/index-[^"]+\.js'
    curl -s "https://api.vio.live<ese-asset>" | grep -oE 'AIza[A-Za-z0-9_-]{30,40}'

## Firebase: dominios autorizados

`api.vio.live` **no está** en los dominios autorizados de `reachu-prod`. La lista hoy es
`localhost`, `reachu-prod.firebaseapp.com`, `reachu-prod.web.app`, `reachu.io`, `test.reachu.io`
— desactualizada, sin ningún dominio `vio.live`. Se consulta sin credenciales:

    curl -s "https://identitytoolkit.googleapis.com/v1/projects?key=<VITE_FIREBASE_API_KEY>"

Consecuencia concreta:

- **Login con email/password: funciona.** Ese flujo no valida el dominio.
- **Login con Google (`signInWithPopup`): falla** con `auth/unauthorized-domain` hasta que
  alguien agregue `api.vio.live` en Firebase console -> Authentication -> Settings ->
  Authorized domains. Requiere acceso al proyecto `reachu-prod`.

## Pendientes conocidos

- **Firebase**: la service account de `reachu-prod` se perdió al borrar el RG de Azure y hay
  que regenerarla en la consola de Firebase. **No bloquea**: la verificación de tokens sólo
  necesita `FIREBASE_PROJECT_ID`, que está configurado. Falta sólo para operaciones del Admin SDK.
- **Analytics**: `ANALYTICS_EVENTS_URL` quedó sin setear — el Container App de analytics de prod
  se borró con el RG. Decidir si se rehospeda o si Mixpanel alcanza.
- **`api.vio.live` en los dominios autorizados de Firebase** (ver arriba): sin eso el login con Google no anda. Requiere consola de Firebase.
- **Backups de la base**: hoy no hay ninguno automatizado en esta máquina. Es lo próximo.
- **Sin proxy de Cloudflare**: la IP de origen queda expuesta. Si se quiere el naranja, hay que
  pasar a modo Full (strict) y verificar que el WebSocket siga estable.
