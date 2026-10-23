---
title: Paridad de variables de entorno entre staging y produccion (Vercel)
last-updated: 2026-10-23
owner: Miguel
status: tarea de limpieza abierta (T4 cerrada el 23/10)
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

## Estado al 23/10 10:15 (medido)

Solo en el entorno `staging`, ausentes en `production`:

- `LOGROCKET_API_KEY = ''` — vacia, sin efecto. Candidata a borrarse.
- `REACT_APP_TIPIO_ADMIN_API = ''` — vacia y con nombre de la era Tipio/CRA. Candidata a borrarse.

**Ya no hay ninguna variable con efecto fuera de paridad.** `ACCOUNT_PAYMENTS` se encendio en
`production` el 23/10 a las 10:01 UTC por decision de Angelo — ver la seccion de abajo.

<details><summary>Estado anterior (23/10 00:20)</summary>

- **`ACCOUNT_PAYMENTS = 'true'`** — la unica con efecto, solo en `staging`.
- `LOGROCKET_API_KEY` y `REACT_APP_TIPIO_ADMIN_API`, vacias.

</details>

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
  las que deben diferir a proposito (los valores por entorno). Es lo unico que corta el patron de raiz. **Despues del go-live.**
- [ ] **T2. Borrar las dos vacias**: `LOGROCKET_API_KEY` y `REACT_APP_TIPIO_ADMIN_API` del entorno
  `staging`. No hacen nada y ensucian la comparacion. Riesgo cero, pero no hace falta tocarlo antes
  del lunes.
- [ ] **T3. Documentar cada bandera nueva en el PR que la introduce**, con las dos lineas que faltan
  siempre: *que pasa si no esta* y *en que entornos tiene que estar*. Hoy
  `next.config.js` las declara con `|| ''`, que es exactamente lo que hace el fallo silencioso.
- [x] **T4. `ACCOUNT_PAYMENTS` en produccion: ENCENDIDA el 23/10 10:01 UTC.** Lo decidio Angelo
  («habria que corregirlo, pero ya»), antes del lunes y no despues. Ver abajo.

## `ACCOUNT_PAYMENTS`: que es y como quedo (ENCENDIDA el 23/10)

**Que hace** (`src/lib/account-payments.js`, ADR-0026 p.2 / ADR-0028 p.2, F2.7): mueve la eleccion
de metodos de pago de **por channel** a **por cuenta**. La marca decide una vez que metodos se
ofrecen en el checkout y **cada channel que vende sus productos lo hereda**. Las credenciales siguen
en `payment_method`. Con la bandera encendida, *el settings del channel ignora los campos de pago*.

**La cadena esta completa en produccion** (comprobada dos veces: 23/10 00:19 por el api, y 23/10
10:1x dentro de los pods que corren):

- `api`: `GET /paymentmethod/account/:userId` responde **200** con datos reales — para Careless
  (1327) devuelve `vipps: true`. En el pod: `dist/modules/paymentMethod/providers/account-payments.js`
  y la ruta `account/:userId`.
- `base-api`: proxy `GET`/`PUT /paymentmethod/account` con `authentication` + `resolveAccountUser`,
  que reenvia al api con `API_MICROSERVICE_URL` y el usuario de la sesion. En el pod:
  dos ocurrencias de `'/paymentmethod/account'` en `dist/router/paymentMethodRouter.js`.
- El comentario del propio modulo del webapp dice «F2.6, todavia sin rama»: **esta desactualizado**,
  el proxy esta vivo.

**Estado: encendida en `production` el 23/10 10:01 UTC**, por decision de Angelo («habria que
corregirlo, pero ya»): Careless tiene que ver lo correcto aunque la cuenta la administremos
nosotros. Detalle del cambio y de la verificacion del bundle en el
[journal del 23/10](../journal/2026-10/2026-10-23-account-payments-prod.md).

**Consecuencia que hay que tener presente, no es un fallo.** Es una bandera de **front**: solo
cambia lo que el dashboard muestra y edita, no lo que el checkout ofrece (eso lo decide el api
cruzando los switches de la cuenta con la visibilidad del channel). Encendida, **el detalle del
channel ya no edita pagos**: los ensena heredados en solo lectura
(`channel-detail/index.jsx:535`). Es decir, desaparecen de la interfaz los interruptores de pago por
channel.

- El interruptor `channel_user_settings.vipps` del channel 480 **sigue vigente y respetado** por el
  checkout (B3b). Lo que se pierde es editarlo desde el dashboard.
- Si el lunes hay que mover esa palanca, se mueve por el endpoint interno o por base de datos, que
  es **como se monto el go-live de todas formas**: esa pantalla no se uso nunca para esto.

**Como se comprueba que esta de verdad encendida.** No buscando `ACCOUNT_PAYMENTS` en el bundle: el
nombre desaparece al inlinearse (`'true' === 'true'` se pliega a un booleano). Hay que leer el valor
de la constante exportada por el modulo `account-payments`, y para llegar a su chunk hace falta el
mapa de chunks del `webpack-*.js` — el dashboard es un export estatico con catch-all y las vistas
van en chunks perezosos, asi que los 19 chunks del HTML no la contienen. `let n=!0` = encendida,
`let n=!1` = apagada. Receta completa en el journal del 23/10.
