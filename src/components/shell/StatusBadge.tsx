import { Badge } from '../catalyst/badge'

type BadgeColor = 'lime' | 'zinc' | 'sky' | 'blue' | 'amber' | 'rose' | 'purple' | 'orange' | 'yellow' | 'red' | 'green' | 'teal' | 'cyan' | 'indigo' | 'violet' | 'pink' | 'fuchsia'

const STATUS_MAP: Record<string, BadgeColor> = {
  // Generic active/inactive
  active: 'lime',
  inactive: 'zinc',
  enabled: 'lime',
  disabled: 'zinc',

  // Work order / dispatch lifecycle
  pending: 'amber',
  scheduled: 'sky',
  in_progress: 'blue',
  completed: 'lime',
  cancelled: 'zinc',
  on_hold: 'amber',

  // Invoice / payment
  draft: 'zinc',
  sent: 'sky',
  paid: 'lime',
  overdue: 'rose',
  void: 'zinc',
  partial: 'amber',

  // Priority
  urgent: 'rose',
  high: 'orange',
  normal: 'blue',
  low: 'zinc',

  // Equipment lifecycle
  maintenance: 'amber',
  retired: 'zinc',

  // Quote lifecycle
  accepted: 'lime',
  declined: 'rose',
  expired: 'amber',

  // Availability
  available: 'lime',
  unavailable: 'rose',
  tentative: 'amber',
  busy: 'zinc',
}

function colorForStatus(status: string): BadgeColor {
  return STATUS_MAP[status.toLowerCase().replace(/[\s-]+/g, '_')] ?? 'zinc'
}

export function StatusBadge({ status, label }: { status?: string; label?: string }) {
  if (!status) return null
  return (
    <Badge color={colorForStatus(status)}>
      {label ?? status}
    </Badge>
  )
}
