# Codex Sidecar Deploy

This deploys the same `/health` + `/ask` sidecar used by `/api/ai/codex/*`.

## Build

```bash
cd repo-b
docker build -f Dockerfile.sidecar -t bm-codex-sidecar .
```

## Run Locally via Docker

```bash
docker run --rm -p 8080:8080 \
  -e OPENAI_API_KEY=sk-... \
  -e AI_SIDECAR_TOKEN=replace-with-strong-token \
  bm-codex-sidecar
```

Health check:

```bash
curl -H "Authorization: Bearer replace-with-strong-token" \
  http://127.0.0.1:8080/health
```

## Deploy to Railway/Render/Fly

Use `repo-b/Dockerfile.sidecar` as the container image source.

Set runtime env vars:

- `OPENAI_API_KEY`: key used by `codex exec`.
- `AI_SIDECAR_TOKEN`: required bearer token.
- `AI_SIDECAR_HOST=0.0.0.0`
- `AI_SIDECAR_PORT=8080` (or provider `PORT`)

## Wire into Vercel App

Set Vercel env vars (Preview + Production):

- `AI_MODE=local`
- `NEXT_PUBLIC_AI_MODE=local`
- `AI_SIDECAR_URL=https://<your-sidecar-host>`
- `AI_SIDECAR_TOKEN=<same-token-as-sidecar>`

After redeploy, the command bar health endpoint should return:

```json
{"ok":true,"mode":"local","message":"Connected"}
```
