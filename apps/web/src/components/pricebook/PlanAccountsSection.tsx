import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ratePlansApi, type CustomerSearchResult } from '../../api/setup';
import { useUrlPage } from '../../hooks/useUrlPage';
import { Button } from '../catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import CustomerPicker from '../CustomerPicker';
import { ListFooter } from '../ui/ListFooter';
import { formatDateShort } from '../customer-detail/format';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { RATE_PLANS_KEY } from './ratePlanRequests';

const PAGE_SIZE = 50;

/**
 * The accounts on a plan, each with Unassign, plus Assign account. These
 * write straight away through the account's own plan assignment, not
 * through the plan form's save bar. An account is on one plan at a time,
 * so assigning moves it here from wherever it was.
 */
export function PlanAccountsSection({ planId, planName, canManage }: { planId: string; planName: string; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { page, pageHref } = useUrlPage('accountsPage');
  const [assigning, setAssigning] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [...RATE_PLANS_KEY, planId, 'accounts', page],
    queryFn: () => ratePlansApi.getAccounts(planId, { page: page - 1, size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const accounts = data?.content ?? [];

  const assign = useMutation({
    mutationFn: ({ customerId, ratePlanId }: { customerId: string; ratePlanId: string | null }) =>
      ratePlansApi.setCustomerPlan(customerId, ratePlanId),
    onSuccess: (next, { ratePlanId }) => {
      // Both lists' counts and this plan's accounts change.
      queryClient.invalidateQueries({ queryKey: RATE_PLANS_KEY });
      queryClient.setQueryData(['customer-rate-plan', next.customerId], next);
      showSuccess(ratePlanId ? t('settings.ratePlans.accounts.assigned', { plan: planName }) : t('settings.ratePlans.accounts.unassigned'));
      setAssigning(false);
    },
    onError: (err) => showError(t('settings.ratePlans.accounts.failed'), extractApiError(err)),
  });

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {isLoading ? (
        <p className="px-3 py-3 text-[12.5px] text-fg-muted">{t('settings.ratePlans.accounts.loading')}</p>
      ) : accounts.length === 0 ? (
        <p className="px-3 py-3 text-[12.5px] text-fg-muted">{t('settings.ratePlans.accounts.none')}</p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {accounts.map((a) => (
            <li key={a.customerId} className="flex items-center gap-2 px-3 py-1.5">
              <Link to={`/customers/${a.customerId}`} className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-accent hover:underline">
                {a.customerName ?? t('settings.ratePlans.accounts.unnamed')}
              </Link>
              {a.assignedAt && (
                <span className="text-[11px] text-fg-muted">{t('settings.ratePlans.accounts.since', { date: formatDateShort(a.assignedAt) })}</span>
              )}
              {canManage && (
                <Button
                  plain
                  size="xs"
                  disabled={assign.isPending}
                  aria-label={t('settings.ratePlans.accounts.unassignName', { name: a.customerName ?? a.customerId })}
                  onClick={() => assign.mutate({ customerId: a.customerId, ratePlanId: null })}
                >
                  {t('settings.ratePlans.accounts.unassign')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ListFooter page={page} totalPages={data?.totalPages ?? 1} pageHref={pageHref} />
      {canManage && (
        <div className="border-t border-border-soft px-3 py-2">
          <Button outline size="xs" onClick={() => setAssigning(true)}>
            {t('settings.ratePlans.accounts.assign')}
          </Button>
        </div>
      )}
      <Dialog open={assigning} onClose={() => setAssigning(false)} size="md">
        {assigning && (
          <AssignDialog
            planName={planName}
            busy={assign.isPending}
            onCancel={() => setAssigning(false)}
            onAssign={(c) => assign.mutate({ customerId: c.id, ratePlanId: planId })}
          />
        )}
      </Dialog>
    </div>
  );
}

function AssignDialog({
  planName,
  busy,
  onCancel,
  onAssign,
}: {
  planName: string;
  busy: boolean;
  onCancel: () => void;
  onAssign: (customer: CustomerSearchResult) => void;
}) {
  const { t } = useTranslation();
  const [customer, setCustomer] = useState<CustomerSearchResult | null>(null);
  return (
    <>
      <DialogTitle>{t('settings.ratePlans.accounts.assignTitle', { plan: planName })}</DialogTitle>
      <DialogDescription>{t('settings.ratePlans.accounts.assignDescription')}</DialogDescription>
      <DialogBody>
        <CustomerPicker value={customer} onChange={setCustomer} ariaLabel={t('settings.ratePlans.accounts.account')} />
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button color="dark/zinc" disabled={!customer || busy} onClick={() => customer && onAssign(customer)}>
          {t('settings.ratePlans.accounts.assignButton')}
        </Button>
      </DialogActions>
    </>
  );
}
