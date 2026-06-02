// ─────────────────────────────────────────────────────────────────────────
// serviceLocationDetailMocks.ts
//
// PLACEHOLDER DATA for the Location detail page. Everything here stands in for
// data that no built/wired service supplies yet. As each backend lands, delete
// the mock and read the live value — the call sites are the only change.
//
// Already retired (now wired to real data, no longer here):
//   region, parent-customer standing/terms, tags, and the techOnSite /
//   hasOpenJobs gating booleans — all on GET /service-locations/:id now.
//
// Dropped from the design (never coming): agreementCoverage — there is no
// agreement service in the platform.
//
// Deferred to the Add/Edit Location pass (no writer yet, would be null
// forever): sq ft, operating hours, dispatch priority tier, structured
// arrival.facts[]. The page renders only populated fields, so it omits these.
//
// Still mocked here, pending per-service follow-ups:
//   - Live-tech detail (name / WO / since)  → dispatch / scheduling-service
//   - Open-job counts                        → work-order-service
//   - PM-overdue                             → scheduling-service
//   - Upcoming / forward visits (count + "Next scheduled" strip)
//                                            → scheduling-service (AG-2)
//   - Operational activity feed              → (cross-service feed)
//
// NOTHING IN HERE IS REAL DATA.
// ─────────────────────────────────────────────────────────────────────────

export type MockTone = 'info' | 'warning' | 'success' | 'accent' | 'neutral';

// ── Attention strip detail ──────────────────────────────────────────────────
// Row VISIBILITY is gated on the real location.techOnSite / location.hasOpenJobs
// booleans (see the page). The descriptive detail below — tech name, WO, since,
// open-job counts, PM-overdue — still comes from here until dispatch /
// work-order / scheduling services are wired.
//
// There is deliberately NO equipment-flagged rule: the redesign removed
// equipment flagging entirely. A unit's only live state is whether it has an
// open work order, which surfaces in the work-order list, not a flag layer.
export interface MockAttention {
  techOnSite: {
    name: string;
    job: { id: string; title: string };
    since: string;
    eta: string;
  } | null;
  openCritical: number;
  pmOverdueDays: number;
}
export const mockAttention: MockAttention = {
  techOnSite: {
    name: 'D. Park',
    job: { id: 'WO-4203', title: 'RTU-3 no cooling — critical' },
    since: '2h 14m ago',
    eta: '~30m remaining',
  },
  openCritical: 1,
  pmOverdueDays: 0,
};

// (Upcoming / forward visits are now REAL — the Visits tab reads the
// location-scoped dispatch endpoint. The former mockUpcomingVisits stub was
// removed when that landed.)

// ── Overview: operational activity feed ─────────────────────────────────────
// Backend ask: a location-scoped operational activity feed (tech arrived, job
// opened, equipment flagged…). Distinct from the real NotificationLogsList on
// the Activity tab (notifications, not operations).
export interface MockActivityEvent {
  at: string; // ISO timestamp — rendered via the shared formatTimestamp helper
  glyph: string;
  text: string;
  sub: string;
  tone: MockTone;
}
// Offsets from load so the teaser exercises the hybrid timestamp rule (relative
// under 7 days). The real feed will carry server ISO timestamps in this shape.
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
export const mockActivityFeed: MockActivityEvent[] = [
  { at: ago(12 * MIN), glyph: '→', text: 'Tech D. Park arrived', sub: 'WO-4203 · RTU-3 no cooling', tone: 'info' },
  { at: ago(2 * HOUR), glyph: '+', text: 'Critical job opened · WO-4203', sub: 'RTU-3 no cooling', tone: 'warning' },
  { at: ago(3 * DAY), glyph: '✓', text: 'Visit completed · WO-4144', sub: 'AHU-2 compressor diagnostic · 1.5h', tone: 'success' },
  { at: ago(6 * DAY), glyph: '★', text: 'Equipment baseline updated', sub: 'AHU-2 draw +8% vs Jun baseline · alert set', tone: 'accent' },
];
