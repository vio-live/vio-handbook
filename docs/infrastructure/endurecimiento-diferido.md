---
title: Registro de pendientes diferidos (retomar cuando haya recursos)
last-updated: 2026-09-30
owner: miguel
---

# Qué es esto

Angelo decidió el 2026-09-30 posponer varias cosas **por una razón concreta y válida: hay que llegar
a producción con el dinero y el tiempo que hay**. No son olvidos ni deuda accidental; son decisiones
conscientes con fecha de revisión.

Este documento existe para que **ninguna se pierda**. Está ordenado por lo que cada una está
esperando, porque no todas esperan lo mismo.

> **Cuándo revisar esto:** cuando Vio esté live y haya margen. Repasar de arriba abajo y ejecutar lo
> que siga teniendo sentido. Varias habrán caducado solas.

---

## A. Esperan dinero

| # | Medida | Coste | Qué riesgo deja abierto |
|---|---|---|---|
| A1 | **HA zona-redundante en la MySQL de prod** | +178 USD/mes | Si cae la zona 3 de Sweden Central, la base se cae con ella. Los dumps diarios permiten reconstruir en otra región, no evitar el corte. |
| A2 | **Réplica de lectura de la MySQL de prod** | +~178 USD/mes | Sin capacidad de lectura separada ni failover manual rápido. |
| A3 | **Reservas de 1 año** (nodos de prod + MySQL prod) | **Ahorra 85-110 USD/mes** | Ninguno técnico: es compromiso de un año. Se posterga por no atar caja antes del live. Existe con pago mensual y sin desembolso inicial (Savings Plan). |

Sobre A3: es el único de la lista que **da** dinero en vez de costarlo. Conviene revisarlo en cuanto
la forma de la infraestructura deje de moverse — reservar un tamaño que después cambia es pagar por
lo que no se usa.

---

## B. Esperan una ventana o una decisión, no dinero

| # | Medida | Ahorro/efecto | Qué hace falta |
|---|---|---|---|
| B1 | **Promover `develop` -> `master` en `vio-base-api`** | lleva a prod el arreglo del resizer | Es un release. Producción ya está protegida por la regla de Cloudflare, así que no corre prisa. |
| B2 | **Mover QA y staging a Suecia** | ~25 USD/mes | El playbook ya está escrito (`vio-staging-oracle.md` y el plan de staging). Ventana: un sábado. |
| B3 | **`redus-vio-staging` -> Redis dentro del cluster** | ~16 USD/mes | Es staging; no hay motivo para un servicio gestionado. |
| B4 | **Cerrar más el horario del cluster QA** | ~17 USD/mes | Hoy 06:00-23:00 UTC L-V. Pasar a 07:00-20:00 depende de si le molesta a Alan. |
| B5 | **Purgar `reachuqa2`** | ~2-11 USD/mes | 123 GB en 236 tags contra 100 GB incluidos: hay overage. Bajar a Basic exige <10 GB. |

---

## C. No cuestan dinero: son trabajo pendiente

Estos no tienen excusa económica. Cuando haya un rato, se hacen.

1. **Password de producción en texto plano en git** — `vio-infra-tf/variables.tf`, en el `default` de
   `vio_commerce_db_passwords`. Abierto desde el audit del 2026-09-09. Borrar la línea no alcanza:
   git no olvida, hay que **rotar la credencial**.
2. **MySQL de staging abierta a todo internet** — regla de firewall `all` =
   `0.0.0.0-255.255.255.255`. No es producción, pero tiene datos reales.
3. **443 de la instancia Oracle de analytics sin restringir** — requiere un NSG atado a la VNIC,
   porque la security list es compartida y restringirla ahí rompería `events.vio.live`.
4. **`vio-infra-tf` en rojo** en la rama `chore/eliminar-hosts-reachu`, con 2 PRs de infra abiertos.
5. **`DISCORD_WEBHOOK`** sigue con fecha 2026-03-18, escalado desde julio.
6. **`vio_production` en ClickHouse sigue vacía.**

---

## D. En manos de otro

| Qué | Dónde | Estado |
|---|---|---|
| Tests del resizer | [`vio-base-api#25`](https://github.com/vio-live/vio-base-api/pull/25) | Abierto, revisión pedida a Alan. No lo mergeamos nosotros: ADR-0001. |
| `fix(ci)` del registry en helm | [`vio-base-api#22`](https://github.com/vio-live/vio-base-api/pull/22) | Abierto desde antes. |

---

## Lo que YA se hizo, para no repetirlo

- Retención de backup de la MySQL de prod subida de 7 a **35 días** (sin coste).
- **Backup diario fuera de región** a West Europe, verificado de punta a punta, menos de 1 USD/mes.
  Ver `backup-db-prod.md`.
- Geo-backup nativo: **no se puede**, Sweden Central no lo soporta. No volver a intentarlo.
- `container.vio.live` movido de Front Door a Cloudflare: **-36,9 USD/mes**. Ver
  `cdn-container-cloudflare.md`.
- La MySQL de staging entra en el horario del cluster QA: **-35 USD/mes**. Ver `qa-aks-scheduler.md`.
- El resizer, cerrado en el borde (regla de Cloudflare) y en el origen (`vio-base-api#24`, mergeado
  en `develop`).
