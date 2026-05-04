# Winston Legal — Client Adoption Guide

A short playbook for the conversation with a buyer.

## The opening line

> *You may not need a specialized legal AI wrapper. You likely need your own legal operating layer — your policies, your templates, your playbooks, your approval logic, your matter history, your evidence, your audit trail, and your attorneys supervising final judgment.*

## What good looks like

A buyer who is ready to move usually has these three things:

1. **A volume problem in legal ops.** The same kinds of requests, contracts, and approvals come through repeatedly. The team is doing reconstruction work — finding facts, hunting for policy, summarizing the same clause for the fifth time.
2. **A document and approval reality.** Documents live somewhere (SharePoint, iManage, Box, Drive, NetDocuments). Approvers live in an authority matrix that already exists in HR or IT systems. Email and ticketing systems already carry the inbound requests.
3. **A discipline expectation.** Counsel is comfortable with AI preparing the file but not making the call. The audit trail is non-negotiable.

If those are present, Winston Legal is a fit as a reference framework.

## The engagement model

Three bullets, in order:

1. **Assess current state.** Walk the [MATURITY_LEVELS.md](MATURITY_LEVELS.md) ladder. Identify which Winston Legal modules deliver the next jump. This is usually a one- to two-week conversation with the GC, the legal ops lead, and an enterprise architect.
2. **Design the layer against the client's stack.** Map each adapter contract from [ADAPTER_CONTRACTS.md](ADAPTER_CONTRACTS.md) to a concrete system. Prioritize the modules that absorb the most repeatable work first — typically Intake Triage and First-Pass Contract Review.
3. **Deliver the working pieces with attorneys in the loop.** Use the Winston Legal reference implementation as the working spec. Build the client's version against their adapters. Seed Legal Memory from existing playbooks and historical decisions. Stand up the Attorney Workbench last.

## What clients get from us

- The reference implementation as a working specification.
- The eight-module map, the adapter contracts, and the maturity assessment.
- The buyer due diligence checklist ([BUYER_DUE_DILIGENCE_GUIDE.md](BUYER_DUE_DILIGENCE_GUIDE.md)) for evaluating any vendor in the space.
- The capability parity matrix ([LEGAL_AI_PLATFORM_PARITY_MATRIX.md](LEGAL_AI_PLATFORM_PARITY_MATRIX.md)) to position internal-build versus thin-wrapper purchase.
- Engagement support to actually build the operating layer in the client's stack.

## What clients should not expect

- A hosted AI lawyer.
- A replacement for counsel.
- A generic legal chatbot to plug into Slack and call done.
- Per-seat SaaS licensing of `Winston Legal`.

## Where the moat lives

Winston Legal is a pattern. The moat for any client is **their own legal memory** — the accumulated dispositions, accepted clauses, rejected counterparty positions, attorney rationale, approval exceptions, outside counsel guidance, and policy history. Winston Legal demonstrates how to capture that as a first-class asset.

The closing line:

> *Winston prepares the file. Counsel approves the judgment.*
