/**
 * AgroPulse design tokens.
 *
 * Palette derived from the design reference in app_assets/ (see DESIGN_DIRECTION.md).
 * The three semantic scales below are load-bearing for the whole product, because the
 * recommendation screen speaks in exactly three verdicts:
 *
 *   grow   → Segment A: grow now, no fertiliser needed
 *   invest → Segment B: viable, but costs money in inputs
 *   avoid  → not advisable / destructive errors
 *
 * Always reach for `grow` / `invest` / `avoid` rather than raw green/amber/red so the
 * meaning travels with the colour.
 *
 * Fonts are intentionally absent here: they are loaded in M1 (Poppins + Noto Sans
 * Devanagari). Referencing a font family before it is loaded renders a silent fallback.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.ts', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Deep forest green — headers, primary buttons, navigation chrome.
        brand: {
          50: '#F2F8EE',
          100: '#E4F0DC',
          200: '#C7E0B9',
          300: '#9BC788',
          400: '#6BA855',
          500: '#2F6639',
          600: '#1F5A2A',
          700: '#22421A',
          800: '#1A3313',
          900: '#12240D',
        },
        // Marigold orange — the single call-to-action accent. Use sparingly.
        accent: {
          100: '#FFE8D1',
          200: '#FFD0A3',
          500: '#FE7F02',
          600: '#E06E00',
          700: '#B85A00',
        },
        // Segment A: grow now, no fertiliser required.
        grow: {
          50: '#F2FFE2',
          100: '#DCF5D3',
          500: '#31A72F',
          600: '#187F21',
          700: '#0F6318',
        },
        // Segment B: viable with a stated fertiliser cost.
        invest: {
          50: '#FFF6E5',
          100: '#FDE8C0',
          500: '#F2A93B',
          600: '#D98A16',
          700: '#A66408',
        },
        // Not advisable, and destructive/error states.
        avoid: {
          50: '#FFE7E7',
          100: '#FFCCCC',
          500: '#E0304A',
          600: '#B80C26',
          700: '#8F0A1E',
        },
        info: {
          50: '#EEF4FE',
          500: '#689FF8',
          600: '#3D7DE0',
        },
        ink: {
          DEFAULT: '#1A1A1A',
          muted: '#6B6B6B',
          faint: '#A6A6A6',
        },
        line: {
          DEFAULT: '#DFDFDF',
          soft: '#EFEFEF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          sunken: '#F7F7F7',
        },
      },
      borderRadius: {
        card: '16px',
        field: '12px',
        pill: '999px',
      },
      spacing: {
        // Minimum comfortable touch target for low-literacy / outdoor use (48dp).
        touch: '48px',
      },
      fontSize: {
        // Floor is 16sp; nothing in this app renders body copy below it.
        body: ['16px', { lineHeight: '24px' }],
        'body-lg': ['18px', { lineHeight: '28px' }],
        title: ['22px', { lineHeight: '30px' }],
        display: ['28px', { lineHeight: '36px' }],
      },
    },
  },
  plugins: [],
};
