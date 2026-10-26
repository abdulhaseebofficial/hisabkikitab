/** @type {import('tailwindcss').Config} */

/**
 * Hisabki Kitab theme.
 *
 * Approved blue light and dark palettes are supplied by CSS custom properties
 * in index.css. Existing components keep their semantic Tailwind tokens while
 * the existing theme provider switches the dark class on <html>.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      screens: {
        xs: '380px',
      },
      colors: {
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          700: 'rgb(var(--slate-700) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },

        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },

        canvas: {
          light: 'rgb(var(--canvas-background) / <alpha-value>)',
          card: 'rgb(var(--canvas-surface) / <alpha-value>)',
          dark: 'rgb(var(--canvas-background) / <alpha-value>)',
          darkCard: 'rgb(var(--canvas-surface) / <alpha-value>)',
          raised: 'rgb(var(--canvas-raised) / <alpha-value>)',
        },

        // Keep baseline financial status colors; the homepage uses brand tokens.
        safe: '#2f7d4f',
        caution: '#a16207',
        danger: '#b3261e',
      },

      fontFamily: {
        // Body: a clean grotesque.
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Headings use the same polished sans-serif as the rest of the interface.
        display: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },

      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },

      boxShadow: {
        // Theme-aware shadows preserve depth across both blue surfaces.
        card: '0 1px 2px rgb(var(--shadow-ink) / 0.35)',
        raised: '0 8px 24px -16px rgb(var(--shadow-ink) / 0.8)',
        lift: '0 14px 34px -18px rgb(var(--shadow-ink) / 0.9)',
        float: '0 24px 60px -24px rgb(var(--brand-600) / 0.55)',
        brand: '0 10px 30px -12px rgb(var(--brand-400) / 0.72)',
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
        'soft-float': {
          '0%, 100%': { transform: 'translateY(0) rotate(-1deg)' },
          '50%': { transform: 'translateY(-10px) rotate(1deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'rise-in': 'rise-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'soft-float': 'soft-float 5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
