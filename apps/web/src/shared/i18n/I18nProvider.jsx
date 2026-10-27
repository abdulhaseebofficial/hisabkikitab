import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
// Default import, then destructure: the contracts package is CommonJS, and
// Rollup cannot prove a named export exists on it at build time.
import catalogue from '@hisabkikitab/contracts/catalogue';
import en from './locales/en.json';
import romanUr from './locales/roman-ur.json';

const { safeLanguage, languageMeta, uiLanguages, DEFAULT_LANGUAGE } = catalogue;

const BUNDLES = { en, roman_ur: romanUr };
const STORAGE_KEY = 'hkk-language';

/**
 * A language is only usable here if its bundle actually shipped.
 *
 * The catalogue says which languages the interface claims to speak; this says
 * which ones are really present in the build. Without the check, adding an id
 * to the catalogue before writing its locale file would leave every lookup
 * falling back to English one key at a time - an interface that looks broken
 * rather than untranslated, and no error anywhere to say why.
 *
 * Text ENTRY is unaffected by any of this. Urdu, Hindi, Tamil and the rest can
 * be typed into any free-text field whatever the interface language is.
 */
const TRANSLATED = uiLanguages().filter((language) => BUNDLES[language.id]);
const isTranslated = (id) => Boolean(BUNDLES[id]);
const usable = (id) => (isTranslated(safeLanguage(id)) ? safeLanguage(id) : DEFAULT_LANGUAGE);

/**
 * The app in two languages, without a library.
 *
 * What a translation layer has to do here is small: look a key up in one of two
 * JSON files, put a number or a name into the gap, and fall back to English
 * rather than showing a person `udhaar.summary.payable`. That is thirty lines.
 * A library would add a dependency, a build step and a plugin config to do the
 * same thing, and this app already decided against carrying weight it does not
 * use.
 *
 * WHERE THE CHOICE LIVES
 *
 * Three places, in order of authority:
 *   the signed-in profile   travels with the person across devices
 *   localStorage            so the login screen is already in their language,
 *                           before there is a profile to read
 *   English                 for someone who has never chosen
 *
 * The profile wins once it loads. Until then the stored preference is used, so
 * the first paint is not in the wrong language and then flipping.
 *
 * WHAT IS NEVER TRANSLATED
 *
 * Anything stored. Category ids, statuses, modes, amounts, and above all the
 * words a person typed themselves - a note, a person's name, a custom category.
 * Those come back exactly as written, in either language.
 */
const I18nContext = createContext(null);

/** Reads `a.b.c` out of a nested bundle. */
const read = (bundle, key) =>
  key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), bundle);

/** Replaces {name} with values.name, leaving unknown placeholders visible. */
const fill = (template, values) =>
  !values
    ? template
    : template.replace(/\{(\w+)\}/g, (whole, name) =>
        values[name] === undefined ? whole : String(values[name])
      );

const readStored = () => {
  try {
    return usable(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Private browsing, or storage blocked. Not a reason to fail.
    return DEFAULT_LANGUAGE;
  }
};

export function I18nProvider({ language, children }) {
  const [stored, setStored] = useState(readStored);

  // The profile is the authority once it has loaded; before that, the stored
  // preference keeps the first paint in the right language.
  const active = usable(language || stored);

  useEffect(() => {
    if (!language) return;
    setStored(language);
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Nothing to do: the profile still carries it to the next device.
    }
  }, [language]);

  useEffect(() => {
    // Tells a screen reader and the browser which language the page is in, and
    // which way the interface runs. Both come from the language catalogue, so
    // adding a right-to-left interface language is a data change rather than an
    // edit here.
    //
    // `dir` is the direction of the CHROME only. Text a person typed carries
    // dir="auto" on its own element, which is why an Urdu description reads
    // right-to-left today without the surrounding page flipping.
    const meta = languageMeta(active);
    document.documentElement.lang = meta.bcp47;
    document.documentElement.dir = meta.dir;
  }, [active]);

  /**
   * `t('udhaar.summary.payable')`, or with values: `t('common.of', { a, b })`.
   *
   * A missing key falls through to English and finally to the key itself -
   * never to an empty string, which would silently delete a label. In
   * development the miss is logged, because a key nobody notices is a label
   * nobody translated.
   */
  const t = useCallback(
    (key, values) => {
      const found = read(BUNDLES[active], key);
      if (typeof found === 'string') return fill(found, values);

      const english = read(BUNDLES.en, key);
      if (typeof english === 'string') {
        if (import.meta.env.DEV && active !== 'en') {
          console.warn(`[i18n] missing ${active} translation for "${key}"`);
        }
        return fill(english, values);
      }

      if (import.meta.env.DEV) console.warn(`[i18n] no such key "${key}"`);
      return key;
    },
    [active]
  );

  const value = useMemo(
    () => ({ t, language: active, setStoredLanguage: setStored, languages: TRANSLATED }),
    [t, active]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * `const { t, language } = useT()`.
 *
 * Safe outside the provider: a component rendered on its own in a test still
 * gets English rather than throwing.
 */
export default function useT() {
  return useContext(I18nContext) || FALLBACK;
}

const FALLBACK = {
  language: DEFAULT_LANGUAGE,
  languages: TRANSLATED,
  setStoredLanguage: () => {},
  t: (key, values) => {
    const english = read(en, key);
    return typeof english === 'string' ? fill(english, values) : key;
  },
};

export { STORAGE_KEY, TRANSLATED, isTranslated };
