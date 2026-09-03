import io
import json
import os
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
FALLBACK_PATH = DATA_DIR / "rag_fragments.json"
MODELO_EMB = "intfloat/multilingual-e5-small"
DIM = 384

_modelo = None


def _modelo_embeddings():
    global _modelo
    if _modelo is None:
        from sentence_transformers import SentenceTransformer

        _modelo = SentenceTransformer(MODELO_EMB)
    return _modelo


def incrustar(textos: list[str], es_consulta: bool = False) -> list[list[float]]:
    prefijo = "query: " if es_consulta else "passage: "
    vectores = _modelo_embeddings().encode(
        [prefijo + t for t in textos],
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return [v.tolist() for v in vectores]


def trocear(texto: str, maximo: int = 900, solape: int = 150) -> list[str]:
    parrafos = [p.strip() for p in texto.split("\n") if p.strip()]
    fragmentos: list[str] = []
    actual = ""
    for p in parrafos:
        if len(actual) + len(p) + 1 <= maximo:
            actual = f"{actual}\n{p}".strip()
        else:
            if actual:
                fragmentos.append(actual)
            actual = (actual[-solape:] + "\n" + p).strip() if len(actual) > solape else p
            while len(actual) > maximo:
                fragmentos.append(actual[:maximo])
                actual = actual[maximo - solape :]
    if actual:
        fragmentos.append(actual)
    return fragmentos


def extraer_pdf(archivo_bytes: bytes) -> list[dict]:
    from pypdf import PdfReader

    lector = PdfReader(io.BytesIO(archivo_bytes))
    paginas = []
    for i, pagina in enumerate(lector.pages, start=1):
        texto = pagina.extract_text() or ""
        if texto.strip():
            paginas.append({"pagina": i, "texto": texto})
    return paginas


class RagNeo4j:
    def __init__(self, driver_factory):
        self._driver_factory = driver_factory

    def _session(self):
        return self._driver_factory().session()

    def modo(self) -> str:
        return "neo4j"

    def preparar_indice(self):
        with self._session() as s:
            s.run(
                f"""
                CREATE VECTOR INDEX fragmentos_idx IF NOT EXISTS
                FOR (f:Fragmento) ON (f.embedding)
                OPTIONS {{indexConfig: {{`vector.dimensions`: {DIM},
                                       `vector.similarity_function`: 'cosine'}}}}
                """
            )

    def ingestar(self, titulo: str, trozos: list[str]) -> int:
        vectores = incrustar(trozos)
        self.preparar_indice()
        with self._session() as s:
            for trozo, vec in zip(trozos, vectores):
                s.run(
                    """
                    CREATE (f:Fragmento {
                        titulo: $titulo, texto: $texto, embedding: $emb,
                        fuente_tipo: 'documento', fecha: datetime()
                    })
                    """,
                    titulo=titulo,
                    texto=trozo,
                    emb=vec,
                )
        return len(trozos)

    def buscar(self, consulta: str, k: int = 4) -> list[dict]:
        emb = incrustar([consulta], es_consulta=True)[0]
        with self._session() as s:
            filas = s.run(
                """
                CALL db.index.vector.queryNodes('fragmentos_idx', $k, $emb)
                YIELD node, score
                RETURN node.titulo AS titulo, node.texto AS texto, score
                ORDER BY score DESC
                """,
                k=k,
                emb=emb,
            ).data()
        return [
            {"titulo": f["titulo"], "texto": f["texto"], "score": round(f["score"], 3)}
            for f in filas
        ]

    def total(self) -> int:
        with self._session() as s:
            fila = s.run("MATCH (f:Fragmento) RETURN count(f) AS n").single()
        return fila["n"]

    def eliminar_por_titulo(self, titulo: str) -> int:
        with self._session() as s:
            filas = s.run(
                "MATCH (f:Fragmento {titulo: $titulo}) WITH f, count(f) AS c DETACH DELETE f RETURN sum(c) AS n",
                titulo=titulo,
            ).data()
        n = (filas[0].get("n") if filas else 0) or 0
        return int(n)


class RagJson:
    def __init__(self):
        FALLBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._ruta = FALLBACK_PATH
        if self._ruta.exists():
            self._fragmentos = json.loads(self._ruta.read_text(encoding="utf-8"))
        else:
            self._fragmentos = []

    def modo(self) -> str:
        return "json"

    def preparar_indice(self):
        pass

    def ingestar(self, titulo: str, trozos: list[str]) -> int:
        vectores = incrustar(trozos)
        for trozo, vec in zip(trozos, vectores):
            self._fragmentos.append({"titulo": titulo, "texto": trozo, "embedding": vec})
        self._ruta.write_text(json.dumps(self._fragmentos), encoding="utf-8")
        return len(trozos)

    def buscar(self, consulta: str, k: int = 4) -> list[dict]:
        q = incrustar([consulta], es_consulta=True)[0]
        resultados = []
        for f in self._fragmentos:
            similitud = sum(a * b for a, b in zip(q, f["embedding"]))
            resultados.append(
                {"titulo": f["titulo"], "texto": f["texto"], "score": round(similitud, 3)}
            )
        resultados.sort(key=lambda r: r["score"], reverse=True)
        return resultados[:k]

    def total(self) -> int:
        return len(self._fragmentos)

    def eliminar_por_titulo(self, titulo: str) -> int:
        antes = len(self._fragmentos)
        self._fragmentos = [f for f in self._fragmentos if f.get("titulo") != titulo]
        self._ruta.write_text(json.dumps(self._fragmentos), encoding="utf-8")
        return antes - len(self._fragmentos)


def get_rag(driver_factory=None) -> object:
    uri = os.getenv("NEO4J_URI")
    password = os.getenv("NEO4J_PASSWORD")
    if uri and password and driver_factory is not None:
        try:
            rag = RagNeo4j(driver_factory)
            rag.preparar_indice()
            return rag
        except Exception:
            pass
    return RagJson()


def ingestar_documento(rag, titulo: str, texto: Optional[str] = None, pdf_bytes: Optional[bytes] = None) -> dict:
    if pdf_bytes is not None:
        paginas = extraer_pdf(pdf_bytes)
        trozos = []
        for p in paginas:
            for t in trocear(p["texto"]):
                trozos.append(t)
        n = rag.ingestar(titulo, trozos)
        return {"titulo": titulo, "paginas": len(paginas), "fragmentos": n}
    trozos = trocear(texto or "")
    n = rag.ingestar(titulo, trozos)
    return {"titulo": titulo, "paginas": 1, "fragmentos": n}
