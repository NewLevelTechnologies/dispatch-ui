/* eslint-disable i18next/no-literal-string -- dense upload dialog paired with the equipment detail Media tab; short operational labels stay literal (same convention as LocationFileUploadDialog). */
// One drop-zone dialog for the equipment Media tab — photos AND videos in the
// same place, so the user never has to choose a type up front. Modeled on
// LocationFileUploadDialog / EquipmentImageUploadDialog: queue via drop zone or
// picker, per-row caption (+ cover selection for photos), then run each upload
// sequentially with per-row progress. The two media kinds go to different
// backends — photos to the images API (which owns the cover/profile flag),
// videos to the equipment-files API — so we route per row at upload time.
import type React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PhotoIcon, VideoCameraIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  equipmentImagesApi,
  equipmentFilesApi,
  EQUIPMENT_IMAGE_CONTENT_TYPES,
  EQUIPMENT_IMAGE_MAX_BYTES,
  EQUIPMENT_IMAGE_CAPTION_MAX_CHARS,
  VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import IconButton from './IconButton';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  equipmentId: string;
  /**
   * When the equipment has no photos yet, default the first added photo to the
   * cover so "first upload becomes the cover" is one action. Videos are never a
   * cover candidate.
   */
  defaultSetProfile?: boolean;
}

type MediaKind = 'image' | 'video';
type UploadStage = 'requesting' | 'uploading' | 'confirming';
type RowStatus = 'queued' | 'in-progress' | 'done' | 'failed';

interface QueuedFile {
  // Local-only id for React keys + the cover radio — not the server file id.
  id: string;
  file: File;
  kind: MediaKind;
  caption: string;
  status: RowStatus;
  stage?: UploadStage;
  errorMessage?: string;
}

const IMAGE_TYPES = EQUIPMENT_IMAGE_CONTENT_TYPES as readonly string[];
const VIDEO_TYPES = VIDEO_CONTENT_TYPES as readonly string[];
const ACCEPT = [...EQUIPMENT_IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES].join(',');

let nextLocalId = 0;
const makeLocalId = () => `f-${++nextLocalId}`;

function fileKind(file: File): MediaKind | null {
  if (IMAGE_TYPES.includes(file.type)) return 'image';
  if (VIDEO_TYPES.includes(file.type)) return 'video';
  return null;
}

function validateFile(file: File): { kind: MediaKind } | { error: string } {
  const kind = fileKind(file);
  if (!kind) return { error: 'Unsupported type — JPEG/PNG/WebP photos or MP4/MOV videos' };
  const max = kind === 'video' ? VIDEO_MAX_BYTES : EQUIPMENT_IMAGE_MAX_BYTES;
  if (file.size > max) {
    return { error: `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max ${Math.round(max / 1024 / 1024)} MB` };
  }
  return { kind };
}

export default function EquipmentMediaUploadDialog({
  isOpen,
  onClose,
  equipmentId,
  defaultSetProfile = false,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const radioGroupName = useId();

  const [rows, setRows] = useState<QueuedFile[]>([]);
  // Local id of the photo row that should become cover, or null.
  const [profileRowId, setProfileRowId] = useState<string | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Drag-enter/-leave fire per child; counter keeps the highlight stable until
  // the cursor leaves the outer drop region.
  const dragCounter = useRef(0);

  /* eslint-disable react-hooks/set-state-in-effect -- reset transient dialog state on open (same pattern as the sibling upload dialogs) */
  useEffect(() => {
    if (!isOpen) return;
    setRows([]);
    setProfileRowId(null);
    setTopLevelError(null);
    setIsUploading(false);
    setIsDragOver(false);
    dragCounter.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const addFiles = (incoming: File[]) => {
    setTopLevelError(null);
    const accepted: QueuedFile[] = [];
    const rejected: string[] = [];
    for (const file of incoming) {
      const result = validateFile(file);
      if ('error' in result) {
        rejected.push(`${file.name}: ${result.error}`);
        continue;
      }
      accepted.push({ id: makeLocalId(), file, kind: result.kind, caption: '', status: 'queued' });
    }
    if (rejected.length > 0) setTopLevelError(rejected.join('\n'));
    if (accepted.length === 0) return;

    setRows((prev) => {
      const next = [...prev, ...accepted];
      // First-photo cover default: flag the first photo row if nothing is chosen.
      if (defaultSetProfile && !profileRowId) {
        const firstPhoto = next.find((r) => r.kind === 'image');
        if (firstPhoto) setProfileRowId(firstPhoto.id);
      }
      return next;
    });
  };

  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types ?? []).includes('Files');

  const handleDragEnter = (e: React.DragEvent) => {
    if (isUploading || !isFileDrag(e)) return;
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (isUploading || !isFileDrag(e)) return;
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (isUploading || !isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const handleDrop = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(Array.from(e.dataTransfer.files));
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
      setTopLevelError('Add at least one file');
      return;
    }
    setIsUploading(true);

    // Sequential — cleaner per-row progress, and each API serializes its
    // upload-url + confirm hits anyway. Track failures locally (the setState
    // updates haven't flushed by the time the loop ends).
    let anyFailures = false;
    for (const row of queuedRows) {
      updateRow(row.id, { status: 'in-progress', stage: 'requesting', errorMessage: undefined });
      try {
        const caption = row.caption.trim() || null;
        if (row.kind === 'video') {
          await equipmentFilesApi.upload(equipmentId, row.file, {
            caption,
            onProgress: (s) => updateRow(row.id, { stage: s }),
          });
        } else {
          const image = await equipmentImagesApi.upload(equipmentId, row.file, {
            caption,
            onProgress: (s) => updateRow(row.id, { stage: s }),
          });
          // Promote to cover if tagged AND backend didn't already auto-promote
          // (safety net — first photo on an empty equipment).
          if (profileRowId === row.id && !image.isProfile) {
            await equipmentImagesApi.patch(equipmentId, image.id, { isProfile: true });
          }
        }
        updateRow(row.id, { status: 'done', stage: undefined });
      } catch (err) {
        anyFailures = true;
        const msg =
          err instanceof Error && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : err instanceof Error
              ? err.message
              : 'Upload failed';
        updateRow(row.id, { status: 'failed', stage: undefined, errorMessage: msg ?? 'Upload failed' });
      }
    }

    setIsUploading(false);
    // Refresh both media caches + the detail/list caches that render thumbnails.
    queryClient.invalidateQueries({ queryKey: ['equipment-images', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment-files', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });

    if (!anyFailures) onClose();
  };

  const stageLabel = (stage?: UploadStage) =>
    stage === 'requesting'
      ? 'Preparing…'
      : stage === 'uploading'
        ? 'Uploading…'
        : stage === 'confirming'
          ? 'Finalizing…'
          : '';

  return (
    <Dialog open={isOpen} onClose={isUploading ? () => undefined : onClose} size="2xl">
      <DialogTitle>Add media</DialogTitle>
      <DialogDescription>
        Add photos and videos for this unit — JPEG/PNG/WebP up to 25 MB, MP4/MOV up to 100 MB. The
        first photo becomes the profile image.
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {topLevelError && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
              <p className="whitespace-pre-line text-sm text-red-800 dark:text-red-400">{topLevelError}</p>
            </div>
          )}

          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            data-testid="media-upload-drop-zone"
            className={[
              'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              isDragOver
                ? 'border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30'
                : isUploading
                  ? 'border-zinc-200 opacity-60 dark:border-zinc-800'
                  : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600',
            ].join(' ')}
          >
            <PhotoIcon className="mx-auto size-8 text-zinc-400 dark:text-zinc-500" />
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {isDragOver ? 'Drop to add' : 'Drag photos or videos here, or'}
            </p>
            {!isDragOver && (
              <label className="mt-2 inline-block">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  multiple
                  onChange={(e) => {
                    if (e.target.files?.length) addFiles(Array.from(e.target.files));
                    // Reset so re-selecting the same file fires onChange again.
                    e.target.value = '';
                  }}
                  disabled={isUploading}
                  className="sr-only"
                />
                <span
                  className={[
                    'inline-block cursor-pointer rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700',
                    isUploading ? 'pointer-events-none opacity-50' : '',
                  ].join(' ')}
                >
                  Choose files
                </span>
              </label>
            )}
          </div>

          {rows.length > 0 && (
            <ul className="mt-4 divide-y divide-zinc-200 rounded-lg ring-1 ring-zinc-950/10 dark:divide-zinc-800 dark:ring-white/10">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 p-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
                    {row.kind === 'image' ? (
                      <img src={URL.createObjectURL(row.file)} alt={row.file.name} className="size-full object-cover" />
                    ) : (
                      <VideoCameraIcon className="size-6 text-zinc-400 dark:text-zinc-500" />
                    )}
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
                        updateRow(row.id, { caption: e.target.value.slice(0, EQUIPMENT_IMAGE_CAPTION_MAX_CHARS) })
                      }
                      placeholder="Caption (optional)"
                      disabled={isUploading || row.status !== 'queued'}
                      maxLength={EQUIPMENT_IMAGE_CAPTION_MAX_CHARS}
                      aria-label="Caption"
                    />
                    {row.status === 'in-progress' && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{stageLabel(row.stage)}</p>
                    )}
                    {row.status === 'done' && (
                      <p className="text-xs text-lime-700 dark:text-lime-400">Uploaded</p>
                    )}
                    {row.status === 'failed' && row.errorMessage && (
                      <p className="text-xs text-red-700 dark:text-red-400">{row.errorMessage}</p>
                    )}
                  </div>

                  {/* Cover selection — photos only; videos can't be the profile image. */}
                  {row.kind === 'image' ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                      <input
                        type="radio"
                        name={radioGroupName}
                        checked={profileRowId === row.id}
                        onChange={() => setProfileRowId(row.id)}
                        disabled={isUploading || row.status !== 'queued'}
                        className="size-4"
                        aria-label="Set as cover photo"
                      />
                      Cover
                    </label>
                  ) : (
                    <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">Video</span>
                  )}

                  <IconButton
                    onClick={() => removeRow(row.id)}
                    disabled={isUploading && row.status === 'in-progress'}
                    aria-label="Remove from batch"
                    className="shrink-0"
                  >
                    <XMarkIcon className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isUploading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isUploading || queuedRows.length === 0}>
            {isUploading
              ? 'Uploading…'
              : queuedRows.length > 1
                ? `Upload ${queuedRows.length} files`
                : 'Upload'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
