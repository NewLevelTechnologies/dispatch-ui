import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../contexts/GlossaryContext';
import EquipmentQuickView from './EquipmentQuickView';
import { SlideOver } from './catalyst/slideover';

interface EquipmentQuickViewDrawerProps {
  /** When non-null, the drawer is open and shows this equipment. Set to
   *  null to close the drawer (parent owns the open/closed state). */
  initialEquipment: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * Slide-over wrapper for EquipmentQuickView that supports drawer-over-
 * drawer navigation: clicking a sub-unit chip pushes onto the stack and
 * the drawer's content swaps to that sub-unit. The user backs out one
 * level at a time via the header's back button (labeled with the parent
 * name when the stack is more than one deep), or closes the drawer
 * entirely with X / Esc / outside-click.
 *
 * Architecturally only ONE SlideOver is mounted at a time — content swaps
 * based on top-of-stack rather than physically stacking dialogs. Visually
 * the UX is identical (back button to navigate up the chain) and state
 * management stays simple. Doc impact: §1.1's three-pattern rule is
 * relaxed from "drawer = financial detail" to "drawer = peripheral
 * entity peek (financials, equipment)."
 */
export default function EquipmentQuickViewDrawer({
  initialEquipment,
  onClose,
}: EquipmentQuickViewDrawerProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  // Stack of equipment {id, name} pairs. The top is the currently-rendered
  // equipment; the rest are the parent chain (for the back-button label).
  const [stack, setStack] = useState<Array<{ id: string; name: string }>>([]);

  // Sync the stack with the parent's `initialEquipment` prop. When the
  // parent supplies a new id (and the drawer is currently empty), seed the
  // stack. When the parent clears it to null, drop everything — the
  // drawer animation runs against the cleared state.
  useEffect(() => {
    if (initialEquipment && stack.length === 0) {
      setStack([initialEquipment]);
    } else if (!initialEquipment && stack.length > 0) {
      setStack([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEquipment]);

  const open = initialEquipment !== null;
  const top = stack[stack.length - 1];
  const parent = stack.length > 1 ? stack[stack.length - 2] : null;

  const handlePushSubUnit = (subUnit: { id: string; name: string }) => {
    setStack((s) => [...s, subUnit]);
  };

  const handleBack = () => {
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
    } else {
      // At the root of the stack — backing out closes the drawer entirely.
      onClose();
    }
  };


  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-[480px]">
      {/* Header: back/close button + parent name (when stack > 1) */}
      <div className="flex items-center justify-between border-b border-zinc-950/10 px-4 py-3 dark:border-white/10">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-md p-1 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          aria-label={
            parent
              ? t('workOrders.workItems.backToEntity', { entity: parent.name })
              : t('common.close')
          }
        >
          {parent ? (
            <>
              <ArrowLeftIcon className="size-4" />
              <span className="truncate">
                {t('workOrders.workItems.backToEntity', { entity: parent.name })}
              </span>
            </>
          ) : (
            <XMarkIcon className="size-5" />
          )}
        </button>
        <div className="ml-2 truncate text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {getName('equipment')}
        </div>
      </div>

      {/* Body — top-of-stack equipment */}
      <div className="flex-1 overflow-y-auto">
        {top && (
          <EquipmentQuickView
            equipmentId={top.id}
            onSelectSubUnit={handlePushSubUnit}
          />
        )}
      </div>
    </SlideOver>
  );
}
