/* eslint-disable i18next/no-literal-string -- dense operational labels + glyphs stay literal, same convention as ServiceLocationDetailPage. */
// Coverage tab — the resolved membership the generator reads, with provenance
// (tag-seeded / manual / auto-added). Manual add/remove is wired; tag-selector
// editing is a later pass. Auto-add (PR5) catches locations tagged AFTER a tag
// selector points at them — it does not back-fill, so initial population is
// manual here.
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPinIcon, TrashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  agreementApi,
  type CoverageMembershipSource,
  type ServiceLocation,
} from '../../api';
import { Card } from '../../components/catalyst/card';
import { Button } from '../../components/catalyst/button';
import IconButton from '../../components/IconButton';
import { Pill } from '../../components/ui/Pill';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { useGlossary } from '../../contexts/GlossaryContext';
import {
  DenseTable,
  DenseTHead,
  DenseRow,
  CellStack,
  CellTop,
  CellSub,
} from '../../components/ui/DenseTable';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../../components/catalyst/dialog';
import { Checkbox } from '../../components/catalyst/checkbox';
import { Input, InputGroup } from '../../components/catalyst/input';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import {
  agreementCoverageQueryOptions,
  locationLabel,
  formatDay,
  type LocationMap,
} from './agreementShared';
import { CardTitle } from './agreementCards';

const SOURCE_BADGE: Record<CoverageMembershipSource, { label: string; tone: 'info' | 'neutral' | 'accent' }> = {
  TAG_SEEDED: { label: 'Tag rule', tone: 'info' },
  MANUAL: { label: 'Added manually', tone: 'neutral' },
  AUTO_ADDED: { label: 'Auto-added', tone: 'accent' },
};

function SourceBadge({ source }: { source: CoverageMembershipSource }) {
  const s = SOURCE_BADGE[source] ?? SOURCE_BADGE.MANUAL;
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export default function AgreementCoverageTab({
  agreementId,
  customerLocationCount,
  locationMap,
}: {
  agreementId: string;
  customerLocationCount: number | undefined;
  locationMap: LocationMap | undefined;
}) {
  const queryClient = useQueryClient();
  const { getName } = useGlossary();
  const locPlural = getName('service_location', true).toLowerCase();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: coverage, isLoading, isError, refetch } = useQuery(
    agreementCoverageQueryOptions(agreementId),
  );

  const invalidateCoverage = () => {
    queryClient.invalidateQueries({ queryKey: ['agreement', agreementId, 'coverage'] });
    // coverageLocationCount rides the root agreement payload.
    queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] });
  };

  const removeMutation = useMutation({
    mutationFn: (serviceLocationId: string) =>
      agreementApi.removeCoverageLocation(agreementId, serviceLocationId),
    onSuccess: () => {
      invalidateCoverage();
      showSuccess(`${getName('service_location')} removed from coverage`);
    },
    onError: (err) => showError(`Couldn't remove ${getName('service_location').toLowerCase()}`, extractApiError(err) ?? undefined),
  });

  if (isLoading) return <LoadingState label="Loading coverage…" />;
  if (isError || !coverage) {
    return (
      <ErrorState
        title="Couldn't load coverage"
        action={<Button outline onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  const coveredIds = new Set(coverage.memberships.map((m) => m.serviceLocationId));
  const ruleText =
    coverage.selectorMode === 'TAG'
      ? `${getName('service_location', true)} matched by tag rule`
      : `Manually selected ${locPlural}`;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Rule + rollup */}
      <Card
        padding="none"
        title={<CardTitle icon={<MapPinIcon className="size-3.5" />}>Coverage</CardTitle>}
      >
        <div className="grid grid-cols-2 border-b border-border-soft">
          <div className="border-r border-border-soft px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{getName('service_location', true)}</div>
            <div className="mt-0.5 text-[18px] font-bold leading-none tracking-tight text-fg-strong">
              <span className="font-mono tabular-nums">{coverage.locationCount}</span>
              {customerLocationCount != null && (
                <span className="text-[12px] font-medium text-fg-muted"> of {customerLocationCount}</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-fg-muted">{ruleText}</div>
          </div>
          <div className="px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Selector</div>
            <div className="mt-0.5 text-[13px] font-semibold text-fg-strong">
              {coverage.selectorMode === 'TAG' ? 'Tag-driven' : 'Static list'}
            </div>
            <div className="mt-1 text-[11px] text-fg-muted">
              {coverage.autoAdd ? `Auto-extends to newly-matched ${locPlural}` : 'Fixed — no auto-add'}
            </div>
          </div>
        </div>
        {coverage.autoAdd && (
          <div className="px-3.5 py-2 text-[11.5px] text-fg-muted">
            <span className="font-semibold text-fg-accent">Auto-extends ·</span> newly-tagged {locPlural} join
            at the next cycle.
          </div>
        )}
      </Card>

      {/* Resolved membership with provenance */}
      <Card
        padding="none"
        title={`Covered ${locPlural}`}
        subtitle={`${coverage.memberships.length} of ${coverage.locationCount}`}
        action={<Button outline size="xxs" onClick={() => setIsAddOpen(true)}>{`Add ${locPlural}`}</Button>}
      >
        {coverage.memberships.length === 0 ? (
          <EmptyState
            compact
            title={`No covered ${locPlural}`}
            description={`Add ${locPlural} to start generating ${getName('work_order', true).toLowerCase()}.`}
            action={<Button outline size="xxs" onClick={() => setIsAddOpen(true)}>{`Add ${locPlural}`}</Button>}
          />
        ) : (
          <DenseTable>
            <DenseTHead>
              <tr>
                <th>{getName('service_location')}</th>
                <th>Covered since</th>
                <th>How</th>
                <th style={{ width: 44 }}></th>
              </tr>
            </DenseTHead>
            <tbody>
              {coverage.memberships.map((m) => {
                const loc = locationLabel(locationMap, m.serviceLocationId);
                return (
                  <DenseRow key={m.id}>
                    <td>
                      <CellStack>
                        <CellTop>{loc.name}</CellTop>
                        {loc.sub && <CellSub>{loc.sub}</CellSub>}
                      </CellStack>
                    </td>
                    <td className="muted">{formatDay(m.effectiveCoverageStart)}</td>
                    <td>
                      <SourceBadge source={m.source} />
                    </td>
                    <td className="right">
                      <IconButton
                        aria-label={`Remove ${loc.name} from coverage`}
                        onClick={() => removeMutation.mutate(m.serviceLocationId)}
                      >
                        <TrashIcon className="size-3.5" />
                      </IconButton>
                    </td>
                  </DenseRow>
                );
              })}
            </tbody>
          </DenseTable>
        )}
      </Card>

      <AddCoverageDialog
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        agreementId={agreementId}
        locationMap={locationMap}
        coveredIds={coveredIds}
        onAdded={invalidateCoverage}
      />
    </div>
  );
}

function AddCoverageDialog({
  isOpen,
  onClose,
  agreementId,
  locationMap,
  coveredIds,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  locationMap: LocationMap | undefined;
  coveredIds: Set<string>;
  onAdded: () => void;
}) {
  const { getName } = useGlossary();
  const locPlural = getName('service_location', true).toLowerCase();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect -- reset selection on open */
  useEffect(() => {
    if (isOpen) {
      setSelected(new Set());
      setQ('');
    }
  }, [isOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const available = useMemo(() => {
    const all: ServiceLocation[] = locationMap ? [...locationMap.values()] : [];
    const notCovered = all.filter((l) => !coveredIds.has(l.id));
    const needle = q.trim().toLowerCase();
    if (!needle) return notCovered;
    return notCovered.filter((l) =>
      [l.locationName, l.address?.streetAddress, l.address?.city, l.locationNumber]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle)),
    );
  }, [locationMap, coveredIds, q]);

  const addMutation = useMutation({
    mutationFn: () =>
      agreementApi.addCoverageLocations(agreementId, { serviceLocationIds: [...selected] }),
    onSuccess: () => {
      onAdded();
      showSuccess(`${selected.size} ${getName('service_location', selected.size !== 1).toLowerCase()} added to coverage`);
      onClose();
    },
    onError: (err) => showError(`Couldn't add ${locPlural}`, extractApiError(err) ?? undefined),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <DialogTitle>Add {locPlural} to coverage</DialogTitle>
      <DialogDescription>
        Pick from this {getName('customer').toLowerCase()}&rsquo;s {locPlural}. Covered {locPlural} generate{' '}
        {getName('work_order', true).toLowerCase()} on the {getName('agreement').toLowerCase()}&rsquo;s cadence.
      </DialogDescription>
      <DialogBody>
        <InputGroup>
          <MagnifyingGlassIcon data-slot="icon" />
          <Input type="search" placeholder={`Search ${locPlural}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </InputGroup>
        <div className="mt-3 max-h-[320px] overflow-y-auto rounded-lg border border-border">
          {available.length === 0 ? (
            <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
              {locationMap ? `No ${locPlural} left to add.` : `Loading ${locPlural}…`}
            </div>
          ) : (
            available.map((l, i) => {
              const name = l.locationName || l.address?.streetAddress || `Location ${l.id.slice(0, 8)}`;
              const sub = [l.address?.city, l.address?.state].filter(Boolean).join(', ');
              return (
                <label
                  key={l.id}
                  className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2 ${i < available.length - 1 ? 'border-b border-border-soft' : ''} hover:bg-bg-hover`}
                >
                  <Checkbox color="accent" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-fg-strong">{name}</span>
                    {sub && <span className="block truncate text-[11px] text-fg-muted">{sub}</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={addMutation.isPending}>
          Cancel
        </Button>
        <Button
          color="accent"
          onClick={() => addMutation.mutate()}
          disabled={selected.size === 0 || addMutation.isPending}
        >
          {addMutation.isPending ? 'Adding…' : `Add ${selected.size || ''}`.trim()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
