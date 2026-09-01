# FertiCalc — Arquitectura del agente

Documento vivo. Cuando un componente cambie, actualiza aquí su diagrama.

## Vista general (capa a capa)

```mermaid
flowchart TB
    subgraph Cliente["Cliente (navegador)"]
        UI["React + TypeScript + Tailwind<br/>shadcn-style (frontend/)"]
    end

    subgraph Nginx["Nginx (Docker · contenedor web)"]
        SPA["Sirve dist/<br/>proxy /api/* y /health → api:8000"]
    end

    subgraph API["API FastAPI (Docker · contenedor api)"]
        END["Routers (app/main.py)"]
        ENG["Motor determinista<br/>Stanford (Dem-Sum)/ERF + curvas<br/>(app/engine.py)"]
        LLM["Cliente Gemini<br/>function calling (app/llm.py)"]
        RAG["Embeddings multilingual-e5-small<br/>índice vectorial en Neo4j<br/>(app/rag.py)"]
        GNN["Predicción de curvas por GNN<br/>weights JSON · numpy (app/gnn.py)"]
        DB["SQLite planes + feedback (app/db.py)"]
    end

    subgraph Grafo["Neo4j 5 Community (Docker · contenedor neo4j)"]
        N4J["Catálogo cultivo-fase-nutriente-fuente-regla<br/>índices:<br/>• únicos (id)<br/>• vector (fragmentos)"]
    end

    subgraph Externos["Externos"]
        GEM["Google Gemini 3.6 Flash<br/>(vía REST)"]
        HF["HuggingFace Hub<br/>(modelo e5-small, primera vez)"]
        PDF["PDFs / textos del usuario<br/>(ingesta)"]
    end

    UI -->|"fetch /api/*<br/>fetch /health"| SPA
    SPA -->|"proxy_pass"| END
    END --> ENG
    END --> LLM
    END --> RAG
    END --> GNN
    END --> DB
    ENG -->|"lee/usa curvas, reglas, fuentes"| N4J
    RAG -->|"fragmentos + embedding"| N4J
    LLM -->|"function_call args"| ENG
    LLM -->|"function_call args"| RAG
    LLM -->|"function_call args"| GNN
    LLM -->|"POST :generateContent"| GEM
    RAG -->|"descarga 1ª vez"| HF
    RAG -->|"pypdf extrae texto"| PDF
    GNN -->|"lee pesos|gnn_weights.json"| N4J
```

## Componentes en detalle

### 1. Frontend (browser)

`frontend/src/` con TypeScript estricto. Sin estado global (todo useState en `App.tsx`).

| Archivo | Rol |
|---|---|
| `App.tsx` | Orquestador: catálogo, parámetros, resultado, chat, laboratorio, planes. Esqueletos con skeletons. Banner de error global. |
| `components/FormularioLote.tsx` | Formulario principal para cultivos del catálogo: cultivo + rendimiento + suelo + ERF + fase desde. |
| `components/Resultados.tsx` | Render de un `RecomendacionResponse`: KPIs, advertencias, tabla por fase con barras N/P/K y chips de fuentes, evidencia y referencias en `<details>`. |
| `components/Evidencia.tsx` | Pasos de cálculo + lista de referencias bibliográficas. |
| `components/PlanesGuardados.tsx` | Lista de planes en SQLite (CRUD). |
| `components/Chat.tsx` | Chat LLM con `Markdown.tsx` (react-markdown + remark-gfm) y feedback 👍/👎 → `/api/feedback`. |
| `components/LaboratorioGnn.tsx` | Flujo para cultivos SIN curva: familia primero → auto-sugerir extracción → generar plan. Reusa `Resultados` con el plan devuelto por `/api/gnn/plan`. |
| `components/Markdown.tsx` | Render GFM con mappers a tokens del sistema. |
| `lib/api.ts` | Único punto de fetch: tipos, wrappers tipados, endpoint. |
| `lib/utils.ts` | `cx`, `fmtNum`, `fmtFecha`, `NUTRIENTES`. |
| `components/ui/*` | Primitivos estilo shadcn: button, input, label, card, badge, skeleton, alert. |

```mermaid
flowchart LR
    A[App.tsx] --> F[FormularioLote]
    A --> R[Resultados]
    A --> C[Chat]
    A --> L[LaboratorioGnn]
    A --> P[PlanesGuardados]
    A --> E[Evidencia]
    L -->|prediccion.plan| R
    R -->|onGuardado| P
    C -->|👍👎| FEED[/api/feedback/]
    F --> POST[/api/recomendacion/]
    L --> POST2[/api/gnn/plan/]
```

### 2. Nginx (contenedor `web`)

`frontend/Dockerfile` produce un build estático con Vite y lo sirve nginx. La conf (`frontend/nginx.conf`) hace:

- `location /` → `try_files $uri /index.html` (SPA fallback)
- `location /api/`, `location /health` → `proxy_pass http://api:8000` (red Docker interna)

Puertos: `3000:80`.

### 3. API FastAPI (contenedor `api`)

`backend/app/main.py` define los routers; la lógica vive en módulos.

| Router / endpoint | Módulo que ejecuta | Escribe en |
|---|---|---|
| `GET /health` | `graph.get_knowledge` | – |
| `GET /api/cultivos`, `/api/cultivos/{id}` | graph | Neo4j (consulta) |
| `POST /api/recomendacion` | **engine** | Neo4j (consulta) |
| `GET /api/cadena/{id}` | graph | Neo4j |
| `GET/POST/DELETE /api/planes[/{id}]` | db (SQLite) | `backend/data/ferticalc.db` (volumen) |
| `POST /api/chat` | **llm** → motor | – |
| `POST /api/feedback`, `GET /api/feedback` | db | SQLite |
| `POST /api/conocimiento/texto|pdf` | **rag** | Neo4j (índices + nodos Fragmento) |
| `POST /api/conocimiento/buscar` | rag | Neo4j (vector index) |
| `GET /api/gnn/estado` | gnn (carga pesos) | – |
| `POST /api/gnn/predecir` | **gnn** | – |
| `GET /api/gnn/familia/{familia}` | gnn | – |
| `POST /api/gnn/plan` | **gnn** → engine (con `_ProxyKB`) | – |

#### 3.1 Motor determinista (`engine.py`)

```mermaid
flowchart LR
    S[SolicitudRecomendacion] -->|extrae| P[Por nutriente N,P,K]
    P -->|demanda = ext * rend| D[demanda_total]
    P -->|neto = max(0, demanda - suelo)| N[requerimiento_neto]
    N -->|dosis = neto / ERF| Z[dosis_total]
    Z -->|reparte por fase segun curva_pct| F[RecomendacionFase x4]
    F -->|prioridad cultivo + dominante| S2[Fuentes sugeridas]
    S2 -->|carga reglas| R[ReglasAntagonismo]
    R -->|evalua ratio/umbral| AV[Advertencias]
    F --> E[Evidencia con fórmula y cita]
```

Salida: `RecomendacionResponse` (Pydantic v2, ver `schemas.py`) que la API serializa directo a JSON.

#### 3.2 Cliente LLM (`llm.py`)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant API as /api/chat
    participant LLM as llm_chat()
    participant G as Gemini 3.6 Flash
    participant Tools as Tools (local)
    Note over U,Tools: system_prompt: usa tools, no inventes cifras, español, declara predicciones IA

    U->>API: POST {mensaje, historial}
    API->>LLM: chat(kb, mensaje, historial)
    LLM->>G: contents + system + tools (8 declaradas)
    G-->>LLM: candidate con parts (text | functionCall)
    alt functionCall
        LLM->>Tools: ejecutar(nombre, args) en kb local
        Tools-->>LLM: resultado
        LLM->>G: contents + functionResponse (role=user)
        G-->>LLM: otro candidate
    else text
        LLM-->>API: {respuesta, pasos, recomendacion?}
    end
    API-->>U: JSON
```

Tools (8):
- `listar_cultivos`, `obtener_cultivo`, `listar_fuentes` — `graph`
- `calcular_recomendacion` — `engine`
- `buscar_literatura` — `rag.buscar`
- `predecir_curva_gnn` — `gnn.predecir_curva` (devuelve explicación)
- `plan_cultivo_personalizado` — `gnn.plan_desde_prediccion` (incluye explicación)
- `extraccion_referencia_familia` — `gnn.resumen_familia`

Guardrails: `MAX_ITERACIONES=4`, si excede devuelve mensaje "alcanza limite". Prompts obligan a no inventar cifras y a etiquetar predicciones como experimentales.

#### 3.3 RAG (`rag.py`)

```mermaid
flowchart LR
    subgraph INGEST["Ingesta"]
        T[texto] --> TROZ[trocear 900/150]
        PDF[PDF] --> PYP[pypdf]
        PYP --> TROZ
        TROZ --> EMB["incrustar (e5-small)<br/>prefix: passage: o query:"]
        EMB --> NEO4J["MERGE (:Fragmento {titulo, texto, embedding, fecha})"]
    end
    subgraph QUERY["Consulta"]
        Q[consulta] --> EMBQ["incrustar (prefix: query:)"]
        EMBQ --> VQ["CALL db.index.vector.queryNodes(fragmentos_idx, k, emb)"]
        VQ --> RES[fragmentos ordenados por score]
    end
```

Modelo: `intfloat/multilingual-e5-small` (384 dim). Persistido en `hf_cache` (volumen Docker). `get_rag()` decide Neo4j vs JSON (`backend/data/rag_fragments.json`) según disponibilidad del driver.

#### 3.4 GNN (`gnn.py`)

```mermaid
flowchart TB
    SEED["seed_knowledge.json<br/>(7 cultivos · 28 nodos-fase · 105 aristas)"] --> BUILD[construir_grafo_conocimiento]
    BUILD --> NODOS["nodos (cultivo, familia, orden, x, y)"]
    BUILD --> ARISTAS["aristas (i, j, peso)<br/>• chain misma cult: 1.0<br/>• mismo orden misma fam: 1.0<br/>• mismo orden otra fam: 1.0"]
    NODOS --> TRAIN[scripts/train_gnn.py]
    ARISTAS --> TRAIN
    TRAIN --> PYT["PyTorch Adam, 400 ep<br/>LOO por cultivo"]
    PYT --> W[gnn_weights.json: W1..b3, feat_mean/std, familias, metricas_loo]

    subgraph INFER["Inferencia (sin torch)"]
        PRE[predecir_curva] --> NP[reusa builder]
        NP --> FWD["forward_np(X_std, A_hat, pesos)"]
        FWD --> ACU[monotonic cummax hasta 100]
        ACU --> EXP["_explicar: occlusion 3 grupos + top-3 similitud coseno + razonamiento"]
    end

    PLAN["plan_desde_prediccion"] --> PRE
    PLAN -->|construye ProxyKB| ENG[engine.calcular_recomendacion]
```

Arquitectura del modelo: GCN 2×16 sigmoide. Features por nodo: `[orden/4, bbch_ini/99, bbch_fin/99, log1p(N), log1p(P), log1p(K)]` + **one-hot familia**. Pesos exportados a JSON → inferencia 100% numpy. Resultado: MAE LOO global **±5.9 pts**.

Explicabilidad: oclusión (ocultar grupo de features → medir delta), similitud coseno vs catálogo (top-3 con %), razonamiento textual generado.

`plan_desde_prediccion` envuelve `engine.calcular_recomendacion` con `_ProxyKB` (un kb en memoria que reemplaza `cultivo()` por un cultivo sintético construido a partir de la curva predicha), reusando el motor sin duplicar lógica.

### 4. Neo4j (contenedor `neo4j`)

Imagen: `neo4j:5-community`. Volumen `neo4j_data` persiste entre reinicios. Password vía `.env` raíz.

Esquema (constraints únicos en `id`):

```mermaid
graph LR
    C[Cultivo<br/>nombre, unidad, extraccion_N/P/K, preferencia_fuentes, notas]
    F[FaseFenologica<br/>nombre, bbch_ini, bbch_fin]
    N[Nutriente<br/>N | P | K]
    R[Referencia<br/>autores, anio, titulo, fuente]
    S[FuenteFertilizante<br/>nombre, tipo]
    G[ReglaAntagonismo<br/>tipo, base, nutriente_ref, factor, umbral, mensaje]
    FR[Fragmento<br/>titulo, texto, embedding(384), fecha]

    C -->|TIENE_FASE| F
    F -->|EXTRAE {pct, fuente_ref}| N
    C -->|DOCUMENTADO_POR| R
    S -->|APORTA {pct}| N
    G -->|DOCUMENTADO_POR| R
    FR -.->|vector index| FR
```

Carga inicial: `docker compose exec api python scripts/load_seed.py` (idempotente con MERGE).

## Flujos completos

### A) Recomendación para cultivo del catálogo

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Frontend
    participant A as API
    participant E as engine
    participant N as Neo4j

    U->>F: selecciona tomate, 60 t/ha, suelo 30/20/40
    F->>A: POST /api/recomendacion
    A->>E: calcular_recomendacion(kb, solicitud)
    E->>N: cultivo, fases, fuentes, reglas
    E->>E: demanda → neto → dosis → reparto por fase → fuentes
    E->>E: evalua reglas antagonismo
    E-->>A: RecomendacionResponse
    A-->>F: 200 JSON
    F->>U: KPIs + tabla + evidencia + referencias
```

### B) Chat LLM con motor y GNN

```mermaid
sequenceDiagram
    participant U as Usuario
    participant F as Chat
    participant A as /api/chat
    participant L as llm_chat
    participant G as Gemini
    participant E as engine
    participant P as gnn.plan

    U->>F: "Tengo cocona sin datos, solanaceae, 15 t/ha"
    F->>A: POST {mensaje, historial:[]}
    A->>L: chat(kb, mensaje, [])
    L->>G: turno 1
    G-->>L: function_call(extraccion_referencia_familia, solanaceae)
    L->>E: kb.solanaceae → {N:3.9, P:1.4, K:6.27}
    L->>G: turno 2
    G-->>L: function_call(plan_cultivo_personalizado, …)
    L->>P: plan_desde_prediccion(kb, …, 15)
    P->>P: predecir curva + ProxyKB + engine
    P-->>L: {prediccion, plan}
    L->>G: turno 3
    G-->>L: texto final
    L-->>A: {respuesta, pasos, recomendacion}
    A-->>F: 200 JSON
    F->>U: render Markdown + botones feedback
```

### C) RAG literario

```mermaid
sequenceDiagram
    participant U as Usuario
    participant A as /api/conocimiento
    participant R as rag
    participant EMB as e5-small
    participant N as Neo4j

    Note over U,N: Ingesta (una vez)
    U->>A: POST /api/conocimiento/pdf (archivo)
    A->>R: ingestar_documento(titulo, pdf_bytes)
    R->>R: pypdf → texto
    R->>R: trocear(900/150)
    R->>EMB: encode(passage: + chunk)
    R->>N: MERGE (:Fragmento {titulo, texto, embedding})
    N-->>A: ok
    A-->>U: 200 {fragmentos: N}

    Note over U,N: Consulta
    U->>A: POST /api/conocimiento/buscar {consulta}
    A->>R: buscar(consulta, k)
    R->>EMB: encode(query: + consulta)
    R->>N: db.index.vector.queryNodes(fragmentos_idx, k, emb)
    N-->>R: [(texto, score), ...]
    R-->>A: top-k
    A-->>U: 200
```

## Despliegue y variables de entorno

```mermaid
flowchart LR
    ROOT[".env (raíz)<br/>NEO4J_USER<br/>NEO4J_PASSWORD"] --> DC[docker-compose.yml]
    DC --> NEO4J[neo4j]
    DC --> API[api]
    BE[backend/.env<br/>GEMINI_API_KEY<br/>GEMINI_MODEL] --> API
    API -->|"env_file opcional"| DC
```

`backend/.env` y `.env` raíz están en `.gitignore`. En el contenedor `api` se inyectan ambos:
- root `.env` vía interpolación `${VAR}` en `docker-compose.yml`
- `backend/.env` vía `env_file: - path: ./backend/.env, required: false`

## Ciclo de mejora continua

```mermaid
flowchart LR
    U[Usuario prueba<br/>el chat] -->|👍👎| FB[/api/feedback → SQLite/]
    FB --> CR["Curador (el agrónomo<br/>= tú) revisa feedback"]
    CR -->|"edita seed_knowledge.json"| SEED[seed_knowledge.json]
    SEED -->|"git commit"| GH[Repo]
    SEED -->|"load_seed.py"| N4J[Neo4j re-cargado]
    CR -->|"python scripts/train_gnn.py"| W[gnn_weights.json]
    W -->|infer mejorada| N4J
    CR -->|"docker compose up -d --build"| DOCKER[Contenedor nuevo]
```

## Pruebas

46 tests en `backend/tests/`. Corren con:

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest tests -q
```

Cubren: fórmula de Stanford exacta (300/240/540 zero-soil, 250/160/460 con suelo 30/20/40), conservación por fase en los 7 cultivos, antagonismos, dominancia de fuentes, trazabilidad de referencias, GNN monotónico y sensible a familia, plan IA con advertencia, CRUD de planes y feedback, chat 503 sin `GEMINI_API_KEY`, regresiones específicas de los dos bugs encontrados (campo `referencias` descartado y `familia` ignorado).
