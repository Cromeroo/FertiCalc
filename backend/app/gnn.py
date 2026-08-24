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


def _percentil(valor: float, muestras: list[float]) -> str:
    if not muestras:
        return "media"
    menores = sum(1 for m in muestras if m <= valor)
    pct = menores / len(muestras) * 100.0
    if pct >= 70:
        return "alta"
    if pct <= 30:
        return "baja"
    return "media"


def _explicar(grafo, pesos, X_std_nuevos, familia_norm, familia_idx, ext, num_fases):
    nodos = grafo["nodos"]
    familias = pesos.get("familias") or grafo.get("familias", [])
    media = np.array(pesos["feat_mean"])

    todos_x = np.array([n["x"] for n in nodos])
    todos_std, _, _ = normalizar(todos_x, media, np.array(pesos["feat_std"]))
    base = len(nodos)
    ordenes_conocidos = sorted({n["orden"] / NUM_FASES_BASE for n in nodos})

    def forward_con(nuevas_filas):
        aristas = list(grafo["aristas"])
        for k in range(nuevas_filas.shape[0]):
            frac = (k + 1) / num_fases
            cercano = min(ordenes_conocidos, key=lambda o: abs(o - frac))
            for j, n in enumerate(nodos):
                if n["orden"] / NUM_FASES_BASE == cercano:
                    w = (
                        PESO_MISMA_FAMILIA
                        if familia_idx >= 0 and n.get("familia") == familia_norm
                        else PESO_OTRA_FAMILIA
                    )
                    aristas.append((base + k, j, w))
        A_hat = matriz_adyacencia(base + nuevas_filas.shape[0], aristas)
        return forward_np(np.vstack([todos_std, nuevas_filas]), A_hat, pesos)[base:]

    salida_base = forward_con(X_std_nuevos)

    grupos = {
        "posicion_fenologica": [0, 1, 2],
        "extraccion_objetivo": [3, 4, 5],
        "familia_botanica": list(range(DIM_ENTRADA_BASE, DIM_ENTRADA_BASE + len(familias))),
    }
    deltas = {}
    for nombre_grupo, dims in grupos.items():
        X_occ = X_std_nuevos.copy()
        X_occ[:, dims] = media[dims]
        deltas[nombre_grupo] = float(np.abs(salida_base - forward_con(X_occ)).mean())

    total_delta = sum(deltas.values()) or 1.0
    etiquetas = {
        "posicion_fenologica": "Posicion fenologica (BBCH)",
        "extraccion_objetivo": "Extraccion por tonelada ingresada",
        "familia_botanica": "Familia botanica",
    }
    factores = [
        {"factor": etiquetas[k], "influencia_pct": round(deltas[k] / total_delta * 100, 1)}
        for k in ["posicion_fenologica", "extraccion_objetivo", "familia_botanica"]
    ]

    with open(DATA_PATH, encoding="utf-8") as f:
        catalogo = json.load(f)
    ext_catalogo = {c["id"]: c["extraccion_por_tonelada"] for c in catalogo["cultivos"]}

    similitudes: dict[str, float] = {}
    X_conocidos = np.array([n["x"] for n in nodos])
    normas = np.linalg.norm(X_conocidos, axis=1) + 1e-8
    for i_nuevo in range(X_std_nuevos.shape[0]):
        cosenos = (X_conocidos @ X_std_nuevos[i_nuevo]) / (
            normas * np.linalg.norm(X_std_nuevos[i_nuevo]) + 1e-8
        )
        for cid in ext_catalogo:
            idx_cultivo = [i for i, n in enumerate(nodos) if n["cultivo_id"] == cid]
            mejor = float(cosenos[idx_cultivo].max())
            similitudes[cid] = max(similitudes.get(cid, -1.0), mejor)

    top = sorted(similitudes.items(), key=lambda kv: kv[1], reverse=True)[:3]
    suma_top = sum(v for _, v in top) or 1.0
    referencias_influyentes = []
    for cid, sim in top:
        cultivo_cat = next(c for c in catalogo["cultivos"] if c["id"] == cid)
        referencias_influyentes.append(
            {
                "cultivo_id": cid,
                "nombre": cultivo_cat["nombre"],
                "familia": cultivo_cat.get("familia"),
                "apoyo_pct": round(sim / suma_top * 100, 1),
                "curva_real": [
                    {
                        "orden": f["orden"],
                        "pct_acumulado": {k: f["curva_pct_acumulada"][k] for k in ["N", "P", "K"]},
                    }
                    for f in cultivo_cat["fases"]
                ],
            }
        )

    p1 = referencias_influyentes[0]
    nivel_n = _percentil(ext["N"], [e["N"] for e in ext_catalogo.values()])
    razonamiento = (
        f"La prediccion se apoya principalmente en {p1['nombre']} ({p1['apoyo_pct']}% de similitud), "
        f"cultivo de la familia {p1['familia']} que comparte patron de acumulacion con el objetivo. "
        f"La extraccion ingresada (N {ext['N']}, P2O5 {ext['P']}, K2O {ext['K']} kg/t) es de nivel "
        f"{nivel_n} en nitrogeno respecto al catalogo. El modelo explica sus salidas por posicion "
        f"fenologica ({factores[0]['influencia_pct']}%), por los niveles de extraccion "
        f"({factores[1]['influencia_pct']}%) y por la familia ({factores[2]['influencia_pct']}%)."
    )

    return {
        "factores": factores,
        "referencias_influyentes": referencias_influyentes,
        "razonamiento": razonamiento,
    }


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
    salida_todos = forward_np(X_std, A_hat, pesos)
    salida = salida_todos[base:]
    explicacion = _explicar(
        grafo, pesos, X_std[base:], familia_norm, familia_idx, ext, num_fases
    )

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
        "explicacion": explicacion,
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



def plan_desde_prediccion(
    kb,
    extraccion_por_t: dict,
    num_fases: int = 4,
    familia: Optional[str] = None,
    rendimiento_t_ha: float = 0.0,
    analisis_suelo: Optional[dict] = None,
    eficiencias: Optional[dict] = None,
) -> dict:
    from datetime import datetime, timezone

    from .engine import calcular_recomendacion
    from .schemas import AnalisisSuelo, Eficiencias, RecomendacionResponse, SolicitudRecomendacion

    prediccion = predecir_curva(extraccion_por_t, num_fases, familia)

    ext = prediccion['extraccion_entrada_kg_t']
    fam_txt = (familia or 'no especificada').strip().lower()
    fases = [
        {
            'orden': c['orden'],
            'nombre': c['nombre'],
            'bbch_inicio': c['bbch'].split('-')[0],
            'bbch_fin': c['bbch'].split('-')[1],
            'descripcion': 'Fase estimada por GNN (sin validacion experimental)',
            'curva_pct_acumulada': c['pct_acumulado'],
            'referencia_curva': 'gnn_prediccion',
        }
        for c in prediccion['curva_predicha']
    ]
    cultivo_sintetico = {
        'id': 'personalizado',
        'nombre': f'Cultivo personalizado ({fam_txt})',
        'unidad_rendimiento': 't/ha',
        'extraccion_por_tonelada': {
            'N': float(ext['N']),
            'P': float(ext['P']),
            'K': float(ext['K']),
        },
        'preferencia_fuentes': None,
        'referencias_extraccion': [],
        'notas': (
            'Plan basado en curva PREDICHA por IA (GNN), no validada experimentalmente. '
            'Ajustar con analisis foliar por fase.'
        ),
        'fases': fases,
    }

    class _ProxyKB:
        def __init__(self, base, cultivo):
            self._base = base
            self._cultivo = cultivo

        def cultivos(self):
            return self._base.cultivos()

        def cultivo(self, cultivo_id):
            return self._cultivo if cultivo_id == 'personalizado' else None

        def referencias(self, ids):
            refs = dict(self._base.referencias(ids))
            refs.setdefault(
                'gnn_prediccion',
                {
                    'id': 'gnn_prediccion',
                    'autores': 'FertiCalc GNN',
                    'anio': datetime.now(timezone.utc).year,
                    'titulo': 'Prediccion de curva de absorcion mediante red neuronal de grafos',
                    'fuente': 'Modelo interno experimental (MAE LOO ver /api/gnn/estado)',
                },
            )
            return refs

        def fuentes(self):
            return self._base.fuentes()

        def eficiencias_default(self):
            return self._base.eficiencias_default()

        def reglas(self):
            return self._base.reglas()

        def cadena_completa(self, cultivo_id):
            return None

    suelo = analisis_suelo or {}
    sol = SolicitudRecomendacion(
        cultivo_id='personalizado',
        rendimiento_t_ha=float(rendimiento_t_ha or 1),
        analisis_suelo=AnalisisSuelo(
            n_disponible_kg_ha=float(suelo.get('n_disponible_kg_ha') or 0),
            p2o5_disponible_kg_ha=float(suelo.get('p2o5_disponible_kg_ha') or 0),
            k2o_disponible_kg_ha=float(suelo.get('k2o_disponible_kg_ha') or 0),
        ),
        eficiencias=(
            Eficiencias(**eficiencias)
            if eficiencias
            else Eficiencias(**kb.eficiencias_default())
        ),
        fase_desde_orden=None,
    )
    recomendacion = calcular_recomendacion(_ProxyKB(kb, cultivo_sintetico), sol)

    d = recomendacion.model_dump()
    d['advertencias'].insert(
        0,
        'PLAN BASADO EN CURVA PREDICHA POR IA: usar como punto de partida y validar con analisis de tejido vegetal.',
    )
    recomendacion = RecomendacionResponse.model_validate(d)

    return {'prediccion': prediccion, 'plan': recomendacion}
