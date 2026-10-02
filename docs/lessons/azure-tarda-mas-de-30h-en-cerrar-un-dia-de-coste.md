---
title: Azure tarda más de 30 h en cerrar un día de coste, y el patrón para medirlo tiene que ser plano
last-updated: 2026-10-02
---

## Síntoma
Consultás Cost Management el 02/10 a las 11:30 y obtenés:

- **02/10 → 0,000 USD.** Sin datos. Vale, el día va empezando.
- **01/10 → 17,62 USD.** Parece un día cerrado y lo multiplicás por 30.

El número que sacás está mal por abajo, y encima el día anterior ya lo habías leído: a las 00:30 del
02/10 ese mismo 01/10 devolvía **6,52 USD**. Subió un 170% en once horas.

## Causa real
Azure no cierra un día de coste a medianoche. Sigue agregando durante **más de 30 horas**. El 01/10
todavía estaba al **75%** cuando se consultó a las 11:30 del 02/10 — es decir, faltaban 6 de 24 horas
de un día que había terminado hacía 35 horas.

El error de fondo es más fino que eso: para medir *cuánto* le falta a un día hay que compararlo con
un recurso de tarifa plana, pero **el recurso patrón tiene que tener la serie ya plana en los días
anteriores**. Si no, estás comparando dos cosas que se están consolidando a la vez.

Lo que se usó mal el 01/10 — `redus-vio-prod-sc`, elegido porque Redis Enterprise no se puede apagar:

```
redus-vio-prod-sc     29/09 = 1.121    30/09 = 1.777    01/10 = 1.407
```

No es plano ni entre el 29 y el 30. "No se puede apagar" no implica "ya está facturado": el 29/09
también seguía agregando hacia atrás. Usarlo como regla daba un factor falso.

Patrones que sí sirvieron — serie idéntica tres días seguidos, luego la caída es el déficit real:

```
                      28/09    29/09    30/09    01/10   factor
claude-trader-plan    0.470    0.470    0.470    0.353    75.0%
acrvioapi             0.181    0.181    0.181    0.144    79.2%
```

## Cómo evitarlo
1. **No leer coste de los últimos 2 días.** El primer día fiable es el de anteayer, y conviene
   comprobarlo igual.
2. **Elegir el patrón mirando su serie, no su tipo de recurso.** Requisitos: tarifa plana, sin
   cambios de estado en la ventana, y **tres días previos con el mismo importe al milésimo**. Un App
   Service Plan Basic o un ACR estándar sirven; un Redis o un VMSS no, aunque "no se apaguen".
3. Si el factor sale <95%, el día no está cerrado: escalar por el factor es una estimación, y hay que
   decir que lo es.
4. **Ojo con el recurso que acaba de arrancar.** Un día parcial lo esconde del todo: el nodepool de
   staging facturó 0,090 USD el 01/10 porque arrancó al final del día, cuando su tarifa real es 4,41
   USD/día (3× B2ms × 17 h). Escalar por 0,75 **no** lo arregla — hay que sustituirlo por su precio
   de lista. Eso solo se calculó ~170 USD/mes de menos en la estimación del 02/10.

## Relacionado
- [Un día en el que borraste recursos no sirve para leer run-rate](dia-con-borrados-no-sirve-para-run-rate.md)

Esta lección **matiza** una regla que se venía usando sin documentar ("un recurso que no se puede
apagar dice si el día está completo"): no basta con que el recurso no se pueda apagar, su serie de
días anteriores tiene que estar plana.
