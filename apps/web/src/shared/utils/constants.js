/**
 * Front-end vocabulary. The backend owns the authoritative category list
 * (GET /api/meta); these defaults let the UI render instantly on first paint
 * and carry the presentation details the API has no opinion about.
 *
 * COLOUR NOTE
 * The nine category colours are a validated categorical palette: every
 * adjacent pair clears the colour-vision-deficiency and normal-vision
 * separation gates in BOTH light and dark mode, against this app's actual
 * surfaces (white / slate-900). Light and dark are two selected steppings of
 * the same eight hues, not an automatic flip.
 *
 * Rules that keep it valid:
 *  - slot 9 (Personal Care, teal) was added later and re-validated as part
 *    of the whole set in both modes against these surfaces; it introduces
 *    no new worst pair;
 *  - a colour belongs to a category, never to a rank, so filtering or
 *    re-sorting never repaints the survivors;
 *  - charts render categories in THIS order, so on-screen adjacency matches
 *    the pairs that were validated;
 *  - three light-mode slots sit under 3:1 contrast, so every chart also ships
 *    visible labels (legend with values) - identity is never colour alone.
 */

import vocabulary from '@hisabkikitab/contracts/vocabulary.json';

const {
  PAYMENT_METHODS,
  INCOME_SOURCES,
  CURRENCIES,
  FEEDBACK_TYPES,
  DEVELOPER,
  CATEGORIES: CATEGORY_VOCABULARY,
  RECURRING_FREQUENCIES: RECURRING_VALUES,
} = vocabulary;

// Re-exported so screens keep importing these from one place, while the list
// itself is the same one the API validates against.
export { PAYMENT_METHODS, INCOME_SOURCES, CURRENCIES, FEEDBACK_TYPES, DEVELOPER };

export const CATEGORIES = [
  { name: 'Mess/Food',          light: '#2a78d6', dark: '#3987e5', emoji: '\uD83C\uDF5B' },
  { name: 'Rent/Hostel Fee',    light: '#eb6834', dark: '#d95926', emoji: '\uD83C\uDFE0' },
  { name: 'Books & Stationery', light: '#1baf7a', dark: '#199e70', emoji: '\uD83D\uDCDA' },
  { name: 'Travel',             light: '#eda100', dark: '#c98500', emoji: '\uD83D\uDE8C' },
  { name: 'Mobile/Internet',    light: '#e87ba4', dark: '#d55181', emoji: '\uD83D\uDCF1' },
  { name: 'Entertainment',      light: '#008300', dark: '#008300', emoji: '\uD83C\uDFAC' },
  { name: 'Health',             light: '#4a3aa7', dark: '#9085e9', emoji: '\uD83D\uDC8A' },
  { name: 'Personal Care',       light: '#0093a8', dark: '#0093a8', emoji: '\uD83E\uDDF4' },
  { name: 'Misc',               light: '#e34948', dark: '#e66767', emoji: '\uD83D\uDCE6' },
];

export const CATEGORY_NAMES = CATEGORIES.map((c) => c.name);

/**
 * The table above attaches a colour and an emoji to each category, so it has
 * to name them - which means it can fall behind the shared list. Saying so at
 * import time turns a silently uncoloured category into an obvious warning.
 */
if (import.meta.env.DEV) {
  const missing = CATEGORY_VOCABULARY.filter((name) => !CATEGORY_NAMES.includes(name));
  const extra = CATEGORY_NAMES.filter((name) => !CATEGORY_VOCABULARY.includes(name));
  if (missing.length || extra.length) {
    console.warn(
      '[constants] the category presentation table has drifted from @hisabkikitab/contracts',
      { missing, extra }
    );
  }
}

// Custom categories continue the same order rather than inventing new hues:
// slot 9 onward reuses the validated steps, which is safe because a chart
// with that many series folds the tail into "Other" anyway.
const overflowSlot = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CATEGORIES[Math.abs(hash) % CATEGORIES.length];
};

/** Stable colour for any category, in the mode the chart is rendering in. */
export const categoryColor = (name, isDark = false) => {
  const slot = CATEGORIES.find((c) => c.name === name) || overflowSlot(String(name || ''));
  return isDark ? slot.dark : slot.light;
};

export const categoryEmoji = (name) => {
  const known = CATEGORIES.find((c) => c.name === name);
  return known ? known.emoji : '\uD83C\uDFF7';
};

/** Sorts any list of {category,...} rows into the validated slot order. */
export const inCategoryOrder = (rows = []) => {
  const rank = (name) => {
    const index = CATEGORY_NAMES.indexOf(name);
    return index === -1 ? CATEGORY_NAMES.length : index;
  };
  return [...rows].sort((a, b) => rank(a.category) - rank(b.category));
};

/** Chart chrome. Axis, grid and ink never wear a series colour. */
export const CHART_INK = {
  light: {
    grid: '#dce8ff', axis: '#bfcfe8', muted: '#64748b', surface: '#ffffff', text: '#0b1742',
    primary: '#1468ff', accent: '#63adff',
  },
  dark: {
    grid: '#315080', axis: '#446497', muted: '#adc5e8', surface: '#102558', text: '#f5f9ff',
    primary: '#63adff', accent: '#9bcaff',
  },
};

/**
 * The repeat options, as the UI shows them.
 *
 * The values come from the shared contract so they cannot drift from what the
 * API accepts; only the wording is ours.
 */
const FREQUENCY_LABELS = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };

export const RECURRING_FREQUENCIES = RECURRING_VALUES.map((value) => ({
  value,
  label: FREQUENCY_LABELS[value] || value,
}));

export const GOAL_ICONS = [
  '\uD83C\uDFAF', '\uD83D\uDCBB', '\uD83D\uDCF1', '\uD83C\uDFD6', '\uD83C\uDF93',
  '\uD83D\uDEB2', '\uD83C\uDFA7', '\uD83D\uDC5F', '\uD83D\uDCF7', '\uD83D\uDEE1',
  '\uD83C\uDF81', '\uD83D\uDE97',
];

/**
 * Who built this, and how to reach them. Mirrors DEVELOPER in the backend
 * constants: this copy is for DISPLAY (footer links, the feedback dialog),
 * the server's copy is the address feedback is actually delivered to.
 */
/**
 * Budget traffic lights. These are STATUS colours, deliberately distinct from
 * the categorical slots, and they always ship with a text label so meaning is
 * never carried by colour alone.
 */
export const STATUS_STYLES = {
  safe: { bar: 'bg-safe', text: 'text-safe', bg: 'bg-safe/10 dark:bg-safe/15', label: 'On track' },
  warning: { bar: 'bg-caution', text: 'text-caution', bg: 'bg-caution/10 dark:bg-caution/15', label: 'Getting close' },
  over: { bar: 'bg-danger', text: 'text-danger', bg: 'bg-danger/10 dark:bg-danger/15', label: 'Over budget' },
  none: { bar: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800', label: 'No limit' },
};
