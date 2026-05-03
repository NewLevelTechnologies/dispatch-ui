import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { Heading } from './catalyst/heading';
import { Text } from './catalyst/text';
import { Button } from './catalyst/button';

interface ReportLayoutProps {
  /** Page title shown in the header. */
  title: string;
  /** One-line description shown under the title. */
  description?: string;
  /**
   * Filter controls (date pickers, scope selectors, etc.) rendered on the left
   * side of the action bar. Use a flex container with gap if passing multiple.
   */
  filters?: ReactNode;
  /**
   * Extra action buttons rendered alongside the built-in Print button on the
   * right side of the action bar (e.g. Export CSV). Optional.
   */
  actions?: ReactNode;
  /** The report body — table, chart, summary cards, etc. */
  children: ReactNode;
}

/**
 * Shared chrome for every page under /reports. Provides:
 *   - Back link to the reports hub
 *   - Title + optional description
 *   - Filters area (left) and actions area (right) including a built-in Print
 *   - Print-friendly styles: when printing the user sees the report at full
 *     bleed without the app's sidebar / header chrome
 *
 * Reports themselves don't wrap in AppLayout — this component is meant to be
 * used inside an AppLayout-wrapped route page so techs can use back-nav, but
 * @media print hides AppLayout's chrome leaving just the content.
 */
export default function ReportLayout({
  title,
  description,
  filters,
  actions,
  children,
}: ReportLayoutProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print stylesheet: hides app chrome on @media print so the report
          prints at full bleed. The body of the report is wrapped in a
          .print-report container that escapes the hidden chrome. */}
      <style>{`
        @media print {
          /* Hide AppLayout sidebar + header */
          [data-slot="sidebar"],
          [data-slot="navbar"],
          .print-hide { display: none !important; }
          /* Reset body padding for full bleed */
          body, html { background: white !important; color: black !important; }
          .print-report { padding: 0 !important; }
          .print-report * { color: black !important; }
        }
      `}</style>

      <div className="print-report p-4">
        {/* Back link — hidden on print */}
        <div className="mb-2 print-hide">
          <Button plain onClick={() => navigate('/reports')}>
            <ArrowLeftIcon className="size-4" />
            {t('reports.backToReports')}
          </Button>
        </div>

        {/* Title + description */}
        <div>
          <Heading className="text-2xl">{title}</Heading>
          {description && (
            <Text className="mt-1 text-zinc-600 dark:text-zinc-400">{description}</Text>
          )}
        </div>

        {/* Action bar: filters left, actions right. Hidden on print since
            the printed copy is for the date the user already chose. */}
        {(filters || actions !== undefined) && (
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3 print-hide">
            <div className="flex flex-wrap items-end gap-3">{filters}</div>
            <div className="flex items-center gap-2">
              {actions}
              <Button onClick={handlePrint}>
                <PrinterIcon className="size-4" />
                {t('reports.print')}
              </Button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="mt-4">{children}</div>
      </div>
    </>
  );
}
