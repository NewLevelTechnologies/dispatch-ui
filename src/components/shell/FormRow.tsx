import React from 'react'
import { Field, Label, Description } from '../catalyst/fieldset'

const COL_SPANS: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
  5: 'col-span-5', 6: 'col-span-6', 7: 'col-span-7', 8: 'col-span-8',
  9: 'col-span-9', 10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
}

export function FormRow({
  label,
  description,
  children,
  span,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  span?: number;
}) {
  const colClass = span ? (COL_SPANS[span] ?? 'col-span-6') : 'col-span-6'

  return (
    <Field className={colClass}>
      <Label className="text-xs">{label}</Label>
      {description && <Description className="text-xs">{description}</Description>}
      {children}
    </Field>
  )
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grid grid-cols-12 gap-x-4 gap-y-3 ${className ?? ''}`}>
      {children}
    </div>
  )
}
