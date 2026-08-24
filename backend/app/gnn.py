import json
import math
from pathlib import Path
from typing import Optional

import numpy as np

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "seed_knowledge.json"
PESOS_PATH = Path(__file__).resolve().parent.parent / "data" / "gnn_weights.json"

DIM_ENTRADA_BASE = 6
CAPAS_OCULTAS = 16
NUM_FASES_BASE = 4
PESO_MISMA_FAMILIA = 1.0
PESO_OTRA_FAMILIA = 1.0


def _caracteristicas(orden_frac: float, bbch_ini: int, bbch_fin: int, ext: dict, familia_idx: int, num_familias: int) -> list[float]:
    one_hot = [1.0 if i == familia_idx else 0.0 for i in range(num_familias)]
    return [
        orden_frac,
        min(bbch_ini, 99) / 99.0,
        min(bbch_fin, 99) / 99.0,
        math.log1p(ext["N"]),
        math.log1p(ext["P"]),
        math.log1p(ext["K"]),
    ] + one_hot


def construir_grafo_conocimiento() -> dict:
    with open(DATA_PATH, encoding="utf-8") as f:
        datos = json.load(f)

    familias = sorted({c.get("familia", "desconocida") for c in datos["cultivos"]})
    nodos = []
    for c in datos["cultivos"]:
        fidx = familias.index(c.get("familia", "desconocida"))
        for fase in c["fases"]:
            nodos.append(
                {
                    "cultivo_id": c["id"],
                    "familia": c.get("familia", "desconocida"),
                    "orden": fase["orden"],
                    "x": _caracteristicas(
                        fase["orden"] / NUM_FASES_BASE,
                        int(fase["bbch_inicio"]),
                        int(fase["bbch_fin"]),
                        c["extraccion_por_tonelada"],
                        fidx,
                        len(familias),
                    ),
                    "y": [
                        fase["curva_pct_acumulada"]["N"] / 100.0,
                        fase["curva_pct_acumulada"]["P"] / 100.0,
                        fase["curva_pct_acumulada"]["K"] / 100.0,
                    ],
                }
            )

    aristas = []
    for i, a in enumerate(nodos):
        for j, b in enumerate(nodos):
            if i >= j:
                continue
            if a["cultivo_id"] == b["cultivo_id"] and abs(a["orden"] - b["orden"]) == 1:
                aristas.append((i, j, PESO_MISMA_FAMILIA))
            elif a["cultivo_id"] != b["cultivo_id"] and a["orden"] == b["orden"]:
                peso = PESO_MISMA_FAMILIA if a["familia"] == b["familia"] else PESO_OTRA_FAMILIA
                aristas.append((i, j, peso))

    return {"nodos": nodos, "aristas": aristas, "familias": familias}


def normalizar(X: np.ndarray, media=None, desv=None):
    if media is None:
        media = X.mean(axis=0)
        desv = X.std(axis=0) + 1e-8
    return (X - media) / desv, media, desv


def matriz_adyacencia(num_nodos: int, aristas: list[tuple[int, int, float]]) -> np.ndarray:
    A = np.eye(num_nodos)
    for i, j, w in aristas:
        A[i][j] = w
        A[j][i] = w
    grados = A.sum(axis=1)
    D_inv_sqrt = 1.0 / np.sqrt(grados)
    return D_inv_sqrt[:, None] * A * D_inv_sqrt[None, :]


def forward_np(X: np.ndarray, A_hat: np.ndarray, pesos: dict) -> np.ndarray:
    w1 = np.array(pesos["W1"])
    b1 = np.array(pesos["b1"])
    w2 = np.array(pesos["W2"])
    b2 = np.array(pesos["b2"])
    w3 = np.array(pesos["W3"])
    b3 = np.array(pesos["b3"])

    h = np.maximum(A_hat @ (X @ w1 + b1), 0.0)
    h = np.maximum(A_hat @ (h @ w2 + b2), 0.0)
    z = h @ w3 + b3
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30.0, 30.0)))


_pesos_cache = None


def cargar_pesos() -> Optional[dict]:
    global _pesos_cache
    if _pesos_cache is None:
        if not PESOS_PATH.exists():
            return None
        with open(PESOS_PATH, encoding="utf-8") as f:
            _pesos_cache = json.load(f)
    return _pesos_cache


def predecir_curva(extraccion_por_t: dict, num_fases: int = 4, familia: Optional[str] = None) -> dict:
    pesos = cargar_pesos()
    if not pesos:
        raise ValueError(
            "Modelo GNN no entrenado. Ejecuta backend/scripts/train_gnn.py para generarlo."
        )
    num_fases = max(2, min(int(num_fases or NUM_FASES_BASE), 12))

    grafo = construir_grafo_conocimiento()
    familias: list[str] = pesos.get("familias") or grafo.get("familias", [])
    familia_norm = (familia or "").strip().lower() or "desconocida"
    if familia_norm in familias:
        familia_idx = familias.index(familia_norm)
    else:
        familia_idx = -1

    nodos = grafo["nodos"]
    aristas = [(i, j, w) for i, j, w in grafo["aristas"]]

    nuevos = []
    base = len(nodos)
    ext = {
        "N": max(float(extraccion_por_t.get("N", 0)), 0.01),
        "P": max(float(extraccion_por_t.get("P", 0)), 0.01),
        "K": max(float(extraccion_por_t.get("K", 0)), 0.01),
    }
    for i in range(1, num_fases + 1):
        ini = round((i - 1) * 99 / num_fases)
        fin = round(i * 99 / num_fases)
        nuevos.append(
            {
                "cultivo_id": "_prediccion",
                "orden": i,
                "x": _caracteristicas(i / num_fases, ini, fin, ext, familia_idx, len(familias)),
            }
        )

    ordenes_conocidos = sorted({n["orden"] / NUM_FASES_BASE for n in nodos})
    for k, nuevo in enumerate(nuevos):
        idx_real = base + k
        frac = nuevo["orden"] / num_fases
        mas_cercano = min(ordenes_conocidos, key=lambda o: abs(o - frac))
        for j, n in enumerate(nodos):
            if n["orden"] / NUM_FASES_BASE == mas_cercano:
                peso = (
                    PESO_MISMA_FAMILIA
                    if familia_idx >= 0 and n.get("familia") == familia_norm
                    else PESO_OTRA_FAMILIA
                )
                aristas.append((idx_real, j, peso))

    todos = nodos + nuevos
    X_raw = np.array([n["x"] for n in todos])
    X_std, _, _ = normalizar(
        X_raw, np.array(pesos["feat_mean"]), np.array(pesos["feat_std"])
    )
    A_hat = matriz_adyacencia(len(todos), aristas)
    salida = forward_np(X_std, A_hat, pesos)[base:]

    curvas = []
    acumulado = {n: 0.0 for n in ["N", "P", "K"]}
    claves = ["N", "P", "K"]
    for i, fila in enumerate(salida):
        for pos, clave in enumerate(claves):
            acumulado[clave] = max(acumulado[clave], float(fila[pos]) * 100.0)
        ini = round((i) * 99 / num_fases)
        fin = round((i + 1) * 99 / num_fases)
        curvas.append(
            {
                "orden": i + 1,
                "nombre": f"Fase {i + 1}",
                "bbch": f"{ini:02d}-{fin:02d}",
                "pct_acumulado": {c: round(min(acumulado[c], 100.0), 1) for c in claves},
            }
        )
    ultima = curvas[-1]
    for c in claves:
        ultima["pct_acumulado"][c] = 100.0

    return {
        "extraccion_entrada_kg_t": ext,
        "familia": familia_norm if familia_idx >= 0 else None,
        "familia_reconocida": familia_idx >= 0,
        "num_fases": num_fases,
        "curva_predicha": curvas,
        "modelo": {
            "arquitectura": pesos.get("arquitectura", "gcn"),
            "entrenado_en": pesos.get("entrenado_en"),
            "metricas_loo_mae_puntos": pesos.get("metricas_loo", {}).get("mae_global"),
        },
        "advertencia": (
            "Curva GENERADA por IA (GNN) sin validacion experimental. "
            "Usar solo como punto de partida; validar con analisis de planta antes de aplicar."
        ),
    }
