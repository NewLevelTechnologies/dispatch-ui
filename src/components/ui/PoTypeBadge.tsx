// PO type classification chip (Field purchase / Special order / Stock). Per the
// designer: a NEUTRAL chip — same grey fill + soft border for all three — with
// only the label text tinted. Deliberately quieter and smaller than the status
// pill (type is classification; status is the signal), so it never competes.
//   Field purchase → info · Special order → accent · Stock → muted
import type { PurchaseOrderType } from '../../api';
import { PO_TYPE_LABEL } from '../../lib/poStatus';

const TYPE_TEXT: Record<PurchaseOrderType, string> = {
  FIELD: 'var(--info-500)',
  ORDER: 'var(--accent-700)',
  STOCK: 'var(--fg-muted)',
};

export function PoTypeBadge({ type }: { type: PurchaseOrderType }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-[3px] border border-border-soft bg-bg-active px-[5px] text-[10px] font-semibold"
      style={{ color: TYPE_TEXT[type] }}
    >
      {PO_TYPE_LABEL[type]}
    </span>
  );
}
