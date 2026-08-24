import pytest

from app.engine import calcular_recomendacion
from app.graph import get_knowledge
from app.schemas import AnalisisSuelo, SolicitudRecomendacion


@pytest.fixture
def kb():
    return get_knowledge()


def _solicitud(cultivo_id="tomate", rendimiento=60, suelo=(0, 0, 0), **kwargs):
    return SolicitudRecomendacion(
        cultivo_id=cultivo_id,
        rendimiento_t_ha=rendimiento,
        analisis_suelo=AnalisisSuelo(
            n_disponible_kg_ha=suelo[0],
            p2o5_disponible_kg_ha=suelo[1],
            k2o_disponible_kg_ha=suelo[2],
        ),
        **kwargs,
    )


class TestFormulaStanford:
    def test_dosis_exacta_tomate_sin_suelo(self, kb):
        r = calcular_recomendacion(kb, _solicitud())
        assert r.dosis_fertilizante_kg_ha["N"] == pytest.approx(300.0)
        assert r.dosis_fertilizante_kg_ha["P"] == pytest.approx(240.0)
        assert r.dosis_fertilizante_kg_ha["K"] == pytest.approx(540.0)

    def test_dosis_con_suelo_coincide_con_ejemplo_validado(self, kb):
        r = calcular_recomendacion(kb, _solicitud(suelo=(30, 20, 40)))
        assert r.dosis_fertilizante_kg_ha["N"] == pytest.approx(250.0)
        assert r.dosis_fertilizante_kg_ha["P"] == pytest.approx(160.0)
        assert r.dosis_fertilizante_kg_ha["K"] == pytest.approx(460.0)

    def test_demanda_es_extraccion_por_rendimiento(self, kb):
        r = calcular_recomendacion(kb, _solicitud(rendimiento=25))
        assert r.demanda_total_kg_ha["N"] == pytest.approx(3.0 * 25)

    def test_aporte_suelo_reduce_dosis(self, kb):
        con_suelo = calcular_recomendacion(kb, _solicitud(suelo=(30, 20, 40)))
        sin_suelo = calcular_recomendacion(kb, _solicitud())
        assert con_suelo.dosis_fertilizante_kg_ha["N"] < sin_suelo.dosis_fertilizante_kg_ha["N"]

    def test_aporte_mayor_a_demanda_da_cero_y_avisa(self, kb):
        r = calcular_recomendacion(kb, _solicitud(rendimiento=10, suelo=(500, 500, 500)))
        assert all(v == 0 for v in r.dosis_fertilizante_kg_ha.values())
        assert any("supera la demanda" in a for a in r.advertencias)


class TestConservacionDosis:
    @pytest.mark.parametrize("cultivo", ["tomate", "maiz", "chile", "fresa", "lechuga", "papa", "sandia"])
    def test_suma_fases_igual_dosis_total(self, kb, cultivo):
        r = calcular_recomendacion(kb, _solicitud(cultivo_id=cultivo))
        for n in ["N", "P", "K"]:
            suma = sum(f.dosis_nutriente_kg_ha[n] for f in r.fases)
            assert suma == pytest.approx(r.dosis_fertilizante_kg_ha[n], abs=0.2), f"{cultivo}/{n}"

    def test_calculo_parcial_desde_fase_respeta_acumulado(self, kb):
        total = calcular_recomendacion(kb, _solicitud("maiz", 12))
        parcial = calcular_recomendacion(kb, _solicitud("maiz", 12, fase_desde_orden=3))
        esperado_n = total.dosis_fertilizante_kg_ha["N"] * (100 - 52) / 100
        suma_parcial = sum(f.dosis_nutriente_kg_ha["N"] for f in parcial.fases)
        assert suma_parcial == pytest.approx(esperado_n, abs=0.5)

    def test_fuentes_no_se_repiten_en_una_fase(self, kb):
        r = calcular_recomendacion(kb, _solicitud("papa", 40))
        for fase in r.fases:
            ids = [s.fuente_id for s in fase.fuentes_sugeridas]
            assert len(ids) == len(set(ids))


class TestAsignacionFuentes:
    def test_map_no_usado_para_nitrogeno(self, kb):
        r = calcular_recomendacion(kb, _solicitud("maiz", 12))
        for fase in r.fases:
            for s in fase.fuentes_sugeridas:
                if s.fuente_id == "map":
                    assert s.kg_ha <= max(
                        f.dosis_nutriente_kg_ha["P"] / 0.52 * 1.05 for f in r.fases
                    )

    def test_fertirriego_para_tomate_vs_solido_maiz(self, kb):
        tomate = calcular_recomendacion(kb, _solicitud("tomate"))
        maiz = calcular_recomendacion(kb, _solicitud("maiz"))
        ids_tomate = {s.fuente_id for f in tomate.fases for s in f.fuentes_sugeridas}
        ids_maiz = {s.fuente_id for f in maiz.fases for s in f.fuentes_sugeridas}
        assert "uan32" in ids_tomate and "acido_fosforico" in ids_tomate
        assert "urea" in ids_maiz


class TestAntagonismos:
    def test_k_alto_vs_camg_dispara_en_papa(self, kb):
        r = calcular_recomendacion(kb, _solicitud("papa", 40))
        avisos = [a for a in r.advertencias if a.startswith("[")]
        assert any(a.startswith("[K_vs_CaMg]") for a in avisos)

    def test_p_excesiva_dispara_zn(self, kb):
        r = calcular_recomendacion(kb, _solicitud("papa", 40))
        assert any(a.startswith("[P_vs_Zn]") for a in r.advertencias if a.startswith("["))

    def test_evidencia_registra_evaluacion_de_reglas(self, kb):
        r = calcular_recomendacion(kb, _solicitud("chile", 25))
        paso = next(e for e in r.evidencia if "antagonismos" in e.paso.lower())
        assert paso.valores["reglas_evaluadas"]


class TestTrazabilidad:
    def test_respuesta_incluye_referencias_bibliograficas(self, kb):
        r = calcular_recomendacion(kb, _solicitud("tomate"))
        refs = r.model_dump()["referencias"]
        assert "bertsch2016" in refs or "intagri_curvas" in refs
        assert "stanford1973" in refs

    def test_evidencia_contiene_pasos_formula_y_referencia(self, kb):
        r = calcular_recomendacion(kb, _solicitud())
        for paso in r.evidencia:
            assert paso.formula
            if paso.paso != "Verificacion de antagonismos ionicos":
                assert paso.referencia

    def test_cultivo_inexistente_lanza_error(self, kb):
        with pytest.raises(ValueError):
            calcular_recomendacion(kb, _solicitud("yuca"))
