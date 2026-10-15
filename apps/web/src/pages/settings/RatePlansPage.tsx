import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon, PlusIcon, TagIcon } from '@heroicons/react/24/outline';
import { ratePlansApi, type RatePlan, type RatePlanRequest } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../../components/catalyst/dropdown';
import IconButton from '../../components/IconButton';
import { InactiveToggle, ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import { adjustmentPercent, toPlanRequest } from '../../components/pricebook/ratePlanModel';
import { RATE_PLANS_KEY, useRatePlanError } from '../../components/pricebook/ratePlanRequests';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill, Tag } from '../../components/ui/Pill';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { useEntityNames } from '../../hooks/useEntityNames';

/**
 * Rate plans: how an account is priced (labor rates, how parts are marked
 * up, an overall adjustment). Accounts without a plan use the default.
 * Everyone can read them; changing them needs MANAGE_PRICING. Plans are
 * never deleted, only deactivated.
 */
export default function RatePlansPage() {
  const names = useEntityNames();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const planError = useRatePlanError();
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: RATE_PLANS_KEY, queryFn: () => ratePlansApi.getAll() });
  const list = data ?? [];
  const rows = list.filter((p) => p.active || showInactive);

  const update = useMutation({
    mutationFn: ({ plan, change }: { plan: RatePlan; change: Partial<RatePlanRequest> }) =>
      ratePlansApi.update(plan.id, toPlanRequest(plan, change)),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: RATE_PLANS_KEY });
      showSuccess(t('settings.ratePlans.toast.saved', { name: saved.name }));
    },
    onError: (err) => showError(t('settings.ratePlans.toast.saveFailed'), planError(err)),
  });

  return (
    <>
      <PageHead
        title={t('settings.ratePlans.title')}
        sub={t('settings.ratePlans.description', names)}
        actions={
          canManage && (
            <Button color="accent" size="xs" href="/settings/rate-plans/new">
              <PlusIcon className="size-4" />
              {t('settings.ratePlans.add')}
            </Button>
          )
        }
      />
      {!canManage && <ViewOnlyNotice />}

      <Card>
        <CardHead>
          <CardTitle>{t('settings.ratePlans.cardTitle')}</CardTitle>
          {list.length > 0 && <CardSub>{rows.length}</CardSub>}
          <span className="flex-1" />
          <InactiveToggle count={list.filter((p) => !p.active).length} shown={showInactive} onToggle={() => setShowInactive((s) => !s)} />
        </CardHead>
        <CardBody flush>
          {isLoading ? (
            <LoadingState label={t('settings.ratePlans.loading')} />
          ) : error ? (
            <ErrorState
              title={t('settings.ratePlans.loadFailed')}
              description={extractApiError(error) ?? (error as Error).message}
              action={
                <Button outline onClick={() => refetch()}>
                  {t('common.actions.tryAgain')}
                </Button>
              }
            />
          ) : list.length === 0 ? (
            <EmptyState icon={<TagIcon className="size-10 text-fg-dim" />} title={t('settings.ratePlans.emptyTitle')} />
          ) : (
            <DenseTable className="min-w-[860px]">
              <DenseTHead>
                <tr>
                  <th>{t('settings.ratePlans.col.plan')}</th>
                  <th>{t('settings.ratePlans.col.assigned')}</th>
                  <th>{t('settings.ratePlans.col.labor')}</th>
                  <th>{t('settings.ratePlans.col.parts')}</th>
                  <th>{t('settings.ratePlans.col.adjustment')}</th>
                  <th>{t('settings.ratePlans.col.members')}</th>
                  <th>{t('settings.ratePlans.col.status')}</th>
                  {canManage && <th style={{ width: 40 }} />}
                </tr>
              </DenseTHead>
              <tbody>
                {rows.map((p) => {
                  const adjust = adjustmentPercent(p.priceMultiplier);
                  return (
                    <DenseRow key={p.id} onClick={() => navigate(`/settings/rate-plans/${p.id}`)} className={p.active ? undefined : 'opacity-55'}>
                      <td>
                        <span className="flex items-center gap-2 font-semibold text-fg-strong">
                          {p.name}
                          {p.isDefault && <Tag word>{t('settings.ratePlans.default')}</Tag>}
                        </span>
                        {p.description && <div className="max-w-[300px] truncate text-[11px] text-fg-muted">{p.description}</div>}
                      </td>
                      <td data-label={t('settings.ratePlans.col.assigned')}>
                        {p.isDefault ? (
                          <span className="text-fg-muted">{t('settings.ratePlans.everyoneElse')}</span>
                        ) : p.accountCount ? (
                          t('settings.ratePlans.accountCount', { count: p.accountCount })
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td data-label={t('settings.ratePlans.col.labor')} className={p.laborRates.length ? undefined : 'text-fg-muted'}>
                        {p.laborRates.length
                          ? t('settings.ratePlans.laborOverridden', { count: p.laborRates.length })
                          : t('settings.ratePlans.laborStandard')}
                      </td>
                      <td data-label={t('settings.ratePlans.col.parts')} className={p.markupTiers.length ? undefined : 'text-fg-muted'}>
                        {p.markupTiers.length
                          ? t('settings.ratePlans.partsTiers', { count: p.markupTiers.length })
                          : t('settings.ratePlans.partsCatalog')}
                      </td>
                      <td data-label={t('settings.ratePlans.col.adjustment')} className="tabular-nums">
                        {adjust ? (
                          t('settings.ratePlans.adjustmentValue', { value: `${adjust > 0 ? '+' : '−'}${Math.abs(adjust)}%` })
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td data-label={t('settings.ratePlans.col.members')} className={p.memberBenefitsStack ? undefined : 'text-fg-muted'}>
                        {p.memberBenefitsStack ? t('settings.ratePlans.membersOnTop') : t('settings.ratePlans.membersOff')}
                      </td>
                      <td>
                        {p.active ? (
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
                        <td className="right" onClick={(e) => e.stopPropagation()}>
                          <Dropdown>
                            <DropdownButton as={IconButton} aria-label={t('settings.ratePlans.actionsFor', { name: p.name })}>
                              <EllipsisVerticalIcon className="size-4" />
                            </DropdownButton>
                            <DropdownMenu anchor="bottom end">
                              <DropdownItem onClick={() => navigate(`/settings/rate-plans/${p.id}`)}>
                                <DropdownLabel>{t('common.edit')}</DropdownLabel>
                              </DropdownItem>
                              <DropdownItem onClick={() => navigate(`/settings/rate-plans/new?from=${p.id}`)}>
                                <DropdownLabel>{t('settings.ratePlans.duplicate')}</DropdownLabel>
                              </DropdownItem>
                              {p.active && !p.isDefault && (
                                <DropdownItem onClick={() => update.mutate({ plan: p, change: { isDefault: true } })}>
                                  <DropdownLabel>{t('settings.ratePlans.makeDefault')}</DropdownLabel>
                                </DropdownItem>
                              )}
                              <DropdownItem
                                disabled={p.isDefault}
                                title={p.isDefault ? t('settings.ratePlans.defaultCantDeactivate') : undefined}
                                onClick={() => update.mutate({ plan: p, change: { active: !p.active } })}
                              >
                                <DropdownLabel>{p.active ? t('settings.ratePlans.deactivate') : t('settings.ratePlans.activate')}</DropdownLabel>
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </td>
                      )}
                    </DenseRow>
                  );
                })}
              </tbody>
            </DenseTable>
          )}
        </CardBody>
      </Card>
    </>
  );
}
