#!/usr/bin/env python3
"""Seed demo documents into the RAG pipeline for demonstration.

Usage:
    python -m scripts.seed_rag_demo

This script:
1. Creates sample RE investment documents (IC memo, operating agreement)
2. Indexes them into pgvector via the RAG pipeline
3. Runs a test similarity search to verify retrieval quality
"""
from __future__ import annotations

import os
import sys
import uuid

# Allow running from backend/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("_BM_SKIP_DB_CHECK", "1")

from dotenv import load_dotenv

load_dotenv()


# ── Sample Documents ─────────────────────────────────────────────────────

SAMPLE_IC_MEMO = """
INVESTMENT COMMITTEE MEMO — MERIDIAN VALUE FUND III

Date: January 15, 2026
Prepared by: Paul Malmquist, Portfolio Manager

EXECUTIVE SUMMARY
Meridian Value Fund III is a $450M closed-end real estate private equity fund
targeting value-add multifamily and mixed-use assets in secondary markets.
The fund has a target net IRR of 14-16% and a target equity multiple (TVPI) of 1.8x.

INVESTMENT THESIS
- Secondary market multifamily properties are mispriced relative to gateway markets
- Value-add repositioning (amenity upgrades, unit renovations) drives 15-25% rent growth
- Current cap rates of 5.5-6.5% provide attractive entry points vs. replacement cost

PORTFOLIO COMPOSITION
Fund III currently holds 12 assets across 8 markets:
- Total gross asset value: $620M
- Weighted average occupancy: 94.2%
- Weighted average DSCR: 1.45x
- NOI growth YoY: 8.3%

KEY RISKS
1. Interest rate environment: 40% of debt is floating rate, hedged with caps
2. Construction cost inflation: Renovation budgets have increased 12% vs. underwriting
3. Insurance costs: Property insurance premiums up 22% in FL and TX markets
4. Lease-up risk: Two recent acquisitions below stabilized occupancy (82% and 87%)

WATERFALL TERMS
- Preferred return: 8% (compounded annually)
- GP catch-up: 50/50 until GP receives 20% of total profits
- Carried interest split: 80/20 (LP/GP) above preferred return
- Clawback: Full clawback provision with personal guarantee from GP principals

EXIT STRATEGY
Target hold period: 3-5 years per asset
Expected disposition cap rates: 5.0-6.0% (25-50bp compression from entry)
Fund-level target DPI at maturity: 1.6x

FEES
Management fee: 1.5% of committed capital (investment period), 1.0% of invested capital (harvest)
Acquisition fee: 1.0% of gross purchase price
Disposition fee: 0.5% of gross sale price
"""

SAMPLE_OPERATING_AGREEMENT = """
OPERATING AGREEMENT — MERIDIAN VALUE FUND III, LP

ARTICLE 1: DEFINITIONS
1.1 "Capital Commitment" means the total amount each Limited Partner has agreed to contribute.
1.2 "Carried Interest" means 20% of net profits above the Preferred Return.
1.3 "DSCR" means Debt Service Coverage Ratio, calculated as NOI divided by total debt service.
1.4 "Hurdle Rate" means the 8% annual compounded preferred return to Limited Partners.
1.5 "TVPI" means Total Value to Paid-In Capital, calculated as (distributions + NAV) / paid-in capital.

ARTICLE 5: DISTRIBUTION WATERFALL
5.1 Return of Capital: First, 100% to LPs until cumulative distributions equal paid-in capital.
5.2 Preferred Return: Second, 100% to LPs until they have received an 8% IRR.
5.3 GP Catch-Up: Third, 50% to GP and 50% to LPs until GP has received 20% of total profits.
5.4 Carried Interest: Thereafter, 80% to LPs and 20% to GP.

ARTICLE 7: INVESTMENT RESTRICTIONS
7.1 No single asset shall exceed 25% of total fund commitments.
7.2 Maximum portfolio leverage: 65% LTV at fund level.
7.3 Geographic concentration: No more than 40% in any single state.
7.4 Minimum DSCR for any acquisition: 1.20x at underwritten NOI.

ARTICLE 9: REPORTING
9.1 Quarterly reports with NAV, IRR, TVPI, and DPI calculations.
9.2 Annual audited financial statements within 90 days of year-end.
9.3 Capital call notices with 10 business days advance notice.
"""

SAMPLE_UW_MODEL = """
UNDERWRITING MODEL — 450 MERIDIAN BOULEVARD

Property Type: Garden-style multifamily
Units: 240 units
Location: Nashville, TN (Davidson County)
Vintage: 2001, renovated 2018

ACQUISITION ASSUMPTIONS
Purchase Price: $42,000,000
Price Per Unit: $175,000
Entry Cap Rate: 5.75%
Closing Costs: 2.5% of purchase price

REVENUE ASSUMPTIONS
Current Average Rent: $1,425/unit/month
Market Rent (post-renovation): $1,650/unit/month
Rent Growth: 3.5% annually after stabilization
Vacancy & Credit Loss: 6.0%
Other Income: $125/unit/month (parking, pet fees, storage)

OPERATING EXPENSES
Property Taxes: $4,200/unit ($1,008,000 total)
Insurance: $1,800/unit ($432,000 total)
Management Fee: 3.0% of EGI
Repairs & Maintenance: $1,200/unit
Total OpEx Ratio: 42% of EGI

CAPITAL STRUCTURE
Senior Debt: $27,300,000 (65% LTV)
Interest Rate: 5.25% fixed (5-year term)
Amortization: 30 years
Annual Debt Service: $1,812,000
DSCR at Stabilization: 1.52x

Equity: $14,700,000 (35% of total capitalization)
GP Co-Invest: 5% of equity ($735,000)

RENOVATION BUDGET
Unit Interior: $18,000/unit x 180 units = $3,240,000
Common Area: $1,200,000
Exterior/Landscape: $560,000
Total CapEx: $5,000,000 ($20,833/unit)

RETURN PROJECTIONS (5-YEAR HOLD)
Exit Cap Rate: 5.25%
Exit NOI (Year 5): $3,150,000
Projected Sale Price: $60,000,000
Net IRR (levered): 15.8%
Equity Multiple (TVPI): 1.92x
DPI at Exit: 1.72x
Cash-on-Cash (stabilized): 8.4%
"""


def main():
    from app.services.rag_indexer import index_document, semantic_search

    # Use a fixed business_id for the demo
    business_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    env_id = uuid.UUID("00000000-0000-0000-0000-000000000001")

    documents = [
        {
            "name": "Meridian Value Fund III IC Memo",
            "text": SAMPLE_IC_MEMO,
            "entity_type": "fund",
            "source_filename": "Meridian_Fund_III_IC_Memo.pdf",
            "content_type_hint": "ic_memo",
            "fiscal_period": "FY2026",
        },
        {
            "name": "Meridian Value Fund III Operating Agreement",
            "text": SAMPLE_OPERATING_AGREEMENT,
            "entity_type": "fund",
            "source_filename": "Meridian_Fund_III_OA.pdf",
            "content_type_hint": "operating_agreement",
        },
        {
            "name": "450 Meridian Boulevard Underwriting Model",
            "text": SAMPLE_UW_MODEL,
            "entity_type": "asset",
            "source_filename": "450_Meridian_Blvd_UW.xlsx",
            "content_type_hint": "uw_model",
            "fiscal_period": "FY2026",
        },
    ]

    print("=== RAG Demo Seeder ===\n")

    total_chunks = 0
    for doc in documents:
        doc_id = uuid.uuid4()
        version_id = uuid.uuid4()

        chunk_count = index_document(
            document_id=doc_id,
            version_id=version_id,
            business_id=business_id,
            text=doc["text"],
            env_id=env_id,
            entity_type=doc["entity_type"],
            source_filename=doc.get("source_filename"),
            fiscal_period=doc.get("fiscal_period"),
            content_type_hint=doc.get("content_type_hint"),
        )
        total_chunks += chunk_count
        print(f"  Indexed: {doc['name']} -> {chunk_count} chunks")

    print(f"\nTotal chunks indexed: {total_chunks}")

    # ── Test Retrieval ──────────────────────────────────────────────
    test_queries = [
        "What is the target TVPI for the Meridian Value Fund?",
        "What are the waterfall terms and carried interest?",
        "What is the DSCR for 450 Meridian Boulevard?",
        "What are the key risks in the portfolio?",
    ]

    print("\n=== Test Retrieval ===\n")
    for query in test_queries:
        print(f"  Q: {query}")
        results = semantic_search(query=query, business_id=business_id, top_k=3)
        for i, chunk in enumerate(results, 1):
            print(f"    [{i}] score={chunk.score:.4f} | {chunk.chunk_text[:80].replace(chr(10), ' ')}...")
        print()

    print("Done! RAG pipeline is ready for demo.")


if __name__ == "__main__":
    main()
