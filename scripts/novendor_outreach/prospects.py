"""Seed drafts for the week of 2026-04-20 prospect push.

Each entry carries the content Paul reviewed. The `to` field is left blank by
default so Paul fills in the actual contact email before sending. `to_name`
carries the target person for context in Outlook's draft list.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class ProspectDraft:
    slug: str
    prospect_label: str  # shown in Outlook draft list
    subject: str
    to_name: str
    body: str


PROSPECT_DRAFTS: Dict[str, ProspectDraft] = {
    "electra-america": ProspectDraft(
        slug="electra-america",
        prospect_label="Electra America",
        subject="Congrats on the Head of Data hire",
        to_name="Electra America CFO",
        body=(
            "Saw Electra brought on a Head of Data. Congrats. That's a meaningful "
            "signal for any REPE shop running a Yardi and Investran stack.\n"
            "\n"
            "We've been doing short assessments for firms in your size range on "
            "where reconciliation time actually goes. The pattern is consistent. "
            "Analyst hours per quarter compound around the three-way tie between "
            "property data, the GL, and the LP pack. A new Head of Data usually "
            "gets asked to fix it inside six months, and the first version of "
            "the fix is usually a visualization layer that doesn't touch the "
            "underlying labor.\n"
            "\n"
            "If the new hire is going to be evaluating this work, there's a "
            "90-day audit we run that might be useful as a baseline. No "
            "obligation, happy to share what we learn either way.\n"
            "\n"
            "Worth 20 minutes next week?\n"
            "\n"
            "Paul Malmquist\n"
            "Novendor\n"
        ),
    ),
    "crow-holdings": ProspectDraft(
        slug="crow-holdings",
        prospect_label="Crow Holdings Capital",
        subject="Fund X close and the development spinout",
        to_name="Adam Sciara, CFO",
        body=(
            "Congrats on Fund X. $3.1B is a real moment, especially simultaneous "
            "with the Crow Holdings Development spinout.\n"
            "\n"
            "The pattern we see when a shop does both at once is a reporting "
            "seam that nobody quite owns. Development draws, budget variance, "
            "and timeline risk belong to one entity. Fund-level performance and "
            "LP reporting belong to another. Both surfaces need the same "
            "property data, presented differently, tied back to the same GL.\n"
            "\n"
            "Most firms handle this with a senior analyst who stitches the two "
            "views by hand. It works through the first quarter post-spinout. "
            "By quarter three it's a job, not a task.\n"
            "\n"
            "We've been doing short assessments for firms running dual-entity "
            "structures. If you're looking at how to instrument this cleanly "
            "before Q3 close, happy to share what we're seeing.\n"
            "\n"
            "20 minutes next week?\n"
            "\n"
            "Paul Malmquist\n"
            "Novendor\n"
        ),
    ),
    "apollo-commercial-ref": ProspectDraft(
        slug="apollo-commercial-ref",
        prospect_label="Apollo Commercial REF",
        subject="The Athene transaction and asset-level reporting",
        to_name="Anastasia Mironova, CFO",
        body=(
            "With the shareholder vote on the Athene portfolio sale on the "
            "21st, I figured this note might be timely rather than not.\n"
            "\n"
            "We work with REPE and commercial real estate credit shops on "
            "reporting integrity through portfolio transactions. The specific "
            "failure mode we've seen with $5B-plus credit portfolios in "
            "transition is that asset-level detail gets compressed into "
            "summary views for due diligence, then the post-close integration "
            "team discovers reconciliation gaps that needed to be resolved "
            "pre-close.\n"
            "\n"
            "Not pitching anything the vote depends on. Just noting that if "
            "there are open questions about asset-level reporting as the "
            "Athene transition progresses, we've seen this movie before and "
            "can share some patterns.\n"
            "\n"
            "Worth a short call after the 21st if you'd find it useful.\n"
            "\n"
            "Paul Malmquist\n"
            "Novendor\n"
        ),
    ),
    "whitestone-reit": ProspectDraft(
        slug="whitestone-reit",
        prospect_label="Whitestone REIT",
        subject="Ares diligence and the reporting stack",
        to_name="J. Scott Hogan, CFO",
        body=(
            "Congrats on the Ares deal. $19 all-cash on a 282-property "
            "portfolio is a good outcome.\n"
            "\n"
            "Most firms we've worked with in the run-up to a large platform "
            "acquirer's diligence find that their legacy reporting stack has "
            "to answer questions it wasn't designed for. Ares in particular "
            "tends to ask for cross-asset slices and lineage trails that "
            "nobody pre-builds.\n"
            "\n"
            "We've been running short engagements for REITs in your position. "
            "The goal is to get the reporting stack defensible before the "
            "Ares integration team starts asking questions, rather than "
            "scrambling in Q3. Not a full platform replacement. A bridge "
            "layer that sits on top of what you have.\n"
            "\n"
            "20 minutes next week?\n"
            "\n"
            "Paul Malmquist\n"
            "Novendor\n"
        ),
    ),
}
