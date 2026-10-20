import { useTranslation } from '@dispatch/i18n';

/** "3 new · 2 changed · 1 removed" — how a release is worded everywhere it's
 *  counted (board button, confirm, toast, home dashboard). Empty when nothing
 *  is owed. */
export function useReleaseParts() {
  const { t } = useTranslation();
  return (counts?: { newCount: number; changedCount: number; removedCount: number } | null) =>
    counts
      ? [
          counts.newCount > 0 && t('dispatchBoard.release.partNew', { count: counts.newCount }),
          counts.changedCount > 0 &&
            t('dispatchBoard.release.partChanged', { count: counts.changedCount }),
          counts.removedCount > 0 &&
            t('dispatchBoard.release.partRemoved', { count: counts.removedCount }),
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
}
