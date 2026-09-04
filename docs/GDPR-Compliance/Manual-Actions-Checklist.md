# Manual actions — things only you can complete

Everything else from the GDPR review is done: privacy notice built and linked, sign-up consent gate wired up and recorded, ROPA/DPIA-screening/breach-response docs written. These three are outside what code or a migration can do.

**Correction, 2 Sept 2026:** the original version of this checklist had two things wrong — checked live against Supabase's own docs and your actual org plan before writing this version. Leaked-password protection needs a paid plan, and the DPA doesn't need a dashboard hunt at all. Details below.

## 1. Leaked-password protection — declined, 2 September 2026

**Decision: not upgrading to Pro for this.** Supabase's security advisor still flags it on the live `rasptrackas` project, but it's a Pro Plan feature ($25/mo) and the app's existing 8-character minimum is judged a reasonable baseline for a small group of known colleagues. This isn't an oversight or something still pending — it's a deliberate call, and Article 32 only asks for measures "appropriate" to the risk, which is fair to judge lightly here. Future reviews shouldn't re-flag this as outstanding unless the app's user base or risk profile changes enough to revisit it.

## 2. Supabase DPA — already applies, nothing to click

Checked the actual page: Supabase's DPA (supabase.com/legal/dpa) is a standing document that's incorporated into the Terms of Service you already agreed to by using the platform — there's no separate "accept" button in the dashboard to hunt for, on any plan. **This one's already done by default.**

The only action: save a copy of the current DPA for your own records, in case anyone ever asks what governs Supabase's processing of officers' data.
1. Open [supabase.com/legal/dpa](https://supabase.com/legal/dpa).
2. Save it as a PDF (or note the version/date shown at the top) somewhere you keep the other GDPR docs.

## 3. Run the ICO's fee self-assessment — done, 2 September 2026

**Outcome: no fee required.** Self-assessed via the ICO's own tool — this is the record that the question was actually asked and answered, not assumed. If how the app is run ever changes materially (e.g. it stops being something shared informally between colleagues), it's worth re-running the assessment, since the outcome turns on exactly that.

---

All three closed. #1 was declined by choice, not left undone; #2 needed no action; #3 came back "no fee required."
