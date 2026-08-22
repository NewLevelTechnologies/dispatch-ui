/* eslint-disable i18next/no-literal-string -- dense visual preview; copy stays inline. Translation pass lives in a follow-up. */
// Email preview — inbox-card mockup with From / To / Subject header + body.
// The card sits on an elevated pane (`bg-bg-elev-2`) so the email surface
// (`bg-bg-elev`) visually rises out of it.

import type { ReactNode } from 'react';
import { renderWithHighlights } from '../../lib/templateEditor';

type Props = {
  subject: string;
  body: string;
  sample: Record<string, string>;
  fromName?: string;
  fromAddress?: string;
  toName?: string;
};

export function TemplatePreviewEmail({
  subject,
  body,
  sample,
  fromName = 'Pinecrest HVAC',
  fromAddress = 'no-reply@pinecrest.example',
  toName,
}: Props) {
  const recipient = toName ?? sample.customer_name ?? 'Customer';
  return (
    <div className="rounded-lg bg-bg-elev-2 p-3">
      <div className="overflow-hidden rounded-md border border-border bg-bg-elev shadow-sm">
        <div className="border-b border-border-soft px-3.5 py-2.5">
          <MetaRow label="From">
            <span className="text-fg-strong">{fromName}</span>
            <span className="ml-1 text-fg-dim">&lt;{fromAddress}&gt;</span>
          </MetaRow>
          <MetaRow label="To">
            <span className="text-fg-strong">{recipient}</span>
          </MetaRow>
          <MetaRow label="Subject">
            <span className="font-semibold text-fg-strong">
              {renderWithHighlights(subject, sample)}
            </span>
          </MetaRow>
        </div>
        <div className="whitespace-pre-wrap px-3.5 py-3 text-[12.5px] leading-[1.6] text-fg">
          {renderWithHighlights(body, sample)}
        </div>
      </div>
      <p className="mt-2.5 text-[10.5px] leading-[1.5] text-fg-dim">
        Customers on clients that block remote content see plain-text only —
        make sure the message reads correctly without HTML formatting.
      </p>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[60px_1fr] items-baseline gap-2 py-0.5 text-[11.5px]">
      <span className="text-fg-dim">{label}</span>
      <span className="min-w-0 text-fg-muted">{children}</span>
    </div>
  );
}
