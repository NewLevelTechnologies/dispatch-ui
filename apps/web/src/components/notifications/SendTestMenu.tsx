/* eslint-disable i18next/no-literal-string -- dense visual form; primary copy stays inline. Translation pass lives in a follow-up. */
// Send a one-off test against the current draft. Gated by
// flags.notificationTestSend — when the flag is off, the parent never
// mounts this component at all.

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ChevronDownIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';

import {
  notificationTemplateApi,
  type NotificationTemplate,
} from '../../api/setup';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { extractApiError, showError, showSuccess } from '../../lib/toast';

import { Button } from '../catalyst/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from '../catalyst/dialog';
import {
  Dropdown,
  DropdownButton,
  DropdownDescription,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../catalyst/dropdown';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';

type Draft = {
  subject: string;
  bodyTemplate: string;
  htmlBodyTemplate: string;
};

type Props = {
  template: NotificationTemplate;
  draft: Draft;
  sampleId?: string | null;
  className?: string;
};

export function SendTestMenu({ template, draft, sampleId, className }: Props) {
  const { data: currentUser } = useCurrentUser();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherRecipient, setOtherRecipient] = useState('');

  const isSms = template.channel === 'SMS';
  const meRecipient = isSms
    ? currentUser?.phoneNumber ?? ''
    : currentUser?.email ?? '';

  const sendTest = useMutation({
    mutationFn: (recipient: string) =>
      notificationTemplateApi.sendTest(template.id, {
        recipient,
        sampleId: sampleId ?? undefined,
        draft: {
          subject: draft.subject || null,
          bodyTemplate: draft.bodyTemplate || null,
          htmlBodyTemplate: draft.htmlBodyTemplate || null,
        },
      }),
    onSuccess: (_data, recipient) => {
      showSuccess(`Test sent to ${recipient}`);
      setOtherOpen(false);
      setOtherRecipient('');
    },
    onError: (err) => {
      const resp = (err as { response?: { status?: number } }).response;
      if (resp?.status === 403) {
        showError(
          'Recipient not allowed',
          'Test sends are restricted to existing tenant users.'
        );
        return;
      }
      showError("Couldn't send test", extractApiError(err));
    },
  });

  return (
    <>
      <Dropdown>
        <DropdownButton as={Button} outline size="xs" className={className}>
          <PaperAirplaneIcon className="size-3.5" />
          Send test
          <ChevronDownIcon className="ml-0.5 size-3" />
        </DropdownButton>
        <DropdownMenu anchor="bottom end">
          <DropdownItem
            onClick={() => meRecipient && sendTest.mutate(meRecipient)}
            disabled={!meRecipient || sendTest.isPending}
          >
            <DropdownLabel>Send to me</DropdownLabel>
            {meRecipient && (
              <DropdownDescription>{meRecipient}</DropdownDescription>
            )}
          </DropdownItem>
          <DropdownItem onClick={() => setOtherOpen(true)}>
            <DropdownLabel>Send to someone else…</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Dialog
        open={otherOpen}
        onClose={() => !sendTest.isPending && setOtherOpen(false)}
        size="sm"
      >
        <DialogTitle>
          {isSms ? 'Send test SMS' : 'Send test email'}
        </DialogTitle>
        <DialogBody>
          <Field size="xs">
            <Label size="xs" required>
              {isSms ? 'Phone number' : 'Email address'}
            </Label>
            <Input
              size="xs"
              type={isSms ? 'tel' : 'email'}
              value={otherRecipient}
              onChange={(e) => setOtherRecipient(e.target.value)}
              placeholder={
                isSms ? '(555) 123-4567' : 'recipient@yourcompany.com'
              }
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            plain
            onClick={() => setOtherOpen(false)}
            disabled={sendTest.isPending}
          >
            Cancel
          </Button>
          <Button
            color="accent"
            onClick={() => sendTest.mutate(otherRecipient.trim())}
            disabled={!otherRecipient.trim() || sendTest.isPending}
          >
            {sendTest.isPending ? 'Sending…' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
