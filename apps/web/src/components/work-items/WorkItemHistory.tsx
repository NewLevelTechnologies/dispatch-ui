import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { auditApi, type WorkItemResponse } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { auditEntryRow } from '../../lib/workOrderActivityRows';
import { AuditRow } from '../LocationActivityStream';

const SHOWN = 5;

/**
 * The item's own edit history — description, findings, equipment, estimate —
 * from audit-service. Field edits deliberately stay out of the work order's
 * activity feed; this is where they're read. Needs VIEW_AUDIT_LOGS, and hides
 * when there's nothing to show.
 */
export default function WorkItemHistory({ wi }: { wi: WorkItemResponse }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canView = useHasAnyCapability('VIEW_AUDIT_LOGS');
  const [all, setAll] = useState(false);

  // Keyed on updatedAt so an edit on this page refetches the history.
  const { data: entries = [] } = useQuery({
    queryKey: ['work-item-audit', wi.id, wi.updatedAt],
    queryFn: () => auditApi.getWorkItemChanges(wi.id),
    enabled: canView,
  });

  if (!canView || entries.length === 0) return null;
  const entity = getName('work_item');
  const shown = all ? entries : entries.slice(0, SHOWN);

  return (
    <section className="card" aria-label={t('workOrders.workItems.history')}>
      <div className="card-head">
        <div className="card-title">{t('workOrders.workItems.history')}</div>
        <span className="card-sub">{t('workOrders.workItems.historyHint')}</span>
        <span className="flex-1" />
        {entries.length > SHOWN && (
          <button type="button" className="card-action" onClick={() => setAll((v) => !v)}>
            {all ? t('workOrders.workItems.showLess') : t('workOrders.workItems.showAll', { count: entries.length })}
          </button>
        )}
      </div>
      <div className="card-body flush">
        {shown.map((a) => (
          <AuditRow key={a.id} row={auditEntryRow(a, t, entity)} />
        ))}
      </div>
    </section>
  );
}
