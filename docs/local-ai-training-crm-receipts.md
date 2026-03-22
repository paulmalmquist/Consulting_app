# Local AI Training CRM Receipts

## Inventory of what existed before this build

### Existing reusable surfaces
- Canonical CRM records already existed in `crm_account`, `crm_contact`, `crm_activity`, `crm_pipeline_stage`, and `crm_opportunity`.
- The consulting workspace already exposed command center, pipeline, outreach, clients, loops, and other general-purpose pages.
- Consulting-specific extensions already existed for outreach logs/templates and client delivery tracking.

### Why those objects were not enough as-is
- There was no event entity, venue entity, registration/attendance table, event-focused campaign attribution, or attendee feedback table.
- There was no day-of-event check-in workflow optimized for phone use.
- The consulting sidebar was desktop-first and did not expose a mobile quick-nav for local field execution.
- Generic consulting client/proposal objects were not a clean fit for a local paid-events business.

## Target architecture

### Keep and extend
- `crm_contact` remains the canonical person table.
- `crm_account` remains the canonical organization table.
- `crm_activity` remains the canonical audit receipt for activities when a general CRM timeline entry is useful.

### Add local-training extensions
- `nv_contact_profile` for persona, segment, lead source, attendance rollups, and follow-up priority.
- `nv_organization_profile` for venue/partner metadata.
- `nv_venue` for event-space comparison and selection.
- `nv_training_event` for planned and completed classes.
- `nv_event_registration` for ticketing/attendance reconciliation.
- `nv_campaign` for channel attribution.
- `nv_training_outreach_activity` for operating outreach and partner activity.
- `nv_task` for mobile quick actions.
- `nv_event_feedback` for post-event learning and testimonials.

## Mapping receipts
- Contact ⇄ organization uses `crm_contact.crm_account_id` when a partner or referral source belongs to an organization.
- Venue ⇄ organization uses `nv_venue.organization_account_id`.
- Event ⇄ venue uses `nv_training_event.venue_id`.
- Registration ⇄ event/contact uses `nv_event_registration.event_id` + `crm_contact_id`.
- Feedback ⇄ event/contact uses `nv_event_feedback.event_id` + `crm_contact_id`.
- Outreach activity can optionally point back to `crm_activity_id` for a generic CRM audit receipt.

## Seed assumptions
- Pricing starts at `$25–$45` to fit the requested early-stage local training model.
- South Florida seed mix emphasizes Lake Worth Beach and West Palm Beach, with some nearby spillover cities for realistic local reach.
- Contact personas intentionally skew toward beginners, older adults, retirees, and a smaller set of local business owners / referral partners.
- Campaigns favor local channels: Facebook groups, flyers, partners, word-of-mouth, and small direct outreach loops.
- Seed data is realistic but synthetic; it is designed to feel like a live operating workspace immediately after seeding.

## QA checklist used in the build
- Registration counts are recalculated from attendance rows.
- Contact attendance rollups are recalculated from registration rows.
- Duplicate emails are surfaced in the workspace QA block.
- Orphan registrations and impossible task statuses are checked in the workspace summary payload.
- Mobile navigation was added so the new primary pages stay reachable in one tap on phone.
