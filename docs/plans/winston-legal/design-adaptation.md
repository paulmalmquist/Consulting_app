# Winston Legal — Design Adaptation

## Purpose in the design system

Winston Legal is a controlled, document-heavy environment. Legal professionals need to trust what they see. The visual language should feel like a sophisticated legal workbench — restrained, precise, audit-oriented. No playful accents. No AI-lawyer styling.

## Accent choices
- Primary: `--nv-purple-400` (minimal use)
- Document status: `--nv-success` (executed), `--nv-warning` (pending review), `--nv-error` (expired/rejected)
- AI confidence indicators: neutral blue-gray (not accent colors — confidence is not a celebration)

## Density
Medium. Contract and matter lists need enough detail per row. Document viewer should be full-width.

## Component emphasis
- Contract rows must show: title, counterparty, status, key date
- Matter rows must show: matter name, responsible attorney, open date, status
- AI-extracted clauses must be clearly labeled as "AI extracted" with a confidence indicator
- Outside counsel spend must show spend per firm vs. budget

## What this environment must NOT do
- Style the AI assistant like a "legal AI robot" — it is a review support tool
- Show "AI analysis" results without declaring confidence and source document
- Use red for normal expired contracts (this conflates warning with error)
- Use bright accent colors for matter status (legal status is not a cause for visual excitement)
