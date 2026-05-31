/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Operational header, not marketing: product name, member label, window range, generated indicator.
 * - No state, no nav links, no logo branding.
 * - Reads windowStart/windowEnd directly from ScheduleResult.
 * - "Member: demo" is a placeholder until a real member-switch UI lands.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render a horizontal header with product name, member label, window range, last-generated indicator.
 * 2. No interactivity.
 */

import type { ScheduleResult } from '@/lib/types';

export interface AppHeaderProps {
  result: ScheduleResult;
  /** 019 — true when chat edits have modified the schedule from the build-time original. Surfaced
   * here (not only in the chat header) so the signal is visible across both panes, incl. mobile. */
  edited?: boolean;
  onReset?: () => void;
  /** 020 — open the Help & glossary panel (restart tour + glossary). */
  onOpenHelp?: () => void;
}

export default function AppHeader({ result, edited, onReset, onOpenHelp }: AppHeaderProps) {
  return (
    <header className="border-b px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="font-semibold">Elyx Resource Allocator</span>
      <span className="text-gray-500 text-sm">Member: demo</span>
      <span className="text-gray-500 text-sm">
        Window: {result.windowStart} → {result.windowEnd}
      </span>
      {edited && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
          <span aria-hidden className="text-amber-500">●</span>
          Schedule edited
          {onReset && (
            <button type="button" onClick={onReset} className="ml-0.5 rounded px-1 text-amber-700 underline hover:bg-amber-100">
              Reset to original
            </button>
          )}
        </span>
      )}
      {onOpenHelp && (
        <button
          type="button"
          onClick={onOpenHelp}
          className="ml-auto rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
        >
          ? Help
        </button>
      )}
      <span className={`text-xs text-gray-500 ${onOpenHelp ? '' : 'ml-auto'}`}>Last generated: build-time</span>
    </header>
  );
}
