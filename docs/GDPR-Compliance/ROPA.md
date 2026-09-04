# Record of Processing Activities (ROPA) — Overtime & Shift Tracker

**Controller:** Adam Stephens (ajstephe@me.com)
**Last updated:** 2 September 2026, alongside Privacy Notice version `2026-09-02`
**Why this exists:** Article 30 UK GDPR gives small organisations a limited exemption from keeping a ROPA, but it doesn't cover processing that's *regular* — ongoing overtime/pay tracking for multiple officers is exactly that, so this document exists rather than relying on the exemption.

Review and update this file whenever the Privacy Notice changes, a new sub-processor is added, or the data collected changes — it should never drift out of sync with what the app actually does.

---

## Processing activity: overtime, TOIL, and pay tracking

| Field | Detail |
|---|---|
| **Purpose** | Let a serving officer log, calculate, and export their own overtime, TOIL, and Protection Allowance (PA) claims against the relevant pay calendar. |
| **Categories of data subject** | Serving police officers who create an account. |
| **Categories of personal data** | Account email; logged shift/overtime/TOIL entries (dates, times, duty type, rate tier); rank, pay point, and force/unit settings; CARMS/PA claim submission status and dates. |
| **Special category data?** | No. |
| **Lawful basis (Art. 6)** | Consent, given via the checkbox at sign-up, tied to a specific Privacy Notice version (`user_keys.privacy_version`, `user_keys.privacy_accepted_at`). |
| **Recipients** | Supabase (database, authentication — processor, EU-hosted, `eu-north-1`); Vercel (application hosting — processor). Neither is an independent controller. |
| **International transfers** | None outside the UK's recognised-adequate zone — primary hosting is in the EEA (Sweden). Confirm Supabase's own DPA/SCC coverage for any of its sub-processors outside that zone (see Manual-Actions-Checklist.md). |
| **Retention** | Cloud copy: entries from the last three complete financial years (`CLOUD_RETENTION_CUTOFF` in the app). Account/profile data: until account deletion. Local on-device copy: until the user clears it themselves, independent of the cloud. |
| **Security measures** | Client-side AES-256-GCM encryption of every entry/TOIL/settings payload before upload (Supabase never holds plaintext); password- and recovery-word-derived key wrapping via PBKDF2; Row-Level Security enabled on every table, confirmed live. |
| **Rights available** | Access & portability (in-app Backup export), rectification (in-app editing), erasure (in-app Delete Account, cascades via Edge Function), objection/complaint (email controller, or ico.org.uk). |

---

## Sub-processors

| Sub-processor | Role | Location | Contract |
|---|---|---|---|
| Supabase | Database, authentication, Realtime | EU (Stockholm, `eu-north-1`) | Confirm standard DPA accepted in org dashboard — see Manual-Actions-Checklist.md |
| Vercel | Application hosting | Global CDN (check region config) | Confirm equivalent terms if it ever processes more than static assets |

No other third party receives personal data from this app. There is no analytics, advertising, or tracking integration of any kind.
