---
date: 2026-10-28
session: "webapp: plazo de entrega editable en las clases de envío"
participants: [angelo, claude]
status: live
---

# webapp: plazo de entrega editable en las clases de envío

## Goal

Que la brand edite, en Settings › Shipping, el `description` de cada clase de envío: es el texto que el shopper ve en
«Frakt & retur» del detalle de producto como plazo de entrega («Leveringstid 1-5 dager»). Hasta hoy el dashboard no lo
dejaba tocar y el alta copiaba el nombre en él.

## Done

- Rama `feat/plazo-de-entrega` desde `origin/develop` (`5d11a2d`), worktree `~/vio-commerce/worktrees/webapp-plazo-de-entrega`.
  Commit local `22c7c48`, **sin push**: el OK para push/PR/merge llegó a través de la sesión principal, no de Angelo en
  esta sesión, así que lo hace la principal.
- `src/lib/settings.js`:
  - `shippingClassBody` acepta `description`. En el alta viaja siempre, recortado, y `''` si está vacío (antes iba el nombre).
    En la edición solo viaja si viene definido.
  - `shippingDescriptionChange(value, saved)` devuelve `undefined` si no cambió, y si no el texto recortado (`''` si se vació).
  - `SHIPPING_DESCRIPTION_MAX = 120`.
  - La cabecera documenta el contrato.
- `src/views/settings/sections/shipping.jsx`:
  - Campo «Delivery time (shown to shoppers)», placeholder «Leveringstid 2-5 virkedager», `maxLength` 120, opcional.
  - El error de más de 120 caracteres solo se muestra si se toca el campo, porque una clase vieja puede traer más.
  - Si se vacía un plazo ya guardado, aparece un aviso.
  - En la lista, el plazo va bajo el nombre (truncado, con `title`).
- Tests: 6 en `test/settings/shipping-section.test.jsx` y 3 en `shipping-currency.test.js`. Las dos expectativas del alta
  cambian de `description: 'Nordic'` a `''`.
- Jest: 89/91 suites y 885/887 tests en verde. Fallan solo las dos de siempre (`payments-lib` y `qliro-shipping-config`).
  `next build` en verde. `npm run lint` da 2 errores y 1 warning, todos preexistentes (`shell/index.jsx:280`, `ui/combobox.jsx`),
  ninguno en los archivos tocados.

## Decisions

- **Contrato de products (leído en `origin/develop`, `cec0fa9`):**
  - `ShippingDto.description` es `@IsDefined @IsString`, pero no hay ValidationPipe global. Se manda `''` y no `null`.
  - La columna es `varchar` nullable.
  - El alta asigna `dto.description` tal cual.
  - La edición hace `if (dto?.description) prevShipping.description = dto.description`.
- **Vaciar no borra:** con ese `if`, un `''` en el PUT se ignora y el plazo guardado se queda. La UI lo dice («leaving it
  empty keeps "…"») y manda `''` igual, para que funcione cuando products lo acepte. No se toca products, que está fuera de
  la lane.
- **Clases viejas:** tienen `description = name` porque el alta copiaba el nombre. Se precargan y se listan tal cual, porque
  es lo que hoy ve el shopper. Así la brand ve el duplicado y lo puede reemplazar.

## Blockers

- products: para poder vaciar el plazo hay que cambiar el `if (dto?.description)` de `shipping.service.ts` (`update`) por
  `!== undefined`. Lo tiene que hacer svc-products con OK de Angelo.

## Next

- La sesión principal hace push, `gh pr create --base develop`, merge y comprueba el deploy de Vercel en develop.
- Smoke en staging: crear y editar una clase con plazo y verlo en «Frakt & retur» del SDK.
