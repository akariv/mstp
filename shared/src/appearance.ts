/** Per-user display preferences. Keep the lists in sync with firestore.rules (validAppearance). */
export const PALETTES = ['schrift', 'lavendel', 'munt', 'perzik', 'lucht'] as const;
export const MODES = ['system', 'light', 'dark'] as const;
export const FONTS = ['sans', 'serif', 'comic'] as const;

export type Palette = (typeof PALETTES)[number];
export type Mode = (typeof MODES)[number];
export type Font = (typeof FONTS)[number];

export interface Appearance {
  palette: Palette;
  mode: Mode;
  font: Font;
}

export const DEFAULT_APPEARANCE: Appearance = { palette: 'schrift', mode: 'system', font: 'sans' };

export function parseAppearance(v: unknown): Appearance {
  const a = (v && typeof v === 'object' ? v : {}) as Partial<Record<keyof Appearance, unknown>>;
  return {
    palette: PALETTES.includes(a.palette as Palette) ? (a.palette as Palette) : DEFAULT_APPEARANCE.palette,
    mode: MODES.includes(a.mode as Mode) ? (a.mode as Mode) : DEFAULT_APPEARANCE.mode,
    font: FONTS.includes(a.font as Font) ? (a.font as Font) : DEFAULT_APPEARANCE.font,
  };
}
