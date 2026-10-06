---
title: "Un `git add` con la ruta en otra mayúscula no stagea nada, y en Linux el deploy carga el archivo viejo"
last-updated: 2026-10-06
owner: angelo
---

# Un `git add` con la ruta en otra mayúscula no stagea nada, y en Linux el deploy carga el archivo viejo

**Síntoma:** mergeas un PR de base-api con rutas nuevas en el router y sus handlers en el
controller; el pod de QA entra en `CrashLoopBackOff` con
`Route.get() requires a callback function but got a [object Undefined]`. En tu Mac todo compilaba
y el archivo del controller tenía el código.

**Por qué:** el archivo tracked es `src/controller/shopCartController.ts` (C mayúscula). En macOS
(FS insensible a mayúsculas) editar y leer `shopcartController.ts` funciona igual, pero
`git add src/controller/shopcartController.ts` **no stagea nada** (ni avisa): el commit salió con
el router y sin el controller. En la imagen de Linux el barrel importa `./shopCartController`,
carga el controller viejo, y express se niega a montar rutas con handler `undefined` al arrancar.

**Qué hacer:**

1. `git add` siempre con la ruta tal como la lista `git ls-files` (copiarla de ahí), nunca
   escrita de memoria.
2. Antes de pushear, `git diff --cached --stat`: si tocaste tres archivos y aparecen dos, para.
3. Si ya pasó: el fix es commitear el archivo con el nombre correcto (fix-forward tarda lo mismo
   que un revert); mientras, QA está caído.

**Cómo se vio:** [journal 2026-10-06 Vipps checklist](../journal/2026-10/2026-10-06-vipps-checklist.md),
base-api#26 → #27.
