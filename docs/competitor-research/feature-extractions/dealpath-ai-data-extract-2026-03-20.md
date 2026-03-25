# Feature: AI Data Extract (OM/Flyer Abstraction) — Dealpath — 2026-03-20

**Source:** Dealpath — dealpath.com/ai-studio/

## What It Does (User-Facing)
Automatically extracts structured data from offering memorandums (OMs) and marketing flyers in under 1 minute with 95% accuracy across 90+ property and listing fields. Eliminates manual data entry from deal documents.

## Functional Components
- Data source: Uploaded PDF/document files (OMs, flyers, marketing packages)
- Processing: Document parsing (likely vision + NLP); field extraction for 90+ structured fields (property name, address, SF, unit count, asking price, cap rate, NOI, tenant roster, etc.); validation against known schemas; confidence scoring
- Trigger: User uploads a document or document arrives via integration (Dropbox, Box, Google Drive)
- Output: Structured deal record with 90+ populated fields; confidence scores per field; flagged items requiring human review
- Delivery: Auto-populates deal record in Dealpath pipeline; reduces deal creation from manual entry to review-and-confirm

## Winston Equivalent
Winston has a document ingestion pipeline. The question is whether it extracts structured REPE-specific fields (cap rate, NOI, SF, unit count, etc.) from OMs at 90+ field depth with 95% accuracy. Winston's pipeline likely handles document ingestion but may not have the same breadth of field extraction or the specific OM/flyer template recognition. This is "Partial to Easy build" — Winston has the document pipeline infrastructure; needs OM-specific extraction templates and field mapping.

## Architectural Pattern
Document AI extraction pipeline with domain-specific field schema. Pattern: "document upload → vision/NLP parsing → schema-guided field extraction → confidence scoring → structured record creation."
