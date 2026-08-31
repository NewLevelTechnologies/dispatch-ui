// Live lint for required variables. Cross-references the template's
// `availableVariables` against the variables actually used in the
// in-progress subject + body. Required variables that aren't present
// in their declared scope render in warning tint; the BE will reject
// the save anyway, but surfacing it inline keeps the user out of the
// blind submit-then-error loop.

import clsx from 'clsx';
import {
  CheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Card } from '../catalyst/card';
import { Text } from '../catalyst/text';
import type { NotificationTemplateVariable } from '../../api/setup';

type Props = {
  variables: NotificationTemplateVariable[] | undefined;
  usedInSubject: Set<string>;
  usedInBody: Set<string>;
  className?: string;
};

export function RequiredVariablesPanel({
  variables,
  usedInSubject,
  usedInBody,
  className,
}: Props) {
  const required = (variables ?? []).filter((v) => v.required);
  if (required.length === 0) return null;

  return (
    <Card
      title="Required variables"
      subtitle="These must appear somewhere in the subject or body. The send will fail if one is missing."
      className={className}
    >
      <div className="grid grid-cols-1 gap-y-1.5 gap-x-3.5 sm:grid-cols-2">
        {required.map((v) => {
          // No explicit scope = treat the variable as valid in both fields
          // during the BE PR-1 transition.
          const scope = v.scope ?? ['SUBJECT', 'BODY'];
          const subjectOk =
            !scope.includes('SUBJECT') || usedInSubject.has(v.name);
          const bodyOk = !scope.includes('BODY') || usedInBody.has(v.name);
          const ok = subjectOk && bodyOk;
          return (
            <div key={v.name} className="flex items-center gap-1.5">
              <span
                className={clsx(
                  'inline-flex size-3.5 items-center justify-center rounded-full',
                  ok
                    ? 'bg-success-500/15 text-success-500'
                    : 'bg-warning-500/20 text-warning-500'
                )}
                aria-hidden="true"
              >
                {ok ? (
                  <CheckIcon className="size-2.5 stroke-[3]" />
                ) : (
                  <ExclamationTriangleIcon className="size-2.5" />
                )}
              </span>
              <code className="font-mono text-[11px] text-fg-strong">
                {`{{${v.name}}}`}
              </code>
              <Text as="span" size="xs" tone="dim" className="truncate">
                · {v.description}
              </Text>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
