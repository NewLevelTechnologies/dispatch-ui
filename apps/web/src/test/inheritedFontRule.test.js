import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../eslint-rules/inherited-font-on-form-control.js';

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('inherited-font-on-form-control', () => {
  it('catches what Preflight would override, and nothing else', () => {
    tester.run('inherited-font-on-form-control', rule, {
      valid: [
        // Already forced past the inherited font.
        '<button className="!text-[11px] !font-semibold" />',
        // Not a form control — `font: inherit` never touches it.
        '<span className="text-[11px] font-semibold" />',
        '<div className="text-sm font-medium" />',
        // Colour, not size: the shorthand does not carry colour.
        '<button className="text-[var(--warning-fg)]" />',
        '<button className="text-[#fff] text-fg-muted text-danger-500" />',
        // Reached through clsx and a ternary, but already forced.
        '<button className={clsx("base", on ? "!font-bold" : "!font-normal")} />',
      ],
      invalid: [
        {
          code: '<button className="text-[11px]" />',
          output: '<button className="!text-[11px]" />',
          errors: 1,
        },
        {
          code: '<select className="font-medium" />',
          output: '<select className="!font-medium" />',
          errors: 1,
        },
        // Size and weight are separate properties of the shorthand, so both
        // have to be forced — two findings on one attribute.
        {
          code: '<button className="text-sm font-semibold" />',
          output: '<button className="!text-sm !font-semibold" />',
          errors: 2,
        },
        // The real-world shape: a member-expression component, class buried in
        // a clsx branch.
        {
          code: '<Headless.ListboxButton className={clsx("px-2", "font-medium")} />',
          output: '<Headless.ListboxButton className={clsx("px-2", "!font-medium")} />',
          errors: 1,
        },
      ],
    });
  });
});
