import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import AppLayout from '../components/AppLayout';
import { PageHead } from '../components/ui/PageHead';
import { Pill } from '../components/ui/Pill';
import { EmptyState } from '../components/ui/EmptyState';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useGlossary } from '../contexts/GlossaryContext';
import { REPORT_GROUPS, reports } from '../reports/registry';

/**
 * The Reports catalog: a grouped list (Money · Work · People · Sales), one
 * row per report the user can open. A report the user lacks the capability
 * for isn't shown, and neither is a group left empty.
 */
export default function ReportsPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { data: user } = useCurrentUser();
  // Glossary names the catalog's copy may use.
  const words = {
    dispatches: getName('dispatch', true),
    division: getName('division'),
    invoices: getName('invoice', true),
    region: getName('dispatch_region'),
    tech: getName('technician'),
    techs: getName('technician', true),
    workOrder: getName('work_order'),
    workOrders: getName('work_order', true),
  };
  const can = (cap: string | undefined) => !cap || (user?.capabilities?.includes(cap) ?? false);
  const visible = reports.filter((r) => can(r.requiresCapability));
  const groups = REPORT_GROUPS.map((g) => ({ id: g, items: visible.filter((r) => r.group === g) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <AppLayout>
      <PageHead title={t('reports.title')} sub={t('reports.description')} />
      {groups.length === 0 ? (
        <EmptyState title={t('reports.empty')} />
      ) : (
        <div className="rp-catalog">
          {groups.map((g) => (
            <section key={g.id} className="card" aria-labelledby={`reports-${g.id}`}>
              <h2 id={`reports-${g.id}`} className="rp-cat-group">
                {t(`reports.groups.${g.id}`)}
              </h2>
              {g.items.map((r) => (
                <RouterLink key={r.slug} to={`/reports/${r.slug}`} className="rp-cat-row">
                  <span className="rp-cat-text">
                    <span className="rp-cat-name">
                      {t(`reports.catalog.${r.slug}.name`, words)}
                      {r.kind === 'list' && <Pill tone="neutral">{t('reports.printList')}</Pill>}
                    </span>
                    <span className="rp-cat-desc">{t(`reports.catalog.${r.slug}.description`, words)}</span>
                    {r.fromHome && (
                      <span className="rp-cat-from">
                        {t('reports.alsoFromHome', { where: t(`reports.catalog.${r.slug}.fromHome`, words) })}
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon className="size-3.5 shrink-0 text-fg-muted" />
                </RouterLink>
              ))}
            </section>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
