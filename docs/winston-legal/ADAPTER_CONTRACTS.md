# Winston Legal — Adapter Contracts

Each Protocol below has a Winston-internal default implementation that backs the demo. A client fork swaps in implementations that read and write the client's own enterprise systems.

Source code lives in [backend/app/services/legal_adapters/](../../backend/app/services/legal_adapters/).

## IntakeSourceAdapter

Where structured legal requests come from. Default backing: the `legal_intake_requests` table populated by the Winston web form.

```python
class IntakeSourceAdapter(Protocol):
    def fetch_pending(self, *, env_id: UUID, business_id: UUID, limit: int = 50) -> list[IntakeItem]: ...
    def acknowledge(self, *, env_id: UUID, business_id: UUID, source_external_id: str, intake_id: UUID) -> None: ...
```

Example client mappings:
- **Jira / ServiceNow**: pull tickets with a `legal-request` label; ack closes the ticket or moves status.
- **Slack**: an inbound `/legal` slash-command and an Apps webhook.
- **Outlook / Gmail**: a watched mailbox (`legal@…`) parsed into an intake row.
- **Workday**: vendor onboarding / employment events that trigger a legal review.

## DocumentSourceAdapter

Where contract text and metadata come from. Default backing: `app.documents` + `app.extracted_field` populated by the Winston extraction pipeline.

```python
class DocumentSourceAdapter(Protocol):
    def get_extracted_text(self, *, env_id: UUID, business_id: UUID, document_id: UUID) -> ExtractedDocument | None: ...
    def list_documents_for_matter(self, *, env_id: UUID, business_id: UUID, matter_id: UUID) -> list[DocumentRef]: ...
```

`ExtractedDocument` carries `text`, `pages`, `sections`, `extraction_confidence`. The First-Pass Contract Review service requires a real text body and substring-validates every cited evidence quote. If extraction is incomplete, the adapter must return `None` (or a partial doc with `extraction_confidence` set) so Winston can fail closed.

Example client mappings: SharePoint, iManage, Box, Google Drive, NetDocuments, Notion, S3.

## ApproverRegistryAdapter

Resolves who is authorized to approve what. Default backing: the `legal_approver_registry` table seeded with role-based entries.

```python
class ApproverRegistryAdapter(Protocol):
    def resolve_approver(self, *, env_id: UUID, business_id: UUID, role_label: str) -> ApproverIdentity | None: ...
    def lookup_signature_authority(self, *, env_id: UUID, business_id: UUID, person: str, action: str) -> bool: ...
```

Example client mappings: Okta, Active Directory, Workday, native authz service, an ABAC engine.

The Attorney Workbench calls `lookup_signature_authority` before recording any disposition. A `False` answer surfaces in the UI as `Not authorized for this action — escalate to GC` and prevents the write.

## AuditSinkAdapter

Records every step. Default backing: [backend/app/services/audit.py](../../backend/app/services/audit.py) `record_event` writing to the Winston audit table.

```python
class AuditSinkAdapter(Protocol):
    def record(self, *, env_id: UUID, business_id: UUID, actor: str, action: str, object_type: str,
              object_id: UUID | None, success: bool, input_data: dict | None = None,
              output_data: dict | None = None, latency_ms: int | None = None) -> None: ...
```

Example client mappings: Splunk HEC, Datadog Logs, native SIEM, S3+Athena, a records-management system. Every attorney disposition, every AI-prepared output, and every adapter call should land here. The audit trail is what makes the layer credible to a GC.

## ContractOfRecordAdapter

The system of record for executed contracts and matter context. Default backing: `legal_contracts` and the matter tables in `275_legal_ops_core.sql`.

```python
class ContractOfRecordAdapter(Protocol):
    def get_contract(self, *, env_id: UUID, business_id: UUID, contract_id: UUID) -> ContractRecord | None: ...
    def list_contracts_for_matter(self, *, env_id: UUID, business_id: UUID, matter_id: UUID) -> list[ContractRecord]: ...
```

Example client mappings: Ironclad, DocuSign CLM, SpotDraft, Agiloft, native repo.

The Outside Counsel Packet Builder reads contract metadata through this adapter when assembling the prior-internal-position section.

## How adapters compose

Every AI service in `backend/app/services/legal_*_ai.py` (intake classifier, contract reviewer, decision packet builder, outside counsel packet builder) takes adapters via constructor injection or default-arg, so a client fork swaps implementations without forking the core services.

```python
def review_contract(
    *, env_id, business_id, matter_id, document_id,
    provider="anthropic",
    doc_adapter: DocumentSourceAdapter = default_document_source,
    audit: AuditSinkAdapter = default_audit_sink,
) -> ReviewRunResult: ...
```

This is the swap point. It is the difference between the demo and a client implementation.
