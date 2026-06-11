# Environment Keys & Access Codes

> Keep this file out of version control. Do not commit.

## Winston App (paulmalmquist.com / consulting-app on Vercel)

| Variable | Value | Notes |
|---|---|---|
| `NOVENDOR_ADMIN_EMAIL` | `info@novendor.ai` | Primary admin login (Supabase auth) |
| `NOVENDOR_ADMIN_PASSWORD` | *(check Vercel env vars or Supabase dashboard)* | Password for info@novendor.ai |
| `ADMIN_INVITE_CODE` | `SWvxEtVPMK_YanlB` | Legacy invite code — fallback if email auth fails |
| `ENV_INVITE_CODE` | *(check Vercel env vars)* | Grants access to environments as env_user |

## Stargate streaming lane (Confluent Cloud — PR 4)

| Variable | Value | Notes |
|---|---|---|
| `CONFLUENT_BOOTSTRAP_SERVERS` | *(printed by infra/confluent/stargate/provision.ps1)* | Cluster bootstrap; `localhost:9092` for local Redpanda |
| `CONFLUENT_API_KEY` / `CONFLUENT_API_SECRET` | *(minted by provision.ps1 for sa-stargate-demo)* | Cluster key; the repo-root `confluent)_kafka_api.json` key is cluster-scoped and unlabeled — prefer the minted one |
| `CONFLUENT_SR_URL` | *(printed by provision.ps1)* | Schema Registry; `http://localhost:8081` for local Redpanda SR |
| `CONFLUENT_SR_API_KEY` / `CONFLUENT_SR_API_SECRET` | *(minted by provision.ps1)* | SR credentials, cloud only |
| `STARGATE_MODE` | `cloud` \| `local` \| `capture` | Bridge + producer mode; capture needs no broker |
| `NEXT_PUBLIC_STARGATE_BRIDGE_URL` | `http://localhost:8100` | Dashboard → bridge SSE endpoint |

The Winston event backbone uses a separate `EVENTS_*` contract (see the Phase
3B lane's `infra/confluent/README.md`) — same cluster, different consumers, do
not merge the two.

Last updated: 2026-06-11
