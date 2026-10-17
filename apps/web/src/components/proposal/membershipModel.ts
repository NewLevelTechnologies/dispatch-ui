// The offered plan's terms in words, for the builder and the customer's page.
import type { MembershipOffer, PublicMembershipOffer } from '../../api/setup';

type Offer = Pick<MembershipOffer | PublicMembershipOffer, 'laborDiscountPct' | 'partsDiscountPct' | 'tripFeeWaived' | 'cadenceUnit' | 'cadenceInterval'>;

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

/** "15% off labor", "10% off parts", "No trip charge": what a member gets on a job. */
export function memberBenefits(o: Offer): { kind: 'labor' | 'parts' | 'trip'; pct?: string }[] {
  return [
    ...(o.laborDiscountPct ? [{ kind: 'labor' as const, pct: pct(o.laborDiscountPct) }] : []),
    ...(o.partsDiscountPct ? [{ kind: 'parts' as const, pct: pct(o.partsDiscountPct) }] : []),
    ...(o.tripFeeWaived ? [{ kind: 'trip' as const }] : []),
  ];
}

/** "month", "3 months", "year": how often the plan bills. */
export function cadenceWords(o: Offer): string | null {
  const unit = o.cadenceUnit?.toLowerCase();
  if (!unit) return null;
  const n = o.cadenceInterval ?? 1;
  return n === 1 ? unit : `${n} ${unit}s`;
}
