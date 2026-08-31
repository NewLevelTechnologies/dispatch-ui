import type { ReactNode } from 'react';
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from './catalyst/alert';
import { Button } from './catalyst/button';

// Shared destructive-confirmation surface. Renders Catalyst <Alert> under the
// hood so every confirm in the app reads the same way (see
// handoff/design-system-reference.md §5). Pass `children` for an extra control
// in the body (e.g. an optional reason input).
interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isPending?: boolean;
  children?: ReactNode;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  isPending = false,
  children,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Alert open={isOpen} onClose={onClose}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {children && <AlertBody>{children}</AlertBody>}
      <AlertActions>
        <Button plain onClick={onClose} disabled={isPending}>
          {cancelLabel}
        </Button>
        <Button
          color={isDestructive ? 'red' : 'dark'}
          onClick={handleConfirm}
          disabled={isPending}
        >
          {confirmLabel}
        </Button>
      </AlertActions>
    </Alert>
  );
}
