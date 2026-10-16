import { useTranslation } from '@dispatch/i18n';
import type { ActivityEvent } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { formatExactTimestamp, formatTimestamp } from '@dispatch/utils';
import { Text } from './catalyst/text';
import {
  ChatBubbleLeftEllipsisIcon,
  TruckIcon,
  ArrowsUpDownIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import {
  CATEGORY_ICON_KEY,
  getEventContext,
  resolveEventSummary,
} from './activityFormatters';

// One activity event as a compact row (icon, summary, context line, byline).
// The Overview's recent-activity card uses it.
export function ActivityRow({ event }: { event: ActivityEvent }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const summary = resolveEventSummary(event, t, getName);
  const rawActorName = event.actor?.userName?.trim();
  const isMeaningfulActor =
    !!rawActorName && rawActorName.toLowerCase() !== 'unknown';
  const actorName = isMeaningfulActor
    ? rawActorName
    : t('workOrders.activity.systemActor');

  // Optional secondary line — for work-item events, render the work item's
  // identifier (today: description; future: equipment name when §7.5 lands)
  // as small muted text. Single-line clamp keeps long descriptions from
  // dominating the rail; the full text remains available via the work items
  // table on the main canvas.
  const context = getEventContext(event);

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
        {context && (
          <Text
            className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400"
            title={context}
          >
            {context}
          </Text>
        )}
        <Text className="mt-0.5 text-xs text-zinc-500" title={formatExactTimestamp(event.timestamp)}>
          {t('workOrders.activity.byline', {
            actor: actorName,
            time: formatTimestamp(event.timestamp),
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
    default:
      return <QuestionMarkCircleIcon className={`${className} text-zinc-500 dark:text-zinc-400`} />;
  }
}
