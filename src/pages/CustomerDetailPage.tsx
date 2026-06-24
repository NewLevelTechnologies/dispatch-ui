// Customer detail — shape router. Fetches the customer once, then dispatches
// on its structural CustomerShape:
//   MULTI        → the redesigned MultiCustomerDetail (billing hub + locations)
//   SINGLE       → the redesigned SingleCustomerDetail (one wallet + one site)
//   BILLING_ONLY → the redesigned PayerDetail (financial counterparty, no sites)
// All three shapes render redesigned variants; the pre-redesign legacy page has
// been removed.
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { customerApi } from '../api';
import { resolveCustomerShape } from '../lib/customerShape';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Callout } from '../components/ui/Callout';
import { LoadingState } from '../components/ui/LoadingState';
import { Button } from '../components/catalyst/button';
import MultiCustomerDetail from '../components/customer-detail/MultiCustomerDetail';
import SingleCustomerDetail from '../components/customer-detail/SingleCustomerDetail';
import PayerDetail from '../components/customer-detail/PayerDetail';

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
        <LoadingState label={t('common.actions.loadingEntity', { entity: getName('customer') })} />
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
  return <PayerDetail customer={customer} />;
}
