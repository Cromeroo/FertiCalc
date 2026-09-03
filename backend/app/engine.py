from typing import Optional

from .schemas import (
    AnalisisSuelo,
    Eficiencias,
    FuenteAplicacion,
    PasoEvidencia,
    RecomendacionFase,
    RecomendacionResponse,
    SolicitudRecomendacion,
)

NUTRIENTES = ["N", "P", "K"]
PRIORIDAD_DEFAULT = ["map", "kcl", "urea"]


def calcular_recomendacion(kb, sol: SolicitudRecomendacion) -> RecomendacionResponse:
    cultivo = kb.cultivo(sol.cultivo_id)
    if not cultivo:
        raise ValueError(f"Cultivo no encontrado: {sol.cultivo_id}")

    evidencia: list[PasoEvidencia] = []
    advertencias: list[str] = []
    ext = cultivo["extraccion_por_tonelada"]
    rend = sol.rendimiento_t_ha

    demanda = {n: round(ext[n] * rend, 2) for n in NUTRIENTES}
    evidencia.append(
        PasoEvidencia(
            paso="Demanda total del cultivo",
            formula="Demanda(n) = extraccion_por_t(n) x rendimiento",
            valores={"extraccion_por_t": ext, "rendimiento_t_ha": rend},
            resultado=demanda,
            referencia="Tablas de extraccion del cultivo",
        )
    )

    suelo: AnalisisSuelo = sol.analisis_suelo
    aporte = {
        "N": suelo.n_disponible_kg_ha,
        "P": suelo.p2o5_disponible_kg_ha,
        "K": suelo.k2o_disponible_kg_ha,
    }
    requer_neto = {}
    for n in NUTRIENTES:
        neto = max(0.0, demanda[n] - aporte[n])
        if aporte[n] > demanda[n]:
            advertencias.append(
                f"Aporte de suelo de {n} supera la demanda estimada; dosis 0 para este nutriente."
            )
        requer_neto[n] = round(neto, 2)

    evidencia.append(
        PasoEvidencia(
            paso="Requerimiento neto",
            formula="RequerNeto(n) = max(0, Demanda(n) - AporteSuelo(n))",
            valores={"aporte_suelo": aporte},
            resultado=requer_neto,
            referencia="Stanford (1973)",
        )
    )

    ef: Eficiencias = sol.eficiencias
    dosis_total = {n: round(requer_neto[n] / getattr(ef, n), 2) for n in NUTRIENTES}
    evidencia.append(
        PasoEvidencia(
            paso="Dosis de fertilizante por nutriente",
            formula="Dosis(n) = RequerNeto(n) / ERF(n)",
            valores={
                "ERF": {"N": ef.N, "P": ef.P, "K": ef.K},
                "nota": "ERF: eficiencia relativa de aprovechamiento del fertilizante",
            },
            resultado=dosis_total,
            referencia="Stanford (1973), modelo Dosis=(Dem-Sum)/ERF",
        )
    )

    reglas = kb.reglas()
    cultivo_familia = cultivo.get("familia")
    avisos_reglas, detalle_reglas = _evaluar_reglas(reglas, dosis_total, cultivo_familia)
    advertencias.extend(avisos_reglas)
    evidencia.append(
        PasoEvidencia(
            paso="Verificacion de antagonismos ionicos",
            formula="Reglas del grafo sobre dosis final (ratio y umbrales)",
            valores={"reglas_evaluadas": [r["id"] for r in reglas]},
            resultado={"evaluaciones": detalle_reglas},
            referencia="Marschner (1995)",
        )
    )

    fases_kb = [f for f in cultivo["fases"]]
    if sol.fase_desde_orden is not None:
        fases_kb = [f for f in fases_kb if f["orden"] >= sol.fase_desde_orden]
    if not fases_kb:
        raise ValueError("No hay fases en el rango solicitado")

    inicio_acumulado = {n: 0.0 for n in NUTRIENTES}
    if sol.fase_desde_orden is not None:
        previas = [f for f in cultivo["fases"] if f["orden"] < sol.fase_desde_orden]
        if previas:
            ultima = max(previas, key=lambda f: f["orden"])["curva_pct_acumulada"]
            inicio_acumulado = {n: float(ultima.get(n, 100.0)) for n in NUTRIENTES}

    restante = {
        n: round(dosis_total[n] * (100.0 - inicio_acumulado[n]) / 100.0, 2)
        for n in NUTRIENTES
    }

    nombres_fuentes = {f["id"]: f["nombre"] for f in kb.fuentes()}
    aporta_fuentes = {}
    for f in kb.fuentes():
        aporta_fuentes[f["id"]] = {k: float(v) for k, v in f["aporta"].items() if k in NUTRIENTES}

    prioridad = cultivo.get("preferencia_fuentes") or PRIORIDAD_DEFAULT

    fases_out: list[RecomendacionFase] = []
    acumulada_actual = dict(inicio_acumulado)

    for i, fase in enumerate(fases_kb):
        curva = {n: float(fase["curva_pct_acumulada"].get(n, 100.0)) for n in NUTRIENTES}
        es_ultima = i == len(fases_kb) - 1
        tramo = {}
        for n in NUTRIENTES:
            if es_ultima:
                tramo[n] = round(restante[n], 2)
            else:
                rango_total = 100.0 - acumulada_actual[n]
                pct_tramo = curva[n] - acumulada_actual[n]
                tramo[n] = round(restante[n] * (pct_tramo / rango_total if rango_total > 0 else 1.0), 2)
            restante[n] = round(max(0.0, restante[n] - tramo[n]), 2)

        asignadas = _asignar_fuentes(tramo, aporta_fuentes, nombres_fuentes, prioridad)
        fases_out.append(
            RecomendacionFase(
                orden=fase["orden"],
                nombre=fase["nombre"],
                bbch=f"{fase['bbch_inicio']}-{fase['bbch_fin']}",
                dosis_nutriente_kg_ha=tramo,
                fuentes_sugeridas=asignadas,
                referencia_curva=fase["referencia_curva"],
            )
        )
        acumulada_actual = curva

    evidencia.append(
        PasoEvidencia(
            paso="Reparto por fase fenologica",
            formula="Dosis_fase(n) = Dosis_restante(n) x (pctFin - pctInicio) / (100 - pctInicio)",
            valores={
                "modelo": "Curvas de absorcion acumuladas por etapa BBCH",
                "inicio_del_calculo_pct": inicio_acumulado,
            },
            resultado={f"orden_{f.orden}": f.dosis_nutriente_kg_ha for f in fases_out},
            referencia="Bertsch (2016); Intagri; Salazar-Jara & Juarez-Lopez (2013)",
        )
    )

    refs_ids = set(cultivo.get("referencias_extraccion", []))
    refs_ids |= {f["referencia_curva"] for f in cultivo["fases"]}
    refs_ids.add("stanford1973")
    referencias = kb.referencias(refs_ids)

    resp = RecomendacionResponse(
        cultivo_id=cultivo["id"],
        cultivo_nombre=cultivo["nombre"],
        rendimiento_t_ha=rend,
        demanda_total_kg_ha=demanda,
        aporte_suelo_kg_ha=aporte,
        requerimiento_neto_kg_ha=requer_neto,
        dosis_fertilizante_kg_ha=dosis_total,
        fases=fases_out,
        evidencia=evidencia,
        advertencias=[a for a in advertencias + [cultivo.get("notas", "")] if a],
    )
    resp_dict = resp.model_dump()
    resp_dict["referencias"] = referencias
    return RecomendacionResponse.model_validate(resp_dict)


def _evaluar_reglas(reglas: list[dict], dosis: dict, familia: Optional[str] = None) -> tuple[list[str], list[dict]]:
    avisos: list[str] = []
    detalles: list[dict] = []
    for r in reglas:
        disparada = False
        tipo = r.get("tipo")
        base = r.get("base")
        sobreescritura = (r.get("familias") or {}).get(familia or "", {}) if familia else {}
        nota_familia = sobreescritura.get("nota", "")
        if tipo == "ratio_supera" and base and r.get("nutriente_ref"):
            factor = float(sobreescritura.get("factor", r["factor"]))
            disparada = dosis.get(base, 0.0) > dosis.get(r["nutriente_ref"], 0.0) * factor
            detalles.append({"regla": r["id"], "disparada": disparada, "familia": familia or "generica", "factor_aplicado": factor})
        elif tipo == "dosis_supera_umbral" and base:
            umbral = float(sobreescritura.get("umbral", r["umbral"]))
            disparada = dosis.get(base, 0.0) > umbral
            detalles.append({"regla": r["id"], "disparada": disparada, "familia": familia or "generica", "umbral_aplicado": umbral})
        else:
            detalles.append({"regla": r["id"], "disparada": disparada})
            continue
        if disparada:
            extra = f" Nota {familia}: {nota_familia}" if nota_familia else ""
            avisos.append(f"[{r['id']}] {r['mensaje']}{extra} (ref: {r['referencia']})")
    return avisos, detalles


def _asignar_fuentes(tramo: dict, aporta: dict, nombres: dict, prioridad: list[str]) -> list[FuenteAplicacion]:
    aplicaciones: list[dict] = []
    credito: dict[str, float] = {"N": 0.0, "P": 0.0, "K": 0.0}
    pendiente = dict(tramo)

    for objetivo in ["P", "K", "N"]:
        necesidad = pendiente.get(objetivo, 0.0)
        if necesidad <= 0:
            continue
        fuente_id = None
        for fid in prioridad:
            composicion = aporta.get(fid, {})
            contenido = composicion.get(objetivo)
            if not contenido:
                continue
            if objetivo != max(composicion, key=composicion.get):
                continue
            fuente_id = fid
            break
        if not fuente_id:
            continue
        kg = necesidad / (aporta[fuente_id][objetivo] / 100.0)
        for n, pct in aporta[fuente_id].items():
            aportado = kg * pct / 100.0
            credito[n] += aportado
            if n != objetivo and n in pendiente:
                pendiente[n] = round(max(0.0, pendiente[n] - aportado), 2)
        pendiente[objetivo] = 0.0
        aplicaciones.append({"id": fuente_id, "kg": kg})

    return [
        FuenteAplicacion(
            fuente_id=a["id"],
            nombre=nombres.get(a["id"], a["id"]),
            kg_ha=round(a["kg"], 1),
            aporta=aporta[a["id"]],
        )
        for a in aplicaciones
    ]
