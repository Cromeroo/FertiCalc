from pydantic import BaseModel, Field
from typing import Optional, Dict


class AnalisisSuelo(BaseModel):
    n_disponible_kg_ha: float = Field(0.0, ge=0)
    p2o5_disponible_kg_ha: float = Field(0.0, ge=0)
    k2o_disponible_kg_ha: float = Field(0.0, ge=0)


class Eficiencias(BaseModel):
    N: float = Field(0.60, gt=0, le=1)
    P: float = Field(0.25, gt=0, le=1)
    K: float = Field(0.50, gt=0, le=1)


class SolicitudRecomendacion(BaseModel):
    cultivo_id: str
    rendimiento_t_ha: float = Field(..., gt=0)
    analisis_suelo: AnalisisSuelo = AnalisisSuelo()
    eficiencias: Eficiencias = Eficiencias()
    fase_desde_orden: Optional[int] = Field(None, ge=1)


class FuenteAplicacion(BaseModel):
    fuente_id: str
    nombre: str
    kg_ha: float
    aporta: Dict[str, float]


class RecomendacionFase(BaseModel):
    orden: int
    nombre: str
    bbch: str
    dosis_nutriente_kg_ha: Dict[str, float]
    fuentes_sugeridas: list[FuenteAplicacion]
    referencia_curva: str


class PasoEvidencia(BaseModel):
    paso: str
    formula: str
    valores: Dict[str, object]
    resultado: Dict[str, object]
    referencia: Optional[str] = None


class ReferenciaInfo(BaseModel):
    id: str
    autores: str = ""
    anio: object = ""
    titulo: str = ""
    fuente: str = ""


class RecomendacionResponse(BaseModel):
    cultivo_id: str
    cultivo_nombre: str
    rendimiento_t_ha: float
    demanda_total_kg_ha: Dict[str, float]
    aporte_suelo_kg_ha: Dict[str, float]
    requerimiento_neto_kg_ha: Dict[str, float]
    dosis_fertilizante_kg_ha: Dict[str, float]
    fases: list[RecomendacionFase]
    evidencia: list[PasoEvidencia]
    advertencias: list[str]
    referencias: Dict[str, ReferenciaInfo] = {}
