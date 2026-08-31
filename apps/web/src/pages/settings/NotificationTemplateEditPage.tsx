/* eslint-disable i18next/no-literal-string -- dense visual form; primary copy is intentionally inline so the markup stays readable. Translation pass lives in a follow-up. */
// Routed full-page editor for a single notification template. Replaces
// the legacy <NotificationTemplateEditor> side drawer. Same shape as
// UserFormPage: full-bleed inside the settings shell, scroll area
// above a sticky footer.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ChatBubbleLeftIcon,
  ClockIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';

import {
  notificationTemplateApi,
  type NotificationChannel,
  type NotificationTemplate,
  type TemplateSample,
  type ValidateTemplateResponse,
} from '../../api/setup';
import { useHasCapability } from '../../hooks/useCurrentUser';
import {
  extractApiError,
  showError,
  showSuccess,
} from '../../lib/toast';
import {
  extractUsedVariables,
} from '../../lib/templateEditor';
import { fallbackSamplesFor } from '../../lib/templateSamples';
import { flags } from '../../lib/featureFlags';

import { Button } from '../../components/catalyst/button';
import { Heading } from '../../components/catalyst/heading';
import { Text } from '../../components/catalyst/text';
import { Callout } from '../../components/ui/Callout';
import { Pill } from '../../components/ui/Pill';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import ConfirmDialog from '../../components/ConfirmDialog';

import { TemplateEditorEmail } from '../../components/notifications/TemplateEditorEmail';
import { TemplateEditorSms } from '../../components/notifications/TemplateEditorSms';
import { TemplatePreviewEmail } from '../../components/notifications/TemplatePreviewEmail';
import { TemplatePreviewSms } from '../../components/notifications/TemplatePreviewSms';
import { RequiredVariablesPanel } from '../../components/notifications/RequiredVariablesPanel';
import { VersionHistoryRail } from '../../components/notifications/VersionHistoryRail';
import { SendTestMenu } from '../../components/notifications/SendTestMenu';

type FormData = {
  subject: string;
  bodyTemplate: string;
  htmlBodyTemplate: string;
};

// 400 response shape from PUT /notification-templates/{id} per the BE
// walkthrough: each `unknown` entry carries the field it appeared in so
// we can point the user at the right place. `missing` and `wrong_scope`
// stay as plain names.
type UnknownVarHit = { name: string; usedIn: 'SUBJECT' | 'BODY' };
type SaveError = {
  missing?: string[];
  unknown?: UnknownVarHit[];
  wrong_scope?: string[];
};

const fieldLabel = (f: 'SUBJECT' | 'BODY'): string =>
  f === 'SUBJECT' ? 'subject' : 'body';

function isSaveError(value: unknown): value is { errors: SaveError } {
  if (!value || typeof value !== 'object') return false;
  const errors = (value as { errors?: unknown }).errors;
  return !!errors && typeof errors === 'object';
}

function emptyForm(): FormData {
  return { subject: '', bodyTemplate: '', htmlBodyTemplate: '' };
}

function formFromTemplate(t: NotificationTemplate): FormData {
  return {
    subject: t.subject ?? '',
    bodyTemplate: t.bodyTemplate ?? '',
    htmlBodyTemplate: t.htmlBodyTemplate ?? '',
  };
}

function ChannelTag({ channel }: { channel: NotificationChannel }) {
  if (channel === 'EMAIL') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
        <EnvelopeIcon className="size-3.5" />
        Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
      <ChatBubbleLeftIcon className="size-3.5" />
      SMS
    </span>
  );
}

function fmtUpdated(t: NotificationTemplate): string {
  if (!t.updatedAt) return 'recently';
  const when = new Date(t.updatedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return t.updatedByName ? `${when} · ${t.updatedByName}` : when;
}

export default function NotificationTemplateEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useHasCapability('EDIT_SETTINGS');

  const {
    data: template,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['notification-template', id],
    queryFn: () => notificationTemplateApi.getById(id!),
    enabled: !!id,
  });

  const [form, setForm] = useState<FormData>(emptyForm);
  const [original, setOriginal] = useState<FormData>(emptyForm);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [saveErrors, setSaveErrors] = useState<SaveError | null>(null);
  const [warnings, setWarnings] = useState<ValidateTemplateResponse | null>(
    null
  );
  const [sampleId, setSampleId] = useState<string | null>(null);

  // Seed form state once the template loads. This is the standard
  // controlled-form initialization pattern — the source of truth is async.
  useEffect(() => {
    if (!template) return;
    const seeded = formFromTemplate(template);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(seeded);
    setOriginal(seeded);
    setSaveErrors(null);
  }, [template]);

  // Samples — until BE PR-2 lands, use a hardcoded sample per
  // notificationTypeKey. Once flags.notificationSamples flips on, swap to
  // the GET /samples endpoint.
  const samples = useMemo<TemplateSample[]>(() => {
    if (!template) return [];
    return fallbackSamplesFor(
      template.notificationTypeKey,
      template.availableVariables
    );
  }, [template]);

  // Default to the first sample. The picker is only rendered when the
  // samples flag is on (and there's more than one to pick from).
  useEffect(() => {
    if (samples.length > 0 && !sampleId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSampleId(samples[0].id);
    }
  }, [samples, sampleId]);

  const sample = useMemo<Record<string, string>>(() => {
    const found = samples.find((s) => s.id === sampleId) ?? samples[0];
    return found?.data ?? {};
  }, [samples, sampleId]);

  // Lint-as-you-type — debounce 500ms, hit POST /validate, surface
  // syntax warnings above the editor. The FE's own required-variable
  // panel handles the common case instantly; this catches BE-side cases
  // the FE can't see (Mustache syntax errors, custom validations).
  useEffect(() => {
    if (!template) return;
    const handle = setTimeout(() => {
      notificationTemplateApi
        .validate({
          notificationTypeId: template.id,
          subject: form.subject || null,
          bodyTemplate: form.bodyTemplate || null,
          htmlBodyTemplate: form.htmlBodyTemplate || null,
        })
        .then(setWarnings)
        .catch(() => {
          // Don't block the editor on a flaky validate endpoint.
          setWarnings(null);
        });
    }, 500);
    return () => clearTimeout(handle);
  }, [
    template,
    form.subject,
    form.bodyTemplate,
    form.htmlBodyTemplate,
  ]);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(original),
    [form, original]
  );

  const applyTemplate = (t: NotificationTemplate) => {
    const next = formFromTemplate(t);
    setForm(next);
    setOriginal(next);
    setSaveErrors(null);
    queryClient.setQueryData(['notification-template', id], t);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      notificationTemplateApi.update(id!, {
        subject: form.subject || null,
        bodyTemplate: form.bodyTemplate || null,
        htmlBodyTemplate: form.htmlBodyTemplate || null,
      }),
    onSuccess: (updated) => {
      applyTemplate(updated);
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      queryClient.invalidateQueries({
        queryKey: ['notification-template-history', id],
      });
      showSuccess('Template saved');
      navigate('/settings/notifications');
    },
    onError: (err: unknown) => {
      const resp = (err as { response?: { status?: number; data?: unknown } })
        .response;
      if (resp?.status === 400 && isSaveError(resp.data)) {
        const { missing = [], unknown = [], wrong_scope = [] } =
          resp.data.errors;
        setSaveErrors(resp.data.errors);
        const firstMissing = missing[0];
        const firstUnknown = unknown[0];
        if (firstMissing) {
          showError(
            "Couldn't save",
            `Required variable {{${firstMissing}}} is missing`
          );
        } else if (firstUnknown) {
          showError(
            "Couldn't save",
            `Unknown variable {{${firstUnknown.name}}} in ${fieldLabel(firstUnknown.usedIn)}`
          );
        } else if (wrong_scope[0]) {
          showError(
            "Couldn't save",
            `{{${wrong_scope[0]}}} isn't allowed in that field`
          );
        } else {
          showError("Couldn't save changes", extractApiError(err));
        }
        return;
      }
      showError("Couldn't save changes", extractApiError(err));
    },
  });

  const resetMutation = useMutation({
    // DELETE deactivates the tenant override and returns the freshly-reset
    // template (now reading from the system default).
    mutationFn: async () => {
      await notificationTemplateApi.delete(id!);
      return notificationTemplateApi.getById(id!);
    },
    onSuccess: (fresh) => {
      applyTemplate(fresh);
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      showSuccess('Reset to system default');
    },
    onError: (err) =>
      showError("Couldn't reset template", extractApiError(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || saveMutation.isPending) return;
    saveMutation.mutate();
  };

  const usedInSubject = useMemo(
    () => extractUsedVariables(form.subject),
    [form.subject]
  );
  const usedInBody = useMemo(() => {
    const a = extractUsedVariables(form.bodyTemplate);
    const b = extractUsedVariables(form.htmlBodyTemplate);
    return new Set<string>([...a, ...b]);
  }, [form.bodyTemplate, form.htmlBodyTemplate]);

  // ── Render ──────────────────────────────────────────────────────────

  if (!id) {
    return (
      <div className="p-6">
        <ErrorState title="Missing template id" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="p-6">
        <ErrorState
          title="Couldn't load this template"
          description={extractApiError(error) ?? (error as Error | undefined)?.message}
          action={
            <Button outline onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  const isSms = template.channel === 'SMS';
  const hasSaveErrors =
    !!saveErrors &&
    ((saveErrors.missing?.length ?? 0) > 0 ||
      (saveErrors.unknown?.length ?? 0) > 0 ||
      (saveErrors.wrong_scope?.length ?? 0) > 0);
  const validateWarnings = warnings?.warnings ?? [];
  const validateErrors = warnings?.errors ?? [];

  return (
    <div className="relative -mx-6 -my-6 flex h-[calc(100svh-52px)] min-h-0 flex-col max-lg:-mx-4 max-lg:-my-4">
      <form
        id="template-form"
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex-1 overflow-y-auto px-7 pb-6 pt-5 max-lg:px-4">
          <div className="max-w-[1200px]">
            <Link
              to="/settings/notifications"
              className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
            >
              ← All notification templates
            </Link>

            <div className="mb-3.5 flex flex-wrap items-end gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Heading level={1} size="page-md" className="m-0">
                    {template.displayName}
                  </Heading>
                  <ChannelTag channel={template.channel} />
                  {template.isSystemTemplate ? (
                    <Pill tone="neutral">System default</Pill>
                  ) : (
                    <Pill tone="accent" dot>
                      Customized
                    </Pill>
                  )}
                </div>
                <Text size="sm" tone="muted" className="mt-1">
                  {template.isSystemTemplate ? (
                    'Editing the system default creates a customized version for this organization. The default stays available as a fallback.'
                  ) : (
                    <>
                      Version{' '}
                      <span className="font-mono text-fg">
                        v{template.version}
                      </span>{' '}
                      · Updated {fmtUpdated(template)}
                    </>
                  )}
                </Text>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 max-sm:w-full">
                <Button
                  type="button"
                  outline
                  size="xs"
                  className="max-sm:flex-1"
                  onClick={() => setHistoryOpen(true)}
                >
                  <ClockIcon className="size-3.5" />
                  History
                </Button>
                {flags.notificationTestSend && (
                  <SendTestMenu
                    template={template}
                    draft={form}
                    sampleId={sampleId}
                    className="max-sm:flex-1"
                  />
                )}
              </div>
            </div>

            {(hasSaveErrors || validateErrors.length > 0) && (
              <Callout kind="danger" className="mb-3" title="Couldn't save changes">
                <ul className="ml-1 list-disc space-y-0.5 pl-4 text-[11.5px]">
                  {saveErrors?.missing?.map((name) => (
                    <li key={`missing-${name}`}>
                      Required variable{' '}
                      <code className="font-mono text-fg-strong">{`{{${name}}}`}</code>{' '}
                      is missing.
                    </li>
                  ))}
                  {saveErrors?.unknown?.map((hit) => (
                    <li key={`unknown-${hit.usedIn}-${hit.name}`}>
                      Unknown variable{' '}
                      <code className="font-mono text-fg-strong">{`{{${hit.name}}}`}</code>{' '}
                      in {fieldLabel(hit.usedIn)}.
                    </li>
                  ))}
                  {saveErrors?.wrong_scope?.map((name) => (
                    <li key={`scope-${name}`}>
                      <code className="font-mono text-fg-strong">{`{{${name}}}`}</code>{' '}
                      isn't allowed in that field.
                    </li>
                  ))}
                  {validateErrors.map((msg, i) => (
                    <li key={`val-err-${i}`}>{msg}</li>
                  ))}
                </ul>
              </Callout>
            )}

            {validateWarnings.length > 0 && (
              <Callout
                kind="warning"
                className="mb-3"
                title="Template warnings"
              >
                <ul className="ml-1 list-disc space-y-0.5 pl-4 text-[11.5px]">
                  {validateWarnings.map((w, i) => (
                    <li key={`val-warn-${i}`}>
                      <span className="font-mono text-fg-strong">
                        {w.field}
                      </span>
                      : {w.message}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                {isSms ? (
                  <TemplateEditorSms
                    form={{ bodyTemplate: form.bodyTemplate }}
                    onChange={(next) =>
                      setForm((p) => ({ ...p, bodyTemplate: next.bodyTemplate }))
                    }
                    variables={template.availableVariables}
                    sample={sample}
                  />
                ) : (
                  <TemplateEditorEmail
                    form={{
                      subject: form.subject,
                      bodyTemplate: form.bodyTemplate,
                      htmlBodyTemplate: form.htmlBodyTemplate,
                    }}
                    onChange={(next) => setForm({ ...form, ...next })}
                    variables={template.availableVariables}
                  />
                )}
                <RequiredVariablesPanel
                  variables={template.availableVariables}
                  usedInSubject={usedInSubject}
                  usedInBody={usedInBody}
                  className="mt-3"
                />
              </div>
              <div className="lg:sticky lg:top-3 lg:self-start">
                {isSms ? (
                  <TemplatePreviewSms body={form.bodyTemplate} sample={sample} />
                ) : (
                  <TemplatePreviewEmail
                    subject={form.subject}
                    body={form.bodyTemplate}
                    sample={sample}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border bg-bg-elev px-7 py-3 max-lg:px-4 max-sm:flex-col max-sm:items-stretch"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button
            type="button"
            plain
            size="xs"
            className="max-sm:order-3 max-sm:self-center"
            onClick={() => setResetOpen(true)}
            disabled={!canEdit || template.isSystemTemplate || resetMutation.isPending}
          >
            Reset to system default
          </Button>
          <span className="flex-1 max-sm:hidden" />
          <Text
            as="span"
            size="xs"
            tone={dirty ? 'default' : 'dim'}
            className={`max-sm:order-4 max-sm:text-center ${dirty ? 'text-warning-500' : ''}`}
          >
            {dirty ? 'Unsaved changes' : 'No changes'}
          </Text>
          <Button
            type="button"
            plain
            size="xs"
            className="max-sm:order-2 max-sm:w-full"
            href="/settings/notifications"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            color="accent"
            size="xs"
            className="max-sm:order-1 max-sm:w-full"
            disabled={!canEdit || !dirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      <VersionHistoryRail
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        template={template}
        onApply={applyTemplate}
      />

      <ConfirmDialog
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => resetMutation.mutate()}
        title="Reset to system default?"
        message="The current customized version will be removed. The system default stays in place as the active template."
        confirmLabel={
          resetMutation.isPending ? 'Resetting…' : 'Reset to default'
        }
        isDestructive
        isPending={resetMutation.isPending}
      />
    </div>
  );
}
