// Fallback sample data for the editor's live preview when the BE samples
// endpoint hasn't shipped yet (gated by flags.notificationSamples). One
// sample per notificationTypeKey we know about; unknown keys fall through
// to a small generic placeholder set.
//
// When BE PR-2 lands and the flag flips on, the editor pulls from
// GET /notification-templates/{id}/samples instead and these tables go
// dormant. Keep this file under ~200 lines — it's a stopgap, not a source
// of truth.

import type { NotificationTemplateVariable, TemplateSample } from '../api/setup';
import { getVariableExample } from './templateEditor';

type FallbackSample = Omit<TemplateSample, 'id'>;

const FALLBACKS: Record<string, FallbackSample> = {
  invoice_sent: {
    label: 'Residential · paid in full',
    data: {
      customer_name: 'Maria Chen',
      invoice_number: 'INV-3892',
      amount: '$1,240.00',
      due_date: 'June 14, 2026',
      company_name: 'Pinecrest HVAC',
    },
  },
  tech_dispatched: {
    label: 'On the way · 2-hour window',
    data: {
      customer_name: 'Maria Chen',
      tech_name: 'Daniel Park',
      window: '2:00 PM – 4:00 PM',
      track_url: 'https://track.pinecrest.example/d/8h2k',
      company_name: 'Pinecrest HVAC',
    },
  },
  appointment_reminder: {
    label: 'Same-day reminder',
    data: {
      customer_name: 'Maria Chen',
      appointment_date: 'June 14',
      appointment_window: '8:00 AM – 10:00 AM',
      company_name: 'Pinecrest HVAC',
    },
  },
  work_order_confirmed: {
    label: 'Service call confirmed',
    data: {
      customer_name: 'Maria Chen',
      work_order_number: 'WO-12480',
      scheduled_date: 'June 14, 2026',
      company_name: 'Pinecrest HVAC',
    },
  },
  quote_sent: {
    label: 'Quote awaiting approval',
    data: {
      customer_name: 'Maria Chen',
      quote_number: 'Q-2031',
      amount: '$3,480.00',
      valid_until: 'July 14, 2026',
      company_name: 'Pinecrest HVAC',
    },
  },
  payment_received: {
    label: 'Payment confirmation',
    data: {
      customer_name: 'Maria Chen',
      invoice_number: 'INV-3892',
      amount: '$1,240.00',
      company_name: 'Pinecrest HVAC',
    },
  },
};

const GENERIC_KEY = '__generic__';

/**
 * Build a sample list for a template. Prefers the named-fallback entry for
 * the template's `notificationTypeKey`; if that's not in the table, synthesize
 * a single sample from each variable's `example` (the same value the BE seeds
 * into its sample sets — so this works for any template without bespoke copy).
 */
export function fallbackSamplesFor(
  notificationTypeKey: string,
  variables: NotificationTemplateVariable[] | undefined
): TemplateSample[] {
  const named = FALLBACKS[notificationTypeKey];
  if (named) {
    return [{ id: `${notificationTypeKey}-default`, ...named }];
  }

  const data: Record<string, string> = {};
  for (const v of variables ?? []) {
    const ex = getVariableExample(v);
    if (ex) data[v.name] = ex;
  }
  return [
    {
      id: GENERIC_KEY,
      label: 'Default sample',
      description: 'Synthesized from each variable’s example value.',
      data,
    },
  ];
}
