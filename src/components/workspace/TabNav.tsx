/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - 6 tabs in locked order: Calendar, Actions, Priority, Resources, Trace, Data.
 * - Active tab uses bg-gray-900 + text-white per the locked color scheme.
 * - Horizontal, overflow-x-auto so a narrow viewport doesn't break the nav.
 * - TabId is imported from AllocatorWorkspace (owner of the type).
 */

/**
 * BEHAVIOR SKETCH
 * 1. Map over a static [id, label] array.
 * 2. Render a button per tab; clicking calls onChange(id).
 * 3. Apply active vs inactive classes based on activeTab === id.
 */

import type { TabId } from './AllocatorWorkspace';

export interface TabNavProps {
  activeTab: TabId;
  onChange: (t: TabId) => void;
}

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'actions', label: 'Actions' },
  { id: 'priority', label: 'Priority' },
  { id: 'resources', label: 'Resources' },
  { id: 'trace', label: 'Trace' },
  { id: 'data', label: 'Data' },
];

export default function TabNav({ activeTab, onChange }: TabNavProps) {
  return (
    <nav className="flex gap-0.5 sm:gap-1 border-b px-1 sm:px-2 overflow-x-auto">
      {TABS.map(({ id, label }) => (
        <button
          type="button"
          key={id}
          onClick={() => onChange(id)}
          className={`px-2 sm:px-3 py-2 text-xs sm:text-sm whitespace-nowrap ${
            activeTab === id ? 'bg-gray-900 text-white rounded-t' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
