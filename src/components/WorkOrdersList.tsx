import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  type ProgressCategory,
  type WorkOrderPriority,
} from '../api';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './catalyst/table';
import { Badge } from './catalyst/badge';
import { Text } from './catalyst/text';

const PROGRESS_COLORS: Record<ProgressCategory, 'zinc' | 'sky' | 'blue' | 'amber' | 'lime'> = {
  NOT_STARTED: 'zinc',
  IN_PROGRESS: 'blue',
  BLOCKED: 'amber',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const PRIORITY_COLORS: Record<WorkOrderPriority, 'zinc' | 'sky' | 'amber' | 'rose'> = {
  LOW: 'zinc',
  NORMAL: 'sky',
  HIGH: 'amber',
  URGENT: 'rose',
};

const PRIORITY_TRANSLATION_KEYS: Record<WorkOrderPriority, string> = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAddress(address: { streetAddress: string; city: string; state: string; zipCode: string }): string {
  return `${address.streetAddress}, ${address.city}, ${address.state} ${address.zipCode}`;
}

interface Props {
  /**
   * Pass exactly one of `customerId` / `serviceLocationId` — whichever scope the
   * page is on. Service location is the more specific filter and implies the
   * customer, so service-location pages should NOT pass both.
   */
  customerId?: string;
  serviceLocationId?: string;
  /** Whether to render the Service Location column. Defaults to true. */
  showLocation?: boolean;
  /** Page size requested from the API. Defaults to 25. */
  pageSize?: number;
}

export default function WorkOrdersList({
  customerId,
  serviceLocationId,
  showLocation = true,
  pageSize = 25,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const { data, isLoading, error } = useQuery(
    workOrdersListQueryOptions({ customerId, serviceLocationId, pageSize })
  );

  const items = data?.content ?? [];

  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
        <Text className="text-zinc-500 dark:text-zinc-400">
          {t('common.actions.loading', { entities: getName('work_order', true) })}
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <Text className="text-red-800 dark:text-red-400">
          {t('common.actions.errorLoading', { entities: getName('work_order', true) })}
          {`: ${(error as Error).message}`}
        </Text>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 p-8 text-center dark:border-zinc-800">
        <Text className="text-zinc-500 dark:text-zinc-400">
          {t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}
        </Text>
      </div>
    );
  }

  return (
    <Table dense className="[--gutter:theme(spacing.1)] text-sm">
      <TableHead>
        <TableRow>
          <TableHeader>{t('workOrders.table.id')}</TableHeader>
          {showLocation && <TableHeader>{getName('service_location')}</TableHeader>}
          <TableHeader>{t('workOrders.table.statusHeader')}</TableHeader>
          <TableHeader>{t('workOrders.table.priority')}</TableHeader>
          <TableHeader>{t('workOrders.table.scheduled')}</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((wo) => {
          const priority = wo.priority ?? 'NORMAL';
          const cancelled = wo.lifecycleState === 'CANCELLED';
          return (
            <TableRow key={wo.id} className={cancelled ? 'opacity-60' : ''}>
              <TableCell className="font-mono text-zinc-500">
                <RouterLink
                  to={`/work-orders/${wo.id}`}
                  className="text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                >
                  {wo.workOrderNumber || `#${wo.id.slice(0, 8)}`}
                </RouterLink>
              </TableCell>
              {showLocation && (
                <TableCell>
                  {wo.serviceLocation ? (
                    <RouterLink
                      to={`/service-locations/${wo.serviceLocation.id}`}
                      className="flex flex-col text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-300 dark:hover:text-blue-400"
                    >
                      {wo.serviceLocation.locationName ? (
                        <>
                          <span>{wo.serviceLocation.locationName}</span>
                          {wo.serviceLocation.address && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-500">
                              {formatAddress(wo.serviceLocation.address)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span>
                          {wo.serviceLocation.address
                            ? formatAddress(wo.serviceLocation.address)
                            : '-'}
                        </span>
                      )}
                    </RouterLink>
                  ) : (
                    <span>-</span>
                  )}
                </TableCell>
              )}
              <TableCell>
                {cancelled ? (
                  <Badge color="zinc">{t('workOrders.actions.cancelledBadge')}</Badge>
                ) : (
                  <Badge color={PROGRESS_COLORS[wo.progressCategory]}>
                    {t(
                      `workOrders.progress.${PROGRESS_TRANSLATION_KEYS[wo.progressCategory]}`
                    )}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <Badge color={PRIORITY_COLORS[priority]}>
                  {t(`workOrders.priority.${PRIORITY_TRANSLATION_KEYS[priority]}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-zinc-600 dark:text-zinc-400">
                {formatDate(wo.scheduledDate)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
