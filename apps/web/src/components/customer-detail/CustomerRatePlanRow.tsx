/* eslint-disable i18next/no-literal-string -- dense visual detail page; short operational labels stay literal (same convention as the customer overview cards). */
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ratePlansApi, type CustomerRatePlan } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Field, Label } from '../catalyst/fieldset';
import { Select } from '../catalyst/select';

const DEFAULT = '__default';

/**
 * The rate plan this account's quotes and invoices are priced under: its
 * assigned plan, or the default. Changing it needs MANAGE_PRICING.
 */
export function CustomerRatePlanRow({ customerId }: { customerId: string }) {
  const canAssign = useHasAnyCapability('MANAGE_PRICING');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['customer-rate-plan', customerId],
    queryFn: () => ratePlansApi.getCustomerPlan(customerId),
  });
  if (!data) return null;

  return (
    <div className="mt-3 flex items-baseline gap-2 border-t border-border-soft pt-2.5 text-[12px]">
      <span className="text-fg-muted">Rate plan</span>
      <span className="min-w-0 flex-1 text-fg">
        {data.effective ? (
          <>
            <span className="font-semibold text-fg-strong">{data.effective.name}</span>
            {data.assignedRatePlanId == null && <span className="text-fg-muted"> (default)</span>}
          </>
        ) : (
          <span className="text-fg-muted">None</span>
        )}
      </span>
      {canAssign && (
        <button type="button" className="card-action" onClick={() => setOpen(true)}>
          Change
        </button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        {open && <AssignForm current={data} onClose={() => setOpen(false)} />}
      </Dialog>
    </div>
  );
}

function AssignForm({ current, onClose }: { current: CustomerRatePlan; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: plans = [] } = useQuery({ queryKey: ['rate-plans'], queryFn: () => ratePlansApi.getAll() });
  const [choice, setChoice] = useState(current.assignedRatePlanId ?? DEFAULT);
  const defaultPlan = plans.find((p) => p.isDefault);
  // Inactive plans can't be picked, but the current assignment stays listed.
  const options = plans.filter((p) => !p.isDefault && (p.active || p.id === current.assignedRatePlanId));

  const save = useMutation({
    mutationFn: () => ratePlansApi.setCustomerPlan(current.customerId, choice === DEFAULT ? null : choice),
    onSuccess: (next) => {
      queryClient.setQueryData(['customer-rate-plan', current.customerId], next);
      showSuccess('Rate plan saved');
      onClose();
    },
    onError: (err) => showError('Couldn’t save the rate plan', extractApiError(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>Rate plan</DialogTitle>
      <DialogDescription>Prices new quote and invoice lines billed to this account. Existing lines keep their prices.</DialogDescription>
      <DialogBody>
        <Field>
          <Label>Plan</Label>
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value={DEFAULT}>{defaultPlan ? `Use the default (${defaultPlan.name})` : 'Use the default'}</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? '' : ' · inactive'}
              </option>
            ))}
          </Select>
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" color="dark/zinc" disabled={save.isPending}>
          Save
        </Button>
      </DialogActions>
    </form>
  );
}
