import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  workOrderApi,
  type ProgressCategory,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, extractApiError } from '../lib/toast';
import { equipmentCreateUrl, workItemAttachToken } from '../lib/equipmentCreate';
import WOEquipmentPicker from './WOEquipmentPicker';
import InlineComposer from './InlineComposer';
import WorkItemStatusPill from './WorkItemStatusPill';
import WorkItemEquipmentBlock from './WorkItemEquipmentBlock';
import EquipmentThumbnail from './EquipmentThumbnail';
import { workItemLabel } from '../utils/workItemLabel';
import { progressRailColor } from '../lib/workItemProgress';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Text } from './catalyst/text';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import {
  PlusIcon,
  EllipsisHorizontalIcon,
  TruckIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

// Sort options for the tab header (mock WI_SORTS). Default is "Needs attention".
type WiSort = 'attention' | 'dispatch' | 'reported' | 'newest';
const WI_SORTS: WiSort[] = ['attention', 'dispatch', 'reported', 'newest'];

// "Needs attention" rank over status categories: blocked work needs a human
// first; finished work sorts last. Mirrors the mock's Awaiting-parts 0 →
// Triage 1 → Repairing 2 → Done 3 ordering, mapped onto ProgressCategory.
const ATTENTION_RANK: Record<ProgressCategory, number> = {
  BLOCKED: 0,
  NOT_STARTED: 1,
  AWAITING_SCHEDULE: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  CANCELLED: 3,
};

// Resolved items are closed work: they collapse by default and don't count as
// "open" in the header tally.
const isResolved = (c: ProgressCategory) => c === 'COMPLETED' || c === 'CANCELLED';

// Props mirror WorkItemsTable so the page swap is drop-in. All editing is
// inline (mock): `onAdd` → the inline composer; complaint/diagnosis →
// EditableField; equipment attach/change → the inline WOEquipmentPicker. There
// is no edit/add modal. `serviceLocationId` scopes the composer + attach picker.
interface Props {
  workOrderId: string;
  serviceLocationId?: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly?: boolean;
  onDelete?: (wi: WorkItemResponse) => void;
  onDuplicate?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onSaveDiagnosis?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAttachEquipment?: (wi: WorkItemResponse, equipmentId: string | null) => void | Promise<void>;
  /** Set the equipmentNeeded flag: false = "no equipment needed" (also detaches),
   *  true = undo back to needs-attach. */
  onSetEquipmentNeeded?: (wi: WorkItemResponse, needed: boolean) => void | Promise<void>;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
  /** Deep-link target from the overview peek: scroll this item into view and
   *  flash a brief highlight. */
  focusWorkItemId?: string | null;
  /** Positional trip numbers per work-item id (from `tripsByWorkItem`). */
  tripsByWorkItem?: Map<string, number[]>;
  /** Bumped by the page's "Add work item" affordances (header button, overview,
   *  the W shortcut) to open the inline composer, even across a tab switch. */
  openComposerSignal?: number;
}

// Work items tab — one rich card per item (the designer's "substance" view):
// complaint + status + trips, the linked-equipment block (or the inline attach
// picker), diagnosis, and a parts & readiness section. Parts/PO linkage is
// backend-deferred, so the parts section renders the mock's empty state.
export default function WorkItemsTab({
  workOrderId,
  serviceLocationId,
  workItems,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly = false,
  onDelete,
  onDuplicate,
  onSaveDescription,
  onSaveDiagnosis,
  onAttachEquipment,
  onSetEquipmentNeeded,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  focusWorkItemId,
  tripsByWorkItem,
  openComposerSignal,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [composing, setComposing] = useState(false);
  const [sort, setSort] = useState<WiSort>('attention');
  const containerRef = useRef<HTMLDivElement>(null);
  // Deep-link flash: captured once at mount from the ?item= target. Rendered as
  // a transient background wash on the card and cleared on a timer (see below).
  const [flash, setFlash] = useState<string | null>(focusWorkItemId ?? null);

  // The page's "Add work item" affordances (header button, overview card, the
  // W shortcut) bump `openComposerSignal` to open the inline composer. This is
  // the only way to drive it from outside — internal Add uses `setComposing`.
  useEffect(() => {
    if (!openComposerSignal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external add affordance opens the composer across tab mounts
    setComposing(true);
  }, [openComposerSignal]);

  // Deep-link flash → scroll the target into view, then clear the wash on a
  // timer. Keyed on `flash` alone (not workItems / the URL), so a background
  // refetch can't re-arm it and StrictMode's mount → cleanup → mount re-runs the
  // timer correctly: it fires setFlash(null) once, then the guard short-circuits
  // and it never re-fires. No status-rail styling is touched — only the wash.
  useEffect(() => {
    if (!flash) return undefined;
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-work-item-id="${flash}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setFlash(null), 1800);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // Predicted next sequence for the composer's WI-id badge (server assigns the
  // real one on create; max existing + 1, matching the mock's head).
  const nextSequence = workItems.reduce((max, w) => Math.max(max, w.sequence ?? 0), 0) + 1;

  const openCount = workItems.filter((w) => !isResolved(w.statusCategory)).length;

  // Client-side ordering (mock WorkItemsTab). Never mutate the prop array; the
  // native sort is stable, so ties keep the server order (sequence ascending).
  const ordered = useMemo(() => {
    const xs = workItems.slice();
    if (sort === 'attention') {
      xs.sort((a, b) => ATTENTION_RANK[a.statusCategory] - ATTENTION_RANK[b.statusCategory]);
    } else if (sort === 'dispatch') {
      // Lowest trip number addressing the item; unscheduled sorts last (99).
      const firstTrip = (w: WorkItemResponse) => {
        const trips = tripsByWorkItem?.get(w.id);
        return trips && trips.length ? Math.min(...trips) : 99;
      };
      xs.sort((a, b) => firstTrip(a) - firstTrip(b));
    } else if (sort === 'reported') {
      xs.sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity));
    } else if (sort === 'newest') {
      xs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return xs;
  }, [workItems, sort, tripsByWorkItem]);

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {/* Tab header — Add (hidden while composing) + open/total tally on the
          left; the sort control on the right. Counts + sort appear only once
          there's something to count and order. */}
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly && !composing && (
          <Button
            outline
            // outline is transparent in light mode → it washes into the page
            // grey. The mock's .btn sits on --bg-elev (the card fill). Inline so
            // it wins the resting + hover state in both themes.
            className="shadow-sm"
            style={{ backgroundColor: 'var(--bg-elev)' }}
            onClick={() => setComposing(true)}
          >
            <PlusIcon data-slot="icon" />
            {`${t('common.add')} ${getName('work_item').toLowerCase()}`}
          </Button>
        )}
        {workItems.length > 0 && (
          <>
            <span className="text-[11.5px] text-fg-muted">
              {t('workOrders.workItems.openTotalCount', { open: openCount, total: workItems.length })}
            </span>
            <span className="flex-1" />
            <label className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
                {t('workOrders.workItems.sortLabel')}
              </span>
              <span className="w-44">
                <Select size="xs" value={sort} onChange={(e) => setSort(e.target.value as WiSort)}>
                  {WI_SORTS.map((s) => (
                    <option key={s} value={s}>
                      {s === 'dispatch'
                        ? t('workOrders.workItems.sortByEntity', { entity: getName('dispatch') })
                        : t(`workOrders.workItems.sort${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
                    </option>
                  ))}
                </Select>
              </span>
            </label>
          </>
        )}
      </div>

      {!readOnly && composing && (
        <NewWorkItemComposer
          workOrderId={workOrderId}
          serviceLocationId={serviceLocationId}
          nextSequence={nextSequence}
          onClose={() => setComposing(false)}
        />
      )}

      {workItems.length === 0 && !composing ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Text tone="muted">
            {t('workOrders.workItems.empty', {
              children: getName('work_item', true),
              entity: getName('work_order'),
            })}
          </Text>
        </div>
      ) : (
        ordered.map((wi) => (
          <WorkItemCard
            key={wi.id}
            workOrderId={workOrderId}
            serviceLocationId={serviceLocationId}
            wi={wi}
            highlighted={flash === wi.id}
            trips={tripsByWorkItem?.get(wi.id) ?? []}
            statuses={statuses}
            transitions={transitions}
            enforceWorkflow={enforceWorkflow}
            readOnly={readOnly}
            onDelete={onDelete}
            onDuplicate={onDuplicate}
            onSaveDescription={onSaveDescription}
            onSaveDiagnosis={onSaveDiagnosis}
            onAttachEquipment={onAttachEquipment}
            onSetEquipmentNeeded={onSetEquipmentNeeded}
            onAddEquipment={onAddEquipment}
            onSelectSubUnit={onSelectSubUnit}
            onAddSubUnit={onAddSubUnit}
          />
        ))
      )}
    </div>
  );
}

function WorkItemCard({
  workOrderId,
  serviceLocationId,
  wi,
  highlighted = false,
  trips,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly,
  onDelete,
  onDuplicate,
  onSaveDescription,
  onSaveDiagnosis,
  onAttachEquipment,
  onSetEquipmentNeeded,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
}: {
  workOrderId: string;
  serviceLocationId?: string;
  wi: WorkItemResponse;
  highlighted?: boolean;
  trips: number[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly: boolean;
  onDelete?: (wi: WorkItemResponse) => void;
  onDuplicate?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onSaveDiagnosis?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAttachEquipment?: (wi: WorkItemResponse, equipmentId: string | null) => void | Promise<void>;
  onSetEquipmentNeeded?: (wi: WorkItemResponse, needed: boolean) => void | Promise<void>;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const showActions = !readOnly && !!(onDelete || onDuplicate || onSaveDescription);
  const diagnosis = wi.diagnosis?.trim();
  const wiId = wi.sequence != null ? workItemLabel(getAbbrev('work_item'), wi.sequence) : null;
  // Collapsible with a state-driven default: work that needs a human opens
  // expanded; resolved (done/cancelled) work collapses so a long job stays
  // scannable. A deep-linked item always opens. Captured once — clearing the
  // flash later must not re-collapse it.
  const bodyId = `wi-${wi.id}-body`;
  const [open, setOpen] = useState(highlighted || !isResolved(wi.statusCategory));
  // Section-scoped inline editing (mock): complaint + diagnosis each flip to an
  // InlineComposer in place — no modal, no monolithic "edit mode".
  const [editingComplaint, setEditingComplaint] = useState(false);
  const [editingDiagnosis, setEditingDiagnosis] = useState(false);

  const attached = !!wi.equipment;
  const noneNeeded = !attached && wi.equipmentNeeded === false;
  const [picking, setPicking] = useState(false);
  // Needs-attach is the resting state: the picker shows by default (editable)
  // until equipment is attached. "Change" and "Attach" (from none-needed) flip
  // `picking` to bring the picker up over the resolved states.
  const showPicker = picking || (!readOnly && !attached && !noneNeeded);

  return (
    <div
      data-work-item-id={wi.id}
      className="overflow-hidden rounded-lg border border-border bg-bg-elev transition-colors duration-[400ms] ease-out"
      style={{
        borderLeft: `3px solid ${progressRailColor(wi.statusCategory)}`,
        // Deep-link orientation flash (see the highlight effect): a transient
        // accent WASH that fades in then self-clears — not a border, so the
        // status rail (borderLeft) survives. Mixed over --bg-elev (not
        // transparent) so the card stays opaque; undefined when idle → zero
        // residual styling after the fade.
        backgroundColor: highlighted
          ? 'color-mix(in oklch, var(--accent-500) 7%, var(--bg-elev))'
          : undefined,
      }}
    >
      {/* Head — chevron + complaint (+ WI-id) · trips + status + kebab. Clicking
          empty header space toggles the card; the chevron is the accessible
          affordance (aria-expanded). The guard ignores clicks that land on a
          control (chevron/complaint/status/kebab) or the inline composer, so
          those keep their own behavior. While editing the complaint the composer
          spans the full card and the chevron + right cluster hide. */}
      <div
        className="flex items-start gap-3 border-b border-border-soft px-3.5 py-2.5"
        onClick={(e) => {
          if (editingComplaint) return;
          const el = e.target as HTMLElement;
          if (el.closest('button') || el.closest('input') || el.closest('textarea')) return;
          setOpen((o) => !o);
        }}
      >
        {!editingComplaint && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={
              open ? t('workOrders.workItems.collapseRow') : t('workOrders.workItems.expandRow')
            }
            className="-ml-1 inline-flex size-5 shrink-0 items-center justify-center rounded text-fg-muted transition-colors hover:text-fg-strong"
          >
            <ChevronRightIcon
              className={'size-4 transition-transform duration-150' + (open ? ' rotate-90' : '')}
            />
          </button>
        )}
        <div className={`flex min-w-0 items-start gap-2 ${editingComplaint ? 'w-full' : 'flex-1'}`}>
          {editingComplaint && onSaveDescription ? (
            <InlineComposer
              value={wi.description}
              rows={2}
              placeholder={t('workOrders.workItems.complaintPlaceholder')}
              ariaLabel={t('workOrders.workItems.editDescription')}
              onCancel={() => setEditingComplaint(false)}
              onSave={async (next) => {
                await onSaveDescription(wi, next);
                setEditingComplaint(false);
              }}
            />
          ) : (
            <>
              {/* Complaint — 13px/600 --fg-strong; click to edit in place. The
                  font stays on the wrapper so the inner <button> inherits it —
                  Preflight's `button { font: inherit }` would otherwise flow the
                  body weight (400) onto a directly-styled button. */}
              <div className="min-w-0 flex-1 text-[13px]/5 font-semibold text-fg-strong">
                {onSaveDescription && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => setEditingComplaint(true)}
                    title={t('workOrders.workItems.editDescription')}
                    className="w-full cursor-text text-left"
                  >
                    {wi.description}
                  </button>
                ) : (
                  wi.description
                )}
              </div>
              {wiId && (
                <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px]/5 font-semibold text-fg-dim">
                  {wiId}
                </span>
              )}
            </>
          )}
        </div>
        {!editingComplaint && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Trips addressing this item (mock JSX lines 216–222). */}
            <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-fg-muted">
              <TruckIcon className="size-3" />
              {trips.length > 0 ? (
                <span>
                  {`${trips.length > 1 ? getName('dispatch', true) : getName('dispatch')} `}
                  <span className="font-semibold text-fg-strong">{trips.join(', ')}</span>
                </span>
              ) : (
                <span className="text-fg-dim">{t('workOrders.detail.notScheduled')}</span>
              )}
            </span>
            <WorkItemStatusPill
              workOrderId={workOrderId}
              workItem={wi}
              statuses={statuses}
              transitions={transitions}
              enforceWorkflow={enforceWorkflow}
              readOnly={readOnly}
            />
            {showActions && (
              <Dropdown>
                <DropdownButton plain className="size-5 justify-center p-0" aria-label={t('common.moreOptions')}>
                  <EllipsisHorizontalIcon className="size-3.5" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  {onSaveDescription && (
                    <DropdownItem onClick={() => setEditingComplaint(true)}>
                      <DropdownLabel>{t('workOrders.workItems.editDescription')}</DropdownLabel>
                    </DropdownItem>
                  )}
                  {onDuplicate && (
                    <DropdownItem onClick={() => onDuplicate(wi)}>
                      <DropdownLabel>
                        {t('workOrders.workItems.duplicate', { entity: getName('work_item') })}
                      </DropdownLabel>
                    </DropdownItem>
                  )}
                  {onDelete && (
                    <DropdownItem onClick={() => onDelete(wi)}>
                      <DropdownLabel>{t('common.delete')}</DropdownLabel>
                    </DropdownItem>
                  )}
                </DropdownMenu>
              </Dropdown>
            )}
          </div>
        )}
      </div>

      {/* Collapsed — a one-line summary stands in for the body: the equipment
          anchor (thumb + name · make/model) so the row stays identifiable, and
          the parts readiness at a glance. The status rail (border-left) still
          reads. */}
      {!open && !editingComplaint && (
        <div className="flex flex-wrap items-center gap-2 px-3.5 pb-2.5 pt-2">
          {wi.equipment ? (
            <>
              <EquipmentThumbnail
                url={wi.equipment.profileImageUrl}
                name={wi.equipment.name}
                category={wi.equipment.equipmentCategoryName}
                type={wi.equipment.equipmentTypeName}
                monogram
                sizeClass="size-5"
                fit="contain"
              />
              <span className="min-w-0 truncate text-[11.5px] text-fg-muted">
                {[wi.equipment.name, [wi.equipment.make, wi.equipment.model].filter(Boolean).join(' ')]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </>
          ) : (
            <span className="text-[11.5px] text-fg-dim">
              {noneNeeded
                ? t('workOrders.workItems.noEquipmentNeeded')
                : t('workOrders.workItems.noEquipmentAttached', { entity: getName('equipment') })}
            </span>
          )}
          <span className="flex-1" />
          {/* Parts are backend-deferred, so the summary reads "No parts yet"
              until the procurement log lands. */}
          <span className="text-[11.5px] text-fg-muted">{t('workOrders.workItems.noPartsShort')}</span>
        </div>
      )}

      {/* Body — equipment (3 states) → diagnosis → parts & readiness. */}
      {open && (
      <div id={bodyId} className="space-y-3 px-3.5 py-3">
        {attached && !picking ? (
          <WorkItemEquipmentBlock
            equipment={wi.equipment!}
            readOnly={readOnly}
            onOpenEquipment={onSelectSubUnit}
            onChange={!readOnly ? () => setPicking(true) : undefined}
            onSelectSubUnit={onSelectSubUnit}
            onAddSubUnit={onAddSubUnit}
          />
        ) : showPicker ? (
          <WOEquipmentPicker
            serviceLocationId={serviceLocationId}
            value={wi.equipment?.id ?? null}
            onPick={(equipmentId) => {
              void onAttachEquipment?.(wi, equipmentId);
              // Clear (null) leaves the picker open so they can pick another;
              // a real pick collapses back to the attached block.
              if (equipmentId) setPicking(false);
            }}
            onAddNew={onAddEquipment ? () => onAddEquipment(wi) : undefined}
            onCancel={attached || noneNeeded ? () => setPicking(false) : undefined}
            onNotNeeded={
              onSetEquipmentNeeded
                ? () => {
                    void onSetEquipmentNeeded(wi, false);
                    setPicking(false);
                  }
                : undefined
            }
          />
        ) : noneNeeded ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-fg-dim">{t('workOrders.workItems.noEquipmentNeeded')}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  // Undo not-needed → back to needs-attach, and open the picker.
                  void onSetEquipmentNeeded?.(wi, true);
                  setPicking(true);
                }}
                className="card-action"
              >
                <PlusIcon className="size-3" />
                {t('workOrders.workItems.attach')}
              </button>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-fg-dim">
            {t('workOrders.workItems.noEquipmentLinked', { entity: getName('equipment') })}
          </span>
        )}

        {/* Diagnosis — tinted panel ONLY once there's a finding (or while
            editing). Empty state is a single quiet "+ Add diagnosis" invite: the
            old placeholder sentence just restated the status pill and made a
            fresh triage item look as heavy as a worked one. Card height should
            track real content. */}
        {diagnosis || editingDiagnosis ? (
          <div
            className="px-[11px] py-[9px]"
            style={{
              background: 'var(--bg-elev-2)',
              borderRadius: 'var(--r-sm)',
              borderLeft: '2px solid var(--border-strong)',
            }}
          >
            <div className="mb-[3px] flex items-baseline gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
                {t('workOrders.workItems.diagnosis')}
              </span>
              <span className="flex-1" />
              {!readOnly && onSaveDiagnosis && !editingDiagnosis && (
                <button
                  type="button"
                  onClick={() => setEditingDiagnosis(true)}
                  className="card-action shrink-0"
                >
                  {t('common.edit')}
                </button>
              )}
            </div>
            {editingDiagnosis && onSaveDiagnosis ? (
              <InlineComposer
                value={wi.diagnosis ?? ''}
                rows={3}
                placeholder={t('workOrders.workItems.diagnosisPlaceholder')}
                ariaLabel={t('workOrders.workItems.diagnosis')}
                onCancel={() => setEditingDiagnosis(false)}
                onSave={async (next) => {
                  await onSaveDiagnosis(wi, next);
                  setEditingDiagnosis(false);
                }}
              />
            ) : !readOnly && onSaveDiagnosis ? (
              // Font on the wrapper so the <button> inherits it (Preflight
              // `button { font: inherit }` trap — see the complaint above).
              <div className="text-[12px] leading-normal text-fg">
                <button
                  type="button"
                  onClick={() => setEditingDiagnosis(true)}
                  title={t('common.edit')}
                  className="block w-full cursor-text whitespace-pre-wrap text-left"
                >
                  {diagnosis}
                </button>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-[12px] leading-normal text-fg">{diagnosis}</p>
            )}
          </div>
        ) : !readOnly && onSaveDiagnosis ? (
          <div>
            <button
              type="button"
              onClick={() => setEditingDiagnosis(true)}
              className="card-action"
            >
              {`+ ${t('common.add')} ${t('workOrders.workItems.diagnosis').toLowerCase()}`}
            </button>
          </div>
        ) : null}

        {/* Parts & readiness — no parts on file yet. Per the card cleanup, the
            empty state drops the label + explanatory sentence and shows only a
            quiet action line: the two entry points into the PO form (order +
            field purchase), scoped to this work order. The label + parts table
            return once parts exist (procurement). */}
        {readOnly ? (
          <p className="text-[12px] text-fg-dim">{t('workOrders.workItems.noPartsShort')}</p>
        ) : (
          // Right-aligned pair (mock): Record field purchase (ghost) beside
          // Add parts (bordered) — both link into the PO form, scoped to this WO.
          <div className="flex items-center gap-2">
            <span className="flex-1" />
            <Button ghost size="xxs" href={`/purchase-orders/new?type=field&workOrderId=${workOrderId}`}>
              {t('workOrders.workItems.recordFieldPurchase')}
            </Button>
            <Button outline size="xxs" href={`/purchase-orders/new?type=order&workOrderId=${workOrderId}`}>
              {t('workOrders.workItems.addParts')}
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// Inline add-item composer (mock NewWorkItemComposer): predicted WI-id head,
// complaint, and the same inline WOEquipmentPicker the card uses (candidate list
// + Clear + add-new). Atomic create; status defaults server-side (Triage).
function NewWorkItemComposer({
  workOrderId,
  serviceLocationId,
  nextSequence,
  onClose,
}: {
  workOrderId: string;
  serviceLocationId?: string;
  nextSequence: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState('');
  const [equipmentId, setEquipmentId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      workOrderApi.createWorkItem(workOrderId, {
        description: complaint.trim(),
        equipmentId: equipmentId ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
      onClose();
    },
    onError: (err) =>
      showError(t('common.form.errorCreate', { entity: getName('work_item') }), extractApiError(err) ?? undefined),
  });

  const canSave = complaint.trim().length > 0 && !createMutation.isPending;

  // "+ Add new equipment on site" from the composer. Creating a record is a
  // full page, and the composer's draft can't survive that navigation — so we
  // commit this complaint as a work item first, then hand off to the equipment
  // page, which attaches the new record back to it on return (the same path a
  // saved card uses). The item needs a description, hence the complaint guard.
  const [committing, setCommitting] = useState(false);
  const handleAddNewEquipment = async () => {
    const description = complaint.trim();
    if (!description || !serviceLocationId || committing) {
      if (!description) {
        showError(
          t('workOrders.workItems.complaintRequiredForEquipment', {
            defaultValue: 'Enter a complaint before adding equipment.',
          })
        );
      }
      return;
    }
    setCommitting(true);
    try {
      const created = await workOrderApi.createWorkItem(workOrderId, { description });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
      navigate(
        equipmentCreateUrl({
          returnTo: `/work-orders/${workOrderId}?tab=items`,
          locationId: serviceLocationId,
          attachTo: workItemAttachToken(created.id),
        })
      );
    } catch (err) {
      setCommitting(false);
      showError(t('common.form.errorCreate', { entity: getName('work_item') }), extractApiError(err) ?? undefined);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-bg-elev"
      style={{ borderLeft: '3px solid var(--accent-500)' }}
    >
      {/* Head — predicted WI-id + "New work item" (mock composer head). */}
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2.5">
        <span className="font-mono text-[11.5px] font-semibold text-fg-dim">
          {workItemLabel(getAbbrev('work_item'), nextSequence)}
        </span>
        <span className="text-[13px] font-semibold text-fg-strong">
          {t('workOrders.workItems.newItem', { entity: getName('work_item') })}
        </span>
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
            {t('workOrders.workItems.complaintSummary')}
          </div>
          <Input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            autoFocus
            aria-label={t('workOrders.workItems.complaintSummary')}
            placeholder={t('workOrders.workItems.complaintPlaceholder')}
          />
        </div>
        {serviceLocationId && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
              {getName('equipment')}
            </div>
            <WOEquipmentPicker
              serviceLocationId={serviceLocationId}
              value={equipmentId}
              onPick={setEquipmentId}
              onAddNew={handleAddNewEquipment}
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button plain onClick={onClose} disabled={createMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" onClick={() => createMutation.mutate()} disabled={!canSave}>
            <PlusIcon data-slot="icon" />
            {createMutation.isPending
              ? t('common.saving')
              : t('common.actions.add', { entity: getName('work_item') })}
          </Button>
        </div>
      </div>
    </div>
  );
}
