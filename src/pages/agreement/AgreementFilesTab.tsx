/* eslint-disable i18next/no-literal-string -- dense detail-page tab; entity names go through getName()/t(), inline glyphs and short operational labels stay literal (same convention as LocationFilesTab / ServiceLocationDetailPage). */
// ─────────────────────────────────────────────────────────────────────────
// Agreement Documents tab — paperwork attached directly to the agreement
// (signed contract, COIs, addenda). Single source: work-order-service
// /work-orders/agreements/{id}/files. Uploads are PDFs + image scans (a COI
// photographed on a phone is a JPEG); presented as one document LIST, not a
// media gallery — agreements are contract records. Caption + delete are
// inline; upload is the 3-step presigned flow.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownTrayIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  agreementFilesApi,
  FILE_CAPTION_MAX_CHARS,
  type PagedFiles,
  type WorkOrderFile,
} from '../../api';
import { formatTimestamp } from '../../lib/formatTimestamp';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { Card } from '../../components/catalyst/card';
import { Button } from '../../components/catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../components/catalyst/dialog';
import { Textarea } from '../../components/catalyst/textarea';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../../components/catalyst/dropdown';
import IconButton from '../../components/IconButton';
import { LoadingState } from '../../components/ui/LoadingState';
import AgreementFileUploadDialog from '../../components/AgreementFileUploadDialog';

const PAGE_LIMIT = 100;

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

// 1-indexed page param; Spring's envelope rides back with 0-based `number` + `last`.
function nextPageParam(last: PagedFiles<WorkOrderFile>): number | undefined {
  return last.last === false ? last.number + 2 : undefined;
}

export default function AgreementFilesTab({ agreementId }: { agreementId: string }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [captioning, setCaptioning] = useState<WorkOrderFile | null>(null);

  const query = useInfiniteQuery({
    queryKey: ['agreement-files', agreementId, 'all'] as const,
    queryFn: ({ pageParam }) =>
      agreementFilesApi.list(agreementId, { page: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: 1,
    getNextPageParam: nextPageParam,
  });

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const files = useMemo(
    () =>
      pages
        .flatMap((p) => p.content)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [pages],
  );
  const serverTotal = pages[0]?.totalElements ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="text-[11.5px] text-fg-muted">
          The signed contract, COIs, and other paperwork for this agreement.
        </div>
        <span className="grow" />
        <Button color="accent" size="xs" onClick={() => setUploadOpen(true)}>
          <PlusIcon className="size-4" />
          Upload
        </Button>
      </div>

      {query.isLoading ? (
        <Card padding="none">
          <LoadingState label="Loading documents…" />
        </Card>
      ) : files.length === 0 ? (
        <Card padding="none">
          <div className="px-5 py-11 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">No documents yet</div>
            <div className="mx-auto mt-1 max-w-sm text-[12px] text-fg-muted">
              Attach the signed contract, certificates of insurance, and other paperwork — PDF, Office docs,
              or image scan, up to 25 MB.
            </div>
            <Button color="accent" size="xs" className="mt-3" onClick={() => setUploadOpen(true)}>
              <PlusIcon className="size-4" />
              Upload a document
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card padding="none">
            {files.map((f, i) => (
              <DocRow
                key={f.id}
                f={f}
                last={i === files.length - 1}
                agreementId={agreementId}
                onEditCaption={() => setCaptioning(f)}
              />
            ))}
          </Card>

          {query.hasNextPage && (
            <div className="flex items-center justify-center gap-2.5 py-1 text-[11.5px] text-fg-muted">
              <span>
                Showing the newest <strong className="text-fg-strong">{files.length}</strong> of {serverTotal}
              </span>
              <Button outline size="xxs" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      <AgreementFileUploadDialog isOpen={uploadOpen} onClose={() => setUploadOpen(false)} agreementId={agreementId} />
      <CaptionDialog file={captioning} agreementId={agreementId} onClose={() => setCaptioning(null)} />
    </div>
  );
}

// ── Document row ─────────────────────────────────────────────────────────────
function DocRow({
  f,
  last,
  agreementId,
  onEditCaption,
}: {
  f: WorkOrderFile;
  last: boolean;
  agreementId: string;
  onEditCaption: () => void;
}) {
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => agreementFilesApi.delete(agreementId, f.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-files', agreementId] });
      showSuccess('File deleted');
    },
    onError: (err) => showError('Couldn’t delete file', extractApiError(err) ?? undefined),
  });

  const open = () => window.open(f.url, '_blank', 'noopener');
  // Images + PDF preview inline; Office/text come back as downloads
  // (Content-Disposition: attachment), so label the action honestly.
  const previewable = f.kind === 'PHOTO' || f.contentType === 'application/pdf';
  const actionLabel = previewable ? 'Open' : 'Download';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      className={`grid cursor-pointer grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2 hover:bg-bg-hover ${last ? '' : 'border-b border-border-soft'}`}
    >
      {f.kind === 'PHOTO' && (f.thumbnailUrl ?? f.url) ? (
        <img
          src={f.thumbnailUrl ?? f.url}
          alt=""
          loading="lazy"
          className="size-8 rounded border border-border-soft object-cover"
        />
      ) : (
        <div className="flex size-8 items-center justify-center rounded bg-bg-active">
          <DocumentTextIcon className="size-4 text-fg-dim" />
        </div>
      )}
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
          <DropdownButton as={IconButton} aria-label="File actions">
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
                if (window.confirm(`Delete ${f.fileName}?`)) deleteMutation.mutate();
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

// ── Caption edit dialog ──────────────────────────────────────────────────────
function CaptionDialog({
  file,
  agreementId,
  onClose,
}: {
  file: WorkOrderFile | null;
  agreementId: string;
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
    mutationFn: () => agreementFilesApi.patch(agreementId, file!.id, { caption: caption.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-files', agreementId] });
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
