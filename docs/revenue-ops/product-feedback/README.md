# Product Feedback from Sales

This directory captures structured product feedback originating from revenue activities. Every sales conversation should improve Winston.

## Categories

- **feature-request**: Prospect asked "Can Winston do X?"
- **demo-friction**: Demo moment that confused or lost the audience
- **objection**: Specific reason a prospect hesitated or declined
- **integration-ask**: System the prospect needs Winston to connect with
- **terminology**: Industry term Winston should understand
- **positioning-intel**: How prospects describe their problem (their words, not ours)
- **win-signal**: What tipped a won deal toward us
- **loss-signal**: What made a prospect choose something else

## Entry Format

Each entry should include:
- Date
- Source account and contact (if known)
- Category (from above)
- Verbatim quote or close paraphrase
- Severity: blocking / important / nice-to-have
- Frequency: first-mention / recurring / universal
- Suggested product action

## Automated Synthesis

The `weekly-product-feedback-synthesis` task (Friday 7 AM) compiles weekly entries into prioritized product backlog recommendations and cross-references with feature-radar scores.

## How This Feeds the Product

1. Weekly synthesis produces "Top 3 Product Priorities from Sales"
2. These feed into feature-radar scoring as demand signals
3. The autonomous coding session (daily 3 PM) can pick up sales-validated features
4. Demo improvements flow to the Thursday demo-objection-cycle task
