import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.gnn import (  # noqa: E402
    CAPAS_OCULTAS,
    PESOS_PATH,
    construir_grafo_conocimiento,
    matriz_adyacencia,
    normalizar,
)

import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

EPOCAS = 400
LR = 0.02
SEMILLA = 42


def entrenar(grafo, mascara_entrenamiento=None):
    torch.manual_seed(SEMILLA)
    X_raw = np.array([n["x"] for n in grafo["nodos"]])
    dim_entrada = X_raw.shape[1]
    X_std, media, desv = normalizar(X_raw)
    A_hat = torch.tensor(
        matriz_adyacencia(len(grafo["nodos"]), grafo["aristas"]), dtype=torch.float32
    )
    Xt = torch.tensor(X_std, dtype=torch.float32)

    def _param(*shape, escala=0.3):
        return torch.nn.Parameter(torch.randn(*shape) * escala)

    w1 = _param(dim_entrada, CAPAS_OCULTAS)
    b1 = _param(CAPAS_OCULTAS, escala=0.0)
    w2 = _param(CAPAS_OCULTAS, CAPAS_OCULTAS)
    b2 = _param(CAPAS_OCULTAS, escala=0.0)
    w3 = _param(CAPAS_OCULTAS, 3)
    b3 = _param(3, escala=0.0)
    params = [w1, b1, w2, b2, w3, b3]
    optimizador = torch.optim.Adam(params, lr=LR)

    Y = torch.tensor(np.array([n["y"] for n in grafo["nodos"]]), dtype=torch.float32)
    if mascara_entrenamiento is None:
        mask = torch.ones(len(Y), dtype=torch.bool)
    else:
        mask = torch.tensor(mascara_entrenamiento, dtype=torch.bool)

    for _ in range(EPOCAS):
        optimizador.zero_grad()
        h = torch.relu(A_hat @ (Xt @ w1 + b1))
        h = torch.relu(A_hat @ (h @ w2 + b2))
        salida = torch.sigmoid(h @ w3 + b3)
        perdida = F.mse_loss(salida[mask], Y[mask])
        perdida.backward()
        optimizador.step()

    def _forward():
        with torch.no_grad():
            h = torch.relu(A_hat @ (Xt @ w1 + b1))
            h = torch.relu(A_hat @ (h @ w2 + b2))
            return torch.sigmoid(h @ w3 + b3).numpy()

    return _forward, {
        "W1": w1.detach().numpy().tolist(),
        "b1": b1.detach().numpy().tolist(),
        "W2": w2.detach().numpy().tolist(),
        "b2": b2.detach().numpy().tolist(),
        "W3": w3.detach().numpy().tolist(),
        "b3": b3.detach().numpy().tolist(),
        "feat_mean": media.tolist(),
        "feat_std": desv.tolist(),
    }


def main():
    grafo = construir_grafo_conocimiento()
    cultivos = sorted({n["cultivo_id"] for n in grafo["nodos"]})
    print(f"Grafo: {len(grafo['nodos'])} nodos-fase, {len(grafo['aristas'])} aristas, {len(cultivos)} cultivos")

    metricas_loo = {}
    errores = []
    for cultivo in cultivos:
        mascara = [n["cultivo_id"] != cultivo for n in grafo["nodos"]]
        forward, _ = entrenar(grafo, mascara)
        idx = [i for i, n in enumerate(grafo["nodos"]) if n["cultivo_id"] == cultivo]
        real = np.array([grafo["nodos"][i]["y"] for i in idx]) * 100.0
        predicho = forward()[idx] * 100.0
        mae = float(np.abs(real - predicho).mean())
        mae_por_nutriente = np.abs(real - predicho).mean(axis=0).round(1).tolist()
        metricas_loo[cultivo] = {"mae_puntos": round(mae, 1), "mae_npk": mae_por_nutriente}
        errores.extend((real - predicho).ravel().tolist())
        print(f"  LOO {cultivo:<8} MAE={mae:5.1f} pts | N/P/K={mae_por_nutriente}")

    mae_global = float(np.abs(np.array(errores)).mean())
    print(f"MAE global leave-one-out: {mae_global:.1f} puntos porcentuales")

    _, pesos = entrenar(grafo)
    pesos["metricas_loo"] = {"mae_global": round(mae_global, 1), "por_cultivo": metricas_loo}
    pesos["entrenado_en"] = datetime.now(timezone.utc).isoformat()
    pesos["arquitectura"] = f"gcn_familiar_2x{CAPAS_OCULTAS}_sigmoide"
    pesos["familias"] = grafo.get("familias", [])

    PESOS_PATH.write_text(json.dumps(pesos), encoding="utf-8")
    print(f"Pesos exportados a {PESOS_PATH}")


if __name__ == "__main__":
    main()
