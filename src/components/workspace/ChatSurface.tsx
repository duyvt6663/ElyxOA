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
 * DECISION RECAP — 019 Phase 1 Visible Context + @-insertion
 * - Renders <ContextTray> directly above the textarea: the attached ContextBlock[] (selected +
 *   pinned + @-mention) shown as removable chips — "visible beats hidden" (decision 1).
 * - Maps the current blocks → ChatContextItem[] and adds them as `contexts` in the existing
 *   /api/chat body (no existing field removed; still the text-stream transport).
 * - Typing `@` opens <AtMentionMenu>: ranked AtMentionSuggestion[] built from `contextIndex`
 *   (travel/resource/bundle) PLUS occurrences/activities derived from the held `result`. Title
 *   disambiguation (019): an ambiguous title offers BOTH the activity (series) ref and the
 *   selected-day occurrence ref as distinct suggestions. Selecting one inserts a short token AND
 *   adds a typed ContextBlock (provenance 'atMention').
 * - Degraded mode (019): tray + @-resolution run purely off contextIndex + result on the client,
 *   so they keep working when /api/chat returns 503.
 */

/**
 * BEHAVIOR SKETCH
 * 1. Render header "Allocator Assistant".
 * 2. Render the message list (role-styled bubbles). When empty, render the 5 starter chips above the composer.
 * 3. Render the ContextTray (019) + a bottom-pinned form with a textarea + Send button.
 *    - Send disabled while status === 'streaming' or input is empty.
 *    - On submit: POST to /api/chat with { messages, selection, result, traces, activities, contexts },
 *      stream tokens into a new assistant message bubble.
 * 4. Inline notice above the composer for status ∈ { 'unconfigured', 'rate-limited', 'error' }.
 * 5. Render the non-interactive gradient fade above the composer for visual softness.
 */

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { Activity, ScheduleResult, ScheduleDiagnostics } from '@/lib/types';
import type { ChatMessage } from '@/lib/llm/prompt';
import type {
  AtMentionSuggestion,
  ChatContextItem,
  ContextBlock,
  ContextIndex,
  ContextRef,
} from '@/lib/chat-context';
import type { WorkspaceSelection } from './AllocatorWorkspace';
import ContextTray from './ContextTray';
import AtMentionMenu from './AtMentionMenu';

export interface ChatSurfaceProps {
  selection: WorkspaceSelection;
  result: ScheduleResult;
  diagnostics?: ScheduleDiagnostics;
  activities: Activity[];
  onSelect: (partial: Partial<WorkspaceSelection>) => void;
  contextIndex: ContextIndex;
  contextBlocks: ContextBlock[];
  onAddContext: (block: ContextBlock) => void;
  onRemoveContext: (key: string) => void;
  onTogglePin: (key: string) => void;
}

const MENTION_LISTBOX_ID = 'at-mention-listbox';
const MAX_SUGGESTIONS = 8;

/** 019: derive the @-mention suggestion catalog from the held result + the client context index. */
function buildSuggestionCatalog(
  result: ScheduleResult,
  contextIndex: ContextIndex,
  selectedDate: string | null
): AtMentionSuggestion[] {
  const out: AtMentionSuggestion[] = [];
  const tokenize = (s: string) => s.replace(/[^A-Za-z0-9]/g, '');

  // Occurrences/activities from `result` (title disambiguation per 019): for each distinct source
  // activity, offer the whole-series `activity` ref AND one `occurrence` ref (prefer the selected
  // day's occurrence, else the first scheduled one).
  const byActivity = new Map<string, { title: string; occ: ScheduleResult['occurrences'][number] }>();
  for (const occ of result.occurrences) {
    const prev = byActivity.get(occ.sourceActivityId);
    const isSelectedDay = selectedDate !== null && occ.date === selectedDate;
    const prevIsSelectedDay = prev ? selectedDate !== null && prev.occ.date === selectedDate : false;
    if (!prev || (isSelectedDay && !prevIsSelectedDay)) {
      byActivity.set(occ.sourceActivityId, { title: occ.sourceTitle ?? occ.title, occ });
    }
  }
  for (const [activityId, { title, occ }] of byActivity) {
    const tok = tokenize(title);
    out.push({
      token: `@${tok}`,
      label: `${title} · whole series`,
      ref: { type: 'activity', activityId },
      kind: 'activity',
    });
    out.push({
      token: `@${tok}-${occ.date}`,
      label: `${title} · ${occ.date}${occ.startTime ? ` ${occ.startTime}` : ''}`,
      ref: { type: 'occurrence', occurrenceId: occ.id },
      kind: 'occurrence',
    });
  }

  // Travel windows (from the context index).
  for (const t of contextIndex.travel) {
    out.push({
      token: `@${tokenize(t.destination)}Trip`,
      label: `${t.destination} trip · ${t.startDate}–${t.endDate}`,
      ref: { type: 'travelWindow', travelId: t.travelId },
      kind: 'travelWindow',
    });
  }

  // Resources (from the context index).
  for (const r of contextIndex.resources) {
    out.push({
      token: `@${tokenize(r.role)}`,
      label: `${r.label} · ${r.kind}`,
      ref: { type: 'resource', kind: r.kind, role: r.role },
      kind: 'resource',
    });
  }

  // Bundles (from the context index) — bundle refs are day-scoped, so only offer when a day is
  // selected to supply the required `date`.
  if (selectedDate) {
    for (const label of contextIndex.bundleLabels) {
      out.push({
        token: `@${tokenize(label)}`,
        label: `${label} · ${selectedDate}`,
        ref: { type: 'bundle', date: selectedDate, label },
        kind: 'bundle',
      });
    }
  }

  return out;
}

/** 019: stable dedupe/remove key for a ContextRef, mirroring the tray's expectations. */
function refKey(ref: ContextRef): string {
  switch (ref.type) {
    case 'day':
      return `day:${ref.date}`;
    case 'occurrence':
      return `occurrence:${ref.occurrenceId}`;
    case 'activity':
      return `activity:${ref.activityId}`;
    case 'bundle':
      return `bundle:${ref.date}:${ref.label}`;
    case 'travelWindow':
      return `travelWindow:${ref.travelId}`;
    case 'resource':
      return `resource:${ref.kind}:${ref.role}`;
    case 'trace':
      return `trace:${ref.occurrenceId}`;
    case 'timeBlock':
      return `timeBlock:${ref.date}:${ref.startTime}:${ref.endTime}`;
    case 'busyBlock':
      return `busyBlock:${ref.busyBlockId}:${ref.date}`;
    case 'scheduleRange':
      return `scheduleRange:${ref.startDate}:${ref.endDate}`;
  }
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

export default function ChatSurface({
  selection,
  result,
  diagnostics,
  activities,
  onSelect,
  contextIndex,
  contextBlocks,
  onAddContext,
  onRemoveContext,
  onTogglePin,
}: ChatSurfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // 019: @-mention menu state. `mentionStart` is the index of the active `@` in `input`, or null
  // when the menu is closed.
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionActive, setMentionActive] = useState(0);

  const hasSelection = selection.selectedOccurrenceId !== null;
  const isStreaming = status === 'streaming';
  const canSend = !isStreaming && input.trim().length > 0;

  // 019: the full suggestion catalog (built from result + index); filtered by the live @-query.
  const suggestionCatalog = useMemo(
    () => buildSuggestionCatalog(result, contextIndex, selection.selectedDate),
    [result, contextIndex, selection.selectedDate]
  );

  const mentionQuery = mentionStart !== null ? input.slice(mentionStart + 1) : null;
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    const matches =
      q.length === 0
        ? suggestionCatalog
        : suggestionCatalog.filter(
            (s) =>
              s.token.toLowerCase().includes(q) || s.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q)
          );
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [mentionQuery, suggestionCatalog]);

  const mentionOpen = mentionStart !== null && suggestions.length > 0;

  /** 019: detect the @-token the caret currently sits in (a leading `@` followed by word chars). */
  function syncMention(value: string, caret: number) {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf('@');
    if (at === -1) {
      setMentionStart(null);
      return;
    }
    // The `@` must start a token (line start or whitespace before it) and contain no whitespace after.
    const before = at === 0 ? ' ' : value[at - 1];
    const fragment = value.slice(at + 1, caret);
    if (/\s/.test(before) === false || /\s/.test(fragment)) {
      setMentionStart(null);
      return;
    }
    setMentionStart(at);
    setMentionActive(0);
  }

  /** 019: replace the active @-token with the suggestion's token and attach a typed ContextBlock. */
  function applyMention(s: AtMentionSuggestion) {
    if (mentionStart === null) return;
    const caret = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const next = input.slice(0, mentionStart) + s.token + ' ' + input.slice(caret);
    setInput(next);
    setMentionStart(null);
    onAddContext({
      key: refKey(s.ref),
      ref: s.ref,
      provenance: 'atMention',
      pinned: false,
      label: s.label,
    });
  }

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
          // 019: the attached, visible context blocks (selected + pinned + @-mention). Removing a
          // chip drops it from contextBlocks, so it is guaranteed not sent here.
          contexts: contextBlocks.map<ChatContextItem>((b) => ({ ref: b.ref, provenance: b.provenance })),
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
      {/* 019: context tray — stays above the composer on every viewport (incl. mobile). */}
      <ContextTray blocks={contextBlocks} onRemove={onRemoveContext} onTogglePin={onTogglePin} />
      <form
        className="border-t p-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          void handleSend();
        }}
      >
        <div className="relative flex-1">
          {mentionOpen && (
            <AtMentionMenu
              suggestions={suggestions}
              activeIndex={mentionActive}
              listboxId={MENTION_LISTBOX_ID}
              onSelect={applyMention}
              onActiveIndexChange={setMentionActive}
            />
          )}
          <textarea
            className="w-full resize-none border rounded p-2 text-sm"
            rows={1}
            placeholder="Ask the allocator... (type @ to attach context)"
            value={input}
            role="combobox"
            aria-expanded={mentionOpen}
            aria-controls={mentionOpen ? MENTION_LISTBOX_ID : undefined}
            aria-activedescendant={mentionOpen ? `${MENTION_LISTBOX_ID}-opt-${mentionActive}` : undefined}
            onChange={(e) => {
              setInput(e.target.value);
              syncMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onClick={(e) => syncMention(input, e.currentTarget.selectionStart ?? input.length)}
            onKeyDown={(e) => {
              if (mentionOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionActive((i) => (i + 1) % suggestions.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionActive((i) => (i - 1 + suggestions.length) % suggestions.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  applyMention(suggestions[mentionActive]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionStart(null);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) void handleSend();
              }
            }}
          />
        </div>
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
