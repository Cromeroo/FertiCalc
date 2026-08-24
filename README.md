# FertiCalc

MVP de recomendación de fertilización por fase fenológica (escala BBCH) con motor **determinista** y conocimiento modelado como **grafo**, con trazabilidad completa de cada número a su fuente bibliográfica.

## Tesis del proyecto

1. **El cálculo nunca es generado por IA**: `Dosis = (Demanda − AporteSuelo) / ERF` (Stanford, 1973), repartido por fases según curvas de absorción acumuladas.
2. **Cada resultado es auditable**: la API devuelve un árbol de evidencia (fórmula → valores → resultado → referencia).
3. El grafo (`Cultivo→Fase→Nutriente`, `Fuente→Aporta→Nutriente`, `Reglas de antagonismo`) es la base para razonamiento multi-salto y, más adelante, GNN sobre PyTorch Geometric.

## Estado actual (v0.2.0)

- ✅ 7 cultivos con curvas BBCH y referencias: tomate, maíz, chile, fresa, lechuga, papa, sandía
- ✅ 8 fuentes fertilizantes (sólidas + líquidas de fertirriego: UAN 32%, ácido fosfórico)
- ✅ Selección de fuentes preferidas **por cultivo** (fertirriego vs edáfico)
- ✅ Reglas de antagonismo iónico evaluadas sobre la dosis final (K↔Ca/Mg, P↔Zn, fraccionamiento de N) con cita
- ✅ Planes guardables en SQLite (CRUD completo)
- ✅ Chat LLM con function calling (Gemini) — el motor determinista calcula, el LLM explica
- ✅ Feedback 👍/👎 para curación human-in-the-loop
- ✅ **RAG literario**: PDFs/textos → embeddings e5 → índice vectorial DENTRO de Neo4j (grafo-first, sin vector DB externa); el chat cita fragmentos
- ✅ **GNN PyTorch**: GCN 2×16 entrenada con validación leave-one-out (MAE ±8.8 pts); pesos exportados a JSON → inferencia sin torch; predice curvas de cultivos sin literatura (marcadas como IA no validada)
- ✅ Frontend React con evidencia navegable (ver [frontend/SKILLS.md](frontend/SKILLS.md))

## Cómo correr

### Todo con Docker

```bash
docker compose up -d --build
docker compose exec api python scripts/load_seed.py   # carga el grafo
```

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs
- Neo4j Browser: http://localhost:7474 (`neo4j` / `ferticalc123`)

### Backend rápido sin Docker

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # usa semilla JSON si no hay Neo4j
```

### Frontend en desarrollo

```bash
cd frontend
npm install
npm run dev    # proxy /api -> localhost:8000
```

## Endpoints

| Endpoint | Descripción |
|---|---|
| `GET /health` | Estado y modo de conocimiento (`json` o `neo4j`) |
| `GET /api/cultivos` | Catálogo |
| `GET /api/cultivos/{id}` | Fases BBCH, curvas y referencias |
| `GET /api/cadena/{id}` | Traza completa cultivo→fase→%extracción→cita |
| `POST /api/recomendacion` | Plan de fertilización con árbol de evidencia y avisos de antagonismo |
| `GET/POST /api/planes`, `GET/DELETE /api/planes/{id}` | Persistencia de planes |
| `POST /api/chat` | Asistente LLM (function calling sobre el motor) |
| `POST /api/feedback`, `GET /api/feedback` | Curación human-in-the-loop |
| `POST /api/conocimiento/pdf` \| `/texto` | Ingesta de literatura al RAG vectorial en Neo4j |
| `POST /api/conocimiento/buscar` | Búsqueda semántica en la biblioteca |
| `GET /api/gnn/estado` · `POST /api/gnn/predecir` | Curvas predichas por GNN (experimental) |

Entrenar la GNN tras ampliar el catálogo:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
python backend/scripts/train_gnn.py   # imprime métricas LOO y exporta data/gnn_weights.json
```

Ejemplo:

```bash
curl -X POST http://localhost:8000/api/recomendacion \
  -H "Content-Type: application/json" \
  -d '{"cultivo_id":"papa","rendimiento_t_ha":40,"analisis_suelo":{"n_disponible_kg_ha":50,"p2o5_disponible_kg_ha":30,"k2o_disponible_kg_ha":80}}'
```

## Consulta Cypher del hito (traza trazable)

```cypher
MATCH (c:Cultivo {id:'tomate'})-[:TIENE_FASE]->(f:FaseFenologica)-[ex:EXTRAE]->(n:Nutriente)
RETURN f.nombre, n.id, ex.pct_acumulado, ex.fuente_ref ORDER BY f.orden, n.id;
```

## Estructura

```
ferticalc/
├── backend/
│   ├── app/
│   │   ├── main.py        # FastAPI
│   │   ├── engine.py      # motor determinista (Stanford + curvas + antagonismos)
│   │   ├── graph.py       # acceso a conocimiento (Neo4j o JSON)
│   │   ├── db.py          # planes en SQLite
│   │   └── schemas.py     # contratos Pydantic
│   ├── data/              # seed_knowledge.json + ferticalc.db (volumen Docker)
│   └── scripts/load_seed.py
├── frontend/              # React + Vite (ver SKILLS.md)
└── docker-compose.yml     # neo4j + api + web
```

## Roadmap

- [x] MVP calculadora determinista + evidencia
- [x] Ontología grafo (7 cultivos)
- [x] Antagonismos y fuentes líquidas/sólidas por cultivo
- [x] Persistencia de planes
- [x] Chat LLM vía function calling (Gemini, intercambiable por Qwen/Ollama)
- [x] RAG literario con embeddings en Neo4j
- [x] GNN PyTorch para predecir curvas de cultivos sin literatura
- [ ] Validación agronómica formal de curvas y ampliación del catálogo
- [ ] Micronutrientes (Ca, Mg, S, Zn) y salinidad

## Advertencia

Los valores incluidos son de **demostración** (Salazar-Jara & Juárez-López 2013; Bertsch 2016; Intagri; Marschner 1995). Validar con un agrónomo antes de cualquier uso productivo.
