# Mote & Livsstil: la data del publisher, la paridad con afiliación y el plan

**Fecha:** 2026-10-28 · **Autor:** Claude (agente de analytics) · **Estado:** diagnóstico cerrado, plan a decidir

Aller nos pasó el volcado de su propio panel de analytics (`moteoglivsstil.no/admin/analytics`
más su CMS y una auditoría manual de contenido). Es la primera vez que vemos **con qué nos están
comparando**: lo que su sitio gana hoy con enlaces de afiliado, artículo por artículo. Este
documento cruza eso con el embudo real de Vio en la campaña Careless y saca el plan.

El dataset de referencia, consultable, está en `~/vio-reportes/mote-livsstil/referencia/`
(SQLite + CSV + README con el diccionario de columnas y las trampas). La herramienta que hace el
cruce es `~/vio-reportes/mote-livsstil/paridad.py`. Ninguno de los dos está en git: son datos de
cliente.

---

## 1. Lo que es el sitio

322.830 vistas en 12 meses, 48.625 clics de afiliado, ~121.500 NOK estimados. Y creciendo rápido:

| rango | vistas | clics afiliado | clics/100 vistas | NOK/día (est.) |
|-------|--------:|---------------:|-----------------:|---------------:|
| 12m   | 322.830 | 48.625 | 15,1 | 333 |
| 90d   | 205.843 | 35.955 | 17,5 | 999 |
| 30d   |  73.955 | 16.625 | 22,5 | 1.385 |
| 7d    |  22.029 |  4.145 | 18,8 | 1.480 |
| hoy   |   4.708 |    825 | 17,5 | 2.063 |

Dos cosas que importan para nosotros:

- **Están mejorando su propia conversión**: de 15,1 a 22,5 clics por 100 vistas. No es un sitio
  estancado al que le vendemos una tabla de salvación.
- **Está muy concentrado**: de 92 artículos, 6 mueven el dinero. El primero (bodas, 89.676 vistas)
  es el 28 % de toda la lectura del sitio.

Y un aviso que viene en su propia data: los ~121.500 NOK son **una estimación a 2,5 NOK por clic**,
no comisión real por red y tienda. Todo lo que sigue hereda ese supuesto. Pedirle a Aller la
comisión real por red es la forma más rápida de que estos números dejen de ser estimaciones.

## 2. La comparación que nos van a hacer

Por cada 1000 lectores, lo que el publisher se lleva:

| fuente | NOK por 1000 lectores | Vio llega al |
|--------|----------------------:|-------------:|
| **Vio, artículo 189 (1 compra en 2 días)** | **48,9** | — |
| Afiliación en un artículo comparable (~10 fichas, n=6) | 173,8 | 28 % |
| Afiliación, media del sitio (30d) | 562,0 | 9 % |
| Afiliación, su mejor grid (50 fichas) | 707,5 | 7 % |

Hoy Vio le paga al publisher entre 3 y 11 veces menos por lector que sus propios enlaces de
afiliado. Ese es el número que Aller va a calcular solo, antes o después, y conviene llegar con
la respuesta antes que ellos con la pregunta.

Lo que haría falta para igualar la media del sitio: con cesta de 699 NOK y 15 % de comisión
(105 NOK por pedido), **5,4 pedidos por 1000 lectores = 0,54 % de conversión lector→compra**.
Vamos por 0,047 %. Falta multiplicar por 11,5.

**El objetivo no es heroico, es ordinario.** 0,5–2 % lector→compra es lo normal en comercio de
moda. No hace falta que Vio sea excepcional: hace falta que sea normal.

## 3. Dónde se rompe (y dónde no)

| paso | observado | banda normal en moda | |
|------|----------:|---------------------:|--|
| Impresión → clic | 579 / 14.637 = **4,0 %** | 2–6 % | en banda |
| Clic → carrito | 15 / 579 = **2,6 %** | 5–10 % | 1,9× por debajo |
| Carrito → pago | 6 / 15 = **40 %** | 45–60 % | al borde |
| Pago → compra | 1 / 6 = **17 %** | 50–70 % | 3× por debajo, pero n=6 |

**Arriba no está roto.** 4,0 % de clic sobre impresión está en banda, y 27 clics por 100 lectores
es lo mismo que sacan los mejores grids de afiliación del sitio (28,3 en su artículo estrella).
La propuesta visual funciona: la gente toca las fichas de Vio tanto como toca las suyas.

**Se rompe del clic hacia abajo.** Y mirando producto a producto se ve que no es un fallo global
del widget, porque entonces no convertiría nada:

| impresiones | clics | CTR | carrito | clic→carrito | producto |
|------------:|------:|----:|--------:|-------------:|----------|
| 2.121 | 187 | 8,8 % | 4 | **2,1 %** | Vilde genser – Brun |
| 1.443 |  87 | 6,0 % | 4 | 4,6 % | Sofie genser – Brun |
|   941 |  61 | 6,5 % | 3 | 4,9 % | Hennie cardigan – Beige |
|   784 |  18 | 2,3 % | 1 | 5,6 % | Hennie cardigan – Svart |
| 1.287 |  50 | 3,9 % | 1 | 2,0 % | Cassia jakke – Svart |
| 1.832 |  41 | 2,2 % | 2 | 4,9 % | Active pile fleece half-zip |
| **1.075 + 1.549 + 1.147 + 1.511 + 947** | **135** | — | **0** | **0 %** | Cassia Brun, 3 tights, Vilde Burgunder |

Tres lecturas:

1. **Cinco productos acumulan 135 clics y cero carritos.** Con la tasa media (3,4 % entre los que
   sí convierten) cabría esperar unos 5 carritos ahí. Que haya cero tiene en torno a un 1 % de
   probabilidad por azar. Es señal, no ruido.
2. **El producto más visto y más clicado es de los que peor convierten**: Vilde genser Brun se
   come 2.121 impresiones y 187 clics (un tercio de todos) y convierte al 2,1 %, mientras Hennie
   cardigan Svart convierte al 5,6 % con 784 impresiones.
3. Por tanto la palanca más grande que **controlamos nosotros** es el reparto de impresiones entre
   productos. Hoy el slot que más se ve es el que peor cierra.

Si el paso clic→carrito llegara solo al 5 % (el suelo de la banda) dejando todo lo demás igual,
las compras de esos dos días pasan de 1 a ~1,9 y la paridad sube de 48,9 a ~94 NOK por 1000
lectores. Sigue por debajo de la afiliación: **la conversión sola no cierra la brecha.**

## 4. El problema que la conversión no arregla

Vio está en **1 de 92 artículos**, y ese artículo tiene **4.618 vistas en 12 meses: el 1,43 % de
la lectura del sitio**. Por dinero de afiliación en juego va último de los 40 artículos con
tráfico real.

Donde está el dinero, con el patrón que su propia auditoría de contenido revela:

| ID | vistas 12m | afiliación NOK/1000 | en juego 12m | fichas | artículo |
|----|-----------:|--------------------:|-------------:|-------:|----------|
| 126 | 89.676 | 325 | 29.145 | 40 | Kjoler til bryllupsgjest |
| 188 | 30.351 | 660 | 20.032 | 40 | Høstens fineste kjoler (40) |
| 159 | 19.745 | 553 | 10.909 | 27 | De fineste høstjakkene |
| 175 | 13.483 | 708 |  9.539 | 50 | 50 høstplagg |
| 184 | 16.645 | 460 |  7.657 | 32 | Beste dunjakke til dame |

Esos cinco son 170.000 vistas y ~77.000 NOK de afiliación al año. **36× el tráfico del artículo
que nos dieron.**

Y el patrón de qué formato convierte sale de su propia auditoría, no de nuestra opinión:

- Lo que más clics saca por lector: **grid de 40–50 fichas, primera ficha en el 2–5 % de la
  página, menos de 220 palabras de texto** (175: 50 fichas, 79 palabras → 28,3 clics/100).
- Lo que menos: **8–13 fichas con un producto por H2** y la primera ficha pasado el 12 % de la
  página (148, 153, 167, 170 → 4,9–7,9 clics/100).
- El artículo 189, el nuestro, tiene **10 fichas de una sola marca, 142 palabras, 0 H2**. Está
  del lado malo del patrón por diseño: una campaña de una marca no puede tener 40 fichas.

Esto es lo más importante del documento: **el formato que más convierte es el que más marcas
mezcla, y nuestro modelo de campaña por marca es el que menos encaja.** O vendemos campañas
multimarca, o nos quedamos en el formato que su propia data dice que rinde 3–4 veces menos.

## 5. Plan

En orden de impacto y de lo que depende de nosotros.

**A. Reordenar los slots por conversión, no por catálogo** (nuestro, esta semana).
El slot más visto hoy es el que peor cierra. Ordenar por clic→carrito observado en vez de por el
orden del feed. Es cambio de configuración de campaña, no de producto, y vale ~2× en carritos.
Requiere decidir con qué ventana y con qué mínimo de clics se re-ordena, para no perseguir ruido.

**B. Localizar la fuga del pago** (nuestro, necesita lectura de prod).
1 de 6 pagos empezados termina. Con 6 eventos no se puede concluir nada, pero sí se puede
instrumentar: ya emitimos `begin_checkout` y `add_payment_info`, así que se puede partir el paso
en dos y ver si la gente se cae antes o después de meter la tarjeta. Eso localiza el problema
entre «el formulario» y «el pago». Necesito tu OK para leer prod (ver §7).

**C. Pedirle a Aller un artículo del formato que rinde** (comercial, decisión de Angelo).
Cualquiera de los cinco de §4 multiplica el tráfico por 15–36. El argumento es su propia data: su
mejor artículo rinde 708 NOK/1000 lectores, el que nos dieron rinde 174 en su mejor versión, y
nosotros estamos en 49. No se puede demostrar el modelo en el peor artículo del sitio.

**D. Decidir si vendemos multimarca** (producto/negocio, decisión de Angelo).
Lo de §4: su formato ganador es un grid multimarca. Si Vio solo sabe hacer campañas de una marca,
estamos compitiendo con una mano atada en el formato que su data premia.

**E. Cerrar el hueco de medición nuestro** (analytics, mío).
La única compra registrada (tights negros, 699 NOK) tiene **18 clics y 0 añadidos al carrito**.
Se compró algo que nunca entró al carrito según nuestros eventos. O se pierde `add_to_cart` en
algún camino, o la atribución de producto en la compra no es la misma que en el carrito. Mientras
eso siga así, cualquier tasa de clic→carrito que publiquemos está sesgada a la baja.

**F. Pedir la comisión real de afiliación** (comercial).
Los 2,5 NOK/clic son su estimación. Si la comisión real es la mitad, la brecha de §2 se reduce a
la mitad y la conversación cambia. Es una pregunta de un correo.

## 6. La herramienta

`~/vio-reportes/mote-livsstil/paridad.py` — sin dependencias, solo lee ficheros locales.

```bash
python3 paridad.py                      # paridad, fugas y candidatos (30d)
python3 paridad.py --dias 365           # candidatos a 12 meses
python3 paridad.py --comision 20 --nok-por-clic 1.5   # mover los supuestos
```

Tres secciones: lo que cobra el publisher por 1000 lectores en cada escenario, en qué paso del
embudo se pierde (con la banda normal al lado y descartando los pasos con base insuficiente), y
qué artículos sin Vio valen la pena. Avisa en pantalla cuando el cálculo se apoya en menos de 10
compras, que es el caso hoy.

Cuando tenga el token de lectura de prod (§7) la fuente de nuestro lado pasa de `historico.json`
(2 días) al colector, y entonces el mismo cálculo se puede correr por día, por fuente de tráfico
y por slot.

## 7. Lo que falta

- **Acceso a prod para analytics.** Pedido a Miguel en el canal el 28/10: un token de solo lectura
  en `INTERNAL_READ_TOKENS` (no el token completo), un usuario de ClickHouse de solo lectura, y la
  pregunta de si staging y prod comparten proyecto de Mixpanel. Con la key pública de la surface
  solo llego a `/v1/stats/overview` y `/stats/recent`; los cortes por campaña, slot y fuente de
  tráfico (ADR-0035/0038) piden token interno.
- **Decisión de Angelo** sobre C y D.
- **Un correo a Aller** con F.

## Trampas de esta data

Van completas en el README del dataset de referencia. Las tres que más cambian conclusiones:

1. `est_revenue_nok` es 2,5 NOK × clics. No es ingreso, es su estimación.
2. Las métricas por path están fragmentadas (el mismo artículo vive en varias rutas, hay slugs
   cortos tipo `/s`, `/i`, `/k`). Para cualquier cálculo por artículo hay que usar `articles` /
   `article_metrics`, ya fusionados por `article_id`, nunca `path_metrics`.
3. Los dos ficheros que mandaron no cuadran entre sí a 12 meses (322.622 vs 322.830 vistas): se
   extrajeron con media hora de diferencia sobre datos en vivo. No mezclar las dos fuentes en el
   mismo cálculo.

Y una nuestra: **todo lo de conversión se apoya en 1 compra y 15 carritos.** Sirve para decidir
dónde mirar. No para firmar un número delante del cliente.
