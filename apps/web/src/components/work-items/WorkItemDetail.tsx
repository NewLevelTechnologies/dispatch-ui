import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  ArchiveBoxIcon,
  CalendarIcon,
  CheckIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from '@heroicons/react/16/solid';
import {
  workOrderApi,
  workOrderFilesApi,
  type DispatchBoardRow,
  type PurchaseOrderListItem,
  type WorkItemDocument,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
  type WorkOrderFile,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, extractApiError } from '../../lib/toast';
import { workItemLabel } from '@dispatch/utils';
import {
  allowedTargetStatuses,
  completeTarget,
  partsArrivedTarget,
  PENDING_PARTS_CODE,
} from '../../lib/workItemStatusTargets';
import { deriveWorkItemSteps, isFinished, openPurchaseOrders, primaryAction } from '../../lib/workItemSteps';
import InlineComposer from '../InlineComposer';
import WorkItemStatusPill from '../WorkItemStatusPill';
import ConfirmDialog from '../ConfirmDialog';
import { FileLightbox } from '../WorkOrderFilesTab';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../catalyst/alert';
import { Button } from '../catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { Pill } from '../ui/Pill';
import WorkItemSteps from './WorkItemSteps';
import WorkItemEquipmentCard from './WorkItemEquipmentCard';
import WorkItemEquipmentHistory from './WorkItemEquipmentHistory';
import WorkItemHistory from './WorkItemHistory';
import WorkItemDocumentsRow from './WorkItemDocumentsRow';
import WorkItemDispatchesCard from './WorkItemDispatchesCard';
import { formatHours, localDate, shortDate, timeLabel } from './format';

export interface WorkItemDetailProps {
  workOrderId: string;
  serviceLocationId?: string;
  wi: WorkItemResponse;
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly: boolean;
  /** The job's customer — "Quote this work" bills the draft to them. */
  customerId?: string;
  /** This item's quote/invoice rows. */
  documents: WorkItemDocument[];
  /** POs raised for this item (header-level workItemId link). */
  purchaseOrders: PurchaseOrderListItem[];
  /** This item's photos/videos on this job. */
  media: WorkOrderFile[];
  /** Visits that cover this item (listed, or an unscoped visit), in visit order. */
  dispatches: DispatchBoardRow[];
  seqById: Map<string, number>;
  onSaveDescription: (wi: WorkItemResponse, next: string) => Promise<void>;
  onSaveDiagnosis: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAttachEquipment: (wi: WorkItemResponse, equipmentId: string | null) => Promise<void> | void;
  onSetEquipmentNeeded: (wi: WorkItemResponse, needed: boolean) => Promise<void> | void;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onOpenEquipment: (equipment: { id: string; name: string }) => void;
  onSchedule?: (wi: WorkItemResponse) => void;
  onSelectDispatch: (d: DispatchBoardRow) => void;
  onDuplicate?: (wi: WorkItemResponse) => void;
  onDelete?: (wi: WorkItemResponse) => void;
}

/** The selected work item as a service record: where it is, what was found,
 *  what it takes to fix, and its context (equipment, visits). */
export default function WorkItemDetail(props: WorkItemDetailProps) {
  const {
    workOrderId,
    serviceLocationId,
    wi,
    statuses,
    transitions,
    enforceWorkflow,
    readOnly,
    purchaseOrders,
    media,
    dispatches,
    seqById,
  } = props;
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const queryClient = useQueryClient();

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingFindings, setEditingFindings] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState<(() => void) | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  const status = statuses.find((s) => s.id === wi.statusId) ?? null;
  const allowed = allowedTargetStatuses(wi, statuses, transitions, enforceWorkflow);
  const finished = isFinished(wi);
  const findings = wi.diagnosis?.trim() ?? '';
  const openPOs = openPurchaseOrders(purchaseOrders);
  const steps = deriveWorkItemSteps(wi, purchaseOrders, props.documents);
  const toComplete = completeTarget(allowed);
  const toPartsArrived = partsArrivedTarget(allowed);
  const awaitingParts = status?.code === PENDING_PARTS_CODE;

  const action = primaryAction({
    finished,
    awaitingParts,
    hasDispatches: dispatches.length > 0,
    hasFindings: !!findings,
    canPartsArrived: !!toPartsArrived,
    canSchedule: !!props.onSchedule,
    canComplete: !!toComplete,
  });

  const setStatus = useMutation({
    mutationFn: (statusId: string) => workOrderApi.updateWorkItemStatus(workOrderId, wi.id, { statusId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    },
    onError: (err) => showError(t('workOrders.workItems.statusUpdateError'), extractApiError(err) ?? undefined),
  });

  // Completing while parts are still on order is allowed, but asked first.
  const guardComplete = (proceed: () => void) => {
    if (openPOs.length > 0) setConfirmComplete(() => proceed);
    else proceed();
  };
  const markComplete = () => toComplete && guardComplete(() => setStatus.mutate(toComplete.id));

  // Reopen is the server's rule: back to the status held before Done (from its
  // status history), else In progress. Only Completed items reopen.
  const reopen = useMutation({
    mutationFn: () => workOrderApi.reopenWorkItem(workOrderId, wi.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    },
    onError: (err) => showError(t('workOrders.workItems.reopenFailed'), extractApiError(err) ?? undefined),
  });

  // A completed visit that worked this item keeps it — finish it instead. Same
  // rule as the server's 409: the visit listed the item, or it was a whole-job
  // visit that arrived after the item was logged.
  const completedVisit = dispatches.some(
    (d) =>
      d.status === 'COMPLETED' &&
      ((d.addressedWorkItemIds?.length ?? 0) > 0 ||
        (d.arrivedAt != null && new Date(d.arrivedAt).getTime() >= new Date(wi.createdAt).getTime())),
  );
  const requestDelete = () => {
    if (completedVisit) setDeleteBlocked(true);
    else props.onDelete?.(wi);
  };

  const wiId = wi.sequence != null ? workItemLabel(getAbbrev('work_item'), wi.sequence) : null;

  // Findings byline: first author · when · the visit it was written on, plus
  // "edited" after a later change. Findings from before authors were recorded
  // have none of it — no byline.
  const findingsVisit = wi.diagnosisDispatchId ? seqById.get(wi.diagnosisDispatchId) : undefined;
  const findingsByline = findings
    ? [
        wi.diagnosedByName,
        wi.diagnosedAt && `${shortDate(wi.diagnosedAt)} · ${timeLabel(wi.diagnosedAt)}`,
        findingsVisit != null && `${getName('dispatch')} ${findingsVisit}`,
        wi.diagnosisEditedAt && t('workOrders.workItems.edited'),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <>
      {/* Header card heads the main column only, so the right column (equipment,
          visits) starts level with it — the unit sits beside the problem text. */}
      <div className="wit-body">
        <div className="flex min-w-0 flex-col gap-3.5">
          <section className="card" aria-label={wiId ?? getName('work_item')}>
            <div className="flex flex-col gap-1.5 px-4 pb-3 pt-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {wiId && <span className="font-mono text-[11.5px] font-semibold text-fg-muted">{wiId}</span>}
                <WorkItemStatusPill
                  workOrderId={workOrderId}
                  workItem={wi}
                  statuses={statuses}
                  transitions={transitions}
                  enforceWorkflow={enforceWorkflow}
                  readOnly={readOnly}
                  guardComplete={guardComplete}
                />
                <span className="flex-1" />
                {!readOnly && (
                  <PrimaryButton
                    action={action}
                    pending={setStatus.isPending}
                    onPartsArrived={() => toPartsArrived && setStatus.mutate(toPartsArrived.id)}
                    onSchedule={() => props.onSchedule?.(wi)}
                    onFindings={() => setEditingFindings(true)}
                    onComplete={markComplete}
                  />
                )}
                {!readOnly && (
                  <Dropdown>
                    <DropdownButton plain className="size-7 justify-center p-0" aria-label={t('common.moreOptions')}>
                      <EllipsisHorizontalIcon className="size-4" />
                    </DropdownButton>
                    <DropdownMenu anchor="bottom end">
                      <DropdownItem onClick={() => setEditingTitle(true)}>
                        <DropdownLabel>{t('workOrders.workItems.editDescription')}</DropdownLabel>
                      </DropdownItem>
                      {wi.statusCategory === 'COMPLETED' && (
                        <DropdownItem onClick={() => reopen.mutate()} disabled={reopen.isPending}>
                          <DropdownLabel>{t('workOrders.workItems.reopen')}</DropdownLabel>
                        </DropdownItem>
                      )}
                      {!finished && toComplete && (
                        <DropdownItem onClick={markComplete}>
                          <DropdownLabel>{t('workOrders.workItems.markComplete')}</DropdownLabel>
                        </DropdownItem>
                      )}
                      {props.onDuplicate && (
                        <DropdownItem onClick={() => props.onDuplicate?.(wi)}>
                          <DropdownLabel>{t('workOrders.workItems.duplicate', { entity: getName('work_item') })}</DropdownLabel>
                        </DropdownItem>
                      )}
                      {props.onDelete && (
                        <DropdownItem onClick={requestDelete}>
                          <DropdownLabel className="text-danger-500">
                            {t('workOrders.workItems.deleteItem', { entity: getName('work_item').toLowerCase() })}
                          </DropdownLabel>
                        </DropdownItem>
                      )}
                    </DropdownMenu>
                  </Dropdown>
                )}
              </div>
              {editingTitle && !readOnly ? (
                <InlineComposer
                  value={wi.description}
                  rows={2}
                  maxLength={500}
                  placeholder={t('workOrders.workItems.complaintPlaceholder')}
                  ariaLabel={t('workOrders.workItems.editDescription')}
                  onCancel={() => setEditingTitle(false)}
                  onSave={async (next) => {
                    await props.onSaveDescription(wi, next);
                    setEditingTitle(false);
                  }}
                />
              ) : (
                <h2 className="m-0 mt-0.5 text-[16px]/[1.4] font-semibold tracking-[-0.01em] text-pretty text-fg-strong">
                  {wi.description}
                </h2>
              )}
              <div className="text-[11.5px] text-fg-muted">
                {[
                  t('workOrders.workItems.reportedOn', { date: shortDate(wi.createdAt) }),
                  wi.createdByName && t('workOrders.workItems.loggedBy', { name: wi.createdByName }),
                  wi.laborHoursEstimate != null &&
                    t('workOrders.workItems.estHours', { hours: formatHours(wi.laborHoursEstimate) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <WorkItemSteps steps={steps} />
          </section>
          <section className="card">
            <FindingsSection
              workOrderId={workOrderId}
              wi={wi}
              readOnly={readOnly}
              findings={findings}
              byline={findingsByline}
              editing={editingFindings}
              setEditing={setEditingFindings}
              media={media}
              onSave={(next) => props.onSaveDiagnosis(wi, next)}
            />
            <PartsSection
              workOrderId={workOrderId}
              customerId={props.customerId}
              wi={wi}
              readOnly={readOnly || finished}
              purchaseOrders={purchaseOrders}
              documents={props.documents}
            />
          </section>
          {wi.equipment && <WorkItemEquipmentHistory workOrderId={workOrderId} equipment={wi.equipment} />}
          <WorkItemHistory wi={wi} />
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <WorkItemEquipmentCard
            wi={wi}
            serviceLocationId={serviceLocationId}
            readOnly={readOnly}
            hasRecords={!!findings || media.length > 0}
            onAttach={(id) => props.onAttachEquipment(wi, id)}
            onSetEquipmentNeeded={(needed) => props.onSetEquipmentNeeded(wi, needed)}
            onAddNew={props.onAddEquipment ? () => props.onAddEquipment?.(wi) : undefined}
            onOpenEquipment={props.onOpenEquipment}
          />
          <WorkItemDispatchesCard
            dispatches={dispatches}
            seqById={seqById}
            partsBlocked={awaitingParts || openPOs.length > 0}
            onSelect={props.onSelectDispatch}
            onSchedule={!readOnly && !finished && props.onSchedule ? () => props.onSchedule?.(wi) : undefined}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!confirmComplete}
        onClose={() => setConfirmComplete(null)}
        onConfirm={() => {
          confirmComplete?.();
          setConfirmComplete(null);
        }}
        title={t('workOrders.workItems.completeWithPartsTitle')}
        message={t('workOrders.workItems.completeWithPartsMessage', {
          pos: openPOs.map((po) => po.poNumber).join(', '),
        })}
        confirmLabel={t('workOrders.workItems.markComplete')}
      />
      {/* Delete is refused (not confirmed) once a visit has worked the item —
          the explanation plus the move that's actually wanted. */}
      <Alert open={deleteBlocked} onClose={() => setDeleteBlocked(false)}>
        <AlertTitle>
          {t('workOrders.workItems.deleteBlockedTitle', { entity: getName('work_item').toLowerCase() })}
        </AlertTitle>
        <AlertDescription>
          {t('workOrders.workItems.deleteBlockedVisit', {
            entity: getName('work_item').toLowerCase(),
            dispatch: getName('dispatch').toLowerCase(),
          })}
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setDeleteBlocked(false)}>
            {t('common.close')}
          </Button>
          {!finished && toComplete && (
            <Button
              color="dark"
              onClick={() => {
                setDeleteBlocked(false);
                markComplete();
              }}
            >
              {t('workOrders.workItems.markCompleteInstead')}
            </Button>
          )}
        </AlertActions>
      </Alert>
    </>
  );
}

function PrimaryButton({
  action,
  pending,
  onPartsArrived,
  onSchedule,
  onFindings,
  onComplete,
}: {
  action: ReturnType<typeof primaryAction>;
  pending: boolean;
  onPartsArrived: () => void;
  onSchedule: () => void;
  onFindings: () => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  switch (action) {
    case 'partsArrived':
      return (
        <Button color="accent" size="xs" onClick={onPartsArrived} disabled={pending}>
          <ArchiveBoxIcon data-slot="icon" />
          {t('workOrders.workItems.partsArrived')}
        </Button>
      );
    case 'schedule':
      return (
        <Button color="accent" size="xs" onClick={onSchedule}>
          <CalendarIcon data-slot="icon" />
          {t('workOrders.workItems.scheduleEntity', { entity: getName('dispatch').toLowerCase() })}
        </Button>
      );
    case 'findings':
      return (
        <Button color="accent" size="xs" onClick={onFindings}>
          {t('workOrders.workItems.addFindings')}
        </Button>
      );
    case 'complete':
      return (
        <Button color="accent" size="xs" onClick={onComplete} disabled={pending}>
          <CheckIcon data-slot="icon" />
          {t('workOrders.workItems.markComplete')}
        </Button>
      );
    default:
      return null;
  }
}

function FindingsSection({
  workOrderId,
  wi,
  readOnly,
  findings,
  byline,
  editing,
  setEditing,
  media,
  onSave,
}: {
  workOrderId: string;
  wi: WorkItemResponse;
  readOnly: boolean;
  findings: string;
  byline: string;
  editing: boolean;
  setEditing: (v: boolean) => void;
  media: WorkOrderFile[];
  onSave: (next: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<WorkOrderFile | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        try {
          await workOrderFilesApi.upload(workOrderId, file, {
            workItemId: wi.id,
            equipmentId: wi.equipment?.id ?? null,
          });
        } catch (err) {
          showError(t('workOrders.workItems.uploadFailed', { name: file.name }), extractApiError(err) ?? undefined);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    queryClient.invalidateQueries({ queryKey: ['work-order-files', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
  };

  const remove = useMutation({
    mutationFn: (f: WorkOrderFile) => workOrderFilesApi.delete(workOrderId, f.id),
    onSuccess: () => {
      setToDelete(null);
      setViewing(null);
      queryClient.invalidateQueries({ queryKey: ['work-order-files', workOrderId] });
    },
    onError: (err) => showError(t('workOrders.workItems.deletePhotoFailed'), extractApiError(err) ?? undefined),
  });

  return (
    <div className="wit-sec">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
        <span className="text-[13px] font-semibold text-fg-strong">{t('workOrders.workItems.findings')}</span>
        {byline && !editing && <span className="card-sub">{byline}</span>}
        <span className="flex-1" />
        {findings && !editing && !readOnly && (
          <button type="button" className="card-action" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </button>
        )}
      </div>
      {editing && !readOnly ? (
        <InlineComposer
          value={findings}
          rows={3}
          placeholder={t('workOrders.workItems.findingsPlaceholder')}
          ariaLabel={t('workOrders.workItems.findings')}
          onCancel={() => setEditing(false)}
          onSave={async (next) => {
            await onSave(next);
            setEditing(false);
          }}
        />
      ) : findings ? (
        <p className="m-0 max-w-[68ch] whitespace-pre-wrap text-[13px]/[1.6] text-pretty text-fg">{findings}</p>
      ) : (
        <div className="wit-empty">
          <span>{t('workOrders.workItems.noFindings')}</span>
          {!readOnly && (
            <Button outline size="xxs" onClick={() => setEditing(true)}>
              {t('workOrders.workItems.addFindings')}
            </Button>
          )}
        </div>
      )}

      {(media.length > 0 || uploading > 0 || !readOnly) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              className="wit-tile"
              title={[m.caption, shortDate(m.createdAt)].filter(Boolean).join(' · ')}
              aria-label={m.caption || m.fileName}
              onClick={() => setViewing(i)}
            >
              {m.thumbnailUrl || m.kind === 'PHOTO' ? <img src={m.thumbnailUrl ?? m.url} alt="" loading="lazy" /> : null}
            </button>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <span key={`up-${i}`} className="wit-tile grid animate-pulse place-items-center" aria-label={t('workOrders.workItems.uploading')} />
          ))}
          {!readOnly && (
            <>
              <button
                type="button"
                className="wit-tileadd"
                title={t('workOrders.workItems.uploadMedia')}
                aria-label={t('workOrders.workItems.uploadMedia')}
                onClick={() => fileInput.current?.click()}
              >
                <PlusIcon className="size-3.5" />
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          {media.length > 0 && (
            <span className="ml-1 text-[11px] text-fg-muted">
              {t('workOrders.workItems.fileCount', { count: media.length })}
            </span>
          )}
        </div>
      )}

      <FileLightbox
        media={media}
        startIndex={viewing}
        onClose={() => setViewing(null)}
        readOnly={readOnly}
        onRequestDelete={(f) => setToDelete(f)}
      />
      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        title={t('workOrders.workItems.deletePhotoTitle')}
        message={t('workOrders.workItems.deletePhotoMessage')}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={remove.isPending}
      />
    </div>
  );
}

const PO_TONE: Record<string, 'warning' | 'success' | 'neutral'> = {
  DRAFT: 'neutral',
  ORDERED: 'warning',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  BILLED: 'success',
  CANCELLED: 'neutral',
};

function PartsSection({
  workOrderId,
  customerId,
  wi,
  readOnly,
  purchaseOrders,
  documents,
}: {
  workOrderId: string;
  customerId?: string;
  wi: WorkItemResponse;
  readOnly: boolean;
  purchaseOrders: PurchaseOrderListItem[];
  documents: WorkItemDocument[];
}) {
  const { t } = useTranslation();
  const base = `/purchase-orders/new?workOrderId=${workOrderId}&workItemId=${wi.id}`;
  const [addingLabor, setAddingLabor] = useState(false);
  const hasLabor = wi.laborHoursEstimate != null;
  const showLabor = hasLabor || addingLabor;

  return (
    <div className="wit-sec">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5">
        <span className="text-[13px] font-semibold text-fg-strong">{t('workOrders.workItems.partsAndLabor')}</span>
        <span className="flex-1" />
        {!readOnly && (
          <>
            {!showLabor && (
              <button type="button" className="card-action" onClick={() => setAddingLabor(true)}>
                {t('workOrders.workItems.addLaborEstimate')}
              </button>
            )}
            <Link to={`${base}&type=field`} className="card-action">
              {t('workOrders.workItems.recordFieldPurchase')}
            </Link>
            <Link to={`${base}&type=order`} className="card-action">
              {t('workOrders.workItems.orderParts')}
            </Link>
          </>
        )}
      </div>
      {purchaseOrders.length === 0 && !showLabor ? (
        <div className="wit-empty">
          <span>{t('workOrders.workItems.noPartsOnOrder')}</span>
        </div>
      ) : (
        <div className="wit-parts">
          {purchaseOrders.map((po) => {
            const open = po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED';
            return (
              <div key={po.id} className="wit-part">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <Link to={`/purchase-orders/${po.id}`} className="font-mono text-[12px] font-semibold text-fg-accent hover:underline">
                      {po.poNumber}
                    </Link>
                    <span className="truncate text-[12px] text-fg-muted">{po.vendorName}</span>
                  </div>
                  {po.itemCount > 0 && (
                    <div className="text-[11.5px] text-fg-muted">
                      {t('workOrders.workItems.poLineCount', { count: po.itemCount })}
                    </div>
                  )}
                </div>
                <Pill tone={PO_TONE[po.status] ?? 'neutral'} dot>
                  {t(`workOrders.workItems.poStatus.${po.status}`)}
                  {open && po.eta ? ` · ${t('workOrders.workItems.steps.eta', { date: localDate(po.eta) })}` : ''}
                </Pill>
              </div>
            );
          })}
          {showLabor && (
            <LaborRow
              workOrderId={workOrderId}
              wi={wi}
              readOnly={readOnly}
              startEditing={addingLabor}
              onDone={() => setAddingLabor(false)}
            />
          )}
        </div>
      )}
      <WorkItemDocumentsRow
        workOrderId={workOrderId}
        customerId={customerId}
        wi={wi}
        documents={documents}
        readOnly={readOnly}
      />
    </div>
  );
}

// Labor estimate row — hours edit inline in quarter-hour steps. An estimate
// only (actual time comes from the visits); never billed. Clearing removes it.
function LaborRow({
  workOrderId,
  wi,
  readOnly,
  startEditing,
  onDone,
}: {
  workOrderId: string;
  wi: WorkItemResponse;
  readOnly: boolean;
  startEditing: boolean;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(wi.laborHoursEstimate != null ? String(wi.laborHoursEstimate) : '');

  const save = useMutation({
    mutationFn: (hours: number | null) =>
      workOrderApi.updateWorkItem(workOrderId, wi.id, { laborHoursEstimate: hours }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    },
    onError: (err) => showError(t('workOrders.workItems.laborSaveFailed'), extractApiError(err) ?? undefined),
  });

  // Enter commits, then the unmounting input may still blur — act once.
  const settled = useRef(false);
  const close = () => {
    settled.current = true;
    setEditing(false);
    onDone();
  };
  const commit = () => {
    if (settled.current) return;
    const trimmed = draft.trim();
    // Snap to the quarter hour the server accepts (0.25–999.75).
    const hours = trimmed === '' ? null : Math.min(999.75, Math.max(0.25, Math.round(Number(trimmed) * 4) / 4));
    if (hours !== null && Number.isNaN(hours)) return close();
    if (hours !== (wi.laborHoursEstimate ?? null)) save.mutate(hours);
    close();
  };

  return (
    <div className="wit-part">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-fg-strong">{t('workOrders.workItems.labor')}</div>
        <div className="text-[10.5px] text-fg-muted">{t('workOrders.workItems.laborHint')}</div>
      </div>
      {editing && !readOnly ? (
        // Font on the wrapper: Preflight's `font: inherit` on the input/button
        // beats a size utility on the control itself.
        <span className="flex items-center gap-1.5 text-[12px]">
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            min={0.25}
            max={999.75}
            step={0.25}
            value={draft}
            aria-label={t('workOrders.workItems.laborHours')}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(wi.laborHoursEstimate != null ? String(wi.laborHoursEstimate) : '');
                close();
              }
            }}
            className="h-7 w-20 rounded-[var(--r-sm)] border border-border bg-bg px-2 text-right tabular-nums text-fg-strong outline-none focus:border-border-strong"
          />
          <span className="text-fg-muted">{t('workOrders.workItems.hoursUnit')}</span>
        </span>
      ) : readOnly ? (
        <span className="text-[12px] tabular-nums text-fg-muted">
          {wi.laborHoursEstimate != null &&
            t('workOrders.workItems.hours', { hours: formatHours(wi.laborHoursEstimate) })}
        </span>
      ) : (
        <span className="text-[12px]">
          <button
            type="button"
            className="tabular-nums text-fg-muted hover:text-fg-strong"
            title={t('workOrders.workItems.editLabor')}
            onClick={() => {
              settled.current = false;
              setEditing(true);
            }}
          >
            {wi.laborHoursEstimate != null
              ? t('workOrders.workItems.hours', { hours: formatHours(wi.laborHoursEstimate) })
              : '—'}
          </button>
        </span>
      )}
    </div>
  );
}
