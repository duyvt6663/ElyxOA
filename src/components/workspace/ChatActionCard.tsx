'use client';

/**
 * DECISION RECAP — 019 Phase 2 Navigation Actions
 * - Renders one assistant navigation tool call as a click-to-execute card (decision 4: navigation
 *   may execute on a user click, no Apply gate — only schedule edits are gated).
 * - Presentational: the parent maps the click to a WorkspaceSelection patch via navActionToSelection.
 *   Unknown/unsupported tool names render nothing.
 */

import { navActionLabel } from './chatActions';
import GlossaryTooltip from '../GlossaryTooltip';

export interface ChatActionCardProps {
  name: string;
  input: unknown;
  onExecute: () => void;
}

export default function ChatActionCard({ name, input, onExecute }: ChatActionCardProps) {
  const label = navActionLabel(name, input);
  if (!label) return null;
  return (
    <button
      type="button"
      onClick={onExecute}
      className="mt-1 flex w-full items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-left text-xs text-blue-800 hover:bg-blue-100"
    >
      <GlossaryTooltip term="chat.navigationCard">
        <span className="text-blue-500">↪</span>
      </GlossaryTooltip>
      <span className="font-medium">{label.verb}</span>
      {label.detail && <span className="truncate font-mono text-blue-700">{label.detail}</span>}
    </button>
  );
}
