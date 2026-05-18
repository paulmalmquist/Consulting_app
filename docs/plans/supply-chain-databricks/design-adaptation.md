# Supply Chain / Databricks — Design Adaptation

## Purpose in the design system

Supply Chain is a data-product showcase environment. It communicates the power of a medallion architecture and AI-native data products to technical and executive audiences. The visual language should feel like a modern data platform — structured, technical, confident.

## Accent choices
- Primary: `--nv-green-400` (data product health, Gold layer)
- Bronze layer: `--nv-copper-400`
- Silver layer: `--nv-text-secondary` (neutral)
- Gold layer: `--nv-amber-400`
- Alerts / anomalies: `--nv-red-400`

## Density
High. The medallion architecture view and data catalog must handle many tables/entities. Charts should prioritize clarity over decoration.

## Component emphasis
- Medallion architecture diagram must use Bronze/Silver/Gold layer color coding
- Data product cards must show: name, owner, quality score, freshness
- Genie query interface must have a prominent input with clear "Ask in natural language" affordance
- Notebook list must show execution status (running, completed, failed) with color-coded chips

## What this environment must NOT do
- Show layer labels without the corresponding table counts or quality scores
- Use a pie chart for data volume (use bar or treemap)
- Present Genie as a generic chatbot (it is a structured query surface)
