import type { ReactNode } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { Button } from '../catalyst/button';
import { Callout } from '../ui/Callout';

/**
 * Pieces shared by the four Settings → Pricing pages (Pricebook, Labor
 * rates, Rate plans, Tax), so they read as one pattern: a view-only line
 * without MANAGE_PRICING, a setup callout only when something blocks
 * pricing, and inactive rows behind a toggle.
 */

/** One quiet line in place of the controls a viewer can't use. */
export function ViewOnlyNotice() {
  const { t } = useTranslation();
  return (
    <Callout kind="neutral" icon={null} className="mb-3">
      {t('settings.pricing.viewOnly')}
    </Callout>
  );
}

export interface SetupIssue {
  key: string;
  text: ReactNode;
  /** The fix, e.g. opening the dialog that sets the missing value. Omit for viewers. */
  action?: { label: string; onClick: () => void };
}

/** What blocks pricing and its consequence, one row per issue, each with its fix. Renders nothing when all is well. */
export function SetupIssues({ issues }: { issues: SetupIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      {issues.map((issue) => (
        <Callout
          key={issue.key}
          kind="warning"
          action={
            issue.action && (
              <Button outline size="xs" onClick={issue.action.onClick}>
                {issue.action.label}
              </Button>
            )
          }
        >
          {issue.text}
        </Callout>
      ))}
    </div>
  );
}

/** "Show inactive (2)" in a card head; hidden when there are none. */
export function InactiveToggle({ count, shown, onToggle }: { count: number; shown: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  if (!count) return null;
  return (
    <Button plain size="xs" onClick={onToggle}>
      {shown ? t('settings.pricing.hideInactive', { count }) : t('settings.pricing.showInactive', { count })}
    </Button>
  );
}
