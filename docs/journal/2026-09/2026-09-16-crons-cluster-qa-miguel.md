# 2026-09-16 — Crons del cluster QA: ahora ejecutan az de verdad — Miguel

- Quién: Miguel (a pedido de Angelo)
- Dónde: crons de OpenClaw del agente miguel, `qa-cluster-stop` (f5b9d9a3) y `qa-cluster-start` (51878702); cluster `kubernetesqa` (RG `qa`)
- Cuándo: 2026-09-16, 10:30
- Contexto: al preparar el status de Miguel del 15/09 se vio que los dos crons no encendían ni apagaban nada. Un modelo barato (groq/llama-3.3-70b) solo le mandaba a la sesión de Discord de Miguel el texto de la orden, con `az` prohibido, y en los resúmenes de los runs de septiembre solo dos (07/09 y 08/09) verifican el estado real del cluster. El 16/09 a las 09:43 a Angelo le llegó el texto de la orden en vez del resultado. Además, los horarios estaban cambiados a 19:00/09:00, sin registro de quién lo hizo; las descripciones seguían diciendo 01:00/08:00.
- Hecho:
  - Horarios que eligió Angelo: apagar `0 1 * * 1-6` y encender `0 8 * * 1-5` (Europe/Oslo).
  - Cada cron consulta `powerState`, ejecuta `az aks stop/start` solo si hace falta, vuelve a consultar el estado, anota una línea en la memoria diaria de Miguel y reporta estado inicial → acción → estado final por Discord a Angelo.
  - Modelo: el default del agente (se quitó el override de groq). Herramientas: `exec,read,write`, puestas con `openclaw cron edit --tools` porque la herramienta `cron` del agente descarta `exec`. Timeout: 900 s.
  - Prueba manual del de encendido: `Running Succeeded -> ninguna -> Running Succeeded`, entregado por Discord.
- Pendiente: confirmar mañana el primer apagado real (01:00) y el encendido (08:00).
