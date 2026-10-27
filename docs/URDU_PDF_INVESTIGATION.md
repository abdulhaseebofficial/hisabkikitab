# Urdu PDF rendering — investigation and recommendation

**Status:** investigation only. No pipeline was built, and nothing in the PDF
code changed as a result of this document. The `[see CSV]` fallback introduced
in Phase 3 stays in place until a pipeline is chosen and implemented.

**Date:** 2026-10-26
**Scope authorised:** evaluate the realistic options, check font licensing for
redistribution, prototype one page, recommend. Building the pipeline was
explicitly deferred.

---

## 1. The problem, precisely

PDF export currently runs on `pdfkit` (`apps/api/src/modules/reports` and
`apps/api/src/modules/business/business.documents.js`). pdfkit's built-in
fonts are Latin-only, so Urdu, Devanagari and CJK text used to be drawn as
nothing at all — silent data loss in a financial document.

Phase 3 closed the data-loss hole rather than the rendering gap:
`reports.pdfText.js` tests each string against the active font's glyph
coverage, replaces what cannot be drawn with a visible `[see CSV]` marker, and
prints a note naming the affected rows. Nothing disappears silently any more,
but Urdu still does not *render*.

Two separate things have to be true for Urdu to render correctly, and they are
usually conflated:

1. **Shaping** — Arabic-script letters change form by position (initial,
   medial, final, isolated) and form ligatures. This is OpenType GSUB work.
2. **Bidirectional ordering** — a line mixing Urdu, Latin words and Western
   digits must be split into directional runs and those runs ordered per the
   Unicode Bidirectional Algorithm (UAX #9) *before* shaping.

A renderer can do (1) and still get (2) catastrophically wrong. That is exactly
what the measurements below found.

---

## 2. Option A — bundle an Urdu font into the existing pdfkit pipeline

The cheapest-looking option: keep pdfkit, `registerFont` a real Urdu face, done.

**Tested. Rejected — it silently corrupts monetary amounts.**

pdfkit draws through `fontkit` (v1.9.0 in this repo). fontkit *does* implement
GSUB, so shaping works:

```
font                : Noto Naskh Arabic
input codepoints    : 12          ("گھر کا کرایہ")
output glyphs       : 14
any .notdef         : false
GSUB actually ran   : true
```

But pdfkit has no bidi implementation. It hands the whole string to fontkit as
a single run, fontkit detects one script direction for it, and reverses the
entire run — digits included. Probing with digit glyph ids, which have no
contextual forms and so are unambiguous:

| line | digits, logical | digits, painted | readable |
|---|---|---|---|
| `کرایہ 25000` | 25000 | **00052** | no |
| `25000 کرایہ` | 25000 | **00052** | no |
| `Rent 25000` | 25000 | 25000 | yes |
| `Rs. 500 کا خرچ` | 500 | 500 | yes |

An amount of 25,000 printed as 00052 in a financial statement is worse than the
current behaviour: `[see CSV]` is visibly incomplete, whereas a reversed number
looks like a number and will be read as one. The last two rows are not a
reprieve — they are the same bug: those lines begin with a strong Latin
character, so the run is typed LTR and the Urdu in them is mis-ordered instead.

Measured with throwaway probes (`pdfkit-digits.js`, `pdfkit-shaping.js`) run
against this repo's own `fontkit` 1.9.0. They live in the session scratchpad,
not in the repo; the method is described above so the result can be re-derived.

**This option must not be shipped.**

## 3. Option B — headless Chromium print pipeline

Render an HTML template and print it with Chromium, which carries a complete
text stack: full UAX #9 bidi, HarfBuzz shaping, and CSS `direction` /
`unicode-bidi: isolate` for per-element control.

**Tested. Works, including the cases Option A fails.**

A one-page Urdu statement was rendered with the four columns a real statement
has (date, category, description, amount):

```
bodyDirection            : rtl
urduCellDirection        : rtl
amountDirection          : ltr
embedded font program    : true
Urdu face really embedded: true   (BAAAAA+NotoNastaliqUrdu-Regular)
```

Visual check (`scratchpad/pdf-proto/bundled-nastaliq.png`) confirms:

- Urdu is correctly joined and in true Nastaliq, the style Urdu readers expect.
- The table reads right-to-left: `تاریخ` on the right, `رقم` on the left.
- Amounts (`25,000.00`, `4,320.50`) stay Latin, left-to-right, right-aligned
  and tabular in their own column — **not** reversed.
- Mixed lines (`Monthly گھر Expense`, `Rs. 500 کا خرچ`) keep each part in the
  right place.
- Latin-only rows (`Dhaba lunch`, `Mess/Food`) are unaffected.

### One trap worth recording

The first prototype *appeared* to work on Windows while proving nothing. Every
font family declared in the CSS was absent from the machine, so Chromium fell
through to the generic `serif` — Times New Roman, which happens to carry Arabic
glyphs. The PDF embedded `TimesNewRomanPSMT`, not an Urdu face. On Vercel's
Linux runtime there is no Times New Roman and that page would have rendered as
tofu.

`getComputedStyle(el).fontFamily` does not report this: it echoes the first
*declared* family, not the resolved face. The reliable check is the PDF's own
`/BaseFont` entries, read out of the compressed object streams.

The production pipeline must therefore **bundle the font and declare no system
fallback**, so a packaging mistake fails loudly instead of quietly. Note also
that the numeric column still pulled in `ArialMT` / `TimesNewRomanPSMT` from its
own fallback stack — a Latin face has to be bundled for digits too, not just
the Urdu face.

## 4. Option C — pdfkit plus explicit bidi segmentation

Keep pdfkit and fix the actual defect: run each line through a UAX #9
implementation (`bidi-js`, MIT, 1.1.0), split it into directional runs, and
draw each run separately with the correct font and direction. Optionally pair
with `harfbuzzjs` (MIT, 1.6.4) if fontkit's shaping proves insufficient for
Nastaliq.

Not prototyped. Plausible and much smaller in blast radius than Option B, but
it means owning a text-layout problem — run segmentation, per-run measurement,
line breaking, alignment and column fitting in a mixed-direction line — that
Chromium already solves correctly. For a financial document where the failure
mode is a wrong-looking number, writing that by hand is a poor trade.

Worth revisiting only if Option B's operational cost turns out to be
unacceptable.

## 5. Option D — hosted PDF rendering service

**Rejected on principle, not on cost.** Every document contains the owner's
financial records. Sending them to a third-party renderer exports financial
data out of the one-backend/one-database architecture and creates a processor
relationship with its own disclosure and retention obligations. Not worth it
for a font problem.

---

## 6. Font licensing

Both candidate faces are **SIL Open Font License 1.1**, which permits bundling
and redistribution inside the application, including commercially, provided the
licence text ships with them and the fonts are not sold on their own.

| font | package | version | licence | verified |
|---|---|---|---|---|
| Noto Nastaliq Urdu | `@fontsource/noto-nastaliq-urdu` | 5.3.0 | OFL-1.1 | LICENSE present in package |
| Noto Naskh Arabic | `@fontsource/noto-naskh-arabic` | 5.3.0 | OFL-1.1 | LICENSE present in package |

`LICENSE` header, as shipped:

```
Copyright 2022 The Noto Project Authors (https://github.com/notofonts/nastaliq)
This Font Software is licensed under the SIL Open Font License, Version 1.1.
```

The repo already depends on `@fontsource-variable/inter` from the same vendor,
so this introduces no new supply-chain relationship.

**Nastaliq vs Naskh.** Nastaliq is the style Urdu readers expect and is what a
statement should use. It is the more demanding of the two: deep cascading
baselines need noticeably more line height, and the font is larger. Naskh is a
reasonable fallback for dense tables if Nastaliq proves impractical there.
Both rendered correctly in the prototype.

---

## 7. Recommendation

**Option B — headless Chromium, with the font bundled and no system fallback.**

It is the only option measured to be correct on mixed Urdu/Latin/numeric
financial lines, and correctness of displayed amounts is not negotiable here.

It is not cheap. The honest cost:

- **13 documents to port.** `business.documents.js` builds 12 document types
  and `reports.controller.js` one more, all with hand-positioned pdfkit
  helpers (`drawHeader`, `drawTable`, `drawSummaryBox`, `drawFooter`). These
  become HTML/CSS templates. This is the bulk of the work and it is where
  English layout regressions would come from — existing English PDFs must be
  compared page by page before and after.
- **Runtime weight.** A Chromium binary in the API function. Vercel functions
  now allow up to 5 GB package size so this fits, but cold start and memory
  need measuring against the current function budget before committing.
- **A new failure mode.** Browser launch failures become PDF export failures.
  Needs a timeout, a concurrency limit, and a defined behaviour when the
  renderer is unavailable — which should be the CSV path, not an error.

Suggested sequencing, each independently shippable:

1. Spike the runtime on Vercel: bundle Chromium plus the two fonts, render one
   fixed page, measure cold start, memory and package size. **Go/no-go here.**
2. Port the monthly report (one document, the Urdu-facing one) and keep every
   business document on pdfkit. Urdu reports work end to end; nothing else
   moves.
3. Port the business documents in batches, with before/after comparison of the
   English output for each.

Until step 2 lands, PDF stays **PARTIAL** and CSV remains the lossless export
path — unchanged from Phase 3.

## 8. What was not done

- No pipeline was built and no PDF code was modified.
- No dependency was added to the repo. The prototype's packages were installed
  into the scratchpad only.
- Option C was not prototyped.
- Chromium cold start, memory and package size on Vercel were **not** measured;
  that is step 1 above and the recommendation is conditional on it.
- Nastaliq line-height and column behaviour were checked on one page only, not
  across long multi-page tables or the receipt-width (226pt) format.
