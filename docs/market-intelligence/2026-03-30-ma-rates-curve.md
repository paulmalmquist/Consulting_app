# Segment Intelligence Brief: Rates & Yield Curve

**Segment ID:** ma-rates-curve
**Category:** Macro
**Tier:** 1 (Daily cadence)
**Date:** 2026-03-30
**Regime:** RISK_OFF_DEFENSIVE
**Overdue Ratio:** 1.97x

---

## Regime Context

The US rates complex is undergoing a structural shift. The yield curve has uninverted after a prolonged inversion, with the 2s10s spread at plus 51 basis points as of March 20. However, this uninversion carries a warning: it is being driven by short-end yields rising (the 2-year spiked 33 basis points in March alone) rather than long-end yields falling. The Fed held at 3.50 to 3.75 percent on March 18 with Chair Powell signaling one potential cut conditioned on inflation progress, but the bond market is now pricing in the possibility of a rate hike by late 2026. The 10-year at 4.39 percent and the 10-year TIPS real yield at 1.896 percent reflect a market demanding substantial compensation for duration and inflation risk.

---

## Signal Scores

**Policy Direction: 8 out of 10.** The Fed is at a critical inflection. The March FOMC held rates steady with an 11-1 vote, but the dot plot median still projects one cut while the market is pricing in no cuts or even a hike. This disconnect between Fed guidance and market pricing is the widest it has been since the tightening cycle began. Powell's explicit conditionality ("if we don't see progress on inflation, you won't see that rate cut") effectively makes the one projected cut a best-case scenario. The PCE revision to 2.7 percent on both headline and core, driven by tariffs and oil, suggests the conditions for that cut are unlikely to materialize soon.

**Rate Trajectory: 8 out of 10.** The rate trajectory signals are dense and directionally clear. The 1-year Treasury yield jumped 33 basis points since early March, pricing out the last sub-one-year rate cut expectation. The 2-year at 3.88 percent is approaching the lower bound of the Fed funds range (3.50 percent), meaning the market sees virtually no easing in the near term. The 10-year at 4.39 percent has climbed from 3.96 percent at end of February, a 43 basis point move in one month driven by the Iran conflict's impact on oil prices and inflation expectations. The 10-year breakeven at 2.38 percent is below trailing realized inflation of 3.3 percent, suggesting bonds are pricing in eventual disinflation but through recession rather than soft landing.

**Liquidity Conditions: 6 out of 10.** Treasury market liquidity is adequate but stressed. The government sold 606 billion dollars of Treasury securities in a single week around March 21, a massive issuance volume that tests dealer balance sheet capacity. The Fed continues purchasing bills and securities under three years, providing some support. The reverse repo facility (RRPONTSYD) drawdown has been a source of liquidity, but as it approaches exhaustion, the marginal buyer of Treasuries becomes more price-sensitive. Foreign demand (TIC flows) and Treasury auction bid-to-cover ratios are the next data points to watch.

**Cross-Asset Signal: 7 out of 10.** The rates complex is correlated with risk-off across all asset classes. Rising yields are pressuring equity valuations (SPX weakness), widening credit spreads (HY OAS at 312 basis points), compressing crypto prices (BTC down 44 percent), and strengthening the dollar. The DXY at approximately 99.5 to 100 is consistent with the higher rate differential attracting capital to US dollar assets. This cross-asset coherence confirms the RISK_OFF_DEFENSIVE regime and suggests rates are a primary transmission mechanism for the current stress.

**Cross-Vertical Relevance: 9 out of 10.** Rates are the single most important input across all Winston verticals. The 10-year Treasury at 4.39 percent directly sets the floor for REPE cap rates, mortgage rates (MORTGAGE30US), construction financing costs (PDS), and consumer credit benchmark rates. The 30-year mortgage rate, correlated with the 10-year, directly impacts housing starts (HOUST) and home price indices (CSUSHPINSA). Every 25 basis point move in the 10-year reprices billions in real estate value and changes the credit decisioning engine's benchmark assumptions.

**Composite Score: 7.7 out of 10** (weighted: policy 0.25 times 8 plus trajectory 0.20 times 8 plus liquidity 0.20 times 6 plus cross-asset 0.15 times 7 plus cross-vertical 0.20 times 9 equals 7.65, rounded to 7.7). Regime adjustment at 0.8x gives regime-adjusted composite of 6.2, still in "moderate conviction" territory. The raw 7.7 reflects the highest signal density of any segment in this rotation.

---

## Key Findings

**Finding 1: The yield curve uninversion is a recession warning signal, not an all-clear.** The 2s10s spread turning positive to plus 51 basis points would historically be interpreted as improved growth expectations. But the mechanism matters: this uninversion is driven by the short end repricing higher (2-year up 33 basis points in March) toward the policy rate rather than the long end falling on improved growth expectations. This pattern, where the curve uninverts because the front end catches up to restrictive policy, has preceded five of the last six recessions. The market is telling us that either the Fed will need to hike (bearish for growth) or the economy will slow enough to bring rates down eventually (recessionary).

**Finding 2: The 10-year Treasury at 4.39 percent creates a gravitational pull on all asset prices.** At 4.39 percent, the 10-year offers a risk-free return that competes directly with equity earnings yields, REIT dividend yields, and credit risk premiums. The equity risk premium (S&P 500 earnings yield minus 10-year yield) has compressed to levels that historically precede equity market underperformance. For REPE, the cap rate spread over 10-year for data center REITs has compressed to near zero, meaning investors receive essentially no compensation above risk-free for taking real estate risk in the strongest property type. Weaker property types will see forced cap rate decompression.

**Finding 3: Inflation expectations are structurally higher but the bond market is betting on recession to solve it.** The 10-year breakeven at 2.38 percent is below the 3.3 percent trailing 10-year realized inflation average, which means the bond market expects inflation to fall. But with PCE projections revised to 2.7 percent due to tariffs and war-driven oil prices, the path to lower inflation runs through economic weakness rather than supply normalization. The Fed's explicit linkage of rate cuts to inflation progress creates a Catch-22: the economy needs lower rates but won't get them until inflation falls, and inflation won't fall until the economy weakens enough to destroy demand.

**Finding 4: Treasury supply dynamics are a growing structural risk.** The 606 billion dollar weekly issuance around March 21 highlights the federal government's enormous borrowing needs. The Treasury Bulletin for March 2026 shows debt outstanding continuing to climb. As the Fed reduces its Treasury holdings and foreign demand potentially softens, the marginal buyer of US Treasuries becomes more price-sensitive, putting upward pressure on yields independent of inflation or growth dynamics. This is the "fiscal dominance" scenario that rate strategists have warned about.

**Finding 5: The rate hike probability emerging in market pricing is a regime-change catalyst.** If the market fully prices in a rate hike rather than a cut by late 2026, the implications cascade across every asset class. Equities would face valuation compression, credit spreads would widen further, housing activity would freeze, and the dollar would strengthen further. The regime classifier should be monitoring the Fed funds futures curve for the hike probability crossing 50 percent as a trigger for potential regime shift from RISK_OFF_DEFENSIVE to something more severe.

---

## Feature Gaps Identified

**Gap 1 (data_source):** No automated FRED API integration to pull daily Treasury yields across the entire curve (3-month, 2-year, 5-year, 10-year, 30-year), TIPS real yields, and breakeven inflation rates. This is the single highest-priority data source gap across all segments.

**Gap 2 (calculation):** Cannot compute yield curve shape metrics (slope, curvature, butterfly spreads) or decompose yield moves into real rate versus breakeven inflation components. Need a service that generates daily curve analytics.

**Gap 3 (visualization):** Cannot render a dynamic yield curve chart showing current curve versus 30, 60, and 90-day prior curves. Also need a 2s10s spread time series with recession overlay. These are foundational visualizations for the macro category.

**Gap 4 (cross_vertical):** No automated bridge from Treasury yield changes to REPE cap rate models. When the 10-year moves 25 basis points, the system should automatically re-estimate implied cap rate adjustments across property types and update the REPE environment's valuation models.

**Gap 5 (alert):** No automated monitoring of Fed funds futures probabilities. When the probability of a rate hike (versus cut) crosses key thresholds (25 percent, 50 percent, 75 percent), an alert should trigger regime re-evaluation. Also need alerts for 10-year yield crossing round numbers (4.0, 4.5, 5.0 percent).

---

## Cross-Vertical Insights

**To REPE:** The 10-year at 4.39 percent is the most important number for real estate valuation. With cap rate spreads at near zero for premium property types and the 10-year rising, REPE models should stress-test acquisitions at 4.75 to 5.0 percent 10-year scenarios. The 30-year mortgage rate correlation means housing-exposed REPEs face dual pressure from both cap rate decompression and reduced transaction volume.

**To Credit Decisioning:** The Fed hold at 3.50 to 3.75 percent means benchmark consumer lending rates remain elevated. The emerging rate hike probability should be incorporated into stress-test scenarios for the consumer credit portfolio. If the Fed hikes rather than cuts, marginal borrowers who were underwritten assuming stable or declining rates face payment shock risk.

**To PDS:** Construction financing costs are directly tied to the short end of the curve. The 2-year at 3.88 percent and rising means construction loan rates (typically priced off SOFR plus a spread) continue to climb. Projects in the PDS pipeline should be re-evaluated for financing feasibility at current rates plus a 50 basis point buffer.

**To Regime Classifier:** The yield curve shape, rate trajectory, and breakeven inflation data from this brief should feed directly into the next regime classification. The uninversion mechanism (short-end driven rather than long-end) and the emerging rate hike probability are both inputs that could shift the regime from RISK_OFF_DEFENSIVE toward TRANSITION_DOWN or RISK_OFF_PANIC depending on how the next month unfolds.

---

## Sources

- Advisor Perspectives Treasury Yields Snapshot March 20: https://www.advisorperspectives.com/dshort/updates/2026/03/20/treasury-yields-snapshot-march-20-2026
- Wolf Street Yield Curve Uninversion: https://wolfstreet.com/2026/03/21/2-year-3-year-treasury-yields-spike-flip-to-rate-hike-yield-curve-uninverts-government-sold-606-billion-of-treasury-securities-this-week-as-the-borrowing-must-go-on/
- CNBC Fed Decision March 2026: https://www.cnbc.com/2026/03/18/fed-interest-rate-decision-march-2026.html
- Schwab Fed Holds Rates: https://www.schwab.com/learn/story/fomc-meeting
- BondSavvy March 2026 Dot Plot: https://www.bondsavvy.com/fixed-income-investments-blog/fed-dot-plot
- Goldman Sachs Fed Rate Cut Outlook: https://www.goldmansachs.com/insights/articles/the-outlook-for-fed-rate-cuts-in-2026
- Morningstar Tariff Inflation Impact: https://www.morningstar.com/economy/inflation-set-rise-tariff-costs-hit-consumers-2026
- TIPSWatch 10-Year TIPS Auction: https://tipswatch.com/2026/03/19/10-year-tips-reopening-gets-real-yield-of-1-896/
- FRED 2s10s Spread: https://fred.stlouisfed.org/series/T10Y2Y
- FRED 10-Year Breakeven: https://fred.stlouisfed.org/series/T10YIE
- LPL Research Fixed Income Outlook: https://www.lpl.com/research/weekly-market-commentary/navigating-neutral-fed-policy-key-for-fixed-income-markets-in-2026.html
- iShares Fed Outlook 2026: https://www.ishares.com/us/insights/fed-outlook-2026-interest-rate-forecast
