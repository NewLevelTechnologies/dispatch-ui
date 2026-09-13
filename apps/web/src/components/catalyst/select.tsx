import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import React, { forwardRef } from 'react'

// Sizing variants. `md` is the stock Catalyst sizing (responsive). `xs` is the
// dense variant — ~32px tall, 12.5px text — mirroring the Input `xs` size.
//
// `xxs` is the operational-chrome token: 26px and 11.5px, the same numbers as
// Button `xxs`, so a filter sits at exactly the height of the search field and
// the toggle track beside it. Height is DECLARED rather than derived from
// padding, because a content-sized control is how one band ends up with three
// heights. It also sizes to its content instead of filling the row — this one
// lives inline in a band, not in a form column.
const sizes = {
  md: ['py-[calc(--spacing(2.5)-1px)] sm:py-[calc(--spacing(1.5)-1px)]', 'text-base/6 sm:text-sm/6'],
  xs: ['py-[calc(--spacing(1.5)-1px)]', 'text-[12.5px]/[18px]'],
  xxs: ['h-[26px] py-0', '!text-[11.5px]/[24px]'],
}

export const Select = forwardRef(function Select(
  { className, multiple, size, ...props }: { className?: string; size?: keyof typeof sizes } & Omit<Headless.SelectProps, 'as' | 'className' | 'size'>,
  ref: React.ForwardedRef<HTMLSelectElement>
) {
  return (
    <span
      data-slot="control"
      className={clsx([
        className,
        // Basic layout
        size === 'xxs' ? 'group relative inline-block w-auto' : 'group relative block w-full',
        // Background color + shadow applied to inset pseudo element, so shadow blends with border in light mode
        'before:absolute before:inset-px before:rounded-[calc(var(--radius-lg)-1px)] before:bg-white before:shadow-sm',
        // Background color is moved to control and shadow is removed in dark mode so hide `before` pseudo
        'dark:before:hidden',
        // Focus ring
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-transparent after:ring-inset has-data-focus:after:ring-2 has-data-focus:after:ring-blue-500',
        // Disabled state
        'has-data-disabled:opacity-50 has-data-disabled:before:bg-bg-active has-data-disabled:before:shadow-none',
      ])}
    >
      <Headless.Select
        ref={ref}
        multiple={multiple}
        {...props}
        className={clsx([
          // Basic layout
          size === 'xxs'
            ? 'relative block w-auto appearance-none rounded-md'
            : 'relative block w-full appearance-none rounded-lg',
          sizes[size ?? 'md'][0],
          // Horizontal padding — the chrome token is tighter on both sides,
          // since it sits in a band where gap does the spacing.
          size === 'xxs'
            ? 'pr-7 pl-2'
            : multiple
              ? 'px-[calc(--spacing(3.5)-1px)] sm:px-[calc(--spacing(3)-1px)]'
              : 'pr-[calc(--spacing(10)-1px)] pl-[calc(--spacing(3.5)-1px)] sm:pr-[calc(--spacing(9)-1px)] sm:pl-[calc(--spacing(3)-1px)]',
          // Options (multi-select)
          '[&_optgroup]:font-semibold',
          // Typography
          sizes[size ?? 'md'][1],
          'text-fg-strong placeholder:text-fg-dim',
          // Border
          'border border-border data-hover:border-border-strong',
          // Background color (option list bg uses elevated surface in dark mode)
          'bg-transparent dark:bg-bg dark:*:bg-bg',
          // Hide default focus styles
          'focus:outline-hidden',
          // Invalid state
          'data-invalid:border-red-500 data-invalid:data-hover:border-red-500 dark:data-invalid:border-red-600 dark:data-invalid:data-hover:border-red-600',
          // Disabled state
          'data-disabled:border-border-soft data-disabled:opacity-100',
        ])}
      />
      {!multiple && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg
            className="size-5 stroke-fg-muted group-has-data-disabled:stroke-fg-dim sm:size-4 forced-colors:stroke-[CanvasText]"
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
          >
            <path d="M5.75 10.75L8 13L10.25 10.75" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.25 5.25L8 3L5.75 5.25" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </span>
  )
})
