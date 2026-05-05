from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field


class MatchReason(StrEnum):
    EXACT_ALIAS = "exact_alias"
    SUBSTRING_ALIAS = "substring_alias"
    KEYWORD_CLUSTER = "keyword_cluster"
    CONTEXTUAL_TRIGGER = "contextual_trigger"
    REFERENTIAL_INHERITANCE = "referential_inheritance"


class BehaviorTier(StrEnum):
    PROCEED = "proceed"
    CLARIFY = "clarify"
    CONFIRM = "confirm"
    NONE = "none"


class RequiredContextField(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    description: str
    data_source: str
    required: bool = True


class RequiredContext(BaseModel):
    model_config = {"extra": "forbid"}

    fields: list[RequiredContextField] = Field(default_factory=list)

    def required_field_names(self) -> list[str]:
        return [f.name for f in self.fields if f.required]


class DriverBucket(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    definition: str
    aliases: list[str] = Field(default_factory=list)


class DriverTaxonomy(BaseModel):
    model_config = {"extra": "forbid"}

    buckets: list[DriverBucket] = Field(default_factory=list)

    def bucket_names(self) -> list[str]:
        return [b.name for b in self.buckets]

    def compressed_text(self) -> str:
        return "\n".join(f"- {b.name}: {b.definition}" for b in self.buckets)


class OutputSection(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    required: bool = True
    description: str = ""


class OutputContract(BaseModel):
    model_config = {"extra": "forbid"}

    sections: list[OutputSection] = Field(default_factory=list)

    def required_section_names(self) -> list[str]:
        return [s.name for s in self.sections if s.required]

    def all_section_names(self) -> list[str]:
        return [s.name for s in self.sections]


class FailureMode(BaseModel):
    model_config = {"extra": "forbid"}

    code: str
    description: str
    user_visible_message: str | None = None


class CannotComputeRule(BaseModel):
    model_config = {"extra": "forbid"}

    precondition: str
    failure_mode_code: str


class ReasoningStep(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    description: str


class FreshnessPolicy(BaseModel):
    model_config = {"extra": "forbid"}

    default_max_age_days: int = 30
    primary_source_max_age_days: int | None = None
    notes: str = ""


class FileRequirement(BaseModel):
    model_config = {"extra": "forbid"}

    name: str
    required_columns: list[str] = Field(default_factory=list)
    optional_columns: list[str] = Field(default_factory=list)
    normalization_rules: list[str] = Field(default_factory=list)


class FileRequirements(BaseModel):
    model_config = {"extra": "forbid"}

    files: list[FileRequirement] = Field(default_factory=list)

    def get(self, name: str) -> FileRequirement | None:
        for f in self.files:
            if f.name == name:
                return f
        return None


class DiagnosticsContract(BaseModel):
    model_config = {"extra": "forbid"}

    emit_compilation_receipt: bool = True
    emit_answer_receipt: bool = True
    receipt_fields: list[str] = Field(default_factory=list)


class ConceptObject(BaseModel):
    model_config = {"extra": "forbid"}

    concept_id: str
    version: str
    canonical_question: str
    aliases: list[str] = Field(default_factory=list)
    environment: list[str] = Field(default_factory=list)
    entity_types: list[str] = Field(default_factory=list)
    required_context: RequiredContext = Field(default_factory=RequiredContext)
    preferred_sources: list[str] = Field(default_factory=list)
    driver_taxonomy: DriverTaxonomy = Field(default_factory=DriverTaxonomy)
    reasoning_steps: list[ReasoningStep] = Field(default_factory=list)
    output_contract: OutputContract = Field(default_factory=OutputContract)
    failure_modes: list[FailureMode] = Field(default_factory=list)
    cannot_compute_rules: list[CannotComputeRule] = Field(default_factory=list)
    freshness_policy: FreshnessPolicy = Field(default_factory=FreshnessPolicy)
    file_requirements: FileRequirements = Field(default_factory=FileRequirements)
    diagnostics_contract: DiagnosticsContract = Field(default_factory=DiagnosticsContract)

    def applies_to(self, environment: str | None, entity_type: str | None) -> bool:
        if self.environment and environment and environment not in self.environment:
            return False
        if self.entity_types and entity_type and entity_type not in self.entity_types:
            return False
        return True


class ConceptMatch(BaseModel):
    model_config = {"extra": "forbid"}

    concept_id: str
    version: str
    matched_alias: str | None
    confidence: float
    match_reason: MatchReason
    behavior_tier: BehaviorTier

    @staticmethod
    def behavior_tier_for_confidence(confidence: float) -> BehaviorTier:
        if confidence >= 0.7:
            return BehaviorTier.PROCEED
        if confidence >= 0.5:
            return BehaviorTier.CLARIFY
        if confidence >= 0.4:
            return BehaviorTier.CONFIRM
        return BehaviorTier.NONE
