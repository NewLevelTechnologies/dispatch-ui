/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationTemplateApi, getApiErrorMessage, type NotificationTemplateListItem, type NotificationTemplate } from '../../api';
import { useHasCapability } from '../../hooks/useCurrentUser';
import NotificationTemplateEditor from '../../components/NotificationTemplateEditor';
import { Subheading } from '../../components/catalyst/heading';
import { Text } from '../../components/catalyst/text';
import { Button } from '../../components/catalyst/button';
import { Badge } from '../../components/catalyst/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/catalyst/table';
import { EnvelopeIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';

export default function NotificationTemplatesPanel() {
  const queryClient = useQueryClient();
  const canView = useHasCapability('VIEW_SETTINGS');
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: () => notificationTemplateApi.getAll(),
    enabled: canView,
  });

  const revertMutation = useMutation({
    mutationFn: (id: string) => notificationTemplateApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      setIsEditorOpen(false);
      setSelectedTemplate(null);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to revert template to default');
    },
  });

  const handleCustomize = async (template: NotificationTemplateListItem) => {
    try {
      const fullTemplate = await notificationTemplateApi.getById(template.id);
      setSelectedTemplate(fullTemplate);
      setIsEditorOpen(true);
    } catch (err) {
      console.error('Failed to load template details:', err);
      alert('Failed to load template details');
    }
  };

  const handleRevertToDefault = (template: NotificationTemplateListItem) => {
    if (
      window.confirm(
        `Are you sure you want to revert "${template.displayName}" to the system default? Your customizations will be lost.`
      )
    ) {
      revertMutation.mutate(template.id);
    }
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedTemplate(null);
  };

  return (
    <div>
      <Subheading className="mb-1">Notification Templates</Subheading>
      <Text className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
        Customize email and SMS notification templates for your organization. Templates use Mustache syntax for variable substitution.
      </Text>

      {isLoading && <Text>Loading templates...</Text>}
      {error && <Text className="text-red-600">{getApiErrorMessage(error) || 'Failed to load notification templates.'}</Text>}
      {templates && templates.length === 0 && <Text>No notification templates found.</Text>}

      {templates && templates.length > 0 && (
        <div>
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>Template</TableHeader>
                <TableHeader>Channel</TableHeader>
                <TableHeader>Subject</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Version</TableHeader>
                <TableHeader></TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.displayName}</TableCell>
                  <TableCell className="text-zinc-500">
                    {template.channel === 'EMAIL' ? (
                      <>
                        <EnvelopeIcon className="inline h-4 w-4 mr-1.5" />
                        Email
                      </>
                    ) : (
                      <>
                        <DevicePhoneMobileIcon className="inline h-4 w-4 mr-1.5" />
                        SMS
                      </>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-zinc-500">{template.subject || '-'}</TableCell>
                  <TableCell>
                    {template.isSystemTemplate ? (
                      <Badge color="zinc">System Default</Badge>
                    ) : (
                      <Badge color="blue">Customized</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-500">v{template.version}</TableCell>
                  <TableCell>
                    <div className="-mx-3 -my-1.5 sm:-mx-2.5 flex items-center justify-end gap-2">
                      {canEdit && (
                        <Button plain onClick={() => handleCustomize(template)}>
                          {template.isSystemTemplate ? 'Customize' : 'Edit'}
                        </Button>
                      )}
                      {canEdit && !template.isSystemTemplate && (
                        <Button plain onClick={() => handleRevertToDefault(template)}>
                          Revert to Default
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-2 flex items-center justify-between text-sm">
            <Text>Showing {templates.length} templates</Text>
          </div>
        </div>
      )}

      {selectedTemplate && (
        <NotificationTemplateEditor
          template={selectedTemplate}
          isOpen={isEditorOpen}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
}
