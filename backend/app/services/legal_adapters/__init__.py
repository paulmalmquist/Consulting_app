"""Winston Legal — adapter Protocols.

These are the swap points between the Winston reference implementation and a
client implementation. Every legal AI service consumes adapters via
constructor injection or default-arg so a client fork can replace the default
backing (Winston tables) with its own systems (Jira/ServiceNow for intake,
SharePoint/iManage for documents, Okta/AD for approvers, Splunk for audit, …).

See docs/winston-legal/ADAPTER_CONTRACTS.md for full signatures and example
client mappings.
"""

from app.services.legal_adapters.intake_source import (
    IntakeItem,
    IntakeSourceAdapter,
    default_intake_source,
)
from app.services.legal_adapters.document_source import (
    DocumentRef,
    DocumentSourceAdapter,
    ExtractedDocument,
    default_document_source,
)
from app.services.legal_adapters.approver_registry import (
    ApproverIdentity,
    ApproverRegistryAdapter,
    default_approver_registry,
)
from app.services.legal_adapters.audit_sink import (
    AuditSinkAdapter,
    default_audit_sink,
)
from app.services.legal_adapters.contract_of_record import (
    ContractOfRecordAdapter,
    ContractRecord,
    default_contract_of_record,
)

__all__ = [
    "IntakeItem",
    "IntakeSourceAdapter",
    "default_intake_source",
    "DocumentRef",
    "DocumentSourceAdapter",
    "ExtractedDocument",
    "default_document_source",
    "ApproverIdentity",
    "ApproverRegistryAdapter",
    "default_approver_registry",
    "AuditSinkAdapter",
    "default_audit_sink",
    "ContractOfRecordAdapter",
    "ContractRecord",
    "default_contract_of_record",
]
