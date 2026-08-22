import clsx from 'clsx'

type HeadingSize = 'page-lg' | 'page-md' | 'page-sm'

type HeadingProps = {
  level?: 1 | 2 | 3 | 4 | 5 | 6
  size?: HeadingSize
} & React.ComponentPropsWithoutRef<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'>

const SIZE_CLASSES: Record<HeadingSize, string> = {
  'page-lg': 'text-[22px] leading-[1.2] font-bold tracking-[-0.022em] text-fg-strong',
  'page-md': 'text-[20px] leading-[1.2] font-bold tracking-[-0.022em] text-fg-strong',
  'page-sm': 'text-[18px] leading-[1.25] font-bold tracking-[-0.02em] text-fg-strong',
}

export function Heading({ className, level = 1, size, ...props }: HeadingProps) {
  const Element: `h${typeof level}` = `h${level}`

  return (
    <Element
      {...props}
      className={clsx(
        size ? SIZE_CLASSES[size] : 'text-2xl/8 font-semibold text-fg-strong sm:text-xl/8',
        className
      )}
    />
  )
}

export function Subheading({ className, level = 2, ...props }: HeadingProps) {
  const Element: `h${typeof level}` = `h${level}`

  return (
    <Element
      {...props}
      className={clsx(className, 'text-base/7 font-semibold text-fg-strong sm:text-sm/6')}
    />
  )
}
