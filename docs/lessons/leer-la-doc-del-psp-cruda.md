---
title: "La documentación de un PSP se lee cruda, no resumida"
last-updated: 2026-09-17
owner: angelo
---

# La documentación de un PSP se lee cruda, no resumida

**Qué pasó (17/09, Adyen).** Para planificar la integración se leyó la documentación de Adyen
con siete agentes en paralelo. La herramienta de lectura web devuelve un **resumen** hecho por
un modelo pequeño, y con `docs.adyen.com` falló de dos maneras:

- En las guías con selector de plataforma (`?platform=Web&integration=Drop-in`) el contenido se
  carga por JavaScript: el resumen traía **sólo el menú de navegación**, sin decir que faltaba
  el resto.
- En las páginas del API Explorer **inventó valores de ejemplo** (`webhook_12345`) que no
  están en la página.

Ninguna de las dos cosas se nota leyendo el resumen: parece una respuesta.

**Cómo se resolvió.** Yendo a las fuentes crudas, que casi todos los PSP publican:

- `docs.adyen.com` sirve cualquier página como Markdown añadiendo **`.md`** a la URL, y publica
  `llms.txt` y `llms-full.txt` (todo el corpus, 54 MB, se puede `grep`-ear).
- Los **OpenAPI** que alimentan el API Explorer están en `github.com/Adyen/adyen-openapi`
  (`CheckoutService-v72.json`, `ManagementService-v3.json`, `Webhooks-v1.json`): ahí están los
  campos, límites y enums exactos. Así se vio que `PATCH /sessions/{id}` sólo cambia `amount` y
  `payable` — no las líneas —, que es lo que decidió el diseño.
- Para lo que sólo existe renderizado, un navegador de verdad y el texto de la página.

Aun así la guía y la referencia **se contradicen** en dos puntos (`payable` en
`POST /sessions`; express de Apple/Google Pay en el Sessions flow). Eso no lo resuelve ninguna
lectura: se prueba contra el entorno de test.

**La regla.**

1. Un número, un límite o el nombre de un campo que va a acabar en código se toma del
   **OpenAPI o del Markdown crudo**, nunca de un resumen.
2. Si un resumen de una página de documentación parece corto o genérico, **es que no la leyó**.
   Buscar el `.md`, el `llms.txt`, el repositorio de specs, o abrirla en un navegador.
3. Lo que la documentación dice de dos maneras va a la lista de **cosas a probar**, no al diseño.
4. Lo que se verifica se deja verificado en un test: la firma HMAC de Adyen está fijada contra
   el vector de su propia documentación
   (`vio-shopcart-microservice/src/modules/checkout/tests/adyen-helpers.unit.spec.ts`).

Ver [`architecture/adyen.md`](../architecture/adyen.md) y el
[journal del 17/09](../journal/2026-09/2026-09-17-adyen-analisis-e-implementacion.md).
