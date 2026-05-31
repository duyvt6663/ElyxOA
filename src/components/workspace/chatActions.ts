/**
 * DECISION RECAP — 019 Phase 2 Navigation Actions
 * - The assistant emits navigation via the AI SDK tool-call channel (decision 6): the model calls
 *   one of the nav tools (openTab/selectDate/selectOccurrence/focusResource), the client renders the
 *   call as a <ChatActionCard>, and clicking it executes the navigation here.
 * - This module is the CLIENT side: it maps a tool name + input → a WorkspaceSelection patch and a
 *   human label. The matching zod tool schemas live server-side in api/chat/route.ts; field names
 *   are kept in sync by convention (kept tiny on purpose).
 * - Supported now: openTab, selectDate, selectOccurrence, focusResource (→ open Resources). Granular
 *   resource focus and setFilters are deferred (no shared selection field for them yet).
 */

import type { TabId, WorkspaceSelection } from './AllocatorWorkspace';
import type { SchedulePatch, TimeWindow } from '@/lib/schedule-patch';

export const NAV_TOOL_NAMES = ['openTab', 'selectDate', 'selectOccurrence', 'focusResource'] as const;

const WINDOWS = ['morning', 'midday', 'afternoon', 'evening'];
const ANCHORS = ['wake', 'breakfast', 'lunch', 'dinner', 'bedtime', 'any'];

/** 019 Phase 3 — parse a draft-edit tool call into a typed SchedulePatch, or null if not an edit. */
export function parseSchedulePatch(name: string, input: unknown): SchedulePatch | null {
  const a = (input ?? {}) as Record<string, unknown>;
  if (name === 'setTemporalPolicy' && typeof a.activityId === 'string') {
    return {
      kind: 'setTemporalPolicy',
      activityId: a.activityId,
      window: typeof a.window === 'string' && WINDOWS.includes(a.window) ? (a.window as TimeWindow) : undefined,
      anchor:
        typeof a.anchor === 'string' && ANCHORS.includes(a.anchor)
          ? (a.anchor as SchedulePatch['anchor'])
          : undefined,
    };
  }
  return null;
}

const TAB_IDS: readonly TabId[] = ['calendar', 'activities', 'resources', 'trace', 'data'];

/** Map a navigation tool call (name + raw input) to a selection patch, or null if unrenderable. */
export function navActionToSelection(name: string, input: unknown): Partial<WorkspaceSelection> | null {
  const a = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'openTab':
      return typeof a.tab === 'string' && (TAB_IDS as readonly string[]).includes(a.tab)
        ? { activeTab: a.tab as TabId }
        : null;
    case 'selectDate':
      return typeof a.date === 'string' ? { selectedDate: a.date, activeTab: 'calendar' } : null;
    case 'selectOccurrence': {
      if (typeof a.occurrenceId !== 'string') return null;
      const m = a.occurrenceId.match(/(\d{4}-\d{2}-\d{2})$/);
      return { selectedOccurrenceId: a.occurrenceId, selectedDate: m ? m[1] : null, activeTab: 'trace' };
    }
    case 'focusResource':
      return { activeTab: 'resources' };
    default:
      return null;
  }
}

/** Human label for the action card: a short verb + the target detail. */
export function navActionLabel(name: string, input: unknown): { verb: string; detail: string } | null {
  const a = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'openTab':
      return { verb: 'Open', detail: `${a.tab ?? ''} tab` };
    case 'selectDate':
      return { verb: 'Open calendar', detail: String(a.date ?? '') };
    case 'selectOccurrence':
      return { verb: 'Show trace', detail: String(a.occurrenceId ?? '') };
    case 'focusResource':
      return { verb: 'Open Resources', detail: String(a.resourceKey ?? '') };
    default:
      return null;
  }
}
