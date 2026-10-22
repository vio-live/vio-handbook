---
title: Consentimiento del SDK y privacy_mode de la surface — dos cosas a arreglar el 23/10
last-updated: 2026-10-23
owner: Miguel (T2) / Angelo-Aller (T1)
status: abierto
---

# Dos cosas distintas, salieron juntas la noche del 22 al 23/10

Angelo: «eso deberiamos arreglarlo manana». Apunto las dos, porque son independientes y tienen
dueno distinto.

## Lo medido (contrato real, no suposiciones)

**SDK `@vio-live/web-sdk@0.28.0`, leido del paquete publicado:**

- `requireConsent` por defecto **`false`**. En ese modo el SDK asume que el CMP del host ya decidio
  si cargarlo: mide y **escribe en `localStorage` desde el primer momento**.
- Con `requireConsent: true` arranca **sin cookies**: mide la visita con ids efimeros en memoria, no
  escribe nada en el dispositivo hasta `setConsent(true)`, y **no manda `buyer_id`**.
  `setConsent(false)` lo olvida.
- `canPersist = !requireConsent || consentGranted`.
- **El consentimiento NO corta los eventos.** Incluso con `requireConsent: true` la visita se mide.
  Si el colector se queda a 0 no es consentimiento: es que `start()` no corrio o el host del
  colector esta mal.

**Colector, `privacy_mode` de la surface (`standard` | `minimal`), control independiente:**

- Con `minimal`, `applyPrivacyMode` quita las claves de `context` y, de `client`,
  `utm_source/medium/campaign/term/content`, `screen_w`, `screen_h`, `tz`; descarta `buyer_id`;
  y **no hay fan-out a Mixpanel** (`allowsVendorSinks = mode !== "minimal"`).
- La surface 1 «Mote Livsstil Hub» (publisher 1330) esta en **`standard`**, `status active`,
  `markets []`, api_key `mote_livsstil_hub_api_key_...`.

## T1 — Consentimiento de Aller (decide Angelo con Aller; es legal, no tecnico)

Aller Media es publisher europeo con CMP. Dos montajes validos, hay que elegir **uno**:

1. su CMP carga el script de Vio **solo despues** de aceptar -> el defecto (`requireConsent` sin
   poner) es correcto;
2. se carga siempre con `requireConsent: true` y se llama `setConsent(true)` al aceptar -> mide sin
   cookies mientras tanto, sin `buyer_id`.

**Lo que hay que evitar:** cargarlo **antes** de que acepten con el defecto puesto. Ahi se escribe
en `localStorage` sin consentimiento. Para la prueba de hoy con la surface de pruebas no cambia
nada funcional; para el lanzamiento con Aller si.

Criterio de hecho: decidido y escrito cual de los dos montajes usa el Replit de Aller.

## T2 — El colector degrada a `minimal` una surface que ya conoce (mio)

Del propio codigo: *«A surface never seen by key gets `minimal`: with nothing known about it,
storing less is the only safe default»*. `privacyModeFor(clientAppId)` devuelve `minimal` si no hay
entrada, y tambien **si la entrada caduco** (`API_KEY_CACHE_TTL_MS`, 60 s por defecto) y no es
servible como stale.

Consecuencia practica, y confunde: los **primeros** eventos de un load con una clave recien vista
pueden entrar **sin `utm_*` y sin llegar a Mixpanel** hasta que la clave resuelva contra el micro de
campanas. No es un fallo del SDK ni de la pagina.

El defecto conservador esta bien para una clave **desconocida**. Lo que chirria es degradar a
`minimal` una surface **ya resuelta** solo porque la entrada caduco: ahi ya sabemos que es
`standard`, y la decision correcta es servir el valor stale mientras se refresca (que es lo que
`isServableStale` ya hace en parte) en vez de recortar datos de una surface conocida.

Criterio de hecho: dos cargas seguidas de la misma surface producen eventos con `utm_*` y con
fan-out a Mixpanel, sin ventana en la que se pierdan. Verificable con el export de Mixpanel + el
`forwarded` de `/health`.

**Hoy, mientras no este arreglado:** al mirar los primeros eventos de la prueba, volver a mirar al
minuto antes de concluir que algo esta roto.
