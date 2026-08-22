/* eslint-disable i18next/no-literal-string -- short operational column labels stay literal, same convention as the surrounding customer-detail tabs. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import clsx from 'clsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../contexts/GlossaryContext';
import { agreementApi, type AgreementStatus, type AgreementSummaryResponse } from '../api/setup';
import { Button } from './catalyst/button';
import { Subheading } from './catalyst/heading';
import { Card } from './catalyst/card';
import { Pill } from './ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from './ui/DenseTable';
import { LoadingState } from './ui/LoadingState';
import { ErrorState } from './ui/ErrorState';
import { EmptyState } from './ui/EmptyState';
import AgreementFormDialog from './AgreementFormDialog';
import { extractApiError } from '../lib/toast';

const STATUS_TONE: Record<AgreementStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  SUSPENDED: 'warning',
  EXPIRED: 'neutral',
  CANCELLED: 'danger',
};

function formatDay(value?: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function termLabel(a: AgreementSummaryResponse): string {
  if (!a.termStart && !a.termEnd) return 'No term set';
  return `${formatDay(a.termStart)} → ${a.termEnd ? formatDay(a.termEnd) : 'Open-ended'}`;
}

// Lists a customer's service agreements (the customer's Agreements tab). Dense
// table; each row opens the agreement detail page. Add creates a DRAFT and
// routes to it for configuration.
export default function CustomerAgreementsTab({ customerId }: { customerId: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['agreements', { customerId }],
    queryFn: () => agreementApi.list({ customerId }),
    enabled: !!customerId,
  });

  let body: React.ReactNode;
  if (isLoading) {
    body = <LoadingState label={t('common.actions.loading', { entities: getName('agreement', true) })} />;
  } else if (error) {
    body = (
      <ErrorState
        title={t('common.actions.couldNotLoad', { entities: getName('agreement', true), defaultValue: `Couldn't load ${getName('agreement', true)}` })}
        description={extractApiError(error) ?? (error as Error).message}
        action={<Button outline onClick={() => refetch()}>{t('common.actions.tryAgain', { defaultValue: 'Try again' })}</Button>}
      />
    );
  } else if (!data || data.length === 0) {
    body = (
      <EmptyState
        title={t('common.actions.noEntitiesYet', { entities: getName('agreement', true), defaultValue: `No ${getName('agreement', true).toLowerCase()} yet` })}
        action={
          <Button color="accent" onClick={() => setIsAddOpen(true)}>
            {t('common.actions.add', { entity: getName('agreement') })}
          </Button>
        }
      />
    );
  } else {
    body = (
      <DenseTable className="dense-stack">
        <DenseTHead>
          <tr>
            <th>{getName('agreement')}</th>
            <th>Status</th>
            <th>Term</th>
            <th>Auto-renew</th>
          </tr>
        </DenseTHead>
        <tbody>
          {data.map((a) => (
            <DenseRow key={a.id} onClick={() => navigate(`/agreements/${a.id}?from=customer`)}>
              <td>
                <CellStack>
                  <CellTop>{a.name}</CellTop>
                  <CellSub>
                    <span className="font-mono">{a.agreementNumber}</span>
                  </CellSub>
                </CellStack>
              </td>
              <td>
                <Pill tone={STATUS_TONE[a.status]} dot>
                  {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                </Pill>
              </td>
              <td className="muted" data-label="Term">{termLabel(a)}</td>
              {/* `autoRenew` is absent from the list payload today (see
                  agreementApi BACKEND ask) — show "—" for unknown rather than a
                  misleading "No". Lights up once the summary DTO carries it. */}
              <td className={clsx('muted', a.autoRenew == null && 'dt-empty')} data-label="Auto-renew">
                {a.autoRenew == null ? '—' : a.autoRenew ? 'Yes' : 'No'}
              </td>
            </DenseRow>
          ))}
        </tbody>
      </DenseTable>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Subheading>{getName('agreement', true)}</Subheading>
        <Button outline size="xs" onClick={() => setIsAddOpen(true)}>
          <PlusIcon className="size-4" />
          {t('common.actions.add', { entity: getName('agreement') })}
        </Button>
      </div>
      <Card padding="none">{body}</Card>
      <AgreementFormDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} customerId={customerId} />
    </div>
  );
}
