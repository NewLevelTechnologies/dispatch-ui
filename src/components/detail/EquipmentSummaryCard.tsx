/* eslint-disable i18next/no-literal-string -- dense detail card; entity names go through getName(), inline counts/labels stay literal to match the surrounding detail pages. */
// Shared equipment rollup-by-type card — the overview inventory peek. Used by
// BOTH the Location detail overview and the SINGLE customer overview (a SINGLE
// customer has one location, so the customer's equipment IS the site's). Pure
// presentation: pass the equipment list + a View-all handler.
//
// First card extracted into the shared `detail/` module from
// ServiceLocationDetailPage. Chrome (CardLink/CardTitle) is reused from
// customer-detail/shared for now; see project_customer_detail_redesign for the
// remaining extraction sequence.
import { useMemo } from 'react';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import type { EquipmentSummary } from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Card } from '../catalyst/card';
import { CardLink, CardTitle } from '../customer-detail/shared';

export function EquipmentSummaryCard({
  equipment,
  onViewAll,
}: {
  equipment: EquipmentSummary[];
  onViewAll: () => void;
}) {
  const { getName } = useGlossary();

  const byType = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of equipment) {
      const type = e.equipmentTypeName || 'Other';
      acc[type] = (acc[type] || 0) + 1;
    }
    return acc;
  }, [equipment]);

  return (
    <Card
      title={<CardTitle icon={<WrenchScrewdriverIcon className="size-3.5" />}>{getName('equipment', true)}</CardTitle>}
      action={<CardLink onClick={onViewAll}>View all {equipment.length} →</CardLink>}
      padding="none"
    >
      {equipment.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          {getName('equipment', true)} not recorded at this site yet.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 bg-bg-elev-2 px-3.5 py-2.5">
          {Object.entries(byType).map(([type, n]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="font-mono text-[12px] font-bold tabular-nums text-fg-strong">{n}</span>
              <span className="text-[11.5px] text-fg-muted">{type}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
