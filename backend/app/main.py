from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db
from .engine import calcular_recomendacion
from .graph import get_knowledge
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
