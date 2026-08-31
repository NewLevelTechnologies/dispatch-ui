import type { ReactNode } from 'react';
import { useTranslation } from '@dispatch/i18n';

type Props = {
  count: number;
  noun: string;
  extra?: ReactNode;
};

export function SettingsListFooter({ count, noun, extra }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-4 py-2 text-[11.5px] text-fg-muted">
      <span>
        {t('settings.showingCount', { count, noun })}
      </span>
      {extra}
    </div>
  );
}
