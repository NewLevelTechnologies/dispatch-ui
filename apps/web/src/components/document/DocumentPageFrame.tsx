/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../AppLayout';
import { Heading } from '../catalyst/heading';
import { Text } from '../catalyst/text';
import { Button } from '../catalyst/button';
import { LoadingState } from '../ui/LoadingState';
import { useGlossary } from '../../contexts/GlossaryContext';

/** Back link + title row around a quote or invoice; loading and error states included. */
export function DocumentPageFrame({
  loading,
  error,
  entityLabel,
  back,
  workOrderHref,
  title,
  number,
  badges,
  actions,
  children,
}: {
  loading: boolean;
  error: boolean;
  /** Glossary name, singular ("Quote"). */
  entityLabel: string;
  back: { to: string; label: string };
  /** The document's work order — a "View work order" button leads the actions. */
  workOrderHref?: string | null;
  title?: string;
  number?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { getName } = useGlossary();
  if (loading) {
    return (
      <AppLayout>
        <LoadingState label={`Loading ${entityLabel.toLowerCase()}…`} />
      </AppLayout>
    );
  }
  if (error) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1160px] py-10 text-center">
          <Text className="!text-sm !text-rose-600 dark:!text-rose-400">Couldn't load this {entityLabel.toLowerCase()}.</Text>
          <Button plain size="xs" className="mt-3" href={back.to}>
            ← {back.label}
          </Button>
        </div>
      </AppLayout>
    );
  }
  return (
    <AppLayout>
      <div className="mx-auto max-w-[1160px] px-1 py-1">
        <Link to={back.to} className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">
          ← {back.label}
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Heading level={1} size="page-sm" className="m-0">
            {title ?? entityLabel}
          </Heading>
          {number && <span className="font-mono text-[13px] text-fg-muted">{number}</span>}
          {badges}
          <span className="grow" />
          {(workOrderHref || actions) && (
            <div className="flex items-center gap-2">
              {workOrderHref && (
                <Button outline size="xs" href={workOrderHref}>
                  {`View ${getName('work_order').toLowerCase()}`}
                </Button>
              )}
              {actions}
            </div>
          )}
        </div>
        {children}
      </div>
    </AppLayout>
  );
}
