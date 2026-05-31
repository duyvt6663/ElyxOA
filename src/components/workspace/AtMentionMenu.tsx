'use client';

/**
 * DECISION RECAP — 019 Phase 1 @-mention menu
 * - Opens from the composer textarea when `@` is typed (019 "`@` context insertion"). A proper
 *   combobox/listbox with ARIA roles and keyboard nav (↑/↓/Enter/Esc).
 * - Presentational + controlled: the parent (ChatSurface) owns the open/query/activeIndex state
 *   and the keyboard handling on the textarea (which keeps focus). This menu just renders the
 *   ranked suggestions and reports clicks; it never steals focus from the textarea.
 * - Suggestions are typed AtMentionSuggestion[] built from the ContextIndex + the held
 *   ScheduleResult. Selecting one inserts a short token AND attaches a typed ContextRef
 *   (019 "Selecting an `@` suggestion inserts a context chip, not just text").
 */

import type { AtMentionSuggestion } from '@/lib/chat-context';

export interface AtMentionMenuProps {
  /** Ranked suggestions to show; empty means "no matches" (still render an idle row). */
  suggestions: AtMentionSuggestion[];
  /** Index of the keyboard-highlighted option (within `suggestions`). */
  activeIndex: number;
  /** id of the listbox, referenced by the textarea's aria-controls. */
  listboxId: string;
  onSelect: (suggestion: AtMentionSuggestion) => void;
  /** Hover/pointer moves the active option so mouse + keyboard stay in sync. */
  onActiveIndexChange: (index: number) => void;
}

export default function AtMentionMenu({
  suggestions,
  activeIndex,
  listboxId,
  onSelect,
  onActiveIndexChange,
}: AtMentionMenuProps) {
  return (
    <ul
      id={listboxId}
      role="listbox"
      aria-label="Context suggestions"
      className="absolute bottom-full left-0 mb-1 max-h-56 w-72 overflow-y-auto rounded border bg-white shadow-lg z-10 text-sm"
    >
      {suggestions.length === 0 ? (
        <li className="px-3 py-2 text-xs text-gray-400" role="presentation">
          No matches
        </li>
      ) : (
        suggestions.map((s, i) => (
          <li
            key={`${s.ref.type}-${s.token}-${i}`}
            id={`${listboxId}-opt-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            // Prevent the textarea from losing focus on click.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(s);
            }}
            onMouseMove={() => i !== activeIndex && onActiveIndexChange(i)}
            className={
              'flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 ' +
              (i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50')
            }
          >
            <span className="truncate text-gray-800">{s.label}</span>
            <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] uppercase tracking-wide text-gray-500">
              {s.kind}
            </span>
          </li>
        ))
      )}
    </ul>
  );
}
