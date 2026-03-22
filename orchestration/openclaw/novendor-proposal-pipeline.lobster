name: novendor-proposal-pipeline
args:
  request:
    default: ""
steps:
  - id: draft
    command: ./scripts/openclaw_proposal_pipeline.sh draft
    env:
      OPENCLAW_REQUEST: ${request}
  - id: approval
    command: ./scripts/openclaw_lobster_approval.sh
    stdin: $draft.json
    env:
      OPENCLAW_APPROVAL_PROMPT: Approve this proposal draft for operator handoff?
    approval: required
  - id: finalize
    command: ./scripts/openclaw_proposal_pipeline.sh finalize
    env:
      OPENCLAW_DRAFT_JSON: $draft.json
    condition: $approval.approved
