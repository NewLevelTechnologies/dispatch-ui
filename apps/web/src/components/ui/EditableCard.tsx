import type { ReactNode } from 'react';
import { Button } from '../catalyst/button';
import { Card } from '../catalyst/card';

// A Card that flips between a read-only "view" body and an editable "edit"
// body, with the edit lifecycle (Edit / Cancel / Save) living entirely inside
// the card. Used by settings surfaces that edit a single tenant record one
// section at a time (Company Profile) — each card saves independently, so an
// admin can update their address without committing a pending logo change.
//
// Dirty-tracking is the parent's job: pass `saveDisabled={!dirty || saving}`.
// The card does not coordinate with sibling cards — multiple can be in edit
// mode at once.
type EditableCardProps = {
  title: string;
  subtitle?: ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  // 'Edit' by default; pages override for nudges (e.g. 'Complete identity').
  editLabel?: string;
  cancelLabel?: string;
  saveLabel?: string;
  savingLabel?: string;
  className?: string;
  children: ReactNode;
};

export function EditableCard({
  title,
  subtitle,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving = false,
  saveDisabled = false,
  editLabel = 'Edit',
  cancelLabel = 'Cancel',
  saveLabel = 'Save changes',
  savingLabel = 'Saving…',
  className,
  children,
}: EditableCardProps) {
  return (
    <Card
      title={title}
      subtitle={subtitle}
      className={className}
      action={
        editing ? undefined : (
          <Button outline size="xs" type="button" onClick={onEdit}>
            {editLabel}
          </Button>
        )
      }
      footer={
        editing ? (
          <div className="flex items-center justify-end gap-1.5 rounded-b-[10px] border-t border-border-soft bg-bg-elev-2 px-3.5 py-2.5">
            <Button plain size="xs" type="button" onClick={onCancel} disabled={saving}>
              {cancelLabel}
            </Button>
            <Button
              color="accent"
              size="xs"
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
            >
              {saving ? savingLabel : saveLabel}
            </Button>
          </div>
        ) : undefined
      }
    >
      {children}
    </Card>
  );
}

export default EditableCard;
