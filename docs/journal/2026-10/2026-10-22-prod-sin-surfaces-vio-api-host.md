## Por qué en prod no aparecen Surfaces ni Campaigns: `VIO_API_HOST` no existe en producción — Miguel

- Quién: Miguel. Angelo insistió: «no, hay un error, algo está pasando, no veo las opciones de
  publisher» (22/10 20:50 Oslo), después de que yo diera la cuenta por buena.
- Dónde: webapp `dashboard.ecom.vio.live` (proyecto Vercel `vio-commerce-webapp`, repo
  `vio-live/webapp-vio-commerce`), producción.
- Cuándo: 22/10/2026 ~21:00 Oslo.

### No era la cuenta. Tenía razón él.

La cuenta 1330 está perfecta por los dos caminos (medido con un ID token real:
`/api/auth/me` del micro de campañas → 200, `accountType publisher`, features con
`surfaces:manage`). Pero **el dashboard de producción nunca llama a ese endpoint**.

### La causa, en el código desplegado

`src/lib/vio.js` del webapp:

```js
const DERIVED_HOST = { 'reachu-qa': 'https://api-staging.vio.live' };
const firebaseProject = () => process.env.FIREBASE_PROJECT_ID || (process.env.FIREBASE_AUTH_DOMAIN||'').split('.')[0];
export const VIO_HOST = (process.env.VIO_API_HOST || DERIVED_HOST[firebaseProject()] || '').replace(/\/+$/, '');
```

- En **develop/staging** el proyecto de Firebase es `reachu-qa`, está en el mapa, y el bundle sale
  con **dos** hosts: `api-ecom-staging.vio.live` y `api-staging.vio.live`.
- En **producción** el proyecto es `reachu-prod`, **no está en el mapa**, y **no existe la variable
  `VIO_API_HOST`** en el proyecto de Vercel (comprobada la lista completa de claves). Resultado:
  `VIO_HOST = ''`, y el bundle de producción solo contiene `https://api-ecom.vio.live`.
- Con `VIO_HOST` vacío, la clave de SWR es `null` (`!t && e && l ? '/auth/me' : null`): **la petición
  no se hace nunca**. El objeto de usuario queda `undefined`.
- Y la nav, con el usuario `undefined`, cae en esta rama:
  `if (void 0 === e) { i.vio || i.types.length !== d.length || t.add(s); continue }`
  que añade **solo** las entradas sin feature y disponibles para los tres tipos. Eso excluye
  **Surfaces y Campaigns**. Se ve idéntico a una cuenta brand.

**El comentario del propio archivo dice que es a propósito:** «Producción NO se deriva a propósito:
antes hay que enlazar los sponsors existentes con sus cuentas de Commerce, o el alta automática
crearía sponsors duplicados. Sin host → el webapp queda como hoy.»

**Afecta a todas las cuentas de prod, no a Aller.** Nadie puede ver Surfaces ni Campaigns hoy.

### El arreglo, y por qué la precaución del comentario ya no aplica

Poner **`VIO_API_HOST = https://api.vio.live`** en el entorno *production* del proyecto de Vercel y
redesplegar. `api.vio.live` ya sirve al micro de campañas en prod (VirtualService
`virtual-service-campaigns-prod`, hosts `campaigns.vio.live` y `api.vio.live`).

Comprobado antes de recomendarlo:

- **No hay sponsors que duplicar**: `campaign`, `surface`, `surface_campaign`,
  `surface_campaign_sponsor`, `surface_campaign_slot`, `surface_campaign_channel`, `surface_channel`,
  `surface_platform`, `surface_slot` están **todas a 0** en producción. La precaución del comentario
  se escribió cuando había sponsors heredados; hoy no hay ninguno.
- **CORS ya está puesto**: preflight `OPTIONS https://api.vio.live/api/auth/me` con
  `Origin: https://dashboard.ecom.vio.live` → **204**, con `access-control-allow-origin` al
  dashboard y `authorization` entre los headers permitidos.

### Pendiente

Esperando el OK de Angelo: es una variable de entorno de producción + redeploy, y enciende la
sección Vio/Campaigns para **todas** las cuentas de prod, no solo Aller. Reversible quitando la
variable y redesplegando.
