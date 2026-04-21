import React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../catalyst/table'

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-3.5 w-3/4 rounded bg-border-default animate-pulse" />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function DataTable<T>({
  columns,
  rows,
  isLoading,
  emptyState,
  skeletonRows = 8,
  getRowKey,
  getRowHref,
  getRowClassName,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  skeletonRows?: number;
  getRowKey: (row: T) => string | number;
  getRowHref?: (row: T) => string | undefined;
  getRowClassName?: (row: T) => string | undefined;
}) {
  return (
    <Table dense className="[--gutter:theme(spacing.1)] text-sm">
      <TableHead>
        <TableRow>
          {columns.map((col) => (
            <TableHeader key={col.key} className={col.headerClassName ?? col.className}>
              {col.header}
            </TableHeader>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {isLoading ? (
          Array.from({ length: skeletonRows }).map((_, i) => (
            <SkeletonRow key={i} cols={columns.length} />
          ))
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-text-tertiary">
              {emptyState}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const href = getRowHref?.(row)
            return (
              <TableRow
                key={getRowKey(row)}
                href={href}
                className={getRowClassName?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.cellClassName ?? col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            )
          })
        )}
      </TableBody>
    </Table>
  )
}
