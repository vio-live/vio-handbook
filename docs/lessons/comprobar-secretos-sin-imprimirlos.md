---
title: "Comprobar un .env sin imprimir sus valores: un sed de enmascarado falla en silencio"
date: 2026-09-29
owner: angelo
---

## Síntoma

Al revisar el `.env.local` de QA para ver a qué cuenta de Stripe apuntaba, se corrió
`grep -n '^STRIPE_' … | sed -E 's/=(sk_test_[A-Za-z0-9]{12}).*/=\1…/'`. El archivo tiene los
valores **entre comillas** (`STRIPE_API_SECRET="sk_test_…"`), el patrón no casó y el `sed` dejó
pasar las líneas completas: la secret key y el `whsec_` del sandbox quedaron en el registro de
la sesión. Eran de test y se decidió no rotarlas; en prod habría sido un incidente.

## Causa

Un filtro de enmascarado es una red que falla **abierta**: si el formato no es el esperado
(comillas, espacios, `export `), no enmascara nada y no avisa.

## Qué hacer

- Preguntar sin que el valor llegue nunca a la salida: `grep -c '^VAR=' archivo` (¿existe?).
- Si hace falta ver a qué cuenta apunta una clave, extraerla en un script que quite comillas y
  printee sólo el prefijo (`v[:16]`), o comparar contra un valor esperado con `cmp`/`test`.
  Las claves de Stripe llevan el id de cuenta en el prefijo (`sk_test_51TMTbs…` ↔ `acct_1TMTbs…`).
- Editar con diff enmascarado del lado del **resultado** (el `diff` mostró `whsec_…` porque el
  script escribió el valor desde un archivo, no desde un argumento).
- Nunca `cat`/`grep -n` crudo sobre un `.env`, aunque sea de test.

Contexto: [journal 2026-09-29](../journal/2026-09/2026-09-29-stripe-connect.md).
