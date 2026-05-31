'use client';

/**
 * DECISION RECAP — 013 LLM Chat Wire-Up
 * - Provider LOCKED to OpenAI default `gpt-5.3-chat-latest` (see src/lib/llm/config.ts).
 *   Verify exact id at impl per 013 Open Question §1.
 * - Streaming via the Vercel AI SDK over POST /api/chat (SSE-style token stream).
 * - Starter chips POPULATE the composer; they DO NOT auto-send. Preserves user agency
 *   (013 §6 decision); a user can edit the prefilled text before pressing Enter.
 * - Empty selection: chips that need an occurrence ("Why was this skipped?",
 *   "Walk me through this trace step by step") are disabled, not hidden.
 * - Rate-limit (429) and missing-key (503) responses surface as small inline notices
 *   above the composer — the rest of the workspace keeps working.
 * - Conversation persistence: in-memory only (lost on refresh); 013 Open Question §3.
 * - Tab/occurrence handoff links: the model emits `[Trace](trace://occ-...)`,
 *   `[Calendar](tab://calendar?date=...)`, `[Resources](tab://resources)` per the
 *   system prompt; the impl pass parses them and renders inline buttons.
 *   `onSelect` is threaded through from AllocatorWorkspace so the buttons route to
 *   workspace.select(...).
 * - Server emits plain text via `streamText().toTextStreamResponse()`, so the
 *   client just decodes UTF-8 chunks. No SSE parsing needed.
 */

/**
 * DECISION RECAP — 011 Allocator Workspace Shell
 * - SKELETON ONLY in 011. Real LLM provider wiring (onSend → /api/chat) is 013's job.
 * - Layout mirrors the reference chat pattern: header, scroll area, bottom-pinned composer, bottom fade.
 * - Composer Send button is disabled in 011.
 * - Reads selection so 013 can later show contextual chips, but does not render anything from it yet.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render header "Allocator Assistant".
 * 2. Render the message list (role-styled bubbles). When empty, render the 5 starter chips above the composer.
 * 3. Render a bottom-pinned form with a textarea + Send button.
 *    - Send disabled while status === 'streaming' or input is empty.
 *    - On submit: POST to /api/chat with { messages, selection, result, traces, activities },
 *      stream tokens into a new assistant message bubble.
 * 4. Inline notice above the composer for status ∈ { 'unconfigured', 'rate-limited', 'error' }.
 * 5. Render the non-interactive gradient fade above the composer for visual softness.
 */

import { Fragment, useState, type ReactNode } from 'react';
import type { Activity, ScheduleResult, ScheduleDiagnostics } from '@/lib/types';
import type { ChatMessage } from '@/lib/llm/prompt';
import type { WorkspaceSelection } from './AllocatorWorkspace';

export interface ChatSurfaceProps {
  selection: WorkspaceSelection;
  result: ScheduleResult;
  diagnostics?: ScheduleDiagnostics;
  activities: Activity[];
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
}

type ChatStatus = 'idle' | 'streaming' | 'error' | 'unconfigured' | 'rate-limited';

interface StarterChip {
  label: string;
  requiresSelection: boolean;
}

const STARTER_CHIPS: StarterChip[] = [
  { label: 'Why was this skipped?', requiresSelection: true },
  { label: 'What changed during travel?', requiresSelection: false },
  { label: 'Show substituted items this month', requiresSelection: false },
  { label: 'What resources are constrained?', requiresSelection: false },
  { label: 'Walk me through this trace step by step', requiresSelection: true },
];

/**
 * Parse assistant text for the 3 link patterns and return a mixed array of strings
 * and <button> elements. The regex captures all three patterns in one pass; each
 * match is dispatched to the right onSelect(...) handler.
 */
function renderMessageContent(text: string, onNavigate: (partial: Partial<WorkspaceSelection>) => void): ReactNode[] {
  const pattern = /\[(Trace|Calendar|Resources)\]\((trace:\/\/occ-[^)]+|tab:\/\/calendar\?date=\d{4}-\d{2}-\d{2}|tab:\/\/resources)\)/g;
  const out: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) {
      out.push(text.slice(lastIndex, m.index));
    }
    const label = m[1];
    const target = m[2];
    let partial: Partial<WorkspaceSelection> | null = null;
    if (target.startsWith('trace://')) {
      const occId = target.slice('trace://'.length);
      const dateMatch = occId.match(/(\d{4}-\d{2}-\d{2})$/);
      partial = {
        selectedOccurrenceId: occId,
        selectedDate: dateMatch ? dateMatch[1] : null,
        activeTab: 'trace',
      };
    } else if (target.startsWith('tab://calendar?date=')) {
      const date = target.slice('tab://calendar?date='.length);
      partial = { selectedDate: date, activeTab: 'calendar' };
    } else if (target === 'tab://resources') {
      partial = { activeTab: 'resources' };
    }
    const handler = partial;
    out.push(
      <button
        key={`lnk-${key++}`}
        type="button"
        onClick={() => handler && onNavigate(handler)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
      >
        {label}
      </button>
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push(text.slice(lastIndex));
  }
  return out.length > 0 ? out : [text];
}

export default function ChatSurface({ selection, result, diagnostics, activities, onSelect }: ChatSurfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const hasSelection = selection.selectedOccurrenceId !== null;
  const isStreaming = status === 'streaming';
  const canSend = !isStreaming && input.trim().length > 0;

  async function handleSend() {
    const userText = input.trim();
    if (!userText) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: userText }];
    setMessages(nextMessages);
    setInput('');
    setStatus('streaming');
    setError(null);

    let res: Response;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          selection,
          result,
          traces: diagnostics?.traces ?? [],
          activities,
        }),
      });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'network error');
      return;
    }

    if (!res.ok) {
      let payload: { error?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // body wasn't JSON; ignore.
      }
      if (res.status === 503) {
        setStatus('unconfigured');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Chat is not configured (OPENAI_API_KEY missing on server).' },
        ]);
      } else if (res.status === 429) {
        setStatus('rate-limited');
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Rate limit exceeded — try again later.' },
        ]);
      } else {
        setStatus('error');
        const msg = payload.error ?? `request failed (${res.status})`;
        setError(msg);
        setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      }
      return;
    }

    if (!res.body) {
      setStatus('error');
      setError('empty response body');
      return;
    }

    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        setMessages((prev) => {
          const copy = prev.slice();
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
          }
          return copy;
        });
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'stream error');
      return;
    }
    setStatus('idle');
  }

  function onChipClick(label: string) {
    setInput(label);
  }

  function statusNotice(): string | null {
    if (status === 'unconfigured') return 'Chat not configured — OPENAI_API_KEY missing on server.';
    if (status === 'rate-limited') return 'Rate limit reached. Please wait a few minutes and try again.';
    if (status === 'error') return error ?? 'Something went wrong.';
    return null;
  }

  const notice = statusNotice();

  return (
    <section className="relative flex h-full flex-col">
      <header className="px-4 py-3 border-b text-sm font-medium">Allocator Assistant</header>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-gray-500">
              Ask about the schedule, a specific occurrence, or a resource constraint.
            </p>
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">About the schedule</div>
              <div className="flex flex-wrap gap-2">
                {STARTER_CHIPS.filter((c) => !c.requiresSelection).map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => onChipClick(chip.label)}
                    className="px-3 py-1 rounded-full border text-xs bg-white hover:bg-gray-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                About the selected occurrence{hasSelection ? '' : ' (select one first)'}
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_CHIPS.filter((c) => c.requiresSelection).map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    disabled={!hasSelection}
                    title={hasSelection ? undefined : 'Select an occurrence in the Calendar/Activities/Resources tab first'}
                    onClick={() => onChipClick(chip.label)}
                    className="px-3 py-1 rounded-full border text-xs bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li
                key={i}
                className={
                  m.role === 'user'
                    ? 'flex justify-end'
                    : 'flex justify-start'
                }
              >
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[80%] rounded-lg bg-blue-600 text-white px-3 py-2'
                      : 'max-w-[80%] rounded-lg bg-gray-100 text-gray-900 px-3 py-2'
                  }
                >
                  <span className="whitespace-pre-wrap">
                    {m.role === 'assistant'
                      ? renderMessageContent(m.content, onSelect).map((node, idx) => (
                          <Fragment key={idx}>{node}</Fragment>
                        ))
                      : m.content}
                  </span>
                  {isStreaming && i === messages.length - 1 && m.role === 'assistant' && (
                    <span className="ml-1 inline-block w-2 h-4 bg-gray-500 animate-pulse" />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-[60px] left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent" />
      {notice && (
        <div className="px-3 py-1 text-xs text-red-600 border-t bg-red-50">{notice}</div>
      )}
      <form
        className="border-t p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          void handleSend();
        }}
      >
        <textarea
          className="flex-1 resize-none border rounded p-2 text-sm"
          rows={1}
          placeholder="Ask the allocator..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) void handleSend();
            }
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
