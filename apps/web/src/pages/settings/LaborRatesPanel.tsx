import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ClockIcon, EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import { laborRatesApi, type LaborRateType, type LaborRateTypeRequest } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../../components/catalyst/dialog';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../../components/catalyst/dropdown';
import { Description, Field, Label } from '../../components/catalyst/fieldset';
import { Input } from '../../components/catalyst/input';
import IconButton from '../../components/IconButton';
import { DragHandle } from '../../components/settings/DragHandle';
import { moveLine } from '../../components/document/documentModel';
import { Card, CardBody } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill, Tag } from '../../components/ui/Pill';
import { errorCode, extractApiError, showError, showSuccess } from '../../lib/toast';

const LABOR_RATES_KEY = ['labor-rates'] as const;

const toRequest = (r: LaborRateType, change: Partial<LaborRateTypeRequest> = {}): LaborRateTypeRequest => ({
  name: r.name,
  billRate: r.billRate,
  costRate: r.costRate,
  sortOrder: r.sortOrder,
  active: r.active,
  ...change,
});

/** Margin on an hour, as a whole percent; null without both rates. */
const hourMargin = (r: LaborRateType) =>
  r.billRate && r.costRate != null ? Math.round(((r.billRate - r.costRate) / r.billRate) * 100) : null;

/** Words a labor rate write failure from its `code`. */
function useLaborRateError() {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    switch (code) {
      case 'NAME_TAKEN':
      case 'REGULAR_REQUIRED':
        return t(`settings.laborRates.errors.${code}`);
      default:
        return extractApiError(err) ?? t('settings.laborRates.errors.generic');
    }
  };
}

/**
 * Labor rate types: what an hour of each kind bills at and costs. Every
 * tenant starts with Regular, Overtime, After-hours and Holiday; it can add
 * its own. Everyone can read them; changing them needs MANAGE_PRICING.
 * Nothing is deleted: rate types are deactivated, except Regular.
 */
export default function LaborRatesPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const rateError = useLaborRateError();
  const [editing, setEditing] = useState<{ rate: LaborRateType | null } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: LABOR_RATES_KEY,
    queryFn: () => laborRatesApi.getAll(),
  });
  const list = data ?? [];
  const nextSortOrder = list.length ? Math.max(...list.map((r) => r.sortOrder)) + 1 : 0;

  const update = useMutation({
    mutationFn: ({ id, request }: { id: string; request: LaborRateTypeRequest }) => laborRatesApi.update(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABOR_RATES_KEY });
      showSuccess(t('settings.laborRates.toast.saved'));
    },
    onError: (err) => showError(t('settings.laborRates.toast.saveFailed'), rateError(err)),
  });

  // Every type, inactive ones too, so the server can set the whole order at once.
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const reorder = useMutation({
    mutationFn: (orderedIds: string[]) => laborRatesApi.reorder(orderedIds),
    onMutate: (orderedIds) => {
      const byId = new Map(list.map((r) => [r.id, r]));
      queryClient.setQueryData(LABOR_RATES_KEY, orderedIds.map((id) => byId.get(id)!));
    },
    onSuccess: (next) => queryClient.setQueryData(LABOR_RATES_KEY, next),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: LABOR_RATES_KEY });
      showError(
        t('settings.laborRates.toast.reorderFailed'),
        errorCode(err) === 'INVALID_REQUEST' ? t('settings.laborRates.errors.staleOrder') : rateError(err),
      );
    },
  });
  const canDrag = canManage && list.length > 1;
  const drop = (targetId: string) => {
    if (!drag) return;
    const ids = list.map((r) => r.id);
    const next = moveLine(ids, drag.id, targetId);
    setDrag(null);
    if (next !== ids) reorder.mutate(next);
  };

  const unpriced = list.filter((r) => r.active && r.billRate == null).length;

  return (
    <>
      <PageHead
        title={t('settings.laborRates.title')}
        sub={
          list.length
            ? unpriced
              ? t('settings.laborRates.subtitleUnpriced', { count: list.filter((r) => r.active).length, unpriced })
              : t('settings.laborRates.subtitle', { count: list.filter((r) => r.active).length })
            : null
        }
        actions={
          canManage && (
            <Button color="accent" size="xs" onClick={() => setEditing({ rate: null })}>
              <PlusIcon className="size-4" />
              {t('settings.laborRates.add')}
            </Button>
          )
        }
      />

      <div className="mt-4">
        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label={t('settings.laborRates.loading')} />
            ) : error ? (
              <ErrorState
                title={t('settings.laborRates.loadFailed')}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : list.length === 0 ? (
              <EmptyState
                icon={<ClockIcon className="size-10 text-fg-dim" />}
                title={t('settings.laborRates.emptyTitle')}
                description={t('settings.laborRates.emptyDescription')}
              />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.laborRates.col.name')}</th>
                      <th className="right">{t('settings.laborRates.col.billRate')}</th>
                      <th className="right">
                        <span className="inline-flex items-center gap-1.5">
                          {t('settings.laborRates.col.costRate')} <Tag word>{t('settings.laborRates.internal')}</Tag>
                        </span>
                      </th>
                      <th className="right">{t('settings.laborRates.col.margin')}</th>
                      <th>{t('settings.laborRates.col.status')}</th>
                      {canManage && <th style={{ width: 40 }} />}
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {list.map((r) => {
                      const margin = hourMargin(r);
                      return (
                        <DenseRow
                          key={r.id}
                          draggable={canDrag}
                          onDragStart={(e) => {
                            if (!canDrag || reorder.isPending) return;
                            e.dataTransfer.effectAllowed = 'move';
                            setDrag({ id: r.id, over: null });
                          }}
                          onDragOver={(e) => {
                            if (!drag) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (drag.over !== r.id) setDrag({ ...drag, over: r.id });
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            drop(r.id);
                          }}
                          onDragEnd={() => setDrag(null)}
                          className={clsx(
                            !r.active && 'opacity-55',
                            drag?.id === r.id && 'opacity-50',
                            drag && drag.over === r.id && drag.id !== r.id && 'outline outline-2 -outline-offset-2 outline-accent-500/40',
                          )}
                        >
                          <td className="strong">
                            <span className="flex items-center gap-2">
                              {canDrag && (
                                <span className="hidden sm:flex">
                                  <DragHandle ariaLabel={t('settings.laborRates.dragToReorder')} />
                                </span>
                              )}
                              {r.name}
                              {r.role === 'REGULAR' && <Tag word>{t('settings.laborRates.defaultRate')}</Tag>}
                            </span>
                          </td>
                          <td className="right num" data-label={t('settings.laborRates.col.billRate')}>
                            {r.billRate == null ? (
                              <Pill tone="warning">{t('settings.laborRates.notSet')}</Pill>
                            ) : (
                              t('settings.laborRates.perHour', { amount: formatCurrency(r.billRate) })
                            )}
                          </td>
                          <td className="right num" data-label={t('settings.laborRates.col.costRate')}>
                            {r.costRate == null ? (
                              <span className="text-fg-muted">{t('settings.laborRates.unknown')}</span>
                            ) : (
                              t('settings.laborRates.perHour', { amount: formatCurrency(r.costRate) })
                            )}
                          </td>
                          <td className="right num" data-label={t('settings.laborRates.col.margin')}>
                            {margin == null ? <span className="text-fg-dim">—</span> : `${margin}%`}
                          </td>
                          <td>
                            {r.active ? (
                              <Pill tone="success" dot>
                                {t('common.active')}
                              </Pill>
                            ) : (
                              <Pill tone="neutral" dot>
                                {t('common.inactive')}
                              </Pill>
                            )}
                          </td>
                          {canManage && (
                            <td className="right">
                              <Dropdown>
                                <DropdownButton as={IconButton} aria-label={t('settings.laborRates.actionsFor', { name: r.name })}>
                                  <EllipsisVerticalIcon className="size-4" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  <DropdownItem onClick={() => setEditing({ rate: r })}>
                                    <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                  </DropdownItem>
                                  {r.role !== 'REGULAR' && (
                                    <DropdownItem onClick={() => update.mutate({ id: r.id, request: toRequest(r, { active: !r.active }) })}>
                                      <DropdownLabel>{r.active ? t('settings.laborRates.deactivate') : t('settings.laborRates.activate')}</DropdownLabel>
                                    </DropdownItem>
                                  )}
                                </DropdownMenu>
                              </Dropdown>
                            </td>
                          )}
                        </DenseRow>
                      );
                    })}
                  </tbody>
                </DenseTable>
                <ListFooter left={t('settings.laborRates.footer')} />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Dialog open={editing != null} onClose={() => setEditing(null)} size="md">
        {editing && <RateForm rate={editing.rate} nextSortOrder={nextSortOrder} onClose={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

const money = (v: number | null) => (v == null ? '' : String(v));

function RateForm({ rate, nextSortOrder, onClose }: { rate: LaborRateType | null; nextSortOrder: number; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const rateError = useLaborRateError();
  const [name, setName] = useState(rate?.name ?? '');
  const [bill, setBill] = useState(money(rate?.billRate ?? null));
  const [cost, setCost] = useState(money(rate?.costRate ?? null));
  const parse = (v: string) => (v.trim() === '' ? null : Number(v));
  const billNum = parse(bill);
  const costNum = parse(cost);
  const ok = (n: number | null) => n == null || (Number.isFinite(n) && n >= 0);
  const ready = name.trim() !== '' && ok(billNum) && ok(costNum);
  const regular = rate?.role === 'REGULAR';

  const save = useMutation({
    mutationFn: () => {
      const request: LaborRateTypeRequest = {
        name: name.trim(),
        billRate: billNum,
        costRate: costNum,
        sortOrder: rate?.sortOrder ?? nextSortOrder,
        active: rate?.active ?? true,
      };
      return rate ? laborRatesApi.update(rate.id, request) : laborRatesApi.create(request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LABOR_RATES_KEY });
      showSuccess(t('settings.laborRates.toast.saved'));
      onClose();
    },
    onError: (err) => showError(t('settings.laborRates.toast.saveFailed'), rateError(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>{rate ? t('settings.laborRates.form.editTitle', { name: rate.name }) : t('settings.laborRates.add')}</DialogTitle>
      <DialogDescription>
        {regular ? t('settings.laborRates.form.regularDescription') : t('settings.laborRates.form.description')}
      </DialogDescription>
      <DialogBody>
        <Field>
          <Label>{t('settings.laborRates.form.name')}</Label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.laborRates.form.namePlaceholder')} />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field>
            <Label>{t('settings.laborRates.form.billRate')}</Label>
            <Input
              inputMode="decimal"
              value={bill}
              invalid={!ok(billNum)}
              onChange={(e) => setBill(e.target.value)}
              placeholder={t('settings.laborRates.notSet')}
              className="[&_input]:text-right"
            />
          </Field>
          <Field>
            <Label>{t('settings.laborRates.form.costRate')}</Label>
            <Input
              inputMode="decimal"
              value={cost}
              invalid={!ok(costNum)}
              onChange={(e) => setCost(e.target.value)}
              placeholder={t('settings.laborRates.unknown')}
              className="[&_input]:text-right"
            />
            <Description>{t('settings.laborRates.form.costHint')}</Description>
          </Field>
        </div>
        <p className="mt-2 text-[11.5px] text-fg-muted">{t('settings.laborRates.form.billHint')}</p>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!ready || save.isPending}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </form>
  );
}
