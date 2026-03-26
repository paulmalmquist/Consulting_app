# Revenue-Backwards Pipeline Definition

Working backwards from money collected. Each stage has clear entry/exit criteria and evidence requirements.

## Stage 7: Revenue Received
- **Objective:** Cash collected
- **Entry:** Invoice paid
- **Exit:** N/A (terminal)
- **Evidence:** Bank deposit, invoice marked paid in cro_revenue_schedule
- **Blockers:** Payment delays, scope disputes, net-30/60 terms
- **Artifacts:** Invoice, engagement letter, completion confirmation
- **CRM Field:** cro_revenue_schedule.invoice_status = 'paid'

## Stage 6: Proposal Accepted
- **Objective:** Signed SOW or engagement letter
- **Entry:** Proposal sent + follow-up completed
- **Exit:** Signed document received
- **Evidence:** Signed SOW or written acceptance (email counts)
- **Blockers:** Price objection, scope creep fear, champion loses momentum, legal review delays
- **Artifacts:** Proposal doc, ROI framing doc, reference availability
- **CRM Field:** cro_proposal.status = 'accepted'

## Stage 5: Proposal Sent
- **Objective:** Formal offer delivered to decision maker
- **Entry:** Discovery complete, scope agreed verbally
- **Exit:** Proposal opened, follow-up call scheduled
- **Evidence:** Proposal delivery confirmation (email open tracking or verbal)
- **Blockers:** Slow drafting, unclear scope, pricing uncertainty, wrong format
- **Artifacts:** Proposal (from template), scope summary, pricing breakdown
- **CRM Field:** cro_proposal.status = 'sent'

## Stage 4: Discovery Call Held
- **Objective:** Understand pain, budget, timeline, authority
- **Entry:** Qualified lead, meeting scheduled
- **Exit:** Pain confirmed, budget range known, next step agreed, timeline established
- **Evidence:** Meeting notes in crm_activity, confirmed pain verbatim, budget signal
- **Blockers:** No-show, vague pain, no budget authority present, unprepared demo
- **Artifacts:** Discovery question framework, demo environment, meeting notes template
- **CRM Field:** crm_opportunity.stage = 'discovery'

## Stage 3: Qualified Lead
- **Objective:** Confirm fit and real intent
- **Entry:** Target identified, initial response received
- **Exit:** BANT confirmed (Budget, Authority, Need, Timeline)
- **Evidence:** Response to outreach, confirmed interest, initial pain signal, budget indicator
- **Blockers:** False positives, low urgency, wrong contact, no budget cycle alignment
- **Artifacts:** Lead scoring rubric, qualification checklist
- **CRM Field:** cro_lead_profile.lead_score >= 50

## Stage 2: Target Account Selected
- **Objective:** Identify and research high-probability accounts
- **Entry:** Segment defined, market signals scanned
- **Exit:** Account researched, decision-maker contact identified, outreach draft ready
- **Evidence:** Account brief, contact info verified, outreach draft in cro_outreach_log
- **Blockers:** Insufficient research, wrong segment, no contact path, bad timing
- **Artifacts:** Sales signal reports, Apollo/LinkedIn research, account brief template
- **CRM Field:** crm_account created with type = 'prospect'

## Stage 1: Outreach / Motion Initiated
- **Objective:** Start conversations through any channel
- **Entry:** Target list built, proof assets ready, outreach templates drafted
- **Exit:** First touch sent and logged
- **Evidence:** cro_outreach_log entry with channel, template, sentiment baseline
- **Blockers:** No proof assets, weak messaging, wrong channel for persona, batch too small
- **Artifacts:** Outreach templates, proof assets, content calendar, event invitations
- **CRM Field:** cro_outreach_log entry created

## Mapping to Existing CRM Pipeline Stages

These revenue-backwards stages map to the existing consulting pipeline:
- Outreach Initiated → lead
- Target Account Selected → lead
- Qualified Lead → contacted
- Discovery Call Held → discovery
- Proposal Sent → proposal
- Proposal Accepted → negotiation → closed_won
- Revenue Received → closed_won (with paid revenue_schedule)

No schema changes needed. The existing pipeline stages and win probabilities (5% → 10% → 25% → 50% → 70% → 100%) align with this framework.
