/**
 * DECISION RECAP — 020 Phase 1 tag glossary
 * - Single source of truth for compact-tag meanings, reused by GlossaryTooltip everywhere
 *   (SummaryHeader, DayTimeline, AgendaList, travel badge, chat UI, ...).
 * - Product language, not implementation language (020 copy guidelines): "backup action", not
 *   "substituted occurrence"; explain WHY the user should care.
 * - The Record<GlossaryKey, ...> type makes completeness a compile-time guarantee.
 */

export type GlossaryKey =
  | 'status.scheduled'
  | 'status.substituted'
  | 'status.skipped'
  | 'statusGlyph.B'
  | 'statusGlyph.X'
  | 'time.outsidePreferredWindow'
  | 'bundle.display'
  | 'timeline.occupiedBlock'
  | 'timeline.substitutionArrow'
  | 'travel.badge'
  | 'chat.navigationCard'
  | 'chat.draftEdit'
  | 'chat.editedBadge'
  | 'chat.pinnedContext'
  | 'chat.contextBlock';

export interface GlossaryEntry {
  /** Short human label shown as the tooltip title. */
  label: string;
  /** 1-2 sentence plain-language explanation that says why it matters. */
  explanation: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  'status.scheduled': {
    label: 'Scheduled',
    explanation: 'The original action was placed on the calendar as planned.',
  },
  'status.substituted': {
    label: 'Substituted',
    explanation:
      'The original action could not be placed, so a backup action was scheduled instead. This is how the plan adapts to conflicts.',
  },
  'status.skipped': {
    label: 'Skipped',
    explanation: 'Neither the original action nor an eligible backup could be placed for that date.',
  },
  'statusGlyph.B': {
    label: 'B — backup used',
    explanation: 'This day/type includes substituted actions: a backup replaced the original.',
  },
  'statusGlyph.X': {
    label: 'X — skipped',
    explanation: 'This day/type includes skipped actions: nothing feasible could be placed.',
  },
  'time.outsidePreferredWindow': {
    label: 'Outside preferred window',
    explanation: 'Scheduled outside its ideal time of day because constraints made a better slot unavailable.',
  },
  'bundle.display': {
    label: 'Routine bundle',
    explanation:
      'Several low-risk daily food/medication actions grouped for readability. Expand it to inspect each action.',
  },
  'timeline.occupiedBlock': {
    label: 'Occupied block',
    explanation: 'Time already taken by sleep, work, commute, meals, travel, or personal commitments.',
  },
  'timeline.substitutionArrow': {
    label: 'Fallback ← original',
    explanation: 'The item shown is the backup that was scheduled; after the arrow is the original action it replaced.',
  },
  'travel.badge': {
    label: 'Travel day',
    explanation: 'The member is traveling; in-person actions may be substituted or skipped on these days.',
  },
  'chat.navigationCard': {
    label: 'Navigation card',
    explanation: 'The assistant can drive the workspace — click a card to jump to that view, date, or occurrence.',
  },
  'chat.draftEdit': {
    label: 'Draft edit',
    explanation: 'A proposed schedule change. Review the preview (what moves, what gets skipped), then Apply — nothing changes until you do.',
  },
  'chat.editedBadge': {
    label: 'Schedule edited',
    explanation: 'Chat edits have changed the schedule from the original. Undo the last one in chat, or Reset to original here.',
  },
  'chat.pinnedContext': {
    label: 'Pinned context',
    explanation: 'A pinned schedule object stays attached as you navigate; unpinned ones follow your current selection.',
  },
  'chat.contextBlock': {
    label: 'Chat context',
    explanation: 'A schedule object (day, action, trip, …) attached to the next assistant turn, so the answer is about exactly that.',
  },
};
