/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Pure presentational layout component; no state.
 * - md+ only — at <md the parent renders a single panel instead of this component.
 * - Left panel: minmax(320px, 40%); right panel: fills remaining space.
 * - Both panels constrained to viewport height minus the AppHeader (~3.5rem).
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render a 2-column grid (hidden below md).
 * 2. Left aside has a right border + overflow-hidden; renders left node.
 * 3. Right section overflow-hidden; renders right node.
 */

import type { ReactNode } from 'react';

export interface WindowLayoutProps {
  left: ReactNode;
  right: ReactNode;
}

export default function WindowLayout({ left, right }: WindowLayoutProps) {
  return (
    <div className="hidden md:grid md:grid-cols-[minmax(320px,40%)_1fr] md:h-[calc(100vh-3.5rem)]">
      <aside className="border-r overflow-hidden">{left}</aside>
      <section className="overflow-hidden">{right}</section>
    </div>
  );
}
