import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'

export function Fieldset({
  className,
  ...props
}: { className?: string } & Omit<Headless.FieldsetProps, 'as' | 'className'>) {
  return (
    <Headless.Fieldset
      {...props}
      className={clsx(className, '*:data-[slot=text]:mt-1 [&>*+[data-slot=control]]:mt-6')}
    />
  )
}

export function Legend({
  className,
  ...props
}: { className?: string } & Omit<Headless.LegendProps, 'as' | 'className'>) {
  return (
    <Headless.Legend
      data-slot="legend"
      {...props}
      className={clsx(
        className,
        'text-base/6 font-semibold text-zinc-950 data-disabled:opacity-50 sm:text-sm/6 dark:text-white'
      )}
    />
  )
}

export function FieldGroup({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div data-slot="control" {...props} className={clsx(className, 'space-y-8')} />
}

// `size="xs"` tightens label-control adjacency to 4px (from the stock 12px) so
// dense forms get the v1.5 look without per-call-site spacing overrides.
export function Field({
  className,
  size,
  ...props
}: { className?: string; size?: 'xs' } & Omit<Headless.FieldProps, 'as' | 'className'>) {
  const xs = size === 'xs'
  return (
    <Headless.Field
      {...props}
      className={clsx(
        className,
        xs
          ? [
              '[&>[data-slot=label]+[data-slot=control]]:mt-1',
              '[&>[data-slot=label]+[data-slot=description]]:mt-0.5',
              '[&>[data-slot=description]+[data-slot=control]]:mt-1',
              '[&>[data-slot=control]+[data-slot=description]]:mt-1',
              '[&>[data-slot=control]+[data-slot=error]]:mt-1',
            ]
          : [
              '[&>[data-slot=label]+[data-slot=control]]:mt-3',
              '[&>[data-slot=label]+[data-slot=description]]:mt-1',
              '[&>[data-slot=description]+[data-slot=control]]:mt-3',
              '[&>[data-slot=control]+[data-slot=description]]:mt-3',
              '[&>[data-slot=control]+[data-slot=error]]:mt-3',
              '*:data-[slot=label]:font-medium',
            ]
      )}
    />
  )
}

// Label gains two dense-form affordances:
//   · `hint` renders inline next to the label text (· hint) instead of a
//     separate-line Description, so each field doesn't gain a row of height.
//   · `required` renders a single danger-colored `*` after the text.
// Both work in any size; they're just visually tuned for `xs`.
export function Label({
  className,
  size,
  hint,
  required,
  children,
  ...props
}: {
  className?: string
  size?: 'xs'
  hint?: React.ReactNode
  required?: boolean
  children?: React.ReactNode
} & Omit<Headless.LabelProps, 'as' | 'className' | 'children'>) {
  const xs = size === 'xs'
  return (
    <Headless.Label
      data-slot="label"
      {...props}
      className={clsx(
        className,
        xs
          ? 'text-[11px] font-semibold text-fg-strong select-none data-disabled:opacity-50'
          : 'text-base/6 text-zinc-950 select-none data-disabled:opacity-50 sm:text-sm/6 dark:text-white'
      )}
    >
      {children}
      {required && (
        <span aria-hidden="true" className={xs ? 'ml-0.5 text-danger-500' : 'ml-0.5 text-red-600'}>
          *
        </span>
      )}
      {hint && (
        <span
          className={
            xs
              ? 'ml-1.5 text-[10.5px] font-normal text-fg-dim'
              : 'ml-1.5 text-sm font-normal text-zinc-500 dark:text-zinc-400'
          }
        >
          · {hint}
        </span>
      )}
    </Headless.Label>
  )
}

export function Description({
  className,
  size,
  ...props
}: { className?: string; size?: 'xs' } & Omit<Headless.DescriptionProps, 'as' | 'className'>) {
  const xs = size === 'xs'
  return (
    <Headless.Description
      data-slot="description"
      {...props}
      className={clsx(
        className,
        xs
          ? 'text-[10.5px] text-fg-dim data-disabled:opacity-50'
          : 'text-base/6 text-zinc-500 data-disabled:opacity-50 sm:text-sm/6 dark:text-zinc-400'
      )}
    />
  )
}

export function ErrorMessage({
  className,
  size,
  ...props
}: { className?: string; size?: 'xs' } & Omit<Headless.DescriptionProps, 'as' | 'className'>) {
  const xs = size === 'xs'
  return (
    <Headless.Description
      data-slot="error"
      {...props}
      className={clsx(
        className,
        xs
          ? 'text-[11px] text-danger-500 data-disabled:opacity-50'
          : 'text-base/6 text-red-600 data-disabled:opacity-50 sm:text-sm/6 dark:text-red-500'
      )}
    />
  )
}
