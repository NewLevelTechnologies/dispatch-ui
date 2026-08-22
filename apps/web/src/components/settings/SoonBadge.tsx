import clsx from 'clsx';
import { useTranslation } from '@dispatch/i18n';

export function SoonBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1 py-[1px] text-[9px] font-semibold uppercase tracking-[0.08em]',
        'bg-bg-active text-fg-muted',
        className,
      )}
    >
      {t('settings.soon')}
    </span>
  );
}
