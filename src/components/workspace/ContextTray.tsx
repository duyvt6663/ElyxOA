'use client';

/**
 * DECISION RECAP — 019 Phase 1 Context Tray
 * - Renders the attached ContextBlock[] as removable rectangular chips directly above the
 *   composer (019 "Composer context tray"). "Visible beats hidden" (decision 1): every typed
 *   ref sent on the next chat turn shows here.
 * - Each chip carries a remove (×) control and a pin toggle. Active (provenance 'selected')
 *   blocks update with selection; pinned/atMention blocks persist until removed.
 * - Accessibility (019): chips are focusable and keyboard-removable (Delete/Backspace). The
 *   tray stays visible on mobile above the composer so users can see what chat sees.
 */

import type { ContextBlock } from '@/lib/chat-context';

export interface ContextTrayProps {
  blocks: ContextBlock[];
  onRemove: (key: string) => void;
  onTogglePin: (key: string) => void;
}

export default function ContextTray({ blocks, onRemove, onTogglePin }: ContextTrayProps) {
  if (blocks.length === 0) return null;

  return (
    <ul
      aria-label="Attached context"
      className="flex flex-wrap gap-1.5 px-3 pt-2 pb-1 border-t"
    >
      {blocks.map((block) => (
        <li key={block.key}>
          <span
            role="group"
            aria-label={`Context ${block.label}${block.pinned ? ' (pinned)' : ''}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                onRemove(block.key);
              }
            }}
            className="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-50 pl-2 pr-1 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <span className="truncate max-w-[12rem]">{block.label}</span>
            <button
              type="button"
              aria-pressed={block.pinned}
              aria-label={block.pinned ? `Unpin ${block.label}` : `Pin ${block.label}`}
              title={block.pinned ? 'Unpin' : 'Pin (keep across selection changes)'}
              onClick={() => onTogglePin(block.key)}
              className={
                'rounded px-1 leading-none hover:bg-gray-200 ' +
                (block.pinned ? 'text-blue-600' : 'text-gray-400')
              }
            >
              {block.pinned ? '📌' : '📍'}
            </button>
            <button
              type="button"
              aria-label={`Remove ${block.label}`}
              title="Remove from context"
              onClick={() => onRemove(block.key)}
              className="rounded px-1 leading-none text-gray-500 hover:bg-gray-200 hover:text-gray-800"
            >
              ×
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
