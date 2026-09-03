import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    db.DB_PATH = tmp_path_factory.mktemp("data") / "test_ferticalc.db"
    db.init_db()
    with TestClient(app) as c:
        yield c


class TestBasico:
    def test_health_modo_json_sin_neo4j(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["modo_conocimiento"] == "json"

    def test_catalogo_completo(self, client):
        cultivos = client.get("/api/cultivos").json()
        assert {c["id"] for c in cultivos} >= {"tomate", "maiz", "chile", "papa"}


class TestRecomendacion:
    def test_recomendacion_valida(self, client):
        r = client.post(
            "/api/recomendacion",
            json={"cultivo_id": "tomate", "rendimiento_t_ha": 60},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["dosis_fertilizante_kg_ha"]["N"] == pytest.approx(300.0)
        assert d["referencias"], "regresion: las referencias no deben descartarse"

    def test_rendimiento_invalido_rechazado(self, client):
        r = client.post(
            "/api/recomendacion",
            json={"cultivo_id": "tomate", "rendimiento_t_ha": -5},
        )
        assert r.status_code == 422

    def test_cultivo_inexistente_400(self, client):
        r = client.post(
            "/api/recomendacion",
            json={"cultivo_id": "yuca", "rendimiento_t_ha": 10},
        )
        assert r.status_code == 400


class TestSeguimiento:
    @pytest.fixture
    def plan_id(self, client):
        rec = client.post(
            "/api/recomendacion",
            json={"cultivo_id": "tomate", "rendimiento_t_ha": 60},
        ).json()
        pid = client.post(
            "/api/planes", json={"nombre": "plan-seg", "recomendacion": rec}
        ).json()["id"]
        return pid

    def test_ciclo_completo_siembra(self, client, plan_id):
        r = client.post(
            "/api/siembras",
            json={"plan_id": plan_id, "fecha_inicio": "2026-03-01", "dias_estimados_fase": 20},
        )
        assert r.status_code == 200
        sid = r.json()["id"]

        estado = client.get(f"/api/siembras/{sid}").json()
        cal = estado["calendario"]
        assert len(cal) == 4
        assert cal[0]["fecha_estimada"] == "2026-03-01"
        assert cal[1]["fecha_estimada"] == "2026-03-21"
        assert cal[3]["fecha_estimada"] == "2026-04-30"
        assert all(f["estado"] == "pendiente" for f in cal)

        ok = client.post(f"/api/siembras/{sid}/fase/1", json={"estado": "aplicada"})
        assert ok.status_code == 200
        estado2 = client.get(f"/api/siembras/{sid}").json()
        assert estado2["calendario"][0]["estado"] == "aplicada"

        bb = client.post(f"/api/siembras/{sid}/bbch", json={"bbch_actual": "51"})
        assert bb.json()["bbch_actual"] == "51"

    def test_siembra_plan_inexistente_404(self, client):
        r = client.post(
            "/api/siembras",
            json={"plan_id": "no-existe", "fecha_inicio": "2026-03-01", "dias_estimados_fase": 20},
        )
        assert r.status_code == 404

    def test_fase_estado_invalido_400(self, client, plan_id):
        sid = client.post(
            "/api/siembras",
            json={"plan_id": plan_id, "fecha_inicio": "2026-03-01", "dias_estimados_fase": 20},
        ).json()["id"]
        r = client.post(f"/api/siembras/{sid}/fase/1", json={"estado": "regada"})
        assert r.status_code == 400
    def test_estado_entrenado(self, client):
        r = client.get("/api/gnn/estado")
        assert r.json()["entrenado"] is True

    def test_predecir_con_familia(self, client):
        r = client.post(
            "/api/gnn/predecir",
            json={"extraccion_por_t": {"N": 3, "P": 1.2, "K": 4}, "familia": "solanaceae"},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["familia"] == "solanaceae"
        assert d["explicacion"]["razonamiento"]

    def test_referencia_familia(self, client):
        r = client.get("/api/gnn/familia/poaceae")
        assert r.status_code == 200
        assert r.json()["num_cultivos"] == 1

    def test_plan_personalizado_advierte_ia(self, client):
        r = client.post(
            "/api/gnn/plan",
            json={
                "extraccion_por_t": {"N": 2.8, "P": 0.9, "K": 4.0},
                "rendimiento_t_ha": 30,
                "familia": "solanaceae",
            },
        )
        assert r.status_code == 200
        d = r.json()
        assert any("IA" in a for a in d["plan"]["advertencias"])

    def test_familia_inexistente_404(self, client):
        assert client.get("/api/gnn/familia/zingiberales").status_code == 404


class TestPlanesYFeedback:
    def test_crud_planes(self, client):
        rec = client.post(
            "/api/recomendacion",
            json={"cultivo_id": "maiz", "rendimiento_t_ha": 12},
        ).json()
        creado = client.post(
            "/api/planes", json={"nombre": "prueba", "recomendacion": rec}
        ).json()
        pid = creado["id"]
        assert client.get(f"/api/planes/{pid}").json()["nombre"] == "prueba"
        assert len(client.get("/api/planes").json()) >= 1
        assert client.delete(f"/api/planes/{pid}").status_code == 200
        assert client.get(f"/api/planes/{pid}").status_code == 404

    def test_feedback_registro(self, client):
        r = client.post(
            "/api/feedback", json={"rating": 1, "comentario": "util", "origen": "chat"}
        )
        assert r.status_code == 200
        lista = client.get("/api/feedback").json()
        assert any(f["comentario"] == "util" for f in lista)

    def test_rating_fuera_de_rango_rechazado(self, client):
        assert (
            client.post("/api/feedback", json={"rating": 7}).status_code == 422
        )


class TestChatSinKey:
    def test_sin_gemini_key_devuelve_503(self, client, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        r = client.post("/api/chat", json={"mensaje": "hola"})
        assert r.status_code == 503

    def test_mensaje_vacio_rechazado(self, client, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        assert client.post("/api/chat", json={"mensaje": ""}).status_code == 422
