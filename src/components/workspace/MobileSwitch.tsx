/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - Sticky segmented control visible only at <md.
 * - Two options: 'chat' | 'workspace'. Active uses bg-gray-900 + white text.
 * - Controlled by AllocatorWorkspace's mobilePanel useState.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render a sticky top bar with two pill buttons.
 * 2. Each button calls onChange with its value when clicked.
 * 3. Active button gets the dark color scheme; inactive light.
 */

export interface MobileSwitchProps {
  value: 'chat' | 'workspace';
  onChange: (v: 'chat' | 'workspace') => void;
}

export default function MobileSwitch({ value, onChange }: MobileSwitchProps) {
  const base = 'flex-1 px-3 py-1.5 rounded text-sm';
  const active = 'bg-gray-900 text-white';
  const inactive = 'bg-gray-100 text-gray-700';

  return (
    <div className="md:hidden sticky top-0 z-10 bg-white border-b p-2 flex gap-1">
      <button
        type="button"
        onClick={() => onChange('chat')}
        className={`${base} ${value === 'chat' ? active : inactive}`}
      >
        Chat
      </button>
      <button
        type="button"
        onClick={() => onChange('workspace')}
        className={`${base} ${value === 'workspace' ? active : inactive}`}
      >
        Workspace
      </button>
    </div>
  );
}
