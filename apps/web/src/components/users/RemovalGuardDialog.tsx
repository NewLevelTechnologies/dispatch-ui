import { useTranslation } from '@dispatch/i18n';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../catalyst/alert';
import { Button } from '../catalyst/button';

// The two removals the backend refuses, as dialogs rather than error toasts.
//
// Neither of these is a confirmation, so neither gets a danger button — there
// is nothing to confirm, and offering a red "Remove anyway" would promise an
// override that does not exist. Each one names the resolution instead and
// sends the admin where it can be carried out.
//
// Which dialog to show comes from the 409's `code`, never from its message:
// the prose is server-authored and translatable, the code is the contract.
export type RemovalGuard = 'SELF_REMOVAL' | 'LAST_USER_MANAGER';

interface RemovalGuardDialogProps {
  guard: RemovalGuard | null;
  onClose: () => void;
  // Workspace name for the self-removal copy — this is a per-workspace refusal
  // and the sentence is meaningless without saying which one.
  company: string;
  // Where the resolution lives. Omit either and the dialog degrades to Close
  // rather than offering a button that goes nowhere: there may be no ADMIN
  // system role to link to, and the role editor needs a target user.
  onViewAdministrators?: () => void;
  onChangeRoles?: () => void;
}

export default function RemovalGuardDialog({
  guard,
  onClose,
  company,
  onViewAdministrators,
  onChangeRoles,
}: RemovalGuardDialogProps) {
  const { t } = useTranslation();
  const isSelf = guard === 'SELF_REMOVAL';

  // Self-removal points at the people who can do it for you; a lockout points
  // at the role editor, which is where the blocker is actually cleared.
  const resolve = isSelf ? onViewAdministrators : onChangeRoles;
  const resolveLabel = isSelf
    ? t('users.guard.viewAdministrators')
    : t('users.guard.changeRoles');

  return (
    <Alert open={guard !== null} onClose={onClose}>
      <AlertTitle>
        {isSelf ? t('users.guard.selfTitle') : t('users.guard.lastManagerTitle')}
      </AlertTitle>
      <AlertDescription>
        {isSelf
          ? t('users.guard.selfBody', { company })
          : t('users.guard.lastManagerBody')}
      </AlertDescription>
      <AlertActions>
        <Button plain onClick={onClose}>
          {t('common.close')}
        </Button>
        {resolve && (
          <Button
            color="dark"
            onClick={() => {
              resolve();
              onClose();
            }}
          >
            {resolveLabel}
          </Button>
        )}
      </AlertActions>
    </Alert>
  );
}
