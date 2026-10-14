import { useTranslation } from '@dispatch/i18n';

/**
 * Top band on a public invoice or quote opened through the office's preview
 * link: what the customer will see, with nothing to approve or pay, and
 * opening it isn't counted as the customer viewing it.
 */
export default function PublicPreviewBanner({ customer }: { customer: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 print:hidden">
      <span className="font-semibold">{t('public.common.previewTitle')}</span>
      {' · '}
      {t('public.common.previewBody', { customer })}
    </div>
  );
}
