# Segment Intelligence Brief: Global Liquidity & Capital Flows

**Segment ID:** ma-liquidity-flows
**Category:** Macro
**Tier:** 1
**Date:** 2026-03-26
**Regime:** RISK_OFF_DEFENSIVE

---

## Regime Context

The current regime is RISK_OFF_DEFENSIVE, classified on March 24, 2026. The S&P 500 broke its 100-day moving average on March 5 and has declined four consecutive weeks, sitting roughly six percent below its record high. The VIX closed at 26.95 on March 25, elevated but off the 29.5 spike from early March. High yield spreads sit at 3.19 percent, widening from the sub-3.0 percent levels of late 2025. Geopolitical risk from the U.S.-Iran conflict and sticky inflation data are the primary drivers of the defensive posture.

---

## Signal Scores

**Policy Direction: 7 out of 10.** The Fed ended QT in December 2025 and resumed balance sheet expansion on December 12. The transition from tightening to expansion is a structurally positive liquidity development, though the pace of reserve management purchases remains cautious. The Fed is deploying RMPs to maintain adequate reserves without overtly easing financial conditions, signaling awareness that inflation remains a concern.

**Rate Trajectory: 5 out of 10.** The Fed delivered 75 basis points of cuts in 2025, bringing rates down from the 5.25 to 5.50 percent range. However, the path forward is uncertain given the inflationary impulse from rising oil prices tied to the U.S.-Iran conflict. The 30-year mortgage rate hovering around 6.1 percent suggests the market does not expect aggressive further easing. The ECB is expected to hold steady for the next two years, the BOJ is hiking toward 1.0 percent by year-end, and the PBOC is easing with 20 basis points of rate cuts and 100 basis points of RRR cuts expected.

**Liquidity Conditions: 7 out of 10.** The reverse repo facility has been drained to near zero, meaning TGA movements now have unfiltered impact on bank reserves. This creates higher liquidity volatility but also means the plumbing is no longer absorbing excess cash that could flow into risk assets. The Fed's shift to balance sheet expansion is net positive. M2 money supply data through February 2026 shows the beginning of a recovery from the historic contraction of 2022 to 2023. Global M2 is expanding, with PBOC easing adding to the global liquidity pool.

**Cross-Asset Signal: 6 out of 10.** The DXY has fallen roughly 10 percent from its January 2025 peak above 109 to approximately 99.6 in late March 2026. Dollar weakness is typically supportive of global risk assets and emerging market capital flows. However, the weakening is partly driven by capital outflows (18 billion dollars left the U.S. Treasury market in January 2026, 22 billion from U.S. equities) rather than purely positive risk appetite, which complicates the signal. The 2s10s spread has re-steepened after its historic inversion, a constructive normalization.

**Cross-Vertical Relevance: 7 out of 10.** Liquidity conditions directly feed into REPE cap rate dynamics (treasury spread compression or expansion), credit environment health (HY spreads at 3.19 percent are still tight by historical standards but widening), and construction financing costs for PDS environments. The dollar weakness and global central bank divergence create opportunities for cross-border capital flow analysis.

**Composite Score: 6.5 out of 10 (Moderate Conviction).** Applying RISK_OFF_DEFENSIVE regime adjustment with 0.8 multiplier on non-boosted signals: policy direction and liquidity conditions are structurally supportive, but rate uncertainty, geopolitical headwinds, and mixed cross-asset signals prevent higher conviction. The regime dampens catalyst density expectations. Adjusted composite reflects a market where the plumbing is improving but sentiment and external shocks are holding back the positive liquidity impulse.

---

## Key Findings

First, the Fed's pivot from QT to balance sheet expansion is the most significant liquidity development of Q1 2026. The December 2025 end of QT and near-immediate resumption of purchases removed a major headwind that had been draining approximately 60 billion dollars per month from the financial system at peak runoff rates. Reserve management purchases are being deployed to maintain adequate liquidity without signaling overt easing.

Second, the near-zero reverse repo facility creates a fundamentally different liquidity regime than what existed in 2023 and 2024. When the RRP held over 2 trillion dollars, it acted as a buffer absorbing TGA and reserve fluctuations. With that buffer gone, every Treasury refunding announcement and tax collection season will have outsized and direct impact on bank reserves. This makes the April and June tax collection periods particularly important to monitor.

Third, global central bank divergence is creating cross-border capital flow opportunities. The PBOC is easing aggressively (rate cuts plus RRR cuts), the BOJ is tightening toward 1.0 percent, the ECB is on hold, and the Fed has paused. This divergence, combined with a weakening dollar, is driving capital rotation out of U.S. assets and into Europe and emerging markets. January 2026 saw a combined 40 billion dollars in net outflows from U.S. Treasuries and equities.

Fourth, the high yield spread at 3.19 percent remains tight relative to the current VIX level of 27. Historically, VIX readings above 25 with HY spreads below 3.5 percent represent a tension that typically resolves with either VIX declining (risk-on resolution) or spreads widening (risk-off continuation). The current geopolitical overhang from the U.S.-Iran conflict and oil price pressures favor the latter scenario.

Fifth, dollar weakness to the 99 to 100 range on DXY, while supportive of global asset prices, is driven partly by loss of confidence in U.S. fiscal trajectory rather than pure risk-on flows. This distinction matters for cross-vertical analysis, particularly for REPE environments where foreign capital flows into U.S. commercial real estate are sensitive to currency dynamics.

---

## Feature Gaps Identified

Gap 1 (data_source): No real-time TGA balance feed. Cannot track Treasury General Account drawdowns and refills that now have unfiltered impact on reserves. Would need Treasury fiscal data API integration with daily refresh.

Gap 2 (calculation): Cannot compute a proprietary global liquidity index aggregating Fed, ECB, BOJ, and PBOC balance sheets with appropriate lags and currency adjustments. Currently relying on third-party commentary rather than direct computation.

Gap 3 (visualization): No interactive yield curve visualization showing 2s10s, 5s30s, and real rate curves with historical overlays. Would significantly enhance macro regime analysis.

Gap 4 (alert): No automated alert for RRP facility usage spikes or TGA drawdown thresholds that signal imminent liquidity shifts. These are leading indicators with hours-to-days predictive value.

Gap 5 (cross_vertical): Missing automated bridge from macro liquidity regime changes to REPE cap rate model adjustments. Currently requires manual interpretation to connect treasury spread movements to property valuation impacts.

---

## Cross-Vertical Insights

For REPE environments, the treasury spread at current levels with HY at 3.19 percent suggests cap rate compression has likely paused. Dollar weakness may attract some foreign capital into U.S. CRE, but the geopolitical uncertainty and rising oil costs are headwinds. Monitor the April Treasury refunding for signals on long-end supply that could pressure cap rates further.

For Credit environments, the combination of Fed expansion and near-zero RRP creates favorable funding conditions for consumer credit, but the oil price shock raises recession probability, which should increase caution on credit loss assumptions in the decisioning engine.

For PDS environments, construction financing costs remain elevated with the 30-year mortgage at 6.1 percent. Builder confidence at 36 on the NAHB index reflects persistent affordability challenges. The PBOC easing may reduce input costs for globally sourced materials.

---

## Sources

- Federal Reserve Board Recent Balance Sheet Trends: https://www.federalreserve.gov/monetarypolicy/bst_recenttrends.htm
- FRED Overnight Reverse Repo (RRPONTSYD): https://fred.stlouisfed.org/series/RRPONTSYD
- FRED High Yield Spread (BAMLH0A0HYM2): https://fred.stlouisfed.org/series/BAMLH0A0HYM2/
- ING Central Banks 2026 Predictions: https://think.ing.com/articles/central-banks-predictions-for-2026/
- StreetStats Fed Balance Sheet and Net Liquidity: https://streetstats.finance/liquidity/fed-balance-sheet
- Trading Economics US Dollar: https://tradingeconomics.com/united-states/currency
- Federal Reserve H.6 Money Stock Measures: https://www.federalreserve.gov/releases/h6/current/default.htm
