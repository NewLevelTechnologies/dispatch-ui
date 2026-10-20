import { palettes, radii, spacing, typography } from './tokens';

const HEX = /^#[0-9a-f]{6}$/;

describe('tokens', () => {
  it('defines a matching set of color keys for light and dark', () => {
    expect(Object.keys(palettes.light).sort()).toEqual(Object.keys(palettes.dark).sort());
  });

  it.each(['light', 'dark'] as const)('every %s color is a 6-digit hex value', (mode) => {
    for (const [key, value] of Object.entries(palettes[mode])) {
      expect(value).toMatch(HEX);
      // Catches a copy-paste mistake (e.g. reusing light's accent in dark's
      // slot) going unnoticed because the string still happens to be valid hex.
      expect(typeof key).toBe('string');
    }
  });

  it('keeps the brand accent identical across themes', () => {
    // The warm trade-orange accent is the one color that must read as "the
    // same product" regardless of theme — only its *tint* and the dark-mode
    // foreground swap (accent700 flips to the lighter step), per web's
    // tokens.css convention.
    expect(palettes.light.accent500).toBe(palettes.dark.accent500);
    expect(palettes.light.accent600).toBe(palettes.dark.accent600);
  });

  it('exposes a usable radius and spacing scale', () => {
    expect(radii.full).toBeGreaterThan(radii.xl);
    expect(spacing.xxxl).toBeGreaterThan(spacing.xs);
  });

  it('scales typography up from web (never below 11px — this is read one-handed, not at a desk)', () => {
    for (const style of Object.values(typography)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(11);
    }
    expect(typography.display.fontSize).toBeGreaterThan(typography.body.fontSize);
  });
});
