// ─────────────────────────────────────────────────────────────────
// OtpInput.tsx — N-box one-time-code input.
//
// Built for the 2FA setup wizard, designed to also back Amplify's MFA
// challenge, the future SMS / Email verify steps, and the
// "use recovery code" sign-in path.
//
//   const otpRef = useRef<OtpInputHandle>(null);
//
//   <OtpInput
//     length={6}
//     value={code}
//     onChange={setCode}
//     onComplete={(v) => mutation.mutate(v)}
//     autoFocus
//     ref={otpRef}
//   />
//
//   // To reset + refocus on verify error:
//   setCode('');
//   otpRef.current?.focus();
//
// Behavior:
//   · `value` is a single string (length 0–N); the component manages
//     box-by-box rendering internally.
//   · Auto-advance focus on type, backspace-to-previous on empty.
//   · ←/→ arrows step focus.
//   · Pasting the full code into any box fills all boxes and focuses
//     the next empty one (or blurs at the end).
//   · `onComplete` fires when the value reaches `length` digits.
//   · `inputMode="numeric"` and `autocomplete="one-time-code"` give
//     iOS the SMS auto-fill banner and the numeric keypad on touch.
// ─────────────────────────────────────────────────────────────────
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
} from 'react';
import clsx from 'clsx';

export interface OtpInputHandle {
  focus: () => void;
}

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { length = 6, value, onChange, onComplete, autoFocus, disabled, ariaLabel, className },
  ref
) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useImperativeHandle(ref, () => ({
    focus: () => inputRefs.current[0]?.focus(),
  }));

  useEffect(() => {
    if (autoFocus) inputRefs.current[0]?.focus();
  }, [autoFocus]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const emit = useCallback(
    (next: string[]) => {
      const joined = next.join('');
      onChange(joined);
      if (joined.length === length && next.every((d) => d !== '')) onComplete?.(joined);
    },
    [onChange, onComplete, length]
  );

  const handleDigit = (idx: number, raw: string) => {
    // Paste of full code (or any multi-char input) — distribute across boxes.
    if (raw.length > 1) {
      const incoming = raw.replace(/\D/g, '').slice(0, length).split('');
      const next = [...digits];
      for (let i = 0; i < length; i++) next[i] = incoming[i] ?? '';
      emit(next);
      const lastFilled = Math.min(incoming.length, length) - 1;
      if (lastFilled >= 0 && lastFilled < length - 1) {
        inputRefs.current[lastFilled + 1]?.focus();
      } else {
        inputRefs.current[length - 1]?.blur();
      }
      return;
    }
    const digit = raw.replace(/\D/g, '').slice(0, 1);
    const next = [...digits];
    next[idx] = digit;
    emit(next);
    if (digit && idx < length - 1) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      inputRefs.current[idx + 1]?.focus();
    }
  };

  return (
    <div
      className={clsx('flex gap-1.5', className)}
      role="group"
      aria-label={ariaLabel}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          // First box accepts paste of the full code; remaining boxes are 1 char.
          maxLength={i === 0 ? length : 1}
          value={d}
          disabled={disabled}
          onChange={(e) => handleDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="h-[50px] w-[42px] rounded-md border-[1.5px] border-border bg-bg-elev text-center font-mono text-[22px] font-semibold text-fg-strong outline-none focus:border-accent-500 focus:ring-3 focus:ring-accent-500/20 disabled:opacity-50"
        />
      ))}
    </div>
  );
});
