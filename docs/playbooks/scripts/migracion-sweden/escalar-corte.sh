#!/bin/bash
# Escala los 13 servicios a las mismas replicas que prod Noruega.
K="kubectl --context vio-sc"
$K scale deploy api --replicas=2 & $K scale deploy base-api --replicas=4 &
$K scale deploy collections --replicas=2 & $K scale deploy extensions --replicas=2 &
$K scale deploy graph-ql --replicas=2 & $K scale deploy middleware --replicas=3 &
$K scale deploy orders --replicas=2 & $K scale deploy payment-processors --replicas=2 &
$K scale deploy products --replicas=2 & $K scale deploy shopcart --replicas=2 &
$K scale deploy templates --replicas=1 & $K scale deploy tracking --replicas=3 &
$K scale deploy users --replicas=2 &
wait
