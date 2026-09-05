import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db.DB_PATH = tmp_path_factory.mktemp("data") / "test_ferticalc_gcal.db"
    db.init_db()
    with TestClient(app) as c:
        yield c


def _sin_google(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)


class TestGcalSinConfig:
    def test_estado_no_configurado(self, client, monkeypatch):
        _sin_google(monkeypatch)
        r = client.get("/api/gcal/estado")
        assert r.status_code == 200
        assert r.json() == {"configurado": False, "vinculado": False, "email": ""}

    def test_auth_url_sin_config_503(self, client, monkeypatch):
        _sin_google(monkeypatch)
        assert client.get("/api/gcal/auth-url").status_code == 503

    def test_callback_sin_code_400(self, client):
        assert client.get("/api/gcal/callback").status_code == 400

    def test_sincronizar_sin_config_503(self, client, monkeypatch):
        _sin_google(monkeypatch)
        rec = client.post(
            "/api/recomendacion",
            json={"cultivo_id": "tomate", "rendimiento_t_ha": 60},
        ).json()
        pid = client.post(
            "/api/planes", json={"nombre": "plan-gcal", "recomendacion": rec}
        ).json()["id"]
        sid = client.post(
            "/api/siembras",
            json={"plan_id": pid, "fecha_inicio": "2026-03-01", "dias_estimados_fase": 20},
        ).json()["id"]
        r = client.post(f"/api/gcal/sincronizar/{sid}", json={})
        assert r.status_code == 503

    def test_desvincular_idempotente(self, client):
        assert client.post("/api/gcal/desvincular").status_code == 200
        assert client.post("/api/gcal/desvincular").status_code == 200


class TestGcalUnitario:
    def test_construir_evento_formato(self):
        from app.gcal import construir_evento

        fase = {
            "orden": 2,
            "nombre_fase": "Macollamiento",
            "bbch": "20-29",
            "fecha_estimada": "2026-04-15",
            "dosis_nutriente_kg_ha": {"N": 10, "P": 5, "K": 8},
            "fuentes_sugeridas": [{"nombre": "Urea", "kg_ha": 21.7}],
        }
        ev = construir_evento(fase, "Lote norte", "America/Bogota")
        assert ev["start"] == {"dateTime": "2026-04-15T08:00:00", "timeZone": "America/Bogota"}
        assert ev["end"]["dateTime"] == "2026-04-15T09:00:00"
        assert "Fase 2" in ev["summary"] and "Lote norte" in ev["summary"]
        assert "Urea" in ev["description"]
        assert ev["reminders"]["overrides"] == [{"method": "popup", "minutes": 720}]

    def test_url_autorizacion_sin_red(self, monkeypatch):
        from app import gcal as gcal_mod

        monkeypatch.setenv("GOOGLE_CLIENT_ID", "id-prueba.apps.googleusercontent.com")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secreto-prueba")
        url = gcal_mod.url_autorizacion()
        assert url.startswith("https://accounts.google.com/o/oauth2/auth")
        assert "calendar.events" in url
        assert "code_challenge" not in url

    def test_callback_error_redirige(self, client):
        r = client.get("/api/gcal/callback?error=access_denied", follow_redirects=False)
        assert r.status_code == 302
        assert "gcal=error" in r.headers["location"]

    def test_callback_state_invalido_503(self, client, monkeypatch):
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "id-prueba.apps.googleusercontent.com")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secreto-prueba")
        r = client.get("/api/gcal/callback?code=abc&state=invalido")
        assert r.status_code == 503
