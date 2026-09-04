# Breach Response Plan — Overtime & Shift Tracker

**Controller:** Adam Stephens (ajstephe@me.com)
**Scope:** any incident involving personal data processed by this app — account data, or (in principle) shift/TOIL/pay data, even though the latter is end-to-end encrypted and unreadable to an attacker who only has database access.

## Why the encryption architecture matters here

Every entry, TOIL record, and settings object is AES-256-GCM encrypted client-side before upload — Supabase only ever holds ciphertext. A breach of the Supabase database alone would **not** expose readable shift, TOIL, or pay data. It would still be a personal data breach, though: account emails, and encrypted blobs an attacker can see exist (even if they can't read them), are both personal data. The realistic higher-risk scenario is a breach of **Supabase Auth** itself, or of an individual officer's password (e.g. reused elsewhere and leaked), since either exposes an identifiable account.

## Step 1 — Decide if it's reportable

A personal data breach must be assessed within 72 hours of becoming aware of it. Ask:

1. Has personal data actually been accessed, altered, lost, or disclosed without authorisation?
2. Is it likely to result in a risk to officers' rights and freedoms (e.g. account takeover, exposure of which officer worked which shifts)?

If yes to both, it's reportable to the ICO. If the risk is unlikely (e.g. a bug that could theoretically have exposed something but there's no evidence it was ever exploited), document that reasoning and why you concluded it wasn't reportable — don't just decide silently.

## Step 2 — If reportable, notify the ICO within 72 hours

- Report at [ico.org.uk/for-organisations/report-a-breach](https://ico.org.uk) or by phone.
- Include: what happened, roughly how many officers are affected, what data was involved, and what's being done about it. A late or incomplete initial report is better than missing the 72-hour window entirely — it can be supplemented afterward.

## Step 3 — Tell affected officers, if the risk is high

If the breach is likely to result in a *high* risk to affected officers (e.g. account credentials genuinely compromised), tell them directly and without undue delay — what happened, what data was involved, and what they should do (e.g. change their password, watch for suspicious activity).

## Step 4 — Contain and fix

- Revoke/rotate any compromised credentials (Supabase service keys, if applicable) immediately.
- If the cause is a code-level vulnerability, fix and deploy before any public disclosure of the specific flaw.
- Force a password reset for affected accounts if credential compromise is suspected.

## Step 5 — Record it

Keep a short internal note for every incident considered under this plan — even ones judged not reportable — covering: what happened, when discovered, who was affected, the decision on reportability and why, and what was fixed. This is what demonstrates accountability (Art. 5(2)) if ever asked.

## Who decides

At this scale, that's the controller (Adam Stephens) — there's no separate DPO. If this ever grows enough that consulting someone else on the decision becomes reasonable, add that here.
