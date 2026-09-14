// ─────────────────────────────────────────────────────────────────────
// Invariants on the map pin stylesheet.
//
// These exist because this exact class of bug has now happened twice in the
// design source: a CSS rule quietly contradicting the prose it sits under,
// and the stylesheet winning because that is what gets copied. `.db-pin.held`
// replaced the status fill while the spec said release is orthogonal to
// status; `.db-pin.un.hot` flipped the dashed ring solid while the spec said
// emphasis is size and elevation only.
//
// Both are invisible in review and obvious on screen. A test is cheap.
// ─────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'dispatch-board.css'), 'utf8');

/** Declarations inside one exact selector's block. */
function declarationsFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!match) throw new Error(`No rule found for ${selector}`);
  return match[2];
}

describe('.db-pin.held — release owns the RING, status owns the FILL', () => {
  it('exists', () => {
    expect(() => declarationsFor('.db-pin.held')).not.toThrow();
  });

  it('never touches the fill: a scheduled-but-held pin must still read blue', () => {
    // A 22px pin has exactly one fill channel. Spending it on release state
    // makes status invisible on the map, which is the bug this reproduces.
    expect(declarationsFor('.db-pin.held')).not.toMatch(/background/);
  });

  it('changes only the border STYLE, not its colour', () => {
    const rule = declarationsFor('.db-pin.held');
    expect(rule).toMatch(/border-style:\s*dashed/);
    expect(rule).not.toMatch(/border-color/);
  });
});

describe('.db-pin.hot — cross-surface hover is size and elevation only', () => {
  it('emphasises without colour: accent means selection, and hover is transient', () => {
    const rule = declarationsFor('.db-pin.hot');
    expect(rule).toMatch(/transform:\s*scale/);
    expect(rule).not.toMatch(/background|border-color|accent/);
  });

  it('never changes the border style — the dashed ring is how you know a pin is unassigned', () => {
    // Flipping it solid on hover would strip the identifying mark at the exact
    // moment the dispatcher is trying to read it.
    expect(declarationsFor('.db-pin.hot')).not.toMatch(/border/);
  });
});

describe('status fills stay on the shared vocabulary', () => {
  it('never paints a pin with an accent variable — accent is selection only', () => {
    const statusRules = [
      '.db-pin',
      '.db-pin.enroute,\n.db-pin.inprogress',
      '.db-pin.completed',
      '.db-pin.noshow',
    ];
    statusRules.forEach((selector) => {
      expect(declarationsFor(selector)).not.toMatch(/accent/);
    });
  });

  it('reserves the accent outline for the selected pin', () => {
    expect(declarationsFor('.db-pin.sel')).toMatch(/outline:\s*2px solid var\(--accent-500\)/);
  });
});
