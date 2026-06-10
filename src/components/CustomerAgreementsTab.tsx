/* eslint-disable i18next/no-literal-string -- short operational column labels stay literal, same convention as the surrounding CustomerDetailPage tabs. */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../contexts/GlossaryContext';
import { agreementApi, type AgreementStatus, type AgreementSummaryResponse } from '../api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './catalyst/table';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import { Subheading } from './catalyst/heading';
import { LoadingState } from './ui/LoadingState';
import { ErrorState } from './ui/ErrorState';
import { EmptyState } from './ui/EmptyState';
import AgreementFormDialog from './AgreementFormDialog';
import { extractApiError } from '../lib/toast';

const STATUS_COLOR: Record<AgreementStatus, 'lime' | 'zinc' | 'amber' | 'rose'> = {
  ACTIVE: 'lime',
  DRAFT: 'zinc',
  SUSPENDED: 'amber',
  EXPIRED: 'zinc',
  CANCELLED: 'rose',
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

// Lists a customer's service agreements (the customer's Agreements tab). Each
// row opens the agreement detail page. Add creates a DRAFT and routes to it for
// configuration.
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
      <Table dense className="[--gutter:theme(spacing.2)] text-sm">
        <TableHead>
          <TableRow>
            <TableHeader>{getName('agreement')}</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Term</TableHeader>
            <TableHeader>Auto-renew</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((a) => (
            <TableRow
              key={a.id}
              className="cursor-pointer"
              onClick={() => navigate(`/agreements/${a.id}?from=customer`)}
            >
              <TableCell>
                <div className="font-medium text-fg-strong">{a.name}</div>
                <div className="font-mono text-[11px] text-fg-muted">{a.agreementNumber}</div>
              </TableCell>
              <TableCell>
                <Badge color={STATUS_COLOR[a.status]}>
                  {a.status.charAt(0) + a.status.slice(1).toLowerCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-fg-muted">{termLabel(a)}</TableCell>
              <TableCell className="text-fg-muted">{a.autoRenew ? 'Yes' : 'No'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Subheading>{getName('agreement', true)}</Subheading>
        <Button plain onClick={() => setIsAddOpen(true)}>
          <PlusIcon className="size-4" />
          {t('common.actions.add', { entity: getName('agreement') })}
        </Button>
      </div>
      {body}
      <AgreementFormDialog isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} customerId={customerId} />
    </div>
  );
}
