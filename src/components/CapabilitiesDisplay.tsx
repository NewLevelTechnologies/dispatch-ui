import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { userApi, type CapabilityGroup } from '../api';
import { Badge } from './catalyst/badge';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Label } from './catalyst/fieldset';
import { Text } from './catalyst/text';
import { Button } from './catalyst/button';

interface CapabilitiesDisplayProps {
  /** Read-only mode: shows which capabilities the user has (from user.capabilities array) */
  userCapabilities?: string[];
  /** Edit mode: allows selecting capabilities with checkboxes */
  selectedCapabilities?: string[];
  /** Callback when capabilities are toggled (edit mode only) */
  onCapabilityToggle?: (capabilityName: string, checked: boolean) => void;
  /** Whether this is in edit mode (shows checkboxes) or read-only mode (shows badges) */
  editMode?: boolean;
}

export default function CapabilitiesDisplay({
  userCapabilities = [],
  selectedCapabilities = [],
  onCapabilityToggle,
  editMode = false,
}: CapabilitiesDisplayProps) {
  const { t } = useTranslation();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: capabilitiesData, isLoading, error } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
  });

  const toggleGroup = (featureArea: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(featureArea)) {
        next.delete(featureArea);
      } else {
        next.add(featureArea);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (capabilitiesData) {
      setExpandedGroups(new Set(capabilitiesData.groups.map((g) => g.featureArea)));
    }
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  if (isLoading) {
    return (
      <div className="rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('common.actions.loading', { entities: t('capabilities.label').toLowerCase() })}
        </p>
      </div>
    );
  }

  if (error || !capabilitiesData) {
    return (
      <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">
          {t('capabilities.errorLoading')}: {error instanceof Error ? error.message : t('capabilities.unknownError')}
        </p>
      </div>
    );
  }

  // Filter groups to only show those with capabilities the user has (read-only mode)
  // or show all groups (edit mode)
  const displayGroups = editMode
    ? capabilitiesData.groups
    : capabilitiesData.groups
        .map((group) => ({
          ...group,
          capabilities: group.capabilities.filter((cap) =>
            userCapabilities.includes(cap.name)
          ),
        }))
        .filter((group) => group.capabilities.length > 0);

  if (!editMode && displayGroups.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('capabilities.noCapabilities')}</p>
      </div>
    );
  }

  const getGroupStats = (group: CapabilityGroup) => {
    if (editMode) {
      const selected = group.capabilities.filter((cap) =>
        selectedCapabilities.includes(cap.name)
      ).length;
      return `${selected}/${group.capabilities.length}`;
    }
    return String(group.capabilities.length);
  };

  return (
    <div className="space-y-2">
      {/* Expand/Collapse All buttons */}
      {displayGroups.length > 3 && (
        <div className="mb-4 flex gap-2">
          <Button plain onClick={expandAll} className="text-sm">
            {t('capabilities.expandAll')}
          </Button>
          <Button plain onClick={collapseAll} className="text-sm">
            {t('capabilities.collapseAll')}
          </Button>
        </div>
      )}

      {displayGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.featureArea);

        return (
          <div
            key={group.featureArea}
            className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
          >
            {/* Group Header */}
            <button
              type="button"
              onClick={() => toggleGroup(group.featureArea)}
              className="flex w-full items-center justify-between bg-zinc-50 px-4 py-3 text-left hover:bg-zinc-100 dark:bg-zinc-900/50 dark:hover:bg-zinc-900"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDownIcon className="size-5 text-zinc-500" />
                ) : (
                  <ChevronRightIcon className="size-5 text-zinc-500" />
                )}
                <div>
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {group.displayName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {getGroupStats(group)} {t('capabilities.totalCount')}
                  </div>
                </div>
              </div>
            </button>

            {/* Group Content */}
            {isExpanded && (
              <div className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                {editMode ? (
                  // Edit mode: Show checkboxes
                  <div className="space-y-3">
                    {group.capabilities.map((capability) => (
                      <CheckboxField key={capability.name}>
                        <Checkbox
                          name={capability.name}
                          checked={selectedCapabilities.includes(capability.name)}
                          onChange={(checked) =>
                            onCapabilityToggle?.(capability.name, checked)
                          }
                        />
                        <div className="flex-1">
                          <Label className="font-medium">{capability.displayName}</Label>
                          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
                            {capability.description}
                          </Text>
                        </div>
                      </CheckboxField>
                    ))}
                  </div>
                ) : (
                  // Read-only mode: Show badges
                  <div className="flex flex-wrap gap-2">
                    {group.capabilities.map((capability) => (
                      <Badge
                        key={capability.name}
                        color="purple"
                        className="cursor-help"
                        title={capability.description}
                      >
                        {capability.displayName}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
