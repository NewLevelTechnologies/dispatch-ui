// Auto-derive an UPPERCASE_WITH_UNDERSCORES code from a human-readable
// name. Used by every settings dialog with an auto-generated code field
// (Work Order Types, Divisions, future taxonomy surfaces).
//
//   toUpperSnake('Service Call')        // 'SERVICE_CALL'
//   toUpperSnake('  HVAC / Plumbing')   // 'HVAC_PLUMBING'
//   toUpperSnake('café')                // 'CAF' (non-ASCII dropped)
//
// 50-char cap mirrors the backend column width. Keep this exported as a
// plain pure function — settings dialogs run it on every keystroke.
export function toUpperSnake(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase()
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}
