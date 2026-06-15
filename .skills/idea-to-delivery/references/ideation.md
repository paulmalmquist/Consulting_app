# Ideation — developing an idea with depth

The goal of phase 1 is a written artifact someone else could read and act on. A developed idea answers these without hand-waving.

## The questions that matter

1. **What decision does this unblock, and for whom?** Name the user/role and the choice they can't make well today.
2. **Why now?** What changed, or what does it cost to wait. Tie to a real driver, not "it'd be nice."
3. **What does success look like?** A metric or an observable state, not "it works."
4. **What are the real options?** At least two. For each: how it works, what it costs, what it risks. A single option with a strawman is not a decision — it's a foregone conclusion dressed up.
5. **What's the recommendation, and why this over the others?** State it plainly. Don't hedge.
6. **What's out of scope?** The explicit non-goals that keep this shippable.
7. **What's unknown or unvalidated?** Flag assumptions to test in discovery rather than asserting them. (Example from the RS platform: ITAR support for specific GCP services — confirm against the supported-products table, do not assume.)
8. **What does done look like?** The acceptance criteria, sketched, so phase 2 can sharpen them.

## When to write an ADR vs. a design doc vs. just an idea record

- **Idea record** — always, for anything that starts fuzzy. The lightweight capture of the eight questions above.
- **ADR (Architecture Decision Record)** — when the idea contains a durable decision with trade-offs (a tech choice, a data-model direction, a boundary). The ADR records the decision, the alternatives, and the consequences so future readers know *why*, not just *what*. ADRs are append-only; supersede, don't rewrite.
- **Design doc** — when the idea is large enough that the *how* needs its own document (a multi-component build, a pipeline, an agent). Links to the ADR(s) for the decisions inside it.

## Anti-patterns

- Transcribing the ask instead of developing it (no options, no risks).
- A decision with one option and a strawman alternative.
- Asserting an unknown as fact instead of flagging it for discovery.
- Stopping at "it works" with no success metric.
- Verbal agreement with nothing written — there's no receipt to hand to phase 2.

## Output

A reviewable idea record (and ADR/design doc when warranted). That artifact is the input to `azure-devops-intake`, so the work items inherit the problem, options, risks, and acceptance cri