/* eslint-disable i18next/no-literal-string -- dense visual detail page; short operational labels stay literal (same convention as ServiceLocationDetailPage). */
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { customerApi, taxApi, type LocationTaxJurisdiction as LocationTax } from '../api/setup';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Select } from './catalyst/select';
import { pct } from './document/documentModel';

const DEFAULT = '__default';

/**
 * The tax this location's quotes and invoices are charged under: its
 * assigned jurisdiction, or the company default. Changeable by anyone who
 * manages pricing or edits quotes or invoices. A tax-exempt customer is
 * never charged, whatever the jurisdiction, so that's said too.
 */
export function LocationTaxJurisdiction({ serviceLocationId, customerId }: { serviceLocationId: string; customerId?: string }) {
  const canAssign = useHasAnyCapability('MANAGE_PRICING', 'EDIT_QUOTES', 'EDIT_INVOICES');
  const { data: customer } = useQuery({
    queryKey: ['customers', customerId],
    queryFn: () => customerApi.getById(customerId!),
    enabled: !!customerId,
  });
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['location-tax-jurisdiction', serviceLocationId],
    queryFn: () => taxApi.getLocationJurisdiction(serviceLocationId),
  });
  if (!data) return null;
  const effective = data.effective;

  return (
    <div className="mt-2 flex items-baseline gap-2 border-t border-border-soft pt-2 text-[11.5px]">
      <span className="text-fg-muted">Tax</span>
      <span className="min-w-0 flex-1 text-fg">
        {effective ? (
          <>
            <span className="font-medium text-fg-strong">{effective.name}</span>
            {effective.rate != null ? ` · ${pct(effective.rate)}` : ' · rate not set'}
            {data.assignedJurisdictionId == null && <span className="text-fg-muted"> (default)</span>}
          </>
        ) : (
          <span className="text-warning-fg">No jurisdiction and no default · no tax is charged</span>
        )}
        {customer?.taxExempt && <span className="text-fg-muted"> · Customer is tax-exempt</span>}
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

function AssignForm({ current, onClose }: { current: LocationTax; onClose: () => void }) {
  const queryClient = useQueryClient();
  const canManagePricing = useHasAnyCapability('MANAGE_PRICING');
  const { data: jurisdictions = [] } = useQuery({
    queryKey: ['tax-jurisdictions'],
    queryFn: () => taxApi.getJurisdictions(),
  });
  const [choice, setChoice] = useState(current.assignedJurisdictionId ?? DEFAULT);
  const defaultOne = jurisdictions.find((j) => j.isDefault);
  // Inactive ones can't be picked, but the current assignment stays listed.
  const options = jurisdictions.filter((j) => j.active || j.id === current.assignedJurisdictionId);

  const save = useMutation({
    mutationFn: () => taxApi.setLocationJurisdiction(current.serviceLocationId, choice === DEFAULT ? null : choice),
    onSuccess: (next) => {
      queryClient.setQueryData(['location-tax-jurisdiction', current.serviceLocationId], next);
      showSuccess('Tax jurisdiction saved');
      onClose();
    },
    onError: (err) => showError('Couldn’t save the tax jurisdiction', extractApiError(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>Tax jurisdiction</DialogTitle>
      <DialogDescription>
        Applies to new quotes and invoices at this location, and to drafts the next time they’re edited. Sent ones keep their tax.
      </DialogDescription>
      <DialogBody>
        <Field>
          <Label>Jurisdiction</Label>
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value={DEFAULT}>
              {defaultOne
                ? `Use the default (${defaultOne.name}${defaultOne.rate != null ? ` · ${pct(defaultOne.rate)}` : ''})`
                : 'Use the default (none set)'}
            </option>
            {options.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
                {j.rate != null ? ` · ${pct(j.rate)}` : ' · rate not set'}
                {j.active ? '' : ' · inactive'}
              </option>
            ))}
          </Select>
        </Field>
        {canManagePricing && (
          <Link to="/settings/tax" className="mt-2 inline-block text-[12px] text-fg-accent hover:underline">
            Manage jurisdictions
          </Link>
        )}
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
