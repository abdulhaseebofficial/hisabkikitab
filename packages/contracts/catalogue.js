/**
 * Reading the catalogue: which categories a mode offers, and what to call them.
 *
 * Two rules hold this together, and everything else follows from them.
 *
 *   An id is stored. A label is read.
 *   `groceries` goes in the database and travels over the API. "Ghar Ka
 *   Rashan" exists only on a screen. Nothing a person can toggle changes what
 *   is stored, which is why switching language cannot duplicate a category or
 *   orphan a year of spending history.
 *
 *   A mode owns its categories.
 *   A household has an electricity bill and a hostel room does not. Asking for
 *   the wrong mode's list is how a student ends up filing a gas bill.
 *
 * Both apps use this: the API to decide what is allowed, the web app to decide
 * what to show. Same data, same answers.
 */

const catalogue = require('./catalogue.json');

const MODES = catalogue.financeModes.map((mode) => mode.id);
const LANGUAGES = catalogue.languages.map((language) => language.id);

const DEFAULT_MODE = 'student';
const DEFAULT_LANGUAGE = 'en';

/** Anything not on the list is not a mode, whatever the request claimed. */
const isMode = (value) => MODES.includes(value);
const isLanguage = (value) => LANGUAGES.includes(value);

/** Falls back rather than throwing: a bad stored value must not lock anyone out. */
const safeMode = (value) => (isMode(value) ? value : DEFAULT_MODE);
const safeLanguage = (value) => (isLanguage(value) ? value : DEFAULT_LANGUAGE);

/**
 * What an interface language needs besides its name.
 *
 * `bcp47` goes in `<html lang>`; `dir` is the direction of the interface
 * chrome, never of anything a person typed - user text decides that per
 * element. Falls back to English's values rather than throwing, for the same
 * reason `safeLanguage` does: a stored id that no longer exists must not lock
 * anyone out of their own books.
 */
const languageMeta = (id) => {
  const wanted = safeLanguage(id);
  const entry = catalogue.languages.find((language) => language.id === wanted)
    || catalogue.languages.find((language) => language.id === DEFAULT_LANGUAGE);
  return {
    id: entry.id,
    bcp47: entry.bcp47 || entry.id,
    dir: entry.dir || 'ltr',
    sample: entry.sample || '',
    name: entry.en,
  };
};

/**
 * Every language the interface is actually translated into.
 *
 * Separate from "scripts a person can type in", which is all of Unicode. A
 * language appears here only when its catalogue is complete; offering one that
 * is half-done means each missing key falls back to English on its own, and the
 * result reads as a bug rather than as work in progress.
 */
const uiLanguages = () => catalogue.languages.map((language) => languageMeta(language.id));

/* ------------------------------ categories ------------------------------- */

/** The full entries for one kind ('expense' | 'income') in one mode. */
const categoriesFor = (kind, mode) => {
  const group = catalogue[kind];
  if (!group) return [];
  return group[safeMode(mode)] || [];
};

/** Just the ids, which is what a validator or a query wants. */
const categoryIdsFor = (kind, mode) => categoriesFor(kind, mode).map((entry) => entry.id);

/**
 * The label for one id, in one language.
 *
 * Falls back through English to the id itself. That last step matters: a custom
 * category a person typed has no catalogue entry and must come back exactly as
 * they wrote it, never blanked and never translated.
 */
const labelFor = (kind, mode, id, language) => {
  const entry = categoriesFor(kind, mode).find((item) => item.id === id);
  if (!entry) return String(id == null ? '' : id);
  return entry[safeLanguage(language)] || entry.en || entry.id;
};

/**
 * A category's label without being told which mode it came from.
 *
 * Rendering a stored id is the failure this exists to prevent: a chart legend
 * reading "electricity_bill" or "student_savings" tells a person nothing and
 * looks like a bug in their own records. Callers that display a row - a chart,
 * a report line, a transaction - know the id and the language but often not
 * the mode, because the row carries its own.
 *
 * Both modes are searched. Ids are unique across them, and a row from the
 * other mode is never on screen anyway. Anything still unmatched is returned
 * as written, which is exactly right for a category the person invented.
 */
const labelForAnyMode = (kind, id, language) => {
  for (const mode of MODES) {
    const entry = categoriesFor(kind, mode).find((item) => item.id === id);
    if (entry) return entry[safeLanguage(language)] || entry.en || entry.id;
  }
  return String(id == null ? '' : id);
};

/** True when picking this category obliges the person to say more. */
const requiresNote = (kind, mode, id) => {
  const entry = categoriesFor(kind, mode).find((item) => item.id === id);
  return Boolean(entry && entry.requiresNote);
};

/* --------------------------- flat lookup tables --------------------------- */

/**
 * One label lookup for the things that are not per-mode: udhaar purposes, the
 * direction of a debt, its status, the modes and the languages themselves.
 */
const lookup = (listName, id, language) => {
  const list = catalogue[listName] || [];
  const entry = list.find((item) => item.id === id);
  if (!entry) return String(id == null ? '' : id);
  return entry[safeLanguage(language)] || entry.en || entry.id;
};

/**
 * Every id in one of the flat lists.
 *
 * An unknown list name throws rather than returning nothing. A validator built
 * on `idsOf('udhaarPurposes')` - the plural of the real name - would have
 * accepted every value ever sent, and the allowlist would have looked present
 * while enforcing nothing.
 */
const idsOf = (listName) => {
  const list = catalogue[listName];
  if (!Array.isArray(list)) throw new Error(`catalogue: no list named "${listName}"`);
  return list.map((entry) => entry.id);
};

/** One entry from a flat list, or null. */
const entryOf = (listName, id) => {
  const list = catalogue[listName];
  if (!Array.isArray(list)) throw new Error(`catalogue: no list named "${listName}"`);
  return list.find((entry) => entry.id === id) || null;
};

/**
 * Whether an entry in a flat list is one that means nothing on its own -
 * "Other" - and so has to be written out.
 */
const listRequiresNote = (listName, id) => {
  const entry = entryOf(listName, id);
  return Boolean(entry && entry.requiresNote);
};

/**
 * Every category id the app knows, across both modes and both kinds.
 *
 * Used where a stored value has to be recognised without knowing which mode it
 * came from - rendering a record created before the person switched, for
 * instance.
 */
const allKnownCategoryIds = () => {
  const ids = new Set();
  for (const kind of ['expense', 'income']) {
    for (const mode of MODES) {
      for (const id of categoryIdsFor(kind, mode)) ids.add(id);
    }
  }
  return [...ids];
};

module.exports = {
  catalogue,
  MODES,
  LANGUAGES,
  DEFAULT_MODE,
  DEFAULT_LANGUAGE,
  isMode,
  isLanguage,
  safeMode,
  safeLanguage,
  languageMeta,
  uiLanguages,
  categoriesFor,
  categoryIdsFor,
  labelFor,
  labelForAnyMode,
  requiresNote,
  lookup,
  idsOf,
  entryOf,
  listRequiresNote,
  allKnownCategoryIds,
};
