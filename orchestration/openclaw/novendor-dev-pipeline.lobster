name: novendor-dev-pipeline
args:
  request:
    default: ""
steps:
  - id: run_pipeline
    command: ./scripts/openclaw_dev_pipeline.sh
    env:
      OPENCLAW_REQUEST: ${request}
