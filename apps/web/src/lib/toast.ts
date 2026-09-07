// User-feedback helpers built on `sonner`. Use these instead of
// `window.alert` / `window.confirm`.
//
// Four lanes (see handoff/design-system-reference.md §5):
//   · Success / inline info → showSuccess / showInfo
//   · Recoverable error    → showError
//   · Destructive confirm  → Catalyst <Alert> or <ConfirmDialog>
//   · Page-level error     → <Callout kind="danger">
//
// `extractApiError` pulls a server-supplied message out of the axios-style
// error shape our API services throw. Falls back to undefined so callers
// can pass their own generic copy.
import { toast } from 'sonner';

export function extractApiError(err: unknown): string | undefined {
  if (err instanceof Error && 'response' in err) {
    const r = (err as { response?: { data?: { message?: string; error?: string } } }).response;
    if (r?.data?.message) return r.data.message;
    // The JWT interceptor writes its human-readable half as `error` where the
    // controllers use `message`. Both are server-authored prose for the user,
    // so read either rather than falling through to a stack-trace message.
    if (r?.data?.error) return r.data.error;
  }
  if (err instanceof Error && err.message) return err.message;
  return undefined;
}

// Machine-readable failure reason. Every 409 from `/users` carries one, as do
// the interceptor's 401/403 bodies — so one parser covers both. Prefer this to
// matching on the message: the prose is server-authored and translatable, the
// code is the contract.
export function errorCode(err: unknown): string | undefined {
  if (err instanceof Error && 'response' in err) {
    return (err as { response?: { data?: { code?: string | null } } }).response?.data?.code ?? undefined;
  }
  return undefined;
}

// HTTP status off an axios-style error, if present.
export function errorStatus(err: unknown): number | undefined {
  if (err instanceof Error && 'response' in err) {
    return (err as { response?: { status?: number } }).response?.status;
  }
  return undefined;
}

// True for a genuine concurrent-edit collision — the 409 the customer
// endpoints now return (instead of a 500) when two requests modify the same
// record at once.
export function isConflict(err: unknown): boolean {
  return errorStatus(err) === 409;
}

export function showSuccess(message: string, description?: string) {
  toast.success(message, description ? { description } : undefined);
}

export function showError(message: string, description?: string) {
  toast.error(message, description ? { description } : undefined);
}

export function showInfo(message: string, description?: string) {
  toast(message, description ? { description } : undefined);
}

// Undoable action — the safety valve for instant, confirmation-free mutations
// (e.g. removing a tag assignment from a detail header). Renders an action
// button that fires `onUndo`; sonner dismisses the toast on click.
export function showUndo(message: string, undoLabel: string, onUndo: () => void) {
  toast(message, { action: { label: undoLabel, onClick: onUndo } });
}

// Promise-based — auto-renders loading → success/error. Use for long-running
// mutations where the user benefits from seeing the in-flight state.
export function showMutation<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error: string }
) {
  return toast.promise(promise, messages);
}
