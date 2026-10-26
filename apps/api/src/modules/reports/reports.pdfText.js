/**
 * Text the PDF can actually draw, and an honest account of what it cannot.
 *
 * The PDF is built with one of PDF's 14 built-in fonts, which carry about 315
 * Latin glyphs and no embedded font program. Ask it for گھر کا کرایہ, घर, 房租
 * or even the block character the category bars were drawn with, and it emits
 * a glyph id the font has no glyph for: the viewer shows nothing. The text was
 * not rejected and no error was raised - it simply disappeared from the
 * person's own financial report.
 *
 * Losing a record silently is the one thing this must not do, so anything the
 * font cannot draw is replaced with a visible marker and counted, and the
 * report says at the end how many values were affected and where to get them.
 * The CSV export carries the same data with a UTF-8 BOM and loses nothing, so
 * that is where the note points.
 *
 * Why not embed a Unicode font instead: a font alone is not enough for Urdu.
 * Arabic script needs contextual shaping (every letter has up to four forms)
 * and bidirectional reordering, and pdfkit has neither. Embedding a font would
 * turn blank output into visibly wrong output - isolated letterforms in
 * reversed order - which is worse than an accurate note. Correct Urdu PDF
 * output needs a shaping engine, and that is its own piece of work.
 */

/** What stands in for a value the font cannot draw. ASCII, so it always draws. */
const MARKER = '[see CSV]';

/**
 * A per-character coverage test, taken from the document's own font.
 *
 * `characterToGlyph` answers '.notdef' for a code point the font has no glyph
 * for, which is exactly the question being asked. Reaching for `_font` is
 * reaching into pdfkit, so if that ever changes shape the fallback treats
 * anything outside printable ASCII as undrawable: over-cautious, never
 * silently wrong.
 */
const coverageTest = (doc) => {
  const font = doc && doc._font && doc._font.font;
  if (!font || typeof font.characterToGlyph !== 'function') {
    return (codePoint) => codePoint >= 0x20 && codePoint <= 0x7e;
  }
  const cache = new Map();
  return (codePoint) => {
    if (!cache.has(codePoint)) {
      let drawable;
      try {
        drawable = font.characterToGlyph(codePoint) !== '.notdef';
      } catch {
        drawable = false;
      }
      cache.set(codePoint, drawable);
    }
    return cache.get(codePoint);
  };
};

/**
 * A text helper bound to one document.
 *
 *   const text = pdfText(doc);
 *   text.safe(expense.description)   // the text, or the marker
 *   text.omitted                     // how many values were replaced
 *   text.note()                      // the sentence to print, or null
 */
const pdfText = (doc) => {
  const canDraw = coverageTest(doc);
  const omittedValues = new Set();

  /**
   * Returns `value` when every character can be drawn, and the marker when it
   * cannot. Whole values are replaced rather than character by character: half
   * a description with the Urdu cut out of it reads as the person's own typo,
   * where the marker reads as a limit of the file format.
   */
  const safe = (value, fallback = MARKER) => {
    const text = value == null ? '' : String(value);
    if (!text) return text;
    for (const character of text) {
      if (!canDraw(character.codePointAt(0))) {
        omittedValues.add(text);
        return fallback;
      }
    }
    return text;
  };

  return {
    safe,
    get omitted() {
      return omittedValues.size;
    },
    /** The line to print at the foot of the report, or null when nothing was lost. */
    note() {
      if (!omittedValues.size) return null;
      const count = omittedValues.size;
      return `Note: ${count} ${count === 1 ? 'value is' : 'values are'} written in a script this PDF `
        + 'cannot display (for example Urdu, Hindi or Chinese). They are shown as '
        + `${MARKER} above. Download the CSV export of this month for the complete text.`;
    },
  };
};

module.exports = { pdfText, MARKER };
