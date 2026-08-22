// Click-to-insert chip strip rendered under each editor field. Each chip
// is a real <button type="button">, so Enter inserts via the browser's
// native focus model — no keydown trickery required.

import { PlusIcon } from '@heroicons/react/24/outline';
import { Text } from '../catalyst/text';
import type { NotificationTemplateVariable } from '../../api/setup';

type Props = {
  hint: string;
  chips: NotificationTemplateVariable[];
  onInsert: (name: string) => void;
};

export function VariableStrip({ hint, chips, onInsert }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <Text
        as="span"
        size="xs"
        tone="dim"
        className="mr-1 uppercase tracking-wider"
      >
        {hint}
      </Text>
      {chips.map((v) => (
        <button
          key={v.name}
          type="button"
          onClick={() => onInsert(v.name)}
          title={v.description}
          className="inline-flex items-center gap-0.5 rounded border border-border-soft bg-bg-elev-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted hover:bg-bg-hover hover:text-fg-strong"
        >
          <PlusIcon className="size-2.5" />
          {`{{${v.name}}}`}
        </button>
      ))}
    </div>
  );
}
