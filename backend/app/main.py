from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db, gnn as gnn_mod
from .engine import calcular_recomendacion
from .graph import get_driver, get_knowledge
from .llm import chat as llm_chat
from .rag import get_rag, ingestar_documento
from .schemas import RecomendacionResponse, SolicitudRecomendacion

app = FastAPI(
    title="FertiCalc API",
    version="0.1.0",
    description="Motor determinista de recomendacion de fertilizacion por fase fenologica (BBCH) con evidencia trazable.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    kb = get_knowledge()
    return {"status": "ok", "modo_conocimiento": kb.modo()}


@app.get("/api/cultivos")
def listar_cultivos():
    return get_knowledge().cultivos()


@app.get("/api/fuentes")
def listar_fuentes():
    return get_knowledge().fuentes()


@app.get("/api/cultivos/{cultivo_id}")
def detalle_cultivo(cultivo_id: str):
    kb = get_knowledge()
    c = kb.cultivo(cultivo_id)
    if not c:
        raise HTTPException(404, f"Cultivo no encontrado: {cultivo_id}")
    refs_ids = set(c.get("referencias_extraccion", []))
    refs_ids |= {f["referencia_curva"] for f in c["fases"]}
    refs_ids.add("stanford1973")
    return {"cultivo": c, "referencias": kb.referencias(refs_ids)}


@app.get("/api/cadena/{cultivo_id}")
def cadena_trazable(cultivo_id: str):
    resultado = get_knowledge().cadena_completa(cultivo_id)
    if not resultado:
        raise HTTPException(404, f"Cultivo no encontrado: {cultivo_id}")
    return resultado


@app.post("/api/recomendacion", response_model=RecomendacionResponse)
def recomendar(sol: SolicitudRecomendacion):
    try:
        return calcular_recomendacion(get_knowledge(), sol)
    except ValueError as e:
        raise HTTPException(400, str(e))


class GuardarPlanRequest(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=120)
    recomendacion: dict


@app.get("/api/planes")
def listar_planes():
    return db.listar_planes()


@app.get("/api/planes/{plan_id}")
def obtener_plan(plan_id: str):
    plan = db.obtener_plan(plan_id)
    if not plan:
        raise HTTPException(404, "Plan no encontrado")
    return plan


@app.post("/api/planes")
def guardar_plan(req: GuardarPlanRequest):
    rec = req.recomendacion
    plan_id = db.guardar_plan(
        nombre=req.nombre,
        cultivo_id=rec.get("cultivo_id", "desconocido"),
        cultivo_nombre=rec.get("cultivo_nombre"),
        rendimiento=rec.get("rendimiento_t_ha", 0),
        recomendacion=rec,
    )
    return {"id": plan_id}


@app.delete("/api/planes/{plan_id}")
def eliminar_plan(plan_id: str):
    if not db.eliminar_plan(plan_id):
        raise HTTPException(404, "Plan no encontrado")
    return {"eliminado": plan_id}


class ChatMensaje(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    mensaje: str = Field(..., min_length=1, max_length=4000)
    historial: list[ChatMensaje] = []


@app.post("/api/chat")
def chat(req: ChatRequest):
    kb = get_knowledge()
    try:
        return llm_chat(
            kb,
            req.mensaje,
            [{"role": m.role, "content": m.content} for m in req.historial],
        )
    except ValueError as e:
        raise HTTPException(503, str(e))


class FeedbackRequest(BaseModel):
    rating: int = Field(..., ge=-1, le=1)
    comentario: str = Field("", max_length=2000)
    origen: str = Field("chat", max_length=20)


@app.post("/api/feedback")
def crear_feedback(req: FeedbackRequest):
    fid = db.guardar_feedback(req.rating, req.comentario, req.origen)
    return {"id": fid}


@app.get("/api/feedback")
def ver_feedback(limite: int = 100):
    return db.listar_feedback(min(max(limite, 1), 500))


@app.get("/api/conocimiento/estado")
def estado_conocimiento():
    rag = get_rag(get_driver)
    return {"modo": rag.modo(), "fragmentos": rag.total(), "modelo_embeddings": "multilingual-e5-small"}


class IngestaTexto(BaseModel):
    titulo: str = Field(..., min_length=1, max_length=200)
    texto: str = Field(..., min_length=50)


@app.post("/api/conocimiento/texto")
def ingesta_texto(req: IngestaTexto):
    resultado = ingestar_documento(get_rag(get_driver), req.titulo, texto=req.texto)
    return resultado


@app.post("/api/conocimiento/pdf")
async def ingesta_pdf(archivo: UploadFile = File(...), titulo: str = Form("")):
    bytes_pdf = await archivo.read()
    if not bytes_pdf:
        raise HTTPException(400, "Archivo vacio")
    titulo_final = titulo or (archivo.filename or "documento").removesuffix(".pdf")
    try:
        return ingestar_documento(
            get_rag(get_driver), titulo_final, pdf_bytes=bytes_pdf
        )
    except Exception as e:
        raise HTTPException(400, f"No se pudo procesar el PDF: {e}")


class BusquedaLiteratura(BaseModel):
    consulta: str = Field(..., min_length=2)
    k: int = Field(4, ge=1, le=10)


@app.post("/api/conocimiento/buscar")
def buscar_literatura(req: BusquedaLiteratura):
    rag = get_rag(get_driver)
    return {"consulta": req.consulta, "resultados": rag.buscar(req.consulta, req.k)}


@app.get("/api/gnn/estado")
def estado_gnn():
    pesos = gnn_mod.cargar_pesos()
    if not pesos:
        return {"entrenado": False}
    return {
        "entrenado": True,
        "arquitectura": pesos.get("arquitectura"),
        "entrenado_en": pesos.get("entrenado_en"),
        "metricas_loo": pesos.get("metricas_loo"),
    }


class PrediccionGnn(BaseModel):
    extraccion_por_t: dict
    num_fases: int = Field(4, ge=2, le=12)
    familia: Optional[str] = None


@app.post("/api/gnn/predecir")
def predecir_gnn(req: PrediccionGnn):
    try:
        return gnn_mod.predecir_curva(
            extraccion_por_t=req.extraccion_por_t,
            num_fases=req.num_fases,
            familia=(req.familia or "").strip() or None,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/gnn/familia/{familia}")
def referencia_familia(familia: str):
    try:
        return gnn_mod.resumen_familia(familia)
    except ValueError as e:
        raise HTTPException(404, str(e))


class PlanPersonalizadoRequest(BaseModel):
    extraccion_por_t: dict
    rendimiento_t_ha: float = Field(..., gt=0)
    num_fases: int = Field(4, ge=2, le=12)
    familia: Optional[str] = None
    analisis_suelo: Optional[dict] = None
    eficiencias: Optional[dict] = None


@app.post("/api/gnn/plan")
def plan_gnn(req: PlanPersonalizadoRequest):
    try:
        return gnn_mod.plan_desde_prediccion(
            get_knowledge(),
            extraccion_por_t=req.extraccion_por_t,
            num_fases=req.num_fases,
            familia=(req.familia or "").strip() or None,
            rendimiento_t_ha=req.rendimiento_t_ha,
            analisis_suelo=req.analisis_suelo,
            eficiencias=req.eficiencias,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


class CrearSiembraRequest(BaseModel):
    plan_id: str = Field(..., min_length=1)
    fecha_inicio: str = Field(..., min_length=8, max_length=10)
    dias_estimados_fase: Optional[float] = Field(None, gt=0, le=365)
    familia: str = Field("", max_length=60)
    especie: str = Field("", max_length=120)


DIAS_POR_FAMILIA = {
    "solanaceae": 16,
    "poaceae": 20,
    "rosaceae": 22,
    "asteraceae": 12,
    "cucurbitaceae": 15,
}
DIAS_DEFAULT = 18


def _calendario(siembra: dict, plan: dict) -> list[dict]:
    from datetime import datetime

    inicio = datetime.fromisoformat(siembra["fecha_inicio"])
    dias_fase = float(siembra["dias_estimados_fase"])
    estados = {a["orden_fase"]: a for a in siembra.get("aplicaciones", [])}
    calendario = []
    for fase in plan["recomendacion"]["fases"]:
        orden = fase["orden"]
        est = estados.get(orden, {})
        fecha_estimada = inicio.timestamp() + (orden - 1) * dias_fase * 86400
        calendario.append(
            {
                "orden": orden,
                "nombre_fase": fase["nombre"],
                "bbch": fase["bbch"],
                "fecha_estimada": datetime.fromtimestamp(fecha_estimada, tz=inicio.tzinfo).date().isoformat(),
                "dosis_nutriente_kg_ha": fase["dosis_nutriente_kg_ha"],
                "fuentes_sugeridas": fase["fuentes_sugeridas"],
                "estado": est.get("estado", "pendiente"),
                "aplicada": est.get("aplicada", ""),
            }
        )
    return calendario


@app.post("/api/siembras")
def crear_siembra(req: CrearSiembraRequest):
    plan = db.obtener_plan(req.plan_id)
    if not plan:
        raise HTTPException(404, "Plan no encontrado")
    cultivo = get_knowledge().cultivo(plan.get("cultivo_id") or "")
    familia = (req.familia or "").strip().lower() or (cultivo or {}).get("familia", "")
    dias = req.dias_estimados_fase or DIAS_POR_FAMILIA.get(familia, DIAS_DEFAULT)
    sid = db.crear_siembra(req.plan_id, req.fecha_inicio, dias, familia, req.especie)
    return {"id": sid, "dias_estimados_fase": dias, "familia": familia}


@app.get("/api/siembras")
def listar_siembras():
    return db.listar_siembras()


@app.get("/api/siembras/{siembra_id}")
def estado_siembra(siembra_id: str):
    siembra = db.obtener_siembra(siembra_id)
    if not siembra:
        raise HTTPException(404, "Siembra no encontrada")
    plan = db.obtener_plan(siembra["plan_id"])
    if not plan:
        raise HTTPException(404, "Plan de la siembra no encontrado")
    return {
        "siembra": {k: v for k, v in siembra.items() if k != "aplicaciones"},
        "plan_nombre": plan["nombre"],
        "calendario": _calendario(siembra, plan),
    }


class AplicarFaseRequest(BaseModel):
    estado: str = Field("aplicada", min_length=1, max_length=20)


@app.post("/api/siembras/{siembra_id}/fase/{orden}")
def marcar_fase(siembra_id: str, orden: int, req: AplicarFaseRequest):
    if not db.obtener_siembra(siembra_id):
        raise HTTPException(404, "Siembra no encontrada")
    if req.estado not in ("aplicada", "omitida", "pendiente"):
        raise HTTPException(400, "Estado debe ser aplicada, omitida o pendiente")
    db.marcar_aplicacion(siembra_id, orden, req.estado)
    return {"siembra_id": siembra_id, "orden": orden, "estado": req.estado}


class ActualizarBbchRequest(BaseModel):
    bbch_actual: str = Field(..., min_length=2, max_length=5)


@app.post("/api/siembras/{siembra_id}/bbch")
def actualizar_bbch(siembra_id: str, req: ActualizarBbchRequest):
    if not db.actualizar_bbch(siembra_id, req.bbch_actual):
        raise HTTPException(404, "Siembra no encontrada")
    return {"siembra_id": siembra_id, "bbch_actual": req.bbch_actual}
