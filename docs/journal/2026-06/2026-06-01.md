---
date: 2026-06-01
session: morning
participants: [angelo, claude]
status: live
---

# Session — 2026-06-01 — Review Alan VG×Vev (Cards 3+4 done, Card 5 doing)

> Autoría: dirigido por angelo, ejecutado por claude (review del branch + Trello updates + journal).
> Sigue el procedimiento canónico en `playbooks/review-kotlin-ios-parity.md` (3 tracks separados + Trello + journal + anchors).

## Goal

Cerrar lo cerrable del experiment VG × Vev del lado de Alan, validando con código real (no solo Trello) qué cards efectivamente cubrió en su único commit `7c1686e` del 28 mayo.

## Track A — Trello state (board Dev)

Estado de las 5 cards del sprint VG × Vev iOS antes / después de este review:

| Card | Antes | Después | Razón |
|---|---|---|---|
| C1 — Vev plugin auditar | To do | To do | Otro codebase, no tocado en `develop-vev` |
| C2 — Vev plugin deep link gen | To do | To do | Mismo — pendiente para plugin track |
| C3 — VevArticleView WKWebView wrapper | To do | **Done** | `VGVevArticleView.swift` + `VGVevWebView.swift` cubren todo el acceptance |
| C4 — Intercept WKNavigationDelegate + handoff | To do | **Done** + comentario follow-up multi-sponsor | Bridge completo, `decidePolicyFor` + `createWebViewWith` (target=_blank) |
| C5 — E2E + journal | To do | **Doing** + checklist (1/4 hecho) | Código listo, falta PR + test manual + journal con screenshots |

Movimientos hechos por **claude** en este review: 3 movements (C3→Done, C4→Done, C5→Doing) + 1 comment en C4 + 1 checklist nueva en C5 con 4 items (uno checked).

## Track B — Alan's commits (verificación contra código)

**1 commit nuevo** en `origin/develop-vev` (rama no listada en cards — Alan eligió ese nombre en vez del sugerido `feature/vg-vev-article`, no es problema):

| SHA | Autor | Fecha | Mensaje |
|---|---|---|---|
| `7c1686e` | Alan Valenzuela Simpson | 2026-05-28 22:48 | version funcional, comunicación vev con app nativa |

**Stats**: 9 archivos cambiados, +644 / −10.

### Archivos creados

| Archivo | Líneas | Qué hace | Card cubierta |
|---|---|---|---|
| `Demo/Vg/Vg/Components/VGVevWebView.swift` | 282 | WKWebView + `WKNavigationDelegate` + `WKScriptMessageHandler` + probe automático de `callApp()` en el DOM Vev | C3 + C4 |
| `Demo/Vg/Vg/Views/VGVevArticleView.swift` | 166 | Host con top bar noruega ("Ferdig" / "VEV Design Test"), fetch GraphQL del producto, `VProductDetailOverlay` como sheet | C3 |
| `Demo/Vg/Vg/Configuration/VGVevOpenProductRequest.swift` | 15 | Modelo `{productId, apiKey}` parseado del deep link | C4 |
| `Demo/Vg/Vg/Configuration/VGVevTestConfig.swift` | 28 | Knobs: `articleURL`, `openProductHost`, `openProductPath`, `openProductURLScheme` | C3 |
| `Demo/Vg/Vg/Helpers/VGProductDtoConverter.swift` | 80 | `ProductDto` (Vio Commerce) → `Product` (SDK) | C4 |

### Archivos modificados

- `Demo/Vg/Vg/Views/VGHomeView.swift` (+29 / −9) — refactor `showMaxboArticle: Bool` → enum `NewsOverlay { feed, maxboArticle, vevDesignTest }`. Entry point al Vev convive con el Maxbo nativo (swappeable durante test).
- `Demo/Vg/Vg/Views/NewsView.swift` (+21) — nuevo callback `onVevDesignTestTap`.
- `Demo/Vg/Vg/ViewModels/ProductFetchViewModel.swift` (+26 / −1) — fetch acepta `apiKey` opcional (cae a `VioConfiguration.shared.apiKey` si es nil).
- Xcode workspace contents (+7) — referencias del proyecto.

### Decisiones técnicas notables

1. **Schema del deep link** — NO siguió nuestro `vio://product/<id>` propuesto en C2. Alan usó:
   - Primario: HTTPS `https://<host>/open-product?id=<id>&apikey=<key>`
   - Fallback: custom scheme `vg://open-product?id=<id>`
   - Esto es **más flexible** que lo propuesto. Probablemente cuando se haga el plugin Vev real (C1+C2) se mantenga el primario HTTPS.

2. **Bridge dual** — intercepta tanto `decidePolicyFor` (navegación normal) como `createWebViewWith` (target="_blank"). Vev dispara `callApp` típicamente como nueva ventana, así que el segundo handler es esencial.

3. **Reutiliza componentes SDK** — `ProductFetchViewModel`, `SdkClient`, `VProductDetailOverlay`, `CartManager`. No reinventó nada.

4. **API key masking en logs** — solo últimos 4 chars + asteriscos. Seguridad bien pensada.

5. **Diagnostic logging** con prefix `🧪 [VGVev]` y `WKScriptMessageHandler` "vevLog" para que JS pueda postear mensajes al log nativo. Excelente para debug.

## Track C — Cambios de claude en esta sesión

- Trello: movimientos de C3, C4, C5 + comentario follow-up en C4 + checklist en C5 (ver Track A arriba).
- Anchor `VioSwiftSDK` agregado a mi CLAUDE.md global (per-instance memoria): `7c1686e` en `origin/develop-vev` (2026-05-28 22:48).
- Este journal entry.
- Cero código Swift / Kotlin tocado. Cero commits a repos del SDK.

## Open questions / follow-ups

### Bloqueante de C5
- **PR `develop-vev` → `develop` no abierta**. Alan pushó pero no abrió PR. Es lo único que separa el merge de la work-in-progress. Sin PR no se va a develop, sin develop no entra al SDK demo principal. Anotado en el checklist de C5.

### No bloqueantes (anotados como comments en cards)
- **Sponsor routing en `VGVevArticleView`** — pasa `sponsorId: vioConfig.primarySponsor?.id` al `VProductDetailOverlay`. Para Maxbo solo está OK; para artículos Vev multi-sponsor (XXL + Elkjøp en mismo flow) hay que mapear `apiKey` URL → sponsor correcto en `cartsBySponsor`. Flag puesto en comment de C4.
- **`articleURL` hardcoded** a `https://a-alan-local.vev.site/test-m` en `VGVevTestConfig` — fine para prototipo ("Demo-only knobs" comment), se reemplazará por el output real del plugin (C2).
- **`openProductHost` hardcoded** a `app.midominio.com` — placeholder. Cuando se haga el plugin real (C1+C2) hay que decidir el host de producción (probable `vio.live` o similar).

## Anchors después del review

```
- VioKotlinSDK:       6fb599e2  (2026-05-05 23:43)
- VioKotlinDemo:      0c1b3a8   (2026-05-05 23:32)
- AndroidTV-Vio:      fc41d5b   (2026-04-30 21:53)
- AndroidTV-Vio-Demo: 5560efb   (2026-04-30 21:54)
- VioSwiftSDK:        7c1686e   (2026-05-28 22:48)  ← NUEVO: rama develop-vev (Alan iOS one-off)
```

## Next session

- Cuando Alan abra PR `develop-vev` → `develop`: review del PR (otra cosa) y aprobación.
- C5 (Doing): coordinar con Alan el run E2E + journal entry con screenshots.
- C1 + C2 (plugin Vev): siguen en To do — esperan que Alan localice el plugin o que decidamos rehacerlo.
- Adtraction phase 2 (3 cards no creadas) sigue bloqueada por respuesta de ellos al email.

## Reference

- Review playbook: [`docs/playbooks/review-kotlin-ios-parity.md`](../../playbooks/review-kotlin-ios-parity.md)
- Cycle previo Adtraction + Trello creation: [`docs/journal/2026-05/2026-05-28-2.md`](../2026-05/2026-05-28-2.md)
- Trello cards: [C3](https://trello.com/c/Cy8rWdVj) · [C4](https://trello.com/c/LnQSQJfH) · [C5](https://trello.com/c/gZyiqtE7) · [C1](https://trello.com/c/SUG6Z50H) · [C2](https://trello.com/c/mx80SLEA)
