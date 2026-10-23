/**
 * Raw token values, mirroring tailwind.config.js.
 *
 * Prefer Tailwind classes (`bg-grow-50`, `text-brand-700`) in components. Reach for this
 * file only where a real colour value is required rather than a class: StatusBar and
 * navigation theming, chart libraries, native module options, and animated values.
 *
 * If a value changes here it must change in tailwind.config.js too — they are the same
 * palette expressed twice, and the pair is checked in the M1 review.
 */

export const colors = {
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
  accent: {
    100: '#FFE8D1',
    200: '#FFD0A3',
    500: '#FE7F02',
    600: '#E06E00',
    700: '#B85A00',
  },
  grow: { 50: '#F2FFE2', 100: '#DCF5D3', 500: '#31A72F', 600: '#187F21', 700: '#0F6318' },
  invest: { 50: '#FFF6E5', 100: '#FDE8C0', 500: '#F2A93B', 600: '#D98A16', 700: '#A66408' },
  avoid: { 50: '#FFE7E7', 100: '#FFCCCC', 500: '#E0304A', 600: '#B80C26', 700: '#8F0A1E' },
  info: { 50: '#EEF4FE', 500: '#689FF8', 600: '#3D7DE0' },
  ink: { default: '#1A1A1A', muted: '#6B6B6B', faint: '#A6A6A6' },
  line: { default: '#DFDFDF', soft: '#EFEFEF' },
  surface: { default: '#FFFFFF', sunken: '#F7F7F7' },
  white: '#FFFFFF',
} as const;

/**
 * The three verdicts the app is allowed to express. Every recommendation surface maps
 * into exactly one of these, so the colour and the meaning can never drift apart.
 */
export type Verdict = 'grow' | 'invest' | 'avoid';

export const verdictPalette: Record<
  Verdict,
  { surface: string; border: string; text: string; solid: string }
> = {
  grow: {
    surface: colors.grow[50],
    border: colors.grow[100],
    text: colors.grow[700],
    solid: colors.grow[600],
  },
  invest: {
    surface: colors.invest[50],
    border: colors.invest[100],
    text: colors.invest[700],
    solid: colors.invest[600],
  },
  avoid: {
    surface: colors.avoid[50],
    border: colors.avoid[100],
    text: colors.avoid[700],
    solid: colors.avoid[600],
  },
};

/** Minimum touch target in dp — outdoor use, gloved or dusty hands, low literacy. */
export const MIN_TOUCH_TARGET = 48;

export const radii = { field: 12, card: 16, pill: 999 } as const;
