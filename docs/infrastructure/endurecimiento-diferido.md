---
title: Medidas de endurecimiento diferidas por costo (hasta después del live)
last-updated: 2026-09-30
owner: miguel
---

# Qué es esto

Angelo decidió el 2026-09-30 posponer varias medidas de protección **por una razón concreta y
válida: hay que llegar a producción con el dinero que hay**. No son olvidos ni deuda accidental;
son decisiones conscientes con fecha de revisión.

Este documento existe para que **ninguna se pierda** cuando la situación mejore.

> **Cuándo revisar esto:** cuando Vio esté live y la situación de caja lo permita.
> Repasar la tabla de arriba a abajo y ejecutar lo que siga teniendo sentido.

## Tabla de diferidos

| # | Medida | Costo | Qué riesgo deja abierto | Estado |
|---|---|---|---|---|
| 1 | **HA zona-redundante en la MySQL de prod** | +178 USD/mes | Si cae la zona 3 de Sweden Central, la base se cae con ella. Los dumps permiten reconstruir en otra región, no evitar el corte. | Diferido 30/09 |
| 2 | **Réplica de lectura de la MySQL de prod** | +~178 USD/mes | Sin capacidad de lectura separada ni failover manual rápido. | Diferido 30/09 |
| 3 | **Reservas de 1 año** (nodos de prod + MySQL prod) | **Ahorra** ~85-110 USD/mes | Ninguno técnico: es compromiso de 1 año. Se posterga por no atar caja antes del live. | Revisar post-live |

## Lo que SÍ se hizo, para no repetirlo

- Retención de backup de la MySQL de prod subida de 7 a **35 días** (sin costo).
- **Backup diario fuera de región** a West Europe, verificado de punta a punta. Menos de 1 USD/mes.
  Ver `backup-db-prod.md`.
- Geo-backup nativo: **no se puede**, Sweden Central no lo soporta. No volver a intentarlo.

## Riesgos de seguridad que NO cuestan dinero y siguen abiertos

Estos no tienen excusa económica. Son trabajo, no presupuesto:

1. **Password de producción en texto plano en git** — `vio-infra-tf/variables.tf`, en el `default` de
   `vio_commerce_db_passwords`. Abierto desde el audit del 2026-09-09. Borrar la línea no alcanza:
   git no olvida, hay que **rotar la credencial**.
2. **MySQL de staging abierta a todo internet** — regla de firewall `all` = `0.0.0.0-255.255.255.255`.
   No es producción, pero tiene datos reales.
3. **443 de la instancia Oracle de analytics sin restringir** — requiere un NSG atado a la VNIC,
   porque la security list es compartida y restringirla ahí rompería `events.vio.live`.
