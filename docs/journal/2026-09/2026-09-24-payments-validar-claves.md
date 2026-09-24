---
date: 2026-09-24
session: "Validar las claves de cada método al guardarlas, y decir qué más falta para vender"
participants: [angelo, claude]
status: live
---

# Un guardado que no miente

## Goal

Angelo: «un validador de apikeys, para cada método, para evitar errores, y después guardar».
Seis de los ocho métodos ya sondeaban a la PSP antes de guardar; Klarna y Vipps devolvían
«unknown» y se guardaban tal cual. Al mirarlo apareció la segunda mitad del problema: unas
claves buenas tampoco garantizan una venta.

## Done

- **Sondas de Klarna y Vipps** — 8/8 métodos verificados antes de guardar. Klarna lee un pedido
  que no puede existir (404 = buena, 401 = mala); Vipps pide un token de acceso, que ejercita a
  la vez cliente, secreto y clave de suscripción. Ninguna cobra ni crea nada. Como el entorno no
  viaja dentro de las credenciales, se prueban test y live y la respuesta dice cuál las aceptó:
  **una clave que solo se equivoca de entorno no es una clave mala** (la lección de Qliro del
  08/09). Un fallo de red se queda en «unknown» y nunca bloquea.
- **Tres comprobaciones más, las que explican por qué un método conectado no vende**: ningún canal
  lo tiene encendido, el mercado está cerrado (Kustom y Adyen solo en Noruega), o no hay Terms URL
  — y entonces Nexi rechaza el pago y Kustom/Qliro muestran los términos de Vio en una venta que
  es del comercio. Detalle y tabla en
  [`architecture/payments.md`](../../architecture/payments.md#verificar-las-claves-no-es-lo-mismo-que-poder-vender).
- **En el dashboard**, al guardar con algo pendiente el diálogo se queda abierto con la lista, en
  vez de tirarla junto con el toast.

## Decisions

- **Los avisos no son un veto.** Solo un rechazo definitivo de la PSP impide guardar; las tres
  comprobaciones son cosas que contarle al vendedor, no razones para rechazar sus claves. Si
  fallan al calcularse, se registra y se sigue.
- **Las listas de mercados se importan de las reglas de oferta**, no se copian, y el default de
  un canal sin mercados es el mismo que usa `channel.service` (`NO, GB, NL`). Dos copias de esa
  lista serían dos verdades.
- **El `userId` sale de la sesión**, nunca del body: el borde decide *quién*, el servicio decide
  *qué* — la misma regla del fix de ownership del 23/09.

## Blockers

- Las dependencias de api-ms no instalan en esta máquina (el kernel no resuelve contra el
  registro configurado) y su CI no tiene job de tests. Todo lo nuevo vive en archivos sin
  dependencias y se verificó compilándolos sueltos: el spec real de las comprobaciones corrió con
  un harness mínimo, **16 passed**.

## Next session

- Mergear [api#27](https://github.com/vio-live/vio-api-microservice/pull/27) ·
  [base-api#17](https://github.com/vio-live/vio-base-api/pull/17) ·
  [webapp#37](https://github.com/vio-live/webapp-vio-commerce/pull/37) y probarlo en QA.
- Kustom de punta a punta en QA sigue esperando la clave del playground en un vendedor, el
  secreto del destino y el interruptor del canal.
- Después, Vipps: dinero reservado que nunca se captura.
