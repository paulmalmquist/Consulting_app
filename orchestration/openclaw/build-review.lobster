name: build-review
args:
  request:
    default: "Review the latest Winston build state."
steps:
  - id: review
    command: ./scripts/openclaw_build_review.sh
    env:
      OPENCLAW_REQUEST: ${request}
