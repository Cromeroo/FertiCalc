import pytest

from app.gnn import plan_desde_prediccion, predecir_curva, resumen_familia


class TestPrediccion:
    def test_pesos_entrenados_cargan(self):
        from app.gnn import cargar_pesos

        pesos = cargar_pesos()
        assert pesos and pesos.get("W1")

    def test_curva_monotonica_y_termina_en_100(self):
        r = predecir_curva({"N": 3, "P": 1.2, "K": 4})
        for n in ["N", "P", "K"]:
            valores = [f["pct_acumulado"][n] for f in r["curva_predicha"]]
            assert valores == sorted(valores)
            assert valores[-1] == pytest.approx(100.0)

    def test_num_fases_personalizado(self):
        r = predecir_curva({"N": 3, "P": 1.2, "K": 4}, num_fases=6)
        assert len(r["curva_predicha"]) == 6
        assert r["curva_predicha"][-1]["pct_acumulado"]["N"] == pytest.approx(100.0)

    def test_la_familia_cambia_la_prediccion(self):
        a = predecir_curva({"N": 3, "P": 1.2, "K": 4}, familia="solanaceae")
        b = predecir_curva({"N": 3, "P": 1.2, "K": 4}, familia="poaceae")
        difiere = any(
            fa["pct_acumulado"][n] != fb["pct_acumulado"][n]
            for fa, fb in zip(a["curva_predicha"], b["curva_predicha"])
            for n in ["N", "P", "K"]
        )
        assert difiere, "la familia botanica debe afectar la curva"

    def test_explicacion_completa(self):
        r = predecir_curva({"N": 2.8, "P": 0.9, "K": 4}, familia="solanaceae")
        ex = r["explicacion"]
        total = sum(f["influencia_pct"] for f in ex["factores"])
        assert total == pytest.approx(100.0, abs=1.5)
        assert any(f["influencia_pct"] > 50 for f in ex["factores"])
        assert len(ex["referencias_influyentes"]) == 3
        assert sum(x["apoyo_pct"] for x in ex["referencias_influyentes"]) == pytest.approx(100, abs=1)
        assert "prediccion" in ex["razonamiento"].lower() or "apoya" in ex["razonamiento"].lower()


class TestResumenFamilia:
    def test_promedio_solanaceae_correcto(self):
        r = resumen_familia("solanaceae")
        assert r["num_cultivos"] == 3
        assert r["extraccion_kg_t"]["N"]["promedio"] == pytest.approx((3.0 + 3.2 + 5.5) / 3)

    def test_familia_desconocida_error(self):
        with pytest.raises(ValueError):
            resumen_familia("zingiberales")


class TestPlanPersonalizado:
    def test_plan_usa_curva_gnn_y_advierte(self, kb_stub=None):
        from app.graph import get_knowledge

        kb = get_knowledge()
        r = plan_desde_prediccion(
            kb,
            extraccion_por_t={"N": 2.8, "P": 0.9, "K": 4.0},
            num_fases=4,
            familia="solanaceae",
            rendimiento_t_ha=30,
        )
        d = r["plan"].model_dump()
        assert d["cultivo_id"] == "personalizado"
        assert any("PREDICHA POR IA" in a for a in d["advertencias"])
        assert "gnn_prediccion" in d["referencias"]

    def test_plan_conserva_dosis(self):
        from app.graph import get_knowledge

        r = plan_desde_prediccion(
            get_knowledge(),
            extraccion_por_t={"N": 2.8, "P": 0.9, "K": 4.0},
            rendimiento_t_ha=30,
        )
        p = r["plan"]
        for n in ["N", "P", "K"]:
            suma = sum(f.dosis_nutriente_kg_ha[n] for f in p.fases)
            assert suma == pytest.approx(p.dosis_fertilizante_kg_ha[n], abs=0.3)
