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


init_db()
