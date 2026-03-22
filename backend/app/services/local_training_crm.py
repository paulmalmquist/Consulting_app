"""Local training CRM service for Novendor's in-person AI classes."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import random
from typing import Any
from uuid import UUID

from app.db import get_cursor
from app.services.reporting_common import normalize_key, resolve_tenant_id

OWNER_NAME = "Paul @ Novendor"
INSTRUCTOR_NAME = "Paul M."
BASE_DATE = date(2026, 3, 22)

FIRST_NAMES = [
    "Maria", "Linda", "James", "Patricia", "Carlos", "Susan", "Robert", "Elaine", "Michael", "Carol",
    "David", "Sandra", "Lisa", "Thomas", "Donna", "Richard", "Barbara", "Diane", "Anthony", "Janet",
    "Nancy", "George", "Deborah", "Ronald", "Sharon", "Karen", "Edward", "Carmen", "Denise", "Ana",
]
LAST_NAMES = [
    "Rivera", "Martinez", "Goldberg", "Johnson", "Lopez", "Schultz", "Fernandez", "Harris", "Morrison", "Kaplan",
    "Diaz", "Bennett", "Perez", "Howard", "Torres", "Rodriguez", "Sanchez", "Miller", "Williams", "Brooks",
]
CITIES = ["Lake Worth Beach", "West Palm Beach", "Boynton Beach", "Palm Springs", "Greenacres", "Lantana"]
PERSONAS = [
    ("curious beginner", "community learners", "everyday AI basics", "medium"),
    ("retiree", "older adults", "phone confidence", "high"),
    ("older adult non-technical", "older adults", "avoiding scams", "high"),
    ("small business owner", "local business owners", "marketing and admin", "medium"),
    ("real estate professional", "real estate", "listing support", "medium"),
    ("repeat attendee", "repeat learners", "prompt practice", "high"),
    ("partner / referral source", "partners", "community co-hosting", "medium"),
]
LEAD_SOURCES = ["facebook", "library", "nextdoor", "friend", "walk-in", "chamber", "senior center", "flyer"]
INTERESTS = ["AI basics", "photo editing", "travel planning", "small business marketing", "real estate workflow", "scam safety"]
STATUSES = ["new", "invited", "registered", "attended", "nurture"]
CONTACT_METHODS = ["email", "phone", "text"]
TAGS = [
    ["lake-worth", "beginner"],
    ["older-adult", "needs-phone-help"],
    ["business-owner", "follow-up"],
    ["real-estate", "partner-list"],
    ["repeat-interest", "warm"],
]

ORGS = [
    {"name": "Lake Worth Beach Public Library", "type": "library", "city": "Lake Worth Beach", "state": "FL", "website": "https://library.lakeworthbeachfl.gov", "phone": "561-555-1200", "relationship": "community partner", "status": "outreach_in_progress", "account_type": "partner"},
    {"name": "Mandel Neighborhood Learning Hub", "type": "library", "city": "West Palm Beach", "state": "FL", "website": "https://mandelhub.org", "phone": "561-555-1201", "relationship": "venue partner", "status": "qualified", "account_type": "partner"},
    {"name": "Lake Worth Senior Connection", "type": "senior center", "city": "Lake Worth Beach", "state": "FL", "website": "https://lwseniorconnection.org", "phone": "561-555-1202", "relationship": "referral source", "status": "qualified", "account_type": "partner"},
    {"name": "West Palm Small Business Circle", "type": "small local business association", "city": "West Palm Beach", "state": "FL", "website": "https://wpsbcircle.org", "phone": "561-555-1203", "relationship": "audience growth", "status": "researching", "account_type": "partner"},
    {"name": "Palm Beach Real Estate Network", "type": "community group", "city": "West Palm Beach", "state": "FL", "website": "https://pbrealestate.network", "phone": "561-555-1204", "relationship": "business audience", "status": "contacted", "account_type": "partner"},
    {"name": "The Banyan Cowork Lounge", "type": "coworking space", "city": "West Palm Beach", "state": "FL", "website": "https://banyancowork.com", "phone": "561-555-1205", "relationship": "venue pipeline", "status": "qualified", "account_type": "vendor"},
    {"name": "Lucerne Community Café", "type": "local business", "city": "Lake Worth Beach", "state": "FL", "website": "https://lucernecafe.co", "phone": "561-555-1206", "relationship": "flyer drop + venue", "status": "contacted", "account_type": "partner"},
    {"name": "Palm Beach Daily Bulletin", "type": "media outlet", "city": "West Palm Beach", "state": "FL", "website": "https://pbdailybulletin.com", "phone": "561-555-1207", "relationship": "earned media", "status": "researching", "account_type": "partner"},
    {"name": "South Florida Lifelong Learning Circle", "type": "community group", "city": "Palm Springs", "state": "FL", "website": "https://sflifelong.org", "phone": "561-555-1208", "relationship": "older adult referrals", "status": "qualified", "account_type": "partner"},
    {"name": "Lake Ave Chamber Collective", "type": "chamber", "city": "Lake Worth Beach", "state": "FL", "website": "https://lakeavechamber.org", "phone": "561-555-1209", "relationship": "business partnerships", "status": "contacted", "account_type": "partner"},
    {"name": "Coastal Community Center", "type": "community group", "city": "Boynton Beach", "state": "FL", "website": "https://coastalccenter.org", "phone": "561-555-1210", "relationship": "backup venue", "status": "researching", "account_type": "partner"},
    {"name": "Sunrise Sponsor Partners", "type": "sponsor", "city": "West Palm Beach", "state": "FL", "website": "https://sunrisesponsorpartners.com", "phone": "561-555-1211", "relationship": "future sponsor", "status": "researching", "account_type": "partner"},
]

VENUES = [
    {"venue_name": "Lake Worth Library Community Room", "org": "Lake Worth Beach Public Library", "address": "15 N M St", "city": "Lake Worth Beach", "state": "FL", "zip": "33460", "capacity_min": 18, "capacity_max": 42, "wifi": "strong", "av": True, "hourly": 45, "deposit": False, "status": "preferred", "preferred_for": "intro class"},
    {"venue_name": "Mandel Hub Workshop Studio", "org": "Mandel Neighborhood Learning Hub", "address": "402 Clematis St", "city": "West Palm Beach", "state": "FL", "zip": "33401", "capacity_min": 20, "capacity_max": 55, "wifi": "excellent", "av": True, "hourly": 65, "deposit": True, "status": "preferred", "preferred_for": "hands-on workshop"},
    {"venue_name": "Senior Connection Tech Lounge", "org": "Lake Worth Senior Connection", "address": "728 Lucerne Ave", "city": "Lake Worth Beach", "state": "FL", "zip": "33460", "capacity_min": 12, "capacity_max": 28, "wifi": "good", "av": True, "hourly": 25, "deposit": False, "status": "qualified", "preferred_for": "intro class"},
    {"venue_name": "Banyan Cowork Event Loft", "org": "The Banyan Cowork Lounge", "address": "625 Evernia St", "city": "West Palm Beach", "state": "FL", "zip": "33401", "capacity_min": 25, "capacity_max": 70, "wifi": "excellent", "av": True, "hourly": 95, "deposit": True, "status": "qualified", "preferred_for": "business-focused session"},
    {"venue_name": "Lucerne Café Back Room", "org": "Lucerne Community Café", "address": "522 Lake Ave", "city": "Lake Worth Beach", "state": "FL", "zip": "33460", "capacity_min": 10, "capacity_max": 22, "wifi": "fair", "av": False, "hourly": 20, "deposit": False, "status": "researching", "preferred_for": "community talk"},
    {"venue_name": "Coastal Community Hall", "org": "Coastal Community Center", "address": "1901 Ocean Ave", "city": "Boynton Beach", "state": "FL", "zip": "33426", "capacity_min": 20, "capacity_max": 80, "wifi": "good", "av": True, "hourly": 55, "deposit": True, "status": "contacted", "preferred_for": "partner session"},
    {"venue_name": "Lake Ave Chamber Meeting Room", "org": "Lake Ave Chamber Collective", "address": "203 Lake Ave", "city": "Lake Worth Beach", "state": "FL", "zip": "33460", "capacity_min": 16, "capacity_max": 34, "wifi": "good", "av": True, "hourly": 35, "deposit": False, "status": "contacted", "preferred_for": "business-focused session"},
    {"venue_name": "South Florida Learning Commons", "org": "South Florida Lifelong Learning Circle", "address": "410 Cypress Ln", "city": "Palm Springs", "state": "FL", "zip": "33461", "capacity_min": 15, "capacity_max": 36, "wifi": "strong", "av": True, "hourly": 30, "deposit": False, "status": "qualified", "preferred_for": "intro class"},
    {"venue_name": "Clematis Classroom Annex", "org": "Mandel Neighborhood Learning Hub", "address": "421 Datura St", "city": "West Palm Beach", "state": "FL", "zip": "33401", "capacity_min": 14, "capacity_max": 30, "wifi": "excellent", "av": True, "hourly": 48, "deposit": False, "status": "preferred", "preferred_for": "community talk"},
    {"venue_name": "WPB Garden Club Hall", "org": "West Palm Small Business Circle", "address": "209 S Olive Ave", "city": "West Palm Beach", "state": "FL", "zip": "33401", "capacity_min": 20, "capacity_max": 48, "wifi": "good", "av": True, "hourly": 52, "deposit": True, "status": "researching", "preferred_for": "hands-on workshop"},
]

EVENTS = [
    {"name": "AI Basics for Everyday Life — Lake Worth", "series": "Novendor AI Basics", "type": "intro class", "status": "completed", "date": date(2026, 2, 19), "start": time(10, 0), "end": time(12, 0), "venue": "Lake Worth Library Community Room", "city": "Lake Worth Beach", "capacity": 28, "theme": "Everyday prompts, travel, recipes, and scam safety", "level": "beginner", "instructor": INSTRUCTOR_NAME, "assistants": 1, "standard": 25, "early": 20, "follow_up": True, "check_in_status": "closed", "outcome": "Strong word-of-mouth response from older adults; three people asked for a follow-up workshop."},
    {"name": "AI Made Simple for Beginners — West Palm Beach", "series": "Novendor AI Basics", "type": "community talk", "status": "completed", "date": date(2026, 3, 12), "start": time(18, 0), "end": time(19, 30), "venue": "Mandel Hub Workshop Studio", "city": "West Palm Beach", "capacity": 40, "theme": "Plain-English intro to chatbots and practical uses", "level": "beginner", "instructor": INSTRUCTOR_NAME, "assistants": 2, "standard": 30, "early": 25, "follow_up": True, "check_in_status": "closed", "outcome": "Best attendance so far. Chamber and library referrals converted well."},
    {"name": "Bring Your Laptop AI Workshop — Lake Worth", "series": "Novendor Hands-On", "type": "hands-on workshop", "status": "scheduled", "date": date(2026, 4, 16), "start": time(10, 0), "end": time(12, 30), "venue": "Lake Worth Library Community Room", "city": "Lake Worth Beach", "capacity": 24, "theme": "Guided prompt practice for email, photos, and planning", "level": "beginner", "instructor": INSTRUCTOR_NAME, "assistants": 2, "standard": 35, "early": 29, "follow_up": False, "check_in_status": "not_started", "outcome": None},
    {"name": "AI for Small Business Basics — West Palm Beach", "series": "Novendor Business Track", "type": "business-focused session", "status": "scheduled", "date": date(2026, 5, 14), "start": time(18, 0), "end": time(20, 0), "venue": "Banyan Cowork Event Loft", "city": "West Palm Beach", "capacity": 38, "theme": "Simple AI workflows for marketing, admin, and customer follow-up", "level": "mixed", "instructor": INSTRUCTOR_NAME, "assistants": 1, "standard": 45, "early": 35, "follow_up": False, "check_in_status": "not_started", "outcome": None},
    {"name": "Intro to AI for Adults 55+ — South Florida", "series": "Novendor Community Access", "type": "partner session", "status": "scheduled", "date": date(2026, 6, 11), "start": time(10, 30), "end": time(12, 0), "venue": "Senior Connection Tech Lounge", "city": "Lake Worth Beach", "capacity": 26, "theme": "Confidence-building AI intro with phone-friendly examples", "level": "beginner", "instructor": INSTRUCTOR_NAME, "assistants": 2, "standard": 25, "early": 20, "follow_up": False, "check_in_status": "not_started", "outcome": None},
]

CAMPAIGNS = [
    {"name": "Initial direct outreach", "channel": "direct outreach", "audience": "warm leads + personal referrals", "launch": date(2026, 2, 1), "end": date(2026, 2, 18), "budget": 0, "event": "AI Basics for Everyday Life — Lake Worth", "angle": "Friendly introduction for complete beginners", "status": "completed", "leads": 11, "regs": 8},
    {"name": "Facebook local event push", "channel": "facebook", "audience": "Lake Worth + WPB local groups", "launch": date(2026, 3, 1), "end": date(2026, 3, 11), "budget": 85, "event": "AI Made Simple for Beginners — West Palm Beach", "angle": "Practical everyday uses without jargon", "status": "completed", "leads": 16, "regs": 9},
    {"name": "LinkedIn soft launch", "channel": "linkedin", "audience": "local professionals + real estate", "launch": date(2026, 3, 25), "end": date(2026, 4, 14), "budget": 40, "event": "Bring Your Laptop AI Workshop — Lake Worth", "angle": "Hands-on class for people who learn by doing", "status": "active", "leads": 9, "regs": 4},
    {"name": "Library / senior center partner outreach", "channel": "local partners", "audience": "libraries, senior centers, community groups", "launch": date(2026, 3, 20), "end": date(2026, 5, 30), "budget": 0, "event": "Intro to AI for Adults 55+ — South Florida", "angle": "Accessible, low-pressure class for older adults", "status": "active", "leads": 14, "regs": 6},
    {"name": "Flyer + café bulletin boards", "channel": "flyer", "audience": "walk-by neighborhood traffic", "launch": date(2026, 3, 29), "end": date(2026, 4, 15), "budget": 32, "event": "Bring Your Laptop AI Workshop — Lake Worth", "angle": "Bring your own device and leave with practical wins", "status": "active", "leads": 7, "regs": 3},
    {"name": "Follow-up for first event attendees", "channel": "email", "audience": "repeat attendee candidates", "launch": date(2026, 3, 15), "end": date(2026, 4, 20), "budget": 0, "event": "Bring Your Laptop AI Workshop — Lake Worth", "angle": "You liked the intro, now practice on your own device", "status": "active", "leads": 6, "regs": 5},
]


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _choose_tag(index: int) -> list[str]:
    return TAGS[index % len(TAGS)]


def _refresh_event_counts(cur, event_id: str) -> None:
    cur.execute(
        """
        SELECT COUNT(*) AS regs,
               COUNT(*) FILTER (WHERE attended_flag) AS attended
        FROM nv_event_registration
        WHERE event_id = %s
        """,
        (event_id,),
    )
    row = cur.fetchone() or {"regs": 0, "attended": 0}
    cur.execute(
        """
        UPDATE nv_training_event
        SET actual_registrations = %s,
            actual_attendance = %s,
            updated_at = now()
        WHERE id = %s
        """,
        (row["regs"], row["attended"], event_id),
    )


def _refresh_contact_attendance(cur, contact_id: str) -> None:
    cur.execute(
        """
        SELECT r.event_id, r.checked_in_time, e.event_date
        FROM nv_event_registration r
        JOIN nv_training_event e ON e.id = r.event_id
        WHERE r.crm_contact_id = %s AND r.attended_flag = true
        ORDER BY event_date ASC
        """,
        (contact_id,),
    )
    rows = cur.fetchall()
    first_event_id = rows[0]["event_id"] if rows else None
    total = len(rows)
    cur.execute(
        """
        UPDATE nv_contact_profile
        SET first_event_attended_id = %s,
            total_events_attended = %s,
            updated_at = now()
        WHERE crm_contact_id = %s
        """,
        (first_event_id, total, contact_id),
    )


def _activity_subject(activity_type: str, target: str) -> str:
    return {
        "dm sent": f"Direct invite to {target}",
        "email sent": f"Email invite for {target}",
        "call made": f"Phone call about {target}",
        "flyer drop": f"Flyer drop for {target}",
        "partnership outreach": f"Partner outreach for {target}",
        "follow-up sent": f"Follow-up for {target}",
        "invite sent": f"Invite sent for {target}",
        "reminder sent": f"Reminder for {target}",
        "testimonial requested": f"Testimonial request for {target}",
    }.get(activity_type, target)


def seed_local_training_workspace(*, env_id: str, business_id: UUID) -> dict[str, Any]:
    counts = {
        "contacts_seeded": 0,
        "organizations_seeded": 0,
        "venues_seeded": 0,
        "events_seeded": 0,
        "campaigns_seeded": 0,
        "activities_seeded": 0,
        "tasks_seeded": 0,
        "registrations_seeded": 0,
        "feedback_seeded": 0,
    }
    rng = random.Random(20260322)

    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        cur.execute("SELECT COUNT(*) AS cnt FROM nv_contact_profile WHERE env_id = %s AND business_id = %s", (env_id, str(business_id)))
        if (cur.fetchone() or {"cnt": 0})["cnt"] > 0:
            return {"status": "already_seeded", **counts}

        org_ids: dict[str, str] = {}
        org_contact_ids: list[str] = []
        for idx, org in enumerate(ORGS):
            cur.execute(
                """
                INSERT INTO crm_account (tenant_id, business_id, external_key, name, account_type, industry, website)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, business_id, name) DO UPDATE SET website = EXCLUDED.website
                RETURNING crm_account_id
                """,
                (tenant_id, str(business_id), normalize_key(org["name"]), org["name"], org["account_type"], org["type"], org["website"]),
            )
            account_id = str(cur.fetchone()["crm_account_id"])
            org_ids[org["name"]] = account_id
            cur.execute(
                """
                INSERT INTO crm_contact (tenant_id, business_id, crm_account_id, full_name, email, phone, title)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING crm_contact_id
                """,
                (
                    tenant_id,
                    str(business_id),
                    account_id,
                    f"{['Megan','Robert','Cynthia','Steven','Laura','Derek','Angela','Martin','Rosa','Kevin','Janice','Victor'][idx]} {['Cole','Nunez','Baker','Phelps','Moreno','Grant','Ellis','Diaz','Vega','Ross','Foster','Mendez'][idx]}",
                    f"contact{idx+1}@novendor-local.org",
                    org["phone"],
                    "Community contact",
                ),
            )
            owner_contact_id = str(cur.fetchone()["crm_contact_id"])
            org_contact_ids.append(owner_contact_id)
            cur.execute(
                """
                INSERT INTO nv_organization_profile (
                  crm_account_id, env_id, business_id, organization_name, organization_type,
                  phone, city, state, relationship_type, partner_status, notes, owner_contact_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    account_id, env_id, str(business_id), org["name"], org["type"], org["phone"], org["city"], org["state"],
                    org["relationship"], org["status"], f"Seeded local partner profile for {org['name']}.", owner_contact_id,
                ),
            )
            counts["organizations_seeded"] += 1

        venue_ids: dict[str, str] = {}
        for venue in VENUES:
            cur.execute(
                """
                INSERT INTO nv_venue (
                  env_id, business_id, organization_account_id, venue_name, address, city, state, zip,
                  website, contact_name, contact_email, contact_phone, capacity_min, capacity_max,
                  wifi_quality, av_available, parking_notes, accessibility_notes, hourly_cost,
                  deposit_required, preferred_for_event_type, venue_status, is_preferred, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id, str(business_id), org_ids[venue["org"]], venue["venue_name"], venue["address"], venue["city"], venue["state"], venue["zip"],
                    f"https://{normalize_key(venue['venue_name'])}.local", venue["venue_name"].split()[0] + " contact", f"{normalize_key(venue['venue_name'])}@venues.local",
                    "561-555-2000", venue["capacity_min"], venue["capacity_max"], venue["wifi"], venue["av"],
                    "Public lot nearby" if venue["city"] == "West Palm Beach" else "Street parking nearby",
                    "Wheelchair accessible, good front-row visibility", str(venue["hourly"]), venue["deposit"],
                    venue["preferred_for"], venue["status"], venue["status"] == "preferred",
                    f"Best for {venue['preferred_for']} with {venue['wifi']} wifi.",
                ),
            )
            venue_ids[venue["venue_name"]] = str(cur.fetchone()["id"])
            counts["venues_seeded"] += 1

        event_ids: dict[str, str] = {}
        for event in EVENTS:
            cur.execute(
                """
                INSERT INTO nv_training_event (
                  env_id, business_id, event_name, event_series, event_type, event_status, event_date,
                  event_start_time, event_end_time, venue_id, city, target_capacity,
                  ticket_price_standard, ticket_price_early, event_theme, audience_level,
                  instructor, assistant_count, registration_link, check_in_status,
                  follow_up_sent_flag, notes, outcome_summary
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id, str(business_id), event["name"], event["series"], event["type"], event["status"], event["date"].isoformat(),
                    event["start"].isoformat(), event["end"].isoformat(), venue_ids[event["venue"]], event["city"], event["capacity"],
                    str(event["standard"]), str(event["early"]), event["theme"], event["level"], event["instructor"], event["assistants"],
                    f"https://events.novendor.co/{normalize_key(event['name'])}", event["check_in_status"], event["follow_up"],
                    f"Seeded operational note for {event['name']}", event["outcome"],
                ),
            )
            event_ids[event["name"]] = str(cur.fetchone()["id"])
            counts["events_seeded"] += 1

        campaign_ids: dict[str, str] = {}
        for campaign in CAMPAIGNS:
            cur.execute(
                """
                INSERT INTO nv_campaign (
                  env_id, business_id, campaign_name, channel, audience, launch_date, end_date,
                  budget, target_event_id, message_angle, status, leads_generated,
                  registrations_generated, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id, str(business_id), campaign["name"], campaign["channel"], campaign["audience"], campaign["launch"].isoformat(),
                    campaign["end"].isoformat(), str(campaign["budget"]), event_ids[campaign["event"]], campaign["angle"],
                    campaign["status"], campaign["leads"], campaign["regs"], f"Seeded campaign for {campaign['event']}.",
                ),
            )
            campaign_ids[campaign["name"]] = str(cur.fetchone()["id"])
            counts["campaigns_seeded"] += 1

        contact_ids: list[str] = []
        for idx in range(64):
            first = FIRST_NAMES[idx % len(FIRST_NAMES)]
            last = LAST_NAMES[(idx * 3) % len(LAST_NAMES)]
            full_name = f"{first} {last}"
            persona, segment, interest, priority = PERSONAS[idx % len(PERSONAS)]
            city = CITIES[idx % len(CITIES)]
            tags = _choose_tag(idx)
            org_id = None
            company_text = None
            if persona in {"partner / referral source", "small business owner", "real estate professional"}:
                org_pick = ORGS[idx % len(ORGS)]["name"]
                org_id = org_ids[org_pick] if persona == "partner / referral source" else None
                if persona != "partner / referral source":
                    company_text = [
                        "Palm Beach Home Concierge", "Lake Ave Bookkeeping", "Sunset Realty Desk",
                        "Coastal Closings", "Neighborhood Travel Club", "Lucerne Wellness Studio",
                    ][idx % 6]
            cur.execute(
                """
                INSERT INTO crm_contact (
                  tenant_id, business_id, crm_account_id, first_name, last_name, full_name, email, phone, title
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING crm_contact_id
                """,
                (
                    tenant_id,
                    str(business_id),
                    org_id,
                    first,
                    last,
                    full_name,
                    f"{normalize_key(first)}.{normalize_key(last)}{idx+1}@example.com",
                    f"561-555-{3000 + idx:04d}",
                    "Community member" if not company_text else "Owner",
                ),
            )
            contact_id = str(cur.fetchone()["crm_contact_id"])
            contact_ids.append(contact_id)
            cur.execute(
                """
                INSERT INTO nv_contact_profile (
                  crm_contact_id, env_id, business_id, preferred_contact_method, city, age_band,
                  persona_type, audience_segment, business_owner_flag, company_name_text, notes,
                  lead_source, status, consent_to_email, interest_area, follow_up_priority, tags
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    contact_id,
                    env_id,
                    str(business_id),
                    CONTACT_METHODS[idx % len(CONTACT_METHODS)],
                    city,
                    ["45-54", "55-64", "65-74", "75+"][idx % 4],
                    persona,
                    segment,
                    persona in {"small business owner", "real estate professional"},
                    company_text,
                    f"Prefers plain-English examples. Interested in {interest.lower()}.",
                    LEAD_SOURCES[idx % len(LEAD_SOURCES)],
                    STATUSES[idx % len(STATUSES)],
                    idx % 5 != 0,
                    interest,
                    priority,
                    tags,
                ),
            )
            counts["contacts_seeded"] += 1

        registration_rows: list[tuple[str, str, dict[str, Any]]] = []
        event_rotation = [EVENTS[0], EVENTS[1], EVENTS[2], EVENTS[3], EVENTS[4]]
        for idx, contact_id in enumerate(contact_ids[:28]):
            event = event_rotation[idx % len(event_rotation)]
            event_id = event_ids[event["name"]]
            attended = event["status"] == "completed" and idx % 4 != 0
            checked_time = datetime.combine(event["date"], event["start"], tzinfo=timezone.utc) + timedelta(minutes=5 + idx)
            price = event["early"] if idx % 3 == 0 else event["standard"]
            cur.execute(
                """
                INSERT INTO nv_event_registration (
                  env_id, business_id, event_id, crm_contact_id, registration_date, ticket_type,
                  price_paid, payment_status, attended_flag, checked_in_time, source_channel,
                  referral_source, follow_up_status, feedback_score, feedback_notes, walk_in_flag
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    env_id,
                    str(business_id),
                    event_id,
                    contact_id,
                    datetime.combine(event["date"] - timedelta(days=7 + (idx % 5)), time(12, 0), tzinfo=timezone.utc).isoformat(),
                    "early bird" if idx % 3 == 0 else "standard",
                    str(price),
                    "paid" if idx % 7 != 0 else "pending",
                    attended,
                    checked_time.isoformat() if attended else None,
                    ["facebook", "word of mouth", "local partners", "eventbrite", "flyer"][idx % 5],
                    ["library", "friend", "facebook group", "chamber", "senior center"][idx % 5],
                    "done" if attended else ("queued" if event["status"] == "completed" else "not_started"),
                    5 - (idx % 2) if attended else None,
                    "Stayed after class to ask about phone prompts." if attended and idx % 5 == 0 else None,
                    idx % 11 == 0,
                ),
            )
            registration_rows.append((cur.fetchone()["id"], contact_id, event))
            counts["registrations_seeded"] += 1

        for event_name, event_id in event_ids.items():
            _refresh_event_counts(cur, event_id)

        for contact_id in contact_ids:
            _refresh_contact_attendance(cur, contact_id)

        for idx, (registration_id, contact_id, event) in enumerate(registration_rows[:12]):
            if event["status"] != "completed":
                continue
            event_id = event_ids[event["name"]]
            cur.execute(
                """
                INSERT INTO nv_event_feedback (
                  env_id, business_id, event_id, crm_contact_id, rating,
                  what_they_found_useful, what_was_confusing, would_attend_again,
                  would_bring_friend, testimonial_permission, testimonial_text
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (event_id, crm_contact_id) DO NOTHING
                """,
                (
                    env_id,
                    str(business_id),
                    event_id,
                    contact_id,
                    5 if idx % 3 else 4,
                    [
                        "Seeing real examples for travel, recipes, and family photos.",
                        "Step-by-step prompts I can reuse at home.",
                        "Understanding what AI can and cannot do safely.",
                    ][idx % 3],
                    [
                        "I still need help switching between apps on my phone.",
                        "Would like a slower section on copy/paste.",
                        "Need a printed cheat sheet for prompts.",
                    ][idx % 3],
                    True,
                    idx % 4 != 0,
                    idx % 2 == 0,
                    [
                        "This was the first AI class that actually felt approachable.",
                        "I came in nervous and left feeling like I can practice at home.",
                        "Very clear, very patient, and useful right away.",
                    ][idx % 3] if idx % 2 == 0 else None,
                ),
            )
            counts["feedback_seeded"] += 1

        activity_types = [
            "dm sent", "email sent", "call made", "flyer drop", "partnership outreach",
            "follow-up sent", "invite sent", "reminder sent", "testimonial requested",
        ]
        activity_channels = ["facebook", "email", "phone", "in_person", "local partners"]
        for idx in range(82):
            activity_type = activity_types[idx % len(activity_types)]
            contact_id = contact_ids[idx % len(contact_ids)] if idx % 5 != 0 else None
            org_name = ORGS[idx % len(ORGS)]["name"] if idx % 3 == 0 else None
            account_id = org_ids.get(org_name) if org_name else None
            event = EVENTS[idx % len(EVENTS)]
            event_id = event_ids[event["name"]]
            campaign_id = campaign_ids[CAMPAIGNS[idx % len(CAMPAIGNS)]["name"]]
            activity_at = datetime.combine(BASE_DATE - timedelta(days=idx % 36), time(9 + (idx % 8), 15), tzinfo=timezone.utc)
            crm_activity_id = None
            if contact_id or account_id:
                cur.execute(
                    """
                    INSERT INTO crm_activity (
                      tenant_id, business_id, crm_account_id, crm_contact_id, activity_type,
                      subject, activity_at, payload_json
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, '{}'::jsonb)
                    RETURNING crm_activity_id
                    """,
                    (
                        tenant_id,
                        str(business_id),
                        account_id,
                        contact_id,
                        "meeting" if activity_type in {"call made", "partnership outreach"} else "email",
                        _activity_subject(activity_type, event["name"]),
                        activity_at.isoformat(),
                    ),
                )
                crm_activity_id = str(cur.fetchone()["crm_activity_id"])
            cur.execute(
                """
                INSERT INTO nv_training_outreach_activity (
                  crm_activity_id, env_id, business_id, activity_type, crm_contact_id, crm_account_id,
                  event_id, campaign_id, owner, activity_date, channel, subject, message_summary,
                  outcome, next_step, due_date, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    crm_activity_id,
                    env_id,
                    str(business_id),
                    activity_type,
                    contact_id,
                    account_id,
                    event_id,
                    campaign_id,
                    OWNER_NAME,
                    activity_at.isoformat(),
                    activity_channels[idx % len(activity_channels)],
                    _activity_subject(activity_type, event["name"]),
                    f"Seeded {activity_type} touch tied to {event['name']}.",
                    ["positive response", "no reply yet", "asked for details", "left voicemail", "pending"][idx % 5],
                    ["send reminder", "schedule call", "drop flyer", "confirm venue details", "add to nurture"][idx % 5],
                    (BASE_DATE + timedelta(days=idx % 12)).isoformat(),
                    "done" if idx % 4 != 0 else "open",
                ),
            )
            counts["activities_seeded"] += 1

        task_templates = [
            ("Confirm Wi-Fi details", "venue", "high"),
            ("Post reminder to Facebook groups", "campaign", "medium"),
            ("Call no-show attendees", "event", "high"),
            ("Request testimonial from top attendees", "event", "medium"),
            ("Drop flyers at partner locations", "campaign", "medium"),
            ("Check Eventbrite reconciliation", "event", "high"),
            ("Review venue cost comparison", "venue", "medium"),
            ("Send chamber follow-up", "organization", "medium"),
        ]
        related_map = {
            "venue": list(venue_ids.values()),
            "campaign": list(campaign_ids.values()),
            "event": list(event_ids.values()),
            "organization": list(org_ids.values()),
        }
        for idx in range(32):
            name, entity_type, priority = task_templates[idx % len(task_templates)]
            cur.execute(
                """
                INSERT INTO nv_task (
                  env_id, business_id, task_name, related_entity_type, related_entity_id,
                  assigned_to, priority, due_date, status, mobile_quick_action_flag, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    env_id,
                    str(business_id),
                    f"{name} #{idx + 1}",
                    entity_type,
                    related_map[entity_type][idx % len(related_map[entity_type])],
                    OWNER_NAME,
                    priority,
                    (BASE_DATE + timedelta(days=(idx % 10) - 2)).isoformat(),
                    "done" if idx % 6 == 0 else ("in_progress" if idx % 5 == 0 else "open"),
                    idx % 3 != 0,
                    "Seeded checklist task for live event operations.",
                ),
            )
            counts["tasks_seeded"] += 1

    return {"status": "seeded", **counts}


def _rows(cur, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
    cur.execute(sql, params)
    return [dict(row) for row in cur.fetchall()]


def get_workspace(*, env_id: str, business_id: UUID) -> dict[str, Any]:
    with get_cursor() as cur:
        contacts = _rows(cur, """
            SELECT c.crm_contact_id, c.first_name, c.last_name, c.full_name, c.email, c.phone,
                   c.title, c.crm_account_id, a.name AS organization_name,
                   p.preferred_contact_method, p.city, p.age_band, p.persona_type, p.audience_segment,
                   p.business_owner_flag, p.company_name_text, p.notes, p.lead_source, p.status,
                   p.consent_to_email, p.first_event_attended_id, p.total_events_attended,
                   p.interest_area, p.follow_up_priority, p.tags, c.created_at, p.updated_at
            FROM crm_contact c
            JOIN nv_contact_profile p ON p.crm_contact_id = c.crm_contact_id
            LEFT JOIN crm_account a ON a.crm_account_id = c.crm_account_id
            WHERE p.env_id = %s AND p.business_id = %s
            ORDER BY c.created_at DESC, c.full_name ASC
        """, (env_id, str(business_id)))

        organizations = _rows(cur, """
            SELECT o.crm_account_id, o.organization_name, o.organization_type, a.website, o.phone,
                   o.city, o.state, o.relationship_type, o.partner_status, o.notes, o.owner_contact_id,
                   c.full_name AS owner_contact_name, c.email AS owner_contact_email
            FROM nv_organization_profile o
            JOIN crm_account a ON a.crm_account_id = o.crm_account_id
            LEFT JOIN crm_contact c ON c.crm_contact_id = o.owner_contact_id
            WHERE o.env_id = %s AND o.business_id = %s
            ORDER BY o.organization_type, o.organization_name
        """, (env_id, str(business_id)))

        venues = _rows(cur, """
            SELECT v.id, v.organization_account_id AS linked_organization_id, v.venue_name, v.address,
                   v.city, v.state, v.zip, v.website, v.contact_name, v.contact_email, v.contact_phone,
                   v.capacity_min, v.capacity_max, v.wifi_quality, v.av_available, v.parking_notes,
                   v.accessibility_notes, v.hourly_cost, v.deposit_required, v.preferred_for_event_type,
                   v.venue_status, v.is_preferred, v.notes, o.organization_name AS linked_organization_name
            FROM nv_venue v
            LEFT JOIN nv_organization_profile o ON o.crm_account_id = v.organization_account_id
            WHERE v.env_id = %s AND v.business_id = %s
            ORDER BY v.is_preferred DESC, v.venue_status, v.city, v.venue_name
        """, (env_id, str(business_id)))

        events = _rows(cur, """
            SELECT e.id, e.event_name, e.event_series, e.event_type, e.event_status, e.event_date,
                   e.event_start_time, e.event_end_time, e.venue_id, e.city, e.target_capacity,
                   e.actual_registrations, e.actual_attendance, e.ticket_price_standard,
                   e.ticket_price_early, e.event_theme, e.audience_level, e.instructor,
                   e.assistant_count, e.registration_link, e.check_in_status, e.follow_up_sent_flag,
                   e.notes, e.outcome_summary, v.venue_name
            FROM nv_training_event e
            LEFT JOIN nv_venue v ON v.id = e.venue_id
            WHERE e.env_id = %s AND e.business_id = %s
            ORDER BY e.event_date ASC
        """, (env_id, str(business_id)))

        registrations = _rows(cur, """
            SELECT r.id AS registration_id, r.event_id, r.crm_contact_id AS contact_id,
                   r.registration_date, r.ticket_type, r.price_paid, r.payment_status,
                   r.attended_flag, r.checked_in_time, r.source_channel, r.referral_source,
                   r.follow_up_status, r.feedback_score, r.feedback_notes, r.walk_in_flag,
                   c.full_name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
                   e.event_name
            FROM nv_event_registration r
            JOIN crm_contact c ON c.crm_contact_id = r.crm_contact_id
            JOIN nv_training_event e ON e.id = r.event_id
            WHERE r.env_id = %s AND r.business_id = %s
            ORDER BY e.event_date DESC, c.full_name ASC
        """, (env_id, str(business_id)))

        campaigns = _rows(cur, """
            SELECT c.id, c.campaign_name, c.channel, c.audience, c.launch_date, c.end_date,
                   c.budget, c.target_event_id, c.message_angle, c.status,
                   c.leads_generated, c.registrations_generated, c.notes,
                   e.event_name AS target_event_name
            FROM nv_campaign c
            LEFT JOIN nv_training_event e ON e.id = c.target_event_id
            WHERE c.env_id = %s AND c.business_id = %s
            ORDER BY c.launch_date DESC NULLS LAST, c.campaign_name
        """, (env_id, str(business_id)))

        activities = _rows(cur, """
            SELECT a.id, a.activity_type, a.crm_contact_id AS contact_id, a.crm_account_id AS organization_id,
                   a.event_id, a.campaign_id, a.owner, a.activity_date, a.channel, a.subject,
                   a.message_summary, a.outcome, a.next_step, a.due_date, a.status,
                   c.full_name AS contact_name,
                   o.organization_name,
                   e.event_name,
                   cam.campaign_name
            FROM nv_training_outreach_activity a
            LEFT JOIN crm_contact c ON c.crm_contact_id = a.crm_contact_id
            LEFT JOIN nv_organization_profile o ON o.crm_account_id = a.crm_account_id
            LEFT JOIN nv_training_event e ON e.id = a.event_id
            LEFT JOIN nv_campaign cam ON cam.id = a.campaign_id
            WHERE a.env_id = %s AND a.business_id = %s
            ORDER BY a.activity_date DESC
        """, (env_id, str(business_id)))

        tasks = _rows(cur, """
            SELECT id, task_name, related_entity_type, related_entity_id, assigned_to,
                   priority, due_date, status, mobile_quick_action_flag, notes,
                   created_at, updated_at
            FROM nv_task
            WHERE env_id = %s AND business_id = %s
            ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                     due_date ASC NULLS LAST, created_at DESC
        """, (env_id, str(business_id)))

        feedback = _rows(cur, """
            SELECT f.id, f.event_id, f.crm_contact_id AS contact_id, f.rating,
                   f.what_they_found_useful, f.what_was_confusing, f.would_attend_again,
                   f.would_bring_friend, f.testimonial_permission, f.testimonial_text,
                   c.full_name AS contact_name, e.event_name
            FROM nv_event_feedback f
            JOIN crm_contact c ON c.crm_contact_id = f.crm_contact_id
            JOIN nv_training_event e ON e.id = f.event_id
            WHERE f.env_id = %s AND f.business_id = %s
            ORDER BY f.created_at DESC
        """, (env_id, str(business_id)))

    by_event_regs: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in registrations:
        by_event_regs[row["event_id"]].append(row)

    next_event = next((event for event in events if event["event_date"] >= BASE_DATE.isoformat()), None)
    today_tasks = [task for task in tasks if task["status"] != "done" and task.get("due_date") and task["due_date"] <= BASE_DATE.isoformat()]
    outstanding_followups = [reg for reg in registrations if reg.get("follow_up_status") in {"queued", "not_started"}]
    recent_regs = sorted(registrations, key=lambda row: row["registration_date"], reverse=True)[:5]
    recent_activity = activities[:8]
    contacts_added_month = sum(1 for contact in contacts if str(contact["created_at"])[:7] == BASE_DATE.strftime("%Y-%m"))

    venue_status_counts = Counter(venue["venue_status"] for venue in venues)
    partner_status_counts = Counter(org["partner_status"] for org in organizations)
    campaign_performance = [
        {
            "campaign_name": row["campaign_name"],
            "channel": row["channel"],
            "target_event_name": row.get("target_event_name"),
            "leads_generated": row["leads_generated"],
            "registrations_generated": row["registrations_generated"],
            "cost_per_registration": float(row["budget"] / row["registrations_generated"]) if row.get("budget") is not None and row.get("registrations_generated") else None,
        }
        for row in campaigns
    ]
    event_performance = []
    for event in events:
        regs = by_event_regs.get(event["id"], [])
        repeat_attendance = sum(1 for reg in regs for contact in contacts if contact["crm_contact_id"] == reg["contact_id"] and contact["total_events_attended"] > 1)
        avg_feedback = None
        scores = [f["rating"] for f in feedback if f["event_id"] == event["id"] and f.get("rating") is not None]
        if scores:
            avg_feedback = round(sum(scores) / len(scores), 2)
        event_performance.append({
            "event_id": event["id"],
            "event_name": event["event_name"],
            "registrations": event["actual_registrations"],
            "attendance": event["actual_attendance"],
            "capacity_utilization": round((event["actual_registrations"] / event["target_capacity"]) * 100, 1) if event.get("target_capacity") else None,
            "price_mix": {
                "early_bird": sum(1 for reg in regs if reg.get("ticket_type") == "early bird"),
                "standard": sum(1 for reg in regs if reg.get("ticket_type") != "early bird"),
            },
            "repeat_attendance": repeat_attendance,
            "feedback_score": avg_feedback,
            "channel_conversion": dict(Counter(reg.get("source_channel") or "unknown" for reg in regs)),
        })

    duplicate_emails = [email for email, count in Counter(contact.get("email") for contact in contacts if contact.get("email")).items() if count > 1]
    orphan_registrations = [reg for reg in registrations if not any(event["id"] == reg["event_id"] for event in events)]
    bad_statuses = [task for task in tasks if task["status"] not in {"open", "in_progress", "done"}]
    mobile_issues = [
        "Legacy consulting shell only exposed a desktop sidebar before this training CRM module.",
        "Pipeline/outreach views were optimized for broader consulting workflows, not event-day phone usage.",
        "No existing phone-first check-in, walk-in capture, or quick-complete task flow existed for local events.",
    ]

    return {
        "inventory": {
            "existing_objects": [
                {"object": "crm_account", "purpose": "generic organizations/accounts", "usable_as_is": True, "action": "keep + extend"},
                {"object": "crm_contact", "purpose": "canonical contacts", "usable_as_is": True, "action": "keep + extend"},
                {"object": "crm_activity", "purpose": "generic activity timeline", "usable_as_is": True, "action": "keep + extend"},
                {"object": "crm_pipeline_stage / crm_opportunity", "purpose": "generic sales pipeline", "usable_as_is": "partial", "action": "keep for generic CRM, not as event system"},
                {"object": "cro_outreach_log / templates", "purpose": "consulting outreach tracking", "usable_as_is": "partial", "action": "keep for consulting surface, add event-focused activity model"},
                {"object": "cro_client / cro_engagement / revenue", "purpose": "client delivery + revenue", "usable_as_is": False, "action": "deprecate for this use case"},
                {"object": "nv_loop", "purpose": "loop intelligence", "usable_as_is": False, "action": "keep separate"},
            ],
            "duplicates_or_overlaps": [
                "Organizations overlap conceptually with crm_account, so organization profiles extend accounts instead of creating a second account master.",
                "Outreach touches overlap conceptually with crm_activity, so each training activity can optionally map back to a crm_activity receipt.",
            ],
            "missing_relationships_before_build": [
                "No event-to-contact registration model existed.",
                "No venue entity or venue-to-organization link existed.",
                "No event-focused campaign attribution or attendee feedback entity existed.",
                "No phone-optimized task or day-of check-in workflow existed.",
            ],
            "mobile_problems_before_build": mobile_issues,
        },
        "architecture": {
            "contacts": "crm_contact + nv_contact_profile",
            "organizations": "crm_account + nv_organization_profile",
            "venues": "nv_venue linked to organization account",
            "events": "nv_training_event linked to venue",
            "registrations": "nv_event_registration linked to event + contact",
            "campaigns": "nv_campaign linked to target event",
            "activities": "nv_training_outreach_activity with optional crm_activity receipt",
            "tasks": "nv_task for mobile quick actions",
            "feedback": "nv_event_feedback linked to event + contact",
        },
        "summary": {
            "next_event": next_event,
            "contacts_added_this_month": contacts_added_month,
            "followups_due": len(outstanding_followups),
            "venue_outreach_status": dict(venue_status_counts),
            "partner_status": dict(partner_status_counts),
            "recent_activity": recent_activity,
            "campaign_performance": campaign_performance,
            "mobile_dashboard": {
                "today_tasks": today_tasks[:6],
                "next_event": next_event,
                "outstanding_followups": outstanding_followups[:8],
                "recent_registrations": recent_regs,
                "check_in_shortcut_event_id": next_event["id"] if next_event else None,
            },
        },
        "reports": {
            "event_performance": event_performance,
            "partnership_pipeline": {
                "active_venue_conversations": [venue for venue in venues if venue["venue_status"] in {"contacted", "qualified", "preferred"}],
                "preferred_venues": [venue for venue in venues if venue["is_preferred"]],
                "cost_comparison": [
                    {"venue_name": venue["venue_name"], "city": venue["city"], "hourly_cost": venue["hourly_cost"], "capacity_max": venue["capacity_max"]}
                    for venue in venues
                ],
                "next_touch_needed": [activity for activity in activities if activity["status"] == "open"][:10],
            },
        },
        "qa": {
            "orphan_records": len(orphan_registrations),
            "duplicate_contact_emails": duplicate_emails,
            "impossible_status_rows": len(bad_statuses),
            "registration_count_matches_events": all(
                event["actual_registrations"] == len(by_event_regs.get(event["id"], [])) for event in events
            ),
        },
        "seed_summary": {
            "contacts": len(contacts),
            "organizations": len(organizations),
            "venues": len(venues),
            "events": len(events),
            "campaigns": len(campaigns),
            "activities": len(activities),
            "tasks": len(tasks),
            "registrations": len(registrations),
            "feedback": len(feedback),
        },
        "contacts": contacts,
        "organizations": organizations,
        "venues": venues,
        "events": events,
        "registrations": registrations,
        "campaigns": campaigns,
        "activities": activities,
        "tasks": tasks,
        "feedback": feedback,
    }


def create_contact(*, env_id: str, business_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        org_id = payload.get("organization_account_id")
        cur.execute(
            """
            INSERT INTO crm_contact (
              tenant_id, business_id, crm_account_id, first_name, last_name, full_name, email, phone, title
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING crm_contact_id
            """,
            (
                tenant_id, str(business_id), org_id,
                payload.get("first_name"), payload.get("last_name"), payload.get("full_name"),
                payload.get("email"), payload.get("phone"), payload.get("title") or "Lead",
            ),
        )
        contact_id = str(cur.fetchone()["crm_contact_id"])
        cur.execute(
            """
            INSERT INTO nv_contact_profile (
              crm_contact_id, env_id, business_id, preferred_contact_method, city, age_band,
              persona_type, audience_segment, business_owner_flag, company_name_text, notes,
              lead_source, status, consent_to_email, interest_area, follow_up_priority, tags
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                contact_id, env_id, str(business_id), payload.get("preferred_contact_method"), payload.get("city"), payload.get("age_band"),
                payload.get("persona_type"), payload.get("audience_segment"), bool(payload.get("business_owner_flag")), payload.get("company_name_text"),
                payload.get("notes"), payload.get("lead_source"), payload.get("status") or "new", bool(payload.get("consent_to_email")),
                payload.get("interest_area"), payload.get("follow_up_priority") or "medium", payload.get("tags") or [],
            ),
        )
    return {"crm_contact_id": contact_id, **payload}


def create_event(*, env_id: str, business_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_training_event (
              env_id, business_id, event_name, event_series, event_type, event_status, event_date,
              event_start_time, event_end_time, venue_id, city, target_capacity,
              ticket_price_standard, ticket_price_early, event_theme, audience_level,
              instructor, assistant_count, registration_link, notes, outcome_summary
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                env_id, str(business_id), payload["event_name"], payload.get("event_series"), payload.get("event_type") or "intro class",
                payload.get("event_status") or "scheduled", payload["event_date"], payload.get("event_start_time"), payload.get("event_end_time"),
                payload.get("venue_id"), payload.get("city"), payload.get("target_capacity"), payload.get("ticket_price_standard"), payload.get("ticket_price_early"),
                payload.get("event_theme"), payload.get("audience_level"), payload.get("instructor") or INSTRUCTOR_NAME,
                payload.get("assistant_count") or 1, payload.get("registration_link"), payload.get("notes"), payload.get("outcome_summary"),
            ),
        )
        event_id = str(cur.fetchone()["id"])
        if payload.get("campaign_id"):
            cur.execute("UPDATE nv_campaign SET target_event_id = %s, updated_at = now() WHERE id = %s", (event_id, payload["campaign_id"]))
        task_templates = [
            "Confirm venue and Wi-Fi",
            "Publish launch post",
            "Send reminder email",
            "Build post-event follow-up queue",
        ]
        for name in task_templates:
            cur.execute(
                """
                INSERT INTO nv_task (
                  env_id, business_id, task_name, related_entity_type, related_entity_id,
                  assigned_to, priority, due_date, status, mobile_quick_action_flag, notes
                ) VALUES (%s, %s, %s, 'event', %s, %s, %s, %s, 'open', true, %s)
                """,
                (
                    env_id, str(business_id), f"{name} — {payload['event_name']}", event_id, OWNER_NAME,
                    "high" if name.startswith("Confirm") else "medium", payload["event_date"],
                    "Auto-created from event planner workflow.",
                ),
            )
    return {"id": event_id, **payload}


def create_activity(*, env_id: str, business_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    with get_cursor() as cur:
        tenant_id = resolve_tenant_id(cur, business_id)
        crm_activity_id = None
        if payload.get("contact_id") or payload.get("organization_id"):
            cur.execute(
                """
                INSERT INTO crm_activity (
                  tenant_id, business_id, crm_account_id, crm_contact_id, activity_type, subject, activity_at, payload_json
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, '{}'::jsonb)
                RETURNING crm_activity_id
                """,
                (
                    tenant_id, str(business_id), payload.get("organization_id"), payload.get("contact_id"),
                    "meeting" if payload.get("channel") in {"phone", "in_person"} else "email",
                    payload.get("subject") or payload.get("activity_type"), payload.get("activity_date") or datetime.now(timezone.utc).isoformat(),
                ),
            )
            crm_activity_id = str(cur.fetchone()["crm_activity_id"])
        cur.execute(
            """
            INSERT INTO nv_training_outreach_activity (
              crm_activity_id, env_id, business_id, activity_type, crm_contact_id, crm_account_id,
              event_id, campaign_id, owner, activity_date, channel, subject, message_summary,
              outcome, next_step, due_date, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, COALESCE(%s, now()), %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                crm_activity_id, env_id, str(business_id), payload["activity_type"], payload.get("contact_id"), payload.get("organization_id"),
                payload.get("event_id"), payload.get("campaign_id"), payload.get("owner") or OWNER_NAME, payload.get("activity_date"),
                payload.get("channel"), payload.get("subject"), payload.get("message_summary"), payload.get("outcome"), payload.get("next_step"),
                payload.get("due_date"), payload.get("status") or "open",
            ),
        )
        activity_id = str(cur.fetchone()["id"])
    return {"id": activity_id, **payload}


def create_registration(*, env_id: str, business_id: UUID, payload: dict[str, Any]) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            INSERT INTO nv_event_registration (
              env_id, business_id, event_id, crm_contact_id, registration_date, ticket_type,
              price_paid, payment_status, attended_flag, checked_in_time, source_channel,
              referral_source, follow_up_status, feedback_score, feedback_notes, walk_in_flag
            ) VALUES (%s, %s, %s, %s, COALESCE(%s, now()), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (event_id, crm_contact_id) DO UPDATE SET
              ticket_type = EXCLUDED.ticket_type,
              price_paid = EXCLUDED.price_paid,
              payment_status = EXCLUDED.payment_status,
              attended_flag = EXCLUDED.attended_flag,
              checked_in_time = EXCLUDED.checked_in_time,
              source_channel = EXCLUDED.source_channel,
              referral_source = EXCLUDED.referral_source,
              follow_up_status = EXCLUDED.follow_up_status,
              feedback_score = EXCLUDED.feedback_score,
              feedback_notes = EXCLUDED.feedback_notes,
              walk_in_flag = EXCLUDED.walk_in_flag,
              updated_at = now()
            RETURNING id
            """,
            (
                env_id, str(business_id), payload["event_id"], payload["contact_id"], payload.get("registration_date"), payload.get("ticket_type"),
                payload.get("price_paid"), payload.get("payment_status") or "paid", bool(payload.get("attended_flag")), payload.get("checked_in_time"),
                payload.get("source_channel"), payload.get("referral_source"), payload.get("follow_up_status") or "queued",
                payload.get("feedback_score"), payload.get("feedback_notes"), bool(payload.get("walk_in_flag")),
            ),
        )
        registration_id = str(cur.fetchone()["id"])
        _refresh_event_counts(cur, payload["event_id"])
        _refresh_contact_attendance(cur, payload["contact_id"])
    return {"id": registration_id, **payload}


def check_in_registration(*, registration_id: UUID, attended_flag: bool = True) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_event_registration
            SET attended_flag = %s,
                checked_in_time = CASE WHEN %s THEN now() ELSE NULL END,
                updated_at = now(),
                follow_up_status = CASE WHEN %s THEN 'queued' ELSE follow_up_status END
            WHERE id = %s
            RETURNING event_id, crm_contact_id, attended_flag, checked_in_time
            """,
            (attended_flag, attended_flag, attended_flag, str(registration_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Registration {registration_id} not found")
        _refresh_event_counts(cur, str(row["event_id"]))
        _refresh_contact_attendance(cur, str(row["crm_contact_id"]))
    return dict(row)


def toggle_task(*, task_id: UUID, status: str) -> dict[str, Any]:
    with get_cursor() as cur:
        cur.execute(
            """
            UPDATE nv_task
            SET status = %s, updated_at = now()
            WHERE id = %s
            RETURNING id, status
            """,
            (status, str(task_id)),
        )
        row = cur.fetchone()
        if not row:
            raise LookupError(f"Task {task_id} not found")
    return dict(row)
