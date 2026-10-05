/** @type {import('tailwindcss').Config} */

/**
 * Hisabki Kitab theme.
 *
 * The look is warm and paper-like rather than the cool blue-grey most dashboards
 * default to: a cream page, near-white cards, a terracotta accent and a serif
 * for headings.
 *
 * `slate` is deliberately REDEFINED as a warm taupe ramp instead of Tailwind's
 * cool blue-grey. Every component already speaks in slate-*, so overriding the
 * scale re-skins the whole app from one place with no per-component edits.
 * Every text step below was contrast-checked against the real card and page
 * surfaces (all body pairs clear 4.5:1).
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm taupe neutrals (replaces Tailwind's cool slate).
        slate: {
          50: '#faf9f7',
          100: '#f3f1ec',
          200: '#e1ddd2',
          300: '#d6d1c4',
          400: '#b0aa9c',
          500: '#726c5d',
          600: '#5f594d',
          700: '#47423a',
          800: '#332f2a',
          900: '#262421', // dark card
          950: '#1a1917', // dark page
        },

        // Terracotta accent.
        brand: {
          50: '#fbf4f1',
          100: '#f6e6df',
          200: '#eccebf',
          300: '#deab94',
          400: '#cd8460',
          500: '#c05f3c',
          600: '#a94e30',
          700: '#8c3f28',
          800: '#713424',
          900: '#5c2c20',
        },

        // The paper the app is printed on.
        canvas: {
          light: '#f5f4ee',
          card: '#fdfcfa',
          dark: '#1a1917',
          darkCard: '#262421',
        },

        // Status colours. Kept clearly distinct from the terracotta accent, and
        // always paired with an icon + text label so meaning is never colour alone.
        safe: '#2f7d4f',
        caution: '#a16207',
        danger: '#b3261e',
      },

      fontFamily: {
        // Body: a clean grotesque.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Headings: an old-style serif, applied to h1 in the base layer.
        display: ['"Source Serif 4"', 'Iowan Old Style', 'Georgia', 'ui-serif', 'serif'],
      },

      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },

      boxShadow: {
        /**
         * A four-step elevation scale. Every shadow is tinted with the page's
         * own warm ink (38 36 33) rather than pure black - a grey shadow on a
         * cream page reads as dirt, which is most of what makes a warm palette
         * look cheap.
         *
         * Surfaces still carry a hairline border; the shadow only says how far
         * off the page something sits.
         */
        card: '0 1px 2px 0 rgb(38 36 33 / 0.04)',
        raised: '0 1px 2px 0 rgb(38 36 33 / 0.05), 0 2px 6px -2px rgb(38 36 33 / 0.06)',
        lift: '0 2px 8px -2px rgb(38 36 33 / 0.10), 0 1px 3px -1px rgb(38 36 33 / 0.06)',
        float: '0 12px 28px -8px rgb(38 36 33 / 0.16), 0 4px 10px -4px rgb(38 36 33 / 0.08)',
        // For the terracotta panel and primary buttons: the accent's own hue.
        brand: '0 6px 18px -6px rgb(192 95 60 / 0.45)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // Staggered entrance for a grid of cards - see .hw-enter.
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'rise-in': 'rise-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
