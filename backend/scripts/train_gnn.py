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
PESO_MONOTONIA = 0.3
DECADENCIA_PESO = 1e-4
SEMILLAS_ENSEMBLE = [1, 2, 3, 42, 99]


def _dispositivo():
    import os

    pref = os.getenv("GNN_DEVICE", "auto").strip().lower()
    if torch.cuda.is_available() and pref in ("auto", "cuda", "gpu"):
        return torch.device("cuda")
    return torch.device("cpu")


def entrenar(grafo, mascara_entrenamiento=None, semilla=SEMILLA):
    torch.manual_seed(semilla)
    dispositivo = _dispositivo()
    X_raw = np.array([n["x"] for n in grafo["nodos"]])
    dim_entrada = X_raw.shape[1]
    X_std, media, desv = normalizar(X_raw)
    A_hat = torch.tensor(
        matriz_adyacencia(len(grafo["nodos"]), grafo["aristas"]),
        dtype=torch.float32,
        device=dispositivo,
    )
    Xt = torch.tensor(X_std, dtype=torch.float32, device=dispositivo)

    def _param(*shape, escala=0.3):
        return torch.nn.Parameter(
            torch.randn(*shape, device=dispositivo) * escala
        )

    w1 = _param(dim_entrada, CAPAS_OCULTAS)
    b1 = _param(CAPAS_OCULTAS, escala=0.0)
    w2 = _param(CAPAS_OCULTAS, CAPAS_OCULTAS)
    b2 = _param(CAPAS_OCULTAS, escala=0.0)
    w3 = _param(CAPAS_OCULTAS, 3)
    b3 = _param(3, escala=0.0)
    params = [w1, b1, w2, b2, w3, b3]
    optimizador = torch.optim.Adam(params, lr=LR, weight_decay=DECADENCIA_PESO)

    Y = torch.tensor(
        np.array([n["y"] for n in grafo["nodos"]]),
        dtype=torch.float32,
        device=dispositivo,
    )
    if mascara_entrenamiento is None:
        mask = torch.ones(len(Y), dtype=torch.bool, device=dispositivo)
    else:
        mask = torch.tensor(mascara_entrenamiento, dtype=torch.bool, device=dispositivo)

    ordenes = torch.tensor(
        [n["orden"] for n in grafo["nodos"]], dtype=torch.float32, device=dispositivo
    )
    cultivos_t = [n["cultivo_id"] for n in grafo["nodos"]]
    mat_mono = torch.zeros((len(Y), len(Y)), dtype=torch.float32, device=dispositivo)
    for i in range(len(Y)):
        for j in range(len(Y)):
            if cultivos_t[i] == cultivos_t[j] and ordenes[i].item() + 1 == ordenes[j].item():
                mat_mono[i, j] = 1.0

    def _forward_tensors():
        h = torch.relu(A_hat @ (Xt @ w1 + b1))
        h = torch.relu(A_hat @ (h @ w2 + b2))
        return torch.sigmoid(h @ w3 + b3)

    for _ in range(EPOCAS):
        optimizador.zero_grad()
        salida = _forward_tensors()
        perdida_ajuste = F.mse_loss(salida[mask], Y[mask])
        caidas = torch.relu(
            -(mat_mono.unsqueeze(-1) * (salida.unsqueeze(0) - salida.unsqueeze(1)))
        ).sum()
        perdida = perdida_ajuste + PESO_MONOTONIA * caidas / max(mask.sum().item(), 1)
        perdida.backward()
        optimizador.step()

    def _forward():
        with torch.no_grad():
            return _forward_tensors().cpu().numpy()

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

    print(f"Dispositivo: {_dispositivo()}")

    metricas_loo = {}
    errores = []
    for cultivo in cultivos:
        mascara = [n["cultivo_id"] != cultivo for n in grafo["nodos"]]
        idx = [i for i, n in enumerate(grafo["nodos"]) if n["cultivo_id"] == cultivo]
        real = np.array([grafo["nodos"][i]["y"] for i in idx]) * 100.0
        corridas = []
        for semilla in SEMILLAS_ENSEMBLE:
            forward, _ = entrenar(grafo, mascara, semilla=semilla)
            corridas.append(forward())
        predicho = np.mean(corridas, axis=0)[idx] * 100.0
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
    pesos["arquitectura"] = f"gcn_familiar_2x{CAPAS_OCULTAS}_sigmoide_reg_mono_ensemble"
    pesos["familias"] = grafo.get("familias", [])
    pesos["dispositivo_entrenamiento"] = str(_dispositivo())

    PESOS_PATH.write_text(json.dumps(pesos), encoding="utf-8")
    print(f"Pesos exportados a {PESOS_PATH}")


if __name__ == "__main__":
    main()
