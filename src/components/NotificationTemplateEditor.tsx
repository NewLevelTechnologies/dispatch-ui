/* eslint-disable i18next/no-literal-string */
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import {
  notificationTemplateApi,
  type NotificationTemplate,
  type UpdateNotificationTemplateRequest,
  type TemplatePreviewRequest,
} from '../api';
import { SlideOver, SlideOverHeader, SlideOverTitle, SlideOverDescription, SlideOverBody, SlideOverFooter } from './catalyst/slideover';
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from './catalyst/tabs';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Text } from './catalyst/text';
import { Badge } from './catalyst/badge';
import { Subheading } from './catalyst/heading';
import { Divider } from './catalyst/divider';

interface NotificationTemplateEditorProps {
  template: NotificationTemplate;
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationTemplateEditor({
  template,
  isOpen,
  onClose,
}: NotificationTemplateEditorProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [isVariablesPanelOpen, setIsVariablesPanelOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Form state
  const [subject, setSubject] = useState(template.subject || '');
  const [bodyTemplate, setBodyTemplate] = useState(template.bodyTemplate || '');
  const [htmlBodyTemplate, setHtmlBodyTemplate] = useState(template.htmlBodyTemplate || '');

  // Preview state
  const [previewData, setPreviewData] = useState<Record<string, string>>({});
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    subject: string;
    bodyPlainText: string;
    bodyHtml?: string | null;
    missingVariables: string[];
    warnings: string[];
  } | null>(null);

  // Version history state
  const { data: versionHistory } = useQuery({
    queryKey: ['notification-template-history', template.id],
    queryFn: () => notificationTemplateApi.getVersionHistory(template.id),
    enabled: activeTab === 2, // Only fetch when History tab is active
  });

  // Reset form when template changes
  useEffect(() => {
    setSubject(template.subject || '');
    setBodyTemplate(template.bodyTemplate || '');
    setHtmlBodyTemplate(template.htmlBodyTemplate || '');

    // Initialize preview data with example values
    const initialPreviewData: Record<string, string> = {};
    template.availableVariables?.forEach((variable) => {
      initialPreviewData[variable.name] = variable.exampleValue;
    });
    setPreviewData(initialPreviewData);
  }, [template]);

  const updateMutation = useMutation({
    mutationFn: (request: UpdateNotificationTemplateRequest) =>
      notificationTemplateApi.update(template.id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
          : undefined;
      alert(errorMessage || 'Failed to update template');
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => notificationTemplateApi.rollback(template.id, versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      queryClient.invalidateQueries({ queryKey: ['notification-template-history', template.id] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
          : undefined;
      alert(errorMessage || 'Failed to rollback template');
    },
  });

  const handleSave = () => {
    const request: UpdateNotificationTemplateRequest = {
      subject: subject || null,
      bodyTemplate: bodyTemplate || null,
      htmlBodyTemplate: htmlBodyTemplate || null,
    };
    updateMutation.mutate(request);
  };

  const handlePreview = async () => {
    setIsGeneratingPreview(true);
    try {
      const request: TemplatePreviewRequest = { templateData: previewData };
      const result = await notificationTemplateApi.preview(template.id, request);
      setPreviewResult(result);

      // Auto-scroll to preview after a brief delay to allow rendering
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('Failed to preview template:', err);
      alert('Failed to generate preview');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleRollback = (versionId: string, versionNumber: number) => {
    if (window.confirm(`Are you sure you want to rollback to version ${versionNumber}?`)) {
      rollbackMutation.mutate(versionId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SlideOver open={isOpen} onClose={onClose}>
      <SlideOverHeader onClose={onClose}>
        <SlideOverTitle>{template.displayName}</SlideOverTitle>
        <SlideOverDescription>
          <div className="flex items-center gap-2">
            <span>{template.channel} notification template</span>
            {template.isSystemTemplate ? (
              <Badge color="zinc">System Default</Badge>
            ) : (
              <Badge color="blue">Customized (v{template.version})</Badge>
            )}
          </div>
        </SlideOverDescription>
      </SlideOverHeader>

      <TabGroup selectedIndex={activeTab} onChange={setActiveTab} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 border-b border-zinc-950/10 px-6 dark:border-white/10">
          <TabList>
            <Tab>Edit</Tab>
            <Tab>Preview</Tab>
            <Tab>History</Tab>
          </TabList>
        </div>

        <SlideOverBody>
          <TabPanels>
            {/* Edit Tab */}
            <TabPanel>
              <Fieldset>
                <FieldGroup>
                  <Field>
                    <Label>Subject {template.channel === 'EMAIL' ? '(required)' : ''}</Label>
                    <Input
                      name="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter subject line with {{variables}}"
                    />
                  </Field>
                </FieldGroup>
              </Fieldset>

              {/* Body Template Tabs */}
              <div className="mt-2">
                <TabGroup>
                  <TabList>
                    <Tab>Plain Text</Tab>
                    {template.channel === 'EMAIL' && <Tab>HTML</Tab>}
                  </TabList>
                  <TabPanels>
                    <TabPanel>
                      <Field>
                        <Textarea
                          name="bodyTemplate"
                          value={bodyTemplate}
                          onChange={(e) => setBodyTemplate(e.target.value)}
                          rows={8}
                          placeholder="Enter plain text template with {{variables}}"
                        />
                      </Field>
                    </TabPanel>
                    {template.channel === 'EMAIL' && (
                      <TabPanel>
                        <Field>
                          <Textarea
                            name="htmlBodyTemplate"
                            value={htmlBodyTemplate}
                            onChange={(e) => setHtmlBodyTemplate(e.target.value)}
                            rows={8}
                            placeholder="<html>&#10;  <body>&#10;    <p>Hello {{customer_name}},</p>&#10;  </body>&#10;</html>"
                            className="font-mono text-xs"
                          />
                        </Field>
                      </TabPanel>
                    )}
                  </TabPanels>
                </TabGroup>
              </div>

              {/* Variables Reference Panel */}
              {template.availableVariables && template.availableVariables.length > 0 && (
                <div className="mt-4 rounded-lg border border-zinc-950/10 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsVariablesPanelOpen(!isVariablesPanelOpen)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Text className="font-medium">Available Variables</Text>
                    {isVariablesPanelOpen ? (
                      <ChevronUpIcon className="h-5 w-5" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5" />
                    )}
                  </button>
                  {isVariablesPanelOpen && (
                    <div className="max-h-48 overflow-y-auto border-t border-zinc-950/10 px-4 py-2 dark:border-white/10">
                      <div className="space-y-2">
                        {template.availableVariables.map((variable) => (
                          <div key={variable.name} className="text-sm">
                            <div className="flex items-center gap-2">
                              <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                                {`{{${variable.name}}}`}
                              </code>
                              {variable.required && <Badge color="amber">Required</Badge>}
                            </div>
                            <Text className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              {variable.description}
                            </Text>
                            <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
                              Example: {variable.exampleValue}
                            </Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </TabPanel>

            {/* Preview Tab */}
            <TabPanel>
              <div className="space-y-4">
                <div>
                  <Text className="mb-2 font-medium text-sm">Sample Data</Text>
                  <Fieldset>
                    <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                      {template.availableVariables?.map((variable) => (
                        <Field key={variable.name}>
                          <Label>
                            {variable.name} {variable.required && <span className="text-amber-600">*</span>}
                          </Label>
                          <Input
                            name={variable.name}
                            value={previewData[variable.name] || ''}
                            onChange={(e) =>
                              setPreviewData((prev) => ({ ...prev, [variable.name]: e.target.value }))
                            }
                            placeholder={variable.exampleValue}
                          />
                        </Field>
                      ))}
                    </FieldGroup>
                  </Fieldset>
                  <div className="mt-2">
                    <Button onClick={handlePreview} disabled={isGeneratingPreview}>
                      {isGeneratingPreview ? 'Generating...' : 'Generate Preview'}
                    </Button>
                  </div>
                </div>

                {previewResult && (
                  <div ref={previewRef}>
                    <Divider className="my-4" />

                    <Subheading>Preview</Subheading>

                    {/* Subject */}
                    <div className="mt-2">
                      <Text className="text-sm/6 font-medium">Subject</Text>
                      <Text className="mt-1">{previewResult.subject}</Text>
                    </div>

                    {/* Body Preview Tabs */}
                    <div className="mt-4">
                      <TabGroup>
                        <TabList>
                          <Tab>Plain Text</Tab>
                          {previewResult.bodyHtml && <Tab>HTML</Tab>}
                        </TabList>
                        <TabPanels>
                          <TabPanel>
                            <div className="rounded-lg bg-white p-4 ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
                              <Text className="whitespace-pre-wrap">{previewResult.bodyPlainText}</Text>
                            </div>
                          </TabPanel>
                          {previewResult.bodyHtml && (
                            <TabPanel>
                              <div className="rounded-lg bg-white p-4 ring-1 ring-zinc-950/10 dark:bg-white dark:ring-zinc-950/10">
                                <div dangerouslySetInnerHTML={{ __html: previewResult.bodyHtml }} />
                              </div>
                            </TabPanel>
                          )}
                        </TabPanels>
                      </TabGroup>
                    </div>

                    {/* Warnings and Errors */}
                    {(previewResult.missingVariables.length > 0 || previewResult.warnings.length > 0) && (
                      <div className="mt-4 space-y-2">
                        {previewResult.missingVariables.length > 0 && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-50 p-4 dark:bg-amber-950/20">
                            <Text className="mb-2 font-medium text-amber-800 dark:text-amber-200">
                              Missing Variables:
                            </Text>
                            <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
                              {previewResult.missingVariables.map((variable) => (
                                <li key={variable}>{variable}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {previewResult.warnings.length > 0 && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-50 p-4 dark:bg-amber-950/20">
                            <Text className="mb-2 font-medium text-amber-800 dark:text-amber-200">Warnings:</Text>
                            <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
                              {previewResult.warnings.map((warning, idx) => (
                                <li key={idx}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabPanel>

            {/* History Tab */}
            <TabPanel>
              {versionHistory && (
                <div className="space-y-4">
                  <Text>
                    Version history for {versionHistory.displayName}. Rollback creates a new version with the
                    content from the selected version.
                  </Text>
                  <div className="space-y-3">
                    {versionHistory.versions.map((version) => (
                      <div
                        key={version.id}
                        className="rounded-lg border border-zinc-950/10 p-4 dark:border-white/10"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Text className="font-medium">Version {version.version}</Text>
                              {version.isActive && <Badge color="blue">Current</Badge>}
                            </div>
                            <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                              {formatDate(version.updatedAt)}
                              {version.updatedByName && ` by ${version.updatedByName}`}
                            </Text>
                            {version.subject && (
                              <Text className="mt-2 text-sm">
                                <span className="font-medium">Subject:</span> {version.subject}
                              </Text>
                            )}
                          </div>
                          {!version.isActive && (
                            <Button plain onClick={() => handleRollback(version.id, version.version)}>
                              Rollback
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabPanel>
          </TabPanels>
        </SlideOverBody>
      </TabGroup>

      <SlideOverFooter>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </SlideOverFooter>
    </SlideOver>
  );
}
