# ADR 0001 — Model access strategy: stay Winston-managed, defer provider abstraction

- **Status:** Accepted
- **Date:** 2026-06-12
- **Deciders:** Paul Malmquist (owner)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** `docs/plans/automated-data-engineering/` (PR 1 plan folder), [`0002-surface-portability.md`](0002-surface-portability.md), `backend/app/services/ai_gateway.py`

## Context

ADE positions Winston as a governed connector/skill fabric with the model layer as a
swappable component. Buyers will eventually want one of three access modes:

1. **Winston-managed** — model traffic goes through Winston's own OpenAI account
   (today's state, via `backend/app/services/ai_gateway.py`).
2. **Bring-your-own-key** — the client supplies a provider API key; Winston stores and
   uses it per tenant.
3. **Enterprise connector** — the client routes through their own procurement-approved
   endpoint: Azure OpenAI, AWS Bedrock, Vertex AI, or Claude Enterprise.

Building modes 2 and 3 now means per-tenant key storage, rotation, a provider abstraction
layer, and a data-classification gate — none of which PR 1 needs to demonstrate the
fabric. The decision is whether to build any of that now or record the target shape and
defer.

## Decision

The model layer stays Winston-managed (OpenAI through `ai_gateway.py`) for now. The three
access modes above are the recorded target; no provider abstraction code ships until a
client engagement requires mode 2 or 3.

When that work starts, the abstraction is roughly:

```python
class ModelProvider(Protocol):
    def complete(self, request: ModelRequest) -> ModelResponse: ...
    def classify_capabilities(self) -> ProviderCapabilities: ...
    # implementations: WinstonManagedOpenAI, TenantKeyProvider, EnterpriseEndpointProvider
```

resolved per tenant from client config, with a data-classification/redaction gate in
front of any non-managed path: requests are classified (public / internal / controlled)
and redacted or blocked before leaving Winston's boundary. That gate is future work and
is named here so it is not forgotten when mode 2/3 lands.

## Alternatives considered

- **Build the provider abstraction now.** Rejected — no client needs it yet, and an
  abstraction designed against one real provider tends to fit only that provider. Wait
  for the second concrete case.
- **BYO-key only, skip enterprise connectors.** Rejected — the likeliest enterprise
  buyers (aerospace, finance) procure through Azure OpenAI or Bedrock, not raw keys.
- **Multiple managed providers (add Anthropic/Google under Winston's account).** Deferred
  — multiplies key management without changing the trust story a buyer cares about.

## Consequences

- Positive: PR 1 stays small; the gateway remains one audited choke point for all model
  traffic; the target shape is on record for sales conversations.
- Negative / cost: no per-tenant keys yet; all model traffic runs through Winston's
  OpenAI account (cost and data-handling sit with Winston); enterprise procurement
  conversations are deferred, which may delay deals that require mode 3.
- Follow-ups: roadmap items in `docs/plans/automated-data-engineering/roadmap.md`;
  provider-abstraction and redaction-gate stories carried in the ADO backlog as PR2+.

## Validation

Revisit when the first client asks for mode 2 or 3, or when model spend through the
managed account becomes a pricing problem. Either event triggers a follow-up ADR that
fixes the abstraction interface against the real second provider.
