import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import type React from 'react'

export function TabGroup({ className, ...props }: React.ComponentPropsWithoutRef<typeof Headless.TabGroup>) {
  return <Headless.TabGroup {...props} className={clsx(className)} />
}

export function TabList({ className, ...props }: React.ComponentPropsWithoutRef<typeof Headless.TabList>) {
  return (
    <Headless.TabList
      {...props}
      className={clsx(
        className,
        'flex gap-4 border-b border-zinc-950/10 dark:border-white/10'
      )}
    />
  )
}

export function Tab({ className, ...props }: React.ComponentPropsWithoutRef<typeof Headless.Tab>) {
  return (
    <Headless.Tab
      {...props}
      className={clsx(
        className,
        'border-b-2 border-transparent px-1 py-2 text-sm font-medium transition',
        'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300',
        'data-selected:border-zinc-950 data-selected:text-zinc-950 dark:data-selected:border-white dark:data-selected:text-white',
        'focus:outline-none'
      )}
    />
  )
}

export function TabPanels({ className, ...props }: React.ComponentPropsWithoutRef<typeof Headless.TabPanels>) {
  return <Headless.TabPanels {...props} className={clsx(className, 'mt-4')} />
}

export function TabPanel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Headless.TabPanel>) {
  return <Headless.TabPanel {...props} className={clsx(className, 'focus:outline-none')} />
}
