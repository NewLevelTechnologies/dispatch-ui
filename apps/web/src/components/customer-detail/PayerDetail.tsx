/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal to match the sibling customer-detail variants. */
// PAYER (BILLING_ONLY) customer detail — a financial counterparty with ZERO
// service locations (warranty cos, home-warranty firms, TPAs). Same shell as the
// MULTI/SINGLE variants with the operational sections removed and the financial
// ones emphasized (per claude_designs/payer-detail.md).
//
// v1 scope: financial identity + AR (Billing & AR, Account details, AR-only
// attention) + working Invoices / Contacts / Activity tabs. The design's
// "Linked invoices / Linked jobs" billed-for / performed-at preview cards are
// DEFERRED — they need a forCustomer / forLocation / forJob denorm on the
// payer's invoice rows so the tables don't read as if the payer owns the work
// (see BACKEND_ASKS PAYER-1). Until then the overview shows an honest pending
// note and the Invoices tab carries the raw list.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import {
  customerApi,
  invoicesApi,
  type Customer,
  type CustomerStatus,
  type UpdateCustomerRequest,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { useUrlTab } from '../../hooks/useUrlTab';
import { showSuccess, showError, extractApiError } from '../../lib/toast';
import { handleConcurrentEdit } from '../../lib/conflict';
import AppLayout from '../AppLayout';
import { Heading } from '../catalyst/heading';
import { Button } from '../catalyst/button';
import { Card } from '../catalyst/card';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { Pill } from '../ui/Pill';
import { Tabs } from '../ui/Tabs';
import { Callout } from '../ui/Callout';
import IconButton from '../IconButton';
import ConfirmDialog from '../ConfirmDialog';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import LocationActivityStream from '../LocationActivityStream';
import NotesCard from '../NotesCard';
import CustomerInvoicesTab from './CustomerInvoicesTab';
import CustomerContactsTab from './CustomerContactsTab';
import CustomerHeaderTags from './CustomerHeaderTags';
import { BillingCard, AccountDetailsCard, CustomerHeaderEdit, AttentionStrip, ContactCard } from './MultiOverviewTab';
import { buildAttentionItems } from './attention';
import { useGoToInvoicesBucket } from './invoiceAgingNav';
import { PayerMark, CardTitle } from './shared';
import { formatDateShort, formatMoney } from './format';
import { formatPhone } from '@dispatch/utils';
import { titleCaseAddress } from '../../utils/titleCaseAddress';

type TabId = 'overview' | 'invoices' | 'contacts' | 'activity';
const PAYER_TABS: readonly TabId[] = ['overview', 'invoices', 'contacts', 'activity'];

export default function PayerDetail({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const [activeTab, setActiveTab] = useUrlTab(PAYER_TABS, 'overview');
  const goToBucket = useGoToInvoicesBucket();

  const [editingHeader, setEditingHeader] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [lifecycleConfirm, setLifecycleConfirm] = useState(false);

  // FIN-1 — the payer is a pure financial entity, so AR is the whole story.
  const { data: arSummary } = useQuery({
    queryKey: ['customer-ar-summary', customer.id],
    queryFn: () => invoicesApi.getCustomerArSummary(customer.id),
    enabled: !!customer.id,
  });
  const { data: invoicesCount } = useQuery({
    queryKey: ['invoices', 'customer-count', customer.id],
    queryFn: () => invoicesApi.getAll({ customerId: customer.id, size: 1 }),
    enabled: !!customer.id,
  });

  // Only the AR-aging rule applies to a payer (no agreements / PM visits) — pass
  // an empty agreements list + no agreement summary so only the AR-91+ rule can fire.
  const attentionItems = buildAttentionItems([], arSummary, undefined, customer.id);

  const lifecycleMutation = useMutation({
    mutationFn: () => {
      const nextStatus: CustomerStatus = customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const request: UpdateCustomerRequest = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        type: customer.type,
        paymentTermsDays: customer.paymentTermsDays,
        requiresPurchaseOrder: customer.requiresPurchaseOrder,
        contractPricingTier: customer.contractPricingTier ?? null,
        taxExempt: customer.taxExempt,
        taxExemptCertificate: customer.taxExemptCertificate ?? null,
        notes: customer.notes ?? null,
        status: nextStatus,
      };
      return customerApi.update(customer.id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setLifecycleConfirm(false);
      showSuccess(customer.status === 'ACTIVE' ? 'Payer deactivated' : 'Payer reactivated');
    },
    onError: (err) => {
      if (handleConcurrentEdit(err, queryClient, ['customers'])) return;
      showError("Couldn't update payer", extractApiError(err) ?? undefined);
    },
  });

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('customers.tabs.overview') },
    { id: 'invoices', label: getName('invoice', true), count: invoicesCount?.totalElements },
    { id: 'contacts', label: 'Contacts', count: customer.additionalContacts.length },
    { id: 'activity', label: t('customers.tabs.activity') },
  ];

  const meta: React.ReactNode[] = [];
  if (customer.customerNumber) meta.push(<span key="num" className="font-mono">{customer.customerNumber}</span>);
  // Remit-to (billing) address right after the ID — same placement as the MULTI
  // customer header. Payers may have no remit-to (EDI-only), so guard and omit.
  const billing = customer.billingAddress;
  const billingLine = billing
    ? [
        titleCaseAddress(billing.streetAddress),
        [titleCaseAddress(billing.city), billing.state, billing.zipCode].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  if (billingLine) meta.push(<span key="addr">{billingLine}</span>);
  if (arSummary) meta.push(<span key="ltv">{formatMoney(arSummary.lifetimeValue)} lifetime</span>);
  meta.push(<span key="since">Since {formatDateShort(customer.createdAt)}</span>);

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[1240px]">
          <Link
            to="/customers"
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {t('common.actions.backTo', { entities: getName('customer', true) })}
          </Link>

          {/* Header — payer billing identity (gold "$" mark + "Payer" pill).
              Identity (name/phone/email) edits inline here; attributes in cards. */}
          {editingHeader ? (
            <CustomerHeaderEdit customer={customer} onDone={() => setEditingHeader(false)} />
          ) : (
          <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-3.5">
            <PayerMark />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={1} size="page-sm" className="m-0">
                  {customer.name}
                </Heading>
                <Pill tone="warning">Payer</Pill>
                <Pill tone={customer.status === 'ACTIVE' ? 'success' : 'neutral'} dot live={customer.status === 'ACTIVE'}>
                  {customer.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                </Pill>
                {customer.paymentTermsDays > 0 && <Pill tone="neutral">Net {customer.paymentTermsDays}</Pill>}
                <CustomerHeaderTags customerId={customer.id} tags={customer.tags ?? []} canEdit={canEditCustomers} scope="PAYER" />
              </div>
              {(customer.phone || customer.email) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px]">
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone.replace(/\D/g, '')}`}
                      className="font-mono text-fg-accent hover:underline"
                    >
                      {formatPhone(customer.phone)}
                    </a>
                  )}
                  {customer.phone && customer.email && <span className="text-fg-dim">·</span>}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="text-fg-accent hover:underline">
                      {customer.email}
                    </a>
                  )}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-fg-muted">
                {meta.map((node, i) => (
                  <span key={i} className="flex items-center gap-x-2.5">
                    {i > 0 && <span className="text-fg-dim">·</span>}
                    {node}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 max-sm:w-full sm:flex-shrink-0">
              <Dropdown>
                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')} className="max-sm:p-2">
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  <DropdownItem onClick={() => setIsNotificationOpen(true)}>
                    <DropdownLabel>{t('notifications.preferences.manage')}</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
              {canEditCustomers && (
                <Button color="accent" size="xs" onClick={() => setEditingHeader(true)} className="max-sm:flex-1">
                  {t('common.edit')}
                </Button>
              )}
            </div>
          </div>
          )}

          <div className="mb-3.5">
            <Tabs value={activeTab} onChange={(id) => setActiveTab(id as TabId)} tabs={tabs} />
          </div>

          {activeTab === 'overview' && (
            <div className="flex flex-col gap-3">
              {attentionItems.length > 0 && <AttentionStrip items={attentionItems} />}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
                <div className="flex flex-col gap-3">
                  <BillingCard customer={customer} ar={arSummary} canEdit={canEditCustomers} onSelectAging={goToBucket} />
                  <LinkedWorkPendingCard onViewInvoices={() => setActiveTab('invoices')} />
                  <NotesCard entityType="customer" entityId={customer.id} canEdit={canEditCustomers} />
                </div>
                <div className="flex flex-col gap-3">
                  <ContactCard customer={customer} canEdit={canEditCustomers} onViewAll={() => setActiveTab('contacts')} />
                  <AccountDetailsCard customer={customer} ar={arSummary} canEdit={canEditCustomers} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'invoices' && <CustomerInvoicesTab customerId={customer.id} />}

          {activeTab === 'contacts' && (
            <CustomerContactsTab
              customerId={customer.id}
              contacts={customer.additionalContacts}
              queryKey={['customers', customer.id]}
              canEdit={canEditCustomers}
            />
          )}

          {activeTab === 'activity' && <LocationActivityStream customerId={customer.id} />}

          {canEditCustomers && (
            <div className="mt-3.5">
              <Callout
                kind="neutral"
                icon={null}
                title={customer.status === 'ACTIVE' ? `Deactivate ${customer.name}` : `Reactivate ${customer.name}`}
                action={
                  <Button
                    outline={customer.status === 'ACTIVE' ? 'red' : true}
                    size="xxs"
                    onClick={() => setLifecycleConfirm(true)}
                    disabled={lifecycleMutation.isPending}
                  >
                    {customer.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                  </Button>
                }
              >
                {customer.status === 'ACTIVE'
                  ? 'Removes this payer from new-invoice bill-to pickers. Open invoices and payment history are preserved.'
                  : 'Restores the payer to bill-to pickers. New invoices can name it again.'}
              </Callout>
            </div>
          )}
        </div>
      </div>

      <NotificationPreferencesDialog
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        customerId={customer.id}
        contactName={customer.name}
      />
      <ConfirmDialog
        isOpen={lifecycleConfirm}
        onClose={() => setLifecycleConfirm(false)}
        onConfirm={() => lifecycleMutation.mutate()}
        title={customer.status === 'ACTIVE' ? `Deactivate ${customer.name}?` : `Reactivate ${customer.name}?`}
        message={
          customer.status === 'ACTIVE'
            ? 'Removes this payer from new-invoice bill-to pickers. Open invoices and payment history are preserved.'
            : 'Restores the payer to bill-to pickers. New invoices can name it again.'
        }
        confirmLabel={customer.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        isDestructive={customer.status === 'ACTIVE'}
        isPending={lifecycleMutation.isPending}
      />
    </AppLayout>
  );
}

// Honest placeholder for the design's "Linked invoices / Linked jobs" cards. A
// payer's invoices are for SOMEONE ELSE's work, so those tables need a
// billed-for / performed-at denorm (the actual customer + service address per
// row) that the invoice list doesn't carry yet — see BACKEND_ASKS PAYER-1.
function LinkedWorkPendingCard({ onViewInvoices }: { onViewInvoices: () => void }) {
  return (
    <Card title={<CardTitle>Linked work</CardTitle>} padding="none">
      <div className="px-3.5 py-6 text-center">
        <div className="text-[12.5px] font-semibold text-fg-strong">Billed-for / performed-at view pending</div>
        <div className="mx-auto mt-1 max-w-[460px] text-[11.5px] text-fg-muted">
          A payer pays for work performed at other customers' locations. Naming the actual customer &amp; site
          per invoice needs a backend denorm (PAYER-1).
        </div>
        <Button outline size="xs" className="mt-2.5" onClick={onViewInvoices}>
          View invoices
        </Button>
      </div>
    </Card>
  );
}
