/**
 * DECISION RECAP — 020 guided tour (core path, per review R1)
 * - A short 5-step tour that teaches the assignment's core story: a priority-ordered plan → a
 *   3-month calendar → adapted around conflicts → explainable in Trace, with chat on top.
 * - Steps act on the REAL app: `prepare` switches tab / selects a demo occurrence via the existing
 *   workspace handlers (no fake demo page). Targets are stable `data-tour-id` surfaces.
 * - `traceDemo` selects a real skipped/substituted occurrence queried from the current result, so it
 *   stays valid after an import (020 Phase 3); falls back gracefully if none exists.
 */

export type TourPrepare = 'chat' | 'calendar' | 'traceDemo';

export interface TourStep {
  /** data-tour-id of the element to spotlight. */
  tourId: string;
  title: string;
  body: string;
  /** optional workspace action to run before showing the step. */
  prepare?: TourPrepare;
}

export const TOUR_VERSION = 'v1';
export const TOUR_DONE_KEY = `elyx-guided-tour-${TOUR_VERSION}-complete`;

export const TOUR_STEPS: TourStep[] = [
  {
    tourId: 'chat-panel',
    title: 'Your allocator assistant',
    body: 'Ask why something moved, jump to the right view with its links, or propose a schedule edit you preview before applying.',
    prepare: 'chat',
  },
  {
    tourId: 'calendar-summary',
    title: 'A plan becomes a 3-month calendar',
    body: 'A priority-ordered action plan is allocated across three months. These counts are the scheduled, substituted, and skipped outcomes — hover any tag to learn what it means.',
    prepare: 'calendar',
  },
  {
    tourId: 'calendar-grid',
    title: 'Adaptations are visible',
    body: 'Availability, resource, and travel conflicts force changes: ✈ marks travel days, B means a backup action was used, X means an action was skipped.',
    prepare: 'calendar',
  },
  {
    tourId: 'trace-content',
    title: 'Every change is explainable',
    body: 'Trace shows how this occurrence was allocated — the candidate slots tried, the constraints that failed, and the final decision.',
    prepare: 'traceDemo',
  },
  {
    tourId: 'workspace-tabs',
    title: 'The five views',
    body: 'Calendar, Activities (priority vs outcome), Resources (equipment / specialist / travel availability), Trace, and Data (import to rerun) — switch anytime.',
  },
];
