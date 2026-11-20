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
- Kondomeriet: su página de Black Week ya no dice «ikke aktiv», pero los precios (Blowcast Pro 1419) y el feed (33 `sale_price`, los mismos de antes) siguen sin cambios.

## Decisions
- Tutorial en noruego (Angelo). Angelo habla con Michael sobre la fecha de Black Week y hace él la compra de 39 kr. Lo de Vev (H auto, paquete duplicado), el lunes.

## Next session
- Pedir a Partner Studio el usuario de Vev y la información del punto 2 del plan, y mandarles el PDF.
- Lunes: instalar el paquete en su cuenta, montar la página de ejemplo y hacer la sesión de 30 min.
