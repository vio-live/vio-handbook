---
date: 2026-11-20
session: Kondomeriet × VG — entrega a Partner Studio
participants: [angelo, claude]
status: live
---

# 20/11: plan de entrega a Partner Studio y tutorial

## Goal
Plan para entregar los bloques Kondomeriet a Partner Studio (escriben el artículo de VG en Vev) y tutorial en PDF con capturas.

## Done
- Plan: [sprints/2026-11-kondomeriet-vg-entrega-partner-studio.md](../../sprints/2026-11-kondomeriet-vg-entrega-partner-studio.md). Vev no comparte paquetes entre cuentas; recomendado instalar el paquete ligero en la cuenta de Partner Studio con un usuario de desarrollador suyo.
- Tutorial en noruego, 11 páginas: [assets/partner-studio/Kondomeriet-Vev-veiledning.pdf](../../assets/partner-studio/Kondomeriet-Vev-veiledning.pdf). Fuente HTML y capturas en `vio-commerce/entregables/partner-studio-tutorial/`. La API key va tapada.
- Mientras se hacían las capturas, la card del llavero en test-kondomeriet apareció sin productos. Era una card migrada con «Paste settings»: sus productos solo vivían en `pastedSettings`, y «Clear the pasted settings» o un `group` vacío los perdían. Arreglado en [vev#127](https://github.com/vio-live/vev/pull/127) (desplegado en los dos paquetes). La card se restauró en el editor.
- Quitada la opción de Google Analytics (GA4/dataLayer) de la Config de Kondomeriet, en los dos paquetes ([vev#128](https://github.com/vio-live/vev/pull/128)): la analítica de Vio queda siempre activa y ya no se escribe en `window.dataLayer`. Tutorial actualizado.
- Kondomeriet: su página de Black Week ya no dice «ikke aktiv», pero los precios (Blowcast Pro 1419) y el feed (33 `sale_price`, los mismos de antes) siguen sin cambios.

- **Estado del navegador que pasaba de una página a otra** (#491, Alan 14:06 y 14:35 UTC): [vev#129](https://github.com/vio-live/vev/pull/129), mergeado y desplegado en los dos paquetes.
  - **Causa:** lo que guardan las Configs iba por navegador, no por página. Por ejemplo `vio.apiKey`, `vio.environment`, sponsor, campaña y huella de conexión, `knd.configOwner.v1` y la caché `knd.products`/`knd.identity`.
    - El entorno se guardaba sin su key, y el Save de la Vio Config no lo guardaba.
    - El panel de propiedades de la página de staging iniciaba su SDK en `production`, la que había dejado la página de Kondomeriet.
    - Los bloques Kondomeriet sin Config de Kondomeriet pintaban la caché de prod de la otra página y, con el canal de staging vacío, «UTSOLGT».
  - **Arreglo:**
    - entradas por página (`<nombre>@<ruta de la ventana superior>`), con el entorno emparejado con su key;
    - la Vio Config impone y guarda su key y su entorno al conectar y en el Save;
    - el owner de Kondomeriet va por página;
    - caché e identidad por conexión de la Config de Kondomeriet, y la foto solo de esa key;
    - sin Config de Kondomeriet, los bloques no pintan y avisan en el editor. Las entradas antiguas se borran una vez.
  - **Arnés** (dos páginas del mismo origen, como el editor):
    - con main, la página de staging pintaba Blowcast −60 % de prod y llamaba a `api.vio.live`, y su «panel» iniciaba en `production`;
    - con la rama, aviso de Config que falta, solo `api-staging` y panel en `staging`;
    - Kondomeriet prod, paquete ligero: tarjetas a ~1,7 s en la primera visita y ~1,19 s en la segunda, como antes.
  - **Para Alan:** abrir una vez la Config de cada página en el editor (o darle Save), porque lo guardado antes se borra. Repetir el recorrido Kondomeriet → staging → Kondomeriet sin tocar el localStorage. Las páginas publicadas fijan su bundle: republicar.
- **Guardia #491 (14:06–15:31 UTC):** Alan encontró que el estado de las Configs en el localStorage era por origen, no por página: una Vio Config de staging se quedaba en prod y los bloques Kondomeriet de otra página usaban la conexión y la caché de la página de Kondomeriet. Arreglado en [vev#129](https://github.com/vio-live/vev/pull/129) (estado por página; la Config impone su key y su entorno, también la Vio Config genérica). Alan lo probó y aprobó el bloque 10.

## Decisions
- Tutorial en noruego (Angelo). Angelo habla con Michael sobre la fecha de Black Week y hace él la compra de 39 kr. Lo de Vev (H auto, paquete duplicado), el lunes.

## Next session
- Pedir a Partner Studio el usuario de Vev y la información del punto 2 del plan, y mandarles el PDF.
- Lunes: instalar el paquete en su cuenta, montar la página de ejemplo y hacer la sesión de 30 min.
