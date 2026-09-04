import os
from datetime import datetime, timezone

from . import db

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
]

HORA_APLICACION = "08:00"
MINUTOS_RECORDATORIO = 720


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


def _flow(cfg: dict):
    from google_auth_oauthlib.flow import Flow

    return Flow.from_client_config(
        {
            "web": {
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=cfg["redirect_uri"],
    )


def url_autorizacion() -> str:
    cfg = leer_config()
    flow = _flow(cfg)
    url, _ = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="false"
    )
    return url


def intercambiar_codigo(code: str) -> str:
    import requests

    cfg = leer_config()
    flow = _flow(cfg)
    flow.fetch_token(code=code)
    creds = flow.credentials
    resp = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {creds.token}"},
        timeout=20,
    )
    email = resp.json().get("email", "") if resp.status_code == 200 else ""
    expira = (
        creds.expiry.astimezone(timezone.utc).isoformat()
        if creds.expiry
        else datetime.now(timezone.utc).isoformat()
    )
    db.guardar_token_gcal(creds.token, creds.refresh_token or "", expira, email)
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
