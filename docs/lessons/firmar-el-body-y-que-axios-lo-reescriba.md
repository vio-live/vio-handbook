---
title: "Lección: firmar el body y dejar que el cliente HTTP lo reescriba"
last-updated: 2026-09-07
owner: angelo
status: live
---

# Firmar el body y dejar que el cliente HTTP lo reescriba

**Qliro autentica cada request firmando el cuerpo**: `Authorization: Qliro
base64(sha256(body + apiSecret))`. El conector de shopcart hacía lo correcto en apariencia —
serializaba el payload una vez y pasaba **el string** como `params.data`, con un comentario
que decía "mandar el string EXACTO que se firmó, re-serializar podría reordenar las claves y
romper la firma".

Y aun así todo write devolvía **401 con cuerpo vacío**. La causa: **axios 0.21.3, con un body
de tipo string y `Content-Type: application/json`, aplica su `transformRequest` por defecto y
lo JSON-encodea una segunda vez.** Qliro recibía un string que contenía el JSON, el digest no
coincidía con lo recibido, y rechazaba.

La intención del código era exacta; la biblioteca la deshizo en silencio.

```ts
// El arreglo: mandar los bytes firmados tal cual.
params.data = bodyString;
params.transformRequest = [(data) => data];
```

## Por qué costó encontrarlo

Todo lo obvio daba bien: las credenciales eran válidas, el host era el correcto, el payload era
correcto, la red salía. Cada capa verificada por separado pasaba, y aun así el conjunto fallaba.

## El método que sí sirvió

1. **Comparar credenciales sin exponerlas.** Hash sha256 (8 caracteres) del valor en el pod
   contra el de una credencial que se sabe buena. Así se descubrió antes que el archivo tenía
   literalmente el placeholder `<pega-el-secret>` — 16 caracteres terminados en `t>`.
2. **Reproducir dentro del pod, no desde afuera.** Misma credencial, mismo payload: `fetch`
   devolvía 201 y `axios` 401. Eso aisló el problema al cliente HTTP y descartó red, Istio,
   credenciales y payload de una sola vez.
3. **Ver los bytes crudos.** Un servidor HTTP local dentro del pod, y los dos clientes
   apuntados a él: axios mandaba 23 bytes donde `fetch` mandaba 15. Ahí se vio el JSON dentro
   de un string.

## Qué mirar la próxima vez

- Cualquier integración que **firme el body** (HMAC, digest, webhooks salientes) es candidata a
  este bug. En Vio Commerce solo Qliro firma; Klarna, Kustom y Walley pasan objetos a axios y
  no están afectados. Si mañana se agrega un PSP que firme, revisar esto primero.
- Un **401 con cuerpo vacío** es una pista: los proveedores suelen devolver JSON explicando el
  error. Un cuerpo vacío sugiere que el rechazo es de firma o de una capa intermedia, no de
  lógica de negocio.
- Tres tests unitarios fijan hoy el contrato en shopcart (el body enviado es el firmado, la
  transformación configurada no lo toca, los reads firman el string vacío).

Detalle completo en [`architecture/payments.md`](../architecture/payments.md) y en el
[journal del 2026-09-07](../journal/2026-09/2026-09-07-pagos-qliro-walley-e2e.md).
PR del arreglo: [shopcart #11](https://github.com/vio-live/vio-shopcart-microservice/pull/11).
