import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, parseAppearance } from '@shared';

describe('parseAppearance', () => {
  it('keeps valid choices', () => {
    expect(parseAppearance({ palette: 'lavendel', mode: 'dark', font: 'serif' })).toEqual({ palette: 'lavendel', mode: 'dark', font: 'serif' });
  });
  it('falls back per field for unknown or missing values', () => {
    expect(parseAppearance({ palette: 'neon', mode: 'light' })).toEqual({ ...DEFAULT_APPEARANCE, mode: 'light' });
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('garbage')).toEqual(DEFAULT_APPEARANCE);
  });
});
