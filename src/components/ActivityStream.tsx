import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  activityApi,
  type ActivityCategory,
  type ActivityEvent,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { Text } from './catalyst/text';
import {
  ChatBubbleLeftEllipsisIcon,
  CurrencyDollarIcon,
  TruckIcon,
  ArrowsUpDownIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import {
  CATEGORY_ICON_KEY,
  getEventEntityCode,
  getEventTemplateKey,
  preFormatEventData,
} from './activityFormatters';

// 25 fits the rail's role as a side surface — top events answer the glance-case;
// deeper history pages in invisibly via the IntersectionObserver sentinel. Backend
// default is 50; we override deliberately to keep initial paint light.
const PAGE_SIZE = 25;
const DAY_MS = 24 * 3600 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface Props {
  workOrderId: string;
}

export default function ActivityStream({ workOrderId }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [filter, setFilter] = useState<ActivityCategory | 'ALL'>('ALL');
  const queryFilter = filter === 'ALL' ? undefined : [filter];

  // Filter chip labels resolved per render — DISPATCH flows through glossary so a
  // tenant who renames "Dispatch" to "Service Call" sees "Service Calls" here.
  const filterOptions: { id: ActivityCategory | 'ALL'; label: string }[] = [
    { id: 'ALL', label: t('workOrders.activity.filter.all') },
    { id: 'NOTE', label: t('workOrders.activity.filter.notes') },
    { id: 'DISPATCH', label: getName('dispatch', true) },
    { id: 'STATUS', label: t('workOrders.activity.filter.status') },
    { id: 'FINANCIAL', label: t('workOrders.activity.filter.financial') },
  ];

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['work-order-activity', workOrderId, filter],
    queryFn: ({ pageParam }) =>
      activityApi.list(workOrderId, {
        cursor: pageParam,
        limit: PAGE_SIZE,
        categories: queryFilter,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!workOrderId,
  });

  const events = data?.pages.flatMap((p) => p.content) ?? [];

  // IntersectionObserver-based infinite scroll. Simpler than full virtualization
  // and adequate for typical event volumes — revisit if WOs routinely accumulate
  // thousands of events.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isEmpty = !isLoading && !error && events.length === 0;
  const emptyKey =
    filter === 'ALL'
      ? 'workOrders.activity.empty'
      : 'workOrders.activity.emptyForFilter';

  return (
    <section aria-label={t('workOrders.activity.heading')}>
      {/* Sticky within the scrolling rail so filters stay reachable when the user
          scrolls deep into history. -mx-1 + px-1 lets the background bleed past
          the rail's content padding to fully cover events sliding underneath. */}
      <div className="sticky top-0 z-10 -mx-1 bg-white px-1 pt-1 dark:bg-zinc-900">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('workOrders.activity.heading')}
        </h3>

        <div className="mb-3 flex flex-wrap gap-1">
          {filterOptions.map((f) => {
            const selected = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={selected}
                className={
                  selected
                    ? 'rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white'
                    : 'rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && (
        <Text className="text-sm text-zinc-500">
          {t('workOrders.activity.loading')}
        </Text>
      )}

      {error && (
        <Text className="text-sm text-red-700 dark:text-red-400">
          {t('workOrders.activity.errorLoading')}
        </Text>
      )}

      {isEmpty && <Text className="text-sm text-zinc-500">{t(emptyKey)}</Text>}

      <ol className="flex flex-col">{renderEventGroups(events, t)}</ol>

      {hasNextPage && (
        <div ref={sentinelRef} className="py-2 text-center">
          <Text className="text-xs text-zinc-500">
            {isFetchingNextPage
              ? t('workOrders.activity.loading')
              : t('workOrders.activity.loadMore')}
          </Text>
        </div>
      )}
    </section>
  );
}

interface DayBucket {
  /** Stable key for grouping (e.g. "today", "yesterday", "older-2026-3-15"). */
  key: string;
  /** Human-readable label rendered in the day header. */
  label: string;
}

function getDayBucket(iso: string, t: (key: string) => string): DayBucket {
  const eventDate = new Date(iso);
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = startOfDay(new Date());
  const eventStart = startOfDay(eventDate);
  const diff = todayStart - eventStart;

  if (diff === 0) return { key: 'today', label: t('workOrders.activity.day.today') };
  if (diff === DAY_MS) {
    return { key: 'yesterday', label: t('workOrders.activity.day.yesterday') };
  }
  if (diff > 0 && diff < WEEK_MS) {
    return { key: 'thisWeek', label: t('workOrders.activity.day.thisWeek') };
  }
  // Older — bucket per calendar day; label is the formatted date
  const key = `older-${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
  const label = eventDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return { key, label };
}

function renderEventGroups(
  events: ActivityEvent[],
  t: (key: string, params?: Record<string, unknown>) => string
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastBucketKey: string | null = null;
  for (const evt of events) {
    const bucket = getDayBucket(evt.timestamp, t);
    if (bucket.key !== lastBucketKey) {
      out.push(<DayHeader key={`hdr-${bucket.key}`} label={bucket.label} />);
      lastBucketKey = bucket.key;
    }
    out.push(<ActivityRow key={evt.id} event={evt} />);
  }
  return out;
}

function DayHeader({ label }: { label: string }) {
  return (
    <li
      className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 first:mt-0 dark:text-zinc-400"
      aria-hidden="true"
    >
      {label}
    </li>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const templateKey = getEventTemplateKey(event.kind);
  const data = preFormatEventData(event);
  // Resolve {{entity}} / {{entities}} placeholders in templates from the glossary
  // so tenant renames ("Work Order" → "Job", "Dispatch" → "Service Call") render
  // correctly in the activity feed.
  const entityCode = getEventEntityCode(event.kind);
  const entityFields = entityCode
    ? { entity: getName(entityCode), entities: getName(entityCode, true) }
    : {};
  const summary = t(templateKey, { ...data, ...entityFields });
  const rawActorName = event.actor?.userName?.trim();
  const isMeaningfulActor =
    !!rawActorName && rawActorName.toLowerCase() !== 'unknown';
  const actorName = isMeaningfulActor
    ? rawActorName
    : t('workOrders.activity.systemActor');

  return (
    <li className="flex gap-2 border-t border-zinc-100 py-2 first:border-t-0 dark:border-zinc-800">
      <div className="mt-0.5 shrink-0">
        <CategoryIcon category={event.category} />
      </div>
      <div className="min-w-0 flex-1">
        {/* whitespace-pre-wrap so multi-line note bodies preserve their formatting;
            single-line statuses are unaffected. */}
        <Text className="whitespace-pre-wrap text-sm break-words text-zinc-700 dark:text-zinc-300">
          {summary}
        </Text>
        <Text className="mt-0.5 text-xs text-zinc-500">
          {t('workOrders.activity.byline', {
            actor: actorName,
            time: formatRelativeTime(event.timestamp),
          })}
        </Text>
      </div>
    </li>
  );
}

function CategoryIcon({ category }: { category: ActivityEvent['category'] }) {
  const key = CATEGORY_ICON_KEY[category];
  const className = 'size-4';
  switch (key) {
    case 'note':
      return <ChatBubbleLeftEllipsisIcon className={`${className} text-blue-500 dark:text-blue-400`} />;
    case 'dispatch':
      return <TruckIcon className={`${className} text-amber-500 dark:text-amber-400`} />;
    case 'status':
      return <ArrowsUpDownIcon className={`${className} text-zinc-500 dark:text-zinc-400`} />;
    case 'financial':
      return <CurrencyDollarIcon className={`${className} text-emerald-500 dark:text-emerald-400`} />;
    default:
      return <QuestionMarkCircleIcon className={`${className} text-zinc-500 dark:text-zinc-400`} />;
  }
}
