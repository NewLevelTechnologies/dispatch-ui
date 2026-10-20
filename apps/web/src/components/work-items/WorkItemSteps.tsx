import type { CSSProperties } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/16/solid';
import type { StepNote, WorkItemStep } from '../../lib/workItemSteps';
import { localDate, shortDate } from './format';

/** The derived step strip under the detail header (see lib/workItemSteps). */
export default function WorkItemSteps({ steps }: { steps: WorkItemStep[] }) {
  const { t } = useTranslation();

  const note = (n?: StepNote): string | null => {
    if (!n) return null;
    switch (n.kind) {
      case 'date':
        return shortDate(n.iso);
      case 'po': {
        const eta = n.eta ? ` · ${t('workOrders.workItems.steps.eta', { date: localDate(n.eta) })}` : '';
        const more = n.more > 0 ? ` +${n.more}` : '';
        return `${n.poNumber}${eta}${more}`;
      }
      case 'quote':
        return n.status === 'ACCEPTED'
          ? n.number
          : `${n.number} · ${t(`workOrders.workItems.docStatus.QUOTE.${n.status}`, { defaultValue: n.status })}`;
      case 'declined':
        return t('workOrders.workItems.steps.declinedOn', { number: n.number });
      case 'expired':
        return t('workOrders.workItems.steps.expiredOn', { number: n.number });
      default:
        return t(`workOrders.workItems.steps.${n.kind}`);
    }
  };

  return (
    <ol className="wit-steps m-0 list-none" style={{ '--n': steps.length } as CSSProperties}>
      {steps.map((s) => {
        const sub = note(s.note);
        return (
          <li key={s.key} className={`wit-step s-${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="wit-bar" />
            <span className="flex items-center gap-[5px]">
              {s.state === 'done' && <CheckIcon className="size-3 text-success-500" aria-hidden />}
              {s.state === 'blocked' && <ExclamationTriangleIcon className="size-3 text-warning-fg" aria-hidden />}
              <span className="wit-steplabel">{t(`workOrders.workItems.steps.${s.key}`)}</span>
            </span>
            {sub && <span className="wit-stepsub">{sub}</span>}
          </li>
        );
      })}
    </ol>
  );
}
