# Debugging de `api-commerce.vio.live`

### Contexto General
El dominio **`api-commerce.vio.live`** enfrenta problemas de conectividad, devolviendo consistentemente un **404 Not Found**. Se comparó con **`api.reachu.io`**, que funciona correctamente apuntando al mismo backend (`base-api`).

### Problemas Identificados
1. **Certificados TLS pendientes:**
   - El certificado para **api-commerce.vio.live** aún está en emisión (proceso ACME).
   - El tráfico es redirigido temporalmente al `cm-acme-http-solver`, lo que bloquea solicitudes normales.

2. **VirtualService en Istio:**
   - Inicialmente, el dominio **api-commerce.vio.live** no estaba configurado como un host válido.
   - Se corrigió esta configuración para incluir el dominio en el `VirtualService` correspondiente.

3. **Backend:**
   - El backend responde correctamente para **api.reachu.io**, pero las pruebas internas muestran errores al conectar desde **api-commerce.vio.live**.
   - El encabezado `Host` puede estar siendo malinterpretado o rechazado por el backend.

### Acciones Realizadas
1. **CertManager:**
   - Verificado el estado del certificado asociado al dominio (en emisión).

2. **Redirección Temporal:**
   - Observado que el `Ingress` intercepta el tráfico hacia Let's Encrypt.

3. **Configuración de Istio:**
   - Actualizado el `VirtualService` para soportar **api-commerce.vio.live** como un host válido junto con **api.reachu.io**.

4. **Pruebas internas:**
   - Realizadas llamadas desde pods hacia el backend usando `curl`:
     - Resultado: **404 Not Found** para **api-commerce.vio.live**.
     - Probado ajustando encabezados en las solicitudes (sin éxito).

5. **Configuración de backend:**
   - Logs del backend analizados. Confirmado que el servicio no gestiona correctamente solicitudes de ciertos dominios.

### Problemas Pendientes
1. Certificado TLS:
   - Asegurar la finalización del proceso de emisión y eliminar redirecciones temporales.

2. Backend:
   - Revisar la lógica del backend para aceptar múltiples dominios como válidos.
   - Asegurar que responde consistentemente al tráfico desde **api-commerce.vio.live**.

3. Configuración en Cloudflare:
   - Validar que los registros DNS están configurados idénticamente para **api-commerce.vio.live** y **api.reachu.io**.

### Pasos Siguientes
1. Monitorear el proceso de emisión del certificado TLS.
2. Validar ajustes en el backend para que soporte tráfico desde **api-commerce.vio.live**.
3. Realizar pruebas internas continuas para confirmar conectividad después de cambios.

---

Este archivo contiene toda la información relevante trabajada hasta el momento. Puedes retomarlo y continuar el debugging desde cualquier punto o asignar tareas específicas para el análisis futuro.