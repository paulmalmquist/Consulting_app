# Vertex MLOps Learning Lab

This repo now includes a renderer for a low-cost Vertex AI learning-lab bundle:

- Script: `scripts/render_vertex_mlops_learning_lab.py`
- Default output: `artifacts/vertex-mlops-learning-lab/`

The goal is to populate the Google Cloud console with real clickable MLOps artifacts without taking the expensive path.

Creates:
- BigQuery source tables
- Vertex Feature Groups + Features
- Vertex AI Model Registry entries
- Vertex Experiment runs
- A small BigQuery evaluation-results table

Does not create:
- Vertex endpoints
- online stores
- feature views
- managed Vertex training jobs

## Render the bundle

From the repo root:

```bash
python scripts/render_vertex_mlops_learning_lab.py
```

Override the target project or region if needed:

```bash
python scripts/render_vertex_mlops_learning_lab.py \
  --project-id my-project \
  --region us-central1 \
  --bq-location us-central1 \
  --dataset mlops_learning_lab \
  --bucket my-project-vertex-mlops-lab
```

The script writes a Cloud Shell bundle containing:

- `run_cloud_shell.sh`
- `create_feature_groups.py`
- `train_tiny_models.py`
- `create_vertex_experiments.py`
- four small `.jsonl` seed files

## Run intentionally

The renderer itself makes no cloud calls. To create the artifacts, copy the generated bundle into Google Cloud Shell and run:

```bash
chmod +x run_cloud_shell.sh
./run_cloud_shell.sh
```

## Guardrail

If the console tries to route you into endpoint deployment, online serving, online stores, feature views, or managed sync/training jobs, stop unless that cost is intentional. This bundle is designed to stop at the registration and experiment layers.
