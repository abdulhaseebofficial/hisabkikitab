# Unicode text, category labels, and interface languages

Three separate things that are easy to confuse. Keeping them apart is what lets
the app accept Urdu today without claiming to be translated into it.

| | What it means | Where it stands |
| --- | --- | --- |
| **Text entry** | A person types in their own script and the app stores, searches and shows it unchanged | Works for every script Unicode covers |
| **Category labels** | A stored id renders as words a person recognises | Done for English and Roman Urdu, from the catalogue |
| **Interface language** | Every label, button and message translated and checked | English and Roman Urdu only |

Entry support is not translation. The app accepting `گھر کا کرایہ` in a
description says nothing about whether its buttons are in Urdu, and the two must
never be advertised as one thing.

---

## 1. Text entry

### What is accepted

Any script, in any field a person writes prose into: names, expense and income
descriptions, categories, notes, goal titles, debt contacts and purposes,
Shared Living space and member names, and feedback. Mixed scripts in one value
are fine - `Monthly گھر Expense` and `Rs. 500 کا خرچ` are ordinary input.

Verified end to end for: Urdu (including diacritics), English, Hindi, Bengali,
Punjabi (Gurmukhi and Shahmukhi), Sindhi, Arabic, Persian, Tamil, Telugu,
Chinese, Japanese, Korean, Thai, Indonesian.

### What is refused, and why

Only characters that cannot be stored, not characters that look dangerous.

```js
// apps/api/src/shared/validation/rules.js
const UNSTORABLE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u;
```

Postgres `text` holds every Unicode scalar except NUL, which it rejects with
`22021`. The rest of the C0 block goes with it, because tab, newline and
carriage return are the only control characters anyone means to type. Before
this the NUL reached the database and surfaced as a **500 and an error-log
entry** for what is a malformed request; `errorHandler.js` now also maps `22021`
to a 400 as a backstop for any path that does not use `unicodeText`.

**Deliberately not refused:** `<`, `>`, quotes, ampersands, bidi controls, SQL
keywords. All of these are legitimate in a note - `rent > 20000`, `Ali's shop` -
and they are made safe where it actually matters:

- **SQL injection:** every query is parameterised. A description containing
  `'; DROP TABLE expenses; --` is stored as those characters and never parsed.
- **XSS:** React escapes every string it renders, and the codebase contains no
  `dangerouslySetInnerHTML`. Checked, not assumed.

A validator that stripped these would store something the person did not type,
which on a financial record is worse than the thing it was protecting against.

### Names are stricter, on purpose

A name must be letters, combining marks, spaces, hyphens and apostrophes,
starting with a letter:

```
^\p{L}(?:[\p{L}\p{M}'’ -]*[\p{L}\p{M}])?$
```

The final character used to be required to be `\p{L}`, which quietly refused
most Indic names: Devanagari, Bengali, Tamil and Telugu words routinely end in a
dependent vowel sign, and that is `\p{M}`. `किराया`, `বাড়ি`, `வாடகை` and
`ఇంటి అద్దె` were all rejected with "letters, spaces, hyphens and apostrophes
only". Digits, `@`, `<`, `/`, emoji and a trailing space are still refused.

### Normalisation

Free text is normalised to **NFC** before storage. Urdu, Hindi and Tamil can
each encode the same word two ways - precomposed, or a base letter plus
combining marks - and Postgres compares bytes, so without this a description
saved from one keyboard would not be found by a search typed on another.

NFC is *canonical* equivalence: the same text by Unicode's own definition, not a
rewrite. Nothing visible changes. This is the one transformation applied to user
text, and it is why `search` works across keyboards.

### Lengths are in characters

`isLength({ max: 200 })` counts characters, so a 200-character limit is 200
Urdu characters. A byte limit would have allowed about 67, because Urdu is two
to three bytes per character in UTF-8.

---

## 2. Category labels

Two rules, unchanged by this phase and now actually applied in the interface:

> **An id is stored. A label is read.**
> `groceries` goes in the database and travels over the API. "Ghar Ka Rashan"
> exists only on a screen.

> **A mode owns its categories.**
> A household has an electricity bill; a hostel room does not.

The lookup already existed in `packages/contracts/catalogue.js`
(`labelFor`, `labelForAnyMode`) and `apps/web/src/shared/i18n/useCategoryLabel.js`.
Six components used it; seven rendered the raw id, which is why
`student_shopping`, `student_family`, `student_savings` and `student_emergency`
appeared on screen, and why the id `Mess/Food` showed instead of its label
"Food". Those seven now use the hook:

expense form, expense filters (chip and dropdown), expense list row, settings
categories card, budget page (dropdown, modal title, toast, suggestions),
advisor page.

**No id was renamed.** Existing transactions keep the category they were filed
under; only the word on screen changed.

A category somebody typed themselves has no catalogue entry, so `labelForAnyMode`
returns it exactly as written - never translated, never blanked. That is how an
Urdu custom category works.

### Adding Urdu-script category labels

Each catalogue entry carries one field per language:

```json
{ "id": "student_savings", "en": "Savings", "roman_ur": "Bachat" }
```

Add `"ur": "بچت"` to each entry and the lookup picks it up with no code change.
Entries without a `ur` field fall back through English to the id, so a partial
translation degrades per category rather than breaking the screen. The labels
have **not** been added, because guessing them is not translating them.

---

## 3. Interface languages

`en` and `roman_ur`. Both have a complete, checked catalogue in
`apps/web/src/shared/i18n/locales/`.

The language list is data, in `catalogue.json`:

```json
{ "id": "roman_ur", "en": "Roman Urdu", "bcp47": "ur-Latn", "dir": "ltr",
  "sample": "Mujhe paise dene hain" }
```

- `bcp47` goes in `<html lang>`, for screen readers and the browser's own font
  and hyphenation choices.
- `dir` is the direction of the **interface**, not of anything a person typed.
- `sample` is a line of the language itself, because "Roman Urdu" tells a person
  nothing about whether they can read it.

The settings card builds its options from this list, and `I18nProvider` offers
only languages whose bundle actually shipped:

```js
const TRANSLATED = uiLanguages().filter((language) => BUNDLES[language.id]);
```

Without that filter, adding an id to the catalogue before writing its locale file
would make every lookup fall back to English one key at a time - an interface
that looks broken rather than untranslated, with no error to say why.

### Adding Urdu-script as an interface language

1. Write `apps/web/src/shared/i18n/locales/ur.json` with **every** key English
   has. `t()` warns in development on a missing key; treat those warnings as the
   checklist.
2. Add to `catalogue.json`:
   `{ "id": "ur", "en": "Urdu", "roman_ur": "Urdu", "ur": "اردو", "bcp47": "ur", "dir": "rtl", "sample": "مجھے پیسے دینے ہیں" }`
3. Add `ur` to the `BUNDLES` map in `I18nProvider.jsx`.
4. Add `"ur"` labels to the category catalogue (section 2).
5. Walk every screen at `dir="rtl"`. This is the real work: the layout has never
   been rendered mirrored, so navigation, icon sides, chart axes, progress bars
   and the currency column all need checking.

Steps 1-4 are data and one line. Step 5 is the phase.

---

## 4. Direction: per string, never per app

The rule: **direction is a property of each piece of text, not of the
application.**

An Urdu description reads right-to-left inside a page whose chrome, numbers,
dates and currency column stay exactly where an English reader left them.
Flipping the whole interface because one note is in Urdu would move every amount
and every control for no reason, and would make the money column unreadable -
figures jumping side to side from row to row.

How it is done:

| Surface | Mechanism |
| --- | --- |
| Shared `Input` | `dir="auto"` for `text`, `search` and untyped fields only |
| Shared `Textarea` | `dir="auto"` always - a textarea is always prose |
| Hand-written inputs (about 90, mostly Business screens) | `unicode-bidi: plaintext` on `textarea.hw-input` and `input.hw-input` of a prose type, in `index.css` |
| Displayed user text | `dir="auto"` on the element that renders it |
| Numbers, dates, emails, passwords, selects | nothing - they stay left-to-right |
| The document | `dir` from the active interface language, currently always `ltr` |

A number, date or amount is a **structured value**, not prose. Letting one
re-align itself would move a figure out of its column the moment it began with
an Urdu digit.

### Bidi overrides are contained, not removed

A pasted `U+202E` (right-to-left override) can visually reorder everything after
it - the trick behind "Trojan Source". Stripping it would mean storing something
the person did not type, so instead every element carrying user text is its own
bidi paragraph:

```css
[dir='auto'] { unicode-bidi: plaintext; }
```

The override cannot escape the element it was typed into. It cannot reach the
amount, the date, or the row beside it. The record still says exactly what was
written.

---

## 5. Exports

| Format | Unicode | Notes |
| --- | --- | --- |
| **CSV** | Complete | UTF-8 with a BOM and `charset=utf-8`, so spreadsheets read Urdu correctly. Already correct before this phase; untouched. |
| **PDF** | Latin only, and it now says so | See below |

The PDF is built with one of PDF's 14 built-in fonts (Helvetica), which carries
about 315 Latin glyphs and no embedded font program. Asked for `گھر کا کرایہ`,
`घर` or `房租`, it emitted a glyph id the font has no glyph for and the viewer
showed **nothing**: the text vanished from the person's own report, with no
error. The category bars had the same problem - they were drawn with `U+2588`,
which Helvetica also lacks, so every bar in every report was blank.

Now any value the font cannot draw is replaced with a visible `[see CSV]`
marker, counted, and reported at the foot of the file:

```
Note: 3 values are written in a script this PDF cannot display (for example
Urdu, Hindi or Chinese). They are shown as [see CSV] above. Download the CSV
export of this month for the complete text.
```

**Why not embed a Unicode font.** A font alone is not enough for Urdu. Arabic
script needs contextual shaping - every letter has up to four forms - and
bidirectional reordering, and pdfkit has neither. Embedding a font would turn
blank output into visibly *wrong* output: isolated letterforms in reversed
order. That is worse than an accurate note. Correct Urdu PDF output needs a
shaping engine, and that is its own piece of work.

---

## 6. Database

No migration. Nothing about this phase needed a schema change.

- Encoding is `UTF8`, server and client, asserted in `tests/db/unicode-storage.test.js`.
- `text` and `varchar(n)` count characters, not bytes.
- Search uses `ILIKE` on the stored value, which is script-neutral; partial Urdu
  words match.
- The local test cluster is built with `--locale=C`. That affects sort order and
  case folding for non-ASCII, not storage or substring matching. Production
  collation is the provider's and has not been inspected - see the remaining
  risks in the Phase 3 report.

---

## 7. Where the tests are

| Suite | Covers |
| --- | --- |
| `tests/unit/unicode-text.test.js` | name rule per script, `unicodeText` behaviour, NFC, character-counted limits, PDF fallback, language architecture, category labels |
| `tests/db/unicode-storage.test.js` | encoding, byte-exact storage, Urdu search, update, delete, length, NUL rejection, hostile text stored literally, exact aggregates |
| `tests/e2e/unicode.test.js` | the whole HTTP path for every field the brief names, plus both exports |
| `tests/browser/urdu-rtl.spec.js` | resolved direction per string, amount column stability, inputs, category labels, mobile, bidi containment |
| `apps/web/src/features/settings/components/SettingsCards.test.jsx` | labels not ids, and an Urdu custom category rendered with `dir="auto"` |
