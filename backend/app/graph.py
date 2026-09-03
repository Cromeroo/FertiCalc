import json
import os
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "seed_knowledge.json"

_NUTRIENT_KEYS = ["N", "P", "K"]


class JsonKnowledge:
    def __init__(self):
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            self.data = json.load(f)

    def modo(self) -> str:
        return "json"

    def cultivos(self) -> list[dict]:
        return [
            {
                "id": c["id"],
                "nombre": c["nombre"],
                "unidad_rendimiento": c["unidad_rendimiento"],
                "fases": len(c["fases"]),
            }
            for c in self.data["cultivos"]
        ]

    def cultivo(self, cultivo_id: str) -> Optional[dict]:
        for c in self.data["cultivos"]:
            if c["id"] == cultivo_id:
                return c
        return None

    def referencias(self, ids: list[str]) -> dict:
        return {r["id"]: r for r in self.data["referencias"] if r["id"] in ids}

    def fuentes(self) -> list[dict]:
        return self.data["fuentes_fertilizante"]

    def eficiencias_default(self) -> dict:
        return dict(self.data["eficiencias_default"])

    def reglas(self) -> list[dict]:
        return list(self.data.get("reglas_antagonismo", []))

    def cadena_completa(self, cultivo_id: str) -> Optional[dict]:
        c = self.cultivo(cultivo_id)
        if not c:
            return None
        refs = self.referencias(
            set(c["referencias_extraccion"])
            | {f["referencia_curva"] for f in c["fases"]}
            | {"stanford1973"}
        )
        return {"cultivo": c, "referencias": refs}


class Neo4jKnowledge:
    def __init__(self, uri: str, user: str, password: str):
        from neo4j import GraphDatabase

        self._driver = GraphDatabase.driver(uri, auth=(user, password))

    def modo(self) -> str:
        return "neo4j"

    def _run(self, query: str, **params) -> list[dict]:
        with self._driver.session() as session:
            return [dict(r) for r in session.run(query, **params)]

    def cultivos(self) -> list[dict]:
        rows = self._run(
            """
            MATCH (c:Cultivo)
            OPTIONAL MATCH (c)-[:TIENE_FASE]->(f:FaseFenologica)
            RETURN c.id AS id, c.nombre AS nombre,
                   c.unidad_rendimiento AS unidad_rendimiento,
                   coalesce(c.familia, 'desconocida') AS familia,
                   count(f) AS fases
            ORDER BY c.nombre
            """
        )
        return rows

    def cultivo(self, cultivo_id: str) -> Optional[dict]:
        rows = self._run(
            """
            MATCH (c:Cultivo {id: $id})
            RETURN c.id AS id, c.nombre AS nombre,
                   c.unidad_rendimiento AS unidad_rendimiento,
                   c.familia AS familia,
                   c.extraccion_N AS eN, c.extraccion_P AS eP, c.extraccion_K AS eK,
                   c.preferencia_fuentes AS preferencia_fuentes,
                   c.referencias_extraccion AS referencias_extraccion,
                   c.notas AS notas
            """,
            id=cultivo_id,
        )
        if not rows:
            return None
        row = rows[0]
        row["familia"] = row.get("familia") or "desconocida"
        row["extraccion_por_tonelada"] = {
            "N": float(row.pop("eN")),
            "P": float(row.pop("eP")),
            "K": float(row.pop("eK")),
        }
        raw = self._run(
            """
            MATCH (:Cultivo {id: $id})-[:TIENE_FASE]->(f:FaseFenologica)-[ex:EXTRAE]->(n:Nutriente)
            RETURN f.orden AS orden, f.nombre AS nombre,
                   f.bbch_inicio AS bbch_inicio, f.bbch_fin AS bbch_fin,
                   f.descripcion AS descripcion,
                   n.id AS nutriente, ex.pct_acumulado AS pct,
                   ex.fuente_ref AS referencia_curva
            ORDER BY f.orden
            """,
            id=cultivo_id,
        )
        fases: dict[int, dict] = {}
        for r in raw:
            f = fases.setdefault(
                r["orden"],
                {
                    "orden": r["orden"],
                    "nombre": r["nombre"],
                    "bbch_inicio": r["bbch_inicio"],
                    "bbch_fin": r["bbch_fin"],
                    "descripcion": r["descripcion"],
                    "curva_pct_acumulada": {},
                    "referencia_curva": r["referencia_curva"],
                },
            )
            f["curva_pct_acumulada"][r["nutriente"]] = float(r["pct"])
        row["fases"] = [fases[k] for k in sorted(fases)]
        return row

    def referencias(self, ids: list[str]) -> dict:
        rows = self._run(
            """
            MATCH (r:Referencia)
            WHERE r.id IN $ids
            RETURN r.id AS id, r.autores AS autores, r.anio AS anio,
                   r.titulo AS titulo, r.fuente AS fuente
            """,
            ids=list(ids),
        )
        return {r["id"]: r for r in rows}

    def fuentes(self) -> list[dict]:
        rows = self._run(
            """
            MATCH (f:FuenteFertilizante)
            OPTIONAL MATCH (f)-[a:APORTA]->(n:Nutriente)
            RETURN f.id AS id, f.nombre AS nombre, f.tipo AS tipo,
                   collect({nutriente: n.id, pct: a.pct_contenido}) AS aporta
            ORDER BY f.nombre
            """
        )
        for f in rows:
            f["aporta"] = {x["nutriente"]: x["pct"] for x in f["aporta"] if x["nutriente"]}
        return rows

    def eficiencias_default(self) -> dict:
        return {"N": 0.60, "P": 0.25, "K": 0.50}

    def reglas(self) -> list[dict]:
        rows = self._run(
            """
            MATCH (rg:ReglaAntagonismo)
            RETURN rg.id AS id, rg.tipo AS tipo, rg.base AS base,
                   rg.nutriente_ref AS nutriente_ref, rg.factor AS factor,
                   rg.umbral AS umbral, rg.mensaje AS mensaje,
                   rg.referencia AS referencia
            ORDER BY rg.id
            """
        )
        for r in rows:
            r["factor"] = float(r["factor"]) if r["factor"] is not None else None
            r["umbral"] = float(r["umbral"]) if r["umbral"] is not None else None
        return rows

    def cadena_completa(self, cultivo_id: str) -> Optional[dict]:
        rows = self._run(
            """
            MATCH (c:Cultivo {id: $id})-[:DOCUMENTADO_POR]->(rc:Referencia)
            WITH c, collect(DISTINCT rc) AS refs1
            MATCH (c)-[:TIENE_FASE]->(f:FaseFenologica)-[ex:EXTRAE]->(n:Nutriente)
            WITH c, refs1, f, ex, n
            WHERE ex.fuente_ref IS NOT NULL
            RETURN {
              cultivo: c.id,
              nombre: c.nombre,
              cadena: collect({
                fase: f.orden,
                bbch: f.bbch_inicio + '-' + f.bbch_fin,
                nutriente: n.id,
                pct_acumulado: ex.pct_acumulado,
                cita: ex.fuente_ref
              })
            } AS resultado
            """,
            id=cultivo_id,
        )
        if not rows:
            return None
        c = self.cultivo(cultivo_id)
        refs = self.referencias(
            set(c["referencias_extraccion"]) | {"stanford1973"}
        )
        return {"cultivo": c, "referencias": refs, "traza_grafo": rows[0]["resultado"]}


def get_driver():
    uri = os.getenv("NEO4J_URI")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")
    if not (uri and password):
        return None
    try:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(uri, auth=(user, password))
        driver.verify_connectivity()
        return driver
    except Exception:
        return None


def get_knowledge() -> object:
    driver = get_driver()
    if driver is not None:
        kb = Neo4jKnowledge.__new__(Neo4jKnowledge)
        kb._driver = driver
        return kb
    return JsonKnowledge()
