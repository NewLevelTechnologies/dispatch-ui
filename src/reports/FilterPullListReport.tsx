import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { reportsApi, type FilterPullListEntry } from '../api';
import ReportLayout from '../components/ReportLayout';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Text } from '../components/catalyst/text';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table';

type Mode = 'single' | 'range';

function todayLocal(): string {
  // YYYY-MM-DD in local time. The backend treats the date as the tenant's
  // operational day, so we don't want UTC drift to push it to yesterday.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Trailing zeros drop naturally via Number.toString.
function formatInches(n: number): string {
  return String(n);
}

function formatSize(e: FilterPullListEntry): string {
  return `${formatInches(e.lengthIn)} × ${formatInches(e.widthIn)} × ${formatInches(e.thicknessIn)}`;
}

export default function FilterPullListReport() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('single');
  const [singleDate, setSingleDate] = useState<string>(todayLocal());
  const [rangeFrom, setRangeFrom] = useState<string>(todayLocal());
  const [rangeTo, setRangeTo] = useState<string>(todayLocal());

  const params = useMemo(() => {
    if (mode === 'single') {
      return { scheduledDate: singleDate };
    }
    return { scheduledDateFrom: rangeFrom, scheduledDateTo: rangeTo };
  }, [mode, singleDate, rangeFrom, rangeTo]);

  const { data: entries = [], isLoading, error } = useQuery({
    queryKey: ['report-filter-pull-list', params],
    queryFn: () => reportsApi.filterPullList(params),
  });

  const totalQuantity = useMemo(
    () => entries.reduce((sum, e) => sum + e.totalQuantity, 0),
    [entries]
  );

  const dateLabel = useMemo(() => {
    if (mode === 'single') return singleDate;
    return rangeFrom === rangeTo ? rangeFrom : `${rangeFrom} → ${rangeTo}`;
  }, [mode, singleDate, rangeFrom, rangeTo]);

  return (
    <ReportLayout
      title={t('reports.filterPullList.title')}
      description={t('reports.filterPullList.description')}
      filters={
        <>
          <Field>
            <Label className="text-xs">{t('reports.filterPullList.mode')}</Label>
            <div className="flex h-9 gap-1">
              {(['single', 'range'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={[
                    'flex items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-medium ring-1 ring-inset transition-colors',
                    mode === m
                      ? 'bg-blue-100 text-blue-800 ring-blue-400 dark:bg-blue-900 dark:text-blue-100 dark:ring-blue-600'
                      : 'bg-white text-zinc-500 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700 dark:hover:bg-zinc-800',
                  ].join(' ')}
                >
                  {t(`reports.filterPullList.mode_${m}`)}
                </button>
              ))}
            </div>
          </Field>

          {mode === 'single' ? (
            <Field>
              <Label className="text-xs">{t('reports.filterPullList.date')}</Label>
              <Input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field>
                <Label className="text-xs">{t('reports.filterPullList.from')}</Label>
                <Input
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                />
              </Field>
              <Field>
                <Label className="text-xs">{t('reports.filterPullList.to')}</Label>
                <Input
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                />
              </Field>
            </>
          )}
        </>
      }
    >
      {/* Print-only context line so the printed copy is self-describing */}
      <div className="hidden print:block mb-4">
        <Text className="text-sm">
          {t('reports.filterPullList.printContext', { date: dateLabel })}
        </Text>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <Text className="text-sm text-red-800 dark:text-red-400">
            {t('reports.errorLoading')}: {(error as Error).message}
          </Text>
        </div>
      )}

      {!error && isLoading ? (
        <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
          <Text className="text-zinc-500 dark:text-zinc-400">{t('reports.loading')}</Text>
        </div>
      ) : !error && entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <Text className="text-zinc-600 dark:text-zinc-400">
            {t('reports.filterPullList.empty', { date: dateLabel })}
          </Text>
        </div>
      ) : (
        !error && (
          <>
            <Table dense className="text-sm">
              <TableHead>
                <TableRow>
                  <TableHeader>{t('reports.filterPullList.size')}</TableHeader>
                  <TableHeader className="text-right">
                    {t('reports.filterPullList.quantity')}
                  </TableHeader>
                  <TableHeader className="text-right">
                    {t('reports.filterPullList.equipmentCount')}
                  </TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={`${e.lengthIn}-${e.widthIn}-${e.thicknessIn}`}>
                    <TableCell className="font-mono">{formatSize(e)}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-lg font-semibold tabular-nums text-zinc-950 dark:text-white">
                        {e.totalQuantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                      {e.equipmentCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex justify-end">
              <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('reports.filterPullList.total', { count: totalQuantity })}
              </Text>
            </div>
          </>
        )
      )}
    </ReportLayout>
  );
}
