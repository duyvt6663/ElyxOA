'use client';

/**
 * DECISION RECAP — 019 Phase 2 Tool-call transport + navigation actions
 * - Chat now uses the AI SDK UI-message stream (decision 6): the client runs `useChat` over a
 *   `DefaultChatTransport` to /api/chat, which returns `toUIMessageStreamResponse()`. Messages are
 *   PARTS-based — text parts render as prose (with the markdown-link fallback), tool-call parts
 *   render as <ChatActionCard> the user clicks to navigate (navActionToSelection → onSelect).
 * - A custom `fetch` maps 503 (no key) / 429 (rate-limited) responses to recognizable errors so the
 *   existing inline notices are preserved.
 * - The dynamic grounding inputs (selection, result, traces, activities, contexts) are sent per-send
 *   via sendMessage(_, { body }); the Phase 1 context tray + @-menu are unchanged.
 *
 * DECISION RECAP — 019 Phase 1 Visible Context + @-insertion (unchanged)
 * - <ContextTray> above the textarea shows the attached ContextBlock[] as removable chips; the
 *   current blocks map → ChatContextItem[] and ride in the request body. Typing `@` opens
 *   <AtMentionMenu> with ranked suggestions from contextIndex + the held result; selecting one
 *   inserts a short token AND attaches a typed ContextBlock. Tray/@-resolution are client-side, so
 *   they keep working when /api/chat returns 503.
 *
 * BEHAVIOR SKETCH
 * 1. Header; empty state renders the 5 starter chips (chips populate the composer, never auto-send).
 * 2. Render each UIMessage's parts: text (markdown-link fallback) + tool-call action cards.
 * 3. ContextTray + composer (textarea with @-menu). Enter sends via useChat.sendMessage(_, {body}).
 * 4. Inline notice above the composer for unconfigured/rate-limited/error.
 */

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, getToolName, isToolUIPart } from 'ai';
import type { Activity, ScheduleResult, ScheduleDiagnostics } from '@/lib/types';
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
import ChatActionCard from './ChatActionCard';
import DraftPatchPreview from './DraftPatchPreview';
import { navActionToSelection, parseSchedulePatch } from './chatActions';
import type { SchedulePatch } from '@/lib/schedule-patch';
import type { PatchPreview } from './AllocatorWorkspace';

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
  // 019 Phase 3 — draft schedule edits.
  onPreviewPatch: (patch: SchedulePatch) => PatchPreview;
  onApplyPatch: (patch: SchedulePatch) => { error: string } | null;
  canUndo: boolean;
  onUndo: () => void;
}

const MENTION_LISTBOX_ID = 'at-mention-listbox';
const MAX_SUGGESTIONS = 8;

/**
 * Custom fetch so 503 (no key) and 429 (rate-limited) surface as recognizable errors the UI maps to
 * specific notices — the AI SDK transport otherwise throws a generic error on a non-ok response.
 */
const chatFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.ok) {
    if (res.status === 503) throw new Error('CHAT_UNCONFIGURED');
    if (res.status === 429) throw new Error('CHAT_RATE_LIMITED');
    let msg = `request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) msg = j.error;
    } catch {
      // body wasn't JSON; keep the generic message.
    }
    throw new Error(msg);
  }
  return res;
};

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
 * Parse assistant text for the 3 markdown link patterns and return a mixed array of strings and
 * <button> elements (the fallback navigation path; tool-call cards are the primary path now).
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
  onPreviewPatch,
  onApplyPatch,
  canUndo,
  onUndo,
}: ChatSurfaceProps) {
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', fetch: chatFetch }), []);
  const { messages, sendMessage, status, error } = useChat({ transport });

  const [input, setInput] = useState('');
  // 019: @-mention menu state. `mentionStart` is the index of the active `@` in `input`, or null.
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionActive, setMentionActive] = useState(0);

  const hasSelection = selection.selectedOccurrenceId !== null;
  const isStreaming = status === 'submitted' || status === 'streaming';
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

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setMentionStart(null);
    void sendMessage(
      { text },
      {
        body: {
          selection,
          result,
          traces: diagnostics?.traces ?? [],
          activities,
          // 019: the attached, visible context blocks. Removing a chip drops it from contextBlocks,
          // so it is guaranteed not sent here.
          contexts: contextBlocks.map<ChatContextItem>((b) => ({ ref: b.ref, provenance: b.provenance })),
        },
      }
    );
  }

  function onChipClick(label: string) {
    setInput(label);
  }

  function statusNotice(): string | null {
    if (!error) return null;
    if (error.message === 'CHAT_UNCONFIGURED') return 'Chat not configured — OPENAI_API_KEY missing on server.';
    if (error.message === 'CHAT_RATE_LIMITED') return 'Rate limit reached. Please wait a few minutes and try again.';
    return error.message || 'Something went wrong.';
  }

  const notice = statusNotice();
  const lastId = messages[messages.length - 1]?.id;

  return (
    <section className="relative flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b text-sm font-medium">
        <span>Allocator Assistant</span>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="rounded border border-gray-300 px-2 py-0.5 text-xs font-normal text-gray-600 hover:bg-gray-100"
          >
            ↶ Undo last edit
          </button>
        )}
      </header>
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
            {messages.map((m) => (
              <li key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[80%] rounded-lg bg-blue-600 text-white px-3 py-2'
                      : 'max-w-[80%] rounded-lg bg-gray-100 text-gray-900 px-3 py-2'
                  }
                >
                  {m.parts.map((part, idx) => {
                    if (part.type === 'text') {
                      return (
                        <span key={idx} className="whitespace-pre-wrap">
                          {m.role === 'assistant'
                            ? renderMessageContent(part.text, onSelect).map((node, j) => (
                                <Fragment key={j}>{node}</Fragment>
                              ))
                            : part.text}
                        </span>
                      );
                    }
                    if (isToolUIPart(part)) {
                      const name = getToolName(part);
                      const patch = parseSchedulePatch(name, part.input);
                      if (patch) {
                        return (
                          <DraftPatchPreview
                            key={idx}
                            patch={patch}
                            onPreview={onPreviewPatch}
                            onApply={onApplyPatch}
                          />
                        );
                      }
                      return (
                        <ChatActionCard
                          key={idx}
                          name={name}
                          input={part.input}
                          onExecute={() => {
                            const sel = navActionToSelection(name, part.input);
                            if (sel) onSelect(sel);
                          }}
                        />
                      );
                    }
                    return null;
                  })}
                  {isStreaming && m.id === lastId && m.role === 'assistant' && (
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
          handleSend();
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
                if (canSend) handleSend();
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
