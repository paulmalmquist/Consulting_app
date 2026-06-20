# History Rhymes Polymarket Confluent lane

This lane extends dispatch `0004`. It uses the existing JSON `EventEnvelope`;
Schema Registry is intentionally deferred.

## Provision

```powershell
confluent login --save
gcloud auth login
.\provision.ps1 -GcpProjectId paultest-d3cb1
```

The script creates the four Polymarket topics, reuses
`winston.dead-letter.v1`, creates three least-privilege service accounts, and
stores new cluster credentials directly in GCP Secret Manager. It does not
write or print API secrets.

Topic policy:

| Topic | Partitions | Policy |
|---|---:|---|
| `winston.hr.polymarket.markets.v1` | 3 | compacted |
| `winston.hr.polymarket.raw.v1` | 6 | 7-day retention |
| `winston.hr.polymarket.features.v1` | 3 | 30-day retention |
| `winston.hr.polymarket.forecasts.v1` | 3 | 90-day retention |
| `winston.dead-letter.v1` | 3 | reused, 30-day retention when newly created |

Polymarket itself requires no credentials. Do not add wallet, signing, or
authenticated CLOB secrets.
