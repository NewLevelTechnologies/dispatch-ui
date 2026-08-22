/**
 * Formats a raw phone number string into (XXX) XXX-XXXX format
 * @param phone - Raw phone number (e.g., "5551234567")
 * @returns Formatted phone number (e.g., "(555) 123-4567") or original if invalid
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Only format if we have exactly 10 digits (US phone number)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Return original if not standard format
  return phone;
}
