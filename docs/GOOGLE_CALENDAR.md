# Vincular Google Calendar (OAuth)

FertiCalc puede crear los recordatorios de cada fase **directamente en tu
Google Calendar** (con notificaciones push de Google incluidas), sin pasar
por enlaces manuales ni archivos `.ics`.

## Lo que necesitas (una sola vez, ~15 min)

1. Ve a [Google Cloud Console](https://console.cloud.google.com/) y crea un
   proyecto (nombre sugerido: `ferticalc`).
2. En **APIs y servicios → Biblioteca**, habilita **Google Calendar API**.
3. En **APIs y servicios → Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Externo**.
   - Completa nombre de la app y correo de asistencia.
   - En **Ámbitos**, agrega **solo** estos dos (principio de mínimo privilegio):
     - `https://www.googleapis.com/auth/calendar.events`
     - `https://www.googleapis.com/auth/userinfo.email`
   - En **Usuarios de prueba**, agrega tu correo de Gmail.
4. En **APIs y servicios → Credenciales → Crear credenciales → ID de cliente
   OAuth → Aplicación web**:
   - **Orígenes autorizados de JavaScript**: `http://localhost:3000`
   - **URIs de redirección autorizados**: `http://localhost:8000/api/gcal/callback`
   - Copia el **ID de cliente** y el **Secreto de cliente**.
5. Pégalos en `backend/.env` (nunca en el repo: ese archivo está ignorado
   por git):

```ini
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REDIRECT_URI=http://localhost:8000/api/gcal/callback
FRONTEND_URL=http://localhost:3000
GCAL_TIMEZONE=America/Bogota
```

6. Reinicia la API (`docker compose up -d --build api`) y en FertiCalc abre
   una siembra → **Vincular mi Google Calendar** → acepta con tu cuenta →
   **Sincronizar esta siembra**.

## Qué hace la sincronización

- Crea un evento por cada fase **pendiente** (08:00, zona `GCAL_TIMEZONE`)
  con dosis, fuentes y BBCH en la descripción.
- Cada evento lleva un recordatorio push **12 h antes**.
- No duplica: si la fase ya se sincronizó, se omite (botón de sincronizar
  de nuevo con `forzar` recrea el evento).
- Para desvincular: botón **Desvincular** (borra el token local; los eventos
  ya creados quedan en tu calendario hasta que los borres ahí).

## Limitaciones honestas

- En modo **prueba** (sin verificación de Google), los tokens de
  actualización **caducan a los 7 días**: vuelve a vincular cada semana.
  Para uso serio, publica la app en la consola (requiere verificación).
- Los tokens viven en `backend/data/ferticalc.db` (SQLite local, archivo
  ignorado por git). No los compartas ni los copies a otros equipos.
- `localhost` en las URIs solo funciona corriendo FertiCalc en tu máquina.
  Para un servidor público necesitarías tu dominio + HTTPS y actualizar las
  URIs en la consola.
