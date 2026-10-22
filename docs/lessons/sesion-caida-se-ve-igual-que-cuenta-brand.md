# Una sesión caída se ve igual que una cuenta "brand" en el dashboard

**Síntoma:** «la cuenta de Aller quedó como brand, no me muestra Surfaces». Pero el backend decía
publisher por los dos caminos.

**Lo que medí (22/10/2026, prod, user 1330):**

- `GET /1330` del micro `users` → `accountType: publisher`, features con `surfaces:manage`.
- Con un **ID token de Firebase real** del propio usuario (custom token canjeado por
  `identitytoolkit`), `GET /api/auth/me` del micro de campañas → **200**, `accountType: publisher`,
  `features: [commerce:read, channels:manage, surfaces:manage, campaigns:manage, analytics:surfaces]`.
  `/api/channels` y `/api/campaigns`, 200 también.
- Claims dentro del token: `{channel: true, brand_name: "Aller"}`.

**Y el front desplegado también es correcto.** Bajando los chunks de
`dashboard.ecom.vio.live` (proyecto Vercel `vio-commerce-webapp`, producción `35bfae92` del 21/10):

```js
surfaces: { label:"Surfaces", types:["publisher","internal"], vio:"surfaces:manage" }
campaigns:{ label:"Campaigns", types:["publisher","internal"], vio:"campaigns:manage" }
```
con `x = (e,t) => Array.isArray(e?.features) && e.features.includes(t)`.

**La causa real está en la rama de "usuario sin cargar"** del mismo cálculo de la nav:

```js
if (void 0 === e) { i.vio || i.types.length !== d.length || t.add(s); continue }
```

Cuando el objeto de usuario es `undefined` — sesión caída, token del usuario borrado, `/api/auth/me`
fallando — el front añade **solo** las entradas que no piden feature (`i.vio`) y que están
disponibles para los tres tipos. Eso deja fuera **Surfaces y Campaigns**… y el resultado es
indistinguible de una cuenta brand. Y el SWR está con `revalidateOnFocus: false`, así que volver a
la pestaña no lo refresca.

**Lección:** «no veo la sección X» en el dashboard **no** prueba que la cuenta esté mal. Antes de
tocar la cuenta (o de borrarla y recrearla, que es lo que estuvimos a punto de hacer dos veces):
pedir un ID token real del usuario y llamar a `/api/auth/me`. Si eso dice `publisher` con
`surfaces:manage`, el problema está en el navegador — sesión vieja, token de un usuario ya borrado,
o caché del front —, y cambiar de email no arregla nada.

Relacionado: `dos-servicios-dos-reglas-para-el-mismo-tipo-de-cuenta.md`.
