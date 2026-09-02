# MERIT Mobile pilot measurement

## Decision this pilot should support

At the end of a 60–90 day unit pilot, the commander should be able to decide whether MERIT Mobile makes performance documentation easier to sustain, improves the quality and timeliness of support-form context, and produces records that raters actually use.

The dashboard must distinguish product activity from operational value:

- **Adoption:** people used the workflow and returned to it.
- **Speed:** the workflow completed quickly and with few failures.
- **Record quality:** entries carried evidence or linked goals and did not create excessive clarification work.
- **Downstream use:** raters reviewed the records, observations were released in counseling, and entries were used in evaluations.

No metric should imply that MERIT improved a Soldier's rating or replaced rater judgment.

## KPI definitions

| KPI | Definition | Source |
| --- | --- | --- |
| Active participants | Distinct authenticated users with a pilot event during the window | `pilot_metric_events` |
| Repeat participants | Users completing at least two distinct workflows during the window | `pilot_metric_events` |
| Workflow completion | Distinct completed workflows divided by distinct started workflows | `pilot_metric_events` |
| Median capture time | Median elapsed time from workflow start to successful record creation | `pilot_metric_events` |
| Mobile records | Non-withdrawn Soldier entries plus rater observations created by MERIT Mobile | Domain records |
| Evidence-backed | Mobile Soldier entries with one or more artifacts | Domain records |
| Goal-linked | Mobile entries or observations linked to an approved performance goal | Domain records |
| Review lag | Time from entry creation to attributed rater review | Domain records |
| Reviewed or released | Entries with a rater disposition plus observations released in counseling | Domain records |
| Used in evaluation | Mobile entries referenced by an evaluation | Domain records |
| Dimension coverage | Distribution of mobile records across the six leadership dimensions | Domain records |

Every rate should be displayed with its numerator, denominator, and measurement window when used outside the in-app summary.

## Baseline required before claiming time savings

Capture a two- to four-week pre-pilot baseline using the same unit and a stable workflow definition. Sample both rated Soldiers and raters. At minimum, record:

1. Minutes per person spent reconstructing and entering performance information for a monthly or quarterly update.
2. Minutes raters spend gathering missing context during counseling and evaluation preparation.
3. Number of usable performance records available at the start of evaluation preparation.
4. Number of clarification contacts needed to make those records usable.
5. User confidence that relevant performance will be available when the evaluation is written.

Only calculate hours saved after the post-pilot comparison is complete. The calculation should use the difference in median total workflow time—not mobile capture time alone—and report the sample size. Until then, the API returns `BASELINE_REQUIRED` and no saved-hours value.

## Suggested command-approved success targets

These are hypotheses for a pilot charter, not claims about current performance:

- At least 60% of eligible pilot users become active.
- At least 40% of active users complete two or more workflows.
- At least 85% of started workflows complete successfully.
- Median mobile capture time remains under two minutes.
- At least half of mobile entries include evidence or a goal link.
- Median rater review lag improves against the pre-pilot baseline.
- A meaningful share of eligible mobile entries are used during evaluation preparation.

The unit should approve or replace these targets before the pilot begins so the success criteria cannot be changed after results are visible.

## Privacy and interpretation guardrails

- Telemetry contains workflow IDs, event type, duration, evidence count, actor ID, unit snapshot, and timestamps only.
- It never contains accomplishment text, evidence, names, ratings, narrative content, or device location.
- The platform-administrator view is aggregate-only. It provides no individual leaderboard or Soldier/rater ranking.
- The dashboard is restricted to `ApplicationSupportRole.ADMINISTRATOR`. Army `COMMANDER` and unit `ADMIN` roles do not receive access automatically.
- Platform administrators may view the cross-unit pilot aggregate or deliberately scope the API to a unit hierarchy.
- Product telemetry is append-only through the API; retrying the same event is idempotent.
- Telemetry failure never blocks the underlying performance record.
- Positive observations are a description of captured feedback, not proof that MERIT caused better performance.
- Small samples and incomplete review cycles must be called out in any briefing.

## Pilot review cadence

- **Weekly:** adoption, completion, failures, and data-quality problems.
- **Monthly:** evidence and goal linkage, review lag, dimension coverage, and counseling release.
- **End of pilot:** baseline comparison, evaluation use, user confidence, privacy review, and a commander decision to stop, adjust, expand, or pursue enterprise integration.
