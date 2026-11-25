---
date: 2026-11-20
session: Kondomeriet × VG Black Week — entrega a Partner Studio
participants: [angelo, claude]
status: live
---

# Entrega de los bloques Kondomeriet a Partner Studio (VG)

Partner Studio, el estudio de contenido de Schibsted/VG, escribe el artículo de Black Week en Vev. Este plan cubre qué les entregamos, cómo acceden a los bloques y qué tiene que estar listo antes de publicar.

Material entregable: el tutorial en noruego, [`Kondomeriet-Vev-veiledning.pdf`](../assets/partner-studio/Kondomeriet-Vev-veiledning.pdf) (11 páginas, con capturas). Fuente: `vio-commerce/entregables/partner-studio-tutorial/`.

## 1. Acceso a los bloques (la decisión que bloquea todo)

> [claude, 2026-11-23] **Decidido: Partner Studio instala el paquete en su cuenta ellos mismos** a partir de una release pública.
> Angelo hizo público `vio-live/vev` el 23/11. Release [`kondomeriet-v1.0.0`](https://github.com/vio-live/vev/releases/tag/kondomeriet-v1.0.0): zip de `kondomeriet/` con un `vev.json` sin clave (`vev init` en su cuenta añade la suya) y el PDF.
> Instrucciones en noruego en [`kondomeriet/README.md`](https://github.com/vio-live/vev/tree/main/kondomeriet#readme) (vev#132).
> Cada arreglo durante la campaña = release nueva con `kondomeriet/scripts/release.sh <versión> <notas> [pdf]`; ellos copian su `vev.json`, `vev deploy` y republican.
> Ya no hace falta un usuario en su cuenta. El historial del repo, ahora público, contiene claves de canal de QA (`api-staging`) retiradas de main el 12/08.

Vev no tiene forma documentada de compartir un paquete de código con **otra** cuenta:

- `shareWithAccount: true` lo publica para todos los usuarios de **nuestra** cuenta ([developer.vev.design/cli/configuration](https://developer.vev.design/cli/configuration)).
- Un invitado a un proyecto, con permiso de edición, **no puede publicar ni embeber** ([help.vev.design · Sharing a project](https://help.vev.design/en/articles/7022103-sharing-a-project)).
- Las *Libraries* son de equipo u organización (plan Org) y no está documentado que valgan para un paquete de `vev deploy`.

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A (recomendada). Instalar el paquete ligero en la cuenta de Partner Studio** | Nos dan un usuario de desarrollador en su cuenta de Vev. Hacemos `vev login` con él, `vev init` en una carpeta propia (`kondomeriet-ps/`, con clave nueva y `shareWithAccount: true`) y `vev deploy`. | Publican en su cuenta y con su plan, como cualquier otra página de VG. No ven bloques «(old)». | Cada cambio de los bloques se despliega a un paquete más (hoy son 2). Necesitamos esa cuenta. |
| B. Partner Studio trabaja dentro de la cuenta de Vio | Les invitamos como miembros de nuestro equipo de Vev; montan y publican desde aquí y VG embebe la página. | No hay paquete nuevo. | Hace falta un plan de pago de Vio para publicar sin caducidad ni marca de agua. VG tiene que aceptar un embed de una cuenta ajena. |
| C. Invitado a un proyecto nuestro | — | — | **Descartada:** un invitado no puede publicar. |

**Siguiente paso:** preguntar a Partner Studio si nos pueden dar un usuario de desarrollador en su cuenta (opción A). En paralelo, preguntar a Vev support si existe alguna forma oficial de compartir un paquete entre cuentas.

## 2. Qué necesitamos de VG / Partner Studio

- [x] ~~Usuario de desarrollador en su cuenta de Vev~~: ya no hace falta, instalan ellos la release (23/11).
- [ ] Confirmar que su plan de Vev publica sin caducidad. En el plan gratis, la página caduca a la hora.
- [ ] Cómo publican en vg.no: hosting de Vev o embed. Si se puede, que nos dejen poner código en el `<head>`, para precargar la foto del CDN y la primera imagen. Es la mejora de carga con más ganancia que queda.
- [ ] Persona de contacto y el canal para dudas durante el montaje.

## 3. Qué les damos nosotros

- [x] El paquete, como release pública que instalan ellos: [`kondomeriet-v1.0.0`](https://github.com/vio-live/vev/releases/tag/kondomeriet-v1.0.0) (23/11).
- [ ] El tutorial en PDF (noruego).
- [ ] La API key de la surface VG, **aparte del PDF**, por canal directo. En el tutorial va tapada.
- [ ] La hoja de Kondomeriet con productos, % y enlaces de Circlewise. La sigue manteniendo Michael.
- [ ] Una página de ejemplo montada en su cuenta, que puedan duplicar: Config, una card suelta, una card con colores, un carrusel. Servirá de plantilla.
- [ ] Una sesión de 30 minutos (pantalla compartida) para montar juntos la primera sección.

## 4. Antes de publicar el artículo (go/no-go)

- [ ] **Kondomeriet ha activado su Black Week.** Hasta entonces su Hurtigkasse cobra el precio normal y las tarjetas enseñan el calculado por %. Al 20/11 su página ya no dice «ikke aktiv», pero los precios y el feed siguen siendo los normales.
- [ ] Compra real de prueba (llavero de 39 kr) con enlace de Circlewise, y la venta vista en el panel de Circlewise.
- [x] Postback de Circlewise a prod (campaigns#41): en vivo desde el 25/11. Falta que quien administre la cuenta de Circlewise pegue la URL con el token (no está confirmado que sea VG; preguntar a Even Braastad, dueño de la hoja).
- [ ] Página revisada en móvil, en la app de VG y en escritorio.
- [ ] Config en Production y una sola Config.
- [ ] Tarjetas con altura fija y el panel de propiedades de cada una abierto una vez (snapshot fresco).
- [ ] Prueba de Alan cerrada (#491: 52/63 al 19/11; faltan regresión, Circlewise y la compra).

## 5. Durante la campaña (hasta el 30/11)

- Guardia diaria del canal: precios, stock y que no haya tarjetas vacías.
- Tras cada despliegue de los bloques, avisar a Partner Studio para que **republique**: una página publicada fija la versión de los bloques.
- Informes diarios para Kondomeriet, en noruego, como con Careless y Faves.

## 6. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| «H auto» deja el bloque a 0 px en el editor de Vev | Altura fija (está en el tutorial). Escribir a Vev. |
| Precio de la tarjeta ≠ precio de la Hurtigkasse hasta que Kondomeriet active Black Week | No publicar antes. |
| El feed de Kondomeriet revierte un precio calculado si cambia el producto | Revisión diaria hasta que activen Black Week. |
| Tarjetas migradas con «Paste settings» que pierden productos | Arreglado en vev#127. Las páginas nuevas no usan esa vía. |
| Cambios de datos en prod durante pruebas | Pedido a Alan; solo Vio cambia datos de prod. |

## 7. Calendario propuesto

| Cuándo | Qué |
|---|---|
| Vie 20/11 | Pedir a Partner Studio el usuario de Vev y la información del punto 2. Enviar el tutorial. |
| Lun 23/11 | Instalar el paquete en su cuenta, montar la página de ejemplo y hacer la sesión de 30 min. |
| Cuando Kondomeriet active Black Week | Go/no-go (punto 4) y publicación. |
| 30/11 | Fin de campaña. Retirar o dejar la página según VG. |
