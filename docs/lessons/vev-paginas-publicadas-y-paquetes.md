---
date: 2026-11-18
author: claude
status: live
---

# Vev: lo que una página publicada hace con nuestros paquetes

Aprendido con los bloques de Kondomeriet × VG ([journal](../journal/2026-11/2026-11-18-kondomeriet-black-week-prod.md)).

- **Una página publicada guarda la versión de los bloques del momento de publicar.** Tras un `vev deploy`, el editor ve el código nuevo, pero la URL publicada sigue con el bundle anterior hasta que se vuelve a publicar. Para comprobarlo, busca en el bundle de `cdn.vev.design/pkg/v1/<hash>.js` una cadena del cambio. Cada arreglo para el lector exige republicar, y el artículo del cliente debe publicarse después del último despliegue.
- **Las páginas publicadas pueden caducar.** La de prueba (`a-vio-dev.vev.site`) pasó a «This Content Has Expired… republish» dos veces en un día. Antes de una campaña, comprueba que la página del cliente no tenga caducidad.
- **Vev sirve el paquete dos veces** dentro del mismo archivo, con dos registros idénticos. En `cq1lXld-TA9`, 448 KB transferidos en lugar de 218. Mientras no lo cambien, cada KB de nuestro bundle cuenta doble.
- **No hay code-splitting.** El CLI compila un único IIFE con esbuild; un `import()` dinámico se queda dentro del mismo archivo.
- **El `widgetId` sale del nombre de la función** (`<pkg>_<FuncName>`), no del `name` visible. Cambiar el `name` no rompe los bloques ya colocados; renombrar la función o cambiar de paquete sí, y obliga a volver a colocarlos.
- **Un bloque no puede escribir sus propias props desde el canvas.** Solo escribe el panel de propiedades (campos con `component`). Lo que dependa de eso (snapshot de productos, `fastStart`) solo se guarda si alguien abre el panel. Por eso hay avisos para el editor cuando falta.
- **El panel de propiedades corre en otra ventana**, con su propio SDK. Un campo del panel que inicializa el SDK o persiste en localStorage (`vio.environment`) afecta a todo el editor. Con dos Configs, la duplicada dejaba el editor en staging ([vev#112](https://github.com/vio-live/vev/pull/112)).
- **`vev init` crea el paquete y luego pregunta la cuenta** si el usuario tiene varias. Que lo ejecute alguien con terminal interactiva, eligiendo la cuenta del paquete compartido.
