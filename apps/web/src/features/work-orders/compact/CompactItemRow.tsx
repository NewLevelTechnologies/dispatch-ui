// Compact overview — one work item. The equipment tile anchors the row (photo,
// monogram, attach prompt, or a quiet no-equipment tile — always 112px so every
// row shares one text origin). The link row doubles as the tabs of a panel that
// expands in place under the row: nothing here navigates away except "Open →"
// (the Work items tab) and the records a panel links to.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { PlusIcon, TruckIcon, WrenchScrewdriverIcon } from '@heroicons/react/16/solid';
import {
  equipmentApi,
  equipmentFilesApi,
  equipmentNotesApi,
  workOrderApi,
  workOrderFilesApi,
  type DispatchBoardRow,
  type PurchaseOrderListItem,
  type WorkItemDocument,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
  type WorkOrderFile,
  type WorkOrderSummary,
} from '../../../api/setup';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { showError, extractApiError } from '../../../lib/toast';
import { formatFilterSize, formatTimestamp } from '@dispatch/utils';
import { progressRailColor } from '../../../lib/workItemProgress';
import { isFinished } from '../../../lib/workItemSteps';
import EquipmentThumbnail from '../../../components/EquipmentThumbnail';
import { FileLightbox } from '../../../components/WorkOrderFilesTab';
import { PartsSection } from '../../../components/work-items/WorkItemDetail';
import WorkItemPrimaryButton from '../../../components/work-items/WorkItemPrimaryButton';
import { useWorkItemActions } from '../../../components/work-items/useWorkItemActions';
import WorkItemStatusPill from '../../../components/WorkItemStatusPill';
import InlineComposer from '../../../components/InlineComposer';
import WorkItemEquipmentPicker from '../../../components/work-items/WorkItemEquipmentPicker';
import { ageInYears, localDate, shortDate } from '../../../components/work-items/format';
import { warrantyState } from '../overviewModel';

type Panel = 'equipment' | 'units' | 'parts' | 'notes' | 'photos' | 'history';

const PAST_JOBS = 3;

export interface ItemTrip {
  dispatch: DispatchBoardRow;
  /** Positional visit number (1-based by arrival, non-cancelled). */
  seq: number;
}

export interface CompactItemRowProps {
  workOrderId: string;
  serviceLocationId?: string;
  customerId?: string;
  wi: WorkItemResponse;
  /** Tenant statuses + workflow — the status picker and primary action. */
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly: boolean;
  /** This item's photos/videos on this job. */
  media: WorkOrderFile[];
  purchaseOrders: PurchaseOrderListItem[];
  documents: WorkItemDocument[];
  /** Visits that cover this item, in visit order. */
  trips: ItemTrip[];
  onSelectDispatch: (d: DispatchBoardRow) => void;
  onOpenWorkItem: (workItemId: string) => void;
  onOpenEquipment: (equipment: { id: string; name: string }) => void;
  onAttachEquipment: (wi: WorkItemResponse, equipmentId: string | null) => Promise<void> | void;
  onSetEquipmentNeeded: (wi: WorkItemResponse, needed: boolean) => Promise<void> | void;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  /** Same write as the Work items tab's findings section. */
  onSaveDiagnosis: (wi: WorkItemResponse, next: string) => Promise<void>;
  /** Open the dispatch form with this item preselected. */
  onScheduleDispatch?: (wi: WorkItemResponse) => void;
}

export default function CompactItemRow(props: CompactItemRowProps) {
  const { workOrderId, wi, readOnly, media, trips } = props;
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const eq = wi.equipment;
  const done = isFinished(wi);
  // Open items with a unit attached start on its profile — the equipment is
  // what a manager reads first. Finished rows start collapsed.
  const [panel, setPanel] = useState<Panel | null>(eq && !done ? 'equipment' : null);
  const toggle = (k: Panel) => setPanel((p) => (p === k ? null : k));
  const [attaching, setAttaching] = useState(false);
  const [writing, setWriting] = useState(false);

  // Status moves + the one next step: the Work items tab's rules, same hook.
  const actions = useWorkItemActions({
    workOrderId,
    wi,
    statuses: props.statuses,
    transitions: props.transitions,
    enforceWorkflow: props.enforceWorkflow,
    purchaseOrders: props.purchaseOrders,
    hasDispatches: trips.length > 0,
    canSchedule: !readOnly && !!props.onScheduleDispatch,
  });
  const equipmentWord = getName('equipment');

  // Counts that decide which links show. Prior photos + past jobs share the
  // Work items tab's equipment-history queries, so the two surfaces dedupe.
  const { data: priorPhotos } = useQuery({
    queryKey: ['equipment-files', eq?.id, 'PHOTO', { excludeWorkOrderId: workOrderId }],
    queryFn: () => equipmentFilesApi.list(eq!.id, { kind: 'PHOTO', limit: 50, excludeWorkOrderId: workOrderId }),
    enabled: !!eq,
  });
  const { data: jobsPage } = useQuery({
    queryKey: ['work-orders-list', { equipmentId: eq?.id, recent: true }],
    queryFn: () => workOrderApi.getAll({ equipmentId: eq!.id, size: PAST_JOBS + 1, sort: 'createdAt,desc' }),
    enabled: !!eq,
  });

  const priorMedia = (priorPhotos?.content ?? []).filter((f) => f.status !== 'FAILED');
  const priorTotal = Math.max(priorPhotos?.counts?.photos ?? 0, priorMedia.length);
  const jobs = jobsPage?.content ?? [];
  const pastJobs = jobs.filter((w) => w.id !== workOrderId).slice(0, PAST_JOBS);
  const historyCount = jobsPage
    ? Math.max(0, jobsPage.totalElements - (jobs.some((w) => w.id === workOrderId) ? 1 : 0))
    : 0;
  const unitCount = eq ? (eq.descendantCount ?? eq.descendants?.length ?? 0) + 1 : 0;
  const noteCount = eq ? (eq.noteCount ?? eq.recentNotes?.length ?? 0) : 0;
  const photoCount = media.length + priorTotal;

  // Parts always shows (it's where parts get added); the rest hide at zero.
  const links: [Panel, string, number | undefined][] = [];
  if (eq) links.push(['equipment', equipmentWord, undefined]);
  if (eq && unitCount > 0) links.push(['units', getName('equipment_component', true), unitCount]);
  links.push(['parts', t('workOrders.detail.compact.parts'), props.purchaseOrders.length]);
  if (eq && noteCount > 0) links.push(['notes', t('workOrders.workItems.notes'), noteCount]);
  if (photoCount > 0) links.push(['photos', t('workOrders.workItems.photos'), photoCount]);
  if (eq && historyCount > 0) links.push(['history', t('workOrders.detail.compact.history'), historyCount]);

  const makeModel = eq ? [eq.make, eq.model].filter(Boolean).join(' ') : '';
  const warranty = warrantyState(eq?.warrantyExpiresAt);
  const eqMeta = eq
    ? [
        makeModel,
        unitCount > 1 && t('workOrders.detail.compact.systemOf', { count: unitCount }),
        warranty &&
          (warranty === 'covered'
            ? t('workOrders.detail.overview.warrantyCovered')
            : t('workOrders.detail.overview.warrantyExpired')),
      ].filter(Boolean)
    : [];

  const findings = wi.diagnosis?.trim();
  // "— Ray T., 2h ago · edited". Findings from before authors were recorded carry none.
  const findingsBy = [wi.diagnosedByName, wi.diagnosedAt && formatTimestamp(wi.diagnosedAt)].filter(Boolean).join(', ');
  const findingsEdited = !!wi.diagnosisEditedAt;

  return (
    <div className={'ovc-item' + (done ? ' done' : '')} style={{ '--ovc-rail': progressRailColor(wi.statusCategory) } as CSSProperties}>
      <div className="ovc-itemgrid">
        {eq ? (
          <button
            type="button"
            className="ovc-thumb"
            title={eq.name}
            aria-label={eq.name}
            aria-expanded={panel === 'equipment'}
            onClick={() => toggle('equipment')}
          >
            <EquipmentThumbnail
              url={eq.profileImageUrl}
              name={eq.name}
              category={eq.equipmentCategoryName}
              type={eq.equipmentTypeName}
              monogram
              sizeClass="size-full"
            />
          </button>
        ) : wi.equipmentNeeded === false ? (
          <span className="ovc-thumb none" title={t('workOrders.detail.overview.noEquipment')}>
            <WrenchScrewdriverIcon className="size-[22px]" />
          </span>
        ) : readOnly ? (
          <span className="ovc-thumb locked" title={t('workOrders.detail.compact.notAttached', { equipment: equipmentWord })}>
            <WrenchScrewdriverIcon className="size-[22px]" />
          </span>
        ) : (
          <button
            type="button"
            className="ovc-thumb attach"
            aria-expanded={attaching}
            onClick={() => setAttaching((v) => !v)}
          >
            <PlusIcon className="size-[18px]" />
            <span>{t('workOrders.detail.compact.attach', { equipment: equipmentWord })}</span>
          </button>
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {eq ? (
              <span className="ovc-eqname">
                {eq.name}
                {eqMeta.length > 0 && <span className="ovc-eqmeta"> · {eqMeta.join(' · ')}</span>}
              </span>
            ) : (
              <span className="ovc-eqname">
                {wi.description}
                <span className="ovc-eqmeta">
                  {' · '}
                  {wi.equipmentNeeded === false
                    ? t('workOrders.detail.overview.noEquipment')
                    : t('workOrders.detail.compact.notAttached', { equipment: equipmentWord })}
                </span>
              </span>
            )}
            <span className="flex-1" />
            <span className="flex shrink-0 items-center gap-2">
              <WorkItemStatusPill
                workOrderId={workOrderId}
                workItem={wi}
                statuses={props.statuses}
                transitions={props.transitions}
                enforceWorkflow={props.enforceWorkflow}
                readOnly={readOnly}
                guardComplete={actions.guardComplete}
              />
              {!readOnly && (
                <WorkItemPrimaryButton
                  action={actions.action}
                  pending={actions.pending}
                  onPartsArrived={actions.partsArrived}
                  onSchedule={() => props.onScheduleDispatch?.(wi)}
                  onFindings={() => setWriting(true)}
                  onComplete={actions.markComplete}
                />
              )}
            </span>
          </div>
          {attaching && !eq && !readOnly && (
            <div className="mt-2 max-w-[420px]">
              <AttachPicker {...props} onDone={() => setAttaching(false)} />
            </div>
          )}
          {eq && <div className="ovc-complaint">{wi.description}</div>}
          {writing && !readOnly ? (
            <div className="mt-2">
              <InlineComposer
                value={findings ?? ''}
                rows={3}
                placeholder={t('workOrders.workItems.findingsPlaceholder')}
                ariaLabel={t('workOrders.workItems.findings')}
                onCancel={() => setWriting(false)}
                onSave={async (next) => {
                  await props.onSaveDiagnosis(wi, next);
                  setWriting(false);
                }}
              />
            </div>
          ) : findings ? (
            <div className="ovc-findrow">
              <div className="ovc-finding min-w-0 flex-1">
                <span className="ovc-findlbl">{t('workOrders.detail.compact.found')}</span>
                {findings}
                {(findingsBy || findingsEdited) && (
                  <span className="ovc-findwho">
                    {findingsBy && ` — ${findingsBy}`}
                    {findingsEdited && ` · ${t('workOrders.workItems.edited')}`}
                  </span>
                )}
              </div>
              {!readOnly && !done && (
                <button type="button" className="card-action ovc-findedit" onClick={() => setWriting(true)}>
                  {t('common.edit')}
                </button>
              )}
            </div>
          ) : (
            !done &&
            !readOnly && (
              <div className="ovc-finding text-fg-muted">
                {t('workOrders.detail.compact.noFindings')}
                {' · '}
                <button type="button" className="card-action" onClick={() => setWriting(true)}>
                  {t('workOrders.workItems.addFindings')}
                </button>
              </div>
            )
          )}

          <div className="ovc-links">
            {links.map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                className={'ovc-link' + (panel === k ? ' on' : '')}
                aria-expanded={panel === k}
                onClick={() => toggle(k)}
              >
                {label}
                {n !== undefined && <span className="ovc-n">{n}</span>}
              </button>
            ))}
            <span className="flex-1" />
            <span className="flex items-center gap-1 text-[11.5px] text-fg-muted">
              <TruckIcon className="size-3" aria-hidden />
              {trips.length > 0 ? (
                trips.map(({ dispatch: d, seq }) => {
                  const live = d.status === 'EN_ROUTE' || d.status === 'IN_PROGRESS';
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className="ovc-triptag tabular-nums"
                      title={`${getName('dispatch')} ${seq}`}
                      onClick={() => props.onSelectDispatch(d)}
                    >
                      {d.status === 'COMPLETED' ? '✓ ' : ''}
                      {seq}
                      {live ? ` · ${t('workOrders.detail.compact.live')}` : ''}
                    </button>
                  );
                })
              ) : (
                <span>{t('workOrders.detail.notScheduled')}</span>
              )}
            </span>
            <button type="button" className="card-action ml-2" onClick={() => props.onOpenWorkItem(wi.id)}>
              {t('workOrders.detail.compact.open')}
            </button>
          </div>
        </div>
      </div>

      {panel && (
        <div className="ovc-panel">
          {panel === 'equipment' && eq && (
            <EquipmentPanel
              equipmentId={eq.id}
              fallbackName={eq.name}
              history={{ count: historyCount, last: pastJobs[0] }}
              onOpen={() => props.onOpenEquipment({ id: eq.id, name: eq.name })}
            />
          )}
          {panel === 'units' && eq && (
            <UnitsPanel eq={eq} unitCount={unitCount} onOpenEquipment={props.onOpenEquipment} />
          )}
          {panel === 'parts' && (
            <PartsSection
              workOrderId={workOrderId}
              customerId={props.customerId}
              wi={wi}
              readOnly={readOnly || done}
              purchaseOrders={props.purchaseOrders}
              documents={props.documents}
              className=""
            />
          )}
          {panel === 'notes' && eq && <EquipmentNotesPanel equipmentId={eq.id} workOrderId={workOrderId} />}
          {panel === 'photos' && (
            <PhotosPanel
              workOrderId={workOrderId}
              wi={wi}
              readOnly={readOnly}
              media={media}
              prior={priorMedia}
              priorTotal={priorTotal}
            />
          )}
          {panel === 'history' && eq && <HistoryPanel equipment={eq} jobs={pastJobs} />}
        </div>
      )}
      {actions.confirmDialog}
    </div>
  );
}

function PanelHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="ovc-ph">
      <span>{title}</span>
      {sub && <span className="card-sub font-normal">{sub}</span>}
      <span className="flex-1" />
      {action}
    </div>
  );
}

function AttachPicker(props: CompactItemRowProps & { onDone: () => void }) {
  const { wi } = props;
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
      props.onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <WorkItemEquipmentPicker
      serviceLocationId={props.serviceLocationId}
      value={null}
      busy={busy}
      warning={null}
      onPick={(id) => void run(() => props.onAttachEquipment(wi, id))}
      onCancel={props.onDone}
      onAddNew={props.onAddEquipment ? () => props.onAddEquipment?.(wi) : undefined}
      onNotNeeded={() => void run(() => props.onSetEquipmentNeeded(wi, false))}
    />
  );
}

function EquipmentPanel({
  equipmentId,
  fallbackName,
  history,
  onOpen,
}: {
  equipmentId: string;
  fallbackName: string;
  history: { count: number; last?: WorkOrderSummary };
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Same key as the equipment detail page and the Work items tab's card.
  const { data: eq } = useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: () => equipmentApi.getById(equipmentId),
  });

  const facts: [string, string, boolean?][] = [];
  const model = [eq?.make, eq?.model].filter(Boolean).join(' ');
  if (model) facts.push([t('workOrders.workItems.facts.model'), model]);
  if (eq?.serialNumber) facts.push([t('workOrders.workItems.facts.serial'), eq.serialNumber, true]);
  const kind = [eq?.equipmentCategoryName, eq?.equipmentTypeName].filter(Boolean).join(' · ');
  if (kind) facts.push([t('workOrders.detail.compact.category'), kind]);
  if (eq?.installDate) {
    const age = ageInYears(eq.installDate);
    facts.push([
      t('workOrders.workItems.facts.installed'),
      age !== null
        ? `${localDate(eq.installDate)} · ${t('workOrders.workItems.facts.age', { count: age })}`
        : localDate(eq.installDate),
    ]);
  }
  if (eq?.locationOnSite) facts.push([t('workOrders.workItems.facts.location'), eq.locationOnSite]);
  if (eq?.assetTag) facts.push([t('workOrders.workItems.facts.assetTag'), eq.assetTag, true]);
  if (eq?.filters?.length)
    facts.push([
      t('workOrders.workItems.facts.filters'),
      eq.filters.map((f) => `${f.quantity > 1 ? `${f.quantity}× ` : ''}${formatFilterSize(f)}`).join(', '),
    ]);
  const warranty = [
    eq?.warrantyExpiresAt && t('workOrders.workItems.warrantyParts', { date: localDate(eq.warrantyExpiresAt) }),
    eq?.warrantyLaborExpiresAt && t('workOrders.workItems.warrantyLabor', { date: localDate(eq.warrantyLaborExpiresAt) }),
    eq?.warrantyDetails,
  ].filter(Boolean);
  if (warranty.length) facts.push([t('workOrders.detail.compact.warranty'), warranty.join(' · ')]);
  const last = history.last;
  facts.push([
    t('workOrders.detail.compact.service'),
    history.count > 0 && last
      ? t('workOrders.detail.compact.servicePrior', {
          count: history.count,
          date: shortDate(last.completedDate ?? last.scheduledDate ?? last.createdAt),
        })
      : t('workOrders.detail.compact.noPriorService'),
  ]);

  return (
    <>
      <PanelHead
        title={t('workOrders.detail.compact.systemProfile')}
        sub={eq?.name ?? fallbackName}
        action={
          <button type="button" className="card-action" onClick={onOpen}>
            {t('workOrders.detail.compact.fullRecord')}
          </button>
        }
      />
      <dl className="ovc-facts">
        {facts.map(([k, v, mono]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className={mono ? 'mono font-mono' : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function UnitsPanel({
  eq,
  unitCount,
  onOpenEquipment,
}: {
  eq: NonNullable<WorkItemResponse['equipment']>;
  unitCount: number;
  onOpenEquipment: (equipment: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const system = unitCount > 1;
  const children = eq.descendants ?? [];
  const hidden = unitCount - 1 - children.length;
  const model = [eq.make, eq.model].filter(Boolean).join(' ');
  return (
    <>
      <PanelHead
        title={
          system
            ? t('workOrders.detail.compact.unitsTitle', { units: getName('equipment_component', true) })
            : getName('equipment_component')
        }
        sub={
          system
            ? t('workOrders.detail.compact.unitsSub', { count: unitCount, name: eq.name })
            : t('workOrders.detail.compact.standalone')
        }
        action={
          <button type="button" className="card-action" onClick={() => onOpenEquipment({ id: eq.id, name: eq.name })}>
            {t('workOrders.detail.compact.fullRecord')}
          </button>
        }
      />
      <div className="ovc-rows">
        <button type="button" className="ovc-rowitem" onClick={() => onOpenEquipment({ id: eq.id, name: eq.name })}>
          <EquipmentThumbnail
            url={eq.profileImageUrl}
            name={eq.name}
            category={eq.equipmentCategoryName}
            type={eq.equipmentTypeName}
            monogram
            sizeClass="size-9"
            className="rounded-lg"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-fg-strong">{eq.name}</span>
            {model && <span className="block text-[11px] text-fg-muted">{model}</span>}
          </span>
          {eq.serialNumber && (
            <span className="shrink-0 font-mono text-[11px] text-fg-muted">
              {t('workOrders.detail.compact.serialShort', { serial: eq.serialNumber })}
            </span>
          )}
        </button>
        {/* Sub-units carry name + photo only on this projection; their own
            record (the drawer) has the rest. Monogram seeds from the name. */}
        {children.map((u) => (
          <button key={u.id} type="button" className="ovc-rowitem" onClick={() => onOpenEquipment({ id: u.id, name: u.name })}>
            <EquipmentThumbnail url={u.profileImageUrl} name={u.name} monogram sizeClass="size-9" className="rounded-lg" />
            <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-fg-strong">{u.name}</span>
          </button>
        ))}
        {hidden > 0 && (
          <button type="button" className="ovc-rowitem" onClick={() => onOpenEquipment({ id: eq.id, name: eq.name })}>
            <span className="text-[11.5px] text-fg-muted">{t('workOrders.detail.compact.moreUnits', { count: hidden })}</span>
          </button>
        )}
      </div>
    </>
  );
}

function EquipmentNotesPanel({ equipmentId, workOrderId }: { equipmentId: string; workOrderId: string }) {
  const { t } = useTranslation();
  const { data: notes = [], isSuccess } = useQuery({
    queryKey: ['equipment-notes', equipmentId],
    queryFn: () => equipmentNotesApi.list(equipmentId),
  });
  // The equipment's thread across jobs: this job's entries first.
  const ordered = [
    ...notes.filter((n) => n.workOrderId === workOrderId),
    ...notes.filter((n) => n.workOrderId !== workOrderId),
  ];
  return (
    <>
      <PanelHead
        title={t('workOrders.detail.compact.notesTitle')}
        sub={t('workOrders.detail.compact.notesSub')}
      />
      {isSuccess && ordered.length === 0 && (
        <div className="text-[12px] text-fg-muted">
          {t('workOrders.detail.compact.noNotes')}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {ordered.map((n) => (
          <div key={n.id}>
            <div className="whitespace-pre-wrap text-[12px]/[1.5] text-fg">{n.body}</div>
            <div className="mt-0.5 text-[10.5px] text-fg-muted">
              {[n.authorName, shortDate(n.createdAt)].filter(Boolean).join(' · ')}
              {n.workOrderNumber && n.workOrderId !== workOrderId && (
                <>
                  {' · '}
                  <Link to={`/work-orders/${n.workOrderId}`} className="font-mono hover:text-fg-accent">
                    {n.workOrderNumber}
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PhotosPanel({
  workOrderId,
  wi,
  readOnly,
  media,
  prior,
  priorTotal,
}: {
  workOrderId: string;
  wi: WorkItemResponse;
  readOnly: boolean;
  media: WorkOrderFile[];
  prior: WorkOrderFile[];
  priorTotal: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<{ set: 'job' | 'prior'; index: number } | null>(null);
  const shownPrior = [...prior].sort((a, b) => Number(!!b.isNameplate) - Number(!!a.isNameplate)).slice(0, 6);
  const morePrior = priorTotal - shownPrior.length;

  // Same upload as the Work items tab's findings tiles: tied to this item and
  // its equipment, so it also lands in the equipment's history.
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        try {
          await workOrderFilesApi.upload(workOrderId, file, { workItemId: wi.id, equipmentId: wi.equipment?.id ?? null });
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

  return (
    <>
      <PanelHead
        title={t('workOrders.detail.compact.photosTitle')}
        sub={t('workOrders.detail.compact.photosSub', { job: media.length, prior: priorTotal })}
        action={
          !readOnly && (
            <>
              <button type="button" className="card-action" onClick={() => fileInput.current?.click()}>
                {t('workOrders.detail.compact.upload')}
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
          )
        }
      />
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <div className="wit-eqh">{t('workOrders.detail.compact.thisJob')}</div>
          {media.length === 0 && uploading === 0 ? (
            <div className="text-[11.5px] text-fg-muted">{t('workOrders.workItems.noneYet')}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {media.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  className="wit-tile"
                  title={[m.caption, shortDate(m.createdAt)].filter(Boolean).join(' · ')}
                  aria-label={m.caption || m.fileName}
                  onClick={() => setViewing({ set: 'job', index: i })}
                >
                  {m.thumbnailUrl || m.kind === 'PHOTO' ? <img src={m.thumbnailUrl ?? m.url} alt="" loading="lazy" /> : null}
                </button>
              ))}
              {Array.from({ length: uploading }, (_, i) => (
                <span key={`up-${i}`} className="wit-tile animate-pulse" aria-label={t('workOrders.workItems.uploading')} />
              ))}
            </div>
          )}
        </div>
        {shownPrior.length > 0 && (
          <div className="min-w-0 flex-1">
            <div className="wit-eqh">{t('workOrders.detail.compact.previousJobs')}</div>
            <div className="grid grid-cols-[repeat(auto-fill,56px)] gap-1.5">
              {shownPrior.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className="wit-ph"
                  title={[p.caption, shortDate(p.createdAt), p.workOrderNumber].filter(Boolean).join(' · ')}
                  aria-label={p.caption || p.fileName}
                  onClick={() => setViewing({ set: 'prior', index: i })}
                >
                  <img src={p.thumbnailUrl ?? p.url} alt="" loading="lazy" />
                  {p.isNameplate && <span className="wit-phtag">{t('workOrders.detail.compact.plate')}</span>}
                </button>
              ))}
              {morePrior > 0 && wi.equipment && (
                <Link to={`/equipment/${wi.equipment.id}?tab=media`} className="wit-ph more">
                  {`+${morePrior}`}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      <FileLightbox
        media={viewing?.set === 'prior' ? shownPrior : media}
        startIndex={viewing?.index ?? null}
        onClose={() => setViewing(null)}
        readOnly
        onRequestDelete={() => undefined}
        showWorkOrder={viewing?.set === 'prior'}
      />
    </>
  );
}

function HistoryPanel({
  equipment,
  jobs,
}: {
  equipment: { id: string; name: string };
  jobs: WorkOrderSummary[];
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <>
      <PanelHead
        title={t('workOrders.detail.compact.historyTitle')}
        sub={equipment.name}
        action={
          <Link to={`/equipment/${equipment.id}?tab=service-history`} className="card-action">
            {t('workOrders.workItems.fullHistory')}
          </Link>
        }
      />
      {jobs.length === 0 ? (
        <div className="text-[12px] text-fg-muted">
          {t('workOrders.workItems.firstVisit', { equipment: getName('equipment') })}
        </div>
      ) : (
        <div className="ovc-rows">
          {jobs.map((w) => {
            const summary = w.summary || w.workItems?.[0]?.description || '';
            const when = w.completedDate ?? w.scheduledDate ?? w.createdAt;
            const tech = w.assignedUsers?.[0]?.name;
            return (
              <Link key={w.id} to={`/work-orders/${w.id}`} className="ovc-rowitem group justify-between">
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-fg-strong group-hover:text-fg-accent">{summary}</span>
                  <span className="block text-[10.5px] text-fg-muted">{[shortDate(when), tech].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">{w.workOrderNumber}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
