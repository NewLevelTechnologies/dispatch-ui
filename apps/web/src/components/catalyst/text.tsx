import clsx from 'clsx'
import { Link } from './link'

type TextSize = 'md' | 'sm' | 'xs'
type TextTone = 'default' | 'strong' | 'muted' | 'dim'
type TextElement = 'p' | 'span' | 'div'

type TextProps = {
  size?: TextSize
  tone?: TextTone
  as?: TextElement
} & Omit<React.ComponentPropsWithoutRef<'p'>, 'color'>

const SIZE_CLASSES: Record<TextSize, string> = {
  md: 'text-[13px] leading-[1.45]',
  sm: 'text-[12.5px] leading-[1.45]',
  xs: 'text-[11px] leading-[1.4]',
}

const TONE_CLASSES: Record<TextTone, string> = {
  default: 'text-fg',
  strong: 'text-fg-strong',
  muted: 'text-fg-muted',
  dim: 'text-fg-dim',
}

export function Text({
  className,
  size = 'md',
  tone = 'default',
  as: As = 'p',
  ...props
}: TextProps) {
  return (
    <As
      data-slot="text"
      {...props}
      className={clsx('m-0', SIZE_CLASSES[size], TONE_CLASSES[tone], className)}
    />
  )
}

export function TextLink({ className, ...props }: React.ComponentPropsWithoutRef<typeof Link>) {
  return (
    <Link
      {...props}
      className={clsx(
        className,
        'text-zinc-950 underline decoration-zinc-950/50 data-hover:decoration-zinc-950 dark:text-white dark:decoration-white/50 dark:data-hover:decoration-white'
      )}
    />
  )
}

export function Strong({ className, ...props }: React.ComponentPropsWithoutRef<'strong'>) {
  return <strong {...props} className={clsx(className, 'font-medium text-fg-strong')} />
}

export function Code({ className, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  return (
    <code
      {...props}
      className={clsx(
        className,
        'rounded-sm border border-zinc-950/10 bg-zinc-950/2.5 px-0.5 text-sm font-medium text-zinc-950 sm:text-[0.8125rem] dark:border-white/20 dark:bg-white/5 dark:text-white'
      )}
    />
  )
}
