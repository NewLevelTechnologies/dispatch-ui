/* eslint-disable i18next/no-literal-string -- dense settings admin surface; entity names go through getName(), "Plan" + short labels stay literal (no glossary key for plan; same convention as CompanyProfilePanel). */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, PencilSquareIcon, ArchiveBoxArrowDownIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import {
  agreementPlanApi,
  type AgreementPlanResponse,
  type CadenceUnit,
  type MemberBenefits,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { PageHead } from '../../components/ui/PageHead';
import { Card, CardBody } from '../../components/ui/Card';
import { DenseTable, DenseTHead, DenseRow } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill } from '../../components/ui/Pill';
import { Callout } from '../../components/ui/Callout';
import { Button } from '../../components/catalyst/button';
import { Switch } from '../../components/catalyst/switch';
import { Text } from '../../components/catalyst/text';
import IconButton from '../../components/IconButton';
import ConfirmDialog from '../../components/ConfirmDialog';
import AgreementPlanFormDialog from '../../components/AgreementPlanFormDialog';
import { showSuccess, showError, extractApiError } from '../../lib/toast';

const CADENCE_ADVERB: Record<CadenceUnit, string> = {
  WEEK: 'Weekly',
  MONTH: 'Monthly',
  QUARTER: 'Quarterly',
  YEAR: 'Annually',
};

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

function defaultsLabel(p: AgreementPlanResponse): string {
  const amt = p.defaultAmount != null ? money(p.defaultAmount) : null;
  const cadence = p.defaultCadenceUnit
    ? p.defaultCadenceInterval === 1
      ? CADENCE_ADVERB[p.defaultCadenceUnit]
      : `every ${p.defaultCadenceInterval} ${p.defaultCadenceUnit.toLowerCase()}s`
    : null;
  return [amt, cadence].filter(Boolean).join(' · ') || '—';
}

// Compact "included terms" join for the list row (the detail card shows the full chips).
function benefitsSummary(b?: MemberBenefits): string {
  if (!b) return '';
  const parts: string[] = [];
  if (b.coveredPmVisits != null && b.coveredPmVisits > 0) parts.push(`${b.coveredPmVisits} PM`);
  if (b.tripFeeWaived) parts.push('trip waived');
  if (b.laborDiscountPct != null && b.laborDiscountPct > 0) parts.push(`${b.laborDiscountPct}% labor`);
  if (b.partsDiscountPct != null && b.partsDiscountPct > 0) parts.push(`${b.partsDiscountPct}% parts`);
  if (b.priorityDispatch) parts.push('priority');
  return parts.join(' · ');
}

export default function AgreementPlansPanel() {
  const { getName } = useGlossary();
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const queryClient = useQueryClient();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [formState, setFormState] = useState<{ plan: AgreementPlanResponse | null } | null>(null);
  const [archiving, setArchiving] = useState<AgreementPlanResponse | null>(null);

  const { data: plans, isLoading, error } = useQuery({
    queryKey: ['agreement-plans', includeInactive],
    queryFn: () => agreementPlanApi.getAll(includeInactive),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => agreementPlanApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-plans'] });
      setArchiving(null);
      showSuccess('Plan archived');
    },
    onError: (err) => showError("Couldn't archive plan", extractApiError(err) ?? undefined),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => agreementPlanApi.update(id, { active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-plans'] });
      showSuccess('Plan restored');
    },
    onError: (err) => showError("Couldn't restore plan", extractApiError(err) ?? undefined),
  });

  const rows = plans ?? [];

  return (
    <>
      <PageHead
        title="Plans"
        sub={`Reusable ${getName('agreement').toLowerCase()} templates — member benefits, billing, and term defaults a sale starts from.`}
        actions={
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <Switch checked={includeInactive} onChange={setIncludeInactive} aria-label="Show archived plans" />
              <span className="text-[12.5px] text-fg-muted">Show archived</span>
            </label>
            {canEdit && (
              <Button color="accent" size="xs" onClick={() => setFormState({ plan: null })}>
                <PlusIcon className="size-4" />
                New plan
              </Button>
            )}
          </div>
        }
      />

      {error ? (
        <Callout kind="danger" title="Couldn't load plans">
          {extractApiError(error) ?? (error as Error).message}
        </Callout>
      ) : isLoading ? (
        <Text tone="muted">Loading plans…</Text>
      ) : rows.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="No plans yet"
              description={`Create a plan to sell ${getName('agreement', true).toLowerCase()} from a reusable template — member benefits snapshot onto each sale.`}
              action={canEdit ? <Button color="accent" size="xs" onClick={() => setFormState({ plan: null })}>New plan</Button> : undefined}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody flush>
            <DenseTable>
              <DenseTHead>
                <tr>
                  <th>Plan</th>
                  <th>Billing default</th>
                  <th>Member benefits</th>
                  <th>Status</th>
                  {canEdit && <th className="right">Actions</th>}
                </tr>
              </DenseTHead>
              <tbody>
                {rows.map((plan) => {
                  const benefits = benefitsSummary(plan.benefits);
                  return (
                    <DenseRow key={plan.id} className={!plan.active ? 'opacity-55' : undefined}>
                      <td className="strong">
                        <div className="text-fg-strong">{plan.name}</div>
                        <div className="text-[11px] text-fg-muted">
                          {plan.classification === 'CONTRACT' ? 'Contract' : 'Internal'} · {getName('work_order')}-based
                        </div>
                      </td>
                      <td className="muted tabular-nums">{defaultsLabel(plan)}</td>
                      <td className="muted">{benefits || <span className="text-fg-dim">None</span>}</td>
                      <td>
                        {plan.active ? (
                          <Pill tone="success" dot live>Active</Pill>
                        ) : (
                          <Pill tone="neutral" dot>Archived</Pill>
                        )}
                      </td>
                      {canEdit && (
                        <td className="right">
                          <div className="flex items-center justify-end gap-1">
                            <IconButton aria-label="Edit plan" onClick={() => setFormState({ plan })}>
                              <PencilSquareIcon className="size-4" />
                            </IconButton>
                            {plan.active ? (
                              <IconButton aria-label="Archive plan" onClick={() => setArchiving(plan)}>
                                <ArchiveBoxArrowDownIcon className="size-4" />
                              </IconButton>
                            ) : (
                              <IconButton aria-label="Restore plan" onClick={() => restoreMutation.mutate(plan.id)}>
                                <ArrowUturnLeftIcon className="size-4" />
                              </IconButton>
                            )}
                          </div>
                        </td>
                      )}
                    </DenseRow>
                  );
                })}
              </tbody>
            </DenseTable>
          </CardBody>
        </Card>
      )}

      <AgreementPlanFormDialog
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        plan={formState?.plan ?? undefined}
      />
      <ConfirmDialog
        isOpen={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archiveMutation.mutate(archiving.id)}
        title={archiving ? `Archive “${archiving.name}”?` : ''}
        message={`Archived plans can't be sold from new ${getName('agreement', true).toLowerCase()}. Existing ${getName('agreement', true).toLowerCase()} keep the benefits they were sold with. You can restore it later.`}
        confirmLabel="Archive"
        isDestructive
      />
    </>
  );
}
