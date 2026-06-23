/* eslint-disable i18next/no-literal-string -- quick doc list on the (pre-redesign) equipment page; short operational labels stay literal, same convention as EquipmentVideosSection. */
// ─────────────────────────────────────────────────────────────────────────
// Equipment Documents — manuals, spec sheets, warranties attached to a unit
// via the work-order-service /equipment/{id}/files route (kind DOCUMENT).
// A plain list (not a gallery): Office/text come back as downloads, PDF opens
// inline. Upload is the shared "Add files" dialog on the Files tab; this
// section handles caption edit + delete. Same data also surfaces on the
// location Files tab (the /files aggregate).
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { equipmentFilesApi, FILE_CAPTION_MAX_CHARS, type WorkOrderFile } from '../api';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { formatTimestamp } from '../lib/formatTimestamp';
import { Button } from './catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Textarea } from './catalyst/textarea';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import IconButton from './IconButton';

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function EquipmentDocumentsSection({ equipmentId }: { equipmentId: string }) {
  const [captioning, setCaptioning] = useState<WorkOrderFile | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['equipment-files', equipmentId, 'DOCUMENT'] as const,
    queryFn: () => equipmentFilesApi.list(equipmentId, { kind: 'DOCUMENT', limit: 100 }),
  });
  const docs = data?.content ?? [];

  if (isError) {
    return (
      <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <p className="text-sm text-red-800 dark:text-red-400">Failed to load documents.</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading documents…</p>
      </div>
    );
  }
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No documents yet. Attach the manual, spec sheet, or warranty — PDF or Office doc, up to 25 MB.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10">
      {docs.map((f, i) => (
        <DocRow
          key={f.id}
          f={f}
          last={i === docs.length - 1}
          equipmentId={equipmentId}
          onEditCaption={() => setCaptioning(f)}
        />
      ))}
      <CaptionDialog file={captioning} equipmentId={equipmentId} onClose={() => setCaptioning(null)} />
    </div>
  );
}

function DocRow({
  f,
  last,
  equipmentId,
  onEditCaption,
}: {
  f: WorkOrderFile;
  last: boolean;
  equipmentId: string;
  onEditCaption: () => void;
}) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => equipmentFilesApi.delete(equipmentId, f.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-files', equipmentId] });
      showSuccess('Document deleted');
    },
    onError: (err) => showError('Couldn’t delete document', extractApiError(err) ?? undefined),
  });

  const open = () => window.open(f.url, '_blank', 'noopener');
  // PDF previews inline; Office/text come back as downloads.
  const actionLabel = f.contentType === 'application/pdf' ? 'Open' : 'Download';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      className={`grid cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 bg-white px-3 py-2 hover:bg-bg-hover dark:bg-zinc-950 ${last ? '' : 'border-b border-zinc-200 dark:border-zinc-800'}`}
    >
      <DocumentTextIcon className="size-4 text-fg-dim" />
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-fg-strong" title={f.fileName}>
          {f.caption || f.fileName}
        </div>
        <div className="text-[11px] text-fg-muted">
          {formatTimestamp(f.createdAt)}
          {f.uploadedByName ? ` · ${f.uploadedByName}` : ''} · {formatBytes(f.sizeBytes)}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown>
          <DropdownButton as={IconButton} aria-label="Document actions">
            <EllipsisVerticalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={open}>
              <ArrowDownTrayIcon />
              <DropdownLabel>{actionLabel}</DropdownLabel>
            </DropdownItem>
            <DropdownItem onClick={onEditCaption}>
              <PencilIcon />
              <DropdownLabel>Edit caption</DropdownLabel>
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                if (window.confirm(`Delete ${f.fileName}?`)) del.mutate();
              }}
            >
              <TrashIcon />
              <DropdownLabel>Delete</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );
}

function CaptionDialog({
  file,
  equipmentId,
  onClose,
}: {
  file: WorkOrderFile | null;
  equipmentId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect -- seed the field when a file is selected */
  useEffect(() => {
    if (file) setCaption(file.caption ?? '');
  }, [file]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const mutation = useMutation({
    mutationFn: () => equipmentFilesApi.patch(equipmentId, file!.id, { caption: caption.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-files', equipmentId] });
      showSuccess('Caption updated');
      onClose();
    },
    onError: (err) => showError('Couldn’t update caption', extractApiError(err) ?? undefined),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (file) mutation.mutate();
  };

  return (
    <Dialog open={file !== null} onClose={onClose} size="lg">
      <DialogTitle>Edit caption</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, FILE_CAPTION_MAX_CHARS))}
            placeholder="Describe this document (optional)"
            rows={3}
            maxLength={FILE_CAPTION_MAX_CHARS}
            autoFocus
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" color="accent" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
