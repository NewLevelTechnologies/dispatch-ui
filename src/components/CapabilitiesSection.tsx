import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { userApi } from '../api';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import { Subheading } from './catalyst/heading';

interface CapabilitiesSectionProps {
  /** Array of capability names the user/role has */
  capabilities: string[];
}

/**
 * Collapsible capabilities section for User/Role detail pages
 * Shows a compact summary by default, expands to show organized view
 */
export default function CapabilitiesSection({ capabilities = [] }: CapabilitiesSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: capabilitiesData, isLoading } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
    enabled: isExpanded, // Only fetch when expanded
  });

  // Count capabilities by feature area
  const getStats = () => {
    if (!capabilitiesData) return null;

    const groupsWithCaps = capabilitiesData.groups
      .map(group => ({
        name: group.displayName,
        count: group.capabilities.filter(cap => capabilities.includes(cap.name)).length,
      }))
      .filter(g => g.count > 0);

    return groupsWithCaps;
  };

  const stats = getStats();
  const totalCount = capabilities.length;

  if (totalCount === 0) {
    return (
      <div>
        <Subheading>{t('capabilities.label')}</Subheading>
        <div className="mt-4 rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('capabilities.noCapabilities')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header with count badge and toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Subheading>{t('capabilities.label')}</Subheading>
          <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-400">
            {totalCount}
          </span>
        </div>
        <Button plain onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? (
            <>
              <ChevronDownIcon />
              <span className="hidden sm:inline">{t('common.hide')}</span>
            </>
          ) : (
            <>
              <ChevronRightIcon />
              <span className="hidden sm:inline">{t('common.show')}</span>
            </>
          )}
        </Button>
      </div>

      {/* Expanded: Show organized list */}
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {isLoading && (
            <div className="rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
              <p className="text-sm text-zinc-500">
                {t('common.actions.loading', { entities: t('capabilities.label').toLowerCase() })}
              </p>
            </div>
          )}

          {stats && stats.map((group) => (
            <div key={group.name} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {group.name}
                </h4>
                <Badge color="zinc" className="text-xs">
                  {group.count}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {capabilitiesData?.groups
                  .find(g => g.displayName === group.name)
                  ?.capabilities
                  .filter(cap => capabilities.includes(cap.name))
                  .map(cap => (
                    <span
                      key={cap.name}
                      className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium cursor-help bg-primary-100 text-primary-700 dark:bg-primary-950/50 dark:text-primary-400"
                      title={cap.description}
                    >
                      {cap.displayName}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
