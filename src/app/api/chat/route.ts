/**
 * DECISION RECAP — 013 /api/chat Route Handler
 * - Next.js App Router POST handler. Streaming via Vercel AI SDK's `streamText`.
 * - Provider LOCKED to OpenAI default `gpt-5.3-chat-latest` (see lib/llm/config.ts).
 * - Runtime: `nodejs` (NOT `edge`) for AI SDK compatibility unless the impl pass
 *   explicitly migrates after verifying `@ai-sdk/openai` is edge-safe. Cold start is
 *   ~200-500ms on Vercel Node functions, which is acceptable for a take-home demo.
 * - Stateless: no DB, no per-user history. Client carries `messages` in the body.
 * - Graceful degradation: missing OPENAI_API_KEY → 503 with a JSON error the UI
 *   renders as a small "chat not configured" notice next to the composer. The rest
 *   of the app (calendar, tabs) keeps working.
 * - Rate-limit: in-memory per-IP via lib/llm/rate-limit.ts. 429 with `retry-after`
 *   header. Out-of-scope: durable rate-limiting, captcha.
 *
 * PSEUDO-ALGORITHM:
 *   1. Parse JSON body { messages, selection, result, traces, activities }.
 *   2. If !hasApiKey() → 503 'chat not configured'.
 *   3. Resolve IP from x-forwarded-for (first hop) or fall back to 'unknown'.
 *      checkRateLimit(ip) → if blocked, 429 with retry-after.
 *   4. buildGrounding({ selection, result, traces, activities }) — compact payload.
 *   5. streamText({ model: openai(getModelId()), system: SYSTEM_PROMPT + grounding,
 *      messages: body.messages }).
 *   6. Return stream.toTextStreamResponse().
 * - On provider error inside streamText: 502 with a short error message.
 */

import { NextRequest } from 'next/server';
import { streamText, tool, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import availabilityData from '@/data/availability.json';
import activityEducationData from '@/data/activity-education.json';
import { hasApiKey, getModelId } from '@/lib/llm/config';
import { SYSTEM_PROMPT, buildGrounding } from '@/lib/llm/prompt';
import { checkRateLimit } from '@/lib/llm/rate-limit';
import { resolveContextRefs, type ChatContextItem } from '@/lib/chat-context';
import { buildEducationMap } from '@/lib/activity-education';
import type { AvailabilityBundle, ActivityEducationProfile } from '@/lib/types';

// 015: the server holds the canonical availability fixture so it can slice the member's
// occupied blocks for the selected date into the grounding (the client never ships 1000+ blocks).
const availability = availabilityData as unknown as AvailabilityBundle;

// 023 Phase 4: committed activity education, keyed by activityId, for chat grounding.
const education = buildEducationMap(activityEducationData as unknown as ActivityEducationProfile[]);

export const runtime = 'nodejs'; // edge optional; keep nodejs for AI SDK compatibility unless impl chooses otherwise

// 019 Phase 2 — navigation tools. The model CALLS these to direct the user to the right view; the
// client renders each call as a click-to-execute action card and performs the real navigation on
// click. execute() is a no-op ack so the tool call carries a result (keeps the conversation valid
// for multi-turn); stopWhen: stepCountIs(1) prevents a follow-up generation off that no-op result.
const navTools = {
  openTab: tool({
    description: 'Open a workspace tab to direct the user to the right view.',
    inputSchema: z.object({ tab: z.enum(['calendar', 'activities', 'resources', 'trace', 'data']) }),
    execute: async () => ({ acknowledged: true as const }),
  }),
  selectDate: tool({
    description: 'Open the calendar focused on a specific date (YYYY-MM-DD).',
    inputSchema: z.object({ date: z.string() }),
    execute: async () => ({ acknowledged: true as const }),
  }),
  selectOccurrence: tool({
    description: 'Select a scheduled occurrence by id (occ-<activityId>-<YYYY-MM-DD>) and open its Trace.',
    inputSchema: z.object({ occurrenceId: z.string() }),
    execute: async () => ({ acknowledged: true as const }),
  }),
  focusResource: tool({
    description: 'Open the Resources tab to point the user at a resource (kind:role, e.g. equipment:treadmill).',
    inputSchema: z.object({ resourceKey: z.string() }),
    execute: async () => ({ acknowledged: true as const }),
  }),
};

// 019 Phase 3 — draft EDIT tools. The model proposes an input edit; the client renders it as a draft
// the user must Apply (it reruns the scheduler in a preview, NOT here). execute() is a no-op ack.
const editTools = {
  setTemporalPolicy: tool({
    description:
      "Propose retiming an activity's whole series to a preferred time of day. This is a DRAFT the " +
      'user must Apply — never claim it is applied. Resolve activityId from the grounding ' +
      'activityCatalog (id+title of every activity) or an attached context, and give a window ' +
      '(morning/midday/afternoon/evening) and/or an anchor.',
    inputSchema: z.object({
      activityId: z.string(),
      window: z.enum(['morning', 'midday', 'afternoon', 'evening']).optional(),
      anchor: z.enum(['wake', 'breakfast', 'lunch', 'dinner', 'bedtime', 'any']).optional(),
    }),
    execute: async () => ({ acknowledged: true as const }),
  }),
  addBusyBlock: tool({
    description:
      'Propose blocking a time range on a date (e.g. "block Jun 24 18:00-20:00 for dinner"). DRAFT ' +
      'the user must Apply. category is one of sleep/work/commute/meal/family/travel/personal/clinical/buffer.',
    inputSchema: z.object({
      date: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      title: z.string(),
      category: z.enum(['sleep', 'work', 'commute', 'meal', 'family', 'travel', 'personal', 'clinical', 'buffer']),
    }),
    execute: async () => ({ acknowledged: true as const }),
  }),
  removeBusyBlock: tool({
    description:
      'Propose freeing a member busy block (e.g. "make Wednesday lunch available"). Resolve busyBlockId ' +
      'from the grounding busyBlockCatalog. Pass a date to free one instance, or omit it to remove the ' +
      'whole recurring block. DRAFT the user must Apply.',
    inputSchema: z.object({ busyBlockId: z.string(), date: z.string().optional() }),
    execute: async () => ({ acknowledged: true as const }),
  }),
  editTravelWindow: tool({
    description:
      'Propose changing a travel window\'s dates (e.g. "extend the Singapore trip by a day"). Resolve ' +
      'travelId from the grounding travelCatalog. DRAFT the user must Apply.',
    inputSchema: z.object({ travelId: z.string(), startDate: z.string(), endDate: z.string() }),
    execute: async () => ({ acknowledged: true as const }),
  }),
};

interface ChatRequestBody {
  // 019 Phase 2 — UI messages from the AI SDK useChat client (parts-based).
  messages: UIMessage[];
  selection: { selectedOccurrenceId: string | null; selectedDate: string | null };
  // 019 Phase 1 — typed contexts attached to this turn (visible context blocks).
  contexts: ChatContextItem[];
  // Slim payload: client sends only what the server needs to build grounding.
  result: import('@/lib/types').ScheduleResult;
  traces: import('@/lib/types').AllocationTrace[];
  activities: import('@/lib/types').Activity[];
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!hasApiKey()) {
    return new Response(
      JSON.stringify({ error: 'chat not configured — OPENAI_API_KEY missing on server' }),
      { status: 503, headers: { 'content-type': 'application/json' } }
    );
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'rate limit exceeded', retryAfterSeconds: rl.retryAfterSeconds }),
      { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(rl.retryAfterSeconds) } }
    );
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const contexts = resolveContextRefs({
    refs: body.contexts ?? [],
    result: body.result,
    traces: body.traces,
    activities: body.activities,
    availability,
  });

  const grounding = buildGrounding({
    selection: body.selection,
    result: body.result,
    traces: body.traces,
    activities: body.activities,
    availability,
    contexts,
    education,
  });

  try {
    const result = streamText({
      // Chat Completions (stateless), NOT the Responses API: a Zero-Data-Retention org does not
      // persist Responses items, so multi-turn tool calls that reference prior `fc_...` item ids fail
      // ("Item ... not found"). Chat Completions encodes tool calls inline, so multi-turn works.
      model: openai.chat(getModelId()),
      system: SYSTEM_PROMPT + '\n\nGROUNDING:\n' + JSON.stringify(grounding, null, 2),
      messages: await convertToModelMessages(body.messages ?? [], {
        tools: { ...navTools, ...editTools },
        ignoreIncompleteToolCalls: true,
      }),
      tools: { ...navTools, ...editTools },
      stopWhen: stepCountIs(1),
    });
    return result.toUIMessageStreamResponse({
      onError: (err) => (err instanceof Error ? err.message : 'provider error'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'provider error: ' + message }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
}
