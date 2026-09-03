import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ferticalc.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS planes (
                id TEXT PRIMARY KEY,
                nombre TEXT NOT NULL,
                cultivo_id TEXT NOT NULL,
                cultivo_nombre TEXT,
                rendimiento_t_ha REAL,
                fecha TEXT NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rating INTEGER NOT NULL,
                comentario TEXT DEFAULT '',
                origen TEXT DEFAULT 'chat',
                fecha TEXT NOT NULL
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS siembras (
                id TEXT PRIMARY KEY,
                plan_id TEXT NOT NULL,
                fecha_inicio TEXT NOT NULL,
                dias_estimados_fase REAL NOT NULL,
                bbch_actual TEXT DEFAULT '00',
                creada TEXT NOT NULL,
                FOREIGN KEY (plan_id) REFERENCES planes(id) ON DELETE CASCADE
            )
            """
        )
        with _conn() as c2:
            cols = {r[1] for r in c2.execute("PRAGMA table_info(siembras)").fetchall()}
        if "familia" not in cols:
            with _conn() as c3:
                c3.execute("ALTER TABLE siembras ADD COLUMN familia TEXT DEFAULT ''")
                c3.execute("ALTER TABLE siembras ADD COLUMN especie TEXT DEFAULT ''")
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS aplicaciones (
                siembra_id TEXT NOT NULL,
                orden_fase INTEGER NOT NULL,
                estado TEXT DEFAULT 'pendiente',
                aplicada TEXT DEFAULT '',
                PRIMARY KEY (siembra_id, orden_fase),
                FOREIGN KEY (siembra_id) REFERENCES siembras(id) ON DELETE CASCADE
            )
            """
        )


def guardar_plan(nombre: str, cultivo_id: str, cultivo_nombre: str, rendimiento: float, recomendacion: dict) -> str:
    plan_id = uuid.uuid4().hex[:12]
    with _conn() as c:
        c.execute(
            "INSERT INTO planes VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                plan_id,
                nombre,
                cultivo_id,
                cultivo_nombre,
                rendimiento,
                datetime.now(timezone.utc).isoformat(),
                json.dumps(recomendacion, ensure_ascii=False),
            ),
        )
    return plan_id


def listar_planes() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT id, nombre, cultivo_id, cultivo_nombre, rendimiento_t_ha, fecha FROM planes ORDER BY fecha DESC"
        ).fetchall()
    return [dict(r) for r in rows]


def obtener_plan(plan_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM planes WHERE id = ?", (plan_id,)).fetchone()
    if not row:
        return None
    plan = dict(row)
    plan["recomendacion"] = json.loads(plan.pop("payload"))
    return plan


def eliminar_plan(plan_id: str) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM planes WHERE id = ?", (plan_id,))
    return cur.rowcount > 0


def guardar_feedback(rating: int, comentario: str, origen: str) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO feedback (rating, comentario, origen, fecha) VALUES (?, ?, ?, ?)",
            (rating, comentario, origen, datetime.now(timezone.utc).isoformat()),
        )
    return cur.lastrowid


def listar_feedback(limite: int = 200) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT id, rating, comentario, origen, fecha FROM feedback ORDER BY fecha DESC LIMIT ?",
            (limite,),
        ).fetchall()
    return [dict(r) for r in rows]


def crear_siembra(plan_id: str, fecha_inicio: str, dias_estimados_fase: float, familia: str = "", especie: str = "") -> str:
    siembra_id = uuid.uuid4().hex[:12]
    with _conn() as c:
        c.execute(
            "INSERT INTO siembras (id, plan_id, fecha_inicio, dias_estimados_fase, familia, especie, creada) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                siembra_id,
                plan_id,
                fecha_inicio,
                dias_estimados_fase,
                familia,
                especie,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
    return siembra_id


def obtener_siembra(siembra_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute("SELECT * FROM siembras WHERE id = ?", (siembra_id,)).fetchone()
    if not row:
        return None
    siembra = dict(row)
    with _conn() as c:
        filas = c.execute(
            "SELECT orden_fase, estado, aplicada FROM aplicaciones WHERE siembra_id = ? ORDER BY orden_fase",
            (siembra_id,),
        ).fetchall()
    siembra["aplicaciones"] = [dict(f) for f in filas]
    return siembra


def listar_siembras() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """
            SELECT s.id, s.plan_id, s.fecha_inicio, s.dias_estimados_fase,
                   s.bbch_actual, s.familia, s.especie, s.creada, p.nombre AS plan_nombre,
                   p.cultivo_nombre, p.rendimiento_t_ha
            FROM siembras s JOIN planes p ON p.id = s.plan_id
            ORDER BY s.creada DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def actualizar_bbch(siembra_id: str, bbch_actual: str) -> bool:
    with _conn() as c:
        cur = c.execute(
            "UPDATE siembras SET bbch_actual = ? WHERE id = ?",
            (bbch_actual, siembra_id),
        )
    return cur.rowcount > 0


def marcar_aplicacion(siembra_id: str, orden_fase: int, estado: str) -> bool:
    with _conn() as c:
        cur = c.execute(
            """
            INSERT INTO aplicaciones (siembra_id, orden_fase, estado, aplicada)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (siembra_id, orden_fase)
            DO UPDATE SET estado = excluded.estado, aplicada = excluded.aplicada
            """,
            (
                siembra_id,
                orden_fase,
                estado,
                datetime.now(timezone.utc).isoformat() if estado == "aplicada" else "",
            ),
        )
    return cur.rowcount > 0


init_db()
