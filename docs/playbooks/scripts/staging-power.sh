#!/bin/bash
# Apaga/enciende STAGING (QA): cluster AKS + MySQL.
#   staging-power.sh stop   |   staging-power.sh start
# Pensado para cron tipo "command" (payload.kind=command), que es lo unico que
# ejecuta fiable aqui: el agentTurn con toolsAllow falla con el backend claude-cli.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

RG_AKS=rg-vio-qa-sc;      AKS=kubernetesqa-sc
RG_DB=rg-vio-qa-sc;       DB=vio-ecom-db-staging-sc
LOG=/Users/angelosepulveda/.openclaw/workspace-miguel/monitoring/staging-power.log
ACCION="${1:-}"
ts() { date '+%Y-%m-%d %H:%M:%S%z'; }
log() { echo "$(ts) $*" >> "$LOG"; echo "$*"; }

case "$ACCION" in stop|start) ;; *) echo "uso: $0 stop|start"; exit 2;; esac

A0=$(az aks show -g "$RG_AKS" -n "$AKS" --query powerState.code -o tsv 2>&1)
D0=$(az mysql flexible-server show -g "$RG_DB" -n "$DB" --query state -o tsv 2>&1)
log "[$ACCION] estado inicial: cluster=$A0 base=$D0"

if [ "$ACCION" = "stop" ]; then
  # El cluster primero: si se para la base antes, los pods llenan el log de errores.
  [ "$A0" = "Running" ] && { az aks stop -g "$RG_AKS" -n "$AKS" -o none 2>&1 && log "  cluster detenido" || log "  FALLO al detener el cluster"; } \
                        || log "  cluster ya estaba en $A0, no toco"
  [ "$D0" = "Ready" ]   && { az mysql flexible-server stop -g "$RG_DB" -n "$DB" -o none 2>&1 && log "  base detenida" || log "  FALLO al detener la base"; } \
                        || log "  base ya estaba en $D0, no toco"
else
  # Al encender, la base primero: el cluster la necesita en cuanto arrancan los pods.
  [ "$D0" != "Ready" ]   && { az mysql flexible-server start -g "$RG_DB" -n "$DB" -o none 2>&1 && log "  base arrancada" || log "  FALLO al arrancar la base"; } \
                         || log "  base ya estaba Ready, no toco"
  [ "$A0" != "Running" ] && { az aks start -g "$RG_AKS" -n "$AKS" -o none 2>&1 && log "  cluster arrancado" || log "  FALLO al arrancar el cluster"; } \
                         || log "  cluster ya estaba Running, no toco"
fi

A1=$(az aks show -g "$RG_AKS" -n "$AKS" --query powerState.code -o tsv 2>&1)
D1=$(az mysql flexible-server show -g "$RG_DB" -n "$DB" --query state -o tsv 2>&1)
log "[$ACCION] estado final: cluster=$A1 base=$D1"

# Solo se da por bueno si el estado final es el pedido: el exit 0 de az no basta.
if [ "$ACCION" = "stop" ]; then
  [ "$A1" = "Stopped" ] && [ "$D1" = "Stopped" ] && { log "  OK: staging apagado"; exit 0; }
  log "  OJO: no quedo del todo apagado (cluster=$A1 base=$D1)"; exit 1
else
  [ "$A1" = "Running" ] && [ "$D1" = "Ready" ] && { log "  OK: staging encendido"; exit 0; }
  log "  OJO: no quedo del todo encendido (cluster=$A1 base=$D1)"; exit 1
fi
