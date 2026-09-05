import os
import secrets
import time
from datetime import datetime, timezone
from urllib.parse import urlencode

from . import db

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]

AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"

HORA_APLICACION = "08:00"
MINUTOS_RECORDATORIO = 720
VIGENCIA_STATE_SEG = 600

_estados_pendientes: dict[str, float] = {}


def leer_config() -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise ValueError(
            "Google Calendar no configurado. Define GOOGLE_CLIENT_ID y "
            "GOOGLE_CLIENT_SECRET en backend/.env (ver docs/GOOGLE_CALENDAR.md)."
        )
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": os.getenv(
            "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/gcal/callback"
        ).strip(),
        "timezone": os.getenv("GCAL_TIMEZONE", "America/Bogota").strip(),
        "frontend_url": os.getenv("FRONTEND_URL", "http://localhost:3000").strip(),
    }


def _limpiar_estados():
    ahora = time.time()
    for k in [k for k, v in _estados_pendientes.items() if ahora - v > VIGENCIA_STATE_SEG]:
        del _estados_pendientes[k]


def url_autorizacion() -> str:
    cfg = leer_config()
    _limpiar_estados()
    state = secrets.token_urlsafe(24)
    _estados_pendientes[state] = time.time()
    return AUTH_URL + "?" + urlencode(
        {
            "response_type": "code",
            "client_id": cfg["client_id"],
            "redirect_uri": cfg["redirect_uri"],
            "scope": " ".join(SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )


def intercambiar_codigo(code: str, state: str = "") -> str:
    import requests

    cfg = leer_config()
    _limpiar_estados()
    if not state or state not in _estados_pendientes:
        raise ValueError(
            "Estado OAuth inválido o vencido. Vuelve a pulsar «Vincular mi Google Calendar»."
        )
    del _estados_pendientes[state]
    resp = requests.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "redirect_uri": cfg["redirect_uri"],
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if resp.status_code != 200:
        detalle = resp.json().get("error_description", resp.text[:200])
        raise ValueError(f"Google rechazó el código ({resp.status_code}): {detalle}")
    datos = resp.json()
    token, refresh = datos.get("access_token", ""), datos.get("refresh_token", "")
    if not token or not refresh:
        raise ValueError("Google no devolvió tokens. Intenta desvincular y volver a vincular.")
    info = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    email = info.json().get("email", "") if info.status_code == 200 else ""
    expira_en = int(datos.get("expires_in", 3600))
    expira = datetime.fromtimestamp(
        time.time() + expira_en, tz=timezone.utc
    ).isoformat()
    db.guardar_token_gcal(token, refresh, expira, email)
    return email


def obtener_credenciales():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    cfg = leer_config()
    guardado = db.obtener_token_gcal()
    if not guardado or not guardado.get("refresh_token"):
        return None
    creds = Credentials(
        token=guardado["access_token"],
        refresh_token=guardado["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        scopes=SCOPES,
    )
    if not creds.valid:
        try:
            creds.refresh(Request())
        except Exception:
            return None
        expira = (
            creds.expiry.astimezone(timezone.utc).isoformat()
            if creds.expiry
            else datetime.now(timezone.utc).isoformat()
        )
        db.guardar_token_gcal(
            creds.token, creds.refresh_token or "", expira, guardado.get("email", "")
        )
    return creds


def servicio_calendar():
    from googleapiclient.discovery import build

    creds = obtener_credenciales()
    if not creds:
        raise ValueError("Cuenta de Google no vinculada. Vincula primero desde Seguimiento.")
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def construir_evento(fase: dict, titulo_plan: str, timezone_nombre: str) -> dict:
    dosis = fase.get("dosis_nutriente_kg_ha", {}) or {}
    fuentes = fase.get("fuentes_sugeridas", []) or []
    lineas = [
        f"BBCH {fase.get('bbch', '')} · fecha estimada {fase.get('fecha_estimada', '')}",
        "Dosis: N {} · P2O5 {} · K2O {} kg/ha".format(
            dosis.get("N", "?"), dosis.get("P", "?"), dosis.get("K", "?")
        ),
    ]
    lineas += [f"- {s.get('nombre')}: {s.get('kg_ha')} kg/ha" for s in fuentes]
    lineas.append("")
    lineas.append("Generado por FertiCalc — valida con tu agrónomo.")
    inicio = datetime.fromisoformat(
        f"{fase['fecha_estimada'][:10]}T{HORA_APLICACION}:00"
    )
    return {
        "summary": f"🌱 FertiCalc: Fase {fase.get('orden')} · {fase.get('nombre_fase')} ({titulo_plan})",
        "description": "\n".join(lineas),
        "start": {"dateTime": inicio.isoformat(), "timeZone": timezone_nombre},
        "end": {
            "dateTime": inicio.replace(hour=9).isoformat(),
            "timeZone": timezone_nombre,
        },
        "reminders": {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": MINUTOS_RECORDATORIO}],
        },
    }


def sincronizar_calendario(calendario: list[dict], titulo_plan: str, siembra_id: str, forzar: bool = False) -> dict:
    cfg = leer_config()
    servicio = servicio_calendar()
    previos = db.eventos_gcal_siembra(siembra_id)
    creados = actualizados = omitidos = 0
    for fase in calendario:
        if fase.get("estado") != "pendiente":
            omitidos += 1
            continue
        orden = fase["orden"]
        cuerpo = construir_evento(fase, titulo_plan, cfg["timezone"])
        anterior = previos.get(orden)
        if anterior and not forzar:
            omitidos += 1
            continue
        if anterior and forzar:
            try:
                servicio.events().delete(calendarId="primary", eventId=anterior).execute()
            except Exception:
                pass
        creado = servicio.events().insert(calendarId="primary", body=cuerpo).execute()
        db.guardar_evento_gcal(siembra_id, orden, creado["id"])
        if anterior:
            actualizados += 1
        else:
            creados += 1
    return {"creados": creados, "actualizados": actualizados, "omitidos": omitidos}
