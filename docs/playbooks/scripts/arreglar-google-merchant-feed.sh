#!/bin/bash
# Arregla el feed de Google Merchant: las Cloud Functions GoogleMerchantFeed-Test/-Prod
# siguen apuntando a los Service Bus de Noruega, que ya no existen.
#
# Las claves NO se escriben aqui: se sacan de Azure en el momento con `az`.
# Requisitos: estar logueado en gcloud con acceso a `reachu-functions`, y en az.
#
#   PASO 1 (solo mira, no toca nada):   ./arreglar-google-merchant-feed.sh ver
#   PASO 2 (aplica):                    ./arreglar-google-merchant-feed.sh aplicar
set -uo pipefail
PROYECTO=reachu-functions
REGION=europe-north1
ACCION="${1:-ver}"

# ── Requisitos ────────────────────────────────────────────────────────────────
falta=0
command -v gcloud >/dev/null 2>&1 || { echo "FALTA gcloud. Instalar:  brew install --cask gcloud-cli"; falta=1; }
command -v az     >/dev/null 2>&1 || { echo "FALTA az (Azure CLI)."; falta=1; }
[ "$falta" = "1" ] && exit 1
gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | grep -q . \
  || { echo "gcloud sin sesion. Hacer:  gcloud auth login"; exit 1; }
az account show >/dev/null 2>&1 || { echo "az sin sesion. Hacer:  az login"; exit 1; }
# `projects describe` pide un permiso mas fino que `list` y da falsos negativos: usamos list.
gcloud projects list --filter="projectId=$PROYECTO" --format="value(projectId)" 2>/dev/null | grep -qx "$PROYECTO" \
  || { echo "Tu cuenta de gcloud no lista el proyecto $PROYECTO."
       echo "Cuenta activa: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"
       echo "Si el proyecto existe con otro id, cambiar PROYECTO arriba en este script."; exit 1; }
echo "Requisitos OK — cuenta gcloud: $(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -1)"
echo

cadena() { # $1=namespace  $2=resource-group
  az servicebus namespace authorization-rule keys list -g "$2" --namespace-name "$1" \
     --name RootManageSharedAccessKey --query primaryConnectionString -o tsv 2>/dev/null
}

for par in "GoogleMerchantFeed-Test:vio-qa-product-processing-sc:rg-vio-qa-sc" \
           "GoogleMerchantFeed-Prod:vio-product-processing-sc:rg-vio-commerce-prod-sc"; do
  FN="${par%%:*}"; RESTO="${par#*:}"; NS="${RESTO%%:*}"; RG="${RESTO##*:}"
  echo "=============== $FN ==============="

  # gen2 primero; si no, gen1
  GEN=2
  DATOS=$(gcloud functions describe "$FN" --gen2 --region "$REGION" --project "$PROYECTO" \
            --format="value(serviceConfig.environmentVariables)" 2>/dev/null)
  if [ -z "$DATOS" ]; then
    GEN=1
    DATOS=$(gcloud functions describe "$FN" --region "$REGION" --project "$PROYECTO" \
              --format="value(environmentVariables)" 2>/dev/null)
  fi
  [ -z "$DATOS" ] && { echo "  no pude leer la funcion (permisos o nombre/region distintos)"; continue; }

  echo "  generacion: $GEN"
  echo "  variables que mencionan servicebus (con la clave tapada):"
  echo "$DATOS" | tr ';,' '\n\n' | grep -i "servicebus\|SharedAccessKey" \
    | sed -E 's/(SharedAccessKey=)[^;"]*/\1<oculto>/g' | sed 's/^/    /' | head -6

  VAR=$(echo "$DATOS" | tr ';,' '\n\n' | grep -oiE "[A-Z_]*(SERVICE_BUS|SERVICEBUS)[A-Z_]*(CONNECTION|CONN)[A-Z_]*" | head -1)
  echo "  variable a cambiar: ${VAR:-<NO LA ENCONTRE: miralo a mano>}"

  [ "$ACCION" != "aplicar" ] && { echo "  (modo ver: no se toca nada)"; continue; }
  [ -z "$VAR" ] && { echo "  NO aplico: no se cual es la variable"; continue; }

  NUEVA=$(cadena "$NS" "$RG")
  case "$NUEVA" in Endpoint=sb://*) ;; *) echo "  NO aplico: no pude sacar la cadena de $NS"; continue;; esac
  echo "  aplicando -> $NS"

  if [ "$GEN" = "2" ]; then
    gcloud functions deploy "$FN" --gen2 --region "$REGION" --project "$PROYECTO" \
      --update-env-vars "$VAR=$NUEVA" 2>&1 | tail -3
  else
    gcloud functions deploy "$FN" --region "$REGION" --project "$PROYECTO" \
      --update-env-vars "$VAR=$NUEVA" 2>&1 | tail -3
  fi
  echo "  hecho. Comprobar que el error desaparece en products:"
  echo "    kubectl logs -n default deploy/products -c products --since=12m | grep servicebus"
done
