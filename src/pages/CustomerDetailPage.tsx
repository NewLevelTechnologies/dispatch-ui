// Customer detail — shape router. Fetches the customer once, then dispatches
// on its structural CustomerShape:
//   MULTI        → the redesigned MultiCustomerDetail (billing hub + locations)
//   SINGLE       → the redesigned SingleCustomerDetail (one wallet + one site)
//   BILLING_ONLY → legacy rendering (Payer redesign backend-blocked)
// BILLING_ONLY is the last variant on CustomerDetailLegacy; once its Payer
// redesign lands, that file is deleted.
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { customerApi } from '../api';
import { resolveCustomerShape } from '../lib/customerShape';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Callout } from '../components/ui/Callout';
import { Button } from '../components/catalyst/button';
import MultiCustomerDetail from '../components/customer-detail/MultiCustomerDetail';
import SingleCustomerDetail from '../components/customer-detail/SingleCustomerDetail';
import CustomerDetailLegacy from './CustomerDetailLegacy';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customers', id],
    queryFn: () => customerApi.getById(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.loadingEntity', { entity: getName('customer') })}
        </div>
      </AppLayout>
    );
  }

  if (error || !customer) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="danger">
            {t('common.actions.errorLoadingEntity', { entity: getName('customer') })}
            {error && `: ${(error as Error).message}`}
          </Callout>
          <Button className="mt-4" onClick={() => navigate('/customers')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.backTo', { entities: getName('customer', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const shape = resolveCustomerShape(customer);
  if (shape === 'MULTI') return <MultiCustomerDetail customer={customer} />;
  if (shape === 'SINGLE') return <SingleCustomerDetail customer={customer} />;

  // BILLING_ONLY still renders the legacy category-driven page (Payer redesign
  // pending). It refetches the same ['customers', id] key (served from cache —
  // no extra request) and owns its own loading guard.
  return <CustomerDetailLegacy />;
}
