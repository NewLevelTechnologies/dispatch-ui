import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  notificationApi,
  type NotificationLogsQueryParams,
  NotificationStatus,
  NotificationChannel,
} from '../api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './catalyst/table';
import { Badge } from './catalyst/badge';
import { Text } from './catalyst/text';
import { Subheading } from './catalyst/heading';
import { Select } from './catalyst/select';
import { Button } from './catalyst/button';
import { EnvelopeIcon, DevicePhoneMobileIcon, BellIcon } from '@heroicons/react/24/outline';

interface NotificationLogsListProps {
  customerId?: string;
  entityType?: string;
  entityId?: string;
}

export default function NotificationLogsList({
  customerId,
  entityType,
  entityId,
}: NotificationLogsListProps) {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<NotificationStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<NotificationChannel | ''>('');

  const queryParams: NotificationLogsQueryParams = useMemo(() => {
    const params: NotificationLogsQueryParams = {
      page,
      size: 20,
      sort: 'createdAt,desc',
    };
    if (customerId) params.customerId = customerId;
    if (entityType) params.entityType = entityType;
    if (entityId) params.entityId = entityId;
    if (statusFilter) params.status = statusFilter;
    if (channelFilter) params.channel = channelFilter;
    return params;
  }, [customerId, entityType, entityId, page, statusFilter, channelFilter]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['notification-logs', queryParams],
    queryFn: () => notificationApi.getNotificationLogs(queryParams),
  });

  const getStatusBadgeColor = (status: NotificationStatus) => {
    switch (status) {
      case NotificationStatus.DELIVERED:
        return 'lime';
      case NotificationStatus.SENT:
        return 'blue';
      case NotificationStatus.PENDING:
        return 'amber';
      case NotificationStatus.BOUNCED:
      case NotificationStatus.FAILED:
        return 'rose';
      default:
        return 'zinc';
    }
  };

  const getChannelIcon = (channel: NotificationChannel) => {
    switch (channel) {
      case NotificationChannel.EMAIL:
        return <EnvelopeIcon className="h-4 w-4" />;
      case NotificationChannel.SMS:
        return <DevicePhoneMobileIcon className="h-4 w-4" />;
      case NotificationChannel.PUSH:
        return <BellIcon className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <Text className="text-red-800 dark:text-red-400">
          {t('notifications.logs.errorLoad')}
          {error && `: ${(error as Error).message}`}
        </Text>
      </div>
    );
  }

  const logs = data?.content || [];
  const totalElements = data?.totalElements || 0;
  const totalPages = data?.totalPages || 1;
  const currentPage = page + 1; // Convert 0-indexed to 1-indexed for display

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Subheading>{t('notifications.logs.title')}</Subheading>
        <div className="flex gap-2">
          <Select
            name="statusFilter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as NotificationStatus | '');
              setPage(0);
            }}
            className="w-40"
          >
            <option value="">{t('notifications.logs.filters.allStatuses')}</option>
            <option value={NotificationStatus.DELIVERED}>{t('notifications.logs.status.delivered')}</option>
            <option value={NotificationStatus.SENT}>{t('notifications.logs.status.sent')}</option>
            <option value={NotificationStatus.PENDING}>{t('notifications.logs.status.pending')}</option>
            <option value={NotificationStatus.BOUNCED}>{t('notifications.logs.status.bounced')}</option>
            <option value={NotificationStatus.FAILED}>{t('notifications.logs.status.failed')}</option>
          </Select>
          <Select
            name="channelFilter"
            value={channelFilter}
            onChange={(e) => {
              setChannelFilter(e.target.value as NotificationChannel | '');
              setPage(0);
            }}
            className="w-40"
          >
            <option value="">{t('notifications.logs.filters.allChannels')}</option>
            <option value={NotificationChannel.EMAIL}>{t('notifications.preferences.channelEmail')}</option>
            <option value={NotificationChannel.SMS}>{t('notifications.preferences.channelSms')}</option>
            <option value={NotificationChannel.PUSH}>{t('notifications.preferences.channelPush')}</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center">
          <Text>{t('notifications.logs.loading')}</Text>
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('notifications.logs.noLogs')}
          </Text>
        </div>
      ) : (
        <>
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('notifications.logs.table.type')}</TableHeader>
                <TableHeader>{t('notifications.logs.table.recipient')}</TableHeader>
                <TableHeader>{t('notifications.logs.table.channel')}</TableHeader>
                <TableHeader>{t('notifications.logs.table.status')}</TableHeader>
                <TableHeader>{t('notifications.logs.table.sent')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{log.notificationTypeName}</span>
                      {log.subject && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{log.subject}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{log.recipientName}</span>
                      {log.recipientEmail && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{log.recipientEmail}</span>
                      )}
                      {log.recipientPhone && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{log.recipientPhone}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {getChannelIcon(log.channel)}
                      <span>{log.channel}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge color={getStatusBadgeColor(log.status)}>{log.status}</Badge>
                      {log.errorMessage && (
                        <span className="text-xs text-red-600 dark:text-red-400" title={log.errorMessage}>
                          {log.errorMessage.length > 50
                            ? `${log.errorMessage.substring(0, 50)}...`
                            : log.errorMessage}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs">
                      <span>{formatDate(log.createdAt)}</span>
                      {log.deliveredAt && (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {t('notifications.logs.table.delivered')}: {formatDate(log.deliveredAt)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
                <span>{t('common.pagination.showing', { start: page * 20 + 1, end: Math.min((page + 1) * 20, totalElements), total: totalElements })}</span>
                <span>{t('common.pagination.pageOf', { page: currentPage, total: totalPages })}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  plain
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  {t('common.pagination.previous')}
                </Button>
                <Button
                  plain
                  disabled={page === totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  {t('common.pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
