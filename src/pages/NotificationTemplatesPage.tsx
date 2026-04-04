/* eslint-disable i18next/no-literal-string */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EnvelopeIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline';
import { notificationTemplateApi, type NotificationTemplateListItem, type NotificationTemplate } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import NotificationTemplateEditor from '../components/NotificationTemplateEditor';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/catalyst/table';
import { Badge } from '../components/catalyst/badge';

export default function NotificationTemplatesPage() {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Permission checks
  const canView = useHasCapability('VIEW_SETTINGS');
  const canEdit = useHasCapability('EDIT_SETTINGS');

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
      // Fetch full template details (includes body content and variables)
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

  if (!canView) {
    return (
      <AppLayout>
        <div className="text-center">
          <Heading>Access Denied</Heading>
          <Text>You do not have permission to view notification templates.</Text>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Heading>Notification Templates</Heading>
      <Text className="mt-2">
        Customize email and SMS notification templates for your organization. Templates use Mustache syntax for variable
        substitution.
      </Text>

      {isLoading && (
        <div className="mt-8">
          <Text>Loading templates...</Text>
        </div>
      )}

      {error && (
        <div className="mt-8">
          <Text>Failed to load notification templates.</Text>
        </div>
      )}

      {templates && templates.length === 0 && (
        <div className="mt-8">
          <Text>No notification templates found.</Text>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="mt-4">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>Type</TableHeader>
                <TableHeader>Channel</TableHeader>
                <TableHeader>Subject</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Version</TableHeader>
                <TableHeader className="text-right">Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-medium">{template.displayName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {template.channel === 'EMAIL' ? (
                        <>
                          <EnvelopeIcon className="h-4 w-4 text-zinc-500" />
                          <span>Email</span>
                        </>
                      ) : (
                        <>
                          <DevicePhoneMobileIcon className="h-4 w-4 text-zinc-500" />
                          <span>SMS</span>
                        </>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md truncate">{template.subject || '-'}</TableCell>
                  <TableCell>
                    {template.isSystemTemplate ? (
                      <Badge color="zinc">System Default</Badge>
                    ) : (
                      <Badge color="blue">Customized</Badge>
                    )}
                  </TableCell>
                  <TableCell>v{template.version}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
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

      {/* Template Editor Slide-Over */}
      {selectedTemplate && (
        <NotificationTemplateEditor
          template={selectedTemplate}
          isOpen={isEditorOpen}
          onClose={handleCloseEditor}
        />
      )}
    </AppLayout>
  );
}
