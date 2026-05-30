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
}

export default function AppHeader({ result }: AppHeaderProps) {
  return (
    <header className="border-b px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="font-semibold">Elyx Resource Allocator</span>
      <span className="text-gray-500 text-sm">Member: demo</span>
      <span className="text-gray-500 text-sm">
        Window: {result.windowStart} → {result.windowEnd}
      </span>
      <span className="text-xs text-gray-500 ml-auto">Last generated: build-time</span>
    </header>
  );
}
