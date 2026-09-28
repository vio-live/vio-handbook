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

Consecuencia: el login con email/password funciona igual (ese flujo no valida dominio), pero
`signInWithPopup` con Google falla con `auth/unauthorized-domain`.

**RESUELTO el 2026-09-28.** `api.vio.live` y `events.vio.live` agregados, preservando los
cinco que ya estaban. No hizo falta la consola: la service account de `reachu-prod` que usa
Commerce (`base-api/.env` en el blob `env-file-microservices`) alcanza para leer y escribir la
config vía Identity Toolkit Admin API:

    GET/PATCH https://identitytoolkit.googleapis.com/admin/v2/projects/reachu-prod/config?updateMask=authorizedDomains

Se verifica sin credenciales con el endpoint público de arriba. Los dominios viejos
(`reachu.io`, `test.reachu.io`) se dejaron intactos a propósito: limpiarlos es otra decisión.

## Pendientes conocidos

- **Firebase Admin SDK**: el backend no tiene `FIREBASE_SERVICE_ACCOUNT_PATH`. **No bloquea el
  login**: verificar tokens sólo necesita `FIREBASE_PROJECT_ID`. Lo que queda degradado es la
  gestión de usuarios desde el panel — `listPendingSignups` devuelve `[]`, y crear o borrar
  usuarios no propaga a Firebase (el código lo contempla con `isFirebaseAdminEnabled()`, no rompe).

  Corrección a lo que creíamos: la service account **no se perdió**. Commerce tiene una del mismo
  proyecto `reachu-prod` en `base-api/.env` (blob `env-file-microservices`). Se podría reutilizar,
  pero implica que un compromiso del backend expone la credencial de Firebase de Commerce.
  **Decisión pendiente de Angelo**: reutilizarla o generar una nueva y dedicada.
- **Analytics**: `ANALYTICS_EVENTS_URL` quedó sin setear — el Container App de analytics de prod
  se borró con el RG. Decidir si se rehospeda o si Mixpanel alcanza.
- **Backups de la base**: hoy no hay ninguno automatizado en esta máquina. Es lo próximo.
- **Sin proxy de Cloudflare**: la IP de origen queda expuesta. Si se quiere el naranja, hay que
  pasar a modo Full (strict) y verificar que el WebSocket siga estable.

## Enmascarado de la API key en los logs de nginx

`/api/campaign/payments/apikey/<key>` lleva la key en el **path**, así que nginx la escribía
en texto plano en `access.log`. `/etc/nginx/conf.d/mask-apikey.conf` define un `map` que la
reemplaza por `***` sólo para el log; la request al backend va intacta:

    "POST /api/campaign/payments/apikey/*** HTTP/1.1" 404 ...

Las entradas que ya estaban escritas se purgaron con `sed` sobre el log existente. Si el
endpoint alguna vez pasa la key a header o body, esto deja de hacer falta — pero mientras siga
en el path, cualquier proxy nuevo en el camino necesita el mismo tratamiento.

## Sin CI/CD: el deploy acá es manual

`deploy.yml` del repo apunta a Azure Container Apps (`main` -> staging, `workflow_dispatch` ->
la prod que ya no existe). **Esta máquina no está conectada a ningún pipeline.** Mergear un PR
no la actualiza. El ciclo hoy es:

    tar czf ... (sin node_modules/.git) -> scp -> tar xzf en /opt/vio-backend
    npm ci && npm run build      # con NODE_OPTIONS=--max-old-space-size=1536
    node scripts/migrate.mjs     # si hay migraciones nuevas
    sudo systemctl restart vio-backend

Automatizarlo (deploy por SSH desde GitHub Actions) es un pendiente real: mientras no exista,
cada cambio depende de que alguien se acuerde de repetir estos pasos.
