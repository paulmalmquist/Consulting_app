# HappyCo specificity recommendations

The pipeline today runs on public NOAA/FEMA weather/hazard concepts plus
deterministic synthetic property operations data. To make the model and outputs
genuinely specific to HappyCo's business — inspection and maintenance operations
for multifamily real estate — the following are the highest-leverage changes.
None are implemented in PR-3a; they are scoped here for follow-up work.

1. **Bind features to HappyCo inspection taxonomy.** HappyCo's product is
   property condition inspections. Replace the generic `overall_score` /
   `inspection_failure_flag` with HappyCo's actual inspection item categories
   (life-safety, deferred maintenance, capital items) and severity grades, so a
   prediction maps to an inspection line a property manager already acts on.

2. **Weather-event-to-work-order linkage as a real join, not a flag.** Today
   `weather_related_flag` is synthetic. Join NOAA Storm Events by county FIPS +
   date window against actual work-order open dates to produce a measured
   "post-event maintenance surge" feature. That join is the defensible core of a
   weather-risk story for HappyCo.

3. **Make-ready / unit-turn lead time as the headline target.** HappyCo
   customers lose revenue on slow unit turns. Reframe the primary prediction
   around make-ready delay days after a weather event, not a generic surge flag,
   and tie the metric to vacancy-loss dollars rather than an abstract score.

4. **Portfolio and market segmentation HappyCo actually sells against.** Add
   asset-class (A/B/C), construction type, and roof/HVAC age cohorts as explicit
   model segments, and report risk per cohort — that mirrors how HappyCo's PM and
   owner customers think about their portfolios.

5. **Operational output, not just a CSV.** Produce a ranked, per-property
   "inspect before the next storm" action list with the contributing weather and
   asset-condition reasons, scoped to the next 14–30 day forecast window. That
   turns the model from a backtest into something a HappyCo regional manager can
   put on a Monday call.
