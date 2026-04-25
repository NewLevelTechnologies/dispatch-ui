import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tenantSettingsApi, glossaryApi, getApiErrorMessage, type Glossary } from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Heading } from '../../components/catalyst/heading';
import { Text } from '../../components/catalyst/text';
import { Button } from '../../components/catalyst/button';
import { Input } from '../../components/catalyst/input';
import { Divider } from '../../components/catalyst/divider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/catalyst/table';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function TerminologyPanel() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { updateGlossary } = useGlossary();
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const [isEditing, setIsEditing] = useState(false);
  const [glossaryCustomizations, setGlossaryCustomizations] = useState<Glossary>({});

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  const { data: availableEntities } = useQuery({
    queryKey: ['glossary', 'available'],
    queryFn: () => glossaryApi.getAvailableEntities(),
  });

  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlossaryCustomizations(settings.glossary || {});
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (glossary: Glossary) => tenantSettingsApi.updateSettings({ glossary }),
    onSuccess: (updatedSettings) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      if (updatedSettings.glossary) {
        updateGlossary(updatedSettings.glossary);
      }
      setIsEditing(false);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('tenantSettings.messages.errorUpdateSettings'));
    },
  });

  const handleGlossaryChange = (entityCode: string, field: 'singular' | 'plural', value: string) => {
    setGlossaryCustomizations((prev) => ({
      ...prev,
      [entityCode]: {
        singular: field === 'singular' ? value : (prev[entityCode]?.singular || ''),
        plural: field === 'plural' ? value : (prev[entityCode]?.plural || ''),
      },
    }));
  };

  const handleGlossaryReset = (entityCode: string) => {
    setGlossaryCustomizations((prev) => {
      const updated = { ...prev };
      delete updated[entityCode];
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedGlossary = Object.fromEntries(
      Object.entries(glossaryCustomizations).filter(
        ([, value]) => value.singular?.trim() || value.plural?.trim()
      )
    );
    updateMutation.mutate(cleanedGlossary);
  };

  if (isLoading) {
    return <Text className="text-zinc-500">{t('tenantSettings.messages.loadingSettings')}</Text>;
  }

  if (error) {
    return <Text className="text-red-600">{getApiErrorMessage(error) || t('tenantSettings.messages.errorLoadingSettings')}</Text>;
  }

  if (!isEditing) {
    return (
      <div>
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading>{t('tenantSettings.tabs.terminology')}</Heading>
            <Text className="mt-1">{t('tenantSettings.glossary.description')}</Text>
          </div>
          {canEdit && <Button onClick={() => setIsEditing(true)}>{t('common.edit')}</Button>}
        </div>

        {settings?.glossary && Object.keys(settings.glossary).length > 0 ? (
          <div>
            <Text className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              {t('tenantSettings.glossary.customizedCount', { count: Object.keys(settings.glossary).length })}
            </Text>
            <Table dense className="[--gutter:theme(spacing.1)] text-sm">
              <TableHead>
                <TableRow>
                  <TableHeader>{t('tenantSettings.glossary.entity')}</TableHeader>
                  <TableHeader>{t('tenantSettings.glossary.singularForm')}</TableHeader>
                  <TableHeader>{t('tenantSettings.glossary.pluralForm')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(settings.glossary).map(([code, entry]) => (
                  <TableRow key={code}>
                    <TableCell className="font-medium capitalize">{code.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{entry.singular}</TableCell>
                    <TableCell>{entry.plural}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('tenantSettings.glossary.emptyState')}
          </Text>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Heading>{t('tenantSettings.tabs.terminology')}</Heading>
        <Text className="mt-1">{t('tenantSettings.glossary.description')}</Text>
      </div>

      <form onSubmit={handleSubmit}>
        {availableEntities && availableEntities.length > 0 ? (
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('tenantSettings.glossary.entity')}</TableHeader>
                <TableHeader>{t('tenantSettings.glossary.singularForm')}</TableHeader>
                <TableHeader>{t('tenantSettings.glossary.pluralForm')}</TableHeader>
                <TableHeader className="w-16"></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {availableEntities.map((entity) => {
                const customization = glossaryCustomizations[entity.code];
                const isCustomized = customization?.singular || customization?.plural;
                return (
                  <TableRow key={entity.code}>
                    <TableCell className="font-medium">
                      <div className="capitalize">{entity.code.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-normal mt-0.5">
                        {entity.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`glossary-${entity.code}-singular`}
                        value={customization?.singular || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleGlossaryChange(entity.code, 'singular', e.target.value)
                        }
                        placeholder={entity.defaultSingular}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        name={`glossary-${entity.code}-plural`}
                        value={customization?.plural || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleGlossaryChange(entity.code, 'plural', e.target.value)
                        }
                        placeholder={entity.defaultPlural}
                        className="h-8 text-sm"
                      />
                    </TableCell>
                    <TableCell>
                      {isCustomized && (
                        <Button
                          type="button"
                          plain
                          onClick={() => handleGlossaryReset(entity.code)}
                          className="text-xs"
                          title={t('tenantSettings.glossary.resetToDefault')}
                        >
                          <ArrowPathIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('tenantSettings.glossary.loadingEntities')}
          </Text>
        )}

        <Divider className="my-6" />

        <div className="flex justify-end gap-3">
          <Button plain type="button" onClick={() => {
            setIsEditing(false);
            setGlossaryCustomizations(settings?.glossary || {});
          }}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? t('common.saving') : t('common.update')}
          </Button>
        </div>
      </form>
    </div>
  );
}
