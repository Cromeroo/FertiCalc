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


@app.post("/api/gnn/predecir")
def predecir_gnn(req: PrediccionGnn):
    try:
        return gnn_mod.predecir_curva(
            extraccion_por_t=req.extraccion_por_t, num_fases=req.num_fases
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
