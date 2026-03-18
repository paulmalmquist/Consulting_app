# Feature: Agentic Building Data Ingestion — Cambio — 2026-03-18

**Source:** Cambio — https://cambio.ai

## What It Does (User-Facing)
Automatically extracts building operating data (utility bills, energy statements, inspection reports) from PDFs and spreadsheets, cleans and validates it, and populates a structured data model — eliminating the manual analyst work of gathering and normalizing property-level data across a large portfolio.

## Functional Components

- **Data source:** PDFs (utility bills, invoices, inspection reports), spreadsheets, utility provider APIs, EnergyStar Portfolio Manager
- **Processing:** LLM-powered document parsing and structured data extraction; automated error/anomaly detection; data normalization across inconsistent source formats; validation against expected ranges
- **Trigger:** File upload (manual); scheduled polling of connected sources (SFTP, utility APIs)
- **Output:** Structured property data records; data quality score; flagged anomalies for review
- **Delivery:** In-platform data model; API to corporate data lake

## Winston Equivalent
Winston has a document ingestion pipeline. The question is whether it performs structured extraction from PDFs (rent rolls, operating statements, utility bills) into queryable data records, or primarily ingests narrative documents for RAG retrieval. If the pipeline handles structured financial extraction (e.g., pulling line items from a T-12 or operating statement into the GL data model), this is a Partial match. If it's primarily vector search over documents, there is a meaningful gap in structured field extraction for operational data.

## Architectural Pattern
LLM-powered document parsing → structured field extraction → validation rules engine → data normalization layer → downstream data model population. This is a "RAG over documents → structured output" pattern — distinct from standard RAG retrieval. The key is the structured extraction step (not just answering questions about the document, but turning the document INTO data).
