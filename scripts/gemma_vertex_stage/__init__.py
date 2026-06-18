"""Stage-only toolkit to spin up / exercise / tear down a Gemma-on-Vertex endpoint.

Used by the `gemma-vertex-stage` skill. Stage-only: never sets production GEMMA_VERTEX_*,
never enables AI_DISPATCH_ENABLED in prod, and always pairs deploy with teardown to stop GPU
billing. Real Gemma calls go only through the existing governed dispatch path.
"""
