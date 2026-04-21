import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClockIcon, UserIcon } from '@heroicons/react/24/outline';
import { auditApi, type AuditLog } from '../api/auditApi';
import { Badge } from './catalyst/badge';
import { Subheading } from './catalyst/heading';

interface AuditHistoryProps {
  entityType: string;
  entityId: string;
}

export default function AuditHistory({ entityType, entityId }: AuditHistoryProps) {
  const { t } = useTranslation();

  const { data: auditLogs, isLoading, error } = useQuery({
    queryKey: ['audit', entityType, entityId],
    queryFn: () => auditApi.getEntityHistory(entityType, entityId),
  });

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (action: AuditLog['action']) => {
    switch (action) {
      case 'CREATE':
        return 'lime';
      case 'UPDATE':
        return 'sky';
      case 'DELETE':
        return 'red';
      default:
        return 'zinc';
    }
  };

  const renderFieldChanges = (log: AuditLog) => {
    if (log.action === 'CREATE') {
      return (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {t('audit.initialValues')}:
          </p>
          {log.newValues && Object.entries(log.newValues).map(([key, value]) => {
            // Skip internal/system fields
            if (key === 'id' || key === 'tenantId' || key === 'createdAt' || key === 'updatedAt') {
              return null;
            }
            return (
              <div key={key} className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">{key}:</span> {renderValue(value)}
              </div>
            );
          })}
        </div>
      );
    }

    if (log.action === 'UPDATE') {
      const changes: [string, any, any][] = [];
      if (log.oldValues && log.newValues) {
        Object.keys(log.newValues).forEach(key => {
          // Skip internal/system fields and unchanged values
          if (key === 'id' || key === 'tenantId' || key === 'createdAt' || key === 'updatedAt') {
            return;
          }
          const oldValue = log.oldValues![key];
          const newValue = log.newValues![key];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes.push([key, oldValue, newValue]);
          }
        });
      }

      if (changes.length === 0) {
        return (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
            {t('audit.noFieldChanges')}
          </p>
        );
      }

      return (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {t('audit.changedFields')}:
          </p>
          {changes.map(([key, oldValue, newValue]) => (
            <div key={key} className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {key}
              </p>
              <div className="mt-1 flex items-start gap-2 text-xs">
                <div className="flex-1">
                  <span className="text-red-600 dark:text-red-400">- </span>
                  <span className="text-zinc-600 line-through dark:text-zinc-400">
                    {renderValue(oldValue)}
                  </span>
                </div>
                <div className="flex-1">
                  <span className="text-green-600 dark:text-green-400">+ </span>
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {renderValue(newValue)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (log.action === 'DELETE') {
      return (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {t('audit.deletedValues')}:
          </p>
          {log.oldValues && Object.entries(log.oldValues).map(([key, value]) => {
            if (key === 'id' || key === 'tenantId' || key === 'createdAt' || key === 'updatedAt') {
              return null;
            }
            return (
              <div key={key} className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">{key}:</span> {renderValue(value)}
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  };

  const renderValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '(empty)';
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  if (isLoading) {
    return (
      <div className="rounded-lg bg-zinc-50 p-6 text-center dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('audit.loading')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">
          {t('audit.errorLoading')}: {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-50 p-6 text-center dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('audit.noHistory')}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {t('audit.noHistoryHelper')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Subheading>{t('audit.title')}</Subheading>

      <div className="space-y-4">
        {auditLogs.map((log) => (
          <div
            key={log.id}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <UserIcon className="size-5 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {log.userName}
                  </p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    {log.userEmail}
                  </p>
                  {log.userRole && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-500">
                      {log.userRole}
                    </p>
                  )}
                </div>
              </div>
              <Badge color={getActionColor(log.action)}>
                {log.action}
              </Badge>
            </div>

            {/* Timestamp */}
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-500">
              <ClockIcon className="size-4" />
              <span>{formatTimestamp(log.timestamp)}</span>
            </div>

            {/* Field Changes */}
            {renderFieldChanges(log)}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-900">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {t('audit.totalEvents', { count: auditLogs.length })}
        </p>
      </div>
    </div>
  );
}
