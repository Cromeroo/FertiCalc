import os
from typing import Optional

import requests

from .engine import calcular_recomendacion
from .gnn import predecir_curva as gnn_predecir
from .rag import get_rag
from .schemas import AnalisisSuelo, SolicitudRecomendacion

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
MAX_ITERACIONES = 4

HERRAMIENTAS = [
    {
        "function_declarations": [
            {
                "name": "listar_cultivos",
                "description": "Lista los cultivos disponibles en el catalogo de FertiCalc con su unidad de rendimiento.",
                "parameters": {"type": "OBJECT", "properties": {}},
            },
            {
                "name": "obtener_cultivo",
                "description": "Devuelve fases fenologicas BBCH, curvas de absorcion acumulada por nutriente y referencias bibliograficas de un cultivo.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {"cultivo_id": {"type": "STRING"}},
                    "required": ["cultivo_id"],
                },
            },
            {
                "name": "listar_fuentes",
                "description": "Lista fuentes de fertilizante disponibles con su composicion porcentual de N, P2O5 y K2O.",
                "parameters": {"type": "OBJECT", "properties": {}},
            },
            {
                "name": "calcular_recomendacion",
                "description": (
                    "Calcula el plan de fertilizacion determinista (kg/ha por nutriente y fase BBCH) "
                    "con fuentes sugeridas y avisos. USAR SIEMPRE para cualquier cifra de dosis."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "cultivo_id": {"type": "STRING"},
                        "rendimiento_t_ha": {"type": "NUMBER"},
                        "n_disponible_kg_ha": {"type": "NUMBER"},
                        "p2o5_disponible_kg_ha": {"type": "NUMBER"},
                        "k2o_disponible_kg_ha": {"type": "NUMBER"},
                        "fase_desde_orden": {
                            "type": "INTEGER",
                            "description": "Orden de fase desde la cual calcular (ciclos en curso). Opcional.",
                        },
                    },
                    "required": ["cultivo_id", "rendimiento_t_ha"],
                },
            },
            {
                "name": "buscar_literatura",
                "description": (
                    "Busca en la base bibliografica interna (documentos cientificos ingeridos) "
                    "fragmentos relevantes sobre nutricion vegetal. Usar para preguntas conceptuales "
                    "o cuando el usuario pida respaldo de literatura."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "consulta": {"type": "STRING"},
                        "k": {"type": "INTEGER", "description": "Numero de fragmentos (default 4)."},
                    },
                    "required": ["consulta"],
                },
            },
            {
                "name": "predecir_curva_gnn",
                "description": (
                    "PREDICCION EXPERIMENTAL con red neuronal de grafos: estima la curva de absorcion "
                    "acumulada por fase para un cultivo SIN curvas publicadas, a partir de su extraccion "
                    "por tonelada (N, P2O5, K2O kg/t). Etiquetar siempre el resultado como prediccion IA no validada."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "extraccion_n_kg_t": {"type": "NUMBER"},
                        "extraccion_p2o5_kg_t": {"type": "NUMBER"},
                        "extraccion_k2o_kg_t": {"type": "NUMBER"},
                        "familia": {
                            "type": "STRING",
                            "description": (
                                "Familia botanica del cultivo (solanaceae, poaceae, "
                                "cucurbitaceae, rosaceae, asteraceae). Mejora la precision."
                            ),
                        },
                        "num_fases": {"type": "INTEGER", "description": "Fases del ciclo (default 4)."},
                    },
                    "required": ["extraccion_n_kg_t", "extraccion_p2o5_kg_t", "extraccion_k2o_kg_t"],
                },
            },
            {
                "name": "extraccion_referencia_familia",
                "description": (
                    "Devuelve la extraccion de nutrientes PROMEDIO (kg/t de N, P2O5 y K2O) "
                    "de los cultivos de una familia botanica del catalogo. Util para estimar "
                    "los valores de entrada de predecir_curva_gnn o plan_cultivo_personalizado "
                    "cuando el usuario no conoce la extraccion de su cultivo."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "familia": {
                            "type": "STRING",
                            "description": "solanaceae, poaceae, cucurbitaceae, rosaceae o asteraceae",
                        },
                    },
                    "required": ["familia"],
                },
            },
            {
                "name": "listar_siembras",
                "description": (
                    "Lista las siembras en seguimiento (lote + plan + fecha de inicio + BBCH actual)."
                ),
                "parameters": {"type": "OBJECT", "properties": {}},
            },
            {
                "name": "estado_siembra",
                "description": (
                    "Devuelve el calendario de una siembra: por cada fase, fecha estimada, "
                    "dosis y estado (pendiente, aplicada, omitida). Usa el id de siembra de listar_siembras."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {"siembra_id": {"type": "STRING"}},
                    "required": ["siembra_id"],
                },
            },
            {
                "name": "ajustar_bbch",
                "description": (
                    "Actualiza el codigo BBCH observado en campo para una siembra (ej. '51'). "
                    "Sirve para decirle al sistema en que estado fenologico real va el cultivo."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "siembra_id": {"type": "STRING"},
                        "bbch_actual": {"type": "STRING"},
                    },
                    "required": ["siembra_id", "bbch_actual"],
                },
            },
            {
                "name": "plan_cultivo_personalizado",
                "description": (
                    "Genera el PLAN COMPLETO de fertilizacion (kg/ha por fase, fuentes sugeridas) para un "
                    "cultivo sin curva publicada: primero predice la curva con GNN segun familia botanica y "
                    "luego calcula dosis deterministas. Requiere rendimiento esperado."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "extraccion_n_kg_t": {"type": "NUMBER"},
                        "extraccion_p2o5_kg_t": {"type": "NUMBER"},
                        "extraccion_k2o_kg_t": {"type": "NUMBER"},
                        "rendimiento_t_ha": {"type": "NUMBER"},
                        "familia": {"type": "STRING"},
                        "num_fases": {"type": "INTEGER"},
                        "n_disponible_kg_ha": {"type": "NUMBER"},
                        "p2o5_disponible_kg_ha": {"type": "NUMBER"},
                        "k2o_disponible_kg_ha": {"type": "NUMBER"},
                    },
                    "required": [
                        "extraccion_n_kg_t",
                        "extraccion_p2o5_kg_t",
                        "extraccion_k2o_kg_t",
                        "rendimiento_t_ha",
                    ],
                },
            },
            {
                "name": "plan_cultivo_personalizado",
                "description": (
                    "Genera el PLAN COMPLETO de fertilizacion (kg/ha por fase, fuentes sugeridas) para un "
                    "cultivo sin curva publicada: primero predice la curva con GNN segun familia botanica y "
                    "luego calcula dosis deterministas. Requiere rendimiento esperado."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "extraccion_n_kg_t": {"type": "NUMBER"},
                        "extraccion_p2o5_kg_t": {"type": "NUMBER"},
                        "extraccion_k2o_kg_t": {"type": "NUMBER"},
                        "rendimiento_t_ha": {"type": "NUMBER"},
                        "familia": {"type": "STRING"},
                        "num_fases": {"type": "INTEGER"},
                        "n_disponible_kg_ha": {"type": "NUMBER"},
                        "p2o5_disponible_kg_ha": {"type": "NUMBER"},
                        "k2o_disponible_kg_ha": {"type": "NUMBER"},
                    },
                    "required": [
                        "extraccion_n_kg_t",
                        "extraccion_p2o5_kg_t",
                        "extraccion_k2o_kg_t",
                        "rendimiento_t_ha",
                    ],
                },
            },
        ]
    }
]

PROMPT_SISTEMA = """Eres el asistente agronomico de FertiCalc, especializado en fertilizacion por fase fenologica.

Reglas obligatorias:
1. Para CUALQUIER cifra de dosis o recomendacion numerica debes llamar a la herramienta calcular_recomendacion. Nunca inventes ni estimes cifras por tu cuenta.
2. Si el usuario pide un calculo pero falta el rendimiento esperado, pregunta el dato antes de llamar a la herramienta.
3. Cuando la herramienta entregue referencias o avisos, mencionalos en tu respuesta (ej. "curva segun Bertsch 2016").
4. Solo respondes sobre fertilizacion y nutricion de los cultivos del catalogo. Si preguntan plagas, riego u otro tema, indica amablemente que es fuera de tu alcance.
5. Los cultivos tienen ids tecnicos (tomate, maiz, chile, fresa, lechuga, papa, sandia): usa listar_cultivos si el usuario no es claro.
6. Responde en espanol, tono tecnico claro y conciso. Estructura: respuesta directa primero, detalle despues.
7. Para preguntas conceptuales o de respaldo bibliografico usa buscar_literatura y cita el titulo del documento del fragmento. Si no hay resultados, dilo honestamente.
 8. Si ofreces una curva predicha con predecir_curva_gnn, dejara claro que es PREDICCION IA EXPERIMENTAL no validada experimentalmente.
 9. Para preguntas de seguimiento de un lote ya sembrado usa listar_siembras, estado_siembra y ajustar_bbch. La siguiente aplicacion pendiente es la que toca hacer."""


def _calendario_simple(siembra: dict, plan: dict) -> dict:
    from datetime import datetime

    inicio = datetime.fromisoformat(siembra["fecha_inicio"])
    dias_fase = float(siembra["dias_estimados_fase"])
    estados = {a["orden_fase"]: a["estado"] for a in siembra.get("aplicaciones", [])}
    fases = []
    for fase in plan["recomendacion"]["fases"]:
        fecha = (inicio.timestamp() + (fase["orden"] - 1) * dias_fase * 86400)
        fases.append(
            {
                "orden": fase["orden"],
                "nombre": fase["nombre"],
                "fecha_estimada": datetime.fromtimestamp(fecha, tz=inicio.tzinfo).date().isoformat(),
                "dosis_nutriente_kg_ha": fase["dosis_nutriente_kg_ha"],
                "fuentes": [
                    {"nombre": s["nombre"], "kg_ha": s["kg_ha"]}
                    for s in fase["fuentes_sugeridas"]
                ],
                "estado": estados.get(fase["orden"], "pendiente"),
            }
        )
    siguiente = next((f for f in fases if f["estado"] == "pendiente"), None)
    return {
        "plan_nombre": plan["nombre"],
        "bbch_actual": siembra.get("bbch_actual", "00"),
        "fases": fases,
        "siguiente_aplicacion": siguiente,
    }


def _driver_factory():
    from .graph import get_driver

    return get_driver


def chat(kb, mensaje: str, historial: Optional[list[dict]] = None) -> dict:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "GEMINI_API_KEY no configurada. Crea backend/.env con GEMINI_API_KEY=tu_clave y reinicia la API."
        )

    modelo = os.getenv("GEMINI_MODEL", "gemini-3.6-flash").strip()
    url = API_URL.format(modelo=modelo)

    contents = []
    for m in historial or []:
        role = "user" if m.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": mensaje}]})

    pasos: list[str] = []
    recomendacion_full: Optional[dict] = None
    respuesta_texto = ""

    for _ in range(MAX_ITERACIONES):
        resp = requests.post(
            url,
            params={"key": key},
            json={
                "system_instruction": {"parts": [{"text": PROMPT_SISTEMA}]},
                "contents": contents,
                "tools": HERRAMIENTAS,
            },
            timeout=60,
        )
        if resp.status_code != 200:
            detalle = resp.json().get("error", {}).get("message", resp.text[:200])
            raise ValueError(f"Gemini devolvio {resp.status_code}: {detalle}")

        candidato = resp.json()["candidates"][0]["content"]
        contents.append(candidato)

        llamadas = [p["functionCall"] for p in candidato.get("parts", []) if "functionCall" in p]
        if not llamadas:
            respuesta_texto = next(
                (p.get("text", "") for p in candidato.get("parts", []) if "text" in p),
                "",
            )
            break

        partes_respuesta = []
        for llamada in llamadas:
            nombre = llamada["name"]
            args = llamada.get("args", {})
            pasos.append(f"{nombre}({_resumir_args(args)})")
            try:
                resultado = _ejecutar_herramienta(kb, nombre, args)
                if nombre == "calcular_recomendacion":
                    recomendacion_full = resultado.pop("_full")
            except Exception as e:
                resultado = {"error": str(e)}
            partes_respuesta.append(
                {"functionResponse": {"name": nombre, "response": {"resultado": resultado}}}
            )
        contents.append({"role": "user", "parts": partes_respuesta})
    else:
        respuesta_texto = "Alcanze el limite de consultas internas. Intenta simplificar la pregunta."

    return {"respuesta": respuesta_texto, "pasos": pasos, "recomendacion": recomendacion_full}


def _ejecutar_herramienta(kb, nombre: str, args: dict) -> dict:
    if nombre == "listar_cultivos":
        return {"cultivos": kb.cultivos()}

    if nombre == "obtener_cultivo":
        cadena = kb.cadena_completa(args["cultivo_id"])
        if not cadena:
            return {"error": f"Cultivo no encontrado: {args['cultivo_id']}"}
        c = cadena["cultivo"]
        return {
            "cultivo": c["nombre"],
            "extraccion_por_tonelada": c["extraccion_por_tonelada"],
            "fases": [
                {
                    "orden": f["orden"],
                    "nombre": f["nombre"],
                    "bbch": f"{f['bbch_inicio']}-{f['bbch_fin']}",
                    "pct_acumulado": f["curva_pct_acumulada"],
                    "cita": f["referencia_curva"],
                }
                for f in c["fases"]
            ],
        }

    if nombre == "listar_fuentes":
        return {"fuentes": kb.fuentes()}

    if nombre == "buscar_literatura":
        rag = get_rag(_driver_factory())
        fragmentos = rag.buscar(args["consulta"], int(args.get("k") or 4))
        if not fragmentos:
            return {
                "fragmentos": [],
                "nota": "Sin resultados: probablemente no se han ingerido documentos todavia.",
            }
        return {"fragmentos": fragmentos}

    if nombre == "predecir_curva_gnn":
        return gnn_predecir(
            extraccion_por_t={
                "N": args["extraccion_n_kg_t"],
                "P": args["extraccion_p2o5_kg_t"],
                "K": args["extraccion_k2o_kg_t"],
            },
            num_fases=args.get("num_fases"),
            familia=(args.get("familia") or "").strip() or None,
        )

    if nombre == "listar_siembras":
        from . import db as _db

        return {"siembras": _db.listar_siembras()}

    if nombre == "estado_siembra":
        from . import db as _db

        siembra = _db.obtener_siembra(args["siembra_id"])
        if not siembra:
            return {"error": f"Siembra no encontrada: {args['siembra_id']}"}
        plan = _db.obtener_plan(siembra["plan_id"])
        if not plan:
            return {"error": "Plan de la siembra no encontrado"}
        return _calendario_simple(siembra, plan)

    if nombre == "ajustar_bbch":
        from . import db as _db

        ok = _db.actualizar_bbch(args["siembra_id"], args["bbch_actual"])
        if not ok:
            return {"error": f"Siembra no encontrada: {args['siembra_id']}"}
        return {"siembra_id": args["siembra_id"], "bbch_actual": args["bbch_actual"]}

    if nombre == "extraccion_referencia_familia":
        from .gnn import resumen_familia

        return resumen_familia(args["familia"])

    if nombre == "plan_cultivo_personalizado":
        from .gnn import plan_desde_prediccion

        resultado = plan_desde_prediccion(
            kb,
            extraccion_por_t={
                "N": args["extraccion_n_kg_t"],
                "P": args["extraccion_p2o5_kg_t"],
                "K": args["extraccion_k2o_kg_t"],
            },
            num_fases=args.get("num_fases"),
            familia=(args.get("familia") or "").strip() or None,
            rendimiento_t_ha=float(args["rendimiento_t_ha"]),
            analisis_suelo={
                "n_disponible_kg_ha": args.get("n_disponible_kg_ha") or 0,
                "p2o5_disponible_kg_ha": args.get("p2o5_disponible_kg_ha") or 0,
                "k2o_disponible_kg_ha": args.get("k2o_disponible_kg_ha") or 0,
            },
        )
        plan = resultado["plan"].model_dump()
        plan.pop("evidencia", None)
        return {
            "curva_predicha": resultado["prediccion"]["curva_predicha"],
            "explicacion": resultado["prediccion"]["explicacion"],
            "plan": plan,
        }

    if nombre == "calcular_recomendacion":
        sol = SolicitudRecomendacion(
            cultivo_id=args["cultivo_id"],
            rendimiento_t_ha=float(args["rendimiento_t_ha"]),
            analisis_suelo=AnalisisSuelo(
                n_disponible_kg_ha=float(args.get("n_disponible_kg_ha") or 0),
                p2o5_disponible_kg_ha=float(args.get("p2o5_disponible_kg_ha") or 0),
                k2o_disponible_kg_ha=float(args.get("k2o_disponible_kg_ha") or 0),
            ),
            fase_desde_orden=args.get("fase_desde_orden"),
        )
        rec = calcular_recomendacion(kb, sol)
        d = rec.model_dump()
        return {
            "_full": d,
            "cultivo": d["cultivo_nombre"],
            "dosis_total_kg_ha": d["dosis_fertilizante_kg_ha"],
            "demanda_total_kg_ha": d["demanda_total_kg_ha"],
            "aporte_suelo_kg_ha": d["aporte_suelo_kg_ha"],
            "por_fase": [
                {
                    "fase": f["nombre"],
                    "bbch": f["bbch"],
                    "kg_ha": f["dosis_nutriente_kg_ha"],
                    "fuentes": [
                        {"nombre": s["nombre"], "kg_ha": s["kg_ha"]}
                        for s in f["fuentes_sugeridas"]
                    ],
                }
                for f in d["fases"]
            ],
            "avisos": [a for a in d["advertencias"] if a.startswith("[")],
            "referencias": list(d.get("referencias", {}).keys()),
        }

    raise ValueError(f"Herramienta desconocida: {nombre}")


def _resumir_args(args: dict) -> str:
    claves = ["cultivo_id", "rendimiento_t_ha", "fase_desde_orden"]
    resumen = {k: args[k] for k in claves if k in args}
    return ", ".join(f"{k}={v}" for k, v in resumen.items()) or "…"
