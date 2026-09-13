/* eslint-disable i18next/no-literal-string -- structural test: the strings are
   placeholders for measuring control height, not user-facing copy. */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Button } from '../components/catalyst/button';
import { Select } from '../components/catalyst/select';
import { FilterChip } from '../components/ui/FilterChipRow';
import { ListSearch } from '../components/ui/ListToolbar';

// The spec's main fix: one control height per band. These assert the declared
// class rather than a computed pixel, because jsdom has no layout — but a
// declared height is exactly what was missing, so it is the right thing to pin.
describe('chrome band control heights', () => {
  it('puts every band 1–2 control at 26px', () => {
    const { container: btn } = render(<Button size="xxs">x</Button>);
    expect(btn.querySelector('button')?.className).toContain('h-[26px]');

    const { container: sel } = render(
      <Select size="xxs" aria-label="s">
        <option>a</option>
      </Select>,
    );
    expect(sel.querySelector('select')?.className).toContain('h-[26px]');

    // The search sizes its input through an arbitrary variant on the wrapper
    // (the icon overlap needs the group), so the height lives there.
    const { container: search } = render(
      <ListSearch compact placeholder="find" value="" onChange={() => {}} />,
    );
    // Nearest control ancestor: InputGroup wraps the Input, and both carry
    // the slot, so reach it from the input rather than from the top.
    expect(
      search.querySelector('input')?.closest('[data-slot="control"]')?.className,
    ).toContain('[&_input]:h-[26px]');
  });

  // 24, not 26: a fully-rounded pill reads heavier than a square-cornered
  // field at equal height.
  it('keeps the filter chip two pixels shorter', () => {
    const { container } = render(
      <FilterChip variant="dense" label="Urgent" count={0} active={false} onToggle={() => {}} />,
    );
    expect(container.querySelector('button')?.className).toContain('h-6');
  });
});

// Preflight's unlayered `button/select { font: inherit }` outranks a layered
// text-size utility, so these render at the body's 13px without the important
// modifier. The trap is invisible — nothing errors, the type is just wrong.
describe('chrome band type sizes', () => {
  it('forces 11.5px past the inherited font on the select', () => {
    const { container } = render(
      <Select size="xxs" aria-label="s">
        <option>a</option>
      </Select>,
    );
    expect(container.querySelector('select')?.className).toContain('!text-[11.5px]');
  });

  it('forces it past the inherited font on the chip', () => {
    const { container } = render(
      <FilterChip variant="dense" label="Urgent" count={0} active={false} onToggle={() => {}} />,
    );
    expect(container.querySelector('button')?.className).toContain('!text-[11.5px]');
  });
});
