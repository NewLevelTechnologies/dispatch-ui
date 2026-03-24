import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { userApi } from '../api';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Label, Description } from './catalyst/fieldset';
import { Text } from './catalyst/text';

interface CapabilitySelectorProps {
  selectedCapabilities: string[];
  onCapabilityToggle: (capabilityName: string, checked: boolean) => void;
}

/**
 * Compact capability selector for role forms
 * Uses a tabbed interface to organize capabilities by feature area
 */
export default function CapabilitySelector({
  selectedCapabilities,
  onCapabilityToggle,
}: CapabilitySelectorProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);

  const { data: capabilitiesData, isLoading, error } = useQuery({
    queryKey: ['capabilities', 'grouped'],
    queryFn: () => userApi.getGroupedCapabilities(),
  });

  if (isLoading) {
    return (
      <div className="rounded-lg bg-zinc-50 p-6 text-center dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">
          {t('common.actions.loading', { entities: t('capabilities.label').toLowerCase() })}
        </p>
      </div>
    );
  }

  if (error || !capabilitiesData) {
    return (
      <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">
          {t('capabilities.errorLoading')}
        </p>
      </div>
    );
  }

  // Ensure groups array exists and is valid
  const groups = capabilitiesData?.groups || [];
  if (groups.length === 0) {
    return (
      <div className="rounded-lg bg-zinc-50 p-4 text-center dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">{t('capabilities.noCapabilities')}</p>
      </div>
    );
  }

  const currentGroup = groups[activeTab];

  const getGroupSelectionCount = (groupIndex: number) => {
    const group = groups[groupIndex];
    const selected = group.capabilities.filter(cap =>
      selectedCapabilities.includes(cap.name)
    ).length;
    return selected;
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex -mb-px space-x-6 overflow-x-auto">
          {groups.map((group, index) => {
            const selectedCount = getGroupSelectionCount(index);
            const isActive = activeTab === index;

            return (
              <button
                key={group.featureArea}
                type="button"
                onClick={() => setActiveTab(index)}
                className={`
                  whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors
                  ${isActive
                    ? ''
                    : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:text-zinc-300'
                  }
                `}
                style={isActive ? {
                  borderColor: 'var(--color-primary-600)',
                  color: 'var(--color-primary-600)',
                } : undefined}
              >
                <span>{group.displayName}</span>
                {selectedCount > 0 && (
                  <span
                    className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      isActive
                        ? ''
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                    style={isActive ? {
                      backgroundColor: 'var(--color-primary-100)',
                      color: 'var(--color-primary-600)',
                    } : undefined}
                  >
                    {selectedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="space-y-3">
          {currentGroup.capabilities.map((capability) => (
            <CheckboxField key={capability.name}>
              <Checkbox
                name={capability.name}
                checked={selectedCapabilities.includes(capability.name)}
                onChange={(checked) => onCapabilityToggle(capability.name, checked)}
              />
              <Label>{capability.displayName}</Label>
              <Description>{capability.description}</Description>
            </CheckboxField>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <Text className="text-zinc-600 dark:text-zinc-400">
          {selectedCapabilities.length} {t('capabilities.totalCount')} {t('capabilities.selectedLower')}
        </Text>
        {selectedCapabilities.length > 0 && (
          <button
            type="button"
            onClick={() => {
              // Deselect all capabilities in current group
              currentGroup.capabilities.forEach(cap => {
                if (selectedCapabilities.includes(cap.name)) {
                  onCapabilityToggle(cap.name, false);
                }
              });
            }}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            {t('capabilities.clearGroup')}
          </button>
        )}
      </div>
    </div>
  );
}
