/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import { Button } from '../catalyst/button';
import { Callout } from '../ui/Callout';

/** Edits save as they're made; this says when one is in flight. */
export function DocumentEditStatus({ saving }: { saving: boolean }) {
  if (!saving) return null;
  return (
    <span role="status" className="text-[11.5px] text-fg-muted">
      Saving…
    </span>
  );
}

/** After a 409 STALE_VERSION: the document was reloaded and the user's last change dropped. */
export function StaleCallout({ entity, onDismiss }: { entity: string; onDismiss: () => void }) {
  return (
    <Callout
      kind="warning"
      className="mb-2.5"
      title={`This ${entity} changed somewhere else`}
      action={
        <Button plain size="xs" onClick={onDismiss}>
          Dismiss
        </Button>
      }
    >
      It was reloaded with the latest version, so your last change wasn’t saved. Make it again if it’s still needed.
    </Callout>
  );
}
