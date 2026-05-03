import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentImagesApi,
  EQUIPMENT_IMAGE_CAPTION_MAX_CHARS,
  EQUIPMENT_IMAGE_CONTENT_TYPES,
  EQUIPMENT_IMAGE_MAX_BYTES,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Text } from './catalyst/text';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface EquipmentImageUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  equipmentId: string;
  /**
   * Initial value for which file gets the profile flag. When the equipment has
   * no photos yet, the dialog defaults the first added file to profile so the
   * "first upload becomes the cover" UX is one-action. After that, no row is
   * pre-selected (keeps the user's existing profile choice).
   */
  defaultSetProfile?: boolean;
}

type UploadStage = 'requesting' | 'uploading' | 'confirming';
type RowStatus = 'queued' | 'in-progress' | 'done' | 'failed';

interface QueuedFile {
  // Local-only id used to key React lists and the profile radio. NOT the
  // server-side image id (that comes back after a successful upload).
  id: string;
  file: File;
  caption: string;
  status: RowStatus;
  stage?: UploadStage;
  errorMessage?: string;
}

const ACCEPT = EQUIPMENT_IMAGE_CONTENT_TYPES.join(',');
const MAX_BYTES = EQUIPMENT_IMAGE_MAX_BYTES;

let nextLocalId = 0;
const makeLocalId = () => `f-${++nextLocalId}`;

function validateFile(file: File, t: (key: string, values?: Record<string, unknown>) => string): string | null {
  if (!(EQUIPMENT_IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return t('equipment.images.unsupportedType');
  }
  if (file.size > MAX_BYTES) {
    return t('equipment.images.tooLarge', {
      size: (file.size / 1024 / 1024).toFixed(1),
      max: Math.round(MAX_BYTES / 1024 / 1024),
    });
  }
  return null;
}

export default function EquipmentImageUploadDialog({
  isOpen,
  onClose,
  equipmentId,
  defaultSetProfile = false,
}: EquipmentImageUploadDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const radioGroupName = useId();

  const [rows, setRows] = useState<QueuedFile[]>([]);
  // Local id of the row that should become profile, or null. Stable through
  // the upload run; we look up the server image id at promote time.
  const [profileRowId, setProfileRowId] = useState<string | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setRows([]);
    setProfileRowId(null);
    setTopLevelError(null);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addFiles = (incoming: File[]) => {
    setTopLevelError(null);
    const accepted: QueuedFile[] = [];
    const rejectedMessages: string[] = [];

    for (const file of incoming) {
      const err = validateFile(file, t);
      if (err) {
        rejectedMessages.push(`${file.name}: ${err}`);
        continue;
      }
      accepted.push({
        id: makeLocalId(),
        file,
        caption: '',
        status: 'queued',
      });
    }

    if (rejectedMessages.length > 0) {
      setTopLevelError(rejectedMessages.join('\n'));
    }

    if (accepted.length === 0) return;

    setRows((prev) => {
      const next = [...prev, ...accepted];
      // First-photo profile default: if defaultSetProfile and no profile is
      // currently selected, flag the first valid added file.
      if (defaultSetProfile && !profileRowId && next.length > 0) {
        setProfileRowId(next[0].id);
      }
      return next;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    addFiles(Array.from(list));
    // Reset the input so re-selecting the same file fires onChange again.
    e.target.value = '';
  };

  const updateRow = (id: string, patch: Partial<QueuedFile>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setProfileRowId((prev) => (prev === id ? null : prev));
  };

  const queuedRows = useMemo(() => rows.filter((r) => r.status === 'queued'), [rows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopLevelError(null);

    if (queuedRows.length === 0) {
      setTopLevelError(t('equipment.images.fileRequired'));
      return;
    }

    setIsUploading(true);

    // Sequential upload — backend's S3 PUT bandwidth scales fine but the API
    // service still serializes the upload-url + confirm hits, and the user
    // gets cleaner per-row progress when they fire one at a time. We track
    // pass/fail locally rather than reading post-loop `rows` since those
    // setState updates haven't flushed yet.
    let anyFailures = false;
    for (const row of queuedRows) {
      updateRow(row.id, { status: 'in-progress', stage: 'requesting', errorMessage: undefined });
      try {
        const image = await equipmentImagesApi.upload(equipmentId, row.file, {
          caption: row.caption.trim() || null,
          onProgress: (s) => updateRow(row.id, { stage: s }),
        });
        // Promote to profile if this row was tagged AND backend didn't already
        // auto-promote (safety-net behavior — first photo on an empty equipment).
        if (profileRowId === row.id && !image.isProfile) {
          await equipmentImagesApi.patch(equipmentId, image.id, { isProfile: true });
        }
        updateRow(row.id, { status: 'done', stage: undefined });
      } catch (err) {
        anyFailures = true;
        const msg =
          err instanceof Error && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : err instanceof Error
              ? err.message
              : t('equipment.images.errorCreate');
        updateRow(row.id, { status: 'failed', stage: undefined, errorMessage: msg });
      }
    }

    setIsUploading(false);
    queryClient.invalidateQueries({ queryKey: ['equipment-images', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });

    // All-success → close. Any failure → stay open so the user sees the
    // per-row error messages.
    if (!anyFailures) {
      onClose();
    }
  };

  const stageLabel = (stage?: UploadStage) =>
    stage === 'requesting'
      ? t('equipment.images.stageRequesting')
      : stage === 'uploading'
        ? t('equipment.images.stageUploading')
        : stage === 'confirming'
          ? t('equipment.images.stageConfirming')
          : '';

  return (
    <Dialog open={isOpen} onClose={isUploading ? () => undefined : onClose} size="2xl">
      <DialogTitle>{t('equipment.images.titleAdd')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {topLevelError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="whitespace-pre-line text-sm text-red-800 dark:text-red-400">
                {topLevelError}
              </p>
            </div>
          )}

          <Fieldset>
            <FieldGroup className="!space-y-4">
              <Field>
                <Label>{t('equipment.images.chooseFile')} *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  onChange={handleFileChange}
                  disabled={isUploading}
                  aria-label={t('equipment.images.chooseFile')}
                  className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200 dark:text-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
                />
              </Field>

              {rows.length > 0 && (
                <ul className="divide-y divide-zinc-200 rounded-lg ring-1 ring-zinc-950/10 dark:divide-zinc-800 dark:ring-white/10">
                  {rows.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 p-3">
                      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
                        <img
                          src={URL.createObjectURL(row.file)}
                          alt={row.file.name}
                          className="size-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {row.file.name}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500">
                            {(row.file.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                        <Input
                          name={`caption-${row.id}`}
                          value={row.caption}
                          onChange={(e) =>
                            updateRow(row.id, {
                              caption: e.target.value.slice(0, EQUIPMENT_IMAGE_CAPTION_MAX_CHARS),
                            })
                          }
                          placeholder={t('equipment.images.captionPlaceholder')}
                          disabled={isUploading || row.status !== 'queued'}
                          maxLength={EQUIPMENT_IMAGE_CAPTION_MAX_CHARS}
                          aria-label={t('equipment.filters.label')}
                        />
                        {row.status === 'in-progress' && (
                          <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            {stageLabel(row.stage)}
                          </p>
                        )}
                        {row.status === 'done' && (
                          <p className="text-xs text-lime-700 dark:text-lime-400">
                            {t('equipment.images.rowDone')}
                          </p>
                        )}
                        {row.status === 'failed' && row.errorMessage && (
                          <p className="text-xs text-red-700 dark:text-red-400">
                            {row.errorMessage}
                          </p>
                        )}
                      </div>

                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                        <input
                          type="radio"
                          name={radioGroupName}
                          checked={profileRowId === row.id}
                          onChange={() => setProfileRowId(row.id)}
                          disabled={isUploading || row.status !== 'queued'}
                          className="size-4"
                          aria-label={t('equipment.images.setAsProfile')}
                        />
                        {t('equipment.images.profile')}
                      </label>

                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={isUploading && row.status === 'in-progress'}
                        aria-label={t('equipment.images.removeFromBatch')}
                        className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                      >
                        <XMarkIcon className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {rows.length === 0 && (
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t('equipment.images.batchEmpty')}
                </Text>
              )}
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isUploading}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isUploading || queuedRows.length === 0}
          >
            {isUploading
              ? t('common.saving')
              : queuedRows.length > 1
                ? t('equipment.images.uploadCount', { count: queuedRows.length })
                : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
