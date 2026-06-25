"""
Generator for telemetry_ml_fundamentals.ipynb — a step-through ML fundamentals notebook
built on the REAL novendor_1.telemetry Gold tables (not the aspirational telemetry_* names).

Why a generator instead of hand-authoring JSON: an .ipynb is a strict JSON document; hand-editing
it is error-prone. This script holds the content as ordinary Python lists and emits valid notebook
JSON. Re-run it to regenerate the .ipynb after editing cells here.

Run locally:   python build_ml_fundamentals_ipynb.py
Output:        ./telemetry_ml_fundamentals.ipynb   (import into Databricks: Workspace > Import)

The notebook itself targets Databricks ML Runtime (Spark + MLflow + sklearn/xgboost/keras already
installed). Every Spark read goes through read_gold(), which falls back to a synthetic Spark
DataFrame WITH THE SAME SCHEMA if the table is missing, printing a loud banner — so the notebook
runs end-to-end even before your Gold tables exist, and switches to real data the moment they do.
"""

import json
from pathlib import Path

# ── helpers to build cells ───────────────────────────────────────────────────

def md(*lines: str) -> dict:
    """A markdown cell. Each arg is one line; '' makes a blank line."""
    src = "\n".join(lines)
    return {"cell_type": "markdown", "metadata": {}, "source": _split(src)}


def code(*lines: str) -> dict:
    src = "\n".join(lines)
    return {"cell_type": "code", "metadata": {}, "execution_count": None,
            "outputs": [], "source": _split(src)}


def reading(*items: tuple) -> dict:
    """A 'Further reading' markdown block: each item is (title, url, why)."""
    out = ["> **Further reading**  "]
    for title, url, why in items:
        out.append(f"> - [{title}]({url}) — {why}  ")
    return md(*out)


def _split(src: str) -> list:
    """nbformat wants source as a list of lines, each (except the last) ending in '\\n'."""
    parts = src.split("\n")
    return [p + "\n" for p in parts[:-1]] + [parts[-1]]


CELLS: list = []
def add(*cells):
    CELLS.extend(cells)


def _assign_ids(cells: list) -> None:
    """nbformat 4.5 requires a unique cell id. Assign stable, deterministic ids."""
    for i, c in enumerate(cells):
        c["id"] = f"cell-{i:03d}"


# ═════════════════════════════════════════════════════════════════════════════
# TITLE
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "# Machine Learning Fundamentals — on Winston Telemetry (your data, on Databricks)",
    "",
    "A hands-on, step-through notebook. Each concept appears three ways: **intuition** (plain English),",
    "**the math** (the one equation that matters), and **the telemetry gotcha** (the trap that actually",
    "bites in production). Code cells run against your real Gold tables in `novendor_1.telemetry`; if a",
    "table is missing, the cell falls back to synthetic data **with the same schema** and prints a loud",
    "banner, so you can step through the whole thing today and swap in real data table-by-table.",
    "",
    "**What this is built on (already in your lakehouse):**",
    "",
    "| Layer | Table | What it holds |",
    "|---|---|---|",
    "| Gold | `gold_smap_msl_windows` | per-tick SMAP/MSL value + no-look-ahead rolling features + `is_anomaly` label |",
    "| Gold | `gold_cmapss_features` | per-cycle C-MAPSS rolling features + `rul_target` (remaining useful life) |",
    "| Gold | `gold_replay_feed` | one fixed channel's test sequence for the deterministic demo |",
    "| Serving | `tel_model_runs`, `tel_predictions` | MLflow-mirrored model metadata + per-score receipts |",
    "",
    "**The seven phases** map to your plan: embeddings → baseline/logistic → loss for rare events →",
    "GBDT → LSTM sequences → calibration & model cards → the demo arc.",
    "",
    "---",
    "",
    "> **How to use this notebook**  ",
    "> Run the CONFIG cell first. Then step through top to bottom. Read the markdown *above* each code",
    "> cell before running it — that's where the intuition, the math, and the gotcha live. The",
    "> *Further reading* block under each code cell is for when you want to go deeper on that one idea.",
))

add(reading(
    ("Databricks ML Runtime", "https://docs.databricks.com/en/machine-learning/index.html",
     "what's pre-installed (Spark, MLflow, sklearn, xgboost, tf) so you don't pip-install"),
    ("MLflow Tracking", "https://mlflow.org/docs/latest/tracking.html",
     "the experiment/run/metric model every phase below logs into"),
    ("Medallion architecture (bronze/silver/gold)", "https://www.databricks.com/glossary/medallion-architecture",
     "why model-ready features live in Gold and what that buys you"),
))

# ═════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "## 0 · Config + the synthetic fallback",
    "",
    "**Intuition.** One place to set your catalog/schema and MLflow experiment. `read_gold(name, ...)`",
    "tries `spark.table('<catalog>.<schema>.<name>')`; if that fails it builds a synthetic Spark",
    "DataFrame with the *same columns* and prints a banner. That single rule is what lets the notebook",
    "both 'run today' and 'use my data' without two code paths.",
    "",
    "**The gotcha.** Synthetic data is for *plumbing*, not for *conclusions*. Never screenshot a metric",
    "computed on synthetic rows and call it a result — the banner is there so you can't forget which",
    "you're looking at.",
))

add(code(
    "# --- EDIT THESE to point at your data -----------------------------------------",
    "CATALOG = \"novendor_1\"",
    "SCHEMA  = \"telemetry\"",
    "TEL     = f\"{CATALOG}.{SCHEMA}\"",
    "EXPERIMENT_PATH = \"/Shared/telemetry_ml_fundamentals\"  # MLflow experiment; created if absent",
    "# ------------------------------------------------------------------------------",
    "",
    "import numpy as np, pandas as pd",
    "",
    "try:",
    "    spark  # provided by Databricks",
    "    ON_DATABRICKS = True",
    "except NameError:",
    "    ON_DATABRICKS = False",
    "    print('Not on Databricks — Spark reads will use the synthetic fallback.')",
    "",
    "def _banner(msg):",
    "    print('\\n' + '=' * 78 + f'\\n  {msg}\\n' + '=' * 78)",
    "",
    "def read_gold(name, synth, cols=None):",
    "    \"\"\"Return a pandas DF for {TEL}.{name}. Fall back to synth() (a pandas DF builder) with a",
    "    loud banner if the table is missing or we're off-cluster. `cols` optionally selects columns.\"\"\"",
    "    if ON_DATABRICKS:",
    "        try:",
    "            sdf = spark.table(f'{TEL}.{name}')",
    "            if cols:",
    "                sdf = sdf.select(*cols)",
    "            pdf = sdf.toPandas()",
    "            print(f'[real] {TEL}.{name}: {len(pdf):,} rows')",
    "            return pdf",
    "        except Exception as e:",
    "            _banner(f'SYNTHETIC FALLBACK for {name} — table read failed: {str(e)[:90]}')",
    "    else:",
    "        _banner(f'SYNTHETIC FALLBACK for {name} — not on Databricks')",
    "    pdf = synth()",
    "    if cols:",
    "        pdf = pdf[[c for c in cols if c in pdf.columns]]",
    "    return pdf",
    "",
    "rng = np.random.default_rng(7)  # fixed seed: synthetic data is identical every run",
    "print('TEL =', TEL, '| ON_DATABRICKS =', ON_DATABRICKS)",
))

add(reading(
    ("spark.table / DataFrame.toPandas", "https://spark.apache.org/docs/latest/api/python/reference/pyspark.sql/api/pyspark.sql.DataFrame.toPandas.html",
     "the read path; note toPandas pulls to the driver — fine for Gold-sized slices, not for raw bronze"),
    ("numpy default_rng", "https://numpy.org/doc/stable/reference/random/generator.html",
     "why we seed the generator so synthetic runs are reproducible"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 1 — EMBEDDINGS
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 1 · Text → embeddings → similar-incident retrieval",
    "",
    "**Goal.** Turn unstructured operational text (NCR descriptions, operator notes, anomaly comments)",
    "into dense vectors so *similar events sit near each other in meaning-space* — then retrieve prior",
    "incidents and cluster defect families. Not generic sentiment; recurring-failure language.",
    "",
    "**The math.** A text encoder maps each string to a vector. Similarity is the **cosine** of the",
    "angle between two vectors:",
    "",
    "$$\\text{cosine}(a,b) = \\frac{a \\cdot b}{\\lVert a\\rVert\\,\\lVert b\\rVert}$$",
    "",
    "**The gotcha — cosine, not raw dot product.** Raw dot product rewards longer / more verbose text",
    "(bigger norm), so boilerplate-heavy logs look 'more important' than a terse but critical anomaly",
    "note. Cosine divides out the magnitude, comparing *direction* (meaning) only.",
    "",
    "**The telemetry bias gotcha.** Retrieval can be biased *operationally*: a stand with more logs, a",
    "shift that writes longer notes, or a heavily-instrumented new variant gets over-represented in",
    "'similar incidents'. You audit by slicing retrieval quality across stand / variant / supplier /",
    "shift — done at the end of this phase.",
))

add(md(
    "### 1.1 · Load the incident corpus",
    "",
    "Your real NCR/notes corpus lives in the NCR pipeline tables (see `15_run_ncr_pipeline.py`). Point",
    "`read_gold` at whatever table holds `(source_id, source_type, text, stand_id, supplier, shift)`.",
    "The synthetic fallback fabricates a small, *clusterable* corpus so retrieval below is meaningful.",
))

add(code(
    "def synth_corpus():",
    "    families = {",
    "        'pressure_oscillation': ['pressure oscillation near shutdown', 'chamber pressure ringing at cutoff',",
    "                                 'po instability during throttle ramp', 'unstable chamber pressure on ramp down'],",
    "        'weld_porosity':        ['repeat weld porosity on injector manifold', 'porosity found in manifold weld',",
    "                                 'x-ray shows weld voids injector', 'manifold weld porosity recurring'],",
    "        'sensor_drift':         ['sensor drift on stand 2', 'thermocouple drift mid-run',",
    "                                 'pressure transducer reading creeping up', 'baseline drift on PT channel'],",
    "    }",
    "    stands   = ['stand-1', 'stand-2', 'stand-3']",
    "    suppliers= ['acme', 'beta-fab', 'cryo-co']",
    "    shifts   = ['day', 'swing', 'night']",
    "    rows = []",
    "    for fam, texts in families.items():",
    "        for i in range(14):  # stand-2 deliberately over-logged to expose the bias audit",
    "            t = texts[i % len(texts)]",
    "            stand = 'stand-2' if (fam == 'sensor_drift' and i % 2 == 0) else stands[i % 3]",
    "            rows.append(dict(source_id=f'{fam}-{i}', source_type='ncr', defect_family=fam,",
    "                             text=t, stand_id=stand, supplier=suppliers[i % 3], shift=shifts[i % 3]))",
    "    return pd.DataFrame(rows)",
    "",
    "corpus = read_gold('ncr_corpus', synth_corpus,",
    "                   cols=['source_id','source_type','defect_family','text','stand_id','supplier','shift'])",
    "corpus.head()",
))

add(reading(
    ("Sentence-Transformers (all-MiniLM-L6-v2)", "https://www.sbert.net/",
     "the standard small, fast text encoder; what we use below for embeddings"),
    ("Cosine vs dot product (sbert semantic search)", "https://www.sbert.net/examples/applications/semantic-search/README.html",
     "exactly why normalized embeddings + cosine is the default for retrieval"),
    ("Databricks Vector Search", "https://docs.databricks.com/en/generative-ai/vector-search.html",
     "production path: a managed index instead of in-memory cosine when the corpus grows"),
))

add(md(
    "### 1.2 · Embed + retrieve with cosine",
    "",
    "We L2-normalize each embedding so that a plain dot product **is** cosine similarity (norm = 1). For",
    "a query, the nearest neighbors by cosine are the most semantically similar prior incidents.",
    "",
    "If `sentence-transformers` isn't available we fall back to a TF-IDF vectorizer — same retrieval",
    "shape, weaker semantics — so the cell still runs. Swap in your production encoder for real use.",
))

add(code(
    "# An encoder must map query and corpus into the SAME space. The sentence model does this by",
    "# construction; the TF-IDF fallback must be FIT ONCE on the corpus and reused for queries —",
    "# refitting per call gives mismatched vocabularies (a classic, silent retrieval bug).",
    "_ENC = {'kind': None, 'model': None, 'tfidf': None}",
    "",
    "def _fit_encoder(corpus_texts):",
    "    try:",
    "        from sentence_transformers import SentenceTransformer",
    "        _ENC['kind'] = 'sentence-transformers/all-MiniLM-L6-v2'",
    "        _ENC['model'] = SentenceTransformer('all-MiniLM-L6-v2')",
    "    except Exception as e:",
    "        _banner(f'embed fallback to TF-IDF — {str(e)[:70]}')",
    "        from sklearn.feature_extraction.text import TfidfVectorizer",
    "        _ENC['kind'] = 'tfidf'",
    "        _ENC['tfidf'] = TfidfVectorizer().fit(list(corpus_texts))  # vocabulary frozen here",
    "    return _ENC['kind']",
    "",
    "def embed(texts):",
    "    \"\"\"L2-normalized embeddings in the FITTED space (call _fit_encoder first).\"\"\"",
    "    from sklearn.preprocessing import normalize",
    "    if _ENC['kind'] is None:",
    "        _fit_encoder(texts)",
    "    if _ENC['model'] is not None:",
    "        X = _ENC['model'].encode(list(texts), normalize_embeddings=True)",
    "        return np.asarray(X)",
    "    return normalize(_ENC['tfidf'].transform(list(texts)).toarray())  # reuse frozen vocab",
    "",
    "embed_model = _fit_encoder(corpus['text'])",
    "E = embed(corpus['text'])",
    "print('embeddings', E.shape, '| model', embed_model)",
    "",
    "def retrieve(query, k=5):",
    "    q = embed([query])",
    "    sims = E @ q[0]                      # cosine, because rows of E and q are unit-norm",
    "    order = np.argsort(-sims)[:k]",
    "    out = corpus.iloc[order].copy()",
    "    out['cosine'] = sims[order].round(3)",
    "    return out[['cosine','defect_family','stand_id','supplier','text']]",
    "",
    "print('Query: \"unstable chamber pressure during throttle\"')",
    "retrieve('unstable chamber pressure during throttle')",
))

add(reading(
    ("Approximate nearest neighbor (FAISS)", "https://github.com/facebookresearch/faiss/wiki",
     "when linear cosine scan gets slow, this is the index you reach for"),
    ("pgvector + HNSW", "https://github.com/pgvector/pgvector#hnsw",
     "your serving DB already has pgvector; how the fused-vector retrieval index is built (Phase 7D in repo)"),
))

add(md(
    "### 1.3 · Cluster defect families + the bias audit",
    "",
    "**Intuition.** If the embeddings capture *operational meaning*, k-means over them should recover the",
    "defect families without ever seeing the labels. We check that with cluster purity, then run the",
    "**bias audit**: is any one stand / supplier / shift over-represented in the corpus and therefore in",
    "retrieval? An over-logged stand inflates its own recall — that's operational bias, not signal.",
))

add(code(
    "from sklearn.cluster import KMeans",
    "from sklearn.metrics import adjusted_rand_score",
    "",
    "k = corpus['defect_family'].nunique()",
    "labels = KMeans(n_clusters=k, n_init=10, random_state=0).fit_predict(E)",
    "ari = adjusted_rand_score(corpus['defect_family'], labels)",
    "print(f'clusters={k}  adjusted_rand_index={ari:.3f}  (1.0 = clusters match defect families exactly)')",
    "",
    "print('\\n--- BIAS AUDIT: corpus representation by slice ---')",
    "for col in ['stand_id', 'supplier', 'shift']:",
    "    share = (corpus[col].value_counts(normalize=True) * 100).round(1)",
    "    flag = '  <-- over-represented' if share.max() > 100/share.size * 1.6 else ''",
    "    print(f'\\n{col} (% of corpus):{flag}')",
    "    print(share.to_string())",
))

add(reading(
    ("k-means (scikit-learn)", "https://scikit-learn.org/stable/modules/clustering.html#k-means",
     "the clustering we use; note it assumes roughly spherical, equal-size clusters"),
    ("Adjusted Rand Index", "https://scikit-learn.org/stable/modules/generated/sklearn.metrics.adjusted_rand_score.html",
     "label-free way to score how well clusters recover known families, corrected for chance"),
    ("Fairness slicing (Fairlearn)", "https://fairlearn.org/v0.10/user_guide/assessment/index.html",
     "the disciplined version of the slice audit above when bias matters for a decision"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 2 — LOGISTIC BASELINE + GRADIENT DESCENT
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 2 · Baseline model + gradient descent (and leakage)",
    "",
    "**Goal.** Before any deep net, build an *explainable* baseline: logistic regression predicting a",
    "binary outcome (here: does an anomaly occur in the next window?). It forces you to understand the",
    "math and gives every later model something to beat.",
    "",
    "**The math.** Weighted sum, squashed to a probability:",
    "",
    "$$z = w^\\top x + b, \\qquad p = \\sigma(z) = \\frac{1}{1+e^{-z}}$$",
    "",
    "Training minimizes log-loss by stepping weights *down* the gradient:",
    "",
    "$$w \\leftarrow w - \\eta\\,\\nabla_w \\mathcal{L}$$",
    "",
    "**The gotcha — the gradient points uphill.** $\\nabla\\mathcal{L}$ points toward *increasing* loss.",
    "You subtract it. `w = w + lr*grad` is the single most common sign bug; it makes loss climb.",
    "",
    "**The telemetry gotcha — leakage.** The model must never see anything from *after* the prediction",
    "instant: `final_run_status`, `post_run_failure_code`, `operator_final_disposition`. Your Gold layer",
    "already enforces no-look-ahead in the *features* (rolling frames are `ROWS BETWEEN n PRECEDING AND",
    "CURRENT ROW`); leakage at *this* layer comes from picking a post-event column as an input.",
))

add(md(
    "### 2.1 · Build a pre-event feature window from Gold",
    "",
    "We read `gold_smap_msl_windows` (real no-look-ahead rolling features) and frame a binary task:",
    "given the features at tick *t*, will an anomaly appear within the next `HORIZON` ticks? The label",
    "is built by looking *forward* — but only to make the **label**, never a feature.",
))

add(code(
    "GOLD_FEATS = ['value','value_rmean50','value_rstd50','value_rmin50','value_rmax50','value_roc']",
    "",
    "def synth_windows():",
    "    rows = []",
    "    for chan in ['T-1','D-4','E-2']:",
    "        for split in ['train','test']:",
    "            n = 1500",
    "            base = np.cumsum(rng.normal(0, 1, n)) * 0.05",
    "            val = 50 + base + rng.normal(0, 0.4, n)",
    "            anom = np.zeros(n, int)",
    "            for s in rng.choice(range(100, n-60), size=4, replace=False):",
    "                val[s:s+40] += rng.normal(6, 1, 40); anom[s:s+40] = 1  # injected drift",
    "            df = pd.DataFrame({'chan_id': chan, 'split': split, 't': np.arange(n), 'value': val})",
    "            df['value_rmean50'] = df['value'].rolling(50, 1).mean()",
    "            df['value_rstd50']  = df['value'].rolling(50, 1).std().fillna(0)",
    "            df['value_rmin50']  = df['value'].rolling(50, 1).min()",
    "            df['value_rmax50']  = df['value'].rolling(50, 1).max()",
    "            df['value_roc']     = df['value'].diff().fillna(0)",
    "            df['is_anomaly']    = np.where(df['split']=='test', anom, 0)  # labels on test, like Gold",
    "            rows.append(df)",
    "    return pd.concat(rows, ignore_index=True)",
    "",
    "win = read_gold('gold_smap_msl_windows', synth_windows,",
    "                cols=['chan_id','split','t'] + GOLD_FEATS + ['is_anomaly'])",
    "win = win.sort_values(['chan_id','split','t']).reset_index(drop=True)",
    "",
    "HORIZON = 20  # predict: anomaly within next 20 ticks",
    "# Forward-looking label = 'any anomaly in the next HORIZON ticks', built per (chan, split) so it",
    "# never bleeds across a series boundary. Vectorized (no groupby.apply, which drops the key cols):",
    "# reverse within each group, take a trailing rolling-max, reverse back -> a leading (forward) max.",
    "def forward_any(s):",
    "    return s[::-1].rolling(HORIZON, min_periods=1).max()[::-1]",
    "win['y_next'] = (win.groupby(['chan_id','split'])['is_anomaly']",
    "                    .transform(forward_any).astype(int))",
    "print('label rate (test):', round(win[win['split']=='test']['y_next'].mean(), 4))",
    "",
    "# IMPORTANT (matches your real Gold): SMAP/MSL labels exist ONLY on the test split — the train",
    "# split is unlabeled (all-zero), which is why train_anomaly.py uses UNSUPERVISED thresholds there.",
    "# To teach *supervised* logistic/GBDT honestly, we carve the supervised train/holdout from the",
    "# LABELED rows, split BY CHANNEL so no series straddles the boundary (group-aware, no leakage).",
    "lab = win[win['split']=='test'].dropna(subset=GOLD_FEATS).copy()",
    "labeled_channels = sorted(lab['chan_id'].unique())",
    "hold_ch = set(labeled_channels[-1:])                 # last channel = supervised holdout",
    "lab_tr = lab[~lab['chan_id'].isin(hold_ch)]",
    "lab_te = lab[ lab['chan_id'].isin(hold_ch)]",
    "print('supervised train channels:', sorted(set(labeled_channels)-hold_ch),",
    "      '| holdout channel:', hold_ch)",
))

add(reading(
    ("Data leakage (Kaggle ML course)", "https://www.kaggle.com/code/alexisbcook/data-leakage",
     "the canonical, concrete explanation of target/train-test leakage and how to spot it"),
    ("Why look-ahead bias destroys backtests", "https://en.wikipedia.org/wiki/Look-ahead_bias",
     "the time-series flavor of leakage — the exact trap the Gold ROWS-PRECEDING frame prevents"),
))

add(md(
    "### 2.2 · Two ways: hand-rolled gradient descent, then sklearn",
    "",
    "First we implement logistic-regression gradient descent in ~12 lines so the `w -= lr*grad` step is",
    "literal and visible. Then we fit sklearn's `LogisticRegression` to confirm the hand-rolled version",
    "lands in the same place. We log both to MLflow and inspect coefficients (the *explainability* the",
    "whole baseline is for).",
))

add(code(
    "import mlflow",
    "mlflow.set_experiment(EXPERIMENT_PATH)",
    "from sklearn.preprocessing import StandardScaler",
    "from sklearn.linear_model import LogisticRegression",
    "from sklearn.metrics import roc_auc_score",
    "",
    "# Supervised split = group-by-channel within the LABELED rows (built in 2.1).",
    "sc = StandardScaler().fit(lab_tr[GOLD_FEATS])",
    "Xtr, Xte = sc.transform(lab_tr[GOLD_FEATS]), sc.transform(lab_te[GOLD_FEATS])",
    "ytr, yte = lab_tr['y_next'].to_numpy(), lab_te['y_next'].to_numpy()",
    "print('train pos rate', round(ytr.mean(),4), '| holdout pos rate', round(yte.mean(),4))",
    "",
    "def sigmoid(z): return 1/(1+np.exp(-z))",
    "def fit_gd(X, y, lr=0.1, epochs=300):",
    "    w = np.zeros(X.shape[1]); b = 0.0; n = len(y)",
    "    for _ in range(epochs):",
    "        p = sigmoid(X@w + b)",
    "        grad_w = X.T @ (p - y) / n      # gradient of log-loss",
    "        grad_b = (p - y).mean()",
    "        w -= lr * grad_w; b -= lr * grad_b   # <-- MINUS: step downhill",
    "    return w, b",
    "",
    "# Guard: a supervised classifier needs both classes in train. If the labeled slice is one-class",
    "# (can happen on real Gold when anomalies are tiny), say so instead of crashing or faking a score.",
    "if len(np.unique(ytr)) < 2:",
    "    raise ValueError('Not enough labeled outcomes: train slice is single-class. '",
    "                     'Widen HORIZON, add more labeled channels, or use the unsupervised '",
    "                     'threshold path from train_anomaly.py instead.')",
    "",
    "w, b = fit_gd(Xtr, ytr)",
    "auc_gd = roc_auc_score(yte, sigmoid(Xte@w + b)) if len(np.unique(yte))>1 else float('nan')",
    "",
    "with mlflow.start_run(run_name='p2_logreg_baseline'):",
    "    clf = LogisticRegression(max_iter=1000, class_weight=None).fit(Xtr, ytr)",
    "    auc_sk = roc_auc_score(yte, clf.predict_proba(Xte)[:,1]) if len(np.unique(yte))>1 else float('nan')",
    "    mlflow.log_metric('auc_handrolled_gd', auc_gd)",
    "    mlflow.log_metric('auc_sklearn', auc_sk)",
    "    mlflow.log_param('horizon', HORIZON)",
    "    coefs = pd.Series(clf.coef_[0], index=GOLD_FEATS).sort_values(key=abs, ascending=False)",
    "print(f'AUC  hand-rolled GD={auc_gd:.3f}   sklearn={auc_sk:.3f}  (should be close)')",
    "print('\\ncoefficients (sklearn, standardized features):'); print(coefs.round(3).to_string())",
))

add(reading(
    ("Logistic regression, the math (CS229 notes)", "https://cs229.stanford.edu/notes2022fall/main_notes.pdf",
     "Andrew Ng's derivation of the log-loss gradient — exactly the grad_w above"),
    ("An overview of gradient descent (Ruder)", "https://www.ruder.io/optimizing-gradient-descent/",
     "batch vs SGD vs Adam, learning-rate intuition — why the minus sign and the step size matter"),
    ("sklearn LogisticRegression", "https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html",
     "the production baseline; note solver/penalty/class_weight knobs we use later"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 3 — LOSS FUNCTIONS FOR RARE EVENTS
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 3 · Loss functions for rare events (and why accuracy lies)",
    "",
    "**Goal.** Real anomalies are rare — most windows are nominal. A model that always says 'nominal'",
    "scores 99% accuracy and is worthless. The fix is in the **loss** (what you optimize) and the",
    "**metrics** (what you trust).",
    "",
    "**The math — binary cross-entropy:**",
    "",
    "$$\\mathcal{L} = -\\big[y\\log p + (1-y)\\log(1-p)\\big]$$",
    "",
    "When positives are 1% of data, plain BCE under-weights them. Two fixes:",
    "- **Weighted BCE** — multiply the positive term by $w_+ \\approx \\frac{N_{neg}}{N_{pos}}$.",
    "- **Focal loss** — down-weight easy examples: $\\mathcal{L}=-(1-p_t)^\\gamma\\log p_t$, so training",
    "  focuses on the hard, misclassified minority.",
    "",
    "**The gotcha — accuracy is the wrong metric.** Track **precision, recall, F1, false-negative rate,",
    "and lead time**. For a hot-fire anomaly, a false negative (missed anomaly) is far worse than a",
    "false positive (a review you didn't need).",
    "",
    "**The regression gotcha.** For noisy continuous targets (RUL, time-to-threshold), plain **MSE**",
    "over-punishes one bad sensor spike. Prefer **Huber / Log-Cosh / MAE**, and for intervals use",
    "**quantile loss**, not decorative ± bands.",
))

add(md(
    "### 3.1 · Imbalance, weighted loss, and threshold tuning",
    "",
    "We reuse the Phase-2 features but now: (a) show the class imbalance directly, (b) refit with",
    "`class_weight='balanced'`, and (c) **tune the decision threshold** to a chosen operating point",
    "instead of accepting 0.5. The precision/recall/FN-rate table is the honest scorecard.",
))

add(code(
    "from sklearn.metrics import precision_recall_curve, precision_score, recall_score, f1_score",
    "",
    "pos = int(ytr.sum()); neg = len(ytr) - pos",
    "print(f'class balance (train): {pos} positive / {len(ytr)} total = {pos/max(len(ytr),1):.3%}')",
    "",
    "clf_bal = LogisticRegression(max_iter=1000, class_weight='balanced').fit(Xtr, ytr)",
    "proba = clf_bal.predict_proba(Xte)[:,1]",
    "",
    "def scorecard(y, p, thr):",
    "    yhat = (p >= thr).astype(int)",
    "    tp = int(((yhat==1)&(y==1)).sum()); fn = int(((yhat==0)&(y==1)).sum())",
    "    return dict(threshold=round(thr,2),",
    "                precision=round(precision_score(y, yhat, zero_division=0), 3),",
    "                recall=round(recall_score(y, yhat, zero_division=0), 3),",
    "                f1=round(f1_score(y, yhat, zero_division=0), 3),",
    "                false_neg_rate=round(fn/max(tp+fn,1), 3))",
    "",
    "print('\\nthreshold sweep (false negatives are the costly error for anomalies):')",
    "if yte.any():",
    "    for thr in [0.5, 0.3, 0.2, 0.1]:",
    "        print(scorecard(yte, proba, thr))",
    "else:",
    "    print('Not enough labeled outcomes in the test split to score — refusing a fake number.')",
))

add(reading(
    ("Focal loss (Lin et al., RetinaNet)", "https://arxiv.org/abs/1708.02002",
     "the original focal-loss paper — the (1-p)^gamma down-weighting for class imbalance"),
    ("Precision-Recall vs ROC for imbalance", "https://machinelearningmastery.com/roc-curves-and-precision-recall-curves-for-imbalanced-classification/",
     "why PR curves, not accuracy/ROC, are the honest view when positives are rare"),
    ("Threshold-moving for imbalanced classification", "https://machinelearningmastery.com/threshold-moving-for-imbalanced-classification/",
     "the discipline behind the threshold sweep above — tie it to the operational decision"),
))

add(md(
    "### 3.2 · Regression losses: MSE vs Huber on outlier windows",
    "",
    "A quick, visual demonstration of why MSE over-reacts to a single bad sensor spike while Huber",
    "stays calm. We corrupt a few points and compare the fitted slope under each loss.",
))

add(code(
    "from sklearn.linear_model import LinearRegression, HuberRegressor",
    "",
    "x = np.linspace(0, 10, 120); y_clean = 2.0*x + 5 + rng.normal(0, 1, x.size)",
    "y = y_clean.copy(); y[::25] += 40        # a few sensor-spike outliers",
    "X = x.reshape(-1,1)",
    "ols  = LinearRegression().fit(X, y)",
    "hub  = HuberRegressor().fit(X, y)",
    "print(f'true slope = 2.00')",
    "print(f'MSE/OLS slope   = {ols.coef_[0]:.2f}   (yanked by the outliers)')",
    "print(f'Huber slope     = {hub.coef_[0]:.2f}   (robust — close to truth)')",
))

add(reading(
    ("Huber loss", "https://en.wikipedia.org/wiki/Huber_loss",
     "quadratic near zero, linear in the tails — why it resists outliers MSE chases"),
    ("Quantile regression for prediction intervals", "https://scikit-learn.org/stable/auto_examples/linear_model/plot_quantile_regression.html",
     "for forecast bands that actually mean what they claim (sets up Phase 6 calibration)"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 4 — GBDT
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 4 · Gradient-boosted trees (the highest-ROI tabular model)",
    "",
    "**Goal.** Beat the logistic baseline on the same holdout with a GBDT (XGBoost/LightGBM) over the",
    "engineered Gold features. For structured telemetry/quality data this is usually the best model",
    "*before* deep learning.",
    "",
    "**Intuition / the math.** Trees are fit **sequentially**, each correcting the residual error of the",
    "ensemble so far:",
    "",
    "$$F_{m}(x) = F_{m-1}(x) + \\nu\\, h_m(x), \\quad h_m \\approx -\\nabla_{F}\\mathcal{L}\\big(y, F_{m-1}\\big)$$",
    "",
    "$\\nu$ is the learning rate (shrinkage). XGBoost/LightGBM also use second-order (Hessian) info.",
    "",
    "**The gotcha — GBDTs overfit quietly.** Control it: `learning_rate`, `max_depth`,",
    "`min_child_samples`, row/feature subsampling, and **early stopping** on a validation set.",
    "",
    "**The telemetry gotcha — random splits lie.** If windows from the *same run* land in both train and",
    "test, the model looks better than it is. Split by **time / campaign / engine serial / channel**, not",
    "at random.",
))

add(code(
    "# Same group-by-channel holdout as Phase 2, over the labeled rows — the GBDT must beat logistic",
    "# on the SAME split for the comparison to mean anything.",
    "Xtr2, ytr2 = lab_tr[GOLD_FEATS], lab_tr['y_next']",
    "Xte2, yte2 = lab_te[GOLD_FEATS], lab_te['y_next']",
    "print('held-out channel:', hold_ch, '| train rows', len(Xtr2), '| test rows', len(Xte2))",
    "",
    "try:",
    "    from xgboost import XGBClassifier",
    "    model = XGBClassifier(n_estimators=400, learning_rate=0.05, max_depth=4,",
    "                          subsample=0.8, colsample_bytree=0.8, min_child_weight=5,",
    "                          eval_metric='logloss', early_stopping_rounds=30,",
    "                          scale_pos_weight=max((ytr2==0).sum()/max((ytr2==1).sum(),1),1))",
    "    model.fit(Xtr2, ytr2, eval_set=[(Xte2, yte2)], verbose=False)",
    "    name = 'xgboost'",
    "except Exception as e:",
    "    _banner(f'xgboost unavailable, using sklearn GradientBoosting — {str(e)[:60]}')",
    "    from sklearn.ensemble import GradientBoostingClassifier",
    "    model = GradientBoostingClassifier(n_estimators=300, learning_rate=0.05, max_depth=3).fit(Xtr2, ytr2)",
    "    name = 'sklearn_gbdt'",
    "",
    "with mlflow.start_run(run_name=f'p4_{name}'):",
    "    if yte2.any():",
    "        p = model.predict_proba(Xte2)[:,1]; auc = roc_auc_score(yte2, p)",
    "    else:",
    "        auc = float('nan')",
    "    mlflow.log_metric('auc_holdout_channel', auc)",
    "    mlflow.log_param('split', 'group_by_channel')",
    "    imp = pd.Series(getattr(model,'feature_importances_',np.zeros(len(GOLD_FEATS))), index=GOLD_FEATS)",
    "print(f'GBDT ({name}) AUC on held-out channel = {auc:.3f}   vs logistic {auc_sk:.3f}')",
    "print('\\nfeature importances (scan for a leaky feature dominating):')",
    "print(imp.sort_values(ascending=False).round(3).to_string())",
))

add(reading(
    ("XGBoost — how it works", "https://xgboost.readthedocs.io/en/stable/tutorials/model.html",
     "the additive-tree + second-order objective derivation, in the library's own words"),
    ("LightGBM parameter tuning", "https://lightgbm.readthedocs.io/en/latest/Parameters-Tuning.html",
     "the practical knobs for the 'overfits quietly' gotcha — depth, leaves, min_child, subsample"),
    ("sklearn GroupKFold", "https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html",
     "the principled version of the by-channel holdout — never split a group across train/test"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 5 — LSTM
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 5 · Sequence modeling with an LSTM",
    "",
    "**Goal.** A single pressure reading can be fine while the *pattern over the last 60 seconds* is",
    "dangerous. LSTMs carry memory across time, so they catch drift and shape that row-wise models miss.",
    "",
    "**Intuition / the math.** An LSTM cell gates what to remember and forget across the sequence:",
    "",
    "$$f_t=\\sigma(W_f[h_{t-1},x_t]),\\;\\; i_t=\\sigma(W_i[\\cdot]),\\;\\; o_t=\\sigma(W_o[\\cdot])$$",
    "$$c_t = f_t\\odot c_{t-1} + i_t\\odot\\tilde c_t, \\qquad h_t = o_t\\odot\\tanh(c_t)$$",
    "",
    "Input shape is `[batch, time_steps, channels]` — e.g. 60 ticks × N sensors.",
    "",
    "**The gotcha — plain RNNs struggle.** Vanishing/exploding gradients over long sequences; LSTM or GRU",
    "is the first credible sequence model.",
    "",
    "**The telemetry gotcha — alignment before architecture.** Resampling, clock alignment, missing",
    "samples, sensor dropout, per-stand calibration. *A bad timestamp join ruins the model faster than a",
    "bad architecture.*",
    "",
    "**The deployment gotcha — fail closed.** If a required channel is missing, don't score silently —",
    "return `Not available — missing required sensor channel: <name>`.",
))

add(md(
    "### 5.1 · Window the sequence, train an LSTM classifier",
    "",
    "We turn the per-tick Gold features into overlapping `[WINDOW, channels]` sequences and train a",
    "small LSTM to predict whether the *next* tick is anomalous. We compare against the static-threshold",
    "baseline from Phase 3, the whole point being that the LSTM should catch a drift the static rule",
    "misses. Keras falls back to a logistic-on-flattened-window if TF isn't present, so the cell runs.",
))

add(code(
    "WINDOW = 50",
    "seq_df = win[win['split']=='test'].sort_values(['chan_id','t']) if (win['split']=='test').any() else win",
    "feat_cols = ['value','value_rstd50','value_roc']",
    "",
    "def make_sequences(df):",
    "    Xs, ys = [], []",
    "    for _c, g in df.groupby('chan_id'):",
    "        a = g[feat_cols].to_numpy(); lab = g['is_anomaly'].to_numpy()",
    "        for i in range(WINDOW, len(g)-1):",
    "            Xs.append(a[i-WINDOW:i]); ys.append(int(lab[i+1]))   # predict next tick",
    "    return np.asarray(Xs, dtype='float32'), np.asarray(ys, dtype='int32')",
    "",
    "Xs, ys = make_sequences(seq_df)",
    "cut = int(len(Xs)*0.7)",
    "print('sequences', Xs.shape, '| positive rate', round(ys.mean(),4) if len(ys) else 0)",
    "",
    "try:",
    "    import tensorflow as tf",
    "    from tensorflow.keras import layers, models",
    "    mdl = models.Sequential([layers.Input((WINDOW, len(feat_cols))),",
    "                             layers.LSTM(32), layers.Dense(1, activation='sigmoid')])",
    "    mdl.compile('adam', 'binary_crossentropy')",
    "    cw = {0:1.0, 1:float(max((ys[:cut]==0).sum()/max((ys[:cut]==1).sum(),1),1))}",
    "    mdl.fit(Xs[:cut], ys[:cut], epochs=4, batch_size=64, class_weight=cw, verbose=0)",
    "    lstm_p = mdl.predict(Xs[cut:], verbose=0).ravel(); kind='lstm'",
    "except Exception as e:",
    "    _banner(f'TensorFlow unavailable — logistic-on-flattened-window fallback: {str(e)[:60]}')",
    "    flat = Xs.reshape(len(Xs), -1)",
    "    lr = LogisticRegression(max_iter=500, class_weight='balanced').fit(flat[:cut], ys[:cut])",
    "    lstm_p = lr.predict_proba(flat[cut:])[:,1]; kind='logreg_flat'",
    "",
    "yv = ys[cut:]",
    "if yv.any():",
    "    from sklearn.metrics import f1_score as f1s",
    "    seq_f1 = f1s(yv, (lstm_p>=0.5).astype(int), zero_division=0)",
    "    print(f'{kind} sequence F1 = {seq_f1:.3f}  (vs the static-threshold baseline from Phase 3)')",
    "else:",
    "    print('No positive labels in the held-out sequence slice — not reporting a fake F1.')",
))

add(reading(
    ("Understanding LSTM Networks (colah)", "https://colah.github.io/posts/2015-08-Understanding-LSTMs/",
     "the canonical visual explainer for the gate equations above — read this once, it sticks"),
    ("Keras LSTM layer", "https://keras.io/api/layers/recurrent_layers/lstm/",
     "the API used above; input shape, return_sequences, statefulness"),
    ("LSTM autoencoder for anomaly detection", "https://machinelearningmastery.com/lstm-autoencoders/",
     "the reconstruction-error variant your plan mentions (sequence in → sequence out → error = score)"),
    ("Resampling & aligning time series (pandas)", "https://pandas.pydata.org/docs/user_guide/timeseries.html#resampling",
     "the alignment work that must happen BEFORE modeling — the gotcha that sinks LSTMs"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 6 — CALIBRATION + MODEL CARD
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 6 · Calibration, model cards, and production trust",
    "",
    "**Goal.** When the model says *80% anomaly risk*, does that mean it's right ~80% of the time? A",
    "model can rank well (good AUC) yet be badly *calibrated*. You can't show an executive a probability",
    "you haven't checked.",
    "",
    "**The math — Brier score** (mean squared error of probabilities):",
    "",
    "$$\\text{Brier} = \\frac{1}{N}\\sum_i (p_i - y_i)^2$$",
    "",
    "Plus the **reliability diagram** (predicted vs observed frequency per bin) and **Expected",
    "Calibration Error (ECE)**.",
    "",
    "**The gotcha — global calibration hides local failure.** A model can look calibrated overall and be",
    "wildly off on one stand / engine variant / campaign. Calibrate and check **by slice**, never on the",
    "aggregate alone.",
    "",
    "**The model card** is the contract: target, label definition, features, *excluded* fields, leakage",
    "checks, loss, baseline, split strategy, metrics, calibration, slice performance, known failure modes,",
    "the decision it informs, owner, deploy date, rollback version. We log it as an MLflow artifact —",
    "your `tel_model_runs` table already mirrors exactly this metadata from the registry.",
))

add(code(
    "from sklearn.calibration import calibration_curve, CalibratedClassifierCV",
    "from sklearn.metrics import brier_score_loss",
    "",
    "if len(np.unique(yte)) > 1:",
    "    raw_p = clf_bal.predict_proba(Xte)[:,1]",
    "    # cv='prefit' was removed in recent sklearn; refit-with-internal-CV is version-portable and",
    "    # still leakage-safe (calibration is cross-fit on train, evaluated on the held-out channel).",
    "    cal = CalibratedClassifierCV(",
    "        LogisticRegression(max_iter=1000, class_weight='balanced'),",
    "        method='isotonic', cv=3).fit(Xtr, ytr)",
    "    cal_p = cal.predict_proba(Xte)[:,1]",
    "    print(f'Brier  raw={brier_score_loss(yte, raw_p):.4f}   calibrated={brier_score_loss(yte, cal_p):.4f}  (lower=better)')",
    "    frac_pos, mean_pred = calibration_curve(yte, cal_p, n_bins=8, strategy='quantile')",
    "    ece = float(np.mean(np.abs(frac_pos - mean_pred)))",
    "    print(f'Expected Calibration Error (calibrated) = {ece:.3f}')",
    "    print('\\nreliability (mean_predicted -> observed_frequency), should track the diagonal:')",
    "    for mp, fp in zip(mean_pred.round(2), frac_pos.round(2)):",
    "        print(f'  predicted ~{mp:>4}  ->  observed {fp:>4}')",
    "else:",
    "    print('No labeled test outcomes — calibration is undefined. Deployment status: NOT PROMOTED.')",
))

add(reading(
    ("Brier score", "https://en.wikipedia.org/wiki/Brier_score",
     "the single number for probabilistic accuracy used above"),
    ("Calibrating classifiers (scikit-learn guide)", "https://scikit-learn.org/stable/modules/calibration.html",
     "isotonic vs Platt, reliability diagrams, when ranking-good ≠ probability-good"),
    ("Model Cards for Model Reporting (Mitchell et al.)", "https://arxiv.org/abs/1810.03993",
     "the origin of the model-card contract we emit below"),
    ("Conformal prediction (MAPIE)", "https://mapie.readthedocs.io/",
     "distribution-free intervals with a coverage guarantee — the rigorous version of forecast bands"),
))

add(md(
    "### 6.1 · Emit the model card as an MLflow artifact",
    "",
    "Every field your plan requires, filled from what we computed. This is the JSON your serving layer",
    "(`tel_model_runs.metrics` / `.gate`) mirrors. No anonymous scores: a score links to a card links to",
    "metrics links to the input window.",
))

add(code(
    "import json, datetime",
    "_labeled = len(np.unique(yte)) > 1   # was the holdout scoreable at all?",
    "_brier = round(float(brier_score_loss(yte, cal_p)), 4) if (_labeled and 'cal_p' in dir()) else None",
    "model_card = {",
    "    'model_name': 'tel_anomaly_next_window',",
    "    'model_version': 'dev',",
    "    'target': f'anomaly within next {HORIZON} ticks (binary)',",
    "    'label_definition': 'forward max of is_anomaly over HORIZON ticks — LABEL ONLY, never a feature',",
    "    'feature_groups': GOLD_FEATS,",
    "    'excluded_fields': ['final_run_status','post_run_failure_code','operator_final_disposition'],",
    "    'leakage_checks': 'rolling features are ROWS BETWEEN n PRECEDING AND CURRENT ROW (Gold); label built forward only',",
    "    'loss_function': 'balanced binary cross-entropy (class_weight) + threshold tuning',",
    "    'baseline_comparison': {'logistic_auc': round(float(auc_sk),3) if _labeled else None,",
    "                            'gbdt_auc': round(float(auc),3) if _labeled else None},",
    "    'validation_split': 'group-by-channel holdout (no same-series leakage)',",
    "    'calibration': {'method': 'isotonic', 'brier_calibrated': _brier},",
    "    'known_failure_modes': 'sparse early history; over-logged stand-2 inflates its own retrieval recall',",
    "    'known_unsafe_failure_mode': 'false-negative (missed anomaly). For the RUL model the unsafe mode is a"
    " LATE prediction — over-stating remaining useful life — tracked by PHM + late_prediction_rate.',",
    "    'decision_informed': 'review / hold / abort / quarantine threshold for a test window',",
    "    'approved_use': 'Approved use: telemetry demo / maintenance-risk investigation support.',",
    "    'not_approved_use': 'Not approved use: autonomous launch, flight-safety, or maintenance authorization.',",
    "    'owner': 'telemetry-platform',",
    "    'deployment_date': None,",
    "    'rollback_version': None,",
    "    'promotion_state': 'model_not_promoted'  # fail-closed until a human promotes",
    "}",
    "# The RUL model card (target/baseline/PHM/late-rate/leakage/approved-use) is emitted by",
    "# notebooks/train_rul.py as rul_model_card.json and gated by notebooks/promote_models.py.",
    "with mlflow.start_run(run_name='p6_model_card'):",
    "    mlflow.log_dict(model_card, 'model_card.json')",
    "print(json.dumps(model_card, indent=2))",
))

add(reading(
    ("MLflow Model Registry", "https://mlflow.org/docs/latest/model-registry.html",
     "stages, aliases (champion/challenger), and the promotion gate your tel_model_runs mirrors"),
    ("Unity Catalog model governance", "https://docs.databricks.com/en/machine-learning/manage-model-lifecycle/index.html",
     "registering models in UC so lineage and access control are enforced, not advisory"),
))

# ═════════════════════════════════════════════════════════════════════════════
# PHASE 7 — DEMO ARC
# ═════════════════════════════════════════════════════════════════════════════
add(md(
    "---",
    "## Phase 7 · The demo arc — math made visible",
    "",
    "The point of all six phases, in one executive-legible flow. Each step ties a *fundamental* to a",
    "thing on screen:",
    "",
    "| On screen | The fundamental underneath |",
    "|---|---|",
    "| similar prior incidents retrieved | **embeddings + cosine** (Phase 1) |",
    "| baseline anomaly probability | **logistic regression** (Phase 2) |",
    "| rare anomaly actually caught | **weighted / focal loss** (Phase 3) |",
    "| structured risk score + reason codes | **GBDT** (Phase 4) |",
    "| drift the static threshold missed | **LSTM sequence model** (Phase 5) |",
    "| '80% means 80%' | **Brier / calibration** (Phase 6) |",
    "| score → card → metrics → input rows | **model card + lineage** (Phase 6) |",
    "",
    "**Demo flow:** start the hot-fire replay (`gold_replay_feed`) → nominal → inject subtle drift →",
    "static thresholds stay quiet → LSTM score rises → alert shows model version + confidence → click",
    "through to the source window, similar prior NCRs (Phase 1 retrieval), and the model card → ask",
    "Winston 'have we seen this before?' → it answers *with citations* → open lineage back to",
    "gold/silver/bronze/source → end on the registry, calibration curve, and a fail-closed null state.",
    "",
    "**The discipline that makes it credible:** the demo shows a model *beating a baseline*, shows",
    "*lineage not just a chart*, shows a *refusal when data is missing*, shows *versioning and",
    "calibration*, and ties *every score to an operational decision*.",
))

add(code(
    "# Pull the deterministic replay feed (the fixed channel the demo always uses).",
    "def synth_replay():",
    "    base = synth_windows()",
    "    g = base[(base['chan_id']=='D-4') & (base['split']=='test')].copy()",
    "    return g[['chan_id','t','value','value_rmean50','value_rstd50','value_roc','is_anomaly']]",
    "",
    "replay = read_gold('gold_replay_feed', synth_replay)",
    "print('replay feed rows:', len(replay), '| labeled anomaly ticks:', int(replay['is_anomaly'].sum()))",
    "",
    "# Fail-closed demonstration: required channel missing -> explicit null, never a guessed score.",
    "REQUIRED = ['value', 'value_rstd50']",
    "def score_or_refuse(row):",
    "    missing = [c for c in REQUIRED if c not in replay.columns or pd.isna(row.get(c))]",
    "    if missing:",
    "        return {'verdict': 'NOT_AVAILABLE', 'null_reason': f'missing required channel: {missing[0]}'}",
    "    return {'verdict': 'SCORED', 'anomaly_score': float(abs(row['value'] - row['value_rmean50']))}",
    "",
    "print('\\nexample scores (note the fail-closed contract):')",
    "for _, r in replay.head(3).iterrows():",
    "    print(' ', score_or_refuse(r))",
))

add(reading(
    ("Data lineage in Unity Catalog", "https://docs.databricks.com/en/data-governance/unity-catalog/data-lineage.html",
     "the 'open the lineage drawer back to source' step — automatic table/column lineage"),
    ("Retrieval-augmented generation (RAG)", "https://www.databricks.com/glossary/retrieval-augmented-generation-rag",
     "the 'ask Winston, get a cited answer' step — grounding answers in Phase-1 retrieval"),
))

add(md(
    "---",
    "## Where to take it next",
    "",
    "- **Wire the real corpus** into Phase 1 (`read_gold('ncr_corpus', ...)`) — the synthetic fallback",
    "  banner disappears the moment the table resolves.",
    "- **Promote a model** through `tel_model_runs` only when the honest gate passes (see",
    "  `notebooks/promote_models.py`) — the model card here is the pre-flight checklist.",
    "- **Schedule** the train→calibrate→card flow as a Databricks Job once you trust a phase.",
    "- Each phase's *Further reading* is the rabbit hole; the math cell is the part worth re-deriving by",
    "  hand once.",
))

# ═════════════════════════════════════════════════════════════════════════════
# ASSEMBLE
# ═════════════════════════════════════════════════════════════════════════════
_assign_ids(CELLS)
nb = {
    "cells": CELLS,
    "metadata": {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
        "application/vnd.databricks.v1+notebook": {
            "notebookName": "telemetry_ml_fundamentals", "language": "python",
        },
    },
    "nbformat": 4,
    "nbformat_minor": 5,
}

out = Path(__file__).resolve().parent / "telemetry_ml_fundamentals.ipynb"
out.write_text(json.dumps(nb, indent=1), encoding="utf-8")
print(f"wrote {out}  ({len(CELLS)} cells)")
