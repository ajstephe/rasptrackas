# DPIA Screening — Overtime & Shift Tracker

**Date:** 2 September 2026
**Outcome: a full DPIA is not required, on the reasoning below — but this screening record is itself the accountability artefact Article 35 actually asks for.** Re-run this screening if the app's data collection, recipients, or user base changes materially.

The ICO's own guidance lists factors that make a DPIA more likely to be needed. Each is checked against what this app actually does, not what a generic overtime app might do.

| Screening factor | Applies here? | Reasoning |
|---|---|---|
| Evaluation or scoring | No | No profiling, scoring, or automated assessment of any officer. |
| Automated decision-making with legal/similar effect | No | Every figure shown is a transparent calculation the officer can inspect and verify; nothing is decided *about* them. |
| Systematic monitoring | No | The app is used on the officer's own initiative to log their own shifts — not a monitoring system operated over them by someone else. |
| Special category data | No | No health, biometric, religious, trade union, or similar data is collected. |
| Data processed on a large scale | No | Expected user base is a small number of colleagues, not a large-scale deployment. |
| Matching or combining datasets | No | Each officer's data is siloed to their own account; nothing is cross-referenced between officers. |
| Data concerning vulnerable data subjects | No | Serving police officers, in a voluntary, opt-in tool. |
| Innovative use of technology | Partially | Client-side end-to-end encryption is more sophisticated than a typical app this size, but it *reduces* risk rather than introducing a new one — the opposite of the concern this factor is meant to catch. |
| Risk of physical harm or denial of a service/opportunity | No | Nothing in the app gates access to pay, leave, or any real-world entitlement — it's a personal tracking tool, not the system of record. |

## The one factor worth naming explicitly, even though it doesn't change the outcome

A breach exposing *which officers logged which shifts* is more sensitive in context than the data type alone suggests, given the data subjects are all serving police officers. This is why the encryption architecture matters as a control, not just a nice-to-have: a raw database compromise would expose ciphertext, account emails, and metadata — not readable shift data. This residual risk (email/metadata exposure in an Auth-level breach) is carried forward into the Breach Response Plan rather than triggering a full DPIA, since it doesn't meet any of the ICO's own triggering criteria above.

## Conclusion

No full DPIA required at the current scope (small number of officers, no special category data, no automated decision-making, strong encryption-by-design). Revisit this screening if: the user base grows to a genuinely large scale, any new data category is added, or the app starts making decisions about officers rather than just recording what they report.
