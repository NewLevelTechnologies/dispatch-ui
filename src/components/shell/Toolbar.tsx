import React from 'react'
import { Input, InputGroup } from '../catalyst/input'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

export function Toolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  rowCount,
  actions,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  rowCount?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-3 rounded-lg border border-border-subtle bg-surface-overlay shadow-sm px-3 py-2">
      <InputGroup className="w-56 shrink-0">
        <MagnifyingGlassIcon data-slot="icon" />
        <Input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
        />
      </InputGroup>

      {filters && <div className="flex items-center gap-1">{filters}</div>}

      {rowCount && (
        <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">{rowCount}</span>
      )}

      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
