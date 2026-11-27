# User guide

`Overtime-Shift-Tracker-User-Guide.pdf` is built from `guide.html` (A4, 11 pages). It's written computer-first: each page leads with a desktop screenshot (`shots/desktop/`), with the phone view alongside (`shots/phone/`).

## Rebuild the PDF

```
node docs/user-guide/make.cjs
```

Prints the spare space on each page (negative means something spills past the footer) and writes the PDF next to this file. Fonts come from `public/fonts` via `fonts.css`.

It also copies the PDF to `public/user-guide.pdf`, which the app links to from More › User guide (PDF) and serves at /user-guide.pdf.

## Retake the screenshots

1. `npm run build && npx vite preview --port 4332` (a local build with no Supabase keys runs signed out, with local data only).
2. `node docs/user-guide/cap-desktop.cjs` saves 1440×900 shots to `shots/desktop/`, and `node docs/user-guide/cap.cjs` phone-sized ones to `shots/phone/`. Both use made-up figures from `seed.cjs` (a Sergeant, SGT 3, with overtime, PA, four deductions, two claims still to submit and some TOIL).

`shots/statement/stmt1-1.png` and `stmt3-3.png` are pages 1 and 3 of a sample tax-year PDF export for a year over £100k, made with `pdftoppm -r 110`.

No real user data appears anywhere in the guide.
