// Timezone display with offset information
export interface TimezoneOption {
  value: string;
  label: string;
}

// Common US timezones with UTC offsets
export const US_TIMEZONES: TimezoneOption[] = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Etc/GMT', label: 'GMT (Greenwich Mean Time)' },
  { value: 'America/New_York', label: 'Eastern Time (UTC-5/-4)' },
  { value: 'America/Chicago', label: 'Central Time (UTC-6/-5)' },
  { value: 'America/Denver', label: 'Mountain Time (UTC-7/-6)' },
  { value: 'America/Phoenix', label: 'Arizona (UTC-7, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (UTC-8/-7)' },
  { value: 'America/Anchorage', label: 'Alaska Time (UTC-9/-8)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (UTC-10)' },
];

// All common timezones (for more comprehensive support)
export const ALL_TIMEZONES: TimezoneOption[] = [
  // Universal
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Etc/GMT', label: 'GMT (Greenwich Mean Time)' },
  // US
  { value: 'America/New_York', label: 'Eastern Time (UTC-5/-4)' },
  { value: 'America/Chicago', label: 'Central Time (UTC-6/-5)' },
  { value: 'America/Denver', label: 'Mountain Time (UTC-7/-6)' },
  { value: 'America/Phoenix', label: 'Arizona (UTC-7, no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (UTC-8/-7)' },
  { value: 'America/Anchorage', label: 'Alaska Time (UTC-9/-8)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (UTC-10)' },
  // Canada
  { value: 'America/Toronto', label: 'Toronto (UTC-5/-4)' },
  { value: 'America/Vancouver', label: 'Vancouver (UTC-8/-7)' },
  { value: 'America/Edmonton', label: 'Edmonton (UTC-7/-6)' },
  { value: 'America/Winnipeg', label: 'Winnipeg (UTC-6/-5)' },
  { value: 'America/Halifax', label: 'Halifax (UTC-4/-3)' },
  // Other Americas
  { value: 'America/Mexico_City', label: 'Mexico City (UTC-6/-5)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (UTC-3)' },
  // Europe
  { value: 'Europe/London', label: 'London (UTC+0/+1)' },
  { value: 'Europe/Paris', label: 'Paris (UTC+1/+2)' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1/+2)' },
  { value: 'Europe/Madrid', label: 'Madrid (UTC+1/+2)' },
  { value: 'Europe/Rome', label: 'Rome (UTC+1/+2)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam (UTC+1/+2)' },
  { value: 'Europe/Brussels', label: 'Brussels (UTC+1/+2)' },
  { value: 'Europe/Stockholm', label: 'Stockholm (UTC+1/+2)' },
  { value: 'Europe/Oslo', label: 'Oslo (UTC+1/+2)' },
  // Asia
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (UTC+8)' },
  { value: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
  { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { value: 'Asia/Kolkata', label: 'Kolkata (UTC+5:30)' },
  // Australia
  { value: 'Australia/Sydney', label: 'Sydney (UTC+10/+11)' },
  { value: 'Australia/Melbourne', label: 'Melbourne (UTC+10/+11)' },
  { value: 'Australia/Perth', label: 'Perth (UTC+8)' },
  // Pacific
  { value: 'Pacific/Auckland', label: 'Auckland (UTC+12/+13)' },
];
