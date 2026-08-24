import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "seed_knowledge.json"


def cargar(uri: str, user: str, password: str):
    from neo4j import GraphDatabase

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    driver = GraphDatabase.driver(uri, auth=(user, password))
    driver.verify_connectivity()

    with driver.session() as s:
        s.run("CREATE CONSTRAINT cultivo_id IF NOT EXISTS FOR (c:Cultivo) REQUIRE c.id IS UNIQUE")
        s.run("CREATE CONSTRAINT nutriente_id IF NOT EXISTS FOR (n:Nutriente) REQUIRE n.id IS UNIQUE")
        s.run("CREATE CONSTRAINT referencia_id IF NOT EXISTS FOR (r:Referencia) REQUIRE r.id IS UNIQUE")
        s.run("CREATE CONSTRAINT fuente_id IF NOT EXISTS FOR (f:FuenteFertilizante) REQUIRE f.id IS UNIQUE")
        s.run("CREATE CONSTRAINT regla_id IF NOT EXISTS FOR (rg:ReglaAntagonismo) REQUIRE rg.id IS UNIQUE")

        for n in data["nutrientes"]:
            s.run("MERGE (nu:Nutriente {id:$id}) SET nu.simbolo=$simbolo, nu.nombre=$nombre", **n)

        for r in data["referencias"]:
            s.run(
                "MERGE (re:Referencia {id:$id}) SET re.autores=$autores, re.anio=$anio, re.titulo=$titulo, re.fuente=$fuente",
                **r,
            )

        for f in data["fuentes_fertilizante"]:
            s.run(
                "MERGE (fo:FuenteFertilizante {id:$id}) SET fo.nombre=$nombre, fo.tipo=$tipo",
                id=f["id"], nombre=f["nombre"], tipo=f["tipo"],
            )
            for nut, pct in f["aporta"].items():
                s.run(
                    """
                    MATCH (fu:FuenteFertilizante {id:$fid}), (nu:Nutriente {id:$nid})
                    MERGE (fu)-[a:APORTA]->(nu)
                    SET a.pct_contenido = $pct
                    """,
                    fid=f["id"], nid=nut, pct=pct,
                )

        for c in data["cultivos"]:
            s.run(
                """
                MERGE (cu:Cultivo {id:$id})
                SET cu.nombre=$nombre,
                    cu.unidad_rendimiento=$unidad_rendimiento,
                    cu.extraccion_N=$ext_n,
                    cu.extraccion_P=$ext_p,
                    cu.extraccion_K=$ext_k,
                    cu.preferencia_fuentes=$prefs,
                    cu.referencias_extraccion=$refs_ext,
                    cu.notas=$notas
                """,
                id=c["id"],
                nombre=c["nombre"],
                unidad_rendimiento=c["unidad_rendimiento"],
                ext_n=c["extraccion_por_tonelada"]["N"],
                ext_p=c["extraccion_por_tonelada"]["P"],
                ext_k=c["extraccion_por_tonelada"]["K"],
                prefs=c.get("preferencia_fuentes"),
                refs_ext=c["referencias_extraccion"],
                notas=c["notas"],
            )
            for rid in c["referencias_extraccion"] + c["referencias_modelo"]:
                s.run(
                    "MATCH (cu:Cultivo {id:$cid}), (r:Referencia {id:$rid}) MERGE (cu)-[:DOCUMENTADO_POR]->(r)",
                    cid=c["id"], rid=rid,
                )
            for fase in c["fases"]:
                s.run(
                    """
                    MATCH (cu:Cultivo {id:$cid})
                    MERGE (fa:FaseFenologica {
                        cultivo_id:$cid, orden:$orden
                    })
                    SET fa.nombre=$nombre, fa.bbch_inicio=$bbch_inicio, fa.bbch_fin=$bbch_fin,
                        fa.descripcion=$descripcion
                    MERGE (cu)-[:TIENE_FASE]->(fa)
                    """,
                    cid=c["id"],
                    orden=fase["orden"],
                    nombre=fase["nombre"],
                    bbch_inicio=fase["bbch_inicio"],
                    bbch_fin=fase["bbch_fin"],
                    descripcion=fase["descripcion"],
                )
                for nut, pct in fase["curva_pct_acumulada"].items():
                    s.run(
                        """
                        MATCH (:Cultivo {id:$cid})-[:TIENE_FASE]->(fa:FaseFenologica {orden:$orden})
                        MATCH (nu:Nutriente {id:$nid})
                        MERGE (fa)-[ex:EXTRAE]->(nu)
                        SET ex.pct_acumulado = $pct, ex.fuente_ref = $ref
                        """,
                        cid=c["id"],
                        orden=fase["orden"],
                        nid=nut,
                        pct=pct,
                        ref=fase["referencia_curva"],
                    )

        for rg in data.get("reglas_antagonismo", []):
            s.run(
                """
                MERGE (r:ReglaAntagonismo {id:$id})
                SET r.tipo=$tipo, r.base=$base, r.nutriente_ref=$nutriente_ref,
                    r.factor=$factor, r.umbral=$umbral, r.mensaje=$mensaje,
                    r.referencia=$referencia
                """,
                id=rg["id"],
                tipo=rg["tipo"],
                base=rg["base"],
                nutriente_ref=rg.get("nutriente_ref"),
                factor=rg.get("factor"),
                umbral=rg.get("umbral"),
                mensaje=rg["mensaje"],
                referencia=rg["referencia"],
            )
            s.run(
                "MATCH (r:ReglaAntagonismo {id:$rid}), (ref:Referencia {id:$refid}) MERGE (r)-[:DOCUMENTADO_POR]->(ref)",
                rid=rg["id"], refid=rg["referencia"],
            )

    driver.close()
    print(f"OK: semilla cargada en Neo4j ({uri})")


if __name__ == "__main__":
    uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("NEO4J_USER", "neo4j")
    password = os.getenv("NEO4J_PASSWORD")
    if not password:
        raise SystemExit("Define NEO4J_PASSWORD en el entorno o backend/.env antes de cargar la semilla.")
    cargar(uri, user, password)
