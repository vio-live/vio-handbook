---
title: Paridad de variables de entorno entre staging y produccion (Vercel)
last-updated: 2026-10-23
owner: Miguel
status: tarea de limpieza abierta
---

# Paridad de variables: staging vs produccion

## Por que existe este documento

Dos bloqueos de produccion en el mismo dia, los dos por lo mismo — una variable que estaba en
staging y no en produccion, y que **se fija al compilar**, asi que el sintoma nunca apunta a la
variable:

1. **22/10 20:59 — `VIO_API_HOST`.** El dashboard de prod no pedia los permisos a nadie: el bundle
   salia con el host vacio, la llamada a `/auth/me` **no se hacia nunca** y la nav se renderizaba sin
   Surfaces ni Campaigns para **todas** las cuentas. Se diagnostico como un problema de permisos de
   la cuenta de Aller y se llego a borrar y recrear la cuenta sin que eso arreglara nada.
2. **23/10 00:12 — `VIO_CAMPAIGNS_V2`.** Aller no podia crear la campana: `POST /api/campaigns`
   devolvia **400 `SPONSOR_NOT_ON_SURFACE`**. Sin la bandera, el formulario no cargaba los channels y
   mandaba la campana sin `channelIds`, asi que el sponsor quedaba sin channel en la surface. El
   error apuntaba a la surface, que estaba bien.

**El patron:** el export es estatico. Una variable ausente no da error, da un **valor por defecto
silencioso** (`''` o `false`), y el fallo aparece tres capas mas adelante, con un mensaje que acusa
a otra cosa. Por eso cuesta horas cada vez.

## Donde se esconden: no estan en el target `preview`

`vercel env ls` y la API muestran `target: []` para estas variables, lo que parece "sin entorno".
En realidad cuelgan de un **entorno custom** llamado `staging`:

- Proyecto: `vio-commerce-webapp` (`prj_6zEYYVcW5UlboHVdhZP3t1wtdCrI`)
- Entorno custom `staging`: `env_qIQRRlSGX6ukIcQLcWdz9TLTnXef`, rama `develop`

Una comparacion que solo mire `production` vs `preview` **no ve la deriva**. Hay que mirar
`customEnvironmentIds`.

## Estado al 23/10 00:20 (medido)

Solo en el entorno `staging`, ausentes en `production`:

- **`ACCOUNT_PAYMENTS = 'true'`** — la unica con efecto. Ver la seccion de abajo: **no se enciende
  antes del lunes**, y no es un olvido.
- `LOGROCKET_API_KEY = ''` — vacia, sin efecto. Candidata a borrarse.
- `REACT_APP_TIPIO_ADMIN_API = ''` — vacia y con nombre de la era Tipio/CRA. Candidata a borrarse.

Las que difieren en valor (`API_HOST`, `FIREBASE_*`, `CHANNEL_DASHBOARD_URL`) difieren **bien**: en
staging estan vacias o apuntan al dominio de staging, en prod llevan el valor real cifrado.

## Comprobacion (una sola orden, solo lectura)

```bash
T=<token de Vercel>; P=prj_6zEYYVcW5UlboHVdhZP3t1wtdCrI
curl -s -H "Authorization: Bearer $T" "https://api.vercel.com/v10/projects/$P/env?decrypt=true" \
 | python3 -c "
import json,sys
STAG='env_qIQRRlSGX6ukIcQLcWdz9TLTnXef'
d=json.load(sys.stdin); by={}
for e in d['envs']:
    tg=set(e.get('target') or [])
    if STAG in (e.get('customEnvironmentIds') or []): tg.add('staging')
    by.setdefault(e['key'],set()).update(tg)
falta=[k for k,t in by.items() if 'staging' in t and 'production' not in t]
print('en staging y NO en production:', sorted(falta) or 'ninguna')
"
```

## Tareas de limpieza

- [ ] **T1. Meter esta comprobacion en CI**, en el pipeline del webapp: que falle (o avise) si
  aparece una variable en `staging` que no este en `production`, con una lista blanca explicita para
  las que deben diferir a proposito (`ACCOUNT_PAYMENTS` mientras siga apagada, y los valores por
  entorno). Es lo unico que corta el patron de raiz. **Despues del go-live.**
- [ ] **T2. Borrar las dos vacias**: `LOGROCKET_API_KEY` y `REACT_APP_TIPIO_ADMIN_API` del entorno
  `staging`. No hacen nada y ensucian la comparacion. Riesgo cero, pero no hace falta tocarlo antes
  del lunes.
- [ ] **T3. Documentar cada bandera nueva en el PR que la introduce**, con las dos lineas que faltan
  siempre: *que pasa si no esta* y *en que entornos tiene que estar*. Hoy
  `next.config.js` las declara con `|| ''`, que es exactamente lo que hace el fallo silencioso.
- [ ] **T4. Decidir `ACCOUNT_PAYMENTS` en produccion** — ver abajo. Decide Angelo, **despues** del
  lunes.

## `ACCOUNT_PAYMENTS`: que es y por que se queda apagada el lunes

**Que hace** (`src/lib/account-payments.js`, ADR-0026 p.2 / ADR-0028 p.2, F2.7): mueve la eleccion
de metodos de pago de **por channel** a **por cuenta**. La marca decide una vez que metodos se
ofrecen en el checkout y **cada channel que vende sus productos lo hereda**. Las credenciales siguen
en `payment_method`. Con la bandera encendida, *el settings del channel ignora los campos de pago*.

**La cadena SI esta completa en produccion** (lo comprobe, 23/10 00:19):

- `api`: `GET /paymentmethod/account/:userId` responde **200** con datos reales — para Careless
  (1327) devuelve `vipps: true`.
- `base-api`: tiene el proxy `GET`/`PUT /paymentmethod/account` con `authentication` +
  `resolveAccountUser`, que reenvia al api con el usuario de la sesion.
- El comentario del propio modulo dice «F2.6, todavia sin rama»: **esta desactualizado**, el proxy
  esta vivo.

**Entonces por que no se enciende ya.** Es una bandera de **front**: solo cambia lo que el dashboard
muestra y edita, no lo que el checkout ofrece (eso lo decide el api cruzando los switches de la
marca con la visibilidad del channel). Encenderla el fin de semana **quitaria de la interfaz los
interruptores de pago por channel** — justo los que se usaron para montar el go-live y los que
habria que tocar el lunes si algo falla (`channel_user_settings.vipps`, verificado el 23/10 en el
channel 480). Cambiar el modelo de edicion de pagos la vispera del lanzamiento no arregla nada y
quita una palanca.

**Criterio para encenderla despues:** con el go-live cerrado, poner `ACCOUNT_PAYMENTS=true` en
production, redesplegar, y comprobar que la pantalla de pagos de la cuenta carga los 11 switches
desde `/paymentmethod/account` y que el checkout sigue ofreciendo lo mismo que antes para el channel
480.
