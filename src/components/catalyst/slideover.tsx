import * as Headless from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type React from 'react'
import { Button } from './button'
import { Text } from './text'

export function SlideOver({
  className,
  children,
  ...props
}: { className?: string; children: React.ReactNode } & Omit<Headless.DialogProps, 'as' | 'className'>) {
  return (
    <Headless.Dialog {...props}>
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/25 transition duration-100 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in dark:bg-zinc-950/50"
      />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <Headless.DialogPanel
              transition
              className={clsx(
                className,
                'pointer-events-auto w-screen max-w-4xl transform transition duration-200 ease-in-out data-closed:translate-x-full sm:duration-300'
              )}
            >
              <div className="flex h-full flex-col bg-white shadow-xl dark:bg-zinc-900">
                {children}
              </div>
            </Headless.DialogPanel>
          </div>
        </div>
      </div>
    </Headless.Dialog>
  )
}

export function SlideOverHeader({
  className,
  onClose,
  children,
  ...props
}: { className?: string; onClose?: () => void; children: React.ReactNode } & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div {...props} className={clsx(className, 'border-b border-zinc-950/10 px-6 py-4 dark:border-white/10')}>
      <div className="flex items-start justify-between">
        <div className="flex-1">{children}</div>
        {onClose && (
          <div className="ml-3 flex h-7 items-center">
            <Button plain onClick={onClose}>
              <XMarkIcon className="h-6 w-6" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function SlideOverTitle({
  className,
  ...props
}: { className?: string } & Omit<Headless.DialogTitleProps, 'as' | 'className'>) {
  return (
    <Headless.DialogTitle
      {...props}
      className={clsx(className, 'text-lg font-semibold text-zinc-950 dark:text-white')}
    />
  )
}

export function SlideOverDescription({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps<typeof Text>, 'as' | 'className'>) {
  return <Headless.Description as={Text} {...props} className={clsx(className, 'mt-1 text-sm')} />
}

export function SlideOverBody({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={clsx(className, 'flex-1 overflow-y-auto px-6 py-6')} />
}

export function SlideOverFooter({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={clsx(
        className,
        'border-t border-zinc-950/10 px-6 py-4 dark:border-white/10',
        'flex flex-shrink-0 items-center justify-end gap-3'
      )}
    />
  )
}
