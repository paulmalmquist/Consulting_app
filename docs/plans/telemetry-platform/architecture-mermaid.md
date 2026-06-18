# RS Telemetry — architecture diagrams (Mermaid)

Honest status labels are in the node text (BUILT / PARTIAL / PLANNED). These mirror the in-app
`/telemetry/how-it-works` exhibit, which renders the same flows as a hand-rolled diagram (no mermaid
runtime in the app bundle).

## 1 · System architecture
```mermaid
flowchart LR
  subgraph Ingest
    A[Source adapters\nCapture / ISS / ADS-B  BUILT] --> B[(tel_stream_readings_bronze)]
  end
  subgraph Process
    B --> C[(tel_stream_readings  SILVER)] --> D[(tel_stream_minute_agg  GOLD)]
    W[tel_etl_watermarks] -.-> C
    Q[tel_dq_assertions] -.-> D
  end
  subgraph Serve
    D --> E[/api/telemetry/*  FastAPI  BUILT/]
    M[(tel_model_runs)] --> E
    P[(tel_predictions)] --> E
  end
  subgraph UI_AI
    E --> F[Telemetry console 13 pages  BUILT]
    E --> G[Test Intelligence copilot  PARTIAL]
  end
  G -. tool calls .-> T[MCP registry  BUILT]
  T -. receipts .-> AU[(ai_decision_audit_log  BUILT)]
  D -. optional, disabled .-> BQ[(BigQuery winston_events_raw  PARTIAL)]
```

## 2 · AI orchestration flow
```mermaid
flowchart TD
  U[User question] --> CL[Classify intent / lane]
  CL --> RT{Tool or evidence fetch?}
  RT -->|MCP tool| PC[Permission check\nREAD / WRITE_CONFIRMED / ADMIN]
  PC -->|write| CF[Confirmation gate  BUILT]
  PC -->|read| EX[Execute]
  CF --> EX
  RT -->|evidence| RG[fetch structured evidence + anti-fabrication validator  PARTIAL]
  EX --> REC[record_decision -> ai_decision_audit_log]
  RG --> ANS[evidence cards]
  REC --> OUT[Answer + tool trace]
  ANS --> OUT
  OUT --> NULL{Grounded?}
  NULL -->|no| FC[Fail closed: null_reason]
```

## 3 · Medallion lineage (follow one stream aggregate)
```mermaid
flowchart LR
  S[ISS CAPTURE replay  BUILT] --> B[(bronze: tel_stream_readings_bronze)]
  B --> SI[(silver: tel_stream_readings)]
  SI --> G[(gold: tel_stream_minute_agg)]
  G --> API[/stream/live + /stream/health  BUILT/]
  API --> UI[MissionControlStream  BUILT]
  G -. PLANNED for telemetry .-> MR[metric registry -> lineage drawer\nREPE pattern]
```

## 4 · Model lifecycle
```mermaid
flowchart LR
  TR[Databricks train\nC-MAPSS / SMAP-MSL] --> MR[MLflow run + metrics]
  MR --> GATE{Promotion gate\nhonest_gate JSONB}
  GATE -->|approved| REG[(tel_model_runs alias=champion)]
  REG --> SC[score_window MAD_K=4.0]
  SC --> PRED[(tel_predictions verdict + receipt)]
  PRED --> UIp[Model Performance / Monitoring  BUILT]
  REG --> CAL[RUL Calibration screen  BUILT]
  REG --> DRIFT[(tel_drift_metrics PSI)] --> UIr[Model Registry  BUILT]
```

## 5 · Ticket → PR loop
```mermaid
flowchart LR
  ID[Idea / bug] --> INT[azure-devops-intake\nEpic -> Feature -> Story -> Task]
  INT --> SB[Session Brief approved]
  SB --> CODE[feature-dev: scoped change]
  CODE --> TST[tests run + evidence]
  TST --> PR[PR + audit comment]
  PR --> REV{Gate: review + CI}
  REV -->|merged| DONE[one-way DONE]
  REV -->|fail| CODE
```
The AI-generated-SQL + dry-run-cost step is PLANNED.

## 6 · Audit / receipt loop
```mermaid
flowchart LR
  ACT[Tool / model / write] --> RP[AuditPolicy redaction\nredact_keys + patterns]
  RP --> RD[record_decision]
  RD --> CK{decision_type in CHECK?}
  CK -->|yes| LOG[(ai_decision_audit_log)]
  CK -->|no| DROP[silently dropped  TRAP]
  LOG --> STATS[compute_audit_stats] --> GOV[AI Governance page  BUILT]
```

## 7 · Fail-closed handling
```mermaid
flowchart TD
  REQ[Read request] --> SRC{Source available?}
  SRC -->|no| NR[null_reason + 'Not available']
  SRC -->|stale >60s| ST[tel_pipeline_status = stale]
  SRC -->|ok| VAL{Value computable?}
  VAL -->|waterfall-dependent REPE| OOS[null + out_of_scope_requires_waterfall]
  VAL -->|ok| SHOW[render value]
  NR --> UI[UI shows reason, never 0]
  ST --> UI
  OOS --> UI
```
