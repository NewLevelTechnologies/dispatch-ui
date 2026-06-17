/* eslint-disable i18next/no-literal-string -- shared dense contact row; inline labels ("· after hours", separators) stay literal, matching the detail pages this was extracted from. */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneIcon } from '@heroicons/react/24/outline';
import { formatPhone } from '../../utils/formatPhone';
import type { AdditionalContact } from '../../api';

// Normalized contact row — name · role, best-reach phone as the accent tel:
// action, email secondary, after-hours + notes when present. Pure presentation;
// the caller supplies the hover actions (Edit / Make primary / notify). Shared
// by the location Site-contact card and the customer Billing-contacts card so a
// contact reads the same everywhere.
export function ContactBlock({
  contact,
  primary,
  badge,
  showAllPhones,
  actions,
  actionsVisible,
}: {
  contact: AdditionalContact;
  primary?: boolean;
  // Optional pill rendered after the name (e.g. "Primary") — used by the
  // mobile Contacts directory; the overview card omits it.
  badge?: ReactNode;
  // Render mobile + office as separate labeled tel: links instead of the single
  // best-phone preview — the mobile Contacts directory's whole point is that
  // every reachable number is visible and tappable.
  showAllPhones?: boolean;
  actions?: ReactNode;
  // Always show the actions (no hover-reveal) — touch devices have no hover.
  actionsVisible?: boolean;
}) {
  const { t } = useTranslation();
  const phone = contact.mobilePhone || contact.phone || null;
  const telLine = (value: string, label: string) => (
    <a
      key={label}
      href={`tel:${value.replace(/\D/g, '')}`}
      className="mt-0.5 flex items-center gap-1 font-mono text-[12.5px] font-semibold text-fg-accent hover:underline"
    >
      <PhoneIcon className="size-3 shrink-0" />
      {formatPhone(value)}
      <span className="font-sans text-[11px] font-normal text-fg-dim">· {label}</span>
    </a>
  );
  return (
    <div className="group/contact">
      <div className="flex items-baseline gap-2">
        <div className="flex grow flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={`font-semibold text-fg-strong ${primary ? 'text-[13px]' : 'text-[12.5px]'}`}>
            {contact.name}
          </span>
          {badge}
          {contact.role && <span className="text-[11px] text-fg-muted">· {contact.role}</span>}
        </div>
        {actions && (
          <div
            className={`flex shrink-0 items-center gap-1.5 transition-opacity ${
              actionsVisible ? '' : 'opacity-0 group-hover/contact:opacity-100 focus-within:opacity-100'
            }`}
          >
            {actions}
          </div>
        )}
      </div>

      {showAllPhones ? (
        <>
          {contact.mobilePhone && telLine(contact.mobilePhone, 'mobile')}
          {contact.phone && telLine(contact.phone, 'office')}
          {!contact.mobilePhone && !contact.phone && !contact.email && (
            <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--warning-fg)' }}>
              {t('contacts.noContactInfo')}
            </div>
          )}
        </>
      ) : phone ? (
        <a
          href={`tel:${phone.replace(/\D/g, '')}`}
          className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold text-fg-accent hover:underline"
        >
          <PhoneIcon className="size-3" />
          {formatPhone(phone)}
        </a>
      ) : !contact.email ? (
        <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--warning-fg)' }}>
          {t('contacts.noContactInfo')}
        </div>
      ) : null}

      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="mt-0.5 block truncate text-[11px] text-fg-muted hover:text-fg-strong hover:underline"
        >
          {contact.email}
        </a>
      )}

      {contact.afterHoursPhone && (
        <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
          {formatPhone(contact.afterHoursPhone)} <span className="text-fg-dim">· after hours</span>
        </div>
      )}

      {contact.notes && <div className="mt-1 text-[11px] leading-snug text-fg-muted">{contact.notes}</div>}
    </div>
  );
}

export default ContactBlock;
