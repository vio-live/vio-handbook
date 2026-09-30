---
title: El resizer de imágenes es un endpoint público que escribe en el storage de producción
last-updated: 2026-09-30
owner: miguel
---

## Qué es el resizer

Cuando una URL de `container.vio.live` lleva `?size=`, Cloudflare (antes Front Door) devuelve un
**308** hacia `api-ecom.vio.live`. Ahí, `vio-base-api` genera la variante redimensionada, **la guarda
en el blob de producción**, y devuelve un **302** al cliente hacia el objeto nuevo.

```
cliente -> container.vio.live/...jpeg?size=200   308
        -> api-ecom.vio.live/...jpeg?size=200    302   (genera y GUARDA la variante)
        -> container.vio.live/...jpeg -> ...442200.jpeg   200
```

Código: `vio-base-api/src/service/imageService.ts`, `src/controller/imageController.ts`,
`src/router/imageRouter.js`.

## Los problemas

### 1. La ruta es pública, sin autenticación ni validación
```js
imageRouter.get('/:rootFolder/:path', imageController.resize);
```
`express-validator` está importado en el router y **nunca se usa**.

### 2. Las dimensiones no tienen techo, y cada valor nuevo deja un blob para siempre
Los nombres conocidos están acotados (`thumbnail` 150, `medium` 500, `large` 1024), pero el `else`
acepta cualquier cosa:
```js
const [w, h] = size.split('x').map(Number);
```
**Comprobado el 2026-09-30** con `?size=900x900`: se generó y quedó guardado
`...0442900x900.jpeg`, 50 KB. (Se borró después de la prueba.)

Cada valor distinto de `size` crea un blob nuevo. La regla de ciclo de vida del contenedor
(`uploads-cool-tras-30d-sin-acceso`) **sólo mueve a Cool, no borra nada**. Un bucle sobre
`?size=1x1`, `2x2`, `3x3`… engorda el storage de producción sin límite.

### 3. Riesgo de tumbar base-api
`base-api` corre con **límite de 512Mi** y 4 réplicas. `sharp(buffer).resize(w, h)` reserva un búfer
de salida de `w × h × canales`: `?size=20000x20000` son ~1,2 GB. Endpoint público y sin coste para
quien llama, cuatro réplicas. **No se probó contra producción**: el cálculo y los límites están, y
eso ya es suficiente para arreglarlo.

### 4. Las variantes se guardan con el Content-Type equivocado
```js
await blockBlobClient.upload(resizedImageBuffer, resizedImageBuffer.length);
```
Sin `blobHTTPHeaders`, Azure pone `application/octet-stream`. El original es `image/jpeg`; la variante
no. Hoy son **28 blobs de 62.553** en `reachu-uploads-production`.

### 5. `validatePrev` se descarga la imagen entera sólo para ver si existe
```js
await axios.request({ url: `${reachuDomain}/${containerName}/${url}`, method: 'GET' });
```
Es el **camino caliente**: cada petición de una variante que ya existe se baja el archivo completo al
API, lo tira, y después manda al cliente a descargarlo otra vez. Debería ser `blobClient.exists()`.

### 6. El 500 devuelve el mensaje de error interno
`res.status(500).send(error.message)`. Con `?size=abc` responde 500 con el detalle.

## Cuánto se usa en realidad

**28 variantes en total**, casi todas `Thumbnail` y una `large`. En la práctica el front pide nombres
(`thumbnail`, `large`), no números. Arreglar esto no debería romperle nada a nadie.

## Arreglo propuesto

En `imageService.ts`:

1. **Allowlist de tamaños.** Aceptar `thumbnail`, `medium`, `large`, `full` y, si hace falta un ancho
   numérico, un conjunto cerrado (`200`, `400`, `800`). Cualquier otra cosa: 400, no 500.
2. **Content-Type al subir:**
   ```js
   await blockBlobClient.upload(buf, buf.length, {
     blobHTTPHeaders: { blobContentType: <tipo del original> },
   });
   ```
3. **`blobClient.exists()`** en lugar del GET completo de `validatePrev`.
4. **No devolver `error.message`** al cliente.

### Mitigación inmediata sin tocar código
Se puede acotar en la Redirect Rule de Cloudflare: que sólo redirija al API cuando `size` sea uno de
los valores conocidos. Lo que quede fuera se sirve como imagen original — degradación, no rotura.
