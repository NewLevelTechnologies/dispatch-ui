/* eslint-disable i18next/no-literal-string -- dense upload dialog paired with WorkOrderFilesTab; short operational labels stay literal (same convention as LocationFileUploadDialog). */
// Upload dialog for the Work Order Files tab. Modeled on
// LocationFileUploadDialog: queue files via drop zone or picker, per-row
// caption + optional trip (dispatch) tag, then run the 3-step presigned upload
// sequentially with per-row progress. WO-domain files also accept video (up to
// 100 MB) on top of photos / PDFs / Office docs.
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DocumentTextIcon, PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
  workOrderFilesApi,
  FILE_CAPTION_MAX_CHARS,
  FILE_CONTENT_TYPES,
  FILE_MAX_BYTES,
  OFFICE_DOC_CONTENT_TYPES,
  VIDEO_CONTENT_TYPES,
  VIDEO_MAX_BYTES,
  type Dispatch,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import IconButton from './IconButton';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  dispatches: Dispatch[];
}

type UploadStage = 'requesting' | 'uploading' | 'confirming';
type RowStatus = 'queued' | 'in-progress' | 'done' | 'failed';

interface QueuedFile {
  id: string;
  file: File;
  caption: string;
  // '' = no trip tag.
  dispatchId: string;
  status: RowStatus;
  stage?: UploadStage;
  errorMessage?: string;
}

const PHOTO_DOC_TYPES = [...FILE_CONTENT_TYPES, ...OFFICE_DOC_CONTENT_TYPES] as readonly string[];
const ALLOWED_TYPES = [...PHOTO_DOC_TYPES, ...VIDEO_CONTENT_TYPES] as readonly string[];
const ACCEPT = [
  ...ALLOWED_TYPES,
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.mp4',
  '.mov',
].join(',');

let nextLocalId = 0;
const makeLocalId = () => `f-${++nextLocalId}`;

function isVideo(file: File): boolean {
  return (VIDEO_CONTENT_TYPES as readonly string[]).includes(file.type);
}

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Unsupported type — image, video (MP4/MOV), PDF, or Office/text doc';
  }
  const max = isVideo(file) ? VIDEO_MAX_BYTES : FILE_MAX_BYTES;
  if (file.size > max) {
    return `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB) — max ${Math.round(max / 1024 / 1024)} MB`;
  }
  return null;
}

export default function WorkOrderFileUploadDialog({ isOpen, onClose, workOrderId, dispatches }: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const [rows, setRows] = useState<QueuedFile[]>([]);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);

  // Trip options (chronological — earliest = Trip 1), for tagging the capture visit.
  const tripOptions = useMemo(() => {
    return [...dispatches]
      .sort((a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime())
      .map((d, i) => ({
        id: d.id,
        label: `${getName('dispatch')} ${i + 1} · ${new Date(d.arrivalWindowStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      }));
  }, [dispatches, getName]);

  /* eslint-disable react-hooks/set-state-in-effect -- reset transient dialog state on open (same pattern as LocationFileUploadDialog) */
  useEffect(() => {
    if (!isOpen) return;
    setRows([]);
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
      const err = validateFile(file);
      if (err) {
        rejected.push(`${file.name}: ${err}`);
        continue;
      }
      accepted.push({ id: makeLocalId(), file, caption: '', dispatchId: '', status: 'queued' });
    }
    if (rejected.length > 0) setTopLevelError(rejected.join('\n'));
    if (accepted.length > 0) setRows((prev) => [...prev, ...accepted]);
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
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const queuedRows = useMemo(() => rows.filter((r) => r.status === 'queued'), [rows]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTopLevelError(null);
    if (queuedRows.length === 0) {
      setTopLevelError('Add at least one file');
      return;
    }
    setIsUploading(true);

    let anyFailures = false;
    for (const row of queuedRows) {
      updateRow(row.id, { status: 'in-progress', stage: 'requesting', errorMessage: undefined });
      try {
        await workOrderFilesApi.upload(workOrderId, row.file, {
          caption: row.caption.trim() || null,
          dispatchId: row.dispatchId || null,
          onProgress: (s) => updateRow(row.id, { stage: s }),
        });
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
    queryClient.invalidateQueries({ queryKey: ['work-order-files', workOrderId] });
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
      <DialogTitle>Upload files</DialogTitle>
      <DialogDescription>
        Photos, videos, PDFs, and Office/text docs. Tag a file to the visit it was captured on, optionally.
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
            data-testid="file-upload-drop-zone"
            className={[
              'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
              isDragOver
                ? 'border-blue-500 bg-blue-50/60 dark:border-blue-400 dark:bg-blue-950/30'
                : isUploading
                  ? 'border-zinc-200 opacity-60 dark:border-zinc-800'
                  : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600',
            ].join(' ')}
          >
            <PaperClipIcon className="mx-auto size-8 text-zinc-400 dark:text-zinc-500" />
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
              {isDragOver ? 'Drop to add' : 'Drag files here, or'}
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
                    {row.file.type.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(row.file)}
                        alt={row.file.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <DocumentTextIcon className="size-6 text-zinc-400 dark:text-zinc-500" />
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
                    <div className="flex items-center gap-2">
                      <Input
                        name={`caption-${row.id}`}
                        value={row.caption}
                        onChange={(e) =>
                          updateRow(row.id, { caption: e.target.value.slice(0, FILE_CAPTION_MAX_CHARS) })
                        }
                        placeholder="Caption (optional)"
                        disabled={isUploading || row.status !== 'queued'}
                        maxLength={FILE_CAPTION_MAX_CHARS}
                        aria-label="Caption"
                        className="flex-1"
                      />
                      {tripOptions.length > 0 && (
                        <Select
                          name={`trip-${row.id}`}
                          value={row.dispatchId}
                          onChange={(e) => updateRow(row.id, { dispatchId: e.target.value })}
                          disabled={isUploading || row.status !== 'queued'}
                          aria-label="Trip"
                          className="w-44 shrink-0"
                        >
                          <option value="">No {getName('dispatch').toLowerCase()}</option>
                          {tripOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                    {row.status === 'in-progress' && (
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">{stageLabel(row.stage)}</p>
                    )}
                    {row.status === 'done' && <p className="text-xs text-lime-700 dark:text-lime-400">Uploaded</p>}
                    {row.status === 'failed' && row.errorMessage && (
                      <p className="text-xs text-red-700 dark:text-red-400">{row.errorMessage}</p>
                    )}
                  </div>

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
